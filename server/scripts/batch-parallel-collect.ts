import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { classifyPlace } from '../lib/categoryMapping';
import { parseAddress, isAddressInCity } from '../lib/addressParser';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

const db = drizzle(pool, { schema });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

const CATEGORIES = [
  { id: 1, code: 'food', nameZh: '美食', baseKeyword: '美食餐廳' },
  { id: 2, code: 'stay', nameZh: '住宿', baseKeyword: '住宿旅館' },
  { id: 3, code: 'education', nameZh: '生態文化教育', baseKeyword: '博物館文化' },
  { id: 4, code: 'experience', nameZh: '遊程體驗', baseKeyword: '體驗活動' },
  { id: 5, code: 'entertainment', nameZh: '娛樂設施', baseKeyword: '娛樂休閒' },
  { id: 6, code: 'activity', nameZh: '活動', baseKeyword: '活動展覽' },
  { id: 7, code: 'scenery', nameZh: '景點', baseKeyword: '景點觀光' },
  { id: 8, code: 'shopping', nameZh: '購物', baseKeyword: '購物商店' },
];

const usedKeywordsCache: Map<string, Set<string>> = new Map();

async function expandKeywordsWithAI(baseKeyword: string, categoryName: string, cityName: string, count: number = 10): Promise<string[]> {
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY) {
    console.log(`   ⚠️ 無 Gemini API，使用預設關鍵字`);
    return [baseKeyword];
  }

  const cacheKey = `${cityName}:${categoryName}`;
  if (!usedKeywordsCache.has(cacheKey)) {
    usedKeywordsCache.set(cacheKey, new Set());
  }
  const usedKeywords = usedKeywordsCache.get(cacheKey)!;
  const usedList = Array.from(usedKeywords).slice(-30);

  const avoidSection = usedList.length > 0 
    ? `\n⚠️ 以下關鍵字已經用過，請勿重複：\n${usedList.join('、')}\n`
    : '';

  const prompt = `為「${cityName}」的「${categoryName}」生成 ${count} 個 Google Maps 搜尋關鍵字。
${avoidSection}
規則：每個 3-8 字，挖掘冷門角度

直接輸出關鍵字，不要編號、不要說明：
泰式料理
深夜食堂
老屋咖啡
溪邊露營
手作體驗
古道健行
漁港海鮮
農場民宿
文創市集
秘境瀑布`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
      }),
    });

    if (!response.ok) return [baseKeyword];

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const keywords = text
      .split('\n')
      .map((k: string) => k.trim())
      .map((k: string) => k.replace(/^\d+[\.\)、]\s*/, '').replace(/^\*+\s*/, '').trim()) // 清除編號
      .filter((k: string) => k.length >= 3 && k.length <= 15) // 3-15 字
      .filter((k: string) => !k.includes('以下') && !k.includes('關鍵字') && !k.includes('：')) // 過濾說明文字
      .slice(0, count);

    // 記錄已使用的關鍵字
    keywords.forEach(kw => usedKeywords.add(kw));
    
    return keywords.length > 0 ? keywords : [baseKeyword];
  } catch (e) {
    return [baseKeyword];
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function searchGooglePlaces(query: string, location: string): Promise<any[]> {
  if (!GOOGLE_MAPS_API_KEY) return [];

  const searchQuery = `${query} ${location}`;
  const url = `https://places.googleapis.com/v1/places:searchText`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.types,places.primaryType,places.businessStatus'
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        languageCode: 'zh-TW',
        maxResultCount: 20
      })
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data.places || []).map((p: any) => ({
      placeId: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      location: p.location,
      rating: p.rating,
      types: p.types || [],
      primaryType: p.primaryType,
      businessStatus: p.businessStatus
    }));
  } catch (e) {
    return [];
  }
}

async function generateDescriptionsBatch(places: any[], cityName: string): Promise<Map<string, { description: string; subcategory: string }>> {
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY || places.length === 0) return new Map();

  const placesInfo = places.slice(0, 30).map(p => ({
    name: p.name,
    address: p.address,
    types: p.types?.slice(0, 3) || []
  }));

  const prompt = `為以下 ${cityName} 的地點生成簡短描述和子分類。
地點列表：${JSON.stringify(placesInfo)}
請回傳 JSON Array：[{ "name": "地點名稱", "description": "30-50字描述", "subcategory": "子分類" }]
只回傳 JSON。`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096 }
      }),
    });

    if (!response.ok) return new Map();

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return new Map();

    const results = JSON.parse(jsonMatch[0]);
    const map = new Map<string, { description: string; subcategory: string }>();
    for (const r of results) {
      if (r.name) map.set(r.name, { description: r.description || '', subcategory: r.subcategory || '' });
    }
    return map;
  } catch (e) {
    return new Map();
  }
}

async function collectKeywordsParallel(
  keywords: string[], 
  cityName: string, 
  categoryName: string,
  existingPlaceIds: Set<string>
): Promise<{ places: any[]; saved: number; skipped: number }> {
  const CONCURRENCY = 10;
  const allPlaces: any[] = [];
  let totalSaved = 0;
  let totalSkipped = 0;

  for (let i = 0; i < keywords.length; i += CONCURRENCY) {
    const batch = keywords.slice(i, i + CONCURRENCY);
    
    const searchPromises = batch.map(async (keyword) => {
      const places = await searchGooglePlaces(keyword, cityName);
      return { keyword, places };
    });

    const results = await Promise.all(searchPromises);
    
    for (const { keyword, places } of results) {
      const newPlaces = places.filter(p => !existingPlaceIds.has(p.placeId));
      const skipped = places.length - newPlaces.length;
      totalSkipped += skipped;
      
      if (newPlaces.length > 0) {
        allPlaces.push(...newPlaces.map(p => ({ ...p, keyword, category: categoryName })));
        newPlaces.forEach(p => existingPlaceIds.add(p.placeId));
      }
      
      console.log(`   [${categoryName}] ${keyword}: ${newPlaces.length} 新 / ${skipped} 重複`);
    }
    
    if (i + CONCURRENCY < keywords.length) {
      await sleep(500);
    }
  }

  if (allPlaces.length > 0) {
    for (const place of allPlaces) {
      try {
        // 驗證地址是否屬於目標城市
        if (!isAddressInCity(place.address, cityName)) {
          console.log(`   ⚠️ 城市不符跳過: ${place.name} (${place.address})`);
          totalSkipped++;
          continue;
        }
        
        // 從地址解析實際的鄉鎮區
        const parsed = parseAddress(place.address);
        const district = parsed.district || cityName;
        
        const classified = classifyPlace(
          place.name,
          cityName,
          place.primaryType || null,
          place.types || []
        );
        
        await db.insert(schema.placeCache).values({
          placeName: place.name,
          description: '',
          category: classified.category,
          subCategory: classified.subcategory,
          district: district,
          city: cityName,
          country: '台灣',
          placeId: place.placeId,
          verifiedName: place.name,
          verifiedAddress: place.address,
          googleRating: place.rating?.toString() || null,
          googleTypes: place.types?.join(',') || null,
          primaryType: place.primaryType || null,
          locationLat: place.location?.latitude?.toString() || null,
          locationLng: place.location?.longitude?.toString() || null,
          isLocationVerified: true,
          businessStatus: place.businessStatus || null,
          aiReviewed: false,
          lastVerifiedAt: new Date()
        });
        totalSaved++;
      } catch (e: any) {
        if (!e.message.includes('duplicate')) {
          console.error(`   ❌ ${place.name}: ${e.message}`);
        }
      }
    }
  }

  return { places: allPlaces, saved: totalSaved, skipped: totalSkipped };
}

async function collectCategoryParallel(
  category: typeof CATEGORIES[0],
  cityName: string,
  existingPlaceIds: Set<string>
): Promise<{ category: string; saved: number; skipped: number }> {
  console.log(`\n📦 [${category.nameZh}] AI 關鍵字擴散中...`);
  
  // 使用 AI 動態生成關鍵字
  const keywords = await expandKeywordsWithAI(category.baseKeyword, category.nameZh, cityName, 10);
  console.log(`   🎯 生成 ${keywords.length} 個關鍵字: ${keywords.slice(0, 5).join(', ')}...`);
  
  const result = await collectKeywordsParallel(
    keywords,
    cityName,
    category.nameZh,
    existingPlaceIds
  );
  
  console.log(`✅ [${category.nameZh}] 完成: ${result.saved} 新增`);
  return { category: category.nameZh, saved: result.saved, skipped: result.skipped };
}

async function main() {
  const cityName = process.argv[2] || '嘉義市';
  const categoryFilter = process.argv[3]; // 可選：指定類別（中文或英文代碼）
  const startTime = Date.now();
  
  console.log('🚀 並行批次採集模式');
  console.log(`📍 目標城市: ${cityName}`);
  if (categoryFilter) {
    console.log(`🏷️ 指定類別: ${categoryFilter}`);
  } else {
    console.log('🏷️ 類別: 全部（8類別）');
  }
  console.log('='.repeat(50));
  
  const existingPlaces = await db.select({ googlePlaceId: schema.places.googlePlaceId })
    .from(schema.places)
    .where(eq(schema.places.city, cityName));
  const existingCache = await db.select({ placeId: schema.placeCache.placeId })
    .from(schema.placeCache)
    .where(eq(schema.placeCache.city, cityName));
  
  const existingPlaceIds = new Set<string>();
  existingPlaces.forEach(p => { if (p.googlePlaceId) existingPlaceIds.add(p.googlePlaceId); });
  existingCache.forEach(p => { if (p.placeId) existingPlaceIds.add(p.placeId); });
  
  console.log(`📊 已有 ${existingPlaceIds.size} 個重複地點將被跳過`);

  // 過濾類別（支援中文名稱或英文代碼）
  const categoriesToCollect = categoryFilter
    ? CATEGORIES.filter(c => c.nameZh === categoryFilter || c.code === categoryFilter)
    : CATEGORIES;

  if (categoriesToCollect.length === 0) {
    console.error(`❌ 找不到類別: ${categoryFilter}`);
    console.log('可用類別: ' + CATEGORIES.map(c => `${c.nameZh}(${c.code})`).join(', '));
    await pool.end();
    process.exit(1);
  }

  const categoryPromises = categoriesToCollect.map(category => 
    collectCategoryParallel(category, cityName, existingPlaceIds)
  );

  const results = await Promise.all(categoryPromises);

  const totalSaved = results.reduce((sum, r) => sum + r.saved, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(50));
  console.log('📊 並行採集完成統計');
  console.log(`   城市: ${cityName}`);
  console.log(`   總新增: ${totalSaved} 筆`);
  console.log(`   總跳過: ${totalSkipped} 筆`);
  console.log(`   耗時: ${elapsed} 秒`);
  console.log('='.repeat(50));

  for (const r of results) {
    console.log(`   ${r.category}: ${r.saved} 筆`);
  }

  await pool.end();
}

main().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});

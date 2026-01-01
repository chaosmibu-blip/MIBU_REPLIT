import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { classifyPlace } from '../lib/categoryMapping';
import { parseAddress, isAddressInCity } from '../lib/addressParser';

async function checkExistingPlaceIds(placeIds: string[], db: any): Promise<Set<string>> {
  if (placeIds.length === 0) return new Set();
  
  const existingInPlaces = await db.select({ googlePlaceId: schema.places.googlePlaceId })
    .from(schema.places)
    .where(inArray(schema.places.googlePlaceId, placeIds));
  
  const existingInCache = await db.select({ placeId: schema.placeCache.placeId })
    .from(schema.placeCache)
    .where(inArray(schema.placeCache.placeId, placeIds));
  
  const existingSet = new Set<string>();
  existingInPlaces.forEach((p: any) => { if (p.googlePlaceId) existingSet.add(p.googlePlaceId); });
  existingInCache.forEach((p: any) => { if (p.placeId) existingSet.add(p.placeId); });
  
  return existingSet;
}

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
  { id: 7, code: 'scenery', nameZh: '景點', baseKeyword: '景點觀光' },
  { id: 8, code: 'shopping', nameZh: '購物', baseKeyword: '購物商店' },
];

const USED_KEYWORDS_FILE = 'server/data/used-keywords.json';

type KeywordMode = 'generic' | 'local' | 'mixed';
let globalKeywordMode: KeywordMode = 'mixed';

function loadUsedKeywords(): Map<string, Set<string>> {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.resolve(USED_KEYWORDS_FILE);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const map = new Map<string, Set<string>>();
      for (const [key, arr] of Object.entries(data)) {
        map.set(key, new Set(arr as string[]));
      }
      return map;
    }
  } catch (e) {
    console.log('⚠️ 無法載入已用關鍵字，使用空快取');
  }
  return new Map();
}

function saveUsedKeywords(cache: Map<string, Set<string>>): void {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.dirname(USED_KEYWORDS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const obj: Record<string, string[]> = {};
    cache.forEach((set, key) => {
      obj[key] = Array.from(set);
    });
    fs.writeFileSync(path.resolve(USED_KEYWORDS_FILE), JSON.stringify(obj, null, 2));
  } catch (e) {
    console.log('⚠️ 無法儲存已用關鍵字');
  }
}

const usedKeywordsCache: Map<string, Set<string>> = loadUsedKeywords();

const MAX_KEYWORDS_PER_CATEGORY = 100;

async function expandKeywordsWithAI(baseKeyword: string, categoryName: string, cityName: string, count: number = 10): Promise<string[]> {
  const cacheKey = `${cityName}:${categoryName}`;
  if (!usedKeywordsCache.has(cacheKey)) {
    usedKeywordsCache.set(cacheKey, new Set());
  }
  const usedKeywords = usedKeywordsCache.get(cacheKey)!;
  
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY) {
    console.log(`   ⚠️ 無 Gemini API，使用預設關鍵字`);
    usedKeywords.add(baseKeyword);
    return [baseKeyword];
  }

  const usedList = Array.from(usedKeywords).slice(-50);

  const avoidSection = usedList.length > 0 
    ? `\n⚠️ 以下關鍵字已經用過，請勿重複：\n${usedList.join('、')}\n`
    : '';

  // 各類別的通用子分類關鍵字庫（七大類）
  const subcategoryHints: Record<string, string> = {
    '美食': '熱炒、宵夜、餐酒館、燒烤、火鍋、拉麵、咖哩、披薩、漢堡、素食、早午餐、下午茶、甜點、冰品、飲料店、牛肉麵、小籠包、海鮮、鐵板燒、日式料理、韓式料理、泰式料理、港式飲茶、義式餐廳、美式餐廳、蔬食、滷味、炸物',
    '住宿': '民宿、飯店、旅館、汽車旅館、露營區、Villa、包棟、青旅、溫泉旅館、親子飯店',
    '景點': '公園、步道、瀑布、海灘、漁港、老街、觀景台、夜景、特色建築、地標、秘境、森林、濕地、湖泊、峽谷、古厝、歷史街區、藝術裝置、打卡景點',
    '購物': '市場、夜市、百貨、伴手禮、特產店、文創商店、二手店、在地超市、傳統市場、手工藝品、紀念品店、選物店、古董店、潮流商店',
    '遊程體驗': 'DIY體驗、農場體驗、手作課程、導覽行程、一日遊、半日遊、採果、釣魚',
    '娛樂設施': '遊樂園、桌遊、密室逃脫、室內運動、射箭場、攀岩館、彈跳床、兒童樂園、VR體驗、手作工坊、主題餐廳、寵物咖啡',
    '生態文化教育': '博物館、美術館、紀念館、古蹟、生態園區、農場、特色寺廟、著名教堂、文化村、生態步道、濕地公園、自然保護區、觀光工廠、茶園、咖啡莊園'
  };
  
  const hints = subcategoryHints[categoryName] || '';
  
  const modeInstructions = {
    generic: `規則：
1. 只生成「通用分類」關鍵字，不要加入地名或在地特色
2. 參考：${hints}
3. 每個 2-6 字

直接輸出關鍵字，不要編號：
熱炒店
宵夜攤
咖啡廳
火鍋店
早午餐
民宿推薦
商務飯店
親子餐廳`,
    local: `規則：
1. 只生成「在地特色」關鍵字，必須包含${cityName}地名、當地食材或文化特色
2. 參考當地知名景點、美食、特產
3. 每個 3-10 字

直接輸出關鍵字，不要編號：
${cityName}小吃
${cityName}老街
${cityName}名產
在地推薦
古蹟巡禮`,
    mixed: `規則：
1. 混合「通用分類」和「在地特色」兩種類型
2. 通用分類參考：${hints}
3. 在地特色可加入地名或當地食材/文化
4. 每個 2-8 字

直接輸出關鍵字，不要編號：
熱炒店
宵夜攤
餐酒館
三星蔥料理
溫泉拉麵
漁港海鮮
老街冰品
田園咖啡
手作工坊
秘境步道`
  };
  
  const prompt = `為「${cityName}」的「${categoryName}」生成 ${count} 個 Google Maps 搜尋關鍵字。
${avoidSection}
${modeInstructions[globalKeywordMode]}`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
      }),
    });

    if (!response.ok) {
      usedKeywords.add(baseKeyword);
      return [baseKeyword];
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const keywords = text
      .split('\n')
      .map((k: string) => k.trim())
      .map((k: string) => k.replace(/^\d+[\.\)、]\s*/, '').replace(/^\*+\s*/, '').trim())
      .filter((k: string) => k.length >= 3 && k.length <= 15)
      .filter((k: string) => !k.includes('以下') && !k.includes('關鍵字') && !k.includes('：'))
      .slice(0, count);

    if (keywords.length > 0) {
      keywords.forEach((kw: string) => usedKeywords.add(kw));
      trimUsedKeywords(usedKeywords);
      return keywords;
    } else {
      usedKeywords.add(baseKeyword);
      return [baseKeyword];
    }
  } catch (e) {
    usedKeywords.add(baseKeyword);
    return [baseKeyword];
  }
}

function trimUsedKeywords(set: Set<string>): void {
  if (set.size > MAX_KEYWORDS_PER_CATEGORY) {
    const arr = Array.from(set);
    const toRemove = arr.slice(0, set.size - MAX_KEYWORDS_PER_CATEGORY);
    toRemove.forEach(k => set.delete(k));
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function searchGooglePlaces(query: string, location: string, maxPages: number = 3): Promise<any[]> {
  if (!GOOGLE_MAPS_API_KEY) return [];

  const searchQuery = `${query} ${location}`;
  const url = `https://places.googleapis.com/v1/places:searchText`;
  const allPlaces: any[] = [];
  let pageToken: string | null = null;
  
  try {
    for (let page = 0; page < maxPages; page++) {
      const requestBody: any = {
        textQuery: searchQuery,
        languageCode: 'zh-TW',
        maxResultCount: 20
      };
      
      if (pageToken) {
        requestBody.pageToken = pageToken;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.types,places.primaryType,places.businessStatus,places.currentOpeningHours,places.regularOpeningHours,nextPageToken'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) break;

      const data = await response.json();
      const places = (data.places || []).map((p: any) => ({
        placeId: p.id,
        name: p.displayName?.text || '',
        address: p.formattedAddress || '',
        location: p.location,
        rating: p.rating,
        types: p.types || [],
        primaryType: p.primaryType,
        businessStatus: p.businessStatus,
        openingHours: p.regularOpeningHours || p.currentOpeningHours || null
      }));
      
      allPlaces.push(...places);
      
      pageToken = data.nextPageToken || null;
      if (!pageToken) break;
      
      await sleep(2000);
    }
    
    return allPlaces;
  } catch (e) {
    return allPlaces;
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
  searchLocation: string,
  categoryName: string,
  sessionPlaceIds: Set<string>
): Promise<{ places: any[]; saved: number; skipped: number }> {
  const CONCURRENCY = 10;
  const allPlaces: any[] = [];
  let totalSaved = 0;
  let totalSkipped = 0;

  for (let i = 0; i < keywords.length; i += CONCURRENCY) {
    const batch = keywords.slice(i, i + CONCURRENCY);
    
    const searchPromises = batch.map(async (keyword) => {
      const places = await searchGooglePlaces(keyword, searchLocation);
      return { keyword, places };
    });

    const results = await Promise.all(searchPromises);
    
    for (const { keyword, places } of results) {
      const newPlaces = places.filter(p => !sessionPlaceIds.has(p.placeId));
      const skipped = places.length - newPlaces.length;
      totalSkipped += skipped;
      
      if (newPlaces.length > 0) {
        allPlaces.push(...newPlaces.map(p => ({ ...p, keyword, category: categoryName })));
        newPlaces.forEach(p => sessionPlaceIds.add(p.placeId));
      }
      
      console.log(`   [${categoryName}] ${keyword}: ${newPlaces.length} 新 / ${skipped} 重複`);
    }
    
    if (i + CONCURRENCY < keywords.length) {
      await sleep(500);
    }
  }

  if (allPlaces.length > 0) {
    const validPlaces: any[] = [];
    
    for (const place of allPlaces) {
      if (!isAddressInCity(place.address, cityName)) {
        console.log(`   ⚠️ 城市不符跳過: ${place.name} (${place.address})`);
        totalSkipped++;
        continue;
      }
      validPlaces.push(place);
    }
    
    if (validPlaces.length > 0) {
      const placeIdsToCheck = validPlaces.map(p => p.placeId);
      const existingInDb = await checkExistingPlaceIds(placeIdsToCheck, db);
      
      for (const place of validPlaces) {
        if (existingInDb.has(place.placeId)) {
          totalSkipped++;
          continue;
        }
        
        try {
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
  }

  return { places: allPlaces, saved: totalSaved, skipped: totalSkipped };
}

async function collectCategoryParallel(
  category: typeof CATEGORIES[0],
  cityName: string,
  searchLocation: string,
  existingPlaceIds: Set<string>
): Promise<{ category: string; saved: number; skipped: number }> {
  console.log(`\n📦 [${category.nameZh}] AI 關鍵字擴散中...`);
  
  // 使用 AI 動態生成關鍵字
  const keywords = await expandKeywordsWithAI(category.baseKeyword, category.nameZh, cityName, 10);
  console.log(`   🎯 生成 ${keywords.length} 個關鍵字: ${keywords.slice(0, 5).join(', ')}...`);
  
  const result = await collectKeywordsParallel(
    keywords,
    cityName,
    searchLocation,
    category.nameZh,
    existingPlaceIds
  );
  
  console.log(`✅ [${category.nameZh}] 完成: ${result.saved} 新增`);
  return { category: category.nameZh, saved: result.saved, skipped: result.skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find(a => a.startsWith('--mode='));
  const districtArg = args.find(a => a.startsWith('--district='));
  const cityName = args.find(a => !a.startsWith('--')) || '嘉義市';
  const categoryFilter = args.filter(a => !a.startsWith('--'))[1];
  const targetDistrict = districtArg?.split('=')[1] || null;
  
  if (modeArg) {
    const mode = modeArg.split('=')[1] as KeywordMode;
    if (['generic', 'local', 'mixed'].includes(mode)) {
      globalKeywordMode = mode;
    }
  }
  
  const startTime = Date.now();
  const modeLabel = { generic: '通用關鍵字', local: '在地特色', mixed: '混合模式' }[globalKeywordMode];
  const searchLocation = targetDistrict ? `${cityName}${targetDistrict}` : cityName;
  
  console.log('🚀 並行批次採集模式');
  console.log(`📍 目標城市: ${cityName}`);
  if (targetDistrict) {
    console.log(`📍 指定區域: ${targetDistrict}`);
  }
  console.log(`🎯 關鍵字模式: ${modeLabel}`);
  if (categoryFilter) {
    console.log(`🏷️ 指定類別: ${categoryFilter}`);
  } else {
    console.log('🏷️ 類別: 全部（7類別）');
  }
  console.log('='.repeat(50));
  
  const existingPlaceIds = new Set<string>();
  console.log(`📊 去重模式: 存入時即時查詢（節省啟動時間）`);

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
    collectCategoryParallel(category, cityName, searchLocation, existingPlaceIds)
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

  saveUsedKeywords(usedKeywordsCache);
  console.log(`💾 已儲存 ${usedKeywordsCache.size} 組已用關鍵字`);

  await pool.end();
}

main().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});

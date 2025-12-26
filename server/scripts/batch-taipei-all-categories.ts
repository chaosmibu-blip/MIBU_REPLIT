import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

const CATEGORIES = [
  { id: 1, code: 'food', nameZh: '美食' },
  { id: 2, code: 'stay', nameZh: '住宿' },
  { id: 3, code: 'education', nameZh: '生態文化教育' },
  { id: 4, code: 'experience', nameZh: '遊程體驗' },
  { id: 5, code: 'entertainment', nameZh: '娛樂設施' },
  { id: 6, code: 'activity', nameZh: '活動' },
  { id: 7, code: 'scenery', nameZh: '景點' },
  { id: 8, code: 'shopping', nameZh: '購物' },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '美食': ['餐廳', '小吃', '咖啡廳', '甜點', '夜市美食', '早午餐', '火鍋', '燒烤'],
  '住宿': ['飯店', '民宿', '旅館', '青年旅社', '溫泉旅館'],
  '生態文化教育': ['博物館', '展覽館', '古蹟', '寺廟', '生態園區', '文化中心'],
  '遊程體驗': ['一日遊', 'DIY體驗', '導覽', '課程體驗', '手作工坊'],
  '娛樂設施': ['遊樂園', 'KTV', '電影院', '桌遊', '密室逃脫', '保齡球'],
  '活動': ['演唱會', '展覽', '市集', '節慶活動', '運動賽事'],
  '景點': ['公園', '觀景台', '步道', '地標', '風景區', '老街'],
  '購物': ['百貨公司', '商圈', '特色商店', '伴手禮', '市場'],
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function searchGooglePlaces(query: string, location: string): Promise<any[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('❌ GOOGLE_MAPS_API_KEY 未設定');
    return [];
  }

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

    if (!response.ok) {
      console.error(`Google API 錯誤: ${response.status}`);
      return [];
    }

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
  } catch (e: any) {
    console.error(`搜尋失敗: ${e.message}`);
    return [];
  }
}

async function generateDescriptions(places: any[], cityName: string): Promise<Map<string, { description: string; subcategory: string }>> {
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY) {
    console.error('❌ Gemini API 未設定');
    return new Map();
  }

  const placesInfo = places.map(p => ({
    name: p.name,
    address: p.address,
    types: p.types?.slice(0, 3) || []
  }));

  const prompt = `為以下 ${cityName} 的地點生成簡短描述和子分類。

地點列表：
${JSON.stringify(placesInfo, null, 2)}

請回傳 JSON Array，格式：
[
  { "name": "地點名稱", "description": "30-50字吸引人的描述", "subcategory": "子分類名稱" }
]

只回傳 JSON，不要其他文字。`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096 }
      }),
    });

    if (!response.ok) {
      console.error(`Gemini API 錯誤: ${response.status}`);
      return new Map();
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return new Map();

    const results = JSON.parse(jsonMatch[0]);
    const map = new Map<string, { description: string; subcategory: string }>();
    for (const r of results) {
      if (r.name) {
        map.set(r.name, { description: r.description || '', subcategory: r.subcategory || '' });
      }
    }
    return map;
  } catch (e: any) {
    console.error(`生成描述失敗: ${e.message}`);
    return new Map();
  }
}

async function batchCollectCategory(categoryNameZh: string, cityName: string = '台北市'): Promise<{ saved: number; skipped: number }> {
  const keywords = CATEGORY_KEYWORDS[categoryNameZh] || [categoryNameZh];
  let totalSaved = 0;
  let totalSkipped = 0;

  console.log(`\n📦 開始採集 ${categoryNameZh} (${keywords.length} 個關鍵字)`);

  const existingPlaceIds = new Set<string>();
  const existingPlaces = await db.select({ googlePlaceId: schema.places.googlePlaceId })
    .from(schema.places)
    .where(eq(schema.places.city, cityName));
  existingPlaces.forEach(p => { if (p.googlePlaceId) existingPlaceIds.add(p.googlePlaceId); });

  const existingCache = await db.select({ placeId: schema.placeCache.placeId })
    .from(schema.placeCache)
    .where(eq(schema.placeCache.city, cityName));
  existingCache.forEach(p => { if (p.placeId) existingPlaceIds.add(p.placeId); });

  console.log(`   已有 ${existingPlaceIds.size} 個重複地點將被跳過`);

  for (const keyword of keywords) {
    console.log(`   🔍 搜尋: ${keyword} ${cityName}`);
    
    const places = await searchGooglePlaces(keyword, cityName);
    if (places.length === 0) {
      console.log(`   ⚠️ 無結果`);
      await sleep(1000);
      continue;
    }

    const newPlaces = places.filter(p => !existingPlaceIds.has(p.placeId));
    const skipped = places.length - newPlaces.length;
    totalSkipped += skipped;

    if (newPlaces.length === 0) {
      console.log(`   ⏭️ ${places.length} 筆全部重複，跳過`);
      await sleep(1000);
      continue;
    }

    console.log(`   📝 ${newPlaces.length} 筆新資料，${skipped} 筆重複`);

    const descriptions = await generateDescriptions(newPlaces, cityName);
    await sleep(2000);

    for (const place of newPlaces) {
      try {
        const desc = descriptions.get(place.name);
        
        await db.insert(schema.placeCache).values({
          placeName: place.name,
          description: desc?.description || `${cityName}知名的${categoryNameZh}`,
          category: categoryNameZh,
          subCategory: desc?.subcategory || categoryNameZh,
          district: cityName,
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

        existingPlaceIds.add(place.placeId);
        totalSaved++;
      } catch (e: any) {
        if (!e.message.includes('duplicate')) {
          console.error(`   ❌ 儲存失敗 ${place.name}: ${e.message}`);
        }
      }
    }

    await sleep(1500);
  }

  return { saved: totalSaved, skipped: totalSkipped };
}

async function main() {
  const targetCategory = process.argv[2];
  const cityName = process.argv[3] || '台北市';
  
  console.log('🚀 台北市八大類別批次採集');
  console.log('==========================================');
  
  const categoriesToProcess = targetCategory
    ? CATEGORIES.filter(c => c.nameZh === targetCategory || c.code === targetCategory)
    : CATEGORIES;

  if (categoriesToProcess.length === 0) {
    console.log(`❌ 找不到類別: ${targetCategory}`);
    console.log('可用類別:', CATEGORIES.map(c => c.nameZh).join(', '));
    await pool.end();
    return;
  }

  let grandTotalSaved = 0;
  let grandTotalSkipped = 0;

  for (const category of categoriesToProcess) {
    const result = await batchCollectCategory(category.nameZh, cityName);
    grandTotalSaved += result.saved;
    grandTotalSkipped += result.skipped;
    
    console.log(`   ✅ ${category.nameZh}: 新增 ${result.saved} 筆`);
    
    await sleep(3000);
  }

  console.log('\n==========================================');
  console.log('📊 採集完成統計');
  console.log(`   總新增: ${grandTotalSaved} 筆`);
  console.log(`   總跳過: ${grandTotalSkipped} 筆`);
  console.log('==========================================');

  await pool.end();
}

main().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});

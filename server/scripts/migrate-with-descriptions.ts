import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

const db = drizzle(pool, { schema });

const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

const CATEGORY_PROMPTS: Record<string, string> = {
  '美食': `你是專業美食評論家，請為以下餐廳/小吃店撰寫吸引人的描述。著重：招牌特色、用餐氛圍、適合場合。風格：親切、讓人想去嚐鮮。字數：30-50字。`,
  '住宿': `你是旅宿評論專家，請為以下住宿撰寫吸引人的描述。著重：住宿特色、周邊便利性、適合旅客類型。風格：溫馨、讓人想預訂。字數：30-50字。`,
  '生態文化教育': `你是文化導覽員，請為以下文化/教育場所撰寫描述。著重：歷史背景、特色展覽、適合對象。風格：知性、引發好奇心。字數：30-50字。`,
  '遊程體驗': `你是體驗活動策劃師，請為以下體驗活動撰寫描述。著重：活動特色、適合對象、預期收穫。風格：活潑、讓人躍躍欲試。字數：30-50字。`,
  '娛樂設施': `你是娛樂達人，請為以下娛樂場所撰寫描述。著重：娛樂特色、適合對象、推薦時段。風格：歡樂、讓人想放鬆玩樂。字數：30-50字。`,
  '活動': `你是活動企劃，請為以下活動/展演撰寫描述。著重：活動亮點、氛圍、適合參加者。風格：熱情、讓人想參與。字數：30-50字。`,
  '景點': `你是旅遊作家，請為以下景點撰寫吸引人的描述。著重：最佳觀賞時間、特色亮點、拍照打卡點。風格：詩意、讓人嚮往。字數：30-50字。`,
  '購物': `你是購物達人，請為以下購物地點撰寫描述。著重：商品特色、必買推薦、逛街氛圍。風格：實用、讓人想血拼。字數：30-50字。`,
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface PlaceData {
  id: number;
  placeName: string;
  category: string;
  address: string | null;
  rating: number | null;
  city: string;
}

async function generateDescriptionsForBatch(
  places: PlaceData[],
  categoryPrompt: string
): Promise<Map<number, string>> {
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY || places.length === 0) return new Map();

  const placesInfo = places.map(p => ({
    id: p.id,
    name: p.placeName,
    address: p.address || '',
    rating: p.rating || '',
    city: p.city
  }));

  const prompt = `${categoryPrompt}

地點列表：
${JSON.stringify(placesInfo, null, 2)}

請回傳 JSON Array：[{ "id": 數字, "description": "描述文字" }]
規則：每個描述必須獨特，不可使用「知名的」「必訪」「特色體驗」等通用詞。只回傳 JSON。`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 16384 }
      }),
    });

    if (!response.ok) return new Map();

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    let jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) jsonMatch = [jsonMatch[1]];
    else jsonMatch = text.match(/\[[\s\S]*?\]/);
    
    if (!jsonMatch) return new Map();

    const results = JSON.parse(jsonMatch[0]);
    const map = new Map<number, string>();
    for (const r of results) {
      if (r.id && r.description) map.set(r.id, r.description);
    }
    return map;
  } catch (e) {
    return new Map();
  }
}

async function generateDescriptionsForCategory(
  category: string,
  placeIds: number[],
  city: string
): Promise<number> {
  if (placeIds.length === 0) return 0;

  const places = await db.select({
    id: schema.places.id,
    placeName: schema.places.placeName,
    category: schema.places.category,
    address: schema.places.address,
    rating: schema.places.rating,
    city: schema.places.city
  })
  .from(schema.places)
  .where(inArray(schema.places.id, placeIds));

  const prompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS['景點'];
  let updated = 0;
  const batchSize = 10;

  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const descriptions = await generateDescriptionsForBatch(batch, prompt);

    for (const place of batch) {
      const newDesc = descriptions.get(place.id);
      if (newDesc) {
        await db.update(schema.places)
          .set({ description: newDesc })
          .where(eq(schema.places.id, place.id));
        updated++;
      }
    }

    if (i + batchSize < places.length) await sleep(1000);
  }

  console.log(`   [${category}] ${updated}/${placeIds.length} 描述生成`);
  return updated;
}

async function migrateCacheToPlaces() {
  const cityArg = process.argv[2];
  const startTime = Date.now();
  
  if (cityArg) {
    console.log(`🚀 將 ${cityArg} 的審核通過資料從 place_cache 移到 places（含描述生成）`);
  } else {
    console.log(`🚀 將所有審核通過資料從 place_cache 移到 places（含描述生成）`);
  }
  console.log('='.repeat(60));
  
  const reviewedCache = cityArg
    ? await db.select().from(schema.placeCache)
        .where(and(
          eq(schema.placeCache.city, cityArg),
          eq(schema.placeCache.aiReviewed, true)
        ))
    : await db.select().from(schema.placeCache)
        .where(eq(schema.placeCache.aiReviewed, true));
  
  if (reviewedCache.length === 0) {
    console.log('❌ 沒有已審核的資料');
    await pool.end();
    return;
  }
  
  console.log(`📦 找到 ${reviewedCache.length} 筆已審核資料`);
  
  const existingPlaces = await db.select({ googlePlaceId: schema.places.googlePlaceId })
    .from(schema.places);
  
  const existingPlaceIds = new Set(existingPlaces.map(p => p.googlePlaceId).filter(Boolean));
  console.log(`📍 已有 ${existingPlaceIds.size} 個正式景點`);
  
  const newPlacesByCategory = new Map<string, number[]>();
  let inserted = 0;
  let skipped = 0;
  
  console.log('\n📥 階段一：匯入資料');
  
  for (const cache of reviewedCache) {
    if (!cache.placeId || existingPlaceIds.has(cache.placeId)) {
      await db.delete(schema.placeCache).where(eq(schema.placeCache.id, cache.id));
      skipped++;
      continue;
    }
    
    try {
      const result = await db.insert(schema.places).values({
        placeName: cache.placeName,
        country: cache.country || '台灣',
        city: cache.city,
        district: cache.district,
        address: cache.verifiedAddress || '',
        locationLat: cache.locationLat ? parseFloat(cache.locationLat) : null,
        locationLng: cache.locationLng ? parseFloat(cache.locationLng) : null,
        googlePlaceId: cache.placeId,
        googleTypes: cache.googleTypes || null,
        primaryType: cache.primaryType || null,
        rating: cache.googleRating ? parseFloat(cache.googleRating) : null,
        category: cache.category,
        subcategory: cache.subCategory,
        description: '',
        isActive: true,
      }).returning({ id: schema.places.id });
      
      const newId = result[0]?.id;
      if (newId) {
        const cat = cache.category || '景點';
        if (!newPlacesByCategory.has(cat)) newPlacesByCategory.set(cat, []);
        newPlacesByCategory.get(cat)!.push(newId);
      }
      
      await db.delete(schema.placeCache).where(eq(schema.placeCache.id, cache.id));
      existingPlaceIds.add(cache.placeId);
      inserted++;
      
      if (inserted % 50 === 0) console.log(`   ✅ 已匯入 ${inserted} 筆...`);
    } catch (e: any) {
      if (e.message.includes('duplicate')) {
        await db.delete(schema.placeCache).where(eq(schema.placeCache.id, cache.id));
        skipped++;
      }
    }
  }
  
  console.log(`   匯入完成: ${inserted} 新增, ${skipped} 跳過`);
  
  console.log('\n📝 階段二：生成描述（8 類別並行）');
  
  const categoryPromises = Array.from(newPlacesByCategory.entries()).map(
    ([category, ids]) => generateDescriptionsForCategory(category, ids, cityArg || '全部')
  );
  
  const descResults = await Promise.all(categoryPromises);
  const totalDescriptions = descResults.reduce((sum, n) => sum + n, 0);
  
  const finalCount = await db.select({ id: schema.places.id })
    .from(schema.places);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 完成統計');
  console.log(`   新增景點: ${inserted} 筆`);
  console.log(`   描述生成: ${totalDescriptions} 筆`);
  console.log(`   正式景點總數: ${finalCount.length} 筆`);
  console.log(`   總耗時: ${elapsed} 秒`);
  console.log('='.repeat(60));
  
  await pool.end();
}

migrateCacheToPlaces().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});

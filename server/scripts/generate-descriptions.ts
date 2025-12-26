import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, and, or, like, isNull, sql } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

const db = drizzle(pool, { schema });

const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

const CATEGORY_PROMPTS: Record<string, string> = {
  '美食': `你是專業美食評論家，請為以下餐廳/小吃店撰寫吸引人的描述。
著重：招牌特色、用餐氛圍、適合場合（約會/家庭/朋友聚餐/獨食）。
風格：親切、讓人想去嚐鮮。字數：30-50字。`,

  '住宿': `你是旅宿評論專家，請為以下住宿撰寫吸引人的描述。
著重：住宿特色、周邊便利性、適合旅客類型（情侶/家庭/背包客/商務）。
風格：溫馨、讓人想預訂。字數：30-50字。`,

  '生態文化教育': `你是文化導覽員，請為以下文化/教育場所撰寫描述。
著重：歷史背景、特色展覽、適合對象（親子/學生/文青）。
風格：知性、引發好奇心。字數：30-50字。`,

  '遊程體驗': `你是體驗活動策劃師，請為以下體驗活動撰寫描述。
著重：活動特色、適合對象、預期收穫。
風格：活潑、讓人躍躍欲試。字數：30-50字。`,

  '娛樂設施': `你是娛樂達人，請為以下娛樂場所撰寫描述。
著重：娛樂特色、適合對象（朋友/情侶/家庭）、推薦時段。
風格：歡樂、讓人想放鬆玩樂。字數：30-50字。`,

  '活動': `你是活動企劃，請為以下活動/展演撰寫描述。
著重：活動亮點、氛圍、適合參加者。
風格：熱情、讓人想參與。字數：30-50字。`,

  '景點': `你是旅遊作家，請為以下景點撰寫吸引人的描述。
著重：最佳觀賞時間、特色亮點、拍照打卡點。
風格：詩意、讓人嚮往。字數：30-50字。`,

  '購物': `你是購物達人，請為以下購物地點撰寫描述。
著重：商品特色、必買推薦、逛街氛圍。
風格：實用、讓人想血拼。字數：30-50字。`,
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface PlaceData {
  id: number;
  placeName: string;
  category: string;
  address: string | null;
  rating: string | null;
  city: string;
}

async function generateDescriptionsForBatch(
  places: PlaceData[],
  categoryPrompt: string
): Promise<Map<number, string>> {
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY || places.length === 0) {
    return new Map();
  }

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

請回傳 JSON Array，格式：
[{ "id": 數字, "description": "描述文字" }]

規則：
1. 每個描述必須獨特，不可使用「知名的」「必訪」「特色體驗」等通用詞
2. 結合地點名稱、地址區域、評分等資訊
3. 描述要具體、有畫面感
4. 只回傳 JSON，不要其他文字`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
      }),
    });

    if (!response.ok) {
      console.error(`   API Error: ${response.status}`);
      return new Map();
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('   無法解析 JSON');
      return new Map();
    }

    const results = JSON.parse(jsonMatch[0]);
    const map = new Map<number, string>();
    for (const r of results) {
      if (r.id && r.description) {
        map.set(r.id, r.description);
      }
    }
    return map;
  } catch (e: any) {
    console.error(`   生成錯誤: ${e.message}`);
    return new Map();
  }
}

async function processCategory(
  category: string,
  places: PlaceData[],
  batchSize: number = 20
): Promise<{ updated: number; failed: number }> {
  const prompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS['景點'];
  let updated = 0;
  let failed = 0;

  console.log(`\n📦 [${category}] 開始處理 ${places.length} 筆`);

  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const descriptions = await generateDescriptionsForBatch(batch, prompt);

    for (const place of batch) {
      const newDesc = descriptions.get(place.id);
      if (newDesc) {
        try {
          await db.update(schema.places)
            .set({ description: newDesc })
            .where(eq(schema.places.id, place.id));
          updated++;
        } catch (e: any) {
          console.error(`   ❌ ${place.placeName}: ${e.message}`);
          failed++;
        }
      } else {
        failed++;
      }
    }

    console.log(`   ✅ ${Math.min(i + batchSize, places.length)}/${places.length} (成功: ${updated})`);
    
    if (i + batchSize < places.length) {
      await sleep(1000);
    }
  }

  console.log(`✅ [${category}] 完成: ${updated} 更新, ${failed} 失敗`);
  return { updated, failed };
}

async function main() {
  const mode = process.argv[2] || 'fix';
  const targetCity = process.argv[3];
  const startTime = Date.now();

  console.log('🚀 描述生成服務');
  console.log(`📍 模式: ${mode}`);
  if (targetCity) console.log(`📍 城市: ${targetCity}`);
  console.log('='.repeat(50));

  let whereCondition;
  
  if (mode === 'fix') {
    whereCondition = and(
      eq(schema.places.country, '台灣'),
      or(
        like(schema.places.description, '%必訪景點%'),
        like(schema.places.description, '%知名的%'),
        like(schema.places.description, '%特色體驗%'),
        like(schema.places.description, '%在地人氣%'),
        like(schema.places.description, '%深度感受%')
      ),
      targetCity ? eq(schema.places.city, targetCity) : sql`1=1`
    );
  } else {
    whereCondition = and(
      eq(schema.places.country, '台灣'),
      or(
        isNull(schema.places.description),
        eq(schema.places.description, '')
      ),
      targetCity ? eq(schema.places.city, targetCity) : sql`1=1`
    );
  }

  const placesToProcess = await db.select({
    id: schema.places.id,
    placeName: schema.places.placeName,
    category: schema.places.category,
    address: schema.places.address,
    rating: schema.places.rating,
    city: schema.places.city
  })
  .from(schema.places)
  .where(whereCondition);

  console.log(`📊 找到 ${placesToProcess.length} 筆需要處理`);

  if (placesToProcess.length === 0) {
    console.log('✅ 沒有需要處理的資料');
    await pool.end();
    return;
  }

  const categorizedPlaces = new Map<string, PlaceData[]>();
  for (const place of placesToProcess) {
    const cat = place.category || '景點';
    if (!categorizedPlaces.has(cat)) {
      categorizedPlaces.set(cat, []);
    }
    categorizedPlaces.get(cat)!.push(place);
  }

  console.log('\n📊 類別分布:');
  for (const [cat, places] of categorizedPlaces) {
    console.log(`   ${cat}: ${places.length} 筆`);
  }

  const categoryPromises = Array.from(categorizedPlaces.entries()).map(
    ([category, places]) => processCategory(category, places, 20)
  );

  const results = await Promise.all(categoryPromises);

  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(50));
  console.log('📊 描述生成完成統計');
  console.log(`   總更新: ${totalUpdated} 筆`);
  console.log(`   總失敗: ${totalFailed} 筆`);
  console.log(`   耗時: ${elapsed} 秒`);
  console.log('='.repeat(50));

  await pool.end();
}

main().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});

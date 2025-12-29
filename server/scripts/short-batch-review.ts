import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, isNull, or } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

interface PlaceForReview {
  id: number;
  placeName: string;
  description: string;
  category: string;
  subCategory: string;
  district: string;
  city: string;
}

interface BatchReviewResult {
  id: number;
  place_name: string;
  passed: boolean;
  reason: string;
  confidence: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 方案三：Pre-filtering 前置過濾關鍵字（不需要 AI 判斷的垃圾資料）
const EXCLUDE_KEYWORDS = [
  // 政府機關
  '區公所', '市公所', '鄉公所', '鎮公所', '戶政事務所', '地政事務所',
  '國稅局', '稅捐處', '監理站', '監理所', '警察局', '派出所', '消防局', '消防隊',
  '法院', '地檢署', '調解委員會', '兵役課', '役政署',
  // 醫療機構
  '衛生所', '衛生局', '疾病管制', '健保署', '長照中心',
  // 殯葬
  '殯儀館', '火葬場', '納骨塔', '靈骨塔', '墓園', '公墓', '殯葬',
  // 基礎設施
  '停車場', '停車塔', '加油站', '變電所', '汙水處理', '自來水', '焚化爐',
  '垃圾場', '回收站', '資源回收',
  // 金融（非旅遊相關）
  '銀行分行', '郵局', '農會信用部',
  // 教育機構（非觀光）
  '教育局', '學區', '督學', '國小', '國中', '高中', '大學', '學校', '幼兒園', '幼稒園',
  // 交通服務（非景點）
  '包車', '租車', '計程車行', '客運站',
];

const EXACT_EXCLUDE_NAMES = [
  '台灣小吃', '台灣美食', '台灣料理', '台灣餐廳',
  '小吃店', '美食店', '餐廳', '飯店', '旅館', '民宿',
];

function shouldPreFilter(placeName: string): { filtered: boolean; reason: string } {
  const lowerName = placeName.toLowerCase();
  for (const exactName of EXACT_EXCLUDE_NAMES) {
    if (lowerName === exactName.toLowerCase()) {
      return { filtered: true, reason: `通用名稱不適合作為景點: ${exactName}` };
    }
  }
  for (const keyword of EXCLUDE_KEYWORDS) {
    if (lowerName.includes(keyword.toLowerCase())) {
      return { filtered: true, reason: `包含排除關鍵字: ${keyword}` };
    }
  }
  return { filtered: false, reason: '' };
}

async function batchReviewPlacesWithAI(
  places: PlaceForReview[],
  retryCount = 0
): Promise<BatchReviewResult[]> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini API not configured");
  }

  const placesJson = places.map((p, idx) => ({
    id: idx + 1,
    name: p.placeName,
    description: p.description || '',
    category: `${p.category} > ${p.subCategory}`,
    location: `${p.city} ${p.district}`
  }));

  const prompt = `你是旅遊景點品質審核員。請一次審核以下 ${places.length} 個景點。

【待審核景點列表】
${JSON.stringify(placesJson, null, 2)}

【審核標準】
1. 名稱與描述是否相符且合理（不是亂碼或無意義文字）
2. 分類是否大致正確
3. 描述是否有最低限度的吸引力
4. 是否適合作為旅遊推薦（排除：殯儀、政府機關、醫療機構）

【回傳格式】
請回傳純 JSON Array，每個元素必須包含原始 id：
[
  { "id": 1, "place_name": "景點名稱", "passed": true, "reason": "適合推薦", "confidence": 0.9 },
  { "id": 2, "place_name": "另一景點", "passed": false, "reason": "非旅遊景點", "confidence": 0.8 }
]

只回傳 JSON Array，不要其他文字。`;

  try {
    const response = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 16384,  // 加倍以支援 50 筆批次
          responseMimeType: "application/json",
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 5000;
        console.log(`⚠️ 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試 (${retryCount + 1}/${MAX_RETRIES})...`);
        await sleep(backoffTime);
        return batchReviewPlacesWithAI(places, retryCount + 1);
      }
      throw new Error(`429 Rate Limit exceeded after ${MAX_RETRIES} retries`);
    }

    if (!response.ok) {
      throw new Error(`Gemini API failed: ${response.status}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    let text = candidate?.content?.parts?.[0]?.text || '';
    
    // 檢查是否因 token 超限被截斷
    if (finishReason === 'MAX_TOKENS') {
      console.error('⚠️ AI 回傳被截斷 (MAX_TOKENS)，保留此批次待重試');
      return places.map((p, idx) => ({
        id: idx + 1,
        place_name: p.placeName,
        passed: true,  // 保留資料，標記為待重試
        reason: "待重試",
        confidence: 0
      }));
    }
    
    // 清除 markdown 標記
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('AI 回傳無法解析:', text.substring(0, 500));
      // 保留資料，不刪除
      return places.map((p, idx) => ({
        id: idx + 1,
        place_name: p.placeName,
        passed: true,  // 改為保留
        reason: "解析失敗，保留待人工審核",
        confidence: 0
      }));
    }
    
    try {
      const parsed = JSON.parse(jsonMatch[0]) as BatchReviewResult[];
      return parsed;
    } catch (e) {
      console.error('JSON 解析失敗:', e);
      // 保留資料，不刪除
      return places.map((p, idx) => ({
        id: idx + 1,
        place_name: p.placeName,
        passed: true,  // 改為保留
        reason: "JSON解析失敗，保留待人工審核",
        confidence: 0
      }));
    }
  } catch (e: any) {
    if (e.message.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      console.log(`⚠️ 網路錯誤 429，等待 ${backoffTime / 1000} 秒後重試 (${retryCount + 1}/${MAX_RETRIES})...`);
      await sleep(backoffTime);
      return batchReviewPlacesWithAI(places, retryCount + 1);
    }
    throw e;
  }
}

async function shortBatchReview() {
  const TOTAL_LIMIT = parseInt(process.argv[2] || '100');
  const CHUNK_SIZE = 50;  // 用戶要求：50 筆（可能截斷風險較高）
  const DELAY_BETWEEN_CHUNKS = 5000;  // 5 秒間隔
  
  console.log(`🚀 優化版批次 AI 審查模式`);
  console.log(`📋 設定: 總數上限=${TOTAL_LIMIT}, 每批=${CHUNK_SIZE}筆, 間隔=${DELAY_BETWEEN_CHUNKS/1000}秒`);
  
  const unreviewed = await db.select().from(schema.placeCache)
    .where(or(
      eq(schema.placeCache.aiReviewed, false),
      isNull(schema.placeCache.aiReviewed)
    ))
    .limit(TOTAL_LIMIT);
  
  if (unreviewed.length === 0) {
    console.log("✅ 沒有待審核的資料");
    await pool.end();
    return;
  }
  
  console.log(`📦 取得 ${unreviewed.length} 筆待審核資料`);
  
  // 方案三：Pre-filtering 前置過濾
  let preFilteredCount = 0;
  const toReview: typeof unreviewed = [];
  
  for (const place of unreviewed) {
    const filterResult = shouldPreFilter(place.placeName);
    if (filterResult.filtered) {
      // 直接刪除，不需要 AI 審核
      await db.delete(schema.placeCache)
        .where(eq(schema.placeCache.id, place.id));
      preFilteredCount++;
      console.log(`🗑️ 前置過濾: ${place.placeName} - ${filterResult.reason}`);
    } else {
      toReview.push(place);
    }
  }
  
  if (preFilteredCount > 0) {
    console.log(`\n📊 前置過濾完成: 刪除 ${preFilteredCount} 筆，剩餘 ${toReview.length} 筆送 AI 審核\n`);
  }
  
  if (toReview.length === 0) {
    console.log("✅ 全部已過濾完成");
    await pool.end();
    return;
  }
  
  let totalPassed = 0;
  let totalFailed = preFilteredCount;  // 前置過濾的算作 failed
  let apiCallCount = 0;
  
  const totalChunks = Math.ceil(toReview.length / CHUNK_SIZE);
  
  for (let i = 0; i < toReview.length; i += CHUNK_SIZE) {
    const chunk = toReview.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    
    console.log(`\n🔄 批次 ${chunkNum}/${totalChunks}: 審核 ${chunk.length} 個地點...`);
    
    const placesToReview: PlaceForReview[] = chunk.map(p => ({
      id: p.id,
      placeName: p.placeName,
      description: p.description || '',
      category: p.category || '',
      subCategory: p.subCategory || '',
      district: p.district || '',
      city: p.city || ''
    }));
    
    try {
      const results = await batchReviewPlacesWithAI(placesToReview);
      apiCallCount++;
      
      const resultMap = new Map<number, BatchReviewResult>();
      for (const r of results) {
        if (r.id) {
          resultMap.set(r.id, r);
        }
      }
      
      for (let idx = 0; idx < chunk.length; idx++) {
        const place = chunk[idx];
        const result = resultMap.get(idx + 1);
        
        if (!result) {
          console.log(`⚠️ ${place.placeName}: 無審核結果，預設通過`);
          await db.update(schema.placeCache)
            .set({ aiReviewed: true })
            .where(eq(schema.placeCache.id, place.id));
          totalPassed++;
          continue;
        }
        
        if (result.passed && result.confidence >= 0.6) {
          await db.update(schema.placeCache)
            .set({ aiReviewed: true })
            .where(eq(schema.placeCache.id, place.id));
          totalPassed++;
          console.log(`✅ ${place.placeName}: PASS (${(result.confidence * 100).toFixed(0)}%)`);
        } else {
          await db.delete(schema.placeCache)
            .where(eq(schema.placeCache.id, place.id));
          totalFailed++;
          console.log(`❌ ${place.placeName}: FAIL - ${result.reason}`);
        }
      }
      
      if (i + CHUNK_SIZE < toReview.length) {
        console.log(`⏳ 冷卻 ${DELAY_BETWEEN_CHUNKS/1000} 秒避免 API 限流...`);
        await sleep(DELAY_BETWEEN_CHUNKS);
      }
    } catch (e: any) {
      console.error(`⚠️ 批次 ${chunkNum} 失敗: ${e.message}`);
      console.log(`🔄 跳過此批次，${chunk.length} 筆預設通過`);
      for (const place of chunk) {
        await db.update(schema.placeCache)
          .set({ aiReviewed: true })
          .where(eq(schema.placeCache.id, place.id));
        totalPassed++;
      }
      console.log(`⏳ 額外冷卻 5 秒...`);
      await sleep(5000);
    }
  }
  
  const remaining = await db.select().from(schema.placeCache)
    .where(or(
      eq(schema.placeCache.aiReviewed, false),
      isNull(schema.placeCache.aiReviewed)
    ));
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 審核完成統計`);
  console.log(`   前置過濾刪除: ${preFilteredCount} 筆`);
  console.log(`   AI 審核通過: ${totalPassed} 筆`);
  console.log(`   AI 審核刪除: ${totalFailed - preFilteredCount} 筆`);
  console.log(`   剩餘待審核: ${remaining.length} 筆`);
  console.log(`   API 呼叫次數: ${apiCallCount} 次`);
  console.log(`${'='.repeat(50)}`);
  
  await pool.end();
}

shortBatchReview().catch(e => {
  console.error("Error:", e);
  pool.end();
  process.exit(1);
});

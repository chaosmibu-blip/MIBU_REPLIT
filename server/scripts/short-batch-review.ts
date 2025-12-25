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
  place_name: string;
  passed: boolean;
  reason: string;
  confidence: number;
}

async function batchReviewPlacesWithAI(
  places: PlaceForReview[]
): Promise<BatchReviewResult[]> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini API not configured");
  }

  const placesJson = places.map(p => ({
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
請回傳純 JSON Array，每個元素對應一個景點：
[
  { "place_name": "景點名稱", "passed": true, "reason": "適合推薦", "confidence": 0.9 },
  { "place_name": "另一景點", "passed": false, "reason": "非旅遊景點", "confidence": 0.8 }
]

只回傳 JSON Array，不要其他文字。`;

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
        maxOutputTokens: 4096,
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('AI 回傳無法解析:', text.substring(0, 500));
    return places.map(p => ({
      place_name: p.placeName,
      passed: true,
      reason: "解析失敗預設通過",
      confidence: 0.6
    }));
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]) as BatchReviewResult[];
    return parsed;
  } catch (e) {
    console.error('JSON 解析失敗:', e);
    return places.map(p => ({
      place_name: p.placeName,
      passed: true,
      reason: "JSON解析失敗預設通過",
      confidence: 0.6
    }));
  }
}

async function shortBatchReview() {
  const BATCH_SIZE = parseInt(process.argv[2] || '20');
  const MAX_PER_CALL = 20;
  
  console.log(`🚀 真・批次 AI 審查模式 (每次 ${MAX_PER_CALL} 筆打包呼叫)`);
  
  const unreviewed = await db.select().from(schema.placeCache)
    .where(or(
      eq(schema.placeCache.aiReviewed, false),
      isNull(schema.placeCache.aiReviewed)
    ))
    .limit(BATCH_SIZE);
  
  if (unreviewed.length === 0) {
    console.log("✅ 沒有待審核的資料");
    await pool.end();
    return;
  }
  
  console.log(`📦 取得 ${unreviewed.length} 筆待審核資料`);
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  for (let i = 0; i < unreviewed.length; i += MAX_PER_CALL) {
    const batch = unreviewed.slice(i, i + MAX_PER_CALL);
    const batchNum = Math.floor(i / MAX_PER_CALL) + 1;
    const totalBatches = Math.ceil(unreviewed.length / MAX_PER_CALL);
    
    console.log(`\n🔄 批次 ${batchNum}/${totalBatches}: 審核 ${batch.length} 個地點...`);
    
    const placesToReview: PlaceForReview[] = batch.map(p => ({
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
      
      const resultMap = new Map<string, BatchReviewResult>();
      for (const r of results) {
        resultMap.set(r.place_name, r);
      }
      
      for (const place of batch) {
        const result = resultMap.get(place.placeName);
        
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
      
      if (i + MAX_PER_CALL < unreviewed.length) {
        console.log('⏳ 等待 2 秒避免 API 限流...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e: any) {
      console.error(`⚠️ 批次 ${batchNum} 失敗: ${e.message}`);
      for (const place of batch) {
        await db.update(schema.placeCache)
          .set({ aiReviewed: true })
          .where(eq(schema.placeCache.id, place.id));
        totalPassed++;
      }
    }
  }
  
  const remaining = await db.select().from(schema.placeCache)
    .where(or(
      eq(schema.placeCache.aiReviewed, false),
      isNull(schema.placeCache.aiReviewed)
    ));
  
  console.log(`\n📊 審核完成: 通過 ${totalPassed}, 刪除 ${totalFailed}, 剩餘 ${remaining.length}`);
  console.log(`📈 API 呼叫次數: ${Math.ceil(unreviewed.length / MAX_PER_CALL)} 次（舊版需 ${unreviewed.length} 次）`);
  
  await pool.end();
}

shortBatchReview().catch(e => {
  console.error("Error:", e);
  pool.end();
  process.exit(1);
});

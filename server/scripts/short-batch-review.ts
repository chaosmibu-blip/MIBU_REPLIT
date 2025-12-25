import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, isNull, or } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

async function reviewPlaceWithAI(
  placeName: string,
  description: string,
  category: string,
  subCategory: string,
  district: string,
  city: string
): Promise<{ passed: boolean; reason: string; confidence: number }> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini API not configured");
  }

  const prompt = `你是旅遊景點品質審核員。請審核以下景點是否適合推薦給旅客。

景點名稱：${placeName}
描述：${description}
分類：${category} > ${subCategory}
地區：${city} ${district}

審核標準：
1. 名稱與描述是否相符且合理
2. 分類是否正確
3. 描述是否有吸引力且具體
4. 是否適合作為旅遊推薦

請以 JSON 格式回答：
{
  "passed": true或false,
  "reason": "審核原因（10字內）",
  "confidence": 0.0到1.0的信心度
}

只回答 JSON。`;

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
        maxOutputTokens: 1024,
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  let jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    return { passed: true, reason: "解析失敗預設通過", confidence: 0.7 };
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      passed: parsed.passed ?? true,
      reason: parsed.reason || "無原因",
      confidence: parsed.confidence ?? 0.7
    };
  } catch {
    return { passed: true, reason: "JSON解析失敗預設通過", confidence: 0.7 };
  }
}

async function shortBatchReview() {
  // 測試更大批次：從命令列參數讀取，預設 10
  const BATCH_SIZE = parseInt(process.argv[2] || '10');
  
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
  
  console.log(`📦 處理 ${unreviewed.length} 筆`);
  
  let passed = 0;
  let failed = 0;
  
  for (const place of unreviewed) {
    try {
      const result = await reviewPlaceWithAI(
        place.placeName,
        place.description || '',
        place.category || '',
        place.subCategory || '',
        place.district || '',
        place.city || ''
      );
      
      if (result.passed && result.confidence >= 0.6) {
        await db.update(schema.placeCache)
          .set({ aiReviewed: true })
          .where(eq(schema.placeCache.id, place.id));
        passed++;
        console.log(`✅ ${place.placeName}: PASS (${(result.confidence * 100).toFixed(0)}%)`);
      } else {
        await db.delete(schema.placeCache)
          .where(eq(schema.placeCache.id, place.id));
        failed++;
        console.log(`❌ ${place.placeName}: FAIL - ${result.reason}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e: any) {
      console.error(`⚠️ ${place.placeName}: ERROR - ${e.message}`);
      await db.update(schema.placeCache)
        .set({ aiReviewed: true })
        .where(eq(schema.placeCache.id, place.id));
    }
  }
  
  // 查詢剩餘數量
  const remaining = await db.select().from(schema.placeCache)
    .where(or(
      eq(schema.placeCache.aiReviewed, false),
      isNull(schema.placeCache.aiReviewed)
    ));
  
  console.log(`📊 本次: 通過 ${passed}, 刪除 ${failed}, 剩餘 ${remaining.length}`);
  
  await pool.end();
}

shortBatchReview().catch(e => {
  console.error("Error:", e);
  pool.end();
  process.exit(1);
});

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, isNull, or, sql as drizzleSql } from 'drizzle-orm';

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
        maxOutputTokens: 256,
      }
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("API Error:", errText);
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  // 嘗試多種解析方式
  let jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) jsonMatch[0] = jsonMatch[1];
  }
  
  if (!jsonMatch) {
    console.log("  → 無法解析回應:", text.slice(0, 100));
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
    console.log("  → JSON解析失敗:", jsonMatch[0].slice(0, 50));
    return { passed: true, reason: "JSON解析失敗預設通過", confidence: 0.7 };
  }
}

async function getUnreviewedPlaceCache(limit: number) {
  return db.select().from(schema.placeCache)
    .where(or(
      eq(schema.placeCache.aiReviewed, false),
      isNull(schema.placeCache.aiReviewed)
    ))
    .limit(limit);
}

async function markPlaceCacheReviewed(id: number) {
  await db.update(schema.placeCache)
    .set({ aiReviewed: true })
    .where(eq(schema.placeCache.id, id));
}

async function deletePlaceCache(id: number) {
  await db.delete(schema.placeCache)
    .where(eq(schema.placeCache.id, id));
}

async function batchReviewAllCache() {
  console.log("🚀 開始批次審核 place_cache 資料...\n");
  
  let totalProcessed = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalErrors = 0;
  
  const batchSize = 50;
  let hasMore = true;
  
  while (hasMore) {
    const unreviewed = await getUnreviewedPlaceCache(batchSize);
    
    if (unreviewed.length === 0) {
      hasMore = false;
      break;
    }
    
    console.log(`📦 批次處理: ${unreviewed.length} 筆 (累計已處理: ${totalProcessed})`);
    
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
          await markPlaceCacheReviewed(place.id);
          totalPassed++;
          console.log(`✅ ${place.placeName}: PASS (${(result.confidence * 100).toFixed(0)}%)`);
        } else {
          await deletePlaceCache(place.id);
          totalFailed++;
          console.log(`❌ ${place.placeName}: FAIL - ${result.reason}`);
        }
        
        totalProcessed++;
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (e: any) {
        console.error(`⚠️ ${place.placeName}: ERROR - ${e.message}`);
        await markPlaceCacheReviewed(place.id);
        totalErrors++;
        totalProcessed++;
      }
    }
    
    console.log(`\n📊 進度: ${totalProcessed} 筆\n`);
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("🎉 place_cache 批次審核完成！");
  console.log("=".repeat(50));
  console.log(`總處理: ${totalProcessed} 筆`);
  console.log(`✅ 通過: ${totalPassed} 筆`);
  console.log(`❌ 刪除: ${totalFailed} 筆`);
  console.log(`⚠️ 錯誤: ${totalErrors} 筆`);
  console.log("=".repeat(50));
  
  await pool.end();
}

batchReviewAllCache().catch(e => {
  console.error("Fatal error:", e);
  pool.end();
  process.exit(1);
});

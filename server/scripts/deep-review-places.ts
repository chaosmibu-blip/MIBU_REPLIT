/**
 * 深度審核腳本 - 對 places 表進行重新審核（串行處理版）
 * 
 * 功能：
 * 1. 判斷地點是否適合旅遊推薦
 * 2. 修正錯誤的分類/子分類
 * 3. 刪除不適合的地點（軟刪除）
 * 
 * 用法：
 * npx tsx server/scripts/deep-review-places.ts [起始ID] [--auto]
 * 
 * 範例：
 * npx tsx server/scripts/deep-review-places.ts           # 從頭開始
 * npx tsx server/scripts/deep-review-places.ts 1000      # 從 ID>=1000 開始
 * npx tsx server/scripts/deep-review-places.ts 1000 --auto  # 自動模式
 * 
 * 設計：
 * - 每批 500 筆，串行處理
 * - maxOutputTokens: 32768（Gemini 3 思考型模型需要足夠空間）
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { shouldPreFilter, getBlacklistPromptText, EXCLUDE_KEYWORDS, EXACT_EXCLUDE_NAMES } from '../lib/placeBlacklist';
import { SEVEN_CATEGORIES } from '../lib/categoryMapping';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

const db = drizzle(pool, { schema });

const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

interface PlaceData {
  id: number;
  placeName: string;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  address: string | null;
  googleTypes: string | null;
  openingHours: any;
}

interface ReviewResult {
  id: number;
  action: 'keep' | 'fix' | 'x' | 'delete';  // x = 非旅遊性質，delete = 向下相容舊格式
  category?: string;
  subcategory?: string;
  reason?: string;
}

function formatOpeningHours(openingHours: any): string {
  if (!openingHours) return '未提供';
  
  if (typeof openingHours === 'object') {
    if (openingHours.weekday_text && Array.isArray(openingHours.weekday_text)) {
      return openingHours.weekday_text.slice(0, 2).join('; ');
    }
    if (openingHours.periods && Array.isArray(openingHours.periods)) {
      const first = openingHours.periods[0];
      if (first?.open?.time && first?.close?.time) {
        return `${first.open.time.slice(0,2)}:${first.open.time.slice(2)}-${first.close.time.slice(0,2)}:${first.close.time.slice(2)}`;
      }
    }
  }
  
  if (typeof openingHours === 'string') {
    return openingHours.slice(0, 50);
  }
  
  return '未提供';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function batchReviewWithAI(places: PlaceData[], retryCount = 0): Promise<ReviewResult[]> {
  const MAX_RETRIES = 3;
  
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY) {
    throw new Error('缺少 Gemini API 設定');
  }

  const placesJson = places.map(p => ({
    id: p.id,
    name: p.placeName,
    cat: p.category || '未分類',
    sub: p.subcategory || '未分類',
    desc: (p.description || '').slice(0, 60),
    addr: (p.address || '').slice(0, 30),
    types: (p.googleTypes || '').slice(0, 40),
    hours: formatOpeningHours(p.openingHours)
  }));

  const blacklistPrompt = getBlacklistPromptText();
  
  const prompt = `你是旅遊景點審核專家。請審核以下地點是否適合作為旅遊推薦。

【待審核地點】
${placesJson.map(p => `${p.id}. ${p.name}｜${p.cat}/${p.sub}｜${p.desc}｜${p.addr}｜營業:${p.hours}｜types:${p.types}`).join('\n')}

${blacklistPrompt}

【非旅遊性質判斷 - 回傳 x】
若該地點的主要用途不是給遊客體驗、觀光、品嚐美食、住宿或購物，而是純粹服務當地居民日常需求（如：便利商店、家庭理髮、社區診所），請判定為非旅遊性質。

【分類錯誤判斷 - 回傳 fix】
1. 住宿分類下出現非住宿（如：美容院、運動用品店）
2. 景點分類下出現非景點（如：美甲店、墓園）
3. 名稱與分類明顯不符
4. 子分類不夠精確（如：餐廳→應細分為火鍋、燒烤、日式料理等）

【七大合法種類】
${SEVEN_CATEGORIES.join('、')}

【回傳格式】純 JSON Array，每筆一行：
[
{"id":123,"action":"keep"},
{"id":456,"action":"x","reason":"非旅遊性質：便利商店"},
{"id":789,"action":"fix","category":"美食","subcategory":"韓式料理","reason":"子分類修正"}
]

重要：
1. action 只有三種值：keep、x、fix
2. 如需新增子分類（如：韓式料理），直接回傳，只要歸到七大種類之一
3. 只回傳 JSON Array，不要其他文字
4. 每個 id 都必須有對應的審核結果`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-3-pro-preview:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 32768,
          responseMimeType: "application/json",
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 5000;
        console.log(`⚠️ 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試 (${retryCount + 1}/${MAX_RETRIES})...`);
        await sleep(backoffTime);
        return batchReviewWithAI(places, retryCount + 1);
      }
      throw new Error(`429 Rate Limit exceeded after ${MAX_RETRIES} retries`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    let text = candidate?.content?.parts?.[0]?.text || '';

    if (finishReason === 'MAX_TOKENS') {
      console.error('⚠️ AI 回傳被截斷 (MAX_TOKENS)');
      console.error(`   本批 ${places.length} 筆可能過多，建議減少批次大小`);
      return places.map(p => ({ id: p.id, action: 'keep' as const, reason: '待重試-截斷' }));
    }

    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('AI 回傳無法解析:', text.substring(0, 500));
      return places.map(p => ({ id: p.id, action: 'keep' as const, reason: '解析失敗' }));
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as ReviewResult[];
      return parsed;
    } catch (e) {
      console.error('JSON 解析失敗:', e);
      return places.map(p => ({ id: p.id, action: 'keep' as const, reason: 'JSON解析失敗' }));
    }
  } catch (e: any) {
    if (e.message.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      console.log(`⚠️ 網路錯誤 429，等待 ${backoffTime / 1000} 秒後重試...`);
      await sleep(backoffTime);
      return batchReviewWithAI(places, retryCount + 1);
    }
    throw e;
  }
}

interface ChunkResult {
  results: ReviewResult[];
  chunkIndex: number;
  error?: string;
}

async function processChunkWithDelay(
  places: PlaceData[], 
  chunkIndex: number, 
  delayMs: number
): Promise<ChunkResult> {
  if (delayMs > 0) {
    await sleep(delayMs);
  }
  console.log(`   📤 Chunk ${chunkIndex + 1} 開始發送...`);
  
  try {
    const results = await batchReviewWithAI(places);
    console.log(`   ✅ Chunk ${chunkIndex + 1} 完成`);
    return { results, chunkIndex };
  } catch (e: any) {
    console.error(`   ⚠️ Chunk ${chunkIndex + 1} 失敗: ${e.message}`);
    return { 
      results: places.map(p => ({ id: p.id, action: 'keep' as const, reason: '處理失敗-保留' })),
      chunkIndex,
      error: e.message
    };
  }
}

async function deepReviewPlaces() {
  const args = process.argv.slice(2);
  const autoMode = args.includes('--auto');
  const numericArgs = args.filter(arg => !arg.startsWith('--') && !isNaN(parseInt(arg)));
  let currentStartId = parseInt(numericArgs[0]) || 0;

  const BATCH_SIZE = 500;
  const DELAY_BETWEEN_BATCHES = 3000;

  let grandTotalKeep = 0;
  let grandTotalFix = 0;
  let grandTotalDelete = 0;
  let grandTotalError = 0;
  let batchCount = 0;
  const allNewSubcategories: Set<string> = new Set();
  const grandStartTime = Date.now();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔍 深度審核 places 表（串行處理版）`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`📋 設定: 每批=${BATCH_SIZE}筆, 串行處理`);
  console.log(`📋 起始ID=${currentStartId}`);
  console.log(`🤖 模型: gemini-3-pro-preview`);
  console.log(`📦 maxOutputTokens: 32768`);
  console.log(`🔄 自動模式: ${autoMode ? '啟用（處理全部資料）' : '停用（僅處理一批）'}`);
  console.log(`${'═'.repeat(60)}\n`);

  while (true) {
    batchCount++;
    
    const places = await db.select({
      id: schema.places.id,
      placeName: schema.places.placeName,
      category: schema.places.category,
      subcategory: schema.places.subcategory,
      description: schema.places.description,
      address: schema.places.address,
      googleTypes: schema.places.googleTypes,
      openingHours: schema.places.openingHours,
    })
    .from(schema.places)
    .where(and(
      eq(schema.places.isActive, true),
      gte(schema.places.id, currentStartId)
    ))
    .orderBy(schema.places.id)
    .limit(BATCH_SIZE);

    if (places.length === 0) {
      console.log('✅ 沒有待審核的資料');
      break;
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🔄 第 ${batchCount} 批次`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`📊 本批次: ${places.length} 筆 (ID ${places[0].id} ~ ${places[places.length - 1].id})`);
    console.log(`正在呼叫 Gemini 3 Pro Preview...`);

    const startTime = Date.now();
    const results = await batchReviewWithAI(places);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️ AI 回應耗時: ${elapsed} 秒`);

    let keepCount = 0;
    let fixCount = 0;
    let deleteCount = 0;
    let errorCount = 0;

    for (const result of results) {
      try {
        if (result.action === 'keep') {
          keepCount++;
        } else if (result.action === 'x' || result.action === 'delete') {
          // x = 非旅遊性質，delete = 向下相容舊格式
          await db.update(schema.places)
            .set({ isActive: false })
            .where(eq(schema.places.id, result.id));
          deleteCount++;
          const actionLabel = result.action === 'x' ? '非旅遊' : '刪除';
          console.log(`   ❌ ${actionLabel} #${result.id}: ${result.reason || '不適合旅遊'}`);
        } else if (result.action === 'fix' && result.category && result.subcategory) {
          if (!SEVEN_CATEGORIES.includes(result.category as any)) {
            console.log(`   ⚠️ #${result.id}: 無效種類 "${result.category}"，跳過`);
            errorCount++;
            continue;
          }

          await db.update(schema.places)
            .set({ 
              category: result.category,
              subcategory: result.subcategory 
            })
            .where(eq(schema.places.id, result.id));
          fixCount++;
          allNewSubcategories.add(`${result.category}/${result.subcategory}`);
          console.log(`   🔧 修正 #${result.id}: → ${result.category}/${result.subcategory}`);
        }
      } catch (e: any) {
        console.error(`   ⚠️ 處理 #${result.id} 失敗:`, e.message);
        errorCount++;
      }
    }

    grandTotalKeep += keepCount;
    grandTotalFix += fixCount;
    grandTotalDelete += deleteCount;
    grandTotalError += errorCount;

    console.log(`📊 本批: ✅${keepCount} 🔧${fixCount} ❌${deleteCount}`);

    const lastId = places[places.length - 1].id;
    currentStartId = lastId + 1;

    const remainingCount = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.places)
      .where(and(
        eq(schema.places.isActive, true),
        gte(schema.places.id, currentStartId)
      ));

    const remaining = remainingCount[0]?.count || 0;
    console.log(`📍 剩餘: ${remaining} 筆`);

    if (remaining === 0) {
      break;
    }

    if (!autoMode) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`💡 繼續審核請執行:`);
      console.log(`   npx tsx server/scripts/deep-review-places.ts ${currentStartId}`);
      console.log(`   或使用自動模式: npx tsx server/scripts/deep-review-places.ts ${currentStartId} --auto`);
      console.log(`${'═'.repeat(60)}`);
      break;
    }

    console.log(`⏳ 等待 ${DELAY_BETWEEN_BATCHES / 1000} 秒後繼續下一批...`);
    await sleep(DELAY_BETWEEN_BATCHES);
  }

  const grandElapsed = ((Date.now() - grandStartTime) / 1000 / 60).toFixed(1);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎉 審核完成！`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`📊 總計統計:`);
  console.log(`   ✅ 保留: ${grandTotalKeep} 筆`);
  console.log(`   🔧 修正: ${grandTotalFix} 筆`);
  console.log(`   ❌ 刪除: ${grandTotalDelete} 筆`);
  if (grandTotalError > 0) console.log(`   ⚠️ 錯誤: ${grandTotalError} 筆`);
  console.log(`   ⏱️ 總耗時: ${grandElapsed} 分鐘`);
  console.log(`   📦 批次數: ${batchCount}`);

  if (allNewSubcategories.size > 0) {
    console.log(`\n📝 所有新增子分類（需加入 categoryMapping.ts）:`);
    Array.from(allNewSubcategories).forEach(sub => {
      console.log(`   - ${sub}`);
    });
  }

  console.log(`${'═'.repeat(60)}\n`);

  await pool.end();
}

deepReviewPlaces().catch(console.error);

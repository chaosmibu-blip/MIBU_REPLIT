/**
 * District 欄位審查腳本
 * 
 * 功能：
 * 1. 找出不符合標準行政區名稱的 district 值
 * 2. 使用 AI 或規則修正為正確的行政區
 * 3. 支援批次處理和自動修正
 * 
 * 用法：
 * npx tsx server/scripts/review-district.ts              # 掃描並顯示問題
 * npx tsx server/scripts/review-district.ts --fix        # 自動修正可確定的項目
 * npx tsx server/scripts/review-district.ts --ai         # 使用 AI 修正模糊項目
 * npx tsx server/scripts/review-district.ts --fix --ai   # 全自動修正
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, and, sql, isNotNull, notInArray } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

interface InvalidDistrict {
  district: string;
  count: number;
  sampleIds: number[];
  sampleAddresses: string[];
}

interface FixResult {
  oldValue: string;
  newValue: string | null;
  action: 'fix' | 'skip' | 'clear';
  reason: string;
}

// 已知的修正映射（台→臺、簡→繁）
const KNOWN_FIXES: Record<string, string> = {
  '台東市': '臺東市',
  '台西鄉': '臺西鄉',
  '霧台鄉': '霧臺鄉',
  '金山区': '金山區',
  '西屯区': '西屯區',
  '瑞芳区': '瑞芳區',
  '中区': '中區',
  '东区': '東區',
};

// 應該清除的值（截斷、地址、非地名）
const SHOULD_CLEAR_PATTERNS = [
  /^\d+號?$/,           // 純數字
  /^[一-龥]{1}$/,        // 單一中文字
  /路\d+號/,             // 包含地址
  /市場$/,               // 以市場結尾
  /夜市$/,               // 以夜市結尾
  /未分類/,              // 未分類
  /服務區/,              // 服務區
  /遊憩區/,              // 遊憩區
  /攤販區/,              // 攤販區
  /風景區/,              // 風景區
  /鄉\d/,                // 鄉+數字（郵遞區號）
  /縣.*市$/,             // 錯誤格式如 "桃園縣楊梅市"
];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getValidDistricts(): Promise<Set<string>> {
  const districts = await db.select({ nameZh: schema.districts.nameZh })
    .from(schema.districts);
  return new Set(districts.map(d => d.nameZh));
}

async function getInvalidDistricts(validDistricts: Set<string>): Promise<InvalidDistrict[]> {
  // 取得所有不在標準清單中的 district 值
  const results = await db.execute(sql`
    SELECT 
      district,
      COUNT(*)::int as count,
      (ARRAY_AGG(id ORDER BY id))[1:3] as sample_ids,
      (ARRAY_AGG(address ORDER BY id))[1:3] as sample_addresses
    FROM places
    WHERE district IS NOT NULL 
      AND district != ''
      AND is_active = true
    GROUP BY district
    ORDER BY count DESC
  `);

  const invalidList: InvalidDistrict[] = [];
  
  for (const row of results.rows as any[]) {
    if (!validDistricts.has(row.district)) {
      invalidList.push({
        district: row.district,
        count: row.count,
        sampleIds: row.sample_ids || [],
        sampleAddresses: row.sample_addresses || [],
      });
    }
  }

  return invalidList;
}

function determineFixAction(district: string, address: string | null): FixResult {
  // 1. 檢查已知修正
  if (KNOWN_FIXES[district]) {
    return {
      oldValue: district,
      newValue: KNOWN_FIXES[district],
      action: 'fix',
      reason: '繁簡/台臺轉換',
    };
  }

  // 2. 檢查應清除的模式
  for (const pattern of SHOULD_CLEAR_PATTERNS) {
    if (pattern.test(district)) {
      return {
        oldValue: district,
        newValue: null,
        action: 'clear',
        reason: `符合清除模式: ${pattern}`,
      };
    }
  }

  // 3. 檢查重複區名（如 "中壢區中壢區"）
  const duplicateMatch = district.match(/^(.+[區鄉鎮市])(\1)$/);
  if (duplicateMatch) {
    return {
      oldValue: district,
      newValue: duplicateMatch[1],
      action: 'fix',
      reason: '移除重複區名',
    };
  }

  // 4. 無法確定
  return {
    oldValue: district,
    newValue: null,
    action: 'skip',
    reason: '需要人工或 AI 判斷',
  };
}

async function aiDetermineDistrict(
  invalidItems: InvalidDistrict[], 
  validDistrictsList: string[]
): Promise<Map<string, string | null>> {
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY) {
    console.log('⚠️ 缺少 Gemini API 設定，跳過 AI 修正');
    return new Map();
  }

  const prompt = `你是台灣行政區專家。請判斷以下錯誤的行政區名稱應該對應到哪個正確的行政區。

【有效的行政區清單（部分）】
${validDistrictsList.slice(0, 100).join('、')}

【待修正的資料】
${invalidItems.slice(0, 30).map(item => 
  `"${item.district}" (${item.count}筆) - 地址範例: ${item.sampleAddresses[0] || '無'}`
).join('\n')}

【回傳格式】純 JSON Object：
{
  "錯誤值1": "正確行政區名",
  "錯誤值2": null,  // null 表示無法判斷或應清除
  "錯誤值3": "正確行政區名"
}

規則：
1. 若能從地址判斷正確行政區，請回傳正確值
2. 若為截斷、地址、非地名，回傳 null
3. 若無法判斷，回傳 null
4. 只回傳 JSON，不要其他文字`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-2.0-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        }
      }),
    });

    if (!response.ok) {
      console.error('AI API 失敗:', response.status);
      return new Map();
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    const parsed = JSON.parse(text) as Record<string, string | null>;
    return new Map(Object.entries(parsed));
  } catch (e: any) {
    console.error('AI 解析失敗:', e.message);
    return new Map();
  }
}

async function applyFixes(
  fixes: Map<string, string | null>,
  dryRun: boolean = true
): Promise<{ fixed: number; cleared: number }> {
  let fixed = 0;
  let cleared = 0;

  for (const [oldValue, newValue] of fixes) {
    if (newValue === null) {
      // 清除
      if (!dryRun) {
        await db.update(schema.places)
          .set({ district: null })
          .where(eq(schema.places.district, oldValue));
      }
      cleared++;
      console.log(`   🧹 清除: "${oldValue}" → null`);
    } else if (newValue !== oldValue) {
      // 修正
      if (!dryRun) {
        await db.update(schema.places)
          .set({ district: newValue })
          .where(eq(schema.places.district, oldValue));
      }
      fixed++;
      console.log(`   🔧 修正: "${oldValue}" → "${newValue}"`);
    }
  }

  return { fixed, cleared };
}

async function reviewDistricts() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const useAI = args.includes('--ai');
  const dryRun = !shouldFix;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔍 District 欄位審查`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`📋 模式: ${dryRun ? '掃描（不修改）' : '修正模式'}`);
  console.log(`🤖 AI 修正: ${useAI ? '啟用' : '停用'}`);
  console.log(`${'═'.repeat(60)}\n`);

  // 取得有效行政區清單
  console.log('📥 載入有效行政區清單...');
  const validDistricts = await getValidDistricts();
  console.log(`   共 ${validDistricts.size} 個有效行政區\n`);

  // 找出無效的 district 值
  console.log('🔍 掃描無效 district 值...');
  const invalidItems = await getInvalidDistricts(validDistricts);
  console.log(`   發現 ${invalidItems.length} 種無效值\n`);

  if (invalidItems.length === 0) {
    console.log('✅ 所有 district 欄位都是有效的！');
    await pool.end();
    return;
  }

  // 分類處理
  const autoFixable: Map<string, string | null> = new Map();
  const needsReview: InvalidDistrict[] = [];

  console.log('📊 分析修正方案...\n');

  for (const item of invalidItems) {
    const result = determineFixAction(item.district, item.sampleAddresses[0]);
    
    if (result.action === 'fix' && result.newValue) {
      autoFixable.set(item.district, result.newValue);
      console.log(`   ✓ 可自動修正: "${item.district}" → "${result.newValue}" (${item.count}筆)`);
    } else if (result.action === 'clear') {
      autoFixable.set(item.district, null);
      console.log(`   🧹 將清除: "${item.district}" (${item.count}筆) - ${result.reason}`);
    } else {
      needsReview.push(item);
    }
  }

  console.log(`\n📈 統計:`);
  console.log(`   可自動修正: ${autoFixable.size} 種`);
  console.log(`   需要審查: ${needsReview.length} 種\n`);

  // 顯示需要審查的項目
  if (needsReview.length > 0) {
    console.log('⚠️ 需要審查的項目（前 20 個）:');
    for (const item of needsReview.slice(0, 20)) {
      console.log(`   "${item.district}" (${item.count}筆) - 地址: ${item.sampleAddresses[0]?.slice(0, 40) || '無'}`);
    }
    console.log('');
  }

  // AI 修正
  if (useAI && needsReview.length > 0) {
    console.log('🤖 使用 AI 判斷模糊項目...');
    const validList = Array.from(validDistricts);
    const aiSuggestions = await aiDetermineDistrict(needsReview, validList);
    
    for (const [key, value] of aiSuggestions) {
      if (value !== undefined) {
        autoFixable.set(key, value);
        if (value) {
          console.log(`   AI 建議: "${key}" → "${value}"`);
        } else {
          console.log(`   AI 建議清除: "${key}"`);
        }
      }
    }
    console.log('');
  }

  // 執行修正
  if (shouldFix && autoFixable.size > 0) {
    console.log('🔧 執行修正...\n');
    const { fixed, cleared } = await applyFixes(autoFixable, false);
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✅ 修正完成！`);
    console.log(`   🔧 修正: ${fixed} 種`);
    console.log(`   🧹 清除: ${cleared} 種`);
    console.log(`${'═'.repeat(60)}\n`);
  } else if (autoFixable.size > 0) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`💡 若要執行修正，請加上 --fix 參數:`);
    console.log(`   npx tsx server/scripts/review-district.ts --fix`);
    console.log(`   npx tsx server/scripts/review-district.ts --fix --ai`);
    console.log(`${'═'.repeat(60)}\n`);
  }

  await pool.end();
}

reviewDistricts().catch(console.error);

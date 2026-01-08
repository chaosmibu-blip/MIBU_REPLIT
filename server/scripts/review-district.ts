/**
 * District 欄位審查腳本
 * 
 * 功能：
 * 1. 找出不符合標準行政區名稱的 district 值
 * 2. 使用規則或 AI 從 address 欄位中提取正確的行政區
 * 3. 支援批次處理和自動修正
 * 
 * 用法：
 * npx tsx server/scripts/review-district.ts              # 掃描並顯示問題
 * npx tsx server/scripts/review-district.ts --fix        # 執行規則修正
 * npx tsx server/scripts/review-district.ts --fix --ai   # 規則+AI 修正（從地址提取）
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getValidDistricts(): Promise<Set<string>> {
  const districts = await db.select({ nameZh: schema.districts.nameZh })
    .from(schema.districts);
  return new Set(districts.map(d => d.nameZh));
}

// 從地址中用正則提取行政區
function extractDistrictFromAddress(address: string, validDistricts: Set<string>): string | null {
  if (!address) return null;
  
  // 常見模式：縣市名後接行政區
  const patterns = [
    /(?:台灣|臺灣)?(?:台北市|臺北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣|金門縣|連江縣)([一-龥]{2,3}[區鄉鎮市])/,
    /(\d{3,6})?(?:台灣|臺灣)?[一-龥]{2,3}(?:市|縣)([一-龥]{2,3}[區鄉鎮市])/,
  ];
  
  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) {
      const candidate = match[1] || match[2];
      if (candidate && validDistricts.has(candidate)) {
        return candidate;
      }
      // 嘗試台→臺轉換
      if (candidate) {
        const converted = candidate.replace('台', '臺');
        if (validDistricts.has(converted)) {
          return converted;
        }
      }
    }
  }
  
  // 直接搜尋有效行政區名
  for (const district of validDistricts) {
    if (address.includes(district)) {
      return district;
    }
  }
  
  return null;
}

interface PlaceToFix {
  id: number;
  district: string | null;
  address: string | null;
  city: string | null;
}

async function getPlacesWithInvalidDistrict(
  invalidDistrictValues: string[]
): Promise<PlaceToFix[]> {
  if (invalidDistrictValues.length === 0) return [];
  
  const places = await db.select({
    id: schema.places.id,
    district: schema.places.district,
    address: schema.places.address,
    city: schema.places.city,
  })
  .from(schema.places)
  .where(and(
    eq(schema.places.isActive, true),
    inArray(schema.places.district, invalidDistrictValues)
  ));
  
  return places;
}

async function aiBatchExtractDistricts(
  places: PlaceToFix[], 
  validDistrictsList: string[]
): Promise<Map<number, string | null>> {
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY) {
    console.log('⚠️ 缺少 Gemini API 設定，跳過 AI 修正');
    return new Map();
  }

  const BATCH_SIZE = 50;
  const results = new Map<number, string | null>();
  
  for (let i = 0; i < places.length; i += BATCH_SIZE) {
    const batch = places.slice(i, i + BATCH_SIZE);
    console.log(`   📤 AI 批次 ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(places.length/BATCH_SIZE)}...`);
    
    const prompt = `你是台灣行政區專家。請從地址中提取正確的行政區名稱。

【有效的行政區清單（部分）】
${validDistrictsList.slice(0, 150).join('、')}

【待處理的地點】
${batch.map(p => 
  `${p.id}: ${p.address || '無地址'}`
).join('\n')}

【回傳格式】純 JSON Object，key 為 ID（數字型態）：
{
  "123": "大安區",
  "456": "信義區",
  "789": null
}

規則：
1. 從地址中識別「XX區」「XX鄉」「XX鎮」等行政區
2. 回傳的值必須在有效清單中（注意：臺/台 要用「臺」）
3. 若地址不含行政區或無法判斷，回傳 null
4. 只回傳 JSON，不要其他文字`;

    try {
      const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          }
        }),
      });

      if (!response.ok) {
        console.error(`   ⚠️ AI API 失敗: ${response.status}`);
        continue;
      }

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      // 更穩健的 JSON 解析
      let parsed: Record<string, string | null> = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        // 嘗試逐行解析
        const lines = text.split('\n');
        for (const line of lines) {
          const match = line.match(/"(\d+)":\s*"?([^",}]+)"?/);
          if (match) {
            parsed[match[1]] = match[2] === 'null' ? null : match[2].trim();
          }
        }
      }
      
      for (const [idStr, value] of Object.entries(parsed)) {
        const id = parseInt(idStr);
        if (!isNaN(id)) {
          results.set(id, value);
        }
      }
      
      // Rate limit protection
      if (i + BATCH_SIZE < places.length) {
        await sleep(1000);
      }
    } catch (e: any) {
      console.error(`   ⚠️ AI 批次處理失敗: ${e.message}`);
    }
  }
  
  return results;
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
  const validList = Array.from(validDistricts);
  console.log(`   共 ${validDistricts.size} 個有效行政區\n`);

  // 找出所有無效的 district 值
  console.log('🔍 掃描無效 district 值...');
  const invalidQuery = await db.execute(sql`
    SELECT DISTINCT district, COUNT(*)::int as count
    FROM places
    WHERE district IS NOT NULL 
      AND district != ''
      AND is_active = true
    GROUP BY district
    ORDER BY count DESC
  `);

  const invalidDistrictValues: string[] = [];
  const invalidCounts: Map<string, number> = new Map();
  
  for (const row of invalidQuery.rows as any[]) {
    if (!validDistricts.has(row.district)) {
      invalidDistrictValues.push(row.district);
      invalidCounts.set(row.district, row.count);
    }
  }

  console.log(`   發現 ${invalidDistrictValues.length} 種無效值\n`);

  if (invalidDistrictValues.length === 0) {
    console.log('✅ 所有 district 欄位都是有效的！');
    await pool.end();
    return;
  }

  // 統計
  let totalInvalidPlaces = 0;
  for (const count of invalidCounts.values()) {
    totalInvalidPlaces += count;
  }
  console.log(`📊 共 ${totalInvalidPlaces} 筆資料需要處理\n`);

  // 顯示前 20 個問題
  console.log('⚠️ 無效值清單（前 20 個）:');
  let shown = 0;
  for (const [district, count] of invalidCounts) {
    if (shown >= 20) break;
    const fix = KNOWN_FIXES[district];
    if (fix) {
      console.log(`   "${district}" (${count}筆) → 已知修正: ${fix}`);
    } else {
      console.log(`   "${district}" (${count}筆)`);
    }
    shown++;
  }
  console.log('');

  if (!shouldFix) {
    console.log(`${'═'.repeat(60)}`);
    console.log(`💡 若要執行修正，請加上 --fix 參數:`);
    console.log(`   npx tsx server/scripts/review-district.ts --fix`);
    console.log(`   npx tsx server/scripts/review-district.ts --fix --ai`);
    console.log(`${'═'.repeat(60)}\n`);
    await pool.end();
    return;
  }

  // 開始修正
  console.log('🔧 開始修正...\n');
  
  let fixedByRule = 0;
  let fixedByRegex = 0;
  let fixedByAI = 0;
  let cleared = 0;

  // Step 1: 套用已知修正
  console.log('📌 Step 1: 套用已知修正映射...');
  for (const [oldValue, newValue] of Object.entries(KNOWN_FIXES)) {
    if (invalidCounts.has(oldValue)) {
      const count = invalidCounts.get(oldValue)!;
      await db.update(schema.places)
        .set({ district: newValue })
        .where(eq(schema.places.district, oldValue));
      console.log(`   ✓ "${oldValue}" → "${newValue}" (${count}筆)`);
      fixedByRule += count;
      invalidDistrictValues.splice(invalidDistrictValues.indexOf(oldValue), 1);
    }
  }
  console.log(`   已知修正完成: ${fixedByRule} 筆\n`);

  // Step 2: 取得剩餘需要處理的資料
  const remainingPlaces = await getPlacesWithInvalidDistrict(invalidDistrictValues);
  console.log(`📌 Step 2: 從地址提取行政區 (${remainingPlaces.length} 筆)...`);

  // Step 2a: 用正則從地址提取
  const needsAI: PlaceToFix[] = [];
  
  for (const place of remainingPlaces) {
    const extracted = extractDistrictFromAddress(place.address || '', validDistricts);
    if (extracted) {
      await db.update(schema.places)
        .set({ district: extracted })
        .where(eq(schema.places.id, place.id));
      fixedByRegex++;
    } else {
      needsAI.push(place);
    }
  }
  console.log(`   正則提取成功: ${fixedByRegex} 筆`);
  console.log(`   需要 AI 處理: ${needsAI.length} 筆\n`);

  // Step 3: AI 處理
  if (useAI && needsAI.length > 0) {
    console.log('📌 Step 3: AI 從地址提取行政區...');
    const aiResults = await aiBatchExtractDistricts(needsAI, validList);
    
    for (const place of needsAI) {
      const aiDistrict = aiResults.get(place.id);
      if (aiDistrict && validDistricts.has(aiDistrict)) {
        await db.update(schema.places)
          .set({ district: aiDistrict })
          .where(eq(schema.places.id, place.id));
        fixedByAI++;
      } else {
        // AI 無法判斷，清除為 null
        await db.update(schema.places)
          .set({ district: null })
          .where(eq(schema.places.id, place.id));
        cleared++;
      }
    }
    console.log(`   AI 修正成功: ${fixedByAI} 筆`);
    console.log(`   清除無法判斷: ${cleared} 筆\n`);
  } else if (needsAI.length > 0) {
    console.log(`⚠️ 剩餘 ${needsAI.length} 筆需要 AI 處理，請加上 --ai 參數\n`);
  }

  // 結果統計
  console.log(`${'═'.repeat(60)}`);
  console.log(`✅ 修正完成！`);
  console.log(`   📌 已知規則修正: ${fixedByRule} 筆`);
  console.log(`   📌 正則提取修正: ${fixedByRegex} 筆`);
  if (useAI) {
    console.log(`   🤖 AI 提取修正: ${fixedByAI} 筆`);
    console.log(`   🧹 無法判斷清除: ${cleared} 筆`);
  }
  console.log(`   📊 總計修正: ${fixedByRule + fixedByRegex + fixedByAI} 筆`);
  console.log(`${'═'.repeat(60)}\n`);

  await pool.end();
}

reviewDistricts().catch(console.error);

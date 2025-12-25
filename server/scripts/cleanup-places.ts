/**
 * 資料庫維護腳本：清洗正式地點資料表
 * 
 * 執行步驟：
 * 1. 掃描所有 isActive=true 的地點
 * 2. 關鍵字黑名單過濾
 * 3. 類別黑名單過濾（基於 category/subcategory）
 * 4. 名稱去重（保留較新的 ID）
 * 
 * 注意：只做軟刪除（isActive=false），不物理刪除
 */

import { db } from '../db';
import { places } from '@shared/schema';
import { eq, and, sql, inArray, lt } from 'drizzle-orm';

// ============ 關鍵字黑名單 ============
const NAME_BLACKLIST = [
  // 交通設施
  '停車場', '停車', '車站', '轉運站', '加油站', '收費站', '休息站',
  // 公共設施
  '廁所', '洗手間', '公廁', '化妝室',
  '售票處', '售票亭', '服務中心', '服務台', '遊客中心',
  '辦公室', '辦事處', '管理處', '管理中心',
  // 教育機構
  '國小', '國中', '高中', '大學', '學校', '幼兒園', '幼稚園', '補習班',
  // 醫療機構
  '醫院', '診所', '衛生所', '急診', '藥局',
  // 政府機關
  '區公所', '市公所', '鄉公所', '鎮公所', '縣政府', '市政府',
  '派出所', '警察局', '消防隊', '消防局',
  '戶政事務所', '地政事務所', '稅捐處',
  // 金融機構
  '銀行', 'ATM', '郵局',
  // 殯葬設施
  '殯儀館', '火葬場', '墓園', '納骨塔', '靈骨塔',
  // 其他
  '工廠', '倉庫', '資源回收', '垃圾', '污水處理',
  '營業所', '分公司', '總公司',
];

// ============ 類別黑名單 ============
const CATEGORY_BLACKLIST = [
  // 教育
  'school', 'university', 'primary_school', 'secondary_school',
  // 醫療
  'hospital', 'doctor', 'dentist', 'pharmacy', 'health',
  // 政府
  'local_government_office', 'city_hall', 'courthouse', 'police', 'fire_station',
  // 金融
  'bank', 'atm', 'finance', 'insurance_agency', 'accounting',
  // 殯葬
  'funeral_home', 'cemetery',
  // 其他非旅遊
  'car_dealer', 'car_rental', 'car_repair', 'car_wash',
  'electrician', 'plumber', 'roofing_contractor', 'moving_company',
  'real_estate_agency', 'lawyer', 'storage',
  'gas_station', 'parking', 'transit_station',
];

async function main() {
  console.log('=== 資料庫維護腳本：清洗正式地點資料表 ===\n');
  
  // Step 1: 取得所有 isActive=true 的地點
  console.log('Step 1: 掃描所有已上架地點...');
  const activePlaces = await db
    .select()
    .from(places)
    .where(eq(places.isActive, true));
  
  console.log(`找到 ${activePlaces.length} 筆已上架地點\n`);
  
  let hiddenByKeyword = 0;
  let hiddenByCategory = 0;
  let hiddenByDuplicate = 0;
  const idsToHide: number[] = [];
  
  // Step 2: 關鍵字黑名單過濾
  console.log('Step 2: 執行關鍵字黑名單過濾...');
  for (const place of activePlaces) {
    const name = place.placeName.toLowerCase();
    for (const keyword of NAME_BLACKLIST) {
      if (name.includes(keyword.toLowerCase())) {
        if (!idsToHide.includes(place.id)) {
          idsToHide.push(place.id);
          hiddenByKeyword++;
          console.log(`  [關鍵字] ${place.placeName} (命中: ${keyword})`);
        }
        break;
      }
    }
  }
  console.log(`關鍵字過濾: ${hiddenByKeyword} 筆\n`);
  
  // Step 3: 類別黑名單過濾
  console.log('Step 3: 執行類別黑名單過濾...');
  for (const place of activePlaces) {
    if (idsToHide.includes(place.id)) continue;
    
    const category = (place.category || '').toLowerCase();
    const subcategory = (place.subcategory || '').toLowerCase();
    
    for (const blacklistCat of CATEGORY_BLACKLIST) {
      if (category.includes(blacklistCat) || subcategory.includes(blacklistCat)) {
        idsToHide.push(place.id);
        hiddenByCategory++;
        console.log(`  [類別] ${place.placeName} (命中: ${blacklistCat})`);
        break;
      }
    }
  }
  console.log(`類別過濾: ${hiddenByCategory} 筆\n`);
  
  // Step 4: 名稱去重（保留較新的 ID）
  console.log('Step 4: 執行名稱去重...');
  const nameMap = new Map<string, number[]>();
  
  for (const place of activePlaces) {
    if (idsToHide.includes(place.id)) continue;
    
    const normalizedName = place.placeName.trim().toLowerCase();
    const key = `${normalizedName}|${place.city}|${place.district}`;
    
    if (!nameMap.has(key)) {
      nameMap.set(key, []);
    }
    nameMap.get(key)!.push(place.id);
  }
  
  for (const [key, ids] of nameMap) {
    if (ids.length > 1) {
      // 排序 ID，保留最大的（最新的）
      ids.sort((a, b) => b - a);
      const keepId = ids[0];
      const duplicateIds = ids.slice(1);
      
      for (const dupId of duplicateIds) {
        if (!idsToHide.includes(dupId)) {
          idsToHide.push(dupId);
          hiddenByDuplicate++;
          const place = activePlaces.find(p => p.id === dupId);
          console.log(`  [重複] ${place?.placeName} (ID: ${dupId}, 保留: ${keepId})`);
        }
      }
    }
  }
  console.log(`去重過濾: ${hiddenByDuplicate} 筆\n`);
  
  // 執行軟刪除
  console.log('=== 執行軟刪除 ===');
  if (idsToHide.length > 0) {
    // 分批更新（每批 100 筆）
    const batchSize = 100;
    for (let i = 0; i < idsToHide.length; i += batchSize) {
      const batch = idsToHide.slice(i, i + batchSize);
      await db
        .update(places)
        .set({ isActive: false })
        .where(inArray(places.id, batch));
      console.log(`已更新 ${Math.min(i + batchSize, idsToHide.length)} / ${idsToHide.length}`);
    }
  }
  
  // 最終報告
  console.log('\n=== 維護完成 ===');
  console.log(`總共掃描: ${activePlaces.length} 筆`);
  console.log(`標記隱藏: ${idsToHide.length} 筆`);
  console.log(`  - 關鍵字過濾: ${hiddenByKeyword} 筆`);
  console.log(`  - 類別過濾: ${hiddenByCategory} 筆`);
  console.log(`  - 名稱去重: ${hiddenByDuplicate} 筆`);
  console.log(`剩餘有效: ${activePlaces.length - idsToHide.length} 筆`);
}

main().catch(console.error);

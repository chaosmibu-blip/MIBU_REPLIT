/**
 * TDX 觀光局資料匯入腳本
 *
 * 從交通部 TDX 平台匯入觀光景點、餐飲、旅館資料到 place_cache
 *
 * 使用方式：
 *   npx tsx server/scripts/import-tdx-tourism.ts [城市] [--type=scenic|restaurant|hotel|all]
 *
 * 範例：
 *   npx tsx server/scripts/import-tdx-tourism.ts              # 匯入全台所有類型
 *   npx tsx server/scripts/import-tdx-tourism.ts 臺北市        # 匯入臺北市所有類型
 *   npx tsx server/scripts/import-tdx-tourism.ts 臺北市 --type=scenic  # 只匯入景點
 *
 * 環境變數：
 *   TDX_CLIENT_ID - TDX API Client ID
 *   TDX_CLIENT_SECRET - TDX API Client Secret
 *
 * 注意：無認證時每日限制 50 次查詢
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, inArray } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

const db = drizzle(pool, { schema });

// TDX API 設定
const TDX_BASE_URL = 'https://tdx.transportdata.tw/api/basic/v2';
const TDX_AUTH_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

// 城市代碼對照表
const CITY_CODE_MAP: Record<string, string> = {
  '臺北市': 'Taipei',
  '台北市': 'Taipei',
  '新北市': 'NewTaipei',
  '桃園市': 'Taoyuan',
  '臺中市': 'Taichung',
  '台中市': 'Taichung',
  '臺南市': 'Tainan',
  '台南市': 'Tainan',
  '高雄市': 'Kaohsiung',
  '基隆市': 'Keelung',
  '新竹市': 'Hsinchu',
  '新竹縣': 'HssinchuCounty',
  '苗栗縣': 'MiaoliCounty',
  '彰化縣': 'ChanghuaCounty',
  '南投縣': 'NantouCounty',
  '雲林縣': 'YunlinCounty',
  '嘉義市': 'Chiayi',
  '嘉義縣': 'ChiayiCounty',
  '屏東縣': 'PingtungCounty',
  '宜蘭縣': 'YilanCounty',
  '花蓮縣': 'HualienCounty',
  '臺東縣': 'TaitungCounty',
  '台東縣': 'TaitungCounty',
  '澎湖縣': 'PenghuCounty',
  '金門縣': 'KinmenCounty',
  '連江縣': 'LienchiangCounty',
};

// 反向對照：英文代碼 → 中文城市名
const CODE_TO_CITY_MAP: Record<string, string> = Object.entries(CITY_CODE_MAP).reduce((acc, [zh, en]) => {
  if (!acc[en]) acc[en] = zh;
  return acc;
}, {} as Record<string, string>);

// TDX 類別對照到七大分類
const TDX_CLASS_MAP: Record<string, { category: string; subcategory: string }> = {
  // 景點類別
  '自然風景類': { category: '景點', subcategory: '自然風光' },
  '觀光工廠類': { category: '生態文化教育', subcategory: '觀光工廠' },
  '遊憩類': { category: '景點', subcategory: '遊憩區' },
  '休閒農業類': { category: '遊程體驗', subcategory: '農場體驗' },
  '生態類': { category: '生態文化教育', subcategory: '生態園區' },
  '溫泉類': { category: '遊程體驗', subcategory: 'SPA按摩' },
  '古蹟類': { category: '景點', subcategory: '古蹟' },
  '廟宇類': { category: '景點', subcategory: '宗教聖地' },
  '藝術類': { category: '生態文化教育', subcategory: '藝術展館' },
  '文化類': { category: '生態文化教育', subcategory: '文化中心' },
  '國家公園類': { category: '景點', subcategory: '國家公園' },
  '國家風景區類': { category: '景點', subcategory: '風景區' },
  '都會公園類': { category: '景點', subcategory: '城市公園' },
  '森林遊樂區類': { category: '景點', subcategory: '森林遊樂區' },
  '海水浴場類': { category: '景點', subcategory: '海灘' },
  '林場類': { category: '景點', subcategory: '林場' },
  '其他': { category: '景點', subcategory: '其他景點' },
  // 餐飲類別
  '地方特產': { category: '美食', subcategory: '地方特產' },
  '中式美食': { category: '美食', subcategory: '中式料理' },
  '甜點冰品': { category: '美食', subcategory: '甜點' },
  '異國料理': { category: '美食', subcategory: '異國料理' },
  '伴手禮': { category: '購物', subcategory: '伴手禮' },
  '素食': { category: '美食', subcategory: '素食' },
  // 旅館類別
  '國際觀光旅館': { category: '住宿', subcategory: '星級飯店' },
  '一般觀光旅館': { category: '住宿', subcategory: '商務旅館' },
  '一般旅館': { category: '住宿', subcategory: '一般旅館' },
  '民宿': { category: '住宿', subcategory: '民宿' },
};

// 取得 Access Token
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('⚠️ 無 TDX 認證資訊，使用匿名模式（每日限 50 次）');
    return null;
  }

  // 檢查快取
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  try {
    const response = await fetch(TDX_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      console.error('❌ TDX 認證失敗:', response.status);
      return null;
    }

    const data = await response.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 提前 60 秒過期
    };

    console.log('✅ TDX 認證成功');
    return cachedToken.token;
  } catch (error) {
    console.error('❌ TDX 認證錯誤:', error);
    return null;
  }
}

// 呼叫 TDX API
async function fetchTdxApi(endpoint: string, token: string | null): Promise<any[]> {
  const url = `${TDX_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 401) {
        console.error('❌ API 認證失敗，請檢查 TDX_CLIENT_ID 和 TDX_CLIENT_SECRET');
      } else if (response.status === 429) {
        console.error('❌ API 請求次數超過限制，請明天再試或設定認證');
      } else {
        console.error(`❌ API 錯誤: ${response.status}`);
      }
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('❌ API 請求錯誤:', error);
    return [];
  }
}

// 解析地址取得鄉鎮區
function parseDistrict(address: string, city: string): string {
  if (!address) return city;

  // 常見的行政區結尾
  const patterns = [
    /([^\s市縣]+[區鄉鎮市])/,
    /(?:市|縣)([^市縣區鄉鎮]+[區鄉鎮])/,
  ];

  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return city;
}

// 檢查已存在的 Place ID (使用 placeId 欄位存 TDX ID)
async function checkExistingIds(tdxIds: string[]): Promise<Set<string>> {
  if (tdxIds.length === 0) return new Set();

  const existing = await db.select({ placeId: schema.placeCache.placeId })
    .from(schema.placeCache)
    .where(inArray(schema.placeCache.placeId, tdxIds));

  return new Set(existing.map(e => e.placeId).filter(Boolean) as string[]);
}

// 匯入景點資料
async function importScenicSpots(cityCode?: string): Promise<number> {
  const token = await getAccessToken();
  const endpoint = cityCode
    ? `/Tourism/ScenicSpot/${cityCode}?$format=JSON`
    : '/Tourism/ScenicSpot?$format=JSON';

  console.log(`\n📍 正在取得景點資料...`);
  const spots = await fetchTdxApi(endpoint, token);
  console.log(`   取得 ${spots.length} 筆景點`);

  if (spots.length === 0) return 0;

  // 檢查已存在 (使用 placeId 欄位存 TDX ID)
  const tdxIds = spots.map(s => `tdx_scenic_${s.ScenicSpotID}`);
  const existingIds = await checkExistingIds(tdxIds);

  let savedCount = 0;
  let skippedCount = 0;

  for (const spot of spots) {
    const tdxId = `tdx_scenic_${spot.ScenicSpotID}`;

    if (existingIds.has(tdxId)) {
      skippedCount++;
      continue;
    }

    // 解析類別
    const classInfo = TDX_CLASS_MAP[spot.Class1] || TDX_CLASS_MAP[spot.Class2] || TDX_CLASS_MAP[spot.Class3] || { category: '景點', subcategory: '其他景點' };

    // 解析城市和區域
    const city = spot.City || CODE_TO_CITY_MAP[cityCode || ''] || '台灣';
    const district = parseDistrict(spot.Address, city);

    // 合併描述 (description 是 notNull，需要有預設值)
    const description = [spot.Description, spot.DescriptionDetail]
      .filter(Boolean)
      .join(' ')
      .slice(0, 500) || `${spot.ScenicSpotName}，位於${city}${district}的觀光景點。`;

    try {
      await db.insert(schema.placeCache).values({
        placeName: spot.ScenicSpotName,
        description: description,
        category: classInfo.category,
        subCategory: classInfo.subcategory,
        district: district,
        city: city,
        country: '台灣',
        placeId: tdxId,  // 用 placeId 存 TDX 唯一識別碼
        verifiedName: spot.ScenicSpotName,
        verifiedAddress: spot.Address || null,
        locationLat: spot.Position?.PositionLat?.toString() || null,
        locationLng: spot.Position?.PositionLon?.toString() || null,
        isLocationVerified: !!(spot.Position?.PositionLat && spot.Position?.PositionLon),
        aiReviewed: false,
        lastVerifiedAt: new Date(),
      });
      savedCount++;
    } catch (error: any) {
      if (!error.message?.includes('duplicate')) {
        console.error(`   ❌ ${spot.ScenicSpotName}: ${error.message}`);
      }
    }
  }

  console.log(`   ✅ 景點: 新增 ${savedCount} / 跳過 ${skippedCount}`);
  return savedCount;
}

// 匯入餐飲資料
async function importRestaurants(cityCode?: string): Promise<number> {
  const token = await getAccessToken();
  const endpoint = cityCode
    ? `/Tourism/Restaurant/${cityCode}?$format=JSON`
    : '/Tourism/Restaurant?$format=JSON';

  console.log(`\n🍜 正在取得餐飲資料...`);
  const restaurants = await fetchTdxApi(endpoint, token);
  console.log(`   取得 ${restaurants.length} 筆餐飲`);

  if (restaurants.length === 0) return 0;

  const tdxIds = restaurants.map(r => `tdx_restaurant_${r.RestaurantID}`);
  const existingIds = await checkExistingIds(tdxIds);

  let savedCount = 0;
  let skippedCount = 0;

  for (const restaurant of restaurants) {
    const tdxId = `tdx_restaurant_${restaurant.RestaurantID}`;

    if (existingIds.has(tdxId)) {
      skippedCount++;
      continue;
    }

    // 解析類別
    const classInfo = TDX_CLASS_MAP[restaurant.Class] || { category: '美食', subcategory: '在地美食' };

    const city = restaurant.City || CODE_TO_CITY_MAP[cityCode || ''] || '台灣';
    const district = parseDistrict(restaurant.Address, city);

    // description 是 notNull
    const description = restaurant.Description?.slice(0, 500) || `${restaurant.RestaurantName}，位於${city}${district}的特色餐飲。`;

    try {
      await db.insert(schema.placeCache).values({
        placeName: restaurant.RestaurantName,
        description: description,
        category: classInfo.category,
        subCategory: classInfo.subcategory,
        district: district,
        city: city,
        country: '台灣',
        placeId: tdxId,
        verifiedName: restaurant.RestaurantName,
        verifiedAddress: restaurant.Address || null,
        locationLat: restaurant.Position?.PositionLat?.toString() || null,
        locationLng: restaurant.Position?.PositionLon?.toString() || null,
        isLocationVerified: !!(restaurant.Position?.PositionLat && restaurant.Position?.PositionLon),
        aiReviewed: false,
        lastVerifiedAt: new Date(),
      });
      savedCount++;
    } catch (error: any) {
      if (!error.message?.includes('duplicate')) {
        console.error(`   ❌ ${restaurant.RestaurantName}: ${error.message}`);
      }
    }
  }

  console.log(`   ✅ 餐飲: 新增 ${savedCount} / 跳過 ${skippedCount}`);
  return savedCount;
}

// 匯入旅館資料
async function importHotels(cityCode?: string): Promise<number> {
  const token = await getAccessToken();
  const endpoint = cityCode
    ? `/Tourism/Hotel/${cityCode}?$format=JSON`
    : '/Tourism/Hotel?$format=JSON';

  console.log(`\n🏨 正在取得旅館資料...`);
  const hotels = await fetchTdxApi(endpoint, token);
  console.log(`   取得 ${hotels.length} 筆旅館`);

  if (hotels.length === 0) return 0;

  const tdxIds = hotels.map(h => `tdx_hotel_${h.HotelID}`);
  const existingIds = await checkExistingIds(tdxIds);

  let savedCount = 0;
  let skippedCount = 0;

  for (const hotel of hotels) {
    const tdxId = `tdx_hotel_${hotel.HotelID}`;

    if (existingIds.has(tdxId)) {
      skippedCount++;
      continue;
    }

    // 解析類別
    const classInfo = TDX_CLASS_MAP[hotel.Class] || { category: '住宿', subcategory: '旅館' };

    const city = hotel.City || CODE_TO_CITY_MAP[cityCode || ''] || '台灣';
    const district = parseDistrict(hotel.Address, city);

    // description 是 notNull
    const description = hotel.Description?.slice(0, 500) || `${hotel.HotelName}，位於${city}${district}的住宿設施。`;

    try {
      await db.insert(schema.placeCache).values({
        placeName: hotel.HotelName,
        description: description,
        category: classInfo.category,
        subCategory: classInfo.subcategory,
        district: district,
        city: city,
        country: '台灣',
        placeId: tdxId,
        verifiedName: hotel.HotelName,
        verifiedAddress: hotel.Address || null,
        locationLat: hotel.Position?.PositionLat?.toString() || null,
        locationLng: hotel.Position?.PositionLon?.toString() || null,
        isLocationVerified: !!(hotel.Position?.PositionLat && hotel.Position?.PositionLon),
        aiReviewed: false,
        lastVerifiedAt: new Date(),
      });
      savedCount++;
    } catch (error: any) {
      if (!error.message?.includes('duplicate')) {
        console.error(`   ❌ ${hotel.HotelName}: ${error.message}`);
      }
    }
  }

  console.log(`   ✅ 旅館: 新增 ${savedCount} / 跳過 ${skippedCount}`);
  return savedCount;
}

// 主程式
async function main() {
  const args = process.argv.slice(2);
  const typeArg = args.find(a => a.startsWith('--type='));
  const cityArg = args.find(a => !a.startsWith('--'));

  const importType = typeArg?.split('=')[1] || 'all';
  const cityCode = cityArg ? CITY_CODE_MAP[cityArg] : undefined;

  console.log('🚀 TDX 觀光局資料匯入');
  console.log('='.repeat(50));
  console.log(`📍 目標城市: ${cityArg || '全台灣'}`);
  console.log(`📦 匯入類型: ${importType}`);
  console.log('='.repeat(50));

  if (cityArg && !cityCode) {
    console.error(`❌ 找不到城市代碼: ${cityArg}`);
    console.log('可用城市:', Object.keys(CITY_CODE_MAP).join(', '));
    await pool.end();
    process.exit(1);
  }

  const startTime = Date.now();
  let totalSaved = 0;

  try {
    if (importType === 'all' || importType === 'scenic') {
      totalSaved += await importScenicSpots(cityCode);
    }

    if (importType === 'all' || importType === 'restaurant') {
      totalSaved += await importRestaurants(cityCode);
    }

    if (importType === 'all' || importType === 'hotel') {
      totalSaved += await importHotels(cityCode);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(50));
    console.log('📊 匯入完成統計');
    console.log(`   總新增: ${totalSaved} 筆`);
    console.log(`   耗時: ${elapsed} 秒`);
    console.log('='.repeat(50));
    console.log('\n💡 下一步：執行 AI 審核');
    console.log('   npx tsx server/scripts/short-batch-review.ts');

  } catch (error) {
    console.error('❌ 匯入失敗:', error);
  }

  await pool.end();
}

main().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});

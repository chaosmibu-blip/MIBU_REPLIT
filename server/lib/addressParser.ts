/**
 * 地址解析器：從台灣地址中提取縣市和鄉鎮區
 */

const TAIWAN_CITIES = [
  '台北市', '臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣',
  '苗栗縣', '台中市', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市',
  '嘉義縣', '台南市', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣',
  '台東縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'
];

// 離島郵遞區號對應（Google Places API 有時只回傳郵遞區號）
const ZIPCODE_TO_CITY: Record<string, { city: string; district: string }> = {
  // 金門縣 890-894
  '890': { city: '金門縣', district: '金沙鎮' },
  '891': { city: '金門縣', district: '金湖鎮' },
  '892': { city: '金門縣', district: '金寧鄉' },
  '893': { city: '金門縣', district: '金城鎮' },
  '894': { city: '金門縣', district: '烈嶼鄉' },
  // 連江縣 209-212
  '209': { city: '連江縣', district: '南竿鄉' },
  '210': { city: '連江縣', district: '北竿鄉' },
  '211': { city: '連江縣', district: '莒光鄉' },
  '212': { city: '連江縣', district: '東引鄉' },
  // 澎湖縣 880-885
  '880': { city: '澎湖縣', district: '馬公市' },
  '881': { city: '澎湖縣', district: '西嶼鄉' },
  '882': { city: '澎湖縣', district: '望安鄉' },
  '883': { city: '澎湖縣', district: '七美鄉' },
  '884': { city: '澎湖縣', district: '白沙鄉' },
  '885': { city: '澎湖縣', district: '湖西鄉' },
};

const DISTRICT_SUFFIXES = ['市', '區', '鄉', '鎮'];

interface ParsedAddress {
  city: string | null;
  district: string | null;
}

/**
 * 從地址字串中解析出縣市和鄉鎮區
 * 
 * 範例：
 * - "265台灣宜蘭縣羅東鎮興東路8-1號" → { city: "宜蘭縣", district: "羅東鎮" }
 * - "320台灣桃園市中壢區中正路333號" → { city: "桃園市", district: "中壢區" }
 * - "893前水頭45" → { city: "金門縣", district: "金城鎮" } (透過郵遞區號辨識)
 */
export function parseAddress(address: string | null | undefined): ParsedAddress {
  if (!address) return { city: null, district: null };

  let city: string | null = null;
  let district: string | null = null;

  // 先嘗試透過郵遞區號識別離島地址（Google Places API 常省略縣市名）
  const zipcodeMatch = address.match(/^(\d{3})/);
  if (zipcodeMatch) {
    const zipcode = zipcodeMatch[1];
    const mapped = ZIPCODE_TO_CITY[zipcode];
    if (mapped) {
      return { city: mapped.city, district: mapped.district };
    }
  }

  // 移除郵遞區號和「台灣」前綴
  const cleanAddress = address.replace(/^\d{3,5}/, '').replace(/^台灣/, '');

  // 1. 尋找縣市
  for (const c of TAIWAN_CITIES) {
    if (cleanAddress.includes(c)) {
      city = c;
      break;
    }
  }

  if (!city) return { city: null, district: null };

  // 2. 從縣市後面提取鄉鎮區
  const cityIndex = cleanAddress.indexOf(city);
  const afterCity = cleanAddress.substring(cityIndex + city.length);

  // 找到第一個結尾為 市/區/鄉/鎮 的詞
  for (const suffix of DISTRICT_SUFFIXES) {
    const suffixIndex = afterCity.indexOf(suffix);
    if (suffixIndex !== -1 && suffixIndex < 10) {
      // 鄉鎮區名稱通常不超過 5 個字
      district = afterCity.substring(0, suffixIndex + 1);
      break;
    }
  }

  return { city, district };
}

/**
 * 驗證地址是否屬於指定城市
 */
export function isAddressInCity(address: string | null | undefined, targetCity: string): boolean {
  const parsed = parseAddress(address);
  if (!parsed.city) return false;
  
  // 處理台/臺的差異
  const normalizedParsed = parsed.city.replace('臺', '台');
  const normalizedTarget = targetCity.replace('臺', '台');
  
  return normalizedParsed === normalizedTarget;
}

/**
 * 從地址中提取鄉鎮區
 */
export function extractDistrict(address: string | null | undefined): string | null {
  return parseAddress(address).district;
}

/**
 * Place Generator - 地點批次採集模組
 * 
 * 功能：
 * 1. 分頁採集 (Pagination) - 最多 3 頁，每頁 20 筆
 * 2. AI 關鍵字擴散 - 用 Gemini 生成子關鍵字
 * 3. 白名單過濾 - 使用 includedType 參數
 * 4. 黑名單過濾 - 排除非旅遊地點
 * 5. place_id 去重
 * 6. 規則映射分類 - 使用 google_types 對照表判斷 category/subcategory
 * 7. AI 只生成 description - 分類交給規則，AI 專注文案
 */

import { 
  determineCategory, 
  determineSubcategory, 
  generateFallbackDescription,
  classifyPlace,
  type MibuCategory 
} from './categoryMapping';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ============ 白名單：旅遊相關類別（不含通用類別） ============
const INCLUDED_TYPES = [
  // 景點類
  'tourist_attraction',
  'amusement_park',
  'aquarium',
  'art_gallery',
  'museum',
  'zoo',
  'park',
  'natural_feature',
  'campground',
  // 餐飲類
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'night_club',
  'meal_takeaway',
  'meal_delivery',
  // 住宿類
  'lodging',
  'hotel',
  'resort_hotel',
  'motel',
  'bed_and_breakfast',
  // 休閒娛樂類
  'spa',
  'movie_theater',
  'bowling_alley',
  'gym',
  'stadium',
  // 購物類
  'shopping_mall',
  'department_store',
  'book_store',
  'clothing_store',
  'jewelry_store',
  'gift_shop',
  'souvenir_store'
];
// 注意：不包含 'point_of_interest' 和 'establishment'，因為這些是通用標籤

// ============ 黑名單：非旅遊類別 ============
const EXCLUDED_PLACE_TYPES = [
  'travel_agency', 'insurance_agency', 'real_estate_agency', 'lawyer', 'accounting', 
  'bank', 'library', 'local_government_office', 'city_hall', 'courthouse', 'post_office',
  'police', 'fire_station', 'hospital', 'doctor', 'dentist', 'pharmacy', 'veterinary_care',
  'school', 'primary_school', 'secondary_school', 'university', 'car_dealer', 'car_rental',
  'car_repair', 'car_wash', 'gas_station', 'parking', 'transit_station', 'bus_station',
  'train_station', 'subway_station', 'taxi_stand', 'atm', 'funeral_home', 'cemetery',
  'church', 'mosque', 'synagogue', 'hindu_temple', 'place_of_worship',
  'supermarket', 'convenience_store', 'laundry', 'locksmith', 'moving_company',
  'plumber', 'electrician', 'roofing_contractor', 'painter', 'storage'
];

const EXCLUDED_BUSINESS_STATUS = ['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'];

const GENERIC_NAME_PATTERNS = [
  '探索', '旅行社', '旅行', 'Travel', 'Explore', 'Tour',
  '農會', '公所', '區公所', '鄉公所', '鎮公所', '市公所', '縣政府', '市政府', '衛生所', '戶政事務所',
  '警察局', '派出所', '消防隊', '消防局', '郵局', '稅務局', '地政事務所',
  '診所', '牙醫', '醫院', '藥局', '獸醫', '銀行', '加油站', '停車場', '汽車', '機車行',
  '葬儀', '殯儀館', '靈骨塔', '納骨塔',
  '服務中心', '遊客中心', '超市', '便利商店', '7-11', '全家', '萊爾富', '小北'
];

// ============ 介面定義 ============
export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  location: { lat: number; lng: number } | null;
  rating: number | null;
  reviewCount: number | null;
  types: string[];
  primaryType: string | null;
  businessStatus: string | null;
}

export interface BatchGenerateResult {
  places: PlaceResult[];
  stats: {
    totalFetched: number;
    afterTypeFilter: number;
    afterNameFilter: number;
    afterDedup: number;
    keywords: string[];
    pagesPerKeyword: number[];
  };
}

// ============ 工具函數 ============
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============ Gemini AI 呼叫（含重試機制） ============
export async function callGemini(prompt: string, retryCount = 0): Promise<string> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini API not configured");
  }

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
          temperature: 0.7,
          maxOutputTokens: 2048,
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 3000;
        console.log(`[Gemini] 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試...`);
        await sleep(backoffTime);
        return callGemini(prompt, retryCount + 1);
      }
      throw new Error(`429 Rate Limit exceeded after ${MAX_RETRIES} retries`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API failed: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 3000;
      console.log(`[Gemini] 網路錯誤 429，等待 ${backoffTime / 1000} 秒後重試...`);
      await sleep(backoffTime);
      return callGemini(prompt, retryCount + 1);
    }
    throw e;
  }
}

// ============ 批次生成描述（單次 API 呼叫處理多個地點） ============
export async function batchGenerateDescriptions(
  places: { name: string; address: string; types: string[] }[],
  district: string,
  retryCount = 0
): Promise<Map<string, string>> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  if (!baseUrl || !apiKey) {
    return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
  }

  const placesJson = places.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    address: p.address,
    types: p.types?.join(', ') || '景點'
  }));

  const prompt = `你是旅遊文案專家。請為以下 ${places.length} 個景點各寫一段 30-50 字的吸引人描述。

【景點列表】
${JSON.stringify(placesJson, null, 2)}

【要求】
1. 每個描述要突出景點特色，吸引遊客
2. 簡潔有力，不超過 50 字
3. 回傳 JSON Array 格式

【回傳格式】
[
  { "id": 1, "description": "景點描述文字" },
  { "id": 2, "description": "另一個景點描述" }
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
          temperature: 0.7,
          maxOutputTokens: 4096,
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 5000;
        console.log(`[BatchDesc] 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試...`);
        await sleep(backoffTime);
        return batchGenerateDescriptions(places, district, retryCount + 1);
      }
      console.warn('[BatchDesc] Rate limit exceeded, using fallback descriptions');
      return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
    }

    if (!response.ok) {
      console.warn('[BatchDesc] API failed, using fallback descriptions');
      return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as { id: number; description: string }[];
    const resultMap = new Map<string, string>();
    
    for (const item of parsed) {
      const place = places[item.id - 1];
      if (place) {
        resultMap.set(place.name, item.description?.trim() || `探索${district}的特色景點`);
      }
    }
    
    for (const p of places) {
      if (!resultMap.has(p.name)) {
        resultMap.set(p.name, `探索${district}的特色景點`);
      }
    }
    
    return resultMap;
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      console.log(`[BatchDesc] 網路錯誤，等待 ${backoffTime / 1000} 秒後重試...`);
      await sleep(backoffTime);
      return batchGenerateDescriptions(places, district, retryCount + 1);
    }
    console.warn('[BatchDesc] Error, using fallback:', e.message);
    return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
  }
}

// 八大種類常量
const EIGHT_CATEGORIES = ['美食', '住宿', '生態文化教育', '遊程體驗', '娛樂設施', '活動', '景點', '購物'];

// ============ 批次生成描述 + 分類判斷 ============
export interface PlaceClassification {
  description: string;
  category: string;
  subcategory: string;
}

export async function batchGenerateWithClassification(
  places: { name: string; address: string; types: string[] }[],
  city: string,
  retryCount = 0
): Promise<Map<string, PlaceClassification>> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  const defaultResult = (name: string) => ({
    description: `探索${city}的特色景點`,
    category: '景點',
    subcategory: 'attraction'
  });
  
  if (!baseUrl || !apiKey) {
    return new Map(places.map(p => [p.name, defaultResult(p.name)]));
  }

  const placesJson = places.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    address: p.address,
    types: p.types?.join(', ') || ''
  }));

  const prompt = `你是旅遊分類專家。請為以下 ${places.length} 個地點：
1. 寫一段 30-50 字的吸引人描述
2. 判斷屬於哪個種類（只能從八大種類選擇）
3. 判斷適合的子分類名稱

【八大種類】
${EIGHT_CATEGORIES.join('、')}

【地點列表】
${JSON.stringify(placesJson, null, 2)}

【回傳格式】
[
  { "id": 1, "description": "描述文字", "category": "美食", "subcategory": "咖啡廳" },
  { "id": 2, "description": "描述文字", "category": "景點", "subcategory": "自然風景" }
]

【要求】
1. category 必須是八大種類之一
2. subcategory 用中文，簡潔 2-6 字（如：咖啡廳、日式料理、溫泉旅館、文化古蹟）
3. 只回傳 JSON Array，不要其他文字`;

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
          temperature: 0.5,
          maxOutputTokens: 4096,
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 5000;
        console.log(`[BatchClassify] 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試...`);
        await sleep(backoffTime);
        return batchGenerateWithClassification(places, city, retryCount + 1);
      }
      return new Map(places.map(p => [p.name, defaultResult(p.name)]));
    }

    if (!response.ok) {
      return new Map(places.map(p => [p.name, defaultResult(p.name)]));
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Map(places.map(p => [p.name, defaultResult(p.name)]));
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as { 
      id: number; 
      description: string; 
      category: string; 
      subcategory: string 
    }[];
    
    const resultMap = new Map<string, PlaceClassification>();
    
    for (const item of parsed) {
      const place = places[item.id - 1];
      if (place) {
        // 驗證 category 必須在八大種類內
        const validCategory = EIGHT_CATEGORIES.includes(item.category) ? item.category : '景點';
        resultMap.set(place.name, {
          description: item.description?.trim() || `探索${city}的特色景點`,
          category: validCategory,
          subcategory: item.subcategory?.trim() || 'attraction'
        });
      }
    }
    
    // 補充缺失的地點
    for (const p of places) {
      if (!resultMap.has(p.name)) {
        resultMap.set(p.name, defaultResult(p.name));
      }
    }
    
    return resultMap;
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      await sleep(backoffTime);
      return batchGenerateWithClassification(places, city, retryCount + 1);
    }
    return new Map(places.map(p => [p.name, defaultResult(p.name)]));
  }
}

// ============ AI 關鍵字擴散 ============
export async function expandKeywords(
  baseKeyword: string,
  district: string,
  city: string,
  count: number = 8
): Promise<string[]> {
  const prompt = `你是台灣旅遊專家。請根據以下條件，生成 ${count} 組精準的搜尋關鍵字：

地區：${city}${district}
基礎關鍵字：${baseKeyword}

要求：
1. 每個關鍵字都要具體、可搜尋到實際店家或景點
2. 涵蓋不同面向（例如：類型、特色、時段）
3. 不要重複基礎關鍵字
4. 只輸出關鍵字，不要加地區名稱

範例輸入：美食
範例輸出：
小吃
甜點
咖啡廳
海鮮餐廳
夜市美食
早午餐
日式料理
牛排

請直接輸出 ${count} 個關鍵字，每行一個，不要編號：`;

  try {
    const response = await callGemini(prompt);
    const keywords = response
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0 && k.length < 20)
      .slice(0, count);
    
    // 確保至少有基礎關鍵字
    if (keywords.length === 0) {
      return [baseKeyword];
    }
    
    return keywords;
  } catch (error) {
    console.error('[KeywordExpansion] AI error, using base keyword:', error);
    return [baseKeyword];
  }
}

// ============ 地點有效性檢查 ============
function isPlaceValid(place: any): boolean {
  if (place.business_status && EXCLUDED_BUSINESS_STATUS.includes(place.business_status)) {
    return false;
  }
  
  if (place.types && place.types.some((t: string) => EXCLUDED_PLACE_TYPES.includes(t))) {
    return false;
  }
  
  if (place.name && GENERIC_NAME_PATTERNS.some(pattern => place.name.includes(pattern))) {
    return false;
  }
  
  return true;
}

// ============ 單一關鍵字分頁搜尋（最多 3 頁） ============
async function searchWithPagination(
  keyword: string,
  district: string,
  city: string,
  maxPages: number = 3,
  placeType?: string // 可選的類型過濾
): Promise<{ places: PlaceResult[]; pageCount: number; rawCount: number; filteredCount: number }> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("[PlaceGenerator] Google Maps API key not configured");
    return { places: [], pageCount: 0, rawCount: 0, filteredCount: 0 };
  }

  const allPlaces: PlaceResult[] = [];
  let pageToken: string | null = null;
  let pageCount = 0;
  let rawCount = 0;
  let filteredCount = 0;

  for (let page = 0; page < maxPages; page++) {
    try {
      // 建構搜尋 URL
      const searchQuery = encodeURIComponent(`${keyword} ${district} ${city}`);
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
      
      // 加入類型過濾（白名單）
      // 注意：Text Search 的 type 參數只支援單一類型
      if (placeType && INCLUDED_TYPES.includes(placeType)) {
        url += `&type=${placeType}`;
      }
      
      // 加入分頁 token
      if (pageToken) {
        url += `&pagetoken=${pageToken}`;
        // Google 要求分頁請求間隔 2 秒
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.warn(`[PlaceGenerator] API status: ${data.status}`, data.error_message);
        break;
      }

      pageCount++;
      const results = data.results || [];
      rawCount += results.length;
      
      // 處理每筆結果
      for (const place of results) {
        // 白名單檢查：確保至少有一個類型在白名單中
        const hasWhitelistedType = place.types?.some((t: string) => INCLUDED_TYPES.includes(t));
        if (!hasWhitelistedType) {
          filteredCount++;
          continue;
        }

        // 黑名單過濾
        if (!isPlaceValid(place)) {
          filteredCount++;
          continue;
        }

        // 提取 primaryType
        const genericTypes = ['point_of_interest', 'establishment', 'premise', 'political', 'locality', 'sublocality'];
        const primaryType = place.types?.find((t: string) => !genericTypes.includes(t)) || null;

        allPlaces.push({
          placeId: place.place_id,
          name: place.name,
          address: place.formatted_address || '',
          location: place.geometry?.location || null,
          rating: place.rating || null,
          reviewCount: place.user_ratings_total || null,
          types: place.types || [],
          primaryType,
          businessStatus: place.business_status || null
        });
      }

      // 檢查是否有下一頁
      pageToken = data.next_page_token || null;
      if (!pageToken) {
        break;
      }
    } catch (error) {
      console.error(`[PlaceGenerator] Search error on page ${page + 1}:`, error);
      break;
    }
  }

  return { places: allPlaces, pageCount, rawCount, filteredCount };
}

// ============ 批次生成主函式 ============
export async function batchGeneratePlaces(
  baseKeyword: string,
  district: string,
  city: string,
  options: {
    maxKeywords?: number;
    maxPagesPerKeyword?: number;
    enableAIExpansion?: boolean;
  } = {}
): Promise<BatchGenerateResult> {
  const {
    maxKeywords = 8,
    maxPagesPerKeyword = 3,
    enableAIExpansion = true
  } = options;

  console.log(`[BatchGenerate] Starting: "${baseKeyword}" in ${city}${district}`);
  console.log(`[BatchGenerate] Options: maxKeywords=${maxKeywords}, maxPages=${maxPagesPerKeyword}, AI=${enableAIExpansion}`);

  // Step 1: AI 關鍵字擴散
  let keywords: string[];
  if (enableAIExpansion) {
    console.log('[BatchGenerate] Expanding keywords with AI...');
    keywords = await expandKeywords(baseKeyword, district, city, maxKeywords);
    // 加入原始關鍵字
    if (!keywords.includes(baseKeyword)) {
      keywords.unshift(baseKeyword);
    }
  } else {
    keywords = [baseKeyword];
  }
  console.log('[BatchGenerate] Keywords:', keywords);

  // Step 2: 並行搜尋所有關鍵字
  const searchPromises = keywords.map(kw => searchWithPagination(kw, district, city, maxPagesPerKeyword));
  const searchResults = await Promise.all(searchPromises);

  // 統計
  let totalRaw = 0;
  let totalFiltered = 0;
  let totalAfterFilter = 0;
  const pagesPerKeyword: number[] = [];
  const allPlaces: PlaceResult[] = [];

  for (let i = 0; i < searchResults.length; i++) {
    const { places, pageCount, rawCount, filteredCount } = searchResults[i];
    totalRaw += rawCount;
    totalFiltered += filteredCount;
    totalAfterFilter += places.length;
    pagesPerKeyword.push(pageCount);
    allPlaces.push(...places);
    console.log(`[BatchGenerate] Keyword "${keywords[i]}": ${rawCount} raw → ${places.length} valid (${pageCount} pages, ${filteredCount} filtered)`);
  }

  // Step 3: 使用 place_id 去重
  const seenIds = new Set<string>();
  const uniquePlaces: PlaceResult[] = [];
  
  for (const place of allPlaces) {
    if (!seenIds.has(place.placeId)) {
      seenIds.add(place.placeId);
      uniquePlaces.push(place);
    }
  }

  console.log(`[BatchGenerate] Complete: ${totalRaw} raw → ${totalAfterFilter} filtered → ${uniquePlaces.length} unique`);

  return {
    places: uniquePlaces,
    stats: {
      totalFetched: totalRaw,
      afterTypeFilter: totalAfterFilter,
      afterNameFilter: totalAfterFilter,
      afterDedup: uniquePlaces.length,
      keywords,
      pagesPerKeyword
    }
  };
}

// ============ 單一地點搜尋（用於驗證） ============
export async function searchSinglePlace(
  placeName: string,
  district: string,
  city: string
): Promise<PlaceResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const searchQuery = encodeURIComponent(`${placeName} ${district} ${city}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results?.length > 0) {
      const place = data.results[0];
      
      if (!isPlaceValid(place)) {
        return null;
      }

      const genericTypes = ['point_of_interest', 'establishment', 'premise', 'political', 'locality', 'sublocality'];
      const primaryType = place.types?.find((t: string) => !genericTypes.includes(t)) || null;

      return {
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address || '',
        location: place.geometry?.location || null,
        rating: place.rating || null,
        reviewCount: place.user_ratings_total || null,
        types: place.types || [],
        primaryType,
        businessStatus: place.business_status || null
      };
    }
    
    return null;
  } catch (error) {
    console.error("[PlaceGenerator] Single search error:", error);
    return null;
  }
}

// ============ 多語系類型定義 ============
export interface I18nText {
  en?: string;
  ja?: string;
  ko?: string;
}

// ============ 新版：規則映射分類 + AI 只生成描述 ============
export interface PlaceWithClassification {
  name: string;
  nameI18n?: I18nText;
  category: MibuCategory;
  subcategory: string;
  description: string;
  descriptionI18n?: I18nText;
  descriptionSource: 'ai' | 'fallback';
}

/**
 * AI 專注生成描述（不做分類）
 */
export async function batchGenerateDescriptionsOnly(
  places: { name: string; category: string; subcategory: string }[],
  city: string,
  retryCount = 0
): Promise<Map<string, string>> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  if (!baseUrl || !apiKey) {
    console.warn('[DescOnly] AI not configured, will use fallback');
    return new Map();
  }

  const placesJson = places.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory
  }));

  const prompt = `你是旅遊文案專家。請為以下 ${places.length} 個地點各寫一段 30-50 字的吸引人描述。

【地點列表】
${JSON.stringify(placesJson, null, 2)}

【要求】
1. 描述要突出地點特色，吸引遊客前往
2. 簡潔有力，30-50 字
3. 根據 category 和 subcategory 調整語氣
4. 只回傳 JSON Array

【回傳格式】
[
  { "id": 1, "description": "描述文字" },
  { "id": 2, "description": "描述文字" }
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
          temperature: 0.7,
          maxOutputTokens: 4096,
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 5000;
        console.log(`[DescOnly] 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試...`);
        await sleep(backoffTime);
        return batchGenerateDescriptionsOnly(places, city, retryCount + 1);
      }
      console.warn('[DescOnly] Rate limit exceeded, returning empty map');
      return new Map();
    }

    if (!response.ok) {
      console.warn('[DescOnly] API failed:', response.status);
      return new Map();
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[DescOnly] Failed to parse JSON from response');
      return new Map();
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as { id: number; description: string }[];
    const resultMap = new Map<string, string>();
    
    for (const item of parsed) {
      const place = places[item.id - 1];
      if (place && item.description?.trim()) {
        resultMap.set(place.name, item.description.trim());
      }
    }
    
    console.log(`[DescOnly] Generated ${resultMap.size}/${places.length} descriptions via AI`);
    return resultMap;
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      await sleep(backoffTime);
      return batchGenerateDescriptionsOnly(places, city, retryCount + 1);
    }
    console.warn('[DescOnly] Error:', e.message);
    return new Map();
  }
}

/**
 * AI 批次生成多語系描述（繁中 + 英 + 日 + 韓）
 * 一次 API 呼叫生成所有語言，節省成本
 */
export async function batchGenerateDescriptionsI18n(
  places: { name: string; category: string; subcategory: string }[],
  city: string,
  retryCount = 0
): Promise<Map<string, { zhTw: string; en: string; ja: string; ko: string }>> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  if (!baseUrl || !apiKey) {
    console.warn('[DescI18n] AI not configured, will use fallback');
    return new Map();
  }

  const placesJson = places.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory
  }));

  const prompt = `你是多語系旅遊文案專家。請為以下 ${places.length} 個地點各寫 4 種語言版本的描述（繁體中文、English、日本語、한국어）。

【地點列表】
${JSON.stringify(placesJson, null, 2)}

【要求】
1. 每個描述 30-50 字，突出地點特色
2. 各語言版本風格要符合當地文化習慣
3. 只回傳 JSON Array

【回傳格式】
[
  { "id": 1, "zhTw": "繁中描述", "en": "English description", "ja": "日本語説明", "ko": "한국어 설명" },
  { "id": 2, "zhTw": "繁中描述", "en": "English description", "ja": "日本語説明", "ko": "한국어 설명" }
]

只回傳 JSON Array，不要其他文字。`;

  try {
    const response = await fetch(`${baseUrl}/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
      })
    });

    if (response.status === 429 && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      console.log(`[DescI18n] Rate limited, waiting ${backoffTime}ms...`);
      await sleep(backoffTime);
      return batchGenerateDescriptionsI18n(places, city, retryCount + 1);
    }

    if (!response.ok) {
      console.warn('[DescI18n] API failed:', response.status);
      return new Map();
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[DescI18n] Failed to parse JSON from response');
      return new Map();
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as { 
      id: number; 
      zhTw: string; 
      en: string; 
      ja: string; 
      ko: string 
    }[];
    const resultMap = new Map<string, { zhTw: string; en: string; ja: string; ko: string }>();
    
    for (const item of parsed) {
      const place = places[item.id - 1];
      if (place && item.zhTw?.trim()) {
        resultMap.set(place.name, {
          zhTw: item.zhTw.trim(),
          en: item.en?.trim() || '',
          ja: item.ja?.trim() || '',
          ko: item.ko?.trim() || ''
        });
      }
    }
    
    console.log(`[DescI18n] Generated ${resultMap.size}/${places.length} i18n descriptions via AI`);
    return resultMap;
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      await sleep(backoffTime);
      return batchGenerateDescriptionsI18n(places, city, retryCount + 1);
    }
    console.warn('[DescI18n] Error:', e.message);
    return new Map();
  }
}

/**
 * 整合函數：規則映射分類 + AI 生成多語系描述 + 智能 fallback
 */
export async function classifyAndDescribePlaces(
  places: PlaceResult[],
  city: string,
  enableI18n = true
): Promise<Map<string, PlaceWithClassification>> {
  const resultMap = new Map<string, PlaceWithClassification>();
  
  // Step 1: 先用規則映射分類所有地點
  const classifiedPlaces = places.map(p => {
    const { category, subcategory, fallbackDescription } = classifyPlace(
      p.name,
      city,
      p.primaryType,
      p.types
    );
    return {
      name: p.name,
      category,
      subcategory,
      fallbackDescription
    };
  });
  
  console.log(`[Classify] 規則映射分類完成: ${classifiedPlaces.length} 個地點`);

  // Step 2: AI 批次生成描述（多語系或單語）
  if (enableI18n) {
    const aiDescriptionsI18n = await batchGenerateDescriptionsI18n(
      classifiedPlaces.map(p => ({ name: p.name, category: p.category, subcategory: p.subcategory })),
      city
    );

    // Step 3: 組合結果（AI 成功用 AI，失敗用 fallback）
    for (const p of classifiedPlaces) {
      const aiDesc = aiDescriptionsI18n.get(p.name);
      resultMap.set(p.name, {
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        description: aiDesc?.zhTw || p.fallbackDescription,
        descriptionI18n: aiDesc ? { en: aiDesc.en, ja: aiDesc.ja, ko: aiDesc.ko } : undefined,
        descriptionSource: aiDesc ? 'ai' : 'fallback'
      });
    }
  } else {
    // 舊版單語模式（向後相容）
    const aiDescriptions = await batchGenerateDescriptionsOnly(
      classifiedPlaces.map(p => ({ name: p.name, category: p.category, subcategory: p.subcategory })),
      city
    );

    for (const p of classifiedPlaces) {
      const aiDesc = aiDescriptions.get(p.name);
      resultMap.set(p.name, {
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        description: aiDesc || p.fallbackDescription,
        descriptionSource: aiDesc ? 'ai' : 'fallback'
      });
    }
  }

  const aiCount = Array.from(resultMap.values()).filter(v => v.descriptionSource === 'ai').length;
  console.log(`[Classify] 完成: AI 描述 ${aiCount}/${resultMap.size}，Fallback ${resultMap.size - aiCount}/${resultMap.size}`);

  return resultMap;
}

/**
 * 重新分類現有資料（用於修復舊資料）
 */
export function reclassifyPlace(
  name: string,
  city: string,
  primaryType: string | null,
  googleTypes: string[],
  currentDescription: string
): PlaceWithClassification {
  const { category, subcategory, fallbackDescription } = classifyPlace(
    name,
    city,
    primaryType,
    googleTypes
  );
  
  // 如果現有描述是通用模板，則替換為智能 fallback
  const isGenericDescription = 
    currentDescription.includes('探索') && currentDescription.includes('的特色景點');
  
  return {
    name,
    category,
    subcategory,
    description: isGenericDescription ? fallbackDescription : currentDescription,
    descriptionSource: isGenericDescription ? 'fallback' : 'ai'
  };
}

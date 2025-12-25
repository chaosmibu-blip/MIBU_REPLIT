/**
 * Place Generator - 地點批次採集模組
 * 
 * 功能：
 * 1. 分頁採集 (Pagination) - 最多 3 頁，每頁 20 筆
 * 2. AI 關鍵字擴散 - 用 Gemini 生成子關鍵字
 * 3. 白名單過濾 - 使用 includedType 參數
 * 4. 黑名單過濾 - 排除非旅遊地點
 * 5. place_id 去重
 */

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

// ============ Gemini AI 呼叫 ============
export async function callGemini(prompt: string): Promise<string> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini API not configured");
  }

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

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", errorText);
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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

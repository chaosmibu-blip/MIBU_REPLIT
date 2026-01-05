/**
 * Place Generator - Place Generation and Search Functions
 */

import { classifyPlace, type MibuCategory } from '../categoryMapping';
import {
  INCLUDED_TYPES,
  EXCLUDED_PLACE_TYPES,
  EXCLUDED_BUSINESS_STATUS,
  GENERIC_NAME_PATTERNS,
  PlaceResult,
  BatchGenerateResult,
  PlaceWithClassification,
} from './constants';
import {
  expandKeywords,
  batchGenerateDescriptionsOnly,
  batchGenerateDescriptionsI18n,
} from './gemini';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

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
  placeType?: string
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
      const searchQuery = encodeURIComponent(`${keyword} ${district} ${city}`);
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
      
      if (placeType && INCLUDED_TYPES.includes(placeType)) {
        url += `&type=${placeType}`;
      }
      
      if (pageToken) {
        url += `&pagetoken=${pageToken}`;
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
      
      for (const place of results) {
        const hasWhitelistedType = place.types?.some((t: string) => INCLUDED_TYPES.includes(t));
        if (!hasWhitelistedType) {
          filteredCount++;
          continue;
        }

        if (!isPlaceValid(place)) {
          filteredCount++;
          continue;
        }

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

  let keywords: string[];
  if (enableAIExpansion) {
    console.log('[BatchGenerate] Expanding keywords with AI...');
    keywords = await expandKeywords(baseKeyword, district, city, maxKeywords);
    if (!keywords.includes(baseKeyword)) {
      keywords.unshift(baseKeyword);
    }
  } else {
    keywords = [baseKeyword];
  }
  console.log('[BatchGenerate] Keywords:', keywords);

  const searchPromises = keywords.map(kw => searchWithPagination(kw, district, city, maxPagesPerKeyword));
  const searchResults = await Promise.all(searchPromises);

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

// ============ 整合函數：規則映射分類 + AI 生成多語系描述 + 智能 fallback ============
export async function classifyAndDescribePlaces(
  places: PlaceResult[],
  city: string,
  enableI18n = true
): Promise<Map<string, PlaceWithClassification>> {
  const resultMap = new Map<string, PlaceWithClassification>();
  
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

  if (enableI18n) {
    const aiDescriptionsI18n = await batchGenerateDescriptionsI18n(
      classifiedPlaces.map(p => ({ name: p.name, category: p.category, subcategory: p.subcategory })),
      city
    );

    for (const p of classifiedPlaces) {
      const aiDesc = aiDescriptionsI18n.get(p.name);
      resultMap.set(p.name, {
        name: p.name,
        category: p.category as MibuCategory,
        subcategory: p.subcategory,
        description: aiDesc?.zhTw || p.fallbackDescription,
        descriptionI18n: aiDesc ? { en: aiDesc.en, ja: aiDesc.ja, ko: aiDesc.ko } : undefined,
        descriptionSource: aiDesc ? 'ai' : 'fallback'
      });
    }
  } else {
    const aiDescriptions = await batchGenerateDescriptionsOnly(
      classifiedPlaces.map(p => ({ name: p.name, category: p.category, subcategory: p.subcategory })),
      city
    );

    for (const p of classifiedPlaces) {
      const aiDesc = aiDescriptions.get(p.name);
      resultMap.set(p.name, {
        name: p.name,
        category: p.category as MibuCategory,
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

// ============ 重新分類現有資料（用於修復舊資料） ============
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

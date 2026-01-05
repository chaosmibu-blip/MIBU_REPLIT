import { Router, Request, Response } from "express";
import { z } from "zod";
import * as crypto from "crypto";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { gachaRateLimiter } from "../middleware/rateLimit";
import { ErrorCode, createErrorResponse } from "@shared/errors";
import { GACHA_DEDUP_LIMIT, guestSessionDedup, cleanupGuestSessions } from "../lib/utils/gacha";
import { 
  searchPlaceInDistrict, 
  getDistrictBoundary, 
  isPlaceValid, 
  type PlaceSearchResult 
} from "../lib/utils/google-places";
import { callGemini } from "../lib/placeGenerator";
import { inferTimeSlot, sortPlacesByTimeSlot, type TimeSlot } from "../lib/timeSlotInferrer";

const router = Router();

const RECUR_API_URL = "https://api.recur.tw/v1";
const RECUR_PREMIUM_PLAN_ID = "adkwbl9dya0wc6b53parl9yk";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function isWithinRadius(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number },
  radiusKm: number
): boolean {
  const R = 6371;
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance <= radiusKm;
}

const CATEGORY_DATA: Record<string, { subCategories: string[]; weight: number; timeSlots: string[] }> = {
  '食': {
    subCategories: ['在地早餐', '早午餐', '午餐', '晚餐', '宵夜', '咖啡廳', '甜點', '小吃', '火鍋', '燒烤'],
    weight: 3,
    timeSlots: ['breakfast', 'lunch', 'dinner', 'tea_time', 'late_night']
  },
  '宿': {
    subCategories: ['飯店', '民宿', '青年旅館', '露營區', '渡假村', '溫泉旅館', '汽車旅館', '膠囊旅館'],
    weight: 1,
    timeSlots: ['overnight']
  },
  '生態文化教育': {
    subCategories: ['博物館', '美術館', '科學館', '歷史古蹟', '文化中心', '圖書館', '紀念館', '展覽館'],
    weight: 2,
    timeSlots: ['morning', 'afternoon']
  },
  '遊程體驗': {
    subCategories: ['導覽行程', '手作體驗', '烹飪課程', '文化體驗', '農場體驗', '茶道體驗', '攝影之旅', '單車遊'],
    weight: 2,
    timeSlots: ['morning', 'afternoon']
  },
  '娛樂設施': {
    subCategories: ['遊樂園', '電影院', 'KTV', '酒吧', '夜店', '桌遊店', '密室逃脫', '電玩中心'],
    weight: 1,
    timeSlots: ['afternoon', 'evening', 'night']
  },
  '活動': {
    subCategories: ['登山健行', '水上活動', '極限運動', '瑜珈課程', '運動賽事', '音樂會', '市集活動', 'SPA按摩'],
    weight: 2,
    timeSlots: ['morning', 'afternoon', 'evening']
  },
  '景點': {
    subCategories: ['自然風景', '地標建築', '公園綠地', '觀景台', '寺廟宗教', '老街', '海灘', '溫泉'],
    weight: 3,
    timeSlots: ['morning', 'afternoon', 'evening']
  },
  '購物': {
    subCategories: ['百貨公司', '購物中心', '傳統市場', '商店街', '特色小店', '伴手禮店', '二手店', '藥妝店'],
    weight: 1,
    timeSlots: ['afternoon', 'evening']
  }
};

const TIME_SLOT_ORDER = ['breakfast', 'morning', 'lunch', 'afternoon', 'tea_time', 'dinner', 'evening', 'night', 'late_night', 'overnight'];

interface SkeletonItem {
  order: number;
  category: string;
  subCategory: string;
  timeSlot: string;
  suggestedTime: string;
  energyLevel: 'high' | 'medium' | 'low';
}

function generateItinerarySkeleton(targetDistrict: string, cardCount: number): {
  targetDistrict: string;
  userRequestCount: number;
  generatedCount: number;
  skeleton: SkeletonItem[];
} {
  const K = Math.min(12, Math.max(5, cardCount));
  
  const lockedDistrict = targetDistrict;
  
  const stayCount = K >= 8 ? 1 : 0;
  let foodMin = 2;
  if (K >= 7 && K <= 8) foodMin = 3;
  if (K >= 9) foodMin = 4;
  
  const skeleton: SkeletonItem[] = [];
  const usedSubCategories = new Set<string>();
  
  function pickSubCategory(category: string): string {
    const subs = CATEGORY_DATA[category].subCategories;
    const available = subs.filter(s => !usedSubCategories.has(`${category}:${s}`));
    if (available.length === 0) {
      return subs[Math.floor(Math.random() * subs.length)];
    }
    const picked = available[Math.floor(Math.random() * available.length)];
    usedSubCategories.add(`${category}:${picked}`);
    return picked;
  }

  const foodTimeSlots = ['breakfast', 'lunch', 'dinner', 'tea_time', 'late_night'];
  let foodSlotIndex = 0;
  for (let i = 0; i < foodMin; i++) {
    skeleton.push({
      order: 0,
      category: '食',
      subCategory: pickSubCategory('食'),
      timeSlot: foodTimeSlots[foodSlotIndex % foodTimeSlots.length],
      suggestedTime: '',
      energyLevel: 'low'
    });
    foodSlotIndex++;
  }

  if (stayCount > 0) {
    skeleton.push({
      order: 0,
      category: '宿',
      subCategory: pickSubCategory('宿'),
      timeSlot: 'overnight',
      suggestedTime: '22:00',
      energyLevel: 'low'
    });
  }

  const remainingSlots = K - skeleton.length;
  const fillableCategories = ['生態文化教育', '遊程體驗', '娛樂設施', '活動', '景點', '購物'];
  const weights = fillableCategories.map(c => CATEGORY_DATA[c].weight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let lastActivityCount = 0;
  const activityCategories = ['生態文化教育', '遊程體驗', '活動', '景點'];

  for (let i = 0; i < remainingSlots; i++) {
    let selectedCategory: string;
    
    if (lastActivityCount >= 2) {
      const restCategories = ['食', '購物'];
      selectedCategory = restCategories[Math.floor(Math.random() * restCategories.length)];
      lastActivityCount = 0;
    } else {
      const rand = Math.random() * totalWeight;
      let cumulative = 0;
      selectedCategory = fillableCategories[0];
      for (let j = 0; j < fillableCategories.length; j++) {
        cumulative += weights[j];
        if (rand < cumulative) {
          selectedCategory = fillableCategories[j];
          break;
        }
      }
    }

    if (activityCategories.includes(selectedCategory)) {
      lastActivityCount++;
    } else {
      lastActivityCount = 0;
    }

    const validSlots = CATEGORY_DATA[selectedCategory].timeSlots;
    const timeSlot = validSlots[Math.floor(Math.random() * validSlots.length)];

    let energyLevel: 'high' | 'medium' | 'low' = 'medium';
    if (['活動', '遊程體驗'].includes(selectedCategory)) {
      energyLevel = 'high';
    } else if (['食', '購物', '宿'].includes(selectedCategory)) {
      energyLevel = 'low';
    }

    skeleton.push({
      order: 0,
      category: selectedCategory,
      subCategory: pickSubCategory(selectedCategory),
      timeSlot: timeSlot,
      suggestedTime: '',
      energyLevel: energyLevel
    });
  }

  skeleton.sort((a, b) => {
    const aIdx = TIME_SLOT_ORDER.indexOf(a.timeSlot);
    const bIdx = TIME_SLOT_ORDER.indexOf(b.timeSlot);
    return aIdx - bIdx;
  });

  const timeMap: Record<string, string> = {
    'breakfast': '08:00',
    'morning': '10:00',
    'lunch': '12:30',
    'afternoon': '14:30',
    'tea_time': '16:00',
    'dinner': '18:30',
    'evening': '20:00',
    'night': '21:30',
    'late_night': '22:30',
    'overnight': '23:00'
  };

  skeleton.forEach((item, idx) => {
    item.order = idx + 1;
    item.suggestedTime = timeMap[item.timeSlot] || '12:00';
  });

  return {
    targetDistrict: lockedDistrict,
    userRequestCount: cardCount,
    generatedCount: skeleton.length,
    skeleton: skeleton
  };
}

async function generatePlaceForSubcategory(
  districtNameZh: string,
  regionNameZh: string,
  countryNameZh: string,
  category: any,
  subcategory: any,
  language: string,
  excludePlaceNames: string[] = []
): Promise<{
  category: any;
  subcategory: any;
  place: any;
  source: 'cache' | 'ai';
  isVerified: boolean;
} | null> {
  const subcategoryNameZh = subcategory.nameZh;
  const categoryNameZh = category.nameZh;

  const cachedPlace = await storage.getCachedPlace(
    subcategoryNameZh,
    districtNameZh,
    regionNameZh,
    countryNameZh
  );

  if (cachedPlace && !excludePlaceNames.includes(cachedPlace.placeName)) {
    return {
      category,
      subcategory,
      place: {
        name: cachedPlace.placeName,
        description: cachedPlace.description,
        address: cachedPlace.verifiedAddress,
        placeId: cachedPlace.placeId,
        rating: cachedPlace.googleRating,
        googleTypes: cachedPlace.googleTypes?.split(',').filter(Boolean) || [],
        primaryType: cachedPlace.primaryType || null,
        location: cachedPlace.locationLat && cachedPlace.locationLng ? {
          lat: parseFloat(cachedPlace.locationLat),
          lng: parseFloat(cachedPlace.locationLng)
        } : null
      },
      source: 'cache',
      isVerified: cachedPlace.isLocationVerified || false
    };
  }

  return {
    category,
    subcategory,
    place: {
      name: `${districtNameZh}${categoryNameZh}探索`,
      description: `探索${regionNameZh}${districtNameZh}的${subcategoryNameZh}特色。`,
      address: null,
      placeId: null,
      rating: null,
      location: null,
      warning: `該區域目前較少此類型店家`
    },
    source: 'cache',
    isVerified: false
  };
}

router.post("/generate-itinerary", async (req, res) => {
  console.log('[generate-itinerary] API called with:', req.body);
  try {
    const { regionId, countryId, level, language, collectedNames } = req.body;
    
    if (!regionId && !countryId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_LOCATION_ID));
    }
    
    let district;
    if (regionId) {
      district = await storage.getRandomDistrictByRegion(regionId);
    } else {
      district = await storage.getRandomDistrictByCountry(countryId);
    }
    
    if (!district) {
      return res.status(404).json(createErrorResponse(ErrorCode.NO_DISTRICT_FOUND));
    }
    
    const hierarchy = await storage.getDistrictWithParents(district.id);
    if (!hierarchy) {
      return res.status(500).json({ error: "Failed to get location hierarchy" });
    }
    
    const { district: districtInfo, region, country: countryInfo } = hierarchy;
    const targetDistrict = districtInfo.nameZh;
    const city = region.nameZh;
    const country = countryInfo.nameZh;
    
    console.log('[generate-itinerary] Resolved location:', { targetDistrict, city, country, districtId: district.id });
    
    const langMap: Record<string, string> = {
      'zh-TW': '繁體中文',
      'en': 'English',
      'ja': '日本語',
      'ko': '한국어'
    };
    const outputLang = langMap[language] || 'English';
    
    const itemCount = Math.min(12, Math.max(5, Math.floor(level * 1.2)));
    
    const skeletonResult = generateItinerarySkeleton(targetDistrict, itemCount);
    const { skeleton } = skeletonResult;

    const categoryMap: Record<string, string> = {
      '食': 'Food', '宿': 'Stay', '生態文化教育': 'Education',
      '遊程體驗': 'Activity', '娛樂設施': 'Entertainment',
      '活動': 'Activity', '景點': 'Scenery', '購物': 'Shopping'
    };

    const cachedPlaces = await storage.getCachedPlaces(targetDistrict, city, country);
    const cacheMap = new Map(cachedPlaces.map(p => [p.subCategory, p]));
    
    const usedPlaceNamesInPull: Set<string> = new Set(collectedNames || []);
    const cachedItems: any[] = [];
    const uncachedSkeleton: Array<typeof skeleton[0] & { originalIdx: number }> = [];
    
    skeleton.forEach((item, idx) => {
      const cached = cacheMap.get(item.subCategory);
      if (cached && !usedPlaceNamesInPull.has(cached.placeName)) {
        cachedItems.push({
          skeletonIdx: idx,
          cached: cached,
          skeleton: item
        });
        usedPlaceNamesInPull.add(cached.placeName);
      } else {
        uncachedSkeleton.push({ ...item, originalIdx: idx });
      }
    });

    console.log(`Cache hit: ${cachedItems.length}/${skeleton.length} items from cache`);

    let aiGeneratedItems: any[] = [];

    if (uncachedSkeleton.length > 0) {
      const skeletonInstructions = uncachedSkeleton.map((item, idx) => 
        `${idx + 1}. [${item.timeSlot}] ${categoryMap[item.category] || item.category} - ${item.subCategory} (${item.suggestedTime}, energy: ${item.energyLevel})`
      ).join('\n');

      const prompt = `You are a professional travel planner AI. Fill in REAL place names for this itinerary skeleton in ${city}, ${country}.

【目標區域 Target District】
All places MUST be in or near "${targetDistrict}" district.

【行程骨架 Itinerary Skeleton - FOLLOW THIS EXACTLY】
${skeletonInstructions}

【重要規則 CRITICAL RULES】
1. place_name 必須是「真實存在的店家名稱」，例如：
   - 正確: "阿嬌熱炒"、"蘭姐鴨肉飯"、"石碇老街"、"功維敘隧道"
   - 錯誤: "壯圍鄉景點探索"、"南澳鄉食探索"、"XX鄉購物探索"
2. 絕對禁止使用「地區名+類別+探索」格式的假名稱
3. 如果該區域確實沒有符合類別的店家，請推薦鄰近區域的真實店家
4. place_name 必須可以在 Google Maps 搜尋到

【動線順暢原則 Route Flow】
- 推薦鄰近區域的店家時，優先選擇「相鄰區域」而非遠方區域
- 考慮時間順序：早上的地點、中午的地點、下午的地點應該在合理的移動範圍內
- 避免讓使用者來回奔波，地點之間的移動距離應控制在 30 分鐘車程以內
- 如果必須跨區，請選擇同一方向上的區域

【任務說明 Your Task】
For each skeleton slot, find a REAL business/location in or near ${targetDistrict}:
- Must be an actual restaurant, shop, attraction, or business with a real name
- Can be searched and found on Google Maps
- If no matching place in ${targetDistrict}, suggest one from a nearby district (prefer adjacent areas)
- Ensure route flow is smooth - places should be geographically close to minimize travel time

【排除清單 Exclusions】
Do NOT include: ${usedPlaceNamesInPull.size > 0 ? Array.from(usedPlaceNamesInPull).join(', ') : 'none'}

Output language: ${outputLang}
Output ONLY valid JSON array, no markdown, no explanation:

[
${uncachedSkeleton.map((item, idx) => `  {
    "place_name": "真實店家名稱",
    "description": "2-3句描述這個地點的特色",
    "category": "${categoryMap[item.category] || item.category}",
    "sub_category": "${item.subCategory}",
    "suggested_time": "${item.suggestedTime}",
    "duration": "1-2 hours",
    "time_slot": "${item.timeSlot}",
    "search_query": "店家名稱 ${city}",
    "color_hex": "#6366f1",
    "energy_level": "${item.energyLevel}"
  }`).join(',\n')}
]`;

      const responseText = await callGemini(prompt);
      let jsonText = responseText || '';
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiGeneratedItems = JSON.parse(jsonText);
      
      const invalidPatterns = [
        /探索$/,
        /^.{2,4}(鄉|區|市|鎮|村).{2,6}探索$/,
        /^.{2,4}(鄉|區|市|鎮|村).{2,4}(美食|購物|景點|住宿|體驗)$/,
        /真實店家名稱/,
        /^REAL place/i,
      ];
      
      aiGeneratedItems = aiGeneratedItems.map((item: any, idx: number) => {
        const isInvalid = invalidPatterns.some(pattern => pattern.test(item.place_name));
        if (isInvalid) {
          console.log(`[AI Validation] Rejected invalid place_name: "${item.place_name}"`);
          return {
            ...item,
            place_name: `[待審核] ${targetDistrict}${item.sub_category}推薦`,
            description: `此地點需要人工確認，AI 無法找到符合條件的真實店家。原始分類：${item.sub_category}`,
            needs_review: true
          };
        }
        return item;
      });
    }

    const districtCenter = await getDistrictBoundary(targetDistrict, city, country);
    const finalInventory: any[] = new Array(skeleton.length);

    for (const { skeletonIdx, cached, skeleton: skelItem } of cachedItems) {
      const cachedLocation = cached.locationLat && cached.locationLng 
        ? { lat: parseFloat(cached.locationLat), lng: parseFloat(cached.locationLng) }
        : null;
      
      const categoryZhMapCached: Record<string, string> = {
        'Food': '美食', 'Stay': '住宿', 'Education': '生態文化教育',
        'Activity': '遊程體驗', 'Entertainment': '娛樂設施', 'Scenery': '景點', 'Shopping': '購物'
      };
      finalInventory[skeletonIdx] = {
        id: Date.now() + skeletonIdx,
        placeName: cached.placeName,
        description: cached.description,
        category: categoryZhMapCached[cached.category] || cached.category,
        subCategory: cached.subCategory,
        suggestedTime: skelItem.suggestedTime,
        duration: cached.duration || '1-2 hours',
        timeSlot: skelItem.timeSlot,
        searchQuery: cached.searchQuery,
        colorHex: cached.colorHex || '#6366f1',
        city: city,
        country: country,
        district: targetDistrict,
        energyLevel: skelItem.energyLevel,
        isCoupon: false,
        couponData: null,
        operatingStatus: 'OPEN',
        placeId: cached.placeId || null,
        verifiedName: cached.verifiedName || cached.placeName,
        verifiedAddress: cached.verifiedAddress || null,
        googleRating: cached.googleRating ? Number(cached.googleRating) : null,
        location: cachedLocation,
        isLocationVerified: cached.isLocationVerified === true,
        districtCenter: districtCenter,
        fromCache: true
      };
    }

    const newCacheEntries: any[] = [];
    
    for (let i = 0; i < uncachedSkeleton.length; i++) {
      const skelItem = uncachedSkeleton[i];
      const aiItem = aiGeneratedItems[i];
      const originalIdx = skelItem.originalIdx;

      const placeResult = await searchPlaceInDistrict(
        aiItem.place_name,
        targetDistrict,
        city,
        country
      );

      let isVerified = false;
      let placeLocation: { lat: number; lng: number } | null = null;

      if (placeResult && placeResult.geometry) {
        placeLocation = placeResult.geometry.location;
        if (districtCenter) {
          isVerified = isWithinRadius(districtCenter, placeLocation, 5);
        } else {
          isVerified = true;
        }
      }

      const categoryZhMap: Record<string, string> = {
        'Food': '美食', 'Stay': '住宿', 'Education': '生態文化教育',
        'Activity': '遊程體驗', 'Entertainment': '娛樂設施', 'Scenery': '景點', 'Shopping': '購物'
      };
      const inventoryItem = {
        id: Date.now() + originalIdx,
        placeName: aiItem.place_name,
        description: aiItem.description,
        category: categoryZhMap[aiItem.category] || aiItem.category,
        subCategory: aiItem.sub_category,
        suggestedTime: skelItem.suggestedTime,
        duration: aiItem.duration || '1-2 hours',
        timeSlot: skelItem.timeSlot,
        searchQuery: aiItem.search_query,
        colorHex: aiItem.color_hex || '#6366f1',
        city: city,
        country: country,
        district: targetDistrict,
        energyLevel: skelItem.energyLevel,
        isCoupon: false,
        couponData: null,
        operatingStatus: 'OPEN',
        placeId: placeResult?.place_id || null,
        verifiedName: placeResult?.name || aiItem.place_name,
        verifiedAddress: placeResult?.formatted_address || null,
        googleRating: placeResult?.rating || null,
        location: placeLocation,
        isLocationVerified: isVerified,
        districtCenter: districtCenter,
        fromCache: false
      };

      finalInventory[originalIdx] = inventoryItem;

      newCacheEntries.push({
        subCategory: aiItem.sub_category,
        district: targetDistrict,
        city: city,
        country: country,
        placeName: aiItem.place_name,
        description: aiItem.description,
        category: aiItem.category,
        suggestedTime: skelItem.suggestedTime,
        duration: aiItem.duration || '1-2 hours',
        searchQuery: aiItem.search_query,
        colorHex: aiItem.color_hex || '#6366f1',
        placeId: placeResult?.place_id || null,
        verifiedName: placeResult?.name || null,
        verifiedAddress: placeResult?.formatted_address || null,
        googleRating: placeResult?.rating?.toString() || null,
        locationLat: placeLocation?.lat?.toString() || null,
        locationLng: placeLocation?.lng?.toString() || null,
        isLocationVerified: isVerified
      });
    }

    if (newCacheEntries.length > 0) {
      try {
        const countryNameMap: Record<string, string> = {
          'taiwan': '台灣',
          'japan': '日本',
          'hong_kong': '香港',
        };
        const cityNameMap: Record<string, string> = {
          'taipei': '台北市',
          'new_taipei': '新北市',
          'taoyuan': '桃園市',
          'taichung': '台中市',
          'tainan': '台南市',
          'kaohsiung': '高雄市',
          'keelung': '基隆市',
          'hsinchu_city': '新竹市',
          'chiayi_city': '嘉義市',
          'tokyo': '東京都',
          'osaka': '大阪市',
          'kyoto': '京都市',
          'fukuoka': '福岡市',
          'hong_kong': '香港',
        };
        const categoryNameMap: Record<string, string> = {
          'Food': '食',
          'Stay': '宿',
          'Education': '生態文化教育',
          'Activity': '遊程體驗',
          'Entertainment': '娛樂設施',
          'Scenery': '景點',
          'Shopping': '購物',
        };

        const draftEntries = newCacheEntries.map(entry => ({
          placeName: entry.placeName,
          description: entry.description,
          category: categoryNameMap[entry.category] || entry.category,
          subCategory: entry.subCategory,
          district: entry.district,
          city: cityNameMap[entry.city] || entry.city,
          country: countryNameMap[entry.country] || entry.country,
          googlePlaceId: entry.placeId,
          googleRating: entry.googleRating ? parseFloat(entry.googleRating) : null,
          locationLat: entry.locationLat,
          locationLng: entry.locationLng,
          address: entry.verifiedAddress,
        }));
        const savedDrafts = await storage.saveAIPlacesToDrafts(draftEntries);
        console.log(`Saved ${savedDrafts.length} new AI places to drafts (pending review)`);
      } catch (draftError) {
        console.error('Failed to save to drafts:', draftError);
      }
    }

    const reqAny = req as any;
    const isActuallyAuthenticated = !!(
      (reqAny.user?.claims?.sub && reqAny.session?.userId) ||
      (reqAny.jwtUser?.userId && req.headers.authorization)
    );
    const userId = isActuallyAuthenticated 
      ? (reqAny.user?.claims?.sub || reqAny.jwtUser?.userId) 
      : null;
    let couponsWon: any[] = [];
    
    const enrichedInventory = await Promise.all(finalInventory.map(async (item: any) => {
      if (!item) return item;
      
      try {
        const merchantLink = await storage.getMerchantPlaceLinkByPlaceName(
          item.placeName || item.verifiedName,
          item.district || '',
          item.city
        );
        
        if (merchantLink) {
          item.merchantPromo = {
            merchantId: merchantLink.merchantId,
            isPromoActive: merchantLink.isPromoActive || false,
            promoTitle: merchantLink.promoTitle,
            promoDescription: merchantLink.promoDescription,
            promoImageUrl: merchantLink.promoImageUrl
          };
          
          if (isActuallyAuthenticated && userId && merchantLink.isPromoActive) {
            const isFull = await storage.isInventoryFull(userId);
            if (!isFull) {
              const tier = await storage.rollCouponTier();
              
              if (tier) {
                const merchantCoupons = await storage.getMerchantCouponsByPlaceLink(merchantLink.id);
                const matchingCoupon = merchantCoupons.find(c => c.tier === tier) || merchantCoupons[0];
                
                if (matchingCoupon) {
                  const validUntil = matchingCoupon.validUntil 
                    ? new Date(matchingCoupon.validUntil)
                    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  
                  const inventoryItem = await storage.addToUserInventory({
                    userId,
                    itemType: 'coupon',
                    itemName: matchingCoupon.name,
                    itemDescription: matchingCoupon.content,
                    tier: tier,
                    merchantId: merchantLink.merchantId,
                    merchantCouponId: matchingCoupon.id,
                    terms: matchingCoupon.terms,
                    content: JSON.stringify({
                      placeName: item.placeName,
                      district: item.district,
                      city: item.city,
                      country: item.country,
                      promoTitle: merchantLink.promoTitle
                    }),
                    validUntil,
                  });
                  
                  if (inventoryItem) {
                    item.isCoupon = true;
                    item.couponData = {
                      inventoryId: inventoryItem.id,
                      tier: tier,
                      name: matchingCoupon.name,
                      description: matchingCoupon.content,
                      validUntil: validUntil.toISOString(),
                      slotIndex: inventoryItem.slotIndex
                    };
                    couponsWon.push({
                      tier,
                      placeName: item.placeName,
                      couponName: matchingCoupon.name
                    });
                  }
                }
              }
            }
          }
        }
      } catch (promoError) {
        console.error(`Error enriching place ${item.placeName} with promo:`, promoError);
      }
      
      return item;
    }));

    const data = {
      status: 'success',
      meta: {
        date: new Date().toISOString().split('T')[0],
        country: country,
        city: city,
        lockedDistrict: targetDistrict,
        userLevel: level,
        totalItems: skeleton.length,
        verificationEnabled: !!GOOGLE_MAPS_API_KEY,
        cacheHits: cachedItems.length,
        aiGenerated: uncachedSkeleton.length,
        couponsWon: couponsWon.length
      },
      inventory: enrichedInventory,
      couponsWon: couponsWon
    };

    res.json({ data, sources: [] });
  } catch (error) {
    console.error("Gemini generation error:", error);
    res.status(500).json({ error: "Failed to generate itinerary" });
  }
});

router.post("/checkout/create-session", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const { customerEmail } = req.body;
    
    const secretKey = process.env.RECUR_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({ error: "Payment system not configured" });
    }

    const appUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;

    const response = await fetch(`${RECUR_API_URL}/checkout/sessions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: RECUR_PREMIUM_PLAN_ID,
        mode: "SUBSCRIPTION",
        successUrl: `${appUrl}?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${appUrl}?payment_cancelled=true`,
        customerEmail: customerEmail || undefined,
        metadata: {
          userId: userId,
          plan: "premium"
        }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Recur API error:", data);
      return res.status(response.status).json({ error: data.error || "Checkout failed" });
    }

    res.json({ url: data.url, sessionId: data.id });
  } catch (error) {
    console.error("Create checkout session error:", error);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.get("/checkout/session/:sessionId", isAuthenticated, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const secretKey = process.env.RECUR_SECRET_KEY;
    
    if (!secretKey) {
      return res.status(500).json({ error: "Payment system not configured" });
    }

    const response = await fetch(`${RECUR_API_URL}/checkout/sessions/${sessionId}`, {
      headers: {
        "Authorization": `Bearer ${secretKey}`,
      },
    });

    const session = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: session.error });
    }

    res.json({ session });
  } catch (error) {
    console.error("Fetch checkout session error:", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

router.post("/webhooks/recur", async (req, res) => {
  try {
    const event = req.body;
    console.log("=== Recur Webhook Received ===");
    console.log("Event Type:", event.type);
    console.log("Event Data:", JSON.stringify(event, null, 2));

    switch (event.type) {
      case "checkout.completed": {
        const checkout = event.data;
        const userId = checkout.metadata?.userId;
        
        if (userId) {
          const merchant = await storage.getMerchantByUserId(userId);
          if (merchant) {
            await storage.updateMerchantPlan(merchant.id, "premium");
            console.log(`[checkout.completed] Upgraded merchant ${merchant.id} to premium`);
          }
        }
        break;
      }

      case "subscription.created": {
        const subscription = event.data;
        const userId = subscription.metadata?.userId;
        console.log(`[subscription.created] Subscription ${subscription.id} created for user ${userId}`);
        
        if (userId && subscription.status === "active") {
          const merchant = await storage.getMerchantByUserId(userId);
          if (merchant) {
            await storage.updateMerchantPlan(merchant.id, "premium");
            console.log(`[subscription.created] Activated premium for merchant ${merchant.id}`);
          }
        }
        break;
      }

      case "subscription.updated": {
        const subscription = event.data;
        const userId = subscription.metadata?.userId;
        console.log(`[subscription.updated] Subscription ${subscription.id} updated, status: ${subscription.status}`);
        
        if (userId) {
          const merchant = await storage.getMerchantByUserId(userId);
          if (merchant) {
            if (subscription.status === "active") {
              await storage.updateMerchantPlan(merchant.id, "premium");
              console.log(`[subscription.updated] Merchant ${merchant.id} plan set to premium`);
            } else if (subscription.status === "canceled" || subscription.status === "expired") {
              await storage.updateMerchantPlan(merchant.id, "free");
              console.log(`[subscription.updated] Merchant ${merchant.id} plan downgraded to free`);
            }
          }
        }
        break;
      }

      case "subscription.canceled": {
        const subscription = event.data;
        const userId = subscription.metadata?.userId;
        console.log(`[subscription.canceled] Subscription ${subscription.id} canceled for user ${userId}`);
        
        if (userId) {
          const merchant = await storage.getMerchantByUserId(userId);
          if (merchant) {
            await storage.updateMerchantPlan(merchant.id, "free");
            console.log(`[subscription.canceled] Downgraded merchant ${merchant.id} to free`);
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data;
        console.log(`[invoice.paid] Invoice ${invoice.id} paid`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data;
        console.log(`[invoice.payment_failed] Invoice ${invoice.id} payment failed`);
        break;
      }

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

router.get("/webhooks/recur/info", (req, res) => {
  const domain = process.env.REPLIT_DEV_DOMAIN || `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  const webhookUrl = `https://${domain}/api/webhooks/recur`;
  res.json({ 
    webhookUrl,
    supportedEvents: [
      "checkout.completed",
      "subscription.created", 
      "subscription.updated",
      "subscription.canceled",
      "invoice.paid",
      "invoice.payment_failed"
    ]
  });
});

router.post("/gacha/itinerary", gachaRateLimiter, async (req, res) => {
  try {
    const { countryId, regionId, language = 'zh-TW', itemCount = 8 } = req.body;

    if (!countryId) {
      return res.status(400).json({ error: "countryId is required" });
    }

    let district;
    if (regionId) {
      district = await storage.getRandomDistrictByRegion(regionId);
    } else {
      district = await storage.getRandomDistrictByCountry(countryId);
    }
    if (!district) {
      return res.status(404).json({ error: "No districts found" });
    }

    const districtWithParents = await storage.getDistrictWithParents(district.id);
    if (!districtWithParents) {
      return res.status(500).json({ error: "Failed to get district info" });
    }

    const getLocalizedName = (item: any, lang: string): string => {
      switch (lang) {
        case 'ja': return item.nameJa || item.nameZh || item.nameEn;
        case 'ko': return item.nameKo || item.nameZh || item.nameEn;
        case 'en': return item.nameEn;
        default: return item.nameZh || item.nameEn;
      }
    };

    const getLocalizedDescription = (place: any, lang: string): string => {
      const i18n = place.descriptionI18n || place.description_i18n;
      const defaultDesc = place.description || '';
      if (!i18n) return defaultDesc;
      switch (lang) {
        case 'ja': return i18n.ja || defaultDesc;
        case 'ko': return i18n.ko || defaultDesc;
        case 'en': return i18n.en || defaultDesc;
        default: return defaultDesc;
      }
    };

    const districtNameZh = districtWithParents.district.nameZh;
    const regionNameZh = districtWithParents.region.nameZh;
    const countryNameZh = districtWithParents.country.nameZh;

    const allSubcategories = await storage.getAllSubcategoriesWithCategory();
    if (!allSubcategories || allSubcategories.length === 0) {
      return res.status(404).json({ error: "No subcategories found" });
    }

    type AIWorker = 'ai1_morning' | 'ai2_afternoon' | 'ai3_evening' | 'ai4_night';
    
    interface AITask {
      worker: AIWorker;
      tasks: { type: 'breakfast' | 'lunch' | 'dinner' | 'activity' | 'stay'; count: number }[];
    }
    
    const getAIDistribution = (count: number): AITask[] => {
      switch (count) {
        case 5: return [
          { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 1 }] },
          { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] }
        ];
        case 6: return [
          { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] }
        ];
        case 7: return [
          { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }] }
        ];
        case 8: return [
          { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 1 }] }
        ];
        case 9: return [
          { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] }
        ];
        case 10: return [
          { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai4_night', tasks: [{ type: 'stay', count: 1 }] }
        ];
        case 11: return [
          { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai4_night', tasks: [{ type: 'stay', count: 1 }, { type: 'activity', count: 1 }] }
        ];
        case 12: return [
          { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai4_night', tasks: [{ type: 'stay', count: 1 }, { type: 'activity', count: 2 }] }
        ];
        default: return [
          { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
          { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] }
        ];
      }
    };

    const aiDistribution = getAIDistribution(itemCount);
    
    console.log(`\n=== Generating itinerary for ${regionNameZh}${districtNameZh} (${itemCount} items, ${aiDistribution.length} AI workers) ===`);

    const CACHE_USE_PROBABILITY = 0.25;
    const COLLECTED_REDUCTION_PROBABILITY = 0.40;
    
    const selectSubcategoryForTask = (worker: AIWorker, taskType: string): typeof allSubcategories[0] | null => {
      const excludedByWorker: Record<AIWorker, { categories: string[]; subcategories: string[] }> = {
        'ai1_morning': { 
          categories: [], 
          subcategories: ['酒吧', 'KTV', '夜市']
        },
        'ai2_afternoon': { 
          categories: [], 
          subcategories: ['早午餐']
        },
        'ai3_evening': { 
          categories: [], 
          subcategories: ['早午餐', '咖啡廳']
        },
        'ai4_night': { 
          categories: [], 
          subcategories: ['早午餐', '咖啡廳']
        }
      };

      if (taskType === 'breakfast') {
        const breakfastSubcats = allSubcategories.filter(s => 
          s.category.code === 'food' && 
          (s.nameZh.includes('早') || s.nameZh.includes('咖啡') || s.nameZh.includes('甜點'))
        );
        const fallback = allSubcategories.filter(s => s.category.code === 'food');
        const options = breakfastSubcats.length > 0 ? breakfastSubcats : fallback;
        return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
      } else if (taskType === 'lunch') {
        const lunchSubcats = allSubcategories.filter(s => 
          s.category.code === 'food' && 
          !s.nameZh.includes('宵夜') && !s.nameZh.includes('酒')
        );
        const fallback = allSubcategories.filter(s => s.category.code === 'food');
        const options = lunchSubcats.length > 0 ? lunchSubcats : fallback;
        return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
      } else if (taskType === 'dinner') {
        const dinnerSubcats = allSubcategories.filter(s => 
          s.category.code === 'food' && !s.nameZh.includes('早')
        );
        const fallback = allSubcategories.filter(s => s.category.code === 'food');
        const options = dinnerSubcats.length > 0 ? dinnerSubcats : fallback;
        return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
      } else if (taskType === 'stay') {
        const staySubcats = allSubcategories.filter(s => s.category.code === 'stay');
        return staySubcats.length > 0 ? staySubcats[Math.floor(Math.random() * staySubcats.length)] : null;
      }
      
      const allCategorySet = new Set<string>();
      allSubcategories.forEach(s => allCategorySet.add(s.category.code));
      const allCategories = Array.from(allCategorySet);
      const activityCategories = allCategories.filter(code => 
        code !== 'food' && code !== 'stay'
      );
      
      if (activityCategories.length === 0) return null;
      
      const exclusions = excludedByWorker[worker];
      const validCategories = activityCategories.filter(code => !exclusions.categories.includes(code));
      
      if (validCategories.length === 0) return null;
      
      const selectedCategoryCode = validCategories[Math.floor(Math.random() * validCategories.length)];
      
      const categorySubcats = allSubcategories.filter(s => 
        s.category.code === selectedCategoryCode &&
        !exclusions.subcategories.includes(s.nameZh) &&
        s.preferredTimeSlot !== 'stay'
      );
      
      if (categorySubcats.length === 0) return null;
      
      return categorySubcats[Math.floor(Math.random() * categorySubcats.length)];
    };

    const startTime = Date.now();
    let cacheHits = 0;
    let aiGenerated = 0;

    const buildItemWithPromo = async (result: any) => {
      let merchantPromo = null;
      let merchantLink = null;
      
      if (result.place?.place_id) {
        merchantLink = await storage.getPlaceLinkByGooglePlaceId(result.place.place_id);
      }
      if (!merchantLink && result.place?.name) {
        merchantLink = await storage.getPlaceLinkByPlace(result.place.name, districtNameZh, regionNameZh);
      }
      
      if (merchantLink && merchantLink.isPromoActive && merchantLink.promoTitle) {
        merchantPromo = {
          merchantId: merchantLink.merchantId,
          title: merchantLink.promoTitle,
          description: merchantLink.promoDescription,
          imageUrl: merchantLink.promoImageUrl
        };
      }

      return {
        category: {
          id: result.category.id,
          code: result.category.code,
          name: getLocalizedName(result.category, language),
          colorHex: result.category.colorHex
        },
        subcategory: {
          id: result.subcategory.id,
          code: result.subcategory.code,
          name: getLocalizedName(result.subcategory, language)
        },
        place: result.place,
        isVerified: result.isVerified,
        source: result.source,
        is_promo_active: !!merchantPromo,
        store_promo: merchantPromo?.title || null,
        merchant_promo: merchantPromo
      };
    };

    const cachedPlacesForDistrict = await storage.getCachedPlaces(
      districtNameZh,
      regionNameZh,
      countryNameZh
    );
    const cacheBySubcategory = new Map<string, typeof cachedPlacesForDistrict[0]>();
    for (const cached of cachedPlacesForDistrict) {
      if (!cacheBySubcategory.has(cached.subCategory)) {
        cacheBySubcategory.set(cached.subCategory, cached);
      }
    }

    const userId = (req as any).user?.id;
    let collectedPlaceNames: Set<string> = new Set();
    if (userId) {
      try {
        const userCollections = await storage.getUserCollections(userId);
        for (const collection of userCollections) {
          if (collection.placeName) {
            collectedPlaceNames.add(collection.placeName);
          }
        }
      } catch (e) {
        console.log("Could not fetch user collections for probability adjustment");
      }
    }
    
    const executeAIWorker = async (aiTask: AITask): Promise<any[]> => {
      const usedSubcatIds = new Set<number>();
      
      interface TaskItem {
        taskType: string;
        selectedSubcat: typeof allSubcategories[0];
        cached: typeof cachedPlacesForDistrict[0] | null;
        shouldUseCache: boolean;
      }
      const taskItems: TaskItem[] = [];
      
      for (const task of aiTask.tasks) {
        for (let i = 0; i < task.count; i++) {
          let selectedSubcat = selectSubcategoryForTask(aiTask.worker, task.type);
          
          let retries = 0;
          while (selectedSubcat && usedSubcatIds.has(selectedSubcat.id) && retries < 3) {
            selectedSubcat = selectSubcategoryForTask(aiTask.worker, task.type);
            retries++;
          }
          
          if (!selectedSubcat || usedSubcatIds.has(selectedSubcat.id)) continue;
          usedSubcatIds.add(selectedSubcat.id);
          
          const shouldUseCache = Math.random() < CACHE_USE_PROBABILITY;
          const cached = cacheBySubcategory.get(selectedSubcat.nameZh) || null;
          
          taskItems.push({
            taskType: task.type,
            selectedSubcat,
            cached,
            shouldUseCache
          });
        }
      }
      
      console.log(`[${aiTask.worker}] Processing ${taskItems.length} tasks in parallel`);
      
      const taskPromises = taskItems.map(async (taskItem) => {
        const { taskType, selectedSubcat, cached, shouldUseCache } = taskItem;
        
        if (shouldUseCache && cached && cached.placeName) {
          if (collectedPlaceNames.has(cached.placeName)) {
            if (Math.random() < COLLECTED_REDUCTION_PROBABILITY) {
              console.log(`[${aiTask.worker}] Skipping collected: ${cached.placeName}`);
            } else {
              const item = await buildItemWithPromo({
                category: selectedSubcat.category,
                subcategory: selectedSubcat,
                place: {
                  name: cached.placeName,
                  description: cached.description,
                  place_id: cached.placeId,
                  verified_name: cached.verifiedName,
                  verified_address: cached.verifiedAddress,
                  google_rating: cached.googleRating,
                  lat: cached.locationLat,
                  lng: cached.locationLng,
                  google_types: cached.googleTypes,
                  primary_type: cached.primaryType
                },
                isVerified: cached.isLocationVerified,
                source: 'cache'
              });
              return { ...item, aiWorker: aiTask.worker, taskType };
            }
          } else {
            const item = await buildItemWithPromo({
              category: selectedSubcat.category,
              subcategory: selectedSubcat,
              place: {
                name: cached.placeName,
                description: cached.description,
                place_id: cached.placeId,
                verified_name: cached.verifiedName,
                verified_address: cached.verifiedAddress,
                google_rating: cached.googleRating,
                lat: cached.locationLat,
                lng: cached.locationLng,
                google_types: cached.googleTypes,
                primary_type: cached.primaryType
              },
              isVerified: cached.isLocationVerified,
              source: 'cache'
            });
            return { ...item, aiWorker: aiTask.worker, taskType };
          }
        }
        
        const result = await generatePlaceForSubcategory(
          districtNameZh, regionNameZh, countryNameZh,
          selectedSubcat.category, selectedSubcat, language,
          []
        );

        if (result && result.place?.name) {
          const desc = result.place.description || '';
          if (desc.includes('無符合條件') || desc.includes('目前無符合') || desc.includes('沒有符合')) {
            console.log(`[${aiTask.worker}] Skipping no-match result: ${result.place.name}`);
            return null;
          }
          
          if (collectedPlaceNames.has(result.place.name)) {
            if (Math.random() < COLLECTED_REDUCTION_PROBABILITY) {
              console.log(`[${aiTask.worker}] Skipping collected AI: ${result.place.name}`);
              return null;
            }
          }
          
          const item = await buildItemWithPromo(result);
          return { ...item, aiWorker: aiTask.worker, taskType };
        }
        
        return null;
      });
      
      const results = await Promise.all(taskPromises);
      
      const normalizePlaceName = (name: string): string => {
        if (!name) return '';
        const trimmed = name.trim();
        const normalized = trimmed
          .replace(/[（(][^）)]*[）)]/g, '')
          .replace(/旅遊服務園區|生態園區|園區|服務中心|遊客中心|觀光工廠|休閒農場/g, '')
          .replace(/\s+/g, '')
          .trim();
        return normalized || trimmed;
      };
      
      const seenPlaceIds = new Set<string>();
      return results.filter((item): item is NonNullable<typeof item> => {
        if (item === null) return false;
        const placeId = item.place?.place_id || item.place?.placeId;
        const placeName = item.place?.name;
        const normalizedName = normalizePlaceName(placeName || '');
        const dedupKey = placeId || normalizedName;
        if (!dedupKey || seenPlaceIds.has(dedupKey)) {
          console.log(`[Dedup] Skipping duplicate: ${placeName} (key: ${dedupKey})`);
          return false;
        }
        seenPlaceIds.add(dedupKey);
        return true;
      });
    };

    console.log(`\n=== Starting ${aiDistribution.length} AI workers in PARALLEL ===`);
    const parallelStartTime = Date.now();
    
    const workerPromises = aiDistribution.map(aiTask => {
      const workerStart = Date.now();
      return executeAIWorker(aiTask).then(result => {
        console.log(`[${aiTask.worker}] Completed in ${Date.now() - workerStart}ms (${result.length} items)`);
        return result;
      });
    });
    
    const workerResults = await Promise.all(workerPromises);
    console.log(`=== All workers completed in ${Date.now() - parallelStartTime}ms (parallel execution) ===\n`);

    const normalizePlaceName = (name: string): string => {
      if (!name) return '';
      const trimmed = name.trim();
      const normalized = trimmed
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(/旅遊服務園區|生態園區|園區|服務中心|遊客中心|觀光工廠|休閒農場/g, '')
        .replace(/\s+/g, '')
        .trim();
      return normalized || trimmed;
    };
    
    const items: any[] = [];
    const globalSeenPlaceIds = new Set<string>();
    
    for (const workerItems of workerResults) {
      for (const item of workerItems) {
        const placeId = item.place?.place_id || item.place?.placeId;
        const placeName = item.place?.name;
        const normalizedName = normalizePlaceName(placeName || '');
        const dedupKey = placeId || normalizedName;
        
        if (dedupKey && !globalSeenPlaceIds.has(dedupKey)) {
          globalSeenPlaceIds.add(dedupKey);
          items.push(item);
          if (item.source === 'cache') cacheHits++;
          else aiGenerated++;
        } else {
          console.log(`[Global Dedup] Skipping: ${placeName} (key: ${dedupKey})`);
        }
      }
    }

    let shortageWarning: string | null = null;
    const usedSubcatIds = new Set<number>(items.map(i => i.subcategory?.id).filter(Boolean));
    
    if (items.length < itemCount) {
      const missing = itemCount - items.length;
      console.log(`\n=== BACKFILL: Need ${missing} more items ===`);
      
      let backfillAttempts = 0;
      const maxBackfillAttempts = missing * 3;
      
      const availableSubcats = allSubcategories
        .filter(s => !usedSubcatIds.has(s.id))
        .slice()
        .sort(() => Math.random() - 0.5);
      
      for (const subcat of availableSubcats) {
        if (items.length >= itemCount || backfillAttempts >= maxBackfillAttempts) break;
        backfillAttempts++;
        
        console.log(`[Backfill] Trying: ${subcat.category?.nameZh} - ${subcat.nameZh}`);
        const result = await generatePlaceForSubcategory(
          districtNameZh, regionNameZh, countryNameZh,
          subcat.category, subcat, language, []
        );
        
        if (result && result.place?.name) {
          const desc = result.place.description || '';
          if (desc.includes('無符合條件') || desc.includes('目前無符合') || desc.includes('沒有符合')) {
            console.log(`[Backfill] Skipping no-match result: ${result.place.name}`);
            continue;
          }
          
          const placeId = result.place.place_id || result.place.placeId;
          const normalizedName = normalizePlaceName(result.place.name);
          const dedupKey = placeId || normalizedName;
          if (!globalSeenPlaceIds.has(dedupKey)) {
            globalSeenPlaceIds.add(dedupKey);
            usedSubcatIds.add(subcat.id);
            const item = await buildItemWithPromo(result);
            items.push({ ...item, aiWorker: 'backfill', taskType: 'backfill' });
            aiGenerated++;
            console.log(`[Backfill] Added: ${result.place.name}`);
          }
        }
      }
    }
    
    if (items.length < itemCount) {
      shortageWarning = language === 'zh-TW' 
        ? `此區域的觀光資源有限，僅找到 ${items.length} 個地點`
        : language === 'ja'
        ? `このエリアでは ${items.length} 件のスポットのみ見つかりました`
        : language === 'ko'
        ? `이 지역에서 ${items.length}개의 장소만 찾았습니다`
        : `Only ${items.length} spots found in this area`;
      console.log(`[Shortage] Warning: ${shortageWarning}`);
    }

    const duration = Date.now() - startTime;
    console.log(`Generated ${items.length}/${itemCount} items in ${duration}ms (cache: ${cacheHits}, AI: ${aiGenerated}, workers: ${aiDistribution.length})`);

    res.json({
      success: true,
      itinerary: {
        location: {
          district: {
            id: district.id,
            code: district.code,
            name: getLocalizedName(districtWithParents.district, language),
            nameZh: districtNameZh
          },
          region: {
            id: districtWithParents.region.id,
            code: districtWithParents.region.code,
            name: getLocalizedName(districtWithParents.region, language),
            nameZh: regionNameZh
          },
          country: {
            id: districtWithParents.country.id,
            code: districtWithParents.country.code,
            name: getLocalizedName(districtWithParents.country, language)
          }
        },
        items,
        meta: {
          totalItems: items.length,
          requestedItems: itemCount,
          cacheHits,
          aiGenerated,
          verifiedCount: items.filter(i => i.isVerified).length,
          shortageWarning
        }
      }
    });
  } catch (error) {
    console.error("Itinerary generation error:", error);
    res.status(500).json({ error: "Failed to generate itinerary" });
  }
});

router.post("/gacha/pull", async (req, res) => {
  try {
    const { countryId, regionId, language = 'zh-TW' } = req.body;

    if (!countryId) {
      return res.status(400).json({ error: "countryId is required" });
    }

    let district;
    if (regionId) {
      district = await storage.getRandomDistrictByRegion(regionId);
    } else {
      district = await storage.getRandomDistrictByCountry(countryId);
    }
    if (!district) {
      return res.status(404).json({ error: "No districts found" });
    }

    const districtWithParents = await storage.getDistrictWithParents(district.id);
    if (!districtWithParents) {
      return res.status(500).json({ error: "Failed to get district info" });
    }

    const category = await storage.getRandomCategory();
    if (!category) {
      return res.status(404).json({ error: "No categories found" });
    }
    
    const subcategory = await storage.getRandomSubcategoryByCategory(category.id);
    if (!subcategory) {
      return res.status(404).json({ error: "No subcategories found" });
    }

    const getLocalizedName = (item: any, lang: string): string => {
      switch (lang) {
        case 'ja': return item.nameJa || item.nameZh || item.nameEn;
        case 'ko': return item.nameKo || item.nameZh || item.nameEn;
        case 'en': return item.nameEn;
        default: return item.nameZh || item.nameEn;
      }
    };

    const districtNameZh = districtWithParents.district.nameZh;
    const regionNameZh = districtWithParents.region.nameZh;
    const countryNameZh = districtWithParents.country.nameZh;

    const result = await generatePlaceForSubcategory(
      districtNameZh,
      regionNameZh,
      countryNameZh,
      category,
      subcategory,
      language
    );

    if (!result) {
      return res.status(500).json({ error: "Failed to generate place" });
    }

    res.json({
      success: true,
      pull: {
        location: {
          district: {
            id: district.id,
            code: district.code,
            name: getLocalizedName(districtWithParents.district, language),
            nameZh: districtNameZh
          },
          region: {
            id: districtWithParents.region.id,
            code: districtWithParents.region.code,
            name: getLocalizedName(districtWithParents.region, language),
            nameZh: regionNameZh
          },
          country: {
            id: districtWithParents.country.id,
            code: districtWithParents.country.code,
            name: getLocalizedName(districtWithParents.country, language)
          }
        },
        category: {
          id: result.category.id,
          code: result.category.code,
          name: getLocalizedName(result.category, language),
          colorHex: result.category.colorHex
        },
        subcategory: {
          id: result.subcategory.id,
          code: result.subcategory.code,
          name: getLocalizedName(result.subcategory, language)
        },
        place: result.place,
        meta: {
          source: result.source,
          isVerified: result.isVerified
        }
      }
    });
  } catch (error) {
    console.error("Gacha pull error:", error);
    res.status(500).json({ error: "Failed to perform gacha pull" });
  }
});

router.get("/gacha/pool/:city/:district", async (req, res) => {
  try {
    const { city, district } = req.params;
    
    if (!city || !district) {
      return res.status(400).json({ error: "city and district are required" });
    }

    const decodedCity = decodeURIComponent(city);
    const decodedDistrict = decodeURIComponent(district);
    
    const jackpotPlaces = await storage.getJackpotPlaces(decodedCity, decodedDistrict);
    
    res.json({
      success: true,
      pool: {
        city: decodedCity,
        district: decodedDistrict,
        jackpots: jackpotPlaces.map(p => ({
          id: p.id,
          placeName: p.placeName,
          category: p.category,
          rating: p.rating,
          hasMerchant: !!p.merchantId,
          isPromoActive: p.isPromoActive,
        })),
        totalInPool: jackpotPlaces.length,
      }
    });
  } catch (error) {
    console.error("Gacha pool error:", error);
    res.status(500).json({ error: "Failed to get gacha pool" });
  }
});

router.get("/gacha/pool/:city", async (req, res) => {
  try {
    const { city } = req.params;
    const decodedCity = decodeURIComponent(city);
    
    const places = await storage.getPlaceCacheByCity(decodedCity);
    
    const jackpots = places.filter(p => {
      const rating = p.googleRating ? parseFloat(p.googleRating) : 0;
      return rating >= 4.5;
    }).slice(0, 20);

    res.json({
      success: true,
      pool: {
        city: decodedCity,
        jackpots: jackpots.map(p => ({
          id: p.id,
          placeName: p.placeName,
          category: p.category,
          subCategory: p.subCategory,
          rating: p.googleRating,
        })),
        totalInPool: places.length,
        jackpotCount: jackpots.length,
      }
    });
  } catch (error) {
    console.error("Gacha pool by city error:", error);
    res.status(500).json({ error: "Failed to get gacha pool" });
  }
});

router.get("/gacha/pool", async (req, res) => {
  try {
    const { regionId, city } = req.query;
    
    if (!regionId && !city) {
      return res.status(400).json({ error: "regionId or city is required" });
    }

    let cityName = city as string;
    
    if (regionId && !city) {
      const parsedRegionId = parseInt(regionId as string);
      if (isNaN(parsedRegionId)) {
        return res.status(400).json({ error: "Invalid regionId" });
      }
      const region = await storage.getRegionById(parsedRegionId);
      if (!region) {
        return res.status(404).json({ error: "Region not found" });
      }
      cityName = region.nameZh;
    }

    const places = await storage.getPlaceCacheByCity(cityName);
    
    const jackpots = places.filter(p => {
      const rating = p.googleRating ? parseFloat(p.googleRating) : 0;
      return rating >= 4.5;
    }).slice(0, 20);

    res.json({
      success: true,
      pool: {
        city: cityName,
        jackpots: jackpots.map(p => ({
          id: p.id,
          placeName: p.placeName,
          category: p.category,
          subCategory: p.subCategory,
          rating: p.googleRating,
        })),
        totalInPool: places.length,
        jackpotCount: jackpots.length,
      }
    });
  } catch (error) {
    console.error("Gacha pool by region error:", error);
    res.status(500).json({ error: "Failed to get gacha pool" });
  }
});

router.get("/gacha/prize-pool", async (req, res) => {
  try {
    const { regionId } = req.query;
    
    if (!regionId) {
      return res.status(400).json({ error: "regionId is required" });
    }

    const parsedRegionId = parseInt(regionId as string);
    if (isNaN(parsedRegionId)) {
      return res.status(400).json({ error: "Invalid regionId" });
    }

    const prizePoolCoupons = await storage.getRegionPrizePoolCoupons(parsedRegionId);

    for (const coupon of prizePoolCoupons) {
      if (coupon.merchantId) {
        try {
          await storage.incrementAnalyticsCounter(coupon.merchantId, coupon.placeLinkId, 'prizePoolViews');
        } catch (e) {
          console.error("Failed to track prize pool view:", e);
        }
      }
    }

    res.json({
      success: true,
      coupons: prizePoolCoupons.map(c => ({
        id: c.id,
        tier: c.rarity || c.tier || 'R',
        name: c.title || c.name,
        merchantName: c.merchantName || c.businessName,
        placeName: c.placeName,
        terms: c.terms,
      }))
    });
  } catch (error) {
    console.error("Get prize pool error:", error);
    res.status(500).json({ error: "Failed to get prize pool" });
  }
});

router.post("/gacha/pull/v2", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const { city, district, itemCount = 5 } = req.body;
    
    if (!city || !district) {
      return res.status(400).json({ error: "city and district are required" });
    }

    const hour = new Date().getHours();
    let timeSlots: string[] = [];
    
    if (hour >= 6 && hour < 10) {
      timeSlots = ['morning', 'FOOD'];
    } else if (hour >= 10 && hour < 14) {
      timeSlots = ['lunch', 'FOOD', 'SPOT'];
    } else if (hour >= 14 && hour < 17) {
      timeSlots = ['afternoon', 'SPOT', 'SHOP', 'EXP'];
    } else if (hour >= 17 && hour < 21) {
      timeSlots = ['dinner', 'FOOD', 'FUN'];
    } else {
      timeSlots = ['evening', 'FUN', 'FOOD'];
    }

    const allPlaces = await storage.getPlacesByDistrict(city, district);
    
    if (allPlaces.length === 0) {
      return res.json({
        success: true,
        items: [],
        meta: {
          message: "No places found in this district. Run seed to populate.",
          city,
          district,
        }
      });
    }

    const userCollections = userId ? await storage.getUserCollections(userId) : [];
    const collectedPlaceNames = new Set(userCollections.map(c => c.placeName));

    const weightedPlaces = allPlaces.map(place => {
      let weight = 1.0;
      
      if (timeSlots.includes(place.category)) {
        weight *= 1.5;
      }
      
      if (place.rating && place.rating >= 4.5) {
        weight *= 1.3;
      }
      
      if (place.merchantId && place.isPromoActive) {
        weight *= 1.4;
      }
      
      if (collectedPlaceNames.has(place.placeName)) {
        weight *= 0.55;
      }
      
      return { place, weight };
    });

    const selectedPlaces: typeof allPlaces = [];
    const availablePlaces = [...weightedPlaces];

    for (let i = 0; i < Math.min(itemCount, allPlaces.length) && availablePlaces.length > 0; i++) {
      const totalWeight = availablePlaces.reduce((sum, p) => sum + p.weight, 0);
      let random = Math.random() * totalWeight;
      
      for (let j = 0; j < availablePlaces.length; j++) {
        random -= availablePlaces[j].weight;
        if (random <= 0) {
          selectedPlaces.push(availablePlaces[j].place);
          availablePlaces.splice(j, 1);
          break;
        }
      }
    }

    const RARITY_DROP_RATES: Record<string, number> = {
      SP: 0.02,
      SSR: 0.08,
      SR: 0.15,
      S: 0.23,
      R: 0.32,
    };

    const items = await Promise.all(selectedPlaces.map(async (place) => {
      let couponDrop = null;
      
      const coupons = await storage.getCouponsByPlaceId(place.id);
      const activeCoupons = coupons.filter(c => c.isActive && !c.archived && c.remainingQuantity > 0);
      
      if (activeCoupons.length > 0) {
        for (const coupon of activeCoupons) {
          const dropRate = coupon.dropRate || RARITY_DROP_RATES[coupon.rarity || 'R'] || 0.35;
          if (Math.random() < dropRate) {
            couponDrop = {
              id: coupon.id,
              title: coupon.title,
              code: coupon.code,
              rarity: coupon.rarity,
              terms: coupon.terms,
            };
            break;
          }
        }
      }

      return {
        id: place.id,
        placeName: place.placeName,
        category: place.category,
        subcategory: place.subcategory,
        description: place.description,
        address: place.address,
        rating: place.rating,
        locationLat: place.locationLat,
        locationLng: place.locationLng,
        googlePlaceId: place.googlePlaceId,
        photoReference: place.photoReference,
        coupon: couponDrop,
      };
    }));

    res.json({
      success: true,
      pull: {
        city,
        district,
        timeSlot: timeSlots[0],
        items,
      },
      meta: {
        totalItems: items.length,
        requestedItems: itemCount,
        poolSize: allPlaces.length,
        couponDrops: items.filter(i => i.coupon).length,
      }
    });
  } catch (error) {
    console.error("Gacha pull v2 error:", error);
    res.status(500).json({ error: "Failed to perform gacha pull" });
  }
});

router.post("/gacha/pull/v3", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const pullSchema = z.object({
      city: z.string().min(1),
      district: z.string().min(1),
      count: z.number().int().min(1).max(10).optional().default(5),
    });

    const validated = pullSchema.parse(req.body);
    const { city, district, count } = validated;

    const pulledPlaces = await storage.getOfficialPlacesByDistrict(city, district, count);
    
    if (pulledPlaces.length === 0) {
      return res.json({
        success: true,
        places: [],
        couponsWon: [],
        meta: {
          message: "No places found in this district pool.",
          city,
          district,
        }
      });
    }

    const placesResult: Array<{
      id: number;
      placeName: string;
      category: string;
      subcategory?: string | null;
      description?: string | null;
      address?: string | null;
      rating?: number | null;
      locationLat?: number | null;
      locationLng?: number | null;
      googlePlaceId?: string | null;
      hasMerchantClaim: boolean;
      couponWon?: {
        id: number;
        title: string;
        code: string;
        terms?: string | null;
      } | null;
    }> = [];
    
    const couponsWon: Array<{
      couponId: number;
      placeId: number;
      placeName: string;
      title: string;
      code: string;
      terms?: string | null;
    }> = [];

    for (const place of pulledPlaces) {
      let couponWon: typeof couponsWon[0] | null = null;
      let hasMerchantClaim = false;

      const claimInfo = await storage.getClaimByOfficialPlaceId(place.id);
      
      if (claimInfo) {
        hasMerchantClaim = true;
        
        const dropRate = claimInfo.claim.couponDropRate ?? 0.1;
        
        try {
          await storage.incrementAnalyticsCounter(claimInfo.claim.merchantId, claimInfo.claim.id, 'collectedCount');
        } catch (e) {
          console.error("Failed to track collection:", e);
        }
        
        if (Math.random() < dropRate && claimInfo.coupons.length > 0) {
          const randomIndex = Math.floor(Math.random() * claimInfo.coupons.length);
          const wonCoupon = claimInfo.coupons[randomIndex];
          
          couponWon = {
            couponId: wonCoupon.id,
            placeId: place.id,
            placeName: place.placeName,
            title: wonCoupon.title,
            code: wonCoupon.code,
            terms: wonCoupon.terms,
          };
          
          couponsWon.push(couponWon);
          
          try {
            await storage.incrementAnalyticsCounter(claimInfo.claim.merchantId, claimInfo.claim.id, 'couponIssuedCount');
          } catch (e) {
            console.error("Failed to track coupon issue:", e);
          }
          
          await storage.saveToCollectionWithCoupon(userId, place, wonCoupon);
        } else {
          await storage.saveToCollectionWithCoupon(userId, place);
        }
      } else {
        await storage.saveToCollectionWithCoupon(userId, place);
      }

      placesResult.push({
        id: place.id,
        placeName: place.placeName,
        category: place.category,
        subcategory: place.subcategory,
        description: place.description,
        address: place.address,
        rating: place.rating,
        locationLat: place.locationLat,
        locationLng: place.locationLng,
        googlePlaceId: place.googlePlaceId,
        hasMerchantClaim,
        couponWon: couponWon ? {
          id: couponWon.couponId,
          title: couponWon.title,
          code: couponWon.code,
          terms: couponWon.terms,
        } : null,
      });
    }

    res.json({
      success: true,
      places: placesResult,
      couponsWon,
      meta: {
        city,
        district,
        totalPlaces: placesResult.length,
        totalCouponsWon: couponsWon.length,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Gacha pull v3 error:", error);
    res.status(500).json({ error: "Failed to perform gacha pull" });
  }
});

router.post("/gacha/itinerary/v3", isAuthenticated, async (req: any, res) => {
  const userId = req.user?.claims?.sub || req.jwtUser?.userId || 'guest';
  const sessionId = crypto.randomUUID();
  const startTime = Date.now();
  console.log('[Gacha V3] Request received:', { body: req.body, userId, sessionId });
  
  try {
    const itinerarySchema = z.object({
      regionId: z.number().optional(),
      countryId: z.number().optional(),
      language: z.string().optional(),
      itemCount: z.number().min(5).max(12).optional(),
      count: z.number().min(5).max(12).optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      pace: z.enum(['relaxed', 'moderate', 'packed']).optional(),
    });

    const validated = itinerarySchema.parse(req.body);
    let { city, district, pace } = validated;
    const { regionId, language = 'zh-TW' } = validated;
    const itemCount = validated.itemCount || validated.count;
    
    const getLocalizedDescription = (place: any, lang: string): string => {
      const i18n = place.descriptionI18n || place.description_i18n;
      const defaultDesc = place.description || '';
      if (!i18n) return defaultDesc;
      switch (lang) {
        case 'ja': return i18n.ja || defaultDesc;
        case 'ko': return i18n.ko || defaultDesc;
        case 'en': return i18n.en || defaultDesc;
        default: return defaultDesc;
      }
    };
    
    const DAILY_PULL_LIMIT = 36;
    const requestedCount = itemCount || 7;
    
    const GACHA_EXEMPT_EMAILS = ['s8869420@gmail.com'];
    const userEmail = req.user?.claims?.email || req.jwtUser?.email;
    const isExempt = userEmail && GACHA_EXEMPT_EMAILS.includes(userEmail);
    
    if (userId !== 'guest' && !isExempt) {
      const currentDailyCount = await storage.getUserDailyGachaCount(userId);
      const remainingQuota = DAILY_PULL_LIMIT - currentDailyCount;
      
      if (remainingQuota <= 0) {
        return res.status(429).json({
          success: false,
          error: "今日抽卡次數已達上限，請明天再來！",
          code: "DAILY_LIMIT_EXCEEDED",
          dailyLimit: DAILY_PULL_LIMIT,
          currentCount: currentDailyCount,
          remainingQuota: 0
        });
      }
      
      if (requestedCount > remainingQuota) {
        return res.status(400).json({
          success: false,
          error: `今日剩餘額度為 ${remainingQuota} 張，請調整抽取數量`,
          code: "EXCEEDS_REMAINING_QUOTA",
          dailyLimit: DAILY_PULL_LIMIT,
          currentCount: currentDailyCount,
          remainingQuota
        });
      }
    }
    
    if (isExempt) {
      console.log('[Gacha V3] Admin/Test account - daily limit exempted:', userEmail);
    }
    
    if (regionId && !city) {
      const region = await storage.getRegionById(regionId);
      if (!region) {
        return res.status(400).json({ 
          success: false, 
          error: "找不到指定的區域",
          code: "REGION_NOT_FOUND"
        });
      }
      city = region.nameZh;
      console.log('[Gacha V3] Resolved regionId', regionId, 'to city:', city);
    }
    
    if (!city) {
      return res.status(400).json({ 
        success: false, 
        error: "請選擇城市（需提供 city 或 regionId）",
        code: "CITY_REQUIRED"
      });
    }
    
    if (itemCount && !pace) {
      if (itemCount <= 5) pace = 'relaxed';
      else if (itemCount <= 7) pace = 'moderate';
      else pace = 'packed';
    }
    pace = pace || 'moderate';
    
    console.log('[Gacha V3] Validated params:', { city, district, pace, itemCount, userId });

    const itemCounts = { relaxed: 5, moderate: 7, packed: 10 };
    const targetCount = itemCount || itemCounts[pace];

    let anchorDistrict = district;
    if (!anchorDistrict && regionId) {
      const districts = await storage.getDistrictsByRegion(regionId);
      if (districts.length > 0) {
        const randomIdx = Math.floor(Math.random() * districts.length);
        anchorDistrict = districts[randomIdx].nameZh;
        console.log('[Gacha V3] Anchor district selected:', anchorDistrict);
      }
    }
    
    const SIX_CATEGORIES = ['美食', '景點', '購物', '娛樂設施', '生態文化教育', '遊程體驗'];
    
    const maxFoodCount = Math.floor(targetCount / 2);
    
    let minFoodCount = 2;
    if (targetCount >= 7 && targetCount <= 8) minFoodCount = 3;
    if (targetCount >= 9) minFoodCount = 3;
    minFoodCount = Math.min(minFoodCount, maxFoodCount);
    
    const stayCount = targetCount >= 9 ? 1 : 0;
    
    console.log('[Gacha V3] Selection config:', { targetCount, minFoodCount, maxFoodCount, stayCount });
    
    let anchorPlaces = anchorDistrict 
      ? await storage.getOfficialPlacesByDistrict(city, anchorDistrict, 200)
      : await storage.getOfficialPlacesByCity(city, 200);
    
    console.log('[Gacha V3] Anchor places found:', anchorPlaces.length, 'in', anchorDistrict || city);
    
    if (anchorPlaces.length === 0 && anchorDistrict) {
      console.log('[Gacha V3] Anchor district empty, falling back to city-wide search');
      anchorPlaces = await storage.getOfficialPlacesByCity(city, 200);
      console.log('[Gacha V3] City-wide places found:', anchorPlaces.length);
      anchorDistrict = undefined;
    }
    
    if (anchorPlaces.length === 0) {
      return res.json({
        success: true,
        itinerary: [],
        couponsWon: [],
        meta: { 
          message: `${city}目前還沒有上線的景點，我們正在努力擴充中！`,
          code: "NO_PLACES_AVAILABLE",
          city, 
          district: null
        }
      });
    }
    
    const groupByCategory = (places: any[]) => {
      const groups: Record<string, any[]> = {};
      for (const p of places) {
        const cat = p.category || '其他';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
      }
      return groups;
    };
    
    const anchorByCategory = groupByCategory(anchorPlaces);
    const selectedPlaces: any[] = [];
    
    let recentCollectionIds: number[] = [];
    if (userId && userId !== 'guest') {
      recentCollectionIds = await storage.getRecentCollectionPlaceIds(userId, GACHA_DEDUP_LIMIT);
    }
    
    const sessionKey = `guest:${city}`;
    if (userId === 'guest') {
      const sessionDedup = guestSessionDedup.get(sessionKey);
      if (sessionDedup && Date.now() - sessionDedup.timestamp < 30 * 60 * 1000) {
        recentCollectionIds = sessionDedup.placeIds;
      }
    }
    
    const usedIds = new Set<number>(recentCollectionIds);
    console.log('[Gacha V3] Collection dedup exclusion:', recentCollectionIds.length, 'places');
    
    const pickFromCategory = (category: string, count: number): any[] => {
      const picked: any[] = [];
      let pool = [...(anchorByCategory[category] || [])];
      
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      
      for (const p of pool) {
        if (picked.length >= count) break;
        if (usedIds.has(p.id)) continue;
        picked.push(p);
        usedIds.add(p.id);
      }
      return picked;
    };
    
    const districtPlaces = anchorPlaces;
    
    const availableAfterDedup = districtPlaces.filter(p => !usedIds.has(p.id)).length;
    if (availableAfterDedup < targetCount) {
      console.log('[Gacha V3] Dedup safety: only', availableAfterDedup, 'available (need', targetCount, '), ignoring dedup');
      usedIds.clear();
    }
    
    const categoryPickCounts: Record<string, number> = {};
    
    const foodPicks = pickFromCategory('美食', minFoodCount);
    selectedPlaces.push(...foodPicks);
    categoryPickCounts['美食'] = foodPicks.length;
    console.log('[Gacha V3] Food picks (guaranteed):', foodPicks.length, '/', minFoodCount);
    
    if (stayCount > 0) {
      const stayPicks = pickFromCategory('住宿', 1);
      selectedPlaces.push(...stayPicks);
      categoryPickCounts['住宿'] = stayPicks.length;
      console.log('[Gacha V3] Stay picks:', stayPicks.length);
    }
    
    let remaining = targetCount - selectedPlaces.length;
    console.log('[Gacha V3] Remaining slots for random:', remaining);
    
    const categoryWeights: Record<string, number> = {};
    let totalWeight = 0;
    for (const cat of SIX_CATEGORIES) {
      if (anchorByCategory[cat] && anchorByCategory[cat].length > 0) {
        categoryWeights[cat] = 1;
        totalWeight += 1;
      }
    }
    
    while (remaining > 0 && totalWeight > 0) {
      let rand = Math.random() * totalWeight;
      let selectedCategory = '';
      for (const [cat, weight] of Object.entries(categoryWeights)) {
        rand -= weight;
        if (rand <= 0) {
          selectedCategory = cat;
          break;
        }
      }
      if (!selectedCategory) selectedCategory = Object.keys(categoryWeights)[0];
      
      const currentCategoryCount = categoryPickCounts[selectedCategory] || 0;
      if (selectedCategory === '美食' && currentCategoryCount >= maxFoodCount) {
        categoryWeights[selectedCategory] = 0;
        totalWeight = Object.values(categoryWeights).reduce((a, b) => a + b, 0);
        continue;
      }
      
      const picks = pickFromCategory(selectedCategory, 1);
      if (picks.length > 0) {
        selectedPlaces.push(...picks);
        categoryPickCounts[selectedCategory] = (categoryPickCounts[selectedCategory] || 0) + 1;
        remaining--;
      } else {
        categoryWeights[selectedCategory] = 0;
        totalWeight = Object.values(categoryWeights).reduce((a, b) => a + b, 0);
      }
    }
    
    console.log('[Gacha V3] Selection result:', categoryPickCounts);
    console.log('[Gacha V3] Total selected:', selectedPlaces.length);
    
    const sortByCoordinates = (places: any[]) => {
      if (places.length <= 1) return places;
      
      const withCoords = places.filter(p => p.locationLat && p.locationLng);
      const withoutCoords = places.filter(p => !p.locationLat || !p.locationLng);
      
      if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];
      
      const sorted: any[] = [];
      const remainingCoords = [...withCoords];
      
      remainingCoords.sort((a, b) => b.locationLat - a.locationLat);
      sorted.push(remainingCoords.shift()!);
      
      while (remainingCoords.length > 0) {
        const last = sorted[sorted.length - 1];
        let nearestIdx = 0;
        let nearestDist = Infinity;
        
        for (let i = 0; i < remainingCoords.length; i++) {
          const p = remainingCoords[i];
          const dist = Math.sqrt(
            Math.pow(p.locationLat - last.locationLat, 2) +
            Math.pow(p.locationLng - last.locationLng, 2)
          );
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIdx = i;
          }
        }
        
        sorted.push(remainingCoords.splice(nearestIdx, 1)[0]);
      }
      
      return [...sorted, ...withoutCoords];
    };
    
    const coordinateSortedPlaces = sortByCoordinates(selectedPlaces);
    
    const timeSlotSortedPlaces = sortPlacesByTimeSlot(coordinateSortedPlaces);
    
    const stayPlacesArr = timeSlotSortedPlaces.filter(p => p.category === '住宿');
    const nonStayPlaces = timeSlotSortedPlaces.filter(p => p.category !== '住宿');
    const sortedPlaces = timeSlotSortedPlaces;
    
    console.log('[Gacha V3] After time slot sort:', { 
      nonStay: nonStayPlaces.length, 
      stay: stayPlacesArr.length,
      order: timeSlotSortedPlaces.slice(0, 5).map(p => `${p.placeName}(${inferTimeSlot(p).slot})`)
    });

    let finalPlaces = sortedPlaces;
    let aiReorderResult = 'skipped';
    let rejectedPlaceIds: number[] = [];
    let aiReason = '';
    
    if (selectedPlaces.length >= 2) {
      try {
        const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
        const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
        
        const formatOpeningHours = (hours: any): string => {
          if (!hours) return '未提供';
          if (Array.isArray(hours)) return hours.slice(0, 2).join('; ');
          if (hours.weekday_text) return hours.weekday_text.slice(0, 2).join('; ');
          return '未提供';
        };
        
        const allPlacesInfo = selectedPlaces.map((p, idx) => ({
          idx: idx + 1,
          name: p.placeName,
          category: p.category,
          subcategory: p.subcategory || '一般',
          lat: p.locationLat || 0,
          lng: p.locationLng || 0,
          description: (p.description || '').slice(0, 80),
          hours: formatOpeningHours(p.openingHours)
        }));
        
        const reorderPrompt = `你是一日遊行程排序專家。請根據地點資訊安排最佳順序。

地點列表：
${allPlacesInfo.map(p => `${p.idx}. ${p.name}｜${p.category}/${p.subcategory}｜${p.description || '無描述'}｜營業:${p.hours}`).join('\n')}

排序規則（依優先順序）：
1. 時段邏輯：早餐/咖啡廳→上午景點→午餐→下午活動→晚餐/夜市→宵夜/酒吧→住宿（住宿必須最後）
2. 地理動線：減少迂迴，鄰近地點連續安排
3. 類別穿插：避免連續3個同類（夜市內美食除外）
4. 排除不適合：永久歇業、非旅遊點、同園區重複景點（保留代表性最高者）

【輸出格式】只輸出一行 JSON（不要換行、不要 markdown）：
{"order":[3,1,5,2,4],"reason":"早餐先逛景點","reject":[]}`;
        
        const reorderResponse = await fetch(`${baseUrl}/models/gemini-3-pro-preview:generateContent`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey || ''
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: reorderPrompt }] }],
            generationConfig: { 
              maxOutputTokens: 8192, 
              temperature: 0.1
            }
          })
        });
        
        const reorderData = await reorderResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>, error?: { code?: string; message?: string } };
        
        if (reorderData.error) {
          console.log('[Gacha V3] AI API Error:', reorderData.error);
        }
        
        const reorderText = reorderData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        console.log('[Gacha V3] AI Reorder response:', reorderText);
        
        if (reorderText) {
          try {
            let jsonText = reorderText;
            if (jsonText.startsWith('```')) {
              jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
            }
            
            let aiResult: { order?: number[]; reason?: string; reject?: number[] } = {};
            try {
              aiResult = JSON.parse(jsonText);
            } catch {
              const orderMatch = jsonText.match(/"order"\s*:\s*\[([^\]]+)\]/);
              const rejectMatch = jsonText.match(/"reject"\s*:\s*\[([^\]]*)\]/);
              if (orderMatch) {
                aiResult.order = orderMatch[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
              }
              if (rejectMatch && rejectMatch[1].trim()) {
                aiResult.reject = rejectMatch[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
              }
            }
            console.log('[Gacha V3] AI Parsed:', { order: aiResult.order, reason: aiResult.reason, reject: aiResult.reject });
            
            if (aiResult.reject && Array.isArray(aiResult.reject)) {
              for (const idx of aiResult.reject) {
                if (idx >= 1 && idx <= selectedPlaces.length) {
                  rejectedPlaceIds.push(selectedPlaces[idx - 1].id);
                }
              }
              if (rejectedPlaceIds.length > 0) {
                console.log('[Gacha V3] AI rejected places:', rejectedPlaceIds);
              }
            }
            
            if (aiResult.order && Array.isArray(aiResult.order) && aiResult.order.length > 0) {
              const validOrder = aiResult.order
                .filter(n => typeof n === 'number' && n >= 1 && n <= selectedPlaces.length)
                .filter(n => !rejectedPlaceIds.includes(selectedPlaces[n - 1]?.id));
              const uniqueOrder = Array.from(new Set(validOrder));
              
              if (uniqueOrder.length >= 2) {
                const reorderedPlaces = uniqueOrder.map(idx => selectedPlaces[idx - 1]).filter(p => p);
                
                const reorderedIds = new Set(reorderedPlaces.map(p => p.id));
                const missingPlaces = selectedPlaces.filter(p => 
                  !reorderedIds.has(p.id) && !rejectedPlaceIds.includes(p.id)
                );
                if (missingPlaces.length > 0) {
                  console.log('[Gacha V3] Adding missing places:', missingPlaces.length);
                  reorderedPlaces.push(...missingPlaces);
                }
                
                finalPlaces = reorderedPlaces;
                aiReorderResult = rejectedPlaceIds.length > 0 ? 'reordered_with_rejects' : 'reordered';
                aiReason = aiResult.reason || '';
                console.log('[Gacha V3] AI reordered:', uniqueOrder, 'reason:', aiResult.reason || 'N/A');
              } else {
                aiReorderResult = 'partial_order';
              }
            } else {
              aiReorderResult = 'no_order';
            }
          } catch (parseError) {
            console.error('[Gacha V3] JSON parse failed:', parseError);
            aiReorderResult = 'parse_failed';
          }
        } else {
          aiReorderResult = 'empty_response';
        }
      } catch (reorderError) {
        console.error('[Gacha V3] AI reorder failed:', reorderError);
        aiReorderResult = 'error';
      }
    }
    
    console.log('[Gacha V3] AI reorder result:', aiReorderResult, 'rejected:', rejectedPlaceIds.length);
    
    const stayPlacesInFinal = finalPlaces.filter(p => p.category === '住宿');
    const nonStayPlacesInFinal = finalPlaces.filter(p => p.category !== '住宿');
    if (stayPlacesInFinal.length > 0) {
      const lastPlace = finalPlaces[finalPlaces.length - 1];
      if (lastPlace.category !== '住宿') {
        finalPlaces = [...nonStayPlacesInFinal, ...stayPlacesInFinal];
        console.log('[Gacha V3] Safety net: moved stay to end');
      }
    }

    const itinerary: Array<{
      id: number;
      placeName: string;
      category: string;
      categoryCode: string;
      subCategory?: string | null;
      description?: string | null;
      address?: string | null;
      rating?: number | null;
      locationLat?: number | null;
      locationLng?: number | null;
      googlePlaceId?: string | null;
      timeSlot: string;
      colorHex: string;
      isCoupon: boolean;
      couponData?: { id: number; title: string; code: string; terms?: string | null } | null;
      rarity?: string | null;
      place?: any;
      couponWon?: any;
    }> = [];
    
    const couponsWon: Array<{ couponId: number; placeId: number; placeName: string; title: string; code: string; terms?: string | null }> = [];
    
    let reorderRounds = 1;
    if (aiReorderResult.includes('round3') || aiReorderResult.includes('revalidated')) {
      reorderRounds = aiReorderResult.includes('round3') ? 3 : 2;
    }
    
    const categoryDistribution: Record<string, number> = {};
    for (const p of finalPlaces) {
      const cat = p.category || '其他';
      categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
    }
    
    const timeSlotLabelMap: Record<TimeSlot, string> = {
      morning: 'breakfast',
      noon: 'lunch',
      afternoon: 'afternoon',
      evening: 'dinner',
      night: 'evening',
      flexible: 'afternoon'
    };
    
    for (let i = 0; i < finalPlaces.length; i++) {
      const place = finalPlaces[i];
      const inferredSlot = inferTimeSlot(place);
      const timeSlot = timeSlotLabelMap[inferredSlot.slot];
      
      let couponWon = null;
      const claimInfo = await storage.getClaimByOfficialPlaceId(place.id);
      
      if (claimInfo) {
        const dropRate = claimInfo.claim.couponDropRate ?? 0.1;
        if (Math.random() < dropRate && claimInfo.coupons.length > 0) {
          const randomIdx = Math.floor(Math.random() * claimInfo.coupons.length);
          const wonCoupon = claimInfo.coupons[randomIdx];
          couponWon = { id: wonCoupon.id, title: wonCoupon.title, code: wonCoupon.code, terms: wonCoupon.terms };
          couponsWon.push({ couponId: wonCoupon.id, placeId: place.id, placeName: place.placeName, title: wonCoupon.title, code: wonCoupon.code, terms: wonCoupon.terms });
          if (userId !== 'guest') {
            await storage.saveToCollectionWithCoupon(userId, place, wonCoupon, aiReason, sessionId);
          }
        } else {
          if (userId !== 'guest') {
            await storage.saveToCollectionWithCoupon(userId, place, undefined, aiReason, sessionId);
          }
        }
      } else {
        if (userId !== 'guest') {
          await storage.saveToCollectionWithCoupon(userId, place, undefined, aiReason, sessionId);
        }
      }

      const categoryCodeMap: Record<string, string> = {
        '美食': 'food', '住宿': 'stay', '生態文化教育': 'education',
        '遊程體驗': 'experience', '娛樂設施': 'entertainment', '景點': 'scenery', '購物': 'shopping',
        '活動': 'activity'
      };
      const categoryColorMap: Record<string, string> = {
        'food': '#FF6B6B', 'stay': '#4ECDC4', 'education': '#45B7D1',
        'activity': '#96CEB4', 'entertainment': '#FFEAA7', 'scenery': '#DDA0DD', 'shopping': '#FFB347',
        'experience': '#96CEB4'
      };
      const categoryCode = categoryCodeMap[place.category] || place.category.toLowerCase();
      const colorHex = categoryColorMap[categoryCode] || '#6366f1';
      
      const localizedDesc = getLocalizedDescription(place, language);
      itinerary.push({
        id: place.id,
        placeName: place.placeName,
        category: place.category,
        categoryCode: categoryCode,
        subCategory: place.subcategory,
        description: localizedDesc,
        address: place.address,
        rating: place.rating,
        locationLat: place.locationLat,
        locationLng: place.locationLng,
        googlePlaceId: place.googlePlaceId,
        timeSlot,
        colorHex,
        isCoupon: !!couponWon,
        couponData: couponWon,
        rarity: couponWon ? 'SR' : null,
        place: {
          id: place.id,
          placeName: place.placeName,
          category: place.category,
          categoryCode: categoryCode,
          subcategory: place.subcategory,
          description: localizedDesc,
          address: place.address,
          rating: place.rating,
          locationLat: place.locationLat,
          locationLng: place.locationLng,
          googlePlaceId: place.googlePlaceId,
        },
        couponWon,
      });
    }

    const categoryStats: Record<string, number> = {};
    for (const p of finalPlaces) {
      const cat = p.category || '其他';
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    }
    
    if (userId !== 'guest' && finalPlaces.length > 0) {
      try {
        const orderedPlaceIds = finalPlaces.map(p => p.id);
        const durationMs = Date.now() - startTime;
        
        await storage.saveGachaAiLog({
          sessionId,
          userId,
          city: city!,
          district: anchorDistrict || undefined,
          requestedCount: targetCount,
          orderedPlaceIds,
          rejectedPlaceIds: rejectedPlaceIds.length > 0 ? rejectedPlaceIds : undefined,
          aiReason: aiReason || undefined,
          aiModel: 'gemini-3-pro-preview',
          reorderRounds,
          durationMs,
          categoryDistribution,
          isShortfall: finalPlaces.length < targetCount,
        });
        console.log('[Gacha V3] AI log saved:', { sessionId, durationMs, reorderRounds });
      } catch (logError) {
        console.error('[Gacha V3] Failed to save AI log:', logError);
      }
    }
    
    const themeIntro = null;
    
    if (userId === 'guest') {
      const drawnIds = itinerary.map(p => p.id);
      const existingDedup = guestSessionDedup.get(sessionKey);
      const existingIds = existingDedup?.placeIds || [];
      const newIds = [...existingIds, ...drawnIds].slice(-GACHA_DEDUP_LIMIT);
      guestSessionDedup.set(sessionKey, { placeIds: newIds, timestamp: Date.now() });
      console.log('[Gacha V3] Guest dedup recorded:', newIds.length, 'places');
    }
    
    let newDailyCount = 0;
    let remainingQuotaFinal = DAILY_PULL_LIMIT;
    if (userId !== 'guest') {
      newDailyCount = await storage.incrementUserDailyGachaCount(userId, itinerary.length);
      remainingQuotaFinal = DAILY_PULL_LIMIT - newDailyCount;
    }
    
    const isShortfall = itinerary.length < targetCount;
    const shortfallMessage = isShortfall 
      ? `${anchorDistrict || city}目前只有 ${itinerary.length} 個景點，我們正在努力擴充中！`
      : null;
    
    res.json({
      success: true,
      targetDistrict: anchorDistrict || city,
      city,
      country: '台灣',
      themeIntro,
      itinerary,
      couponsWon,
      meta: {
        city,
        anchorDistrict,
        pace,
        requestedCount: targetCount,
        totalPlaces: itinerary.length,
        isShortfall,
        shortfallMessage,
        totalCouponsWon: couponsWon.length,
        categoryDistribution: categoryStats,
        sortingMethod: aiReorderResult === 'reordered' ? 'ai_reordered' : 'coordinate',
        aiReorderResult,
        dailyLimit: DAILY_PULL_LIMIT,
        dailyPullCount: newDailyCount,
        remainingQuota: remainingQuotaFinal
      }
    });
  } catch (error) {
    console.error("[Gacha V3] Error:", error);
    
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return res.status(400).json({ 
        success: false,
        error: firstError?.message || "請求參數格式錯誤",
        code: "INVALID_PARAMS",
        details: error.errors
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: "扭蛋系統暫時無法使用，請稍後再試",
      code: "INTERNAL_ERROR"
    });
  }
});

export default router;

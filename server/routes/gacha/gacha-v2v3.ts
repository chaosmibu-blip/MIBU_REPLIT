import { Router } from "express";
import { z } from "zod";
import * as crypto from "crypto";
import { storage } from "../../storage";
import { isAuthenticated } from "../../replitAuth";
import { GACHA_DEDUP_LIMIT, guestSessionDedup, cleanupGuestSessions } from "../../lib/utils/gacha";
import { inferTimeSlot, sortPlacesByTimeSlot, type TimeSlot } from "../../lib/timeSlotInferrer";
import { getLocalizedDescription } from "./shared";

const router = Router();

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
    
    // 【修正】類別耗盡時，優先從同區補足（忽略去重），再從全城市補足
    if (remaining > 0 && selectedPlaces.length < targetCount) {
      console.log('[Gacha V3] Categories exhausted, need', remaining, 'more. Trying district without dedup...');
      
      // 第一層補救：從同區抽取，但忽略去重限制
      const districtPoolIgnoreDedup = anchorPlaces.filter(p => !usedIds.has(p.id));
      if (districtPoolIgnoreDedup.length > 0) {
        // Shuffle
        for (let i = districtPoolIgnoreDedup.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [districtPoolIgnoreDedup[i], districtPoolIgnoreDedup[j]] = [districtPoolIgnoreDedup[j], districtPoolIgnoreDedup[i]];
        }
        for (const p of districtPoolIgnoreDedup) {
          if (remaining <= 0) break;
          selectedPlaces.push(p);
          usedIds.add(p.id);
          remaining--;
          console.log('[Gacha V3] District fallback (any category):', p.placeName, p.category);
        }
      }
      
      // 第二層補救：從全城市補足
      if (remaining > 0 && anchorDistrict) {
        console.log('[Gacha V3] Still need', remaining, 'more. Falling back to city-wide...');
        const cityWidePlaces = await storage.getOfficialPlacesByCity(city, 300);
        const cityPool = cityWidePlaces.filter(p => !usedIds.has(p.id));
        
        for (let i = cityPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [cityPool[i], cityPool[j]] = [cityPool[j], cityPool[i]];
        }
        
        for (const p of cityPool) {
          if (remaining <= 0) break;
          selectedPlaces.push(p);
          usedIds.add(p.id);
          remaining--;
          console.log('[Gacha V3] City-wide fallback added:', p.placeName, p.district);
        }
      }
      
      // 第三層補救：完全忽略去重，從同區重新抽取
      if (remaining > 0) {
        console.log('[Gacha V3] Desperation mode: ignoring all dedup for', remaining, 'more places');
        const absolutePool = anchorPlaces.filter(p => !selectedPlaces.some(sp => sp.id === p.id));
        for (let i = absolutePool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [absolutePool[i], absolutePool[j]] = [absolutePool[j], absolutePool[i]];
        }
        for (const p of absolutePool) {
          if (remaining <= 0) break;
          selectedPlaces.push(p);
          remaining--;
          console.log('[Gacha V3] Desperation fallback:', p.placeName);
        }
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

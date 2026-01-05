import { Router } from "express";
import { storage } from "../../storage";
import { gachaRateLimiter } from "../../middleware/rateLimit";
import { generatePlaceForSubcategory, getLocalizedName } from "./shared";

const router = Router();

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
        'ai1_morning': { categories: [], subcategories: ['酒吧', 'KTV', '夜市'] },
        'ai2_afternoon': { categories: [], subcategories: ['早午餐'] },
        'ai3_evening': { categories: [], subcategories: ['早午餐', '咖啡廳'] },
        'ai4_night': { categories: [], subcategories: ['早午餐', '咖啡廳'] }
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
          s.category.code === 'food' && !s.nameZh.includes('宵夜') && !s.nameZh.includes('酒')
        );
        const fallback = allSubcategories.filter(s => s.category.code === 'food');
        const options = lunchSubcats.length > 0 ? lunchSubcats : fallback;
        return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
      } else if (taskType === 'dinner') {
        const dinnerSubcats = allSubcategories.filter(s => s.category.code === 'food' && !s.nameZh.includes('早'));
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
      const activityCategories = allCategories.filter(code => code !== 'food' && code !== 'stay');
      
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

    const cachedPlacesForDistrict = await storage.getCachedPlaces(districtNameZh, regionNameZh, countryNameZh);
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
          
          taskItems.push({ taskType: task.type, selectedSubcat, cached, shouldUseCache });
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
                category: selectedSubcat.category, subcategory: selectedSubcat,
                place: { name: cached.placeName, description: cached.description, place_id: cached.placeId,
                  verified_name: cached.verifiedName, verified_address: cached.verifiedAddress,
                  google_rating: cached.googleRating, lat: cached.locationLat, lng: cached.locationLng,
                  google_types: cached.googleTypes, primary_type: cached.primaryType },
                isVerified: cached.isLocationVerified, source: 'cache'
              });
              return { ...item, aiWorker: aiTask.worker, taskType };
            }
          } else {
            const item = await buildItemWithPromo({
              category: selectedSubcat.category, subcategory: selectedSubcat,
              place: { name: cached.placeName, description: cached.description, place_id: cached.placeId,
                verified_name: cached.verifiedName, verified_address: cached.verifiedAddress,
                google_rating: cached.googleRating, lat: cached.locationLat, lng: cached.locationLng,
                google_types: cached.googleTypes, primary_type: cached.primaryType },
              isVerified: cached.isLocationVerified, source: 'cache'
            });
            return { ...item, aiWorker: aiTask.worker, taskType };
          }
        }
        
        const result = await generatePlaceForSubcategory(
          districtNameZh, regionNameZh, countryNameZh,
          selectedSubcat.category, selectedSubcat, language, []
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
        return trimmed.replace(/[（(][^）)]*[）)]/g, '').replace(/旅遊服務園區|生態園區|園區|服務中心|遊客中心|觀光工廠|休閒農場/g, '').replace(/\s+/g, '').trim() || trimmed;
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
      return trimmed.replace(/[（(][^）)]*[）)]/g, '').replace(/旅遊服務園區|生態園區|園區|服務中心|遊客中心|觀光工廠|休閒農場/g, '').replace(/\s+/g, '').trim() || trimmed;
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
      
      const availableSubcats = allSubcategories.filter(s => !usedSubcatIds.has(s.id)).slice().sort(() => Math.random() - 0.5);
      
      for (const subcat of availableSubcats) {
        if (items.length >= itemCount || backfillAttempts >= maxBackfillAttempts) break;
        backfillAttempts++;
        
        console.log(`[Backfill] Trying: ${subcat.category?.nameZh} - ${subcat.nameZh}`);
        const result = await generatePlaceForSubcategory(districtNameZh, regionNameZh, countryNameZh, subcat.category, subcat, language, []);
        
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

export default router;

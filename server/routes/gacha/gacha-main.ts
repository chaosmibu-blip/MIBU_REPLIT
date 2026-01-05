import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../replitAuth";
import { ErrorCode, createErrorResponse } from "@shared/errors";
import { 
  searchPlaceInDistrict, 
  getDistrictBoundary
} from "../../lib/utils/google-places";
import { callGemini } from "../../lib/placeGenerator";
import {
  isWithinRadius,
  generateItinerarySkeleton,
  RECUR_API_URL,
  RECUR_PREMIUM_PLAN_ID,
  GOOGLE_MAPS_API_KEY
} from "./shared";

const router = Router();

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

export default router;

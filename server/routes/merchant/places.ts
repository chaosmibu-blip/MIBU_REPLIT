import { Router, isAuthenticated, storage, ErrorCode, createErrorResponse, z } from "./shared";
import { canAddPlaceCard } from "../../lib/merchantPermissions";

const router = Router();

// ============ Merchant Place Claim Routes ============

router.get("/search", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { query, district, city } = req.query;
    if (!query || (query as string).length < 2) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '搜尋字串至少需要 2 個字元'));
    }

    const places = await storage.searchPlacesForClaim(query as string, district as string, city as string);
    res.json({ places });
  } catch (error) {
    console.error("Place search error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '搜尋景點失敗'));
  }
});

router.post("/claim", isAuthenticated, async (req: any, res) => {
  try {
    console.log("[ClaimAPI] Request body:", JSON.stringify(req.body));

    const userId = req.user?.claims?.sub;
    if (!userId) {
      console.log("[ClaimAPI] No userId found");
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }
    console.log("[ClaimAPI] userId:", userId);

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      console.log("[ClaimAPI] No merchant found for userId:", userId);
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED, '需要商家帳號才能認領景點'));
    }
    console.log("[ClaimAPI] merchant:", merchant.id, merchant.businessName);

    // 權限檢查：是否可以新增景點
    const permission = await canAddPlaceCard(merchant.id);
    if (!permission.allowed) {
      return res.status(403).json(createErrorResponse(
        ErrorCode.PLACE_LIMIT_REACHED,
        `已達景點上限（${permission.current}/${permission.limit}），請升級方案`,
        { current: permission.current, limit: permission.limit }
      ));
    }

    let { placeName, district, city, country, placeCacheId, googlePlaceId } = req.body;
    console.log("[ClaimAPI] Parsed fields:", { placeName, district, city, country, placeCacheId, googlePlaceId });

    if (placeCacheId && typeof placeCacheId === 'string' && placeCacheId.startsWith('ChIJ')) {
      console.log("[ClaimAPI] Detected Google Place ID in placeCacheId field, moving to googlePlaceId");
      googlePlaceId = placeCacheId;
      placeCacheId = null;
    }

    if (placeCacheId && typeof placeCacheId === 'string') {
      const parsed = parseInt(placeCacheId, 10);
      placeCacheId = isNaN(parsed) ? null : parsed;
    }

    if (!placeName || !district || !city || !country) {
      console.log("[ClaimAPI] Missing fields:", { placeName: !!placeName, district: !!district, city: !!city, country: !!country });
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, '缺少必要欄位', { placeName: !!placeName, district: !!district, city: !!city, country: !!country }));
    }

    let existingLink = null;
    if (googlePlaceId) {
      existingLink = await storage.getPlaceLinkByGooglePlaceId(googlePlaceId);
    }
    if (!existingLink) {
      existingLink = await storage.getPlaceLinkByPlace(placeName, district, city);
    }

    if (existingLink) {
      console.log("[ClaimAPI] Place already claimed:", existingLink.id);
      return res.status(409).json(createErrorResponse(ErrorCode.ALREADY_CLAIMED, '此景點已被其他商家認領'));
    }

    console.log("[ClaimAPI] Creating link with:", { merchantId: merchant.id, placeCacheId, googlePlaceId, placeName, district, city, country });
    const link = await storage.createMerchantPlaceLink({
      merchantId: merchant.id,
      placeCacheId: placeCacheId || null,
      googlePlaceId: googlePlaceId || null,
      placeName,
      district,
      city,
      country,
      status: 'approved'
    });

    console.log("[ClaimAPI] Link created:", link.id);
    res.json({ success: true, link });
  } catch (error: any) {
    console.error("[ClaimAPI] Error:", error.message, error.stack);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '認領景點失敗', error.message));
  }
});

// 新增自有景點（待審核）
router.post("/new", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED, '需要商家帳號才能新增景點'));
    }

    // 權限檢查
    const permission = await canAddPlaceCard(merchant.id);
    if (!permission.allowed) {
      return res.status(403).json(createErrorResponse(
        ErrorCode.PLACE_LIMIT_REACHED,
        `已達景點上限（${permission.current}/${permission.limit}），請升級方案`,
        { current: permission.current, limit: permission.limit }
      ));
    }

    const newPlaceSchema = z.object({
      placeName: z.string().min(2, '景點名稱至少 2 個字'),
      district: z.string().min(1),
      city: z.string().min(1),
      country: z.string().min(1),
      address: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      description: z.string().optional(),
      googlePlaceId: z.string().optional(),
      locationLat: z.string().optional(),
      locationLng: z.string().optional(),
      // 新增營業時間相關欄位
      openingHours: z.object({
        weekdayText: z.array(z.string()).optional(),
        periods: z.array(z.any()).optional(),
      }).optional(),
      phone: z.string().max(50).optional(),
      website: z.string().url().optional(),
    });

    const validated = newPlaceSchema.parse(req.body);

    // 查詢地區 IDs
    const location = await storage.getDistrictByNames(validated.district, validated.city, validated.country);
    if (!location) {
      return res.status(400).json(createErrorResponse(ErrorCode.NO_DISTRICT_FOUND, '找不到對應的地區，請確認區域名稱'));
    }

    // 查詢或使用預設分類
    let categoryId: number;
    let subcategoryId: number;

    if (validated.category) {
      const category = await storage.getCategoryByNameZh(validated.category);
      if (!category) {
        return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '找不到對應的分類'));
      }
      categoryId = category.id;

      if (validated.subcategory) {
        const subcategory = await storage.getSubcategoryByNameZh(validated.subcategory, categoryId);
        if (!subcategory) {
          return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '找不到對應的子分類'));
        }
        subcategoryId = subcategory.id;
      } else {
        // 使用該分類的第一個子分類作為預設
        const subcategories = await storage.getSubcategoriesByCategory(categoryId);
        if (subcategories.length === 0) {
          return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '該分類沒有子分類'));
        }
        subcategoryId = subcategories[0].id;
      }
    } else {
      // 使用預設分類：購物
      const defaultCategory = await storage.getCategoryByCode('shopping');
      if (!defaultCategory) {
        return res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '系統分類配置錯誤'));
      }
      categoryId = defaultCategory.id;
      const subcategories = await storage.getSubcategoriesByCategory(categoryId);
      subcategoryId = subcategories.length > 0 ? subcategories[0].id : categoryId; // fallback
    }

    // 建立待審核的景點草稿
    const draft = await storage.createPlaceDraft({
      merchantId: merchant.id,
      placeName: validated.placeName,
      districtId: location.district.id,
      regionId: location.region.id,
      countryId: location.country.id,
      categoryId,
      subcategoryId,
      address: validated.address || null,
      description: validated.description || null,
      googlePlaceId: validated.googlePlaceId || null,
      locationLat: validated.locationLat || null,
      locationLng: validated.locationLng || null,
      status: 'pending', // 待審核
      source: 'merchant',
      // 營業時間相關欄位
      openingHours: validated.openingHours || null,
      phone: validated.phone || null,
      website: validated.website || null,
    });

    res.json({
      success: true,
      draft,
      message: '景點已提交審核，審核通過後將自動認領給您',
    });
  } catch (error: any) {
    console.error("Create new place error:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', error.errors));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '新增景點失敗'));
  }
});

router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const links = await storage.getMerchantPlaceLinks(merchant.id);
    res.json({ places: links });
  } catch (error) {
    console.error("Get merchant places error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得商家景點'));
  }
});

router.put("/:linkId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const linkId = parseInt(req.params.linkId);
    const { promoTitle, promoDescription, promoImageUrl, isPromoActive } = req.body;

    const updated = await storage.updateMerchantPlaceLink(linkId, {
      promoTitle,
      promoDescription,
      promoImageUrl,
      isPromoActive
    });

    // 當更新優惠資訊時，通知擁有該景點圖鑑的用戶
    if (updated && updated.officialPlaceId && (promoTitle || promoDescription)) {
      try {
        const notifiedCount = await storage.notifyCollectionHolders(updated.officialPlaceId);
        console.log(`[Notification] Notified ${notifiedCount} users about place ${updated.officialPlaceId} promo update`);
      } catch (notifyError) {
        console.error("[Notification] Failed to notify collection holders:", notifyError);
        // 不影響主要操作
      }
    }

    res.json({ success: true, link: updated });
  } catch (error) {
    console.error("Update merchant place error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法更新景點'));
  }
});

export default router;

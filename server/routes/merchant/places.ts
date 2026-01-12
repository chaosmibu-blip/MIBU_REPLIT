import { Router, isAuthenticated, storage, ErrorCode, createErrorResponse } from "./shared";

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

    res.json({ success: true, link: updated });
  } catch (error) {
    console.error("Update merchant place error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法更新景點'));
  }
});

export default router;

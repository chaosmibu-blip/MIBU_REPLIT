import { Router, isAuthenticated, storage, insertCouponSchema, ErrorCode, createErrorResponse, z } from "./shared";

const router = Router();

// ============ Coupon Routes ============

router.get("/merchant/:merchantId", isAuthenticated, async (req, res) => {
  try {
    const merchantId = parseInt(req.params.merchantId);
    const allCoupons = await storage.getMerchantCoupons(merchantId);
    res.json({ coupons: allCoupons });
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得優惠券'));
  }
});

router.post("/", isAuthenticated, async (req, res) => {
  try {
    const validated = insertCouponSchema.parse(req.body);
    const coupon = await storage.createCoupon(validated);
    res.json({ coupon });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', error.errors));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法建立優惠券'));
  }
});

router.patch("/:id", isAuthenticated, async (req, res) => {
  try {
    const couponId = parseInt(req.params.id);
    const coupon = await storage.updateCoupon(couponId, req.body);
    res.json({ coupon });
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法更新優惠券'));
  }
});

router.delete("/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const couponId = parseInt(req.params.id);
    if (isNaN(couponId)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '無效的優惠券 ID'));
    }

    // 確認優惠券存在且屬於該商家
    const coupon = await storage.getCouponById(couponId);
    if (!coupon) {
      return res.status(404).json(createErrorResponse(ErrorCode.COUPON_NOT_FOUND));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant || coupon.merchantId !== merchant.id) {
      return res.status(403).json(createErrorResponse(ErrorCode.FORBIDDEN, '無權限刪除此優惠券'));
    }

    // 軟刪除（設為 archived）
    await storage.updateCoupon(couponId, { archived: true, isActive: false });

    res.json({ success: true, message: "優惠券已刪除" });
  } catch (error) {
    console.error("Delete coupon error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '刪除優惠券失敗'));
  }
});

router.get("/region/:regionId/pool", async (req, res) => {
  try {
    const regionId = parseInt(req.params.regionId);
    if (isNaN(regionId)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的區域 ID'));
    }

    const coupons = await storage.getRegionPrizePoolCoupons(regionId);
    res.json({ coupons });
  } catch (error) {
    console.error("Failed to fetch prize pool:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得獎品池'));
  }
});

export default router;

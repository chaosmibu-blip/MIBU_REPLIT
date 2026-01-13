import { Router, isAuthenticated, storage, insertMerchantSchema, ErrorCode, createErrorResponse, z } from "./shared";

const router = Router();

// ============ Merchant Basic Routes ============

router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const merchant = await storage.getMerchantByUserId(userId);

    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    res.json({ merchant });
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得商家資料'));
  }
});

router.post("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const validated = insertMerchantSchema.parse({ ...req.body, userId });
    const merchant = await storage.createMerchant(validated);
    res.json({ merchant });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', error.errors));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法建立商家'));
  }
});

router.patch("/:id/plan", isAuthenticated, async (req, res) => {
  try {
    const merchantId = parseInt(req.params.id);
    const { plan } = req.body;

    if (!['free', 'partner', 'premium'].includes(plan)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的方案'));
    }

    const merchant = await storage.updateMerchantPlan(merchantId, plan);
    res.json({ merchant });
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法更新方案'));
  }
});

// ============ Merchant Registration ============

router.post("/register", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    let merchant = await storage.getMerchantByUserId(userId);
    if (merchant) {
      return res.json({ success: true, merchant, isNew: false });
    }

    const user = await storage.getUser(userId);
    const name = req.body.name || user?.firstName || 'Merchant';
    const email = req.body.email || user?.email || '';

    merchant = await storage.createMerchant({
      userId,
      name,
      email,
      subscriptionPlan: 'free'
    });

    res.json({ success: true, merchant, isNew: true });
  } catch (error) {
    console.error("Merchant registration error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法註冊商家'));
  }
});

router.get("/me", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.json({ merchant: null });
    }

    res.json({ merchant });
  } catch (error) {
    console.error("Get merchant error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得商家資料'));
  }
});

export default router;

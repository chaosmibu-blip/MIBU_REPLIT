import { Router, isAuthenticated, storage, ErrorCode, createErrorResponse, z, crypto } from "./shared";

const router = Router();

// ============ Merchant Daily Seed Code ============

router.get("/daily-code", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const existingCode = await storage.getMerchantDailySeedCode(merchant.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (existingCode && existingCode.updatedAt) {
      const codeDate = new Date(existingCode.updatedAt);
      codeDate.setHours(0, 0, 0, 0);

      if (codeDate.getTime() === today.getTime()) {
        return res.json({
          seedCode: existingCode.seedCode,
          updatedAt: existingCode.updatedAt,
          expiresAt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        });
      }
    }

    const newCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const updated = await storage.updateMerchantDailySeedCode(merchant.id, newCode);

    res.json({
      seedCode: newCode,
      updatedAt: updated?.codeUpdatedAt || new Date(),
      expiresAt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    });
  } catch (error) {
    console.error("Get daily code error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得核銷碼失敗'));
  }
});

router.post("/verify-code", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { merchantId, code } = req.body;
    if (!merchantId || !code) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'merchantId 和 code 為必填欄位'));
    }

    const codeData = await storage.getMerchantDailySeedCode(merchantId);
    if (!codeData) {
      return res.status(404).json(createErrorResponse(ErrorCode.NO_CODE_SET));
    }

    const today = new Date().toDateString();
    const codeDate = new Date(codeData.updatedAt).toDateString();
    if (codeDate !== today) {
      return res.status(400).json({ ...createErrorResponse(ErrorCode.CODE_EXPIRED), isValid: false });
    }

    const isValid = codeData.seedCode === code.toUpperCase();
    res.json({ isValid, merchantId });
  } catch (error) {
    console.error("Verify code error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '驗證失敗'));
  }
});

router.post("/verify", async (req, res) => {
  try {
    const verifySchema = z.object({
      merchantId: z.number(),
      code: z.string().min(1),
    });

    const validated = verifySchema.parse(req.body);

    const merchant = await storage.getMerchantById(validated.merchantId);
    if (!merchant) {
      return res.status(404).json({ ...createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND), valid: false });
    }

    const existingCode = await storage.getMerchantDailySeedCode(merchant.id);
    if (!existingCode) {
      return res.status(400).json({ ...createErrorResponse(ErrorCode.NO_CODE_SET), valid: false });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const codeDate = new Date(existingCode.updatedAt);
    codeDate.setHours(0, 0, 0, 0);

    if (codeDate.getTime() !== today.getTime()) {
      return res.status(400).json({ ...createErrorResponse(ErrorCode.CODE_EXPIRED), valid: false });
    }

    const isValid = existingCode.seedCode.toUpperCase() === validated.code.toUpperCase();

    if (isValid) {
      res.json({
        valid: true,
        merchantName: merchant.name,
        message: "核銷碼驗證成功"
      });
    } else {
      res.status(400).json({
        ...createErrorResponse(ErrorCode.INVALID_CODE),
        valid: false
      });
    }
  } catch (error: any) {
    console.error("Verify code error:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ ...createErrorResponse(ErrorCode.VALIDATION_ERROR), valid: false });
    }
    res.status(500).json({ ...createErrorResponse(ErrorCode.SERVER_ERROR, '驗證失敗'), valid: false });
  }
});

export default router;

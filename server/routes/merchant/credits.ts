import { Router, isAuthenticated, storage, ErrorCode, createErrorResponse, z } from "./shared";

const router = Router();

// ============ Merchant Credits ============

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

    res.json({
      creditBalance: merchant.creditBalance || 0,
      subscriptionPlan: merchant.subscriptionPlan
    });
  } catch (error) {
    console.error("Get credits error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得點數'));
  }
});

router.post("/purchase", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const purchaseSchema = z.object({
      amount: z.number().min(100).max(100000),
      provider: z.enum(['stripe', 'recur']),
      successUrl: z.string().url().optional(),
      cancelUrl: z.string().url().optional(),
    });

    const validated = purchaseSchema.parse(req.body);
    const price = validated.amount;

    if (validated.provider === 'stripe') {
      const { stripeService } = await import('../../stripeService');
      const { getStripePublishableKey } = await import('../../stripeClient');

      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPLIT_DOMAINS?.split(',')[0]
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'https://localhost:5000';

      const successUrl = validated.successUrl || `${baseUrl}/merchant/credits/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = validated.cancelUrl || `${baseUrl}/merchant/credits`;

      const transaction = await storage.createTransaction({
        merchantId: merchant.id,
        amount: validated.amount,
        price: price,
        provider: 'stripe',
        paymentStatus: 'pending',
        paymentMethod: 'stripe_checkout',
      });

      const paymentIntent = await stripeService.createPaymentIntent(
        price * 100,
        'twd',
        merchant.userId,
        {
          transactionId: transaction.id.toString(),
          merchantId: merchant.id.toString(),
          credits: validated.amount.toString(),
        }
      );

      res.json({
        provider: 'stripe',
        transactionId: transaction.id,
        clientSecret: paymentIntent.client_secret,
        publishableKey: await getStripePublishableKey(),
        amount: validated.amount,
        price: price,
      });
    } else if (validated.provider === 'recur') {
      const transaction = await storage.createTransaction({
        merchantId: merchant.id,
        amount: validated.amount,
        price: price,
        provider: 'recur',
        paymentStatus: 'pending',
        paymentMethod: 'recur_pay',
      });

      res.json({
        provider: 'recur',
        transactionId: transaction.id,
        amount: validated.amount,
        price: price,
        message: "請使用 Recur 支付介面完成付款",
      });
    }
  } catch (error: any) {
    console.error("Purchase credits error:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '購買失敗'));
  }
});

router.post("/confirm", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const { transactionId, externalOrderId } = req.body;

    const transaction = await storage.getTransactionById(transactionId);
    if (!transaction || transaction.merchantId !== merchant.id) {
      return res.status(404).json(createErrorResponse(ErrorCode.TRANSACTION_NOT_FOUND));
    }

    if (transaction.paymentStatus === 'paid') {
      return res.status(400).json(createErrorResponse(ErrorCode.ALREADY_COMPLETED, '此交易已完成'));
    }

    await storage.updateTransactionStatus(transactionId, 'paid');
    await storage.updateMerchantCreditBalance(merchant.id, transaction.amount);

    res.json({
      success: true,
      creditsAdded: transaction.amount,
      newBalance: (merchant.creditBalance || 0) + transaction.amount,
    });
  } catch (error) {
    console.error("Confirm credits error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '確認付款失敗'));
  }
});

// Transactions router (mounted separately at /api/merchant)
const transactionsRouter = Router();

transactionsRouter.get("/transactions", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const transactions = await storage.getTransactionsByMerchantId(merchant.id);
    res.json({ transactions });
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得交易紀錄'));
  }
});

export default router;
export { transactionsRouter };

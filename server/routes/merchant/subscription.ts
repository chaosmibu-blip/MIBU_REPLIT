import {
  Router,
  isAuthenticated,
  storage,
  subscriptionStorage,
  refundStorage,
  InsertRefundRequest,
  ErrorCode,
  createErrorResponse,
  getUncachableStripeClient,
  getMerchantTier,
  MERCHANT_TIER_LIMITS,
  PLACE_CARD_TIER_LIMITS,
  SUBSCRIPTION_PRICES,
  RECUR_CONFIG,
} from "./shared";

const router = Router();

// ============ Subscription API ============

router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    const tier = await getMerchantTier(merchant.id);
    const limits = MERCHANT_TIER_LIMITS[tier];
    const activeSubscription = await subscriptionStorage.getMerchantActiveSubscription(merchant.id, 'merchant');

    res.json({
      merchantId: merchant.id,
      merchantLevel: tier,
      merchantLevelExpiresAt: merchant.merchantLevelExpiresAt,
      limits,
      subscription: activeSubscription ? {
        id: activeSubscription.id,
        tier: activeSubscription.tier,
        status: activeSubscription.status,
        currentPeriodEnd: activeSubscription.currentPeriodEnd,
        cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
      } : null,
    });
  } catch (error) {
    console.error("Get subscription error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得訂閱資料'));
  }
});

router.get("/history", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    const subscriptions = await subscriptionStorage.getMerchantSubscriptions(merchant.id);

    res.json({ subscriptions });
  } catch (error) {
    console.error("Get subscription history error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得訂閱歷史'));
  }
});

router.post("/checkout", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    const {
      type: rawType,
      tier: rawTier,
      placeId,
      provider = 'recur',
      successUrl,
      cancelUrl,
      planId,
      billingInterval
    } = req.body;

    let type = rawType;
    let tier = rawTier;

    if (planId && !tier) {
      tier = planId;
      type = type || 'merchant';
    }

    if (!type || !tier) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'type 和 tier (或 planId) 為必填'));
    }

    if (!['merchant', 'place'].includes(type)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的訂閱類型'));
    }

    if (!['pro', 'premium', 'partner'].includes(tier)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的等級'));
    }

    if (type === 'place' && !placeId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, '景點訂閱需要 placeId'));
    }

    const tierKey = tier === 'partner' ? 'premium' : tier;
    const priceConfig = SUBSCRIPTION_PRICES[type as 'merchant' | 'place'][tierKey as 'pro' | 'premium'];

    if (provider === 'stripe') {
      const stripe = await getUncachableStripeClient();

      let customerId = merchant.stripeCustomerId;
      if (!customerId) {
        const user = await storage.getUser(userId);
        const customer = await stripe.customers.create({
          email: user?.email || merchant.email,
          metadata: { merchantId: merchant.id.toString(), userId },
        });
        customerId = customer.id;
        await subscriptionStorage.updateMerchantStripeCustomerId(merchant.id, customerId);
      }

      const priceId = priceConfig.stripe;
      if (!priceId) {
        return res.status(400).json(createErrorResponse(ErrorCode.PAYMENT_NOT_CONFIGURED, '此等級尚未設定 Stripe 價格'));
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: successUrl || `${req.protocol}://${req.get('host')}/merchant/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${req.protocol}://${req.get('host')}/merchant/subscription/cancel`,
        metadata: {
          type,
          tier,
          merchantId: merchant.id.toString(),
          placeId: placeId?.toString() || '',
        },
      });

      res.json({ url: session.url, checkoutUrl: session.url, sessionId: session.id });
    } else if (provider === 'recur') {
      const productId = priceConfig.recur;
      if (!productId) {
        return res.status(400).json(createErrorResponse(ErrorCode.PAYMENT_NOT_CONFIGURED, '此等級尚未設定 Recur 商品'));
      }

      const user = await storage.getUser(userId);
      const customerEmail = user?.email || merchant.email;

      const externalCustomerId = `mibu_m${merchant.id}_${type}_${tier}${placeId ? `_p${placeId}` : ''}`;

      await subscriptionStorage.updateMerchantRecurCustomerId(merchant.id, externalCustomerId);

      res.json({
        provider: 'recur',
        productId,
        publishableKey: RECUR_CONFIG.publishableKey,
        customerEmail,
        externalCustomerId,
        successUrl: successUrl || `/merchant/subscription/success?provider=recur&mid=${merchant.id}&type=${type}&tier=${tier}${placeId ? `&pid=${placeId}` : ''}`,
        cancelUrl: cancelUrl || `/merchant/subscription/cancel`,
      });
    } else {
      res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的支付提供者'));
    }
  } catch (error) {
    console.error("Create checkout error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法建立結帳工作階段'));
  }
});

router.post("/cancel", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    const { subscriptionId } = req.body;
    if (!subscriptionId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'subscriptionId 為必填'));
    }

    const subscription = await subscriptionStorage.getSubscriptionById(subscriptionId);
    if (!subscription || subscription.merchantId !== merchant.id) {
      return res.status(404).json(createErrorResponse(ErrorCode.SUBSCRIPTION_NOT_FOUND));
    }

    if (subscription.provider === 'stripe') {
      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.update(subscription.providerSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    const updated = await subscriptionStorage.cancelSubscription(subscriptionId);

    res.json({ success: true, subscription: updated });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取消訂閱'));
  }
});

router.post("/upgrade", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    const { subscriptionId, newTier, successUrl, cancelUrl } = req.body;

    if (!subscriptionId || !newTier) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'subscriptionId 和 newTier 為必填'));
    }

    const subscription = await subscriptionStorage.getSubscriptionById(subscriptionId);
    if (!subscription || subscription.merchantId !== merchant.id) {
      return res.status(404).json(createErrorResponse(ErrorCode.SUBSCRIPTION_NOT_FOUND));
    }

    if (subscription.provider === 'stripe' && merchant.stripeCustomerId) {
      const stripe = await getUncachableStripeClient();

      const portal = await stripe.billingPortal.sessions.create({
        customer: merchant.stripeCustomerId,
        return_url: successUrl || `${req.protocol}://${req.get('host')}/merchant/subscription`,
      });

      res.json({ url: portal.url });
    } else {
      res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '目前的支付提供者不支援升級'));
    }
  } catch (error) {
    console.error("Upgrade subscription error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法升級訂閱'));
  }
});

router.post("/refund-request", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    const { subscriptionId, reason } = req.body;
    if (!subscriptionId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'subscriptionId 為必填'));
    }
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '請提供至少 10 字的退款原因'));
    }

    const subscription = await subscriptionStorage.getSubscriptionById(subscriptionId);
    if (!subscription || subscription.merchantId !== merchant.id) {
      return res.status(404).json(createErrorResponse(ErrorCode.SUBSCRIPTION_NOT_FOUND));
    }

    const createdAt = subscription.createdAt ? new Date(subscription.createdAt) : null;
    const now = new Date();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const msSinceCreation = createdAt ? now.getTime() - createdAt.getTime() : null;
    const daysSinceCreation = msSinceCreation !== null ? Math.floor(msSinceCreation / (1000 * 60 * 60 * 24)) : null;

    const isEligibleFor7DayRefund = msSinceCreation !== null && msSinceCreation <= SEVEN_DAYS_MS;

    const eligibility = {
      isEligible: isEligibleFor7DayRefund,
      reason: isEligibleFor7DayRefund
        ? '符合 7 天鑑賞期退款條件'
        : '已超過 7 天鑑賞期，需人工審核',
      daysSinceCreation,
      hoursRemaining: isEligibleFor7DayRefund && msSinceCreation !== null
        ? Math.floor((SEVEN_DAYS_MS - msSinceCreation) / (1000 * 60 * 60))
        : 0,
      subscriptionStatus: subscription.status,
      provider: subscription.provider,
    };

    console.log(`[Refund Request] Merchant ${merchant.id}, Subscription ${subscriptionId}, Eligible: ${isEligibleFor7DayRefund}, Days: ${daysSinceCreation}, MS: ${msSinceCreation}`);

    const baseRefundData: InsertRefundRequest = {
      subscriptionId,
      merchantId: merchant.id,
      reason: reason.trim(),
      daysSinceSubscription: daysSinceCreation,
      isWithin7Days: isEligibleFor7DayRefund,
      provider: subscription.provider,
    };

    if (isEligibleFor7DayRefund) {
      if (subscription.provider === 'stripe' && subscription.providerSubscriptionId) {
        try {
          const stripe = await getUncachableStripeClient();

          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.providerSubscriptionId);
          const latestInvoiceId = stripeSubscription.latest_invoice;

          let refundCreated = false;
          let refundId: string | null = null;
          let chargeId: string | null = null;
          let refundAmount: number | null = null;

          if (latestInvoiceId && typeof latestInvoiceId === 'string') {
            const invoice = await stripe.invoices.retrieve(latestInvoiceId);
            const invoiceCharge = (invoice as any).charge;
            chargeId = typeof invoiceCharge === 'string' ? invoiceCharge : null;

            if (chargeId) {
              const refund = await stripe.refunds.create({
                charge: chargeId,
                reason: 'requested_by_customer',
              });
              refundCreated = true;
              refundId = refund.id;
              refundAmount = refund.amount;
              console.log(`[Refund] Created Stripe refund ${refund.id} for charge ${chargeId}, amount: ${refund.amount}`);
            }
          }

          await stripe.subscriptions.cancel(subscription.providerSubscriptionId);

          await subscriptionStorage.updateSubscription(subscriptionId, {
            status: 'cancelled',
            cancelledAt: new Date(),
          });

          const refundRequest = await refundStorage.createRefundRequest({
            ...baseRefundData,
            status: refundCreated ? 'approved' : 'manual_review',
            stripeRefundId: refundId,
            stripeChargeId: chargeId,
            refundAmount,
            refundCurrency: 'TWD',
            processedAt: refundCreated ? new Date() : undefined,
          });

          console.log(`[Refund] Stripe subscription ${subscription.providerSubscriptionId} cancelled, refund: ${refundCreated ? refundId : 'N/A'}, request ID: ${refundRequest.id}`);

          res.json({
            success: true,
            message: refundCreated
              ? '退款申請已通過，款項將在 5-10 個工作天內退回原付款方式'
              : '訂閱已取消，如有付款記錄將由客服處理退款',
            eligibility,
            refundStatus: refundCreated ? 'approved' : 'pending_manual_review',
            refundId,
            requestId: refundRequest.id,
          });
        } catch (stripeError: any) {
          console.error('[Refund] Stripe error:', stripeError);

          const refundRequest = await refundStorage.createRefundRequest({
            ...baseRefundData,
            status: 'manual_review',
            adminNotes: `Stripe error: ${stripeError.message}`,
          });

          res.json({
            success: false,
            message: '自動退款處理失敗，已轉人工處理，客服將於 1-2 個工作天內聯繫您',
            eligibility,
            refundStatus: 'pending_manual_review',
            error: stripeError.message,
            requestId: refundRequest.id,
          });
        }
      } else if (subscription.provider === 'recur') {
        await subscriptionStorage.updateSubscription(subscriptionId, {
          status: 'cancelled',
          cancelledAt: new Date(),
        });

        const refundRequest = await refundStorage.createRefundRequest({
          ...baseRefundData,
          status: 'manual_review',
          adminNotes: 'Recur 退款需人工處理',
        });

        console.log(`[Refund] Recur subscription ${subscriptionId} marked for manual refund processing, request ID: ${refundRequest.id}`);

        res.json({
          success: true,
          message: '退款申請已提交，Recur 退款需人工處理，客服將於 1-2 個工作天內聯繫您',
          eligibility,
          refundStatus: 'pending_manual_review',
          note: 'Recur 退款需透過後台人工處理',
          requestId: refundRequest.id,
        });
      } else {
        const refundRequest = await refundStorage.createRefundRequest({
          ...baseRefundData,
          status: 'manual_review',
          adminNotes: '未知支付提供者',
        });

        res.json({
          success: false,
          message: '無法處理此訂閱的退款，請聯繫客服',
          eligibility,
          refundStatus: 'error',
          requestId: refundRequest.id,
        });
      }
    } else {
      const refundRequest = await refundStorage.createRefundRequest({
        ...baseRefundData,
        status: 'rejected',
        adminNotes: '已超過 7 天鑑賞期',
      });

      res.json({
        success: false,
        message: '已超過 7 天鑑賞期，無法自動退款。如有特殊情況，請聯繫客服。',
        eligibility,
        refundStatus: 'not_eligible',
        contactEmail: 'support@mibu-travel.com',
        requestId: refundRequest.id,
      });
    }
  } catch (error) {
    console.error("Refund request error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法處理退款請求'));
  }
});

router.get("/refund-eligibility", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    const subscriptionId = req.query.subscriptionId as string;
    if (!subscriptionId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'subscriptionId 查詢參數為必填'));
    }

    const subscription = await subscriptionStorage.getSubscriptionById(parseInt(subscriptionId));
    if (!subscription || subscription.merchantId !== merchant.id) {
      return res.status(404).json(createErrorResponse(ErrorCode.SUBSCRIPTION_NOT_FOUND));
    }

    const createdAt = subscription.createdAt ? new Date(subscription.createdAt) : null;
    const now = new Date();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const msSinceCreation = createdAt ? now.getTime() - createdAt.getTime() : null;
    const daysSinceCreation = msSinceCreation !== null
      ? Math.floor(msSinceCreation / (1000 * 60 * 60 * 24))
      : null;

    const isEligibleFor7DayRefund = msSinceCreation !== null && msSinceCreation <= SEVEN_DAYS_MS;
    const hoursRemaining = isEligibleFor7DayRefund && msSinceCreation !== null
      ? Math.floor((SEVEN_DAYS_MS - msSinceCreation) / (1000 * 60 * 60))
      : 0;

    res.json({
      subscriptionId: subscription.id,
      provider: subscription.provider,
      tier: subscription.tier,
      status: subscription.status,
      createdAt: subscription.createdAt,
      daysSinceCreation,
      refundEligibility: {
        isEligible: isEligibleFor7DayRefund,
        reason: isEligibleFor7DayRefund
          ? '符合 7 天鑑賞期，可申請全額退款'
          : '已超過 7 天鑑賞期，需人工審核',
        hoursRemaining,
        daysRemaining: Math.floor(hoursRemaining / 24),
      },
      cancellationPolicy: {
        canCancel: subscription.status === 'active',
        note: '取消後服務持續至當期結束',
      },
    });
  } catch (error) {
    console.error("Check refund eligibility error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法檢查退款資格'));
  }
});

// Permissions router (mounted separately at /api/merchant)
const permissionsRouter = Router();

permissionsRouter.get("/permissions", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    const tier = await getMerchantTier(merchant.id);
    const limits = MERCHANT_TIER_LIMITS[tier];

    res.json({
      merchantTier: tier,
      maxPlaces: limits.maxPlaces,
      hasAnalytics: limits.analytics,
      tierLimits: MERCHANT_TIER_LIMITS,
      placeCardTierLimits: PLACE_CARD_TIER_LIMITS,
    });
  } catch (error) {
    console.error("Get permissions error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得權限資料'));
  }
});

export default router;
export { permissionsRouter };

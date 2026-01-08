import { Router } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { subscriptionStorage } from "../storage/subscriptionStorage";
import { insertMerchantSchema, insertCouponSchema } from "@shared/schema";
import { ErrorCode, createErrorResponse } from "@shared/errors";
import { z } from "zod";
import crypto from "crypto";
import { getUncachableStripeClient } from "../stripeClient";
import { getMerchantTier, getPlaceCardTier, MERCHANT_TIER_LIMITS, PLACE_CARD_TIER_LIMITS, hasAnalyticsAccess } from "../lib/merchantPermissions";

const router = Router();

// ============ Merchant Basic Routes ============

router.get("/api/merchant", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const merchant = await storage.getMerchantByUserId(userId);
    
    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }
    
    res.json({ merchant });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch merchant" });
  }
});

router.post("/api/merchant", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const validated = insertMerchantSchema.parse({ ...req.body, userId });
    const merchant = await storage.createMerchant(validated);
    res.json({ merchant });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to create merchant" });
  }
});

router.patch("/api/merchant/:id/plan", isAuthenticated, async (req, res) => {
  try {
    const merchantId = parseInt(req.params.id);
    const { plan } = req.body;
    
    if (!['free', 'partner', 'premium'].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    
    const merchant = await storage.updateMerchantPlan(merchantId, plan);
    res.json({ merchant });
  } catch (error) {
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// ============ Coupon Routes ============

router.get("/api/coupons/merchant/:merchantId", isAuthenticated, async (req, res) => {
  try {
    const merchantId = parseInt(req.params.merchantId);
    const allCoupons = await storage.getMerchantCoupons(merchantId);
    res.json({ coupons: allCoupons });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

router.post("/api/coupons", isAuthenticated, async (req, res) => {
  try {
    const validated = insertCouponSchema.parse(req.body);
    const coupon = await storage.createCoupon(validated);
    res.json({ coupon });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to create coupon" });
  }
});

router.patch("/api/coupons/:id", isAuthenticated, async (req, res) => {
  try {
    const couponId = parseInt(req.params.id);
    const coupon = await storage.updateCoupon(couponId, req.body);
    res.json({ coupon });
  } catch (error) {
    res.status(500).json({ error: "Failed to update coupon" });
  }
});

router.get("/api/coupons/region/:regionId/pool", async (req, res) => {
  try {
    const regionId = parseInt(req.params.regionId);
    if (isNaN(regionId)) {
      return res.status(400).json({ error: "Invalid region ID" });
    }
    
    const coupons = await storage.getRegionPrizePoolCoupons(regionId);
    res.json({ coupons });
  } catch (error) {
    console.error("Failed to fetch prize pool:", error);
    res.status(500).json({ error: "Failed to fetch prize pool" });
  }
});

// ============ Merchant Registration ============

router.post("/api/merchant/register", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
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
    res.status(500).json({ error: "Failed to register merchant" });
  }
});

router.get("/api/merchant/me", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.json({ merchant: null });
    }

    res.json({ merchant });
  } catch (error) {
    console.error("Get merchant error:", error);
    res.status(500).json({ error: "Failed to get merchant info" });
  }
});

// ============ Merchant Daily Seed Code ============

router.get("/api/merchant/daily-code", isAuthenticated, async (req: any, res) => {
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
    res.status(500).json({ error: "取得核銷碼失敗", code: "SERVER_ERROR" });
  }
});

router.post("/api/merchant/verify-code", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { merchantId, code } = req.body;
    if (!merchantId || !code) {
      return res.status(400).json({ error: "merchantId and code are required" });
    }

    const codeData = await storage.getMerchantDailySeedCode(merchantId);
    if (!codeData) {
      return res.status(404).json({ error: "No code found for this merchant" });
    }

    const today = new Date().toDateString();
    const codeDate = new Date(codeData.updatedAt).toDateString();
    if (codeDate !== today) {
      return res.status(400).json({ error: "Code has expired", isValid: false });
    }

    const isValid = codeData.seedCode === code.toUpperCase();
    res.json({ isValid, merchantId });
  } catch (error) {
    console.error("Verify code error:", error);
    res.status(500).json({ error: "Failed to verify code" });
  }
});

router.post("/api/merchant/verify", async (req, res) => {
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
        error: "核銷碼錯誤", 
        code: "INVALID_CODE", 
        valid: false 
      });
    }
  } catch (error: any) {
    console.error("Verify code error:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "輸入資料格式錯誤", code: "VALIDATION_ERROR", valid: false });
    }
    res.status(500).json({ error: "驗證失敗", code: "SERVER_ERROR", valid: false });
  }
});

// ============ Merchant Credits ============

router.get("/api/merchant/credits", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json({ error: "Merchant registration required" });
    }

    res.json({ 
      creditBalance: merchant.creditBalance || 0,
      subscriptionPlan: merchant.subscriptionPlan 
    });
  } catch (error) {
    console.error("Get credits error:", error);
    res.status(500).json({ error: "Failed to get credits" });
  }
});

router.post("/api/merchant/credits/purchase", isAuthenticated, async (req: any, res) => {
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
      const { stripeService } = await import('../stripeService');
      const { getStripePublishableKey } = await import('../stripeClient');
      
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
      return res.status(400).json({ error: "輸入資料格式錯誤", code: "VALIDATION_ERROR" });
    }
    res.status(500).json({ error: "購買失敗", code: "SERVER_ERROR" });
  }
});

router.post("/api/merchant/credits/confirm", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json({ error: "商家帳號必要" });
    }

    const { transactionId, externalOrderId } = req.body;
    
    const transaction = await storage.getTransactionById(transactionId);
    if (!transaction || transaction.merchantId !== merchant.id) {
      return res.status(404).json({ error: "交易不存在" });
    }

    if (transaction.paymentStatus === 'paid') {
      return res.status(400).json({ error: "此交易已完成" });
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
    res.status(500).json({ error: "確認付款失敗" });
  }
});

router.get("/api/merchant/transactions", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json({ error: "Merchant registration required" });
    }

    const transactions = await storage.getTransactionsByMerchantId(merchant.id);
    res.json({ transactions });
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json({ error: "Failed to get transactions" });
  }
});

// ============ Merchant Place Claim Routes ============

router.get("/api/merchant/places/search", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { query, district, city } = req.query;
    if (!query || (query as string).length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" });
    }

    const places = await storage.searchPlacesForClaim(query as string, district as string, city as string);
    res.json({ places });
  } catch (error) {
    console.error("Place search error:", error);
    res.status(500).json({ error: "Failed to search places" });
  }
});

router.post("/api/merchant/places/claim", isAuthenticated, async (req: any, res) => {
  try {
    console.log("[ClaimAPI] Request body:", JSON.stringify(req.body));
    
    const userId = req.user?.claims?.sub;
    if (!userId) {
      console.log("[ClaimAPI] No userId found");
      return res.status(401).json({ error: "Authentication required" });
    }
    console.log("[ClaimAPI] userId:", userId);

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      console.log("[ClaimAPI] No merchant found for userId:", userId);
      return res.status(403).json({ error: "You must be a registered merchant to claim places" });
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
      return res.status(400).json({ error: "Missing required fields", details: { placeName: !!placeName, district: !!district, city: !!city, country: !!country } });
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
      return res.status(409).json({ error: "This place is already claimed by another merchant" });
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
    res.status(500).json({ error: "Failed to claim place", details: error.message });
  }
});

router.get("/api/merchant/places", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json({ error: "Merchant account required" });
    }

    const links = await storage.getMerchantPlaceLinks(merchant.id);
    res.json({ places: links });
  } catch (error) {
    console.error("Get merchant places error:", error);
    res.status(500).json({ error: "Failed to get merchant places" });
  }
});

router.put("/api/merchant/places/:linkId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json({ error: "Merchant account required" });
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
    res.status(500).json({ error: "Failed to update place" });
  }
});

// ============ Merchant Products Routes ============

router.get("/api/merchant/products", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json({ error: "Merchant account required" });
    }

    const products = await storage.getMerchantProducts(merchant.id);
    res.json({ products });
  } catch (error) {
    console.error("Get merchant products error:", error);
    res.status(500).json({ error: "Failed to get products" });
  }
});

router.post("/api/merchant/products", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json({ error: "Merchant account required" });
    }

    const { name, description, price, category, imageUrl, stock } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: "Name and price are required" });
    }

    const product = await storage.createProduct({
      merchantId: merchant.id,
      name,
      description: description || null,
      price: parseInt(price),
      currency: 'TWD',
      category: category || null,
      imageUrl: imageUrl || null,
      isActive: true,
      stock: stock ? parseInt(stock) : null
    });

    res.json({ success: true, product });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.put("/api/merchant/products/:productId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json({ error: "Merchant account required" });
    }

    const productId = parseInt(req.params.productId);
    const existing = await storage.getProductById(productId);
    if (!existing || existing.merchantId !== merchant.id) {
      return res.status(404).json({ error: "Product not found" });
    }

    const { name, description, price, category, imageUrl, isActive, stock } = req.body;
    const updated = await storage.updateProduct(productId, {
      name,
      description,
      price: price !== undefined ? parseInt(price) : undefined,
      category,
      imageUrl,
      isActive,
      stock: stock !== undefined ? parseInt(stock) : undefined
    });

    res.json({ success: true, product: updated });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.delete("/api/merchant/products/:productId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json({ error: "Merchant account required" });
    }

    const productId = parseInt(req.params.productId);
    const existing = await storage.getProductById(productId);
    if (!existing || existing.merchantId !== merchant.id) {
      return res.status(404).json({ error: "Product not found" });
    }

    await storage.deleteProduct(productId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// ============ Subscription API ============

const SUBSCRIPTION_PRICES = {
  merchant: {
    pro: { 
      stripe: process.env.STRIPE_MERCHANT_PRO_PRICE_ID, 
      recur: process.env.RECUR_MERCHANT_PRO_PRODUCT_ID || 'fpbnn9ah9090j7hxx5wcv7f4',
      amount: 29900, 
      currency: 'TWD' 
    },
    premium: { 
      stripe: process.env.STRIPE_MERCHANT_PREMIUM_PRICE_ID, 
      recur: process.env.RECUR_MERCHANT_PREMIUM_PRODUCT_ID || 'adkwbl9dya0wc6b53parl9yk',
      amount: 79900, 
      currency: 'TWD' 
    },
  },
  place: {
    pro: { 
      stripe: process.env.STRIPE_PLACE_PRO_PRICE_ID, 
      recur: process.env.RECUR_PLACE_PRO_PRODUCT_ID,
      amount: 19900, 
      currency: 'TWD' 
    },
    premium: { 
      stripe: process.env.STRIPE_PLACE_PREMIUM_PRICE_ID, 
      recur: process.env.RECUR_PLACE_PREMIUM_PRODUCT_ID,
      amount: 39900, 
      currency: 'TWD' 
    },
  },
} as const;

const RECUR_CONFIG = {
  publishableKey: process.env.RECUR_PUBLISHABLE_KEY,
};

router.get("/api/merchant/subscription", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
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
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

router.get("/api/merchant/subscription/history", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }

    const subscriptions = await subscriptionStorage.getMerchantSubscriptions(merchant.id);

    res.json({ subscriptions });
  } catch (error) {
    console.error("Get subscription history error:", error);
    res.status(500).json({ error: "Failed to fetch subscription history" });
  }
});

router.post("/api/merchant/subscription/checkout", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
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
      return res.status(400).json({ error: "type and tier (or planId) are required" });
    }

    if (!['merchant', 'place'].includes(type)) {
      return res.status(400).json({ error: "Invalid subscription type" });
    }

    if (!['pro', 'premium', 'partner'].includes(tier)) {
      return res.status(400).json({ error: "Invalid tier" });
    }

    if (type === 'place' && !placeId) {
      return res.status(400).json({ error: "placeId is required for place subscription" });
    }

    const tierKey = tier === 'partner' ? 'premium' : tier;
    const priceConfig = SUBSCRIPTION_PRICES[type as 'merchant' | 'place'][tierKey as 'pro' | 'premium'];

    if (provider === 'stripe') {
      const stripe = await getUncachableStripeClient();
      if (!stripe) {
        return res.status(400).json({ error: "Stripe is not configured. Please use Recur for payments." });
      }

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
        return res.status(400).json({ error: "Stripe price not configured for this tier" });
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
        return res.status(400).json({ error: "Recur product not configured for this tier" });
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
      res.status(400).json({ error: "Invalid payment provider" });
    }
  } catch (error) {
    console.error("Create checkout error:", error);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/api/merchant/subscription/cancel", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }

    const { subscriptionId } = req.body;
    if (!subscriptionId) {
      return res.status(400).json({ error: "subscriptionId is required" });
    }

    const subscription = await subscriptionStorage.getSubscriptionById(subscriptionId);
    if (!subscription || subscription.merchantId !== merchant.id) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    if (subscription.provider === 'stripe') {
      const stripe = await getUncachableStripeClient();
      if (stripe) {
        await stripe.subscriptions.update(subscription.providerSubscriptionId, {
          cancel_at_period_end: true,
        });
      }
    }

    const updated = await subscriptionStorage.cancelSubscription(subscriptionId);

    res.json({ success: true, subscription: updated });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

router.post("/api/merchant/subscription/upgrade", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }

    const { subscriptionId, newTier, successUrl, cancelUrl } = req.body;

    if (!subscriptionId || !newTier) {
      return res.status(400).json({ error: "subscriptionId and newTier are required" });
    }

    const subscription = await subscriptionStorage.getSubscriptionById(subscriptionId);
    if (!subscription || subscription.merchantId !== merchant.id) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    if (subscription.provider === 'stripe' && merchant.stripeCustomerId) {
      const stripe = await getUncachableStripeClient();
      if (!stripe) {
        return res.status(400).json({ error: "Stripe is not configured" });
      }

      const portal = await stripe.billingPortal.sessions.create({
        customer: merchant.stripeCustomerId,
        return_url: successUrl || `${req.protocol}://${req.get('host')}/merchant/subscription`,
      });

      res.json({ url: portal.url });
    } else {
      res.status(400).json({ error: "Cannot upgrade subscription with current provider" });
    }
  } catch (error) {
    console.error("Upgrade subscription error:", error);
    res.status(500).json({ error: "Failed to upgrade subscription" });
  }
});

router.get("/api/merchant/permissions", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
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
    res.status(500).json({ error: "Failed to fetch permissions" });
  }
});

export default router;

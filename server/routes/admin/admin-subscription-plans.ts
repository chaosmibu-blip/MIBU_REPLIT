import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { subscriptionPlans, insertSubscriptionPlanSchema } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { hasAdminAccess } from "./shared";
import { ErrorCode, createErrorResponse } from "@shared/errors";

// 管理 Router（掛載在 /admin 下）
const adminRouter = Router();
// 公開 Router（掛載在根目錄）
const publicRouter = Router();

// 中間件：驗證管理員權限（支援 query key 或 session）
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const queryKey = req.query.key as string;
  const adminKey = process.env.ADMIN_MIGRATION_KEY;

  if (queryKey && adminKey && queryKey === adminKey) {
    return next();
  }

  const hasAccess = await hasAdminAccess(req);
  if (hasAccess) {
    return next();
  }

  return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
};

// ============ 公開 API (官網讀取方案) ============

publicRouter.get("/subscription-plans", async (req: Request, res: Response) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(asc(subscriptionPlans.sortOrder));

    const publicPlans = plans.map(plan => ({
      tier: plan.tier,
      name: plan.name,
      nameEn: plan.nameEn,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      pricePeriodLabel: plan.pricePeriodLabel,
      features: plan.features,
      buttonText: plan.buttonText,
      highlighted: plan.highlighted,
      highlightLabel: plan.highlightLabel,
      maxPlaces: plan.maxPlaces,
      maxCoupons: plan.maxCoupons,
      hasAdvancedAnalytics: plan.hasAdvancedAnalytics,
      hasPriorityExposure: plan.hasPriorityExposure,
      hasDedicatedSupport: plan.hasDedicatedSupport,
    }));

    res.json({ plans: publicPlans });
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得訂閱方案失敗'));
  }
});

// ============ 管理 API (需要 Admin 權限) ============

adminRouter.get("/subscription-plans", requireAdmin, async (req: Request, res: Response) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .orderBy(asc(subscriptionPlans.sortOrder));

    res.json({ plans });
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得訂閱方案失敗'));
  }
});

adminRouter.get("/subscription-plans/:tier", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.tier, tier));

    if (!plan) {
      return res.status(404).json(createErrorResponse(ErrorCode.PLAN_NOT_FOUND));
    }

    res.json({ plan });
  } catch (error) {
    console.error("Error fetching subscription plan:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得訂閱方案失敗'));
  }
});

adminRouter.post("/subscription-plans", requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = insertSubscriptionPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', parsed.error.flatten()));
    }

    const [newPlan] = await db
      .insert(subscriptionPlans)
      .values(parsed.data)
      .returning();

    res.status(201).json({ plan: newPlan });
  } catch (error: any) {
    console.error("Error creating subscription plan:", error);
    if (error.code === "23505") {
      return res.status(409).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '此方案等級已存在'));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '建立訂閱方案失敗'));
  }
});

adminRouter.put("/subscription-plans/:tier", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;

    const updateSchema = insertSubscriptionPlanSchema.partial();
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', parsed.error.flatten()));
    }

    const [updatedPlan] = await db
      .update(subscriptionPlans)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPlans.tier, tier))
      .returning();

    if (!updatedPlan) {
      return res.status(404).json(createErrorResponse(ErrorCode.PLAN_NOT_FOUND));
    }

    res.json({ plan: updatedPlan });
  } catch (error) {
    console.error("Error updating subscription plan:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '更新訂閱方案失敗'));
  }
});

adminRouter.delete("/subscription-plans/:tier", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;

    if (tier === 'free') {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無法刪除免費方案'));
    }

    const [deactivatedPlan] = await db
      .update(subscriptionPlans)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPlans.tier, tier))
      .returning();

    if (!deactivatedPlan) {
      return res.status(404).json(createErrorResponse(ErrorCode.PLAN_NOT_FOUND));
    }

    res.json({ success: true, message: `Plan ${tier} has been deactivated` });
  } catch (error) {
    console.error("Error deleting subscription plan:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '刪除訂閱方案失敗'));
  }
});

adminRouter.post("/subscription-plans/seed", requireAdmin, async (req: Request, res: Response) => {
  try {
    const defaultPlans = [
      {
        tier: 'free',
        name: 'Free',
        nameEn: 'Free',
        priceMonthly: 0,
        pricePeriodLabel: '永久免費',
        features: ['1 間店家', '5 張優惠券', '基礎數據報表'],
        buttonText: '目前方案',
        highlighted: false,
        maxPlaces: 1,
        maxCoupons: 5,
        hasAdvancedAnalytics: false,
        hasPriorityExposure: false,
        hasDedicatedSupport: false,
        sortOrder: 0,
      },
      {
        tier: 'pro',
        name: 'Pro',
        nameEn: 'Pro',
        priceMonthly: 299,
        priceYearly: 2990,
        pricePeriodLabel: '/月',
        features: ['3 間店家', '20 張優惠券', '進階數據報表', '優先曝光'],
        buttonText: '升級 Pro',
        highlighted: true,
        highlightLabel: '推薦',
        stripeMonthlyPriceId: null,
        stripeYearlyPriceId: null,
        recurMonthlyProductId: 'fpbnn9ah9090j7hxx5wcv7f4',
        recurYearlyProductId: null,
        maxPlaces: 3,
        maxCoupons: 20,
        hasAdvancedAnalytics: true,
        hasPriorityExposure: true,
        hasDedicatedSupport: false,
        sortOrder: 1,
      },
      {
        tier: 'premium',
        name: 'Premium',
        nameEn: 'Premium',
        priceMonthly: 799,
        priceYearly: 6000,
        pricePeriodLabel: '/月',
        features: ['無限店家', '無限優惠券', '完整數據報表', '最高優先曝光', '專屬客服'],
        buttonText: '升級 Premium',
        highlighted: false,
        stripeMonthlyPriceId: null,
        stripeYearlyPriceId: null,
        recurMonthlyProductId: null,
        recurYearlyProductId: 'adkwbl9dya0wc6b53parl9yk',
        maxPlaces: 999,
        maxCoupons: 999,
        hasAdvancedAnalytics: true,
        hasPriorityExposure: true,
        hasDedicatedSupport: true,
        sortOrder: 2,
      },
    ];

    for (const plan of defaultPlans) {
      await db
        .insert(subscriptionPlans)
        .values(plan)
        .onConflictDoUpdate({
          target: subscriptionPlans.tier,
          set: {
            name: plan.name,
            nameEn: plan.nameEn,
            priceMonthly: plan.priceMonthly,
            priceYearly: plan.priceYearly,
            pricePeriodLabel: plan.pricePeriodLabel,
            features: plan.features,
            buttonText: plan.buttonText,
            highlighted: plan.highlighted,
            highlightLabel: plan.highlightLabel,
            maxPlaces: plan.maxPlaces,
            maxCoupons: plan.maxCoupons,
            hasAdvancedAnalytics: plan.hasAdvancedAnalytics,
            hasPriorityExposure: plan.hasPriorityExposure,
            hasDedicatedSupport: plan.hasDedicatedSupport,
            sortOrder: plan.sortOrder,
            updatedAt: new Date(),
          },
        });
    }

    const allPlans = await db
      .select()
      .from(subscriptionPlans)
      .orderBy(asc(subscriptionPlans.sortOrder));

    res.json({
      success: true,
      message: "Default subscription plans have been seeded",
      plans: allPlans
    });
  } catch (error) {
    console.error("Error seeding subscription plans:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '初始化訂閱方案失敗'));
  }
});

export default adminRouter;
export { publicRouter as subscriptionPlansPublicRouter };

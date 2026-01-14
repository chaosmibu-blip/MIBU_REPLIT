import { Router } from "express";
import { db } from "../../db";
import {
  merchants,
  merchantPlaceLinks,
  places,
  collections,
  userInventory,
  coupons,
  merchantAnalytics,
} from "@shared/schema";
import { eq, and, sql, gte, lte, count, sum, desc } from "drizzle-orm";
import { isAuthenticated } from "../../replitAuth";
import { storage } from "../../storage";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

/**
 * GET /api/merchant/analytics
 * 取得商家數據分析
 *
 * Query:
 *   period: '7d' | '30d' | '90d' | 'all' (預設 '30d')
 *   placeId?: number (指定景點，不填則為商家總計)
 *
 * Response:
 * {
 *   overview: {
 *     totalExposures: number,      // 總曝光次數（景點被抽到次數）
 *     totalCollectors: number,     // 圖鑑收錄人數
 *     couponIssued: number,        // 優惠券發放數
 *     couponRedeemed: number,      // 優惠券核銷數
 *     redemptionRate: number,      // 核銷率 (%)
 *   },
 *   trend: [...],                  // 趨勢數據
 *   topCoupons: [...],             // 熱門優惠券
 *   placeBreakdown: [...],         // 各景點分佈
 * }
 */
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

    const { period = '30d', placeId } = req.query;

    // 計算日期範圍
    const now = new Date();
    let startDate: Date | null = null;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = null;
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // 1. 取得商家的所有認領景點
    const merchantPlaces = await db
      .select({
        linkId: merchantPlaceLinks.id,
        placeId: merchantPlaceLinks.placeId,
        placeName: places.placeName,
      })
      .from(merchantPlaceLinks)
      .leftJoin(places, eq(merchantPlaceLinks.placeId, places.id))
      .where(eq(merchantPlaceLinks.merchantId, merchant.id));

    const placeIds = merchantPlaces.map(p => p.placeId).filter(Boolean) as number[];

    if (placeIds.length === 0) {
      // 商家沒有認領任何景點
      return res.json({
        overview: {
          totalExposures: 0,
          totalCollectors: 0,
          couponIssued: 0,
          couponRedeemed: 0,
          redemptionRate: 0,
        },
        trend: [],
        topCoupons: [],
        placeBreakdown: [],
        message: '您尚未認領任何景點，請先認領景點以開始收集數據',
      });
    }

    // 2. 統計曝光次數（collections 表中該景點被收錄到圖鑑的次數）
    let exposureConditions: any[] = [sql`${collections.placeId} = ANY(${placeIds})`];
    if (startDate) {
      exposureConditions.push(gte(collections.createdAt, startDate));
    }

    const [exposureResult] = await db
      .select({
        totalExposures: count(),
        uniqueCollectors: sql<number>`count(DISTINCT ${collections.userId})`,
      })
      .from(collections)
      .where(and(...exposureConditions));

    // 3. 統計優惠券數據
    // 先取得商家的所有優惠券
    const merchantCoupons = await db
      .select({ id: coupons.id, title: coupons.title })
      .from(coupons)
      .where(eq(coupons.merchantId, merchant.id));

    const couponIds = merchantCoupons.map(c => c.id);

    let couponIssued = 0;
    let couponRedeemed = 0;

    if (couponIds.length > 0) {
      // 統計優惠券發放數（userInventory 中該優惠券的記錄）
      let inventoryConditions: any[] = [
        sql`${userInventory.couponId} = ANY(${couponIds})`,
      ];
      if (startDate) {
        inventoryConditions.push(gte(userInventory.createdAt, startDate));
      }

      const [inventoryResult] = await db
        .select({
          issued: count(),
          redeemed: sql<number>`count(*) FILTER (WHERE ${userInventory.status} = 'redeemed')`,
        })
        .from(userInventory)
        .where(and(...inventoryConditions));

      couponIssued = inventoryResult?.issued || 0;
      couponRedeemed = inventoryResult?.redeemed || 0;
    }

    // 4. 計算核銷率
    const redemptionRate = couponIssued > 0
      ? Math.round((couponRedeemed / couponIssued) * 100 * 10) / 10
      : 0;

    // 5. 熱門優惠券排行
    let topCoupons: any[] = [];
    if (couponIds.length > 0) {
      topCoupons = await db
        .select({
          couponId: userInventory.couponId,
          title: coupons.title,
          issuedCount: count(),
          redeemedCount: sql<number>`count(*) FILTER (WHERE ${userInventory.status} = 'redeemed')`,
        })
        .from(userInventory)
        .leftJoin(coupons, eq(userInventory.couponId, coupons.id))
        .where(sql`${userInventory.couponId} = ANY(${couponIds})`)
        .groupBy(userInventory.couponId, coupons.title)
        .orderBy(desc(count()))
        .limit(5);
    }

    // 6. 各景點分佈
    const placeBreakdown = await Promise.all(
      merchantPlaces.map(async (place) => {
        if (!place.placeId) return null;

        let placeConditions: any[] = [eq(collections.placeId, place.placeId)];
        if (startDate) {
          placeConditions.push(gte(collections.createdAt, startDate));
        }

        const [result] = await db
          .select({ count: count() })
          .from(collections)
          .where(and(...placeConditions));

        return {
          placeId: place.placeId,
          placeName: place.placeName,
          collectionCount: result?.count || 0,
        };
      })
    );

    // 7. 趨勢數據（按日統計，最近 7 天或 30 天）
    const trendDays = period === '7d' ? 7 : (period === '30d' ? 30 : 7);
    const trendStartDate = new Date(now.getTime() - trendDays * 24 * 60 * 60 * 1000);

    const trendData = await db
      .select({
        date: sql<string>`DATE(${collections.createdAt})`,
        count: count(),
      })
      .from(collections)
      .where(and(
        sql`${collections.placeId} = ANY(${placeIds})`,
        gte(collections.createdAt, trendStartDate)
      ))
      .groupBy(sql`DATE(${collections.createdAt})`)
      .orderBy(sql`DATE(${collections.createdAt})`);

    res.json({
      overview: {
        totalExposures: exposureResult?.totalExposures || 0,
        totalCollectors: exposureResult?.uniqueCollectors || 0,
        couponIssued,
        couponRedeemed,
        redemptionRate,
      },
      trend: trendData.map(t => ({
        date: t.date,
        exposures: t.count,
      })),
      topCoupons: topCoupons.map(c => ({
        couponId: c.couponId,
        title: c.title,
        issued: c.issuedCount,
        redeemed: c.redeemedCount,
        redemptionRate: c.issuedCount > 0
          ? Math.round((c.redeemedCount / c.issuedCount) * 100 * 10) / 10
          : 0,
      })),
      placeBreakdown: placeBreakdown.filter(Boolean).sort((a, b) =>
        (b?.collectionCount || 0) - (a?.collectionCount || 0)
      ),
      period,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get merchant analytics error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得分析數據'));
  }
});

/**
 * GET /api/merchant/analytics/summary
 * 快速取得商家數據摘要（首頁卡片用）
 */
router.get("/summary", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    // 取得商家認領的景點數
    const [placeCountResult] = await db
      .select({ count: count() })
      .from(merchantPlaceLinks)
      .where(eq(merchantPlaceLinks.merchantId, merchant.id));

    // 取得商家優惠券數
    const [couponCountResult] = await db
      .select({ count: count() })
      .from(coupons)
      .where(and(
        eq(coupons.merchantId, merchant.id),
        eq(coupons.isActive, true)
      ));

    // 本月曝光（簡化查詢）
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const merchantPlaces = await db
      .select({ placeId: merchantPlaceLinks.placeId })
      .from(merchantPlaceLinks)
      .where(eq(merchantPlaceLinks.merchantId, merchant.id));

    const placeIds = merchantPlaces.map(p => p.placeId).filter(Boolean) as number[];

    let monthlyExposures = 0;
    if (placeIds.length > 0) {
      const [exposureResult] = await db
        .select({ count: count() })
        .from(collections)
        .where(and(
          sql`${collections.placeId} = ANY(${placeIds})`,
          gte(collections.createdAt, thisMonthStart)
        ));
      monthlyExposures = exposureResult?.count || 0;
    }

    res.json({
      placesCount: placeCountResult?.count || 0,
      activeCouponsCount: couponCountResult?.count || 0,
      monthlyExposures,
      subscriptionTier: merchant.subscriptionPlan || 'free',
    });
  } catch (error) {
    console.error("Get merchant analytics summary error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得摘要數據'));
  }
});

export default router;

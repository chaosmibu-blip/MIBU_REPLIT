import { Router } from "express";
import { db } from "../../db";
import {
  users,
  merchants,
  places,
  collections,
  merchantSubscriptions,
  refundRequests,
  coupons,
  userInventory,
} from "@shared/schema";
import { eq, and, gte, lte, count, countDistinct, sql, sum } from "drizzle-orm";
import { requireAdmin } from "./shared";

const router = Router();

/**
 * GET /api/admin/dashboard
 * 營運儀表板 - 取得平台整體統計
 */
router.get("/dashboard", requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 並行查詢所有統計
    const [
      // 用戶統計
      totalUsersResult,
      todayNewUsersResult,
      monthlyActiveUsersResult,

      // 扭蛋統計 (以 gachaSessionId 計算扭蛋次數)
      totalGachaSessionsResult,
      todayGachaSessionsResult,
      monthlyGachaSessionsResult,

      // 景點統計
      totalPlacesResult,
      activePlacesResult,

      // 商家統計
      totalMerchantsResult,
      approvedMerchantsResult,
      pendingMerchantsResult,

      // 訂閱統計
      activeSubscriptionsResult,
      monthlyRevenueResult,

      // 待處理事項
      pendingUsersResult,
      pendingRefundsResult,

      // 優惠券統計
      totalCouponsResult,
      redeemedCouponsResult,

      // 7日趨勢數據
      dailyGachaTrendResult,
      dailyUserTrendResult,
    ] = await Promise.all([
      // 用戶統計
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(users).where(gte(users.createdAt, todayStart)),
      db.select({ count: countDistinct(collections.userId) })
        .from(collections)
        .where(gte(collections.collectedAt, monthStart)),

      // 扭蛋統計
      db.select({ count: countDistinct(collections.gachaSessionId) }).from(collections),
      db.select({ count: countDistinct(collections.gachaSessionId) })
        .from(collections)
        .where(gte(collections.collectedAt, todayStart)),
      db.select({ count: countDistinct(collections.gachaSessionId) })
        .from(collections)
        .where(gte(collections.collectedAt, monthStart)),

      // 景點統計
      db.select({ count: count() }).from(places),
      db.select({ count: count() }).from(places).where(eq(places.isActive, true)),

      // 商家統計
      db.select({ count: count() }).from(merchants),
      db.select({ count: count() }).from(merchants).where(eq(merchants.status, 'approved')),
      db.select({ count: count() }).from(merchants).where(eq(merchants.status, 'pending')),

      // 訂閱統計
      db.select({ count: count() })
        .from(merchantSubscriptions)
        .where(eq(merchantSubscriptions.status, 'active')),
      db.select({ total: sum(merchantSubscriptions.amount) })
        .from(merchantSubscriptions)
        .where(and(
          eq(merchantSubscriptions.status, 'active'),
          gte(merchantSubscriptions.currentPeriodStart, monthStart)
        )),

      // 待處理事項
      db.select({ count: count() })
        .from(users)
        .where(and(
          eq(users.isApproved, false),
          sql`${users.role} IN ('merchant', 'specialist')`
        )),
      db.select({ count: count() })
        .from(refundRequests)
        .where(eq(refundRequests.status, 'pending')),

      // 優惠券統計
      db.select({ count: count() }).from(userInventory),
      db.select({ count: count() })
        .from(userInventory)
        .where(eq(userInventory.status, 'redeemed')),

      // 7日趨勢 - 扭蛋
      db.select({
        date: sql<string>`DATE(${collections.collectedAt})`,
        count: countDistinct(collections.gachaSessionId),
      })
        .from(collections)
        .where(gte(collections.collectedAt, last7Days))
        .groupBy(sql`DATE(${collections.collectedAt})`)
        .orderBy(sql`DATE(${collections.collectedAt})`),

      // 7日趨勢 - 新用戶
      db.select({
        date: sql<string>`DATE(${users.createdAt})`,
        count: count(),
      })
        .from(users)
        .where(gte(users.createdAt, last7Days))
        .groupBy(sql`DATE(${users.createdAt})`)
        .orderBy(sql`DATE(${users.createdAt})`),
    ]);

    // 整理統計數據
    const stats = {
      users: {
        total: totalUsersResult[0]?.count || 0,
        todayNew: todayNewUsersResult[0]?.count || 0,
        monthlyActive: monthlyActiveUsersResult[0]?.count || 0,
      },
      gacha: {
        total: totalGachaSessionsResult[0]?.count || 0,
        today: todayGachaSessionsResult[0]?.count || 0,
        monthly: monthlyGachaSessionsResult[0]?.count || 0,
      },
      places: {
        total: totalPlacesResult[0]?.count || 0,
        active: activePlacesResult[0]?.count || 0,
      },
      merchants: {
        total: totalMerchantsResult[0]?.count || 0,
        approved: approvedMerchantsResult[0]?.count || 0,
        pending: pendingMerchantsResult[0]?.count || 0,
      },
      subscriptions: {
        active: activeSubscriptionsResult[0]?.count || 0,
        monthlyRevenue: Number(monthlyRevenueResult[0]?.total) || 0,
      },
      coupons: {
        total: totalCouponsResult[0]?.count || 0,
        redeemed: redeemedCouponsResult[0]?.count || 0,
        redemptionRate: totalCouponsResult[0]?.count
          ? Math.round((redeemedCouponsResult[0]?.count || 0) / totalCouponsResult[0]?.count * 100)
          : 0,
      },
      pending: {
        users: pendingUsersResult[0]?.count || 0,
        merchants: pendingMerchantsResult[0]?.count || 0,
        refunds: pendingRefundsResult[0]?.count || 0,
        total: (pendingUsersResult[0]?.count || 0) +
               (pendingMerchantsResult[0]?.count || 0) +
               (pendingRefundsResult[0]?.count || 0),
      },
    };

    // 整理趨勢數據（填補缺失日期）
    const trends = {
      gacha: fillMissingDates(dailyGachaTrendResult, last7Days, now),
      users: fillMissingDates(dailyUserTrendResult, last7Days, now),
    };

    res.json({
      stats,
      trends,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get dashboard error:", error);
    res.status(500).json({ error: "無法取得儀表板數據" });
  }
});

/**
 * GET /api/admin/dashboard/recent-activity
 * 取得最近活動記錄
 */
router.get("/dashboard/recent-activity", requireAdmin, async (req, res) => {
  try {
    const [recentUsers, recentGacha, recentRefunds] = await Promise.all([
      // 最近註冊用戶
      db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        createdAt: users.createdAt,
      })
        .from(users)
        .orderBy(sql`${users.createdAt} DESC`)
        .limit(5),

      // 最近扭蛋活動
      db.select({
        sessionId: collections.gachaSessionId,
        userId: collections.userId,
        city: collections.city,
        collectedAt: collections.collectedAt,
        itemCount: count(),
      })
        .from(collections)
        .groupBy(
          collections.gachaSessionId,
          collections.userId,
          collections.city,
          collections.collectedAt
        )
        .orderBy(sql`${collections.collectedAt} DESC`)
        .limit(5),

      // 最近退款申請
      db.select({
        id: refundRequests.id,
        merchantId: refundRequests.merchantId,
        reason: refundRequests.reason,
        status: refundRequests.status,
        createdAt: refundRequests.createdAt,
      })
        .from(refundRequests)
        .orderBy(sql`${refundRequests.createdAt} DESC`)
        .limit(5),
    ]);

    res.json({
      recentUsers,
      recentGacha,
      recentRefunds,
    });
  } catch (error) {
    console.error("Get recent activity error:", error);
    res.status(500).json({ error: "無法取得最近活動" });
  }
});

/**
 * 填補缺失日期的輔助函數
 */
function fillMissingDates(
  data: { date: string; count: number }[],
  startDate: Date,
  endDate: Date
): { date: string; count: number }[] {
  const result: { date: string; count: number }[] = [];
  const dataMap = new Map(data.map(d => [d.date, d.count]));

  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    result.push({
      date: dateStr,
      count: dataMap.get(dateStr) || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

export default router;

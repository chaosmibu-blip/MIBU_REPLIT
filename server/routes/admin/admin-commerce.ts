import { Router } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "./shared";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

// ============ 商家管理 API ============

/**
 * GET /api/admin/merchants
 * 取得所有商家列表（分頁、搜尋、篩選）
 */
router.get("/merchants", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || ''; // 'approved', 'pending', 'rejected'

    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(m.business_name ILIKE $${paramIndex} OR m.contact_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (status) {
      whereConditions.push(`m.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as total
      FROM merchants m
      LEFT JOIN users u ON m.user_id = u.id
      ${whereClause}
    `, ...params));
    const total = parseInt(countResult.rows[0]?.total as string) || 0;

    // Get paginated results with subscription info
    const dataResult = await db.execute(sql.raw(`
      SELECT
        m.id, m.user_id, m.business_name, m.contact_name, m.contact_phone,
        m.status, m.subscription_tier, m.created_at, m.updated_at,
        u.email as user_email, u.display_name as user_display_name,
        (SELECT COUNT(*) FROM merchant_place_links WHERE merchant_id = m.id) as places_count,
        (SELECT COUNT(*) FROM coupons WHERE merchant_id = m.id AND is_active = true) as active_coupons,
        ms.id as subscription_id, ms.status as subscription_status, ms.current_period_end
      FROM merchants m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN merchant_subscriptions ms ON ms.merchant_id = m.id AND ms.status = 'active'
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, ...params));

    res.json({
      merchants: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error("Admin get merchants error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得商家列表失敗'));
  }
});

/**
 * GET /api/admin/merchants/:id
 * 取得單一商家詳情
 */
router.get("/merchants/:id", requireAdmin, async (req, res) => {
  try {
    const merchantId = parseInt(req.params.id);

    const result = await db.execute(sql`
      SELECT
        m.*,
        u.email as user_email, u.display_name as user_display_name,
        (SELECT json_agg(mpl.*) FROM merchant_place_links mpl WHERE mpl.merchant_id = m.id) as places,
        (SELECT json_agg(c.*) FROM coupons c WHERE c.merchant_id = m.id) as coupons,
        (SELECT json_agg(ms.*) FROM merchant_subscriptions ms WHERE ms.merchant_id = m.id ORDER BY ms.created_at DESC) as subscriptions
      FROM merchants m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id = ${merchantId}
    `);

    if (result.rows.length === 0) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    res.json({ merchant: result.rows[0] });
  } catch (error: any) {
    console.error("Admin get merchant detail error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得商家詳情失敗'));
  }
});

/**
 * PATCH /api/admin/merchants/:id/status
 * 更新商家審核狀態
 */
router.patch("/merchants/:id/status", requireAdmin, async (req, res) => {
  try {
    const merchantId = parseInt(req.params.id);
    const { status, adminNote } = req.body;

    if (!['approved', 'pending', 'rejected'].includes(status)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '無效的狀態值'));
    }

    const result = await db.execute(sql`
      UPDATE merchants
      SET status = ${status}, admin_note = ${adminNote || null}, updated_at = NOW()
      WHERE id = ${merchantId}
      RETURNING id, business_name, status
    `);

    if (result.rows.length === 0) {
      return res.status(404).json(createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND));
    }

    res.json({
      success: true,
      merchant: result.rows[0],
      message: `商家狀態已更新為「${status === 'approved' ? '已核准' : status === 'pending' ? '待審核' : '已拒絕'}」`
    });
  } catch (error: any) {
    console.error("Admin update merchant status error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '更新商家狀態失敗'));
  }
});

// ============ 退款管理 API ============

/**
 * GET /api/admin/refunds
 * 取得所有退款請求
 */
router.get("/refunds", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const status = (req.query.status as string) || ''; // 'pending', 'approved', 'rejected', 'processed'

    const offset = (page - 1) * limit;

    let whereClause = '';
    if (status) {
      whereClause = `WHERE r.status = '${status}'`;
    }

    // Get total count
    const countResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as total FROM refund_requests r ${whereClause}
    `));
    const total = parseInt(countResult.rows[0]?.total as string) || 0;

    // Get paginated results
    const dataResult = await db.execute(sql.raw(`
      SELECT
        r.*,
        m.business_name as merchant_name,
        m.contact_name as merchant_contact,
        u.email as user_email,
        ms.subscription_tier, ms.amount as subscription_amount
      FROM refund_requests r
      LEFT JOIN merchants m ON r.merchant_id = m.id
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN merchant_subscriptions ms ON r.subscription_id = ms.id
      ${whereClause}
      ORDER BY
        CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
        r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `));

    // Get status summary
    const summaryResult = await db.execute(sql`
      SELECT
        status,
        COUNT(*) as count
      FROM refund_requests
      GROUP BY status
    `);

    const summary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      processed: 0
    };
    summaryResult.rows.forEach((row: any) => {
      summary[row.status as keyof typeof summary] = parseInt(row.count);
    });

    res.json({
      refunds: dataResult.rows,
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error("Admin get refunds error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得退款列表失敗'));
  }
});

/**
 * PATCH /api/admin/refunds/:id
 * 處理退款請求
 */
router.patch("/refunds/:id", requireAdmin, async (req, res) => {
  try {
    const refundId = parseInt(req.params.id);
    const { status, adminNote, refundAmount } = req.body;

    if (!['approved', 'rejected', 'processed'].includes(status)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '無效的狀態值'));
    }

    const updates: any = {
      status,
      admin_note: adminNote || null,
      updated_at: 'NOW()'
    };

    if (status === 'processed') {
      updates.processed_at = 'NOW()';
      if (refundAmount !== undefined) {
        updates.refund_amount = refundAmount;
      }
    }

    const setClause = Object.entries(updates)
      .map(([key, value]) => `${key} = ${value === 'NOW()' ? 'NOW()' : `'${value}'`}`)
      .join(', ');

    const result = await db.execute(sql.raw(`
      UPDATE refund_requests
      SET ${setClause}
      WHERE id = ${refundId}
      RETURNING *
    `));

    if (result.rows.length === 0) {
      return res.status(404).json(createErrorResponse(ErrorCode.REFUND_NOT_FOUND, '找不到退款請求'));
    }

    const statusText: Record<string, string> = {
      approved: '已核准',
      rejected: '已拒絕',
      processed: '已處理完成'
    };

    res.json({
      success: true,
      refund: result.rows[0],
      message: `退款請求${statusText[status]}`
    });
  } catch (error: any) {
    console.error("Admin process refund error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '處理退款失敗'));
  }
});

// ============ 財務報表 API ============

/**
 * GET /api/admin/finance/report
 * 取得財務報表數據
 */
router.get("/finance/report", requireAdmin, async (req, res) => {
  try {
    const startDate = (req.query.startDate as string) || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || new Date().toISOString().split('T')[0];

    // 訂閱收入統計
    const subscriptionRevenue = await db.execute(sql`
      SELECT
        DATE_TRUNC('day', created_at) as date,
        SUM(amount) as revenue,
        COUNT(*) as count,
        subscription_tier as tier
      FROM merchant_subscriptions
      WHERE created_at >= ${startDate}::timestamp
        AND created_at <= (${endDate}::timestamp + INTERVAL '1 day')
        AND status IN ('active', 'cancelled')
      GROUP BY DATE_TRUNC('day', created_at), subscription_tier
      ORDER BY date
    `);

    // 退款統計
    const refundStats = await db.execute(sql`
      SELECT
        DATE_TRUNC('day', processed_at) as date,
        SUM(refund_amount) as amount,
        COUNT(*) as count
      FROM refund_requests
      WHERE processed_at >= ${startDate}::timestamp
        AND processed_at <= (${endDate}::timestamp + INTERVAL '1 day')
        AND status = 'processed'
      GROUP BY DATE_TRUNC('day', processed_at)
      ORDER BY date
    `);

    // 商家訂閱概況
    const subscriptionSummary = await db.execute(sql`
      SELECT
        subscription_tier as tier,
        COUNT(*) as count,
        SUM(amount) as total_revenue
      FROM merchant_subscriptions
      WHERE status = 'active'
      GROUP BY subscription_tier
    `);

    // 月度收入對比
    const monthlyComparison = await db.execute(sql`
      WITH current_month AS (
        SELECT COALESCE(SUM(amount), 0) as revenue
        FROM merchant_subscriptions
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
          AND status IN ('active', 'cancelled')
      ),
      last_month AS (
        SELECT COALESCE(SUM(amount), 0) as revenue
        FROM merchant_subscriptions
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
          AND created_at < DATE_TRUNC('month', CURRENT_DATE)
          AND status IN ('active', 'cancelled')
      )
      SELECT
        current_month.revenue as current_month_revenue,
        last_month.revenue as last_month_revenue
      FROM current_month, last_month
    `);

    // 待處理退款總額
    const pendingRefunds = await db.execute(sql`
      SELECT
        COALESCE(SUM(requested_amount), 0) as total,
        COUNT(*) as count
      FROM refund_requests
      WHERE status = 'pending'
    `);

    // 今日收入
    const todayRevenue = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) as revenue
      FROM merchant_subscriptions
      WHERE DATE(created_at) = CURRENT_DATE
        AND status IN ('active', 'cancelled')
    `);

    res.json({
      period: { startDate, endDate },
      subscriptionRevenue: subscriptionRevenue.rows,
      refundStats: refundStats.rows,
      subscriptionSummary: subscriptionSummary.rows,
      monthlyComparison: monthlyComparison.rows[0] || { current_month_revenue: 0, last_month_revenue: 0 },
      pendingRefunds: pendingRefunds.rows[0] || { total: 0, count: 0 },
      todayRevenue: todayRevenue.rows[0]?.revenue || 0,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Admin get finance report error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得財務報表失敗'));
  }
});

export default router;

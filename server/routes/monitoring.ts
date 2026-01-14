import { Router, Request, Response } from "express";
import { pool, getPoolStats } from "../db";
import { requireAdmin } from "./admin/shared";

const router = Router();

// 伺服器啟動時間
const startTime = Date.now();

// 請求計數器（Prometheus 指標用）
let requestCounters: Record<string, number> = {};
let requestDurations: number[] = [];

/**
 * 中間件：追蹤請求指標
 * 可在主應用程式中使用：app.use(trackRequestMetrics)
 */
export const trackRequestMetrics = (req: Request, res: Response, next: Function) => {
  const startTime = Date.now();
  const method = req.method;
  const path = req.route?.path || req.path;

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const key = `${method}_${status}`;

    // 增加計數器
    requestCounters[key] = (requestCounters[key] || 0) + 1;

    // 記錄請求時間（保留最近 1000 筆）
    requestDurations.push(duration);
    if (requestDurations.length > 1000) {
      requestDurations = requestDurations.slice(-1000);
    }
  });

  next();
};

/**
 * GET /api/health
 * 基本健康檢查（公開端點）
 */
router.get("/health", (req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: uptime,
    uptimeFormatted: formatUptime(uptime),
  });
});

/**
 * GET /api/health/detailed
 * 詳細健康檢查（需要管理員權限）
 */
router.get("/health/detailed", requireAdmin, async (req: Request, res: Response) => {
  try {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    // 資料庫連線檢查
    let dbStatus: "connected" | "disconnected" | "error" = "disconnected";
    let dbLatency: number | null = null;
    let dbError: string | null = null;

    try {
      const dbStart = Date.now();
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      dbLatency = Date.now() - dbStart;
      dbStatus = "connected";
    } catch (error: any) {
      dbStatus = "error";
      dbError = error.message;
    }

    // 記憶體使用量
    const memoryUsage = process.memoryUsage();
    const memoryInfo = {
      heapUsed: formatBytes(memoryUsage.heapUsed),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      rss: formatBytes(memoryUsage.rss),
      external: formatBytes(memoryUsage.external),
      heapUsedPercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
    };

    // CPU 使用量（如果可取得）
    let cpuInfo: { user: number; system: number } | null = null;
    try {
      const cpuUsage = process.cpuUsage();
      cpuInfo = {
        user: Math.round(cpuUsage.user / 1000), // 微秒轉毫秒
        system: Math.round(cpuUsage.system / 1000),
      };
    } catch {
      // CPU 資訊不可取得
    }

    // 資料庫連線池狀態
    const poolStats = getPoolStats();

    // 計算請求統計
    const totalRequests = Object.values(requestCounters).reduce((a, b) => a + b, 0);
    const avgDuration =
      requestDurations.length > 0
        ? Math.round(requestDurations.reduce((a, b) => a + b, 0) / requestDurations.length)
        : 0;

    res.json({
      status: dbStatus === "connected" ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: uptime,
      uptimeFormatted: formatUptime(uptime),

      database: {
        status: dbStatus,
        latency: dbLatency,
        error: dbError,
        pool: {
          totalConnections: poolStats.totalCount,
          idleConnections: poolStats.idleCount,
          waitingClients: poolStats.waitingCount,
        },
      },

      memory: memoryInfo,

      cpu: cpuInfo,

      requests: {
        total: totalRequests,
        averageDuration: avgDuration,
        byStatus: requestCounters,
      },

      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  } catch (error: any) {
    console.error("[Health Check] Error:", error);
    res.status(500).json({
      status: "error",
      error: error.message,
    });
  }
});

/**
 * GET /api/metrics
 * Prometheus 格式指標（需要管理員權限）
 */
router.get("/metrics", requireAdmin, async (req: Request, res: Response) => {
  try {
    const poolStats = getPoolStats();
    const memoryUsage = process.memoryUsage();
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    // 計算請求統計
    const totalRequests = Object.values(requestCounters).reduce((a, b) => a + b, 0);
    const avgDuration =
      requestDurations.length > 0
        ? requestDurations.reduce((a, b) => a + b, 0) / requestDurations.length / 1000 // 轉換為秒
        : 0;

    // Prometheus 格式輸出
    const metrics: string[] = [
      "# HELP http_requests_total Total number of HTTP requests",
      "# TYPE http_requests_total counter",
      `http_requests_total ${totalRequests}`,
      "",
      "# HELP http_request_duration_seconds Average HTTP request duration in seconds",
      "# TYPE http_request_duration_seconds gauge",
      `http_request_duration_seconds ${avgDuration.toFixed(4)}`,
      "",
      "# HELP db_pool_total_connections Total database pool connections",
      "# TYPE db_pool_total_connections gauge",
      `db_pool_total_connections ${poolStats.totalCount}`,
      "",
      "# HELP db_pool_idle_connections Idle database pool connections",
      "# TYPE db_pool_idle_connections gauge",
      `db_pool_idle_connections ${poolStats.idleCount}`,
      "",
      "# HELP db_pool_waiting_clients Waiting clients for database connections",
      "# TYPE db_pool_waiting_clients gauge",
      `db_pool_waiting_clients ${poolStats.waitingCount}`,
      "",
      "# HELP nodejs_heap_used_bytes Node.js heap used in bytes",
      "# TYPE nodejs_heap_used_bytes gauge",
      `nodejs_heap_used_bytes ${memoryUsage.heapUsed}`,
      "",
      "# HELP nodejs_heap_total_bytes Node.js heap total in bytes",
      "# TYPE nodejs_heap_total_bytes gauge",
      `nodejs_heap_total_bytes ${memoryUsage.heapTotal}`,
      "",
      "# HELP nodejs_rss_bytes Node.js RSS in bytes",
      "# TYPE nodejs_rss_bytes gauge",
      `nodejs_rss_bytes ${memoryUsage.rss}`,
      "",
      "# HELP process_uptime_seconds Process uptime in seconds",
      "# TYPE process_uptime_seconds counter",
      `process_uptime_seconds ${uptime}`,
    ];

    // 按 HTTP 狀態碼分類的請求計數
    metrics.push("");
    metrics.push("# HELP http_requests_by_status HTTP requests by method and status");
    metrics.push("# TYPE http_requests_by_status counter");
    for (const [key, count] of Object.entries(requestCounters)) {
      const [method, status] = key.split("_");
      metrics.push(`http_requests_by_status{method="${method}",status="${status}"} ${count}`);
    }

    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(metrics.join("\n") + "\n");
  } catch (error: any) {
    console.error("[Metrics] Error:", error);
    res.status(500).send("# Error generating metrics\n");
  }
});

/**
 * 格式化運行時間
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * 格式化位元組大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default router;

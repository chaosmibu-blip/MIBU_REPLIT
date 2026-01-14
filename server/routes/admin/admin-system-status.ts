import { Router } from "express";
import { requireAdmin } from "./shared";

const router = Router();

interface ServiceStatus {
  name: string;
  category: string;
  status: 'configured' | 'not_configured' | 'partial';
  envVars: {
    name: string;
    configured: boolean;
    masked?: string;
  }[];
  description: string;
}

/**
 * GET /api/admin/system-status
 * 取得系統服務狀態（環境變數檢查）
 */
router.get("/system-status", requireAdmin, async (req, res) => {
  try {
    const services: ServiceStatus[] = [
      // 資料庫
      {
        name: "PostgreSQL",
        category: "database",
        status: checkEnvStatus(["DATABASE_URL"]),
        envVars: [
          { name: "DATABASE_URL", ...checkEnv("DATABASE_URL") }
        ],
        description: "主要資料庫"
      },

      // 認證
      {
        name: "Apple Sign In",
        category: "auth",
        status: checkEnvStatus(["APPLE_CLIENT_ID"]),
        envVars: [
          { name: "APPLE_CLIENT_ID", ...checkEnv("APPLE_CLIENT_ID") }
        ],
        description: "iOS 用戶登入"
      },
      {
        name: "JWT",
        category: "auth",
        status: checkEnvStatus(["JWT_SECRET"]),
        envVars: [
          { name: "JWT_SECRET", ...checkEnv("JWT_SECRET") }
        ],
        description: "API Token 簽名"
      },

      // AI
      {
        name: "Google Gemini",
        category: "ai",
        status: checkEnvStatus(["AI_INTEGRATIONS_GEMINI_API_KEY", "AI_INTEGRATIONS_GEMINI_BASE_URL"]),
        envVars: [
          { name: "AI_INTEGRATIONS_GEMINI_API_KEY", ...checkEnv("AI_INTEGRATIONS_GEMINI_API_KEY") },
          { name: "AI_INTEGRATIONS_GEMINI_BASE_URL", ...checkEnv("AI_INTEGRATIONS_GEMINI_BASE_URL") }
        ],
        description: "景點審核、扭蛋排序"
      },

      // 地圖
      {
        name: "Google Places",
        category: "map",
        status: checkEnvStatus(["GOOGLE_MAPS_API_KEY"]),
        envVars: [
          { name: "GOOGLE_MAPS_API_KEY", ...checkEnv("GOOGLE_MAPS_API_KEY") }
        ],
        description: "景點採集（僅腳本）"
      },
      {
        name: "Mapbox",
        category: "map",
        status: checkEnvStatus(["MAPBOX_ACCESS_TOKEN"]),
        envVars: [
          { name: "MAPBOX_ACCESS_TOKEN", ...checkEnv("MAPBOX_ACCESS_TOKEN") }
        ],
        description: "前端地圖顯示"
      },

      // 通訊
      {
        name: "Twilio",
        category: "communication",
        status: checkEnvStatus([
          "TWILIO_ACCOUNT_SID",
          "TWILIO_AUTH_TOKEN",
          "TWILIO_API_KEY_SID",
          "TWILIO_API_KEY_SECRET",
          "TWILIO_CONVERSATIONS_SERVICE_SID"
        ]),
        envVars: [
          { name: "TWILIO_ACCOUNT_SID", ...checkEnv("TWILIO_ACCOUNT_SID") },
          { name: "TWILIO_AUTH_TOKEN", ...checkEnv("TWILIO_AUTH_TOKEN") },
          { name: "TWILIO_PHONE_NUMBER", ...checkEnv("TWILIO_PHONE_NUMBER") },
          { name: "TWILIO_API_KEY_SID", ...checkEnv("TWILIO_API_KEY_SID") },
          { name: "TWILIO_API_KEY_SECRET", ...checkEnv("TWILIO_API_KEY_SECRET") },
          { name: "TWILIO_CONVERSATIONS_SERVICE_SID", ...checkEnv("TWILIO_CONVERSATIONS_SERVICE_SID") }
        ],
        description: "即時聊天、SOS 簡訊"
      },

      // 金流
      {
        name: "Stripe",
        category: "payment",
        status: checkEnvStatus(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]),
        envVars: [
          { name: "STRIPE_SECRET_KEY", ...checkEnv("STRIPE_SECRET_KEY") },
          { name: "STRIPE_WEBHOOK_SECRET", ...checkEnv("STRIPE_WEBHOOK_SECRET") }
        ],
        description: "國際支付"
      },
      {
        name: "Recur",
        category: "payment",
        status: checkEnvStatus(["RECUR_API_KEY", "RECUR_WEBHOOK_SECRET"]),
        envVars: [
          { name: "RECUR_API_KEY", ...checkEnv("RECUR_API_KEY") },
          { name: "RECUR_WEBHOOK_SECRET", ...checkEnv("RECUR_WEBHOOK_SECRET") }
        ],
        description: "台灣本地支付"
      },

      // 管理
      {
        name: "Admin",
        category: "admin",
        status: checkEnvStatus(["ADMIN_MIGRATION_KEY"]),
        envVars: [
          { name: "ADMIN_MIGRATION_KEY", ...checkEnv("ADMIN_MIGRATION_KEY") }
        ],
        description: "管理後台保護"
      }
    ];

    // 統計
    const summary = {
      total: services.length,
      configured: services.filter(s => s.status === 'configured').length,
      partial: services.filter(s => s.status === 'partial').length,
      notConfigured: services.filter(s => s.status === 'not_configured').length,
    };

    // 按分類分組
    const byCategory: Record<string, ServiceStatus[]> = {};
    services.forEach(service => {
      if (!byCategory[service.category]) {
        byCategory[service.category] = [];
      }
      byCategory[service.category].push(service);
    });

    res.json({
      summary,
      services,
      byCategory,
      categories: [
        { id: 'database', name: '資料庫' },
        { id: 'auth', name: '認證' },
        { id: 'ai', name: 'AI 服務' },
        { id: 'map', name: '地圖' },
        { id: 'communication', name: '通訊' },
        { id: 'payment', name: '金流' },
        { id: 'admin', name: '管理' },
      ],
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get system status error:", error);
    res.status(500).json({ error: "無法取得系統狀態" });
  }
});

/**
 * 檢查單一環境變數
 */
function checkEnv(name: string): { configured: boolean; masked?: string } {
  const value = process.env[name];
  if (!value) {
    return { configured: false };
  }

  // 遮罩處理：只顯示前4後4字元
  let masked = '***';
  if (value.length > 12) {
    masked = value.slice(0, 4) + '***' + value.slice(-4);
  } else if (value.length > 4) {
    masked = value.slice(0, 2) + '***';
  }

  return { configured: true, masked };
}

/**
 * 檢查多個環境變數的整體狀態
 */
function checkEnvStatus(names: string[]): 'configured' | 'not_configured' | 'partial' {
  const results = names.map(name => !!process.env[name]);
  const configuredCount = results.filter(Boolean).length;

  if (configuredCount === names.length) return 'configured';
  if (configuredCount === 0) return 'not_configured';
  return 'partial';
}

export default router;

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { storage } from "./storage";
import { verifyJwtToken, initializeSuperAdmin } from "./replitAuth";
import { checkGeofence } from "./lib/geofencing";
import { setupSocketIO } from "./socketHandler";
import { runDataCleanup } from "./lib/dataCleanup";
import { startDbWarmup } from "./db";
import { z } from "zod";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

async function initStripe() {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  // Add SSL mode to database URL if not present
  if (!databaseUrl.includes('sslmode=')) {
    databaseUrl += databaseUrl.includes('?') ? '&sslmode=require' : '?sslmode=require';
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const { webhook, uuid } = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
      { enabled_events: ['*'], description: 'Managed webhook for Stripe sync' }
    );
    console.log(`Webhook configured: ${webhook.url} (UUID: ${uuid})`);

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

async function startServer() {
  const app = express();

  // ============================================================
  // 0. 最最優先：全域請求日誌 (Debug 用)
  // ============================================================
  app.use((req, res, next) => {
    if (req.path.includes('callback') || req.path.includes('login')) {
      console.log(`[GLOBAL_DEBUG] ${req.method} ${req.path} | Query: ${JSON.stringify(req.query)}`);
    }
    next();
  });

  // ============================================================
  // 1. 最優先：Body Parser (必須在所有路由之前!)
  // ============================================================
  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use(express.urlencoded({ extended: true }));

  // ============================================================
  // 2. 第二順位：CORS 和 Cookie
  // ============================================================
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isDevelopment) return callback(null, true);
      if (origin.endsWith('.replit.dev') || origin.endsWith('.replit.app')) {
        return callback(null, true);
      }
      // 允許官網網域
      if (origin === 'https://mibu-travel.com' || origin === 'https://www.mibu-travel.com') {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['Set-Cookie'],
  }));

  app.use(cookieParser());

  // ============================================================
  // 3. 第三順位：API 路由 (絕對要在 Vite 之前!)
  // ============================================================

  // JWT 驗證 middleware
  const jwtAuth = (req: any, res: Response, next: NextFunction) => {
    console.log('[jwtAuth] Request to:', req.path);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[jwtAuth] FAIL: Missing or invalid Authorization header');
      return res.status(401).json({ message: "Missing or invalid Authorization header" });
    }
    const token = authHeader.substring(7);
    console.log('[jwtAuth] Token received (first 10 chars):', token.substring(0, 10));
    const decoded = verifyJwtToken(token);
    if (!decoded) {
      console.log('[jwtAuth] FAIL: Token verification failed');
      return res.status(401).json({ message: "Invalid token" });
    }
    console.log('[jwtAuth] SUCCESS: User authenticated, sub:', decoded.sub);
    req.user = { claims: { sub: decoded.sub, email: decoded.email } };
    next();
  };

  // POST /api/sos/trigger - 直接在 index.ts 中處理，確保優先載入
  app.post('/api/sos/trigger', (req, res) => {
    console.log('🚨 SOS TRIGGERED!');
    console.log('🚨 Request body:', req.body);
    console.log('🚨 Query params:', req.query);
    res.json({ success: true, message: 'SOS triggered successfully' });
  });

  // POST /api/location/update
  app.post('/api/location/update', jwtAuth, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    console.log('📍 Location Update Request:', { userId, body: req.body });
    
    const locationSchema = z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      isSharingEnabled: z.boolean().optional(),
      targets: z.array(z.object({
        id: z.union([z.string(), z.number()]),
        name: z.string(),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        radiusMeters: z.number().min(1).max(10000).default(50),
      })).optional(),
    });

    try {
      const validated = locationSchema.parse(req.body);
      console.log('📍 Location Update Validated:', { userId, lat: validated.lat, lon: validated.lon });
      
      let sharingEnabled = validated.isSharingEnabled;
      if (sharingEnabled === undefined) {
        const existingLocation = await storage.getUserLocation(userId);
        sharingEnabled = existingLocation?.isSharingEnabled ?? true;
      }
      
      const location = await storage.upsertUserLocation(
        userId,
        validated.lat,
        validated.lon,
        sharingEnabled
      );
      
      const geofenceResult = checkGeofence(
        { lat: validated.lat, lon: validated.lon },
        validated.targets || []
      );
      
      res.json({ 
        status: "ok",
        arrived: geofenceResult.arrived,
        target: geofenceResult.target,
        distanceMeters: geofenceResult.distanceMeters,
        location,
        message: sharingEnabled ? '位置已更新' : '位置共享已關閉'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ status: "error", error: error.errors });
      }
      console.error("Error updating location:", error);
      res.status(500).json({ status: "error", error: "Failed to update location" });
    }
  });

  // GET /api/user/sos-link
  app.get('/api/user/sos-link', jwtAuth, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    console.log('🔗 SOS Link Request:', { userId });
    
    try {
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let sosKey = user.sosSecretKey;
      
      if (!sosKey) {
        sosKey = await storage.generateSosKey(userId);
      }

      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'https://your-app.replit.app';

      const webhookUrl = `${baseUrl}/api/sos/trigger?key=${sosKey}`;
      
      res.json({ 
        webhookUrl,
        sosKey,
        instructions: {
          method: "POST",
          body: "Optional JSON: { \"lat\": number, \"lon\": number }",
          example: `curl -X POST "${webhookUrl}" -H "Content-Type: application/json" -d '{"lat": 25.0330, "lon": 121.5654}'`
        }
      });
    } catch (error) {
      console.error("Error getting SOS link:", error);
      res.status(500).json({ error: "Failed to get SOS link" });
    }
  });

  // Stripe Webhook (需要 raw body，所以特殊處理)
  app.post(
    '/api/stripe/webhook/:uuid',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];
      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature' });
      }

      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;
        if (!Buffer.isBuffer(req.body)) {
          console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        const { uuid } = req.params;
        await WebhookHandlers.processWebhook(req.body as Buffer, sig, uuid);
        res.status(200).json({ received: true });
      } catch (error: any) {
        console.error('Webhook error:', error.message);
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  // 請求日誌 middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
        log(logLine);
      }
    });

    next();
  });

  // Initialize Stripe
  await initStripe();

  // Initialize super admin account
  await initializeSuperAdmin();
  
  // 註冊其他 API 路由 (從 routes.ts)
  const httpServer = await registerRoutes(app);

  // 初始化 Socket.IO 即時位置追蹤
  setupSocketIO(httpServer);

  // 錯誤處理
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[Express Error] ${req.method} ${req.path}:`, err.stack || err);
    res.status(status).json({ message });
  });

  // app-ads.txt for AdMob verification
  app.get('/app-ads.txt', (_req, res) => {
    res.type('text/plain').send('google.com, pub-2399075804691684, DIRECT, f08c47fec0942fa0\n');
  });

  // API 404 fallback - 防止未知 API 路由回傳 HTML
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found', path: req.originalUrl });
  });

  // ============================================================
  // 4. 最後：Vite 中介軟體 (負責前端網頁)
  // ============================================================
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ============================================================
  // 5. 啟動伺服器
  // ============================================================
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      console.log("Server is running on port " + port);

      // ============================================================
      // 5.5 啟動資料庫預熱機制（避免 Neon 冷啟動）
      // ============================================================
      startDbWarmup();

      // ============================================================
      // 6. 每小時自動清除過期活動 (快閃活動、節日限定活動)
      // ============================================================
      setInterval(async () => {
        try {
          const deletedCount = await storage.deleteExpiredEvents();
          if (deletedCount > 0) {
            console.log(`[AutoCleanup] Deleted ${deletedCount} expired events`);
          }
        } catch (error) {
          console.error('[AutoCleanup] Error cleaning up expired events:', error);
        }
      }, 3600000); // 3600000ms = 1小時
      
      console.log('[AutoCleanup] Expired events cleanup scheduled (every 1 hour)');
      
      // ============================================================
      // 9. 每 48 小時自動執行資料清洗（名稱正規化 + 智慧去重）
      // ============================================================
      let isDataCleanupRunning = false;
      
      setInterval(async () => {
        if (isDataCleanupRunning) {
          console.log('[DataCleanup] Previous run still in progress, skipping...');
          return;
        }
        
        isDataCleanupRunning = true;
        try {
          const result = await runDataCleanup();
          if (result.totalRenamed > 0 || result.totalDeleted > 0) {
            console.log(`[DataCleanup] Cleanup complete - Renamed: ${result.totalRenamed}, Deleted: ${result.totalDeleted}`);
          }
        } catch (error) {
          console.error('[DataCleanup] Error during data cleanup:', error);
        } finally {
          isDataCleanupRunning = false;
        }
      }, 172800000); // 172800000ms = 48 小時
      
      console.log('[DataCleanup] Data cleanup scheduled (every 48 hours)');
      
      // 啟動時也執行一次清洗
      runDataCleanup().then(result => {
        if (result.totalRenamed > 0 || result.totalDeleted > 0) {
          console.log(`[DataCleanup] Initial cleanup complete - Renamed: ${result.totalRenamed}, Deleted: ${result.totalDeleted}`);
        } else {
          console.log('[DataCleanup] Initial cleanup complete - No changes needed');
        }
      }).catch(err => {
        console.error('[DataCleanup] Initial cleanup error:', err);
      });
    },
  );
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

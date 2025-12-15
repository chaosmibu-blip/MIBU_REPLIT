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
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' });
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
  const ALLOWED_ORIGINS = [
    'https://cca44805-83a8-48a7-8754-2ce82f774385-00-1gu87zpyw11ng.pike.replit.dev',
    'https://mibu-1--s8869420.replit.app',
    process.env.EXPO_APP_URL,
  ].filter(Boolean) as string[];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.some(allowed => origin === allowed || origin.endsWith('.replit.dev') || origin.endsWith('.replit.app'))) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

  // 錯誤處理
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
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
    },
  );
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

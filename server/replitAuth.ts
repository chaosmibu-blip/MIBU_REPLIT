import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { registerUserSchema } from "@shared/schema";
import { z } from "zod";

const JWT_SECRET = process.env.JWT_SECRET || 'mibu_secret_key_fixed_12345';

// Password hashing using PBKDF2 (Node.js built-in)
const SALT_LENGTH = 16;
const HASH_ITERATIONS = 100000;
const HASH_KEY_LENGTH = 64;
const HASH_DIGEST = 'sha512';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const verifyHash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verifyHash));
}

// Super admin initialization
const SUPER_ADMIN_EMAIL = 's8869420@gmail.com';
const SUPER_ADMIN_PASSWORD = 'A25576321zzay69@';

export async function initializeSuperAdmin(): Promise<void> {
  try {
    const existingUser = await storage.getUserByEmail(SUPER_ADMIN_EMAIL);
    
    if (!existingUser) {
      console.log('[Admin] Creating super admin account...');
      await storage.createUser({
        email: SUPER_ADMIN_EMAIL,
        password: hashPassword(SUPER_ADMIN_PASSWORD),
        role: 'admin',
        isApproved: true,
        provider: 'email',
        firstName: 'Super',
        lastName: 'Admin',
      });
      console.log('[Admin] Super admin account created successfully');
    } else {
      // Ensure super admin has correct role and is approved
      if (existingUser.role !== 'admin' || !existingUser.isApproved) {
        console.log('[Admin] Updating super admin privileges...');
        await storage.updateUser(existingUser.id, { 
          role: 'admin', 
          isApproved: true 
        });
        console.log('[Admin] Super admin privileges updated');
      }
    }
  } catch (error) {
    console.error('[Admin] Failed to initialize super admin:', error);
  }
}
console.log('[JWT] Using fixed JWT_SECRET (first 10 chars):', JWT_SECRET.substring(0, 10));
const JWT_EXPIRES_IN = '7d';

const ALLOWED_REDIRECT_ORIGINS = [
  'https://cca44805-83a8-48a7-8754-2ce82f774385-00-1gu87zpyw11ng.pike.replit.dev',
  process.env.EXPO_APP_URL,
].filter(Boolean) as string[];

function isAllowedRedirectUri(uri: string): boolean {
  try {
    // Allow Expo and custom app deep links
    if (uri.startsWith('exp://') || uri.startsWith('myapp://') || uri.startsWith('mibu://')) {
      return true;
    }
    
    const url = new URL(uri);
    return ALLOWED_REDIRECT_ORIGINS.some(allowed => {
      const allowedUrl = new URL(allowed);
      return url.origin === allowedUrl.origin;
    });
  } catch {
    return false;
  }
}

export function generateJwtToken(user: any): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET or SESSION_SECRET is required for token generation');
  }
  const payload = {
    sub: user.claims?.sub || user.id,
    email: user.claims?.email || user.email,
    firstName: user.claims?.first_name || user.firstName,
    lastName: user.claims?.last_name || user.lastName,
    profileImageUrl: user.claims?.profile_image_url || user.profileImageUrl,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwtToken(token: string): any {
  console.log('[JWT DEBUG] verifyJwtToken called');
  console.log('[JWT DEBUG] Token (first 10 chars):', token ? token.substring(0, 10) : 'null/undefined');
  console.log('[JWT DEBUG] JWT_SECRET (first 10 chars):', JWT_SECRET.substring(0, 10));
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('[JWT DEBUG] Token verification SUCCESS, decoded sub:', (decoded as any)?.sub);
    return decoded;
  } catch (error: any) {
    console.log('[JWT DEBUG] Token verification FAILED, reason:', error?.message || 'unknown error');
    return null;
  }
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    provider: 'replit',
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  const loginHandler = (req: any, res: any, next: any) => {
    const redirectUri = req.query.redirect_uri as string | undefined;
    
    if (redirectUri) {
      if (!isAllowedRedirectUri(redirectUri)) {
        return res.status(400).json({ error: 'Invalid redirect_uri' });
      }
      (req.session as any).externalRedirectUri = redirectUri;
      
      // Also set a cookie as backup (session might be lost during OAuth flow)
      res.cookie('app_redirect_uri', redirectUri, {
        httpOnly: true,
        secure: true,
        sameSite: 'none' as const,
        maxAge: 10 * 60 * 1000, // 10 minutes
      });
    }
    
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  };

  app.get("/api/login", loginHandler);
  app.get("/api/auth/login", loginHandler);

  app.get("/api/callback", (req, res, next) => {
    // Helper to get redirect URI from session or cookie
    const getExternalRedirectUri = () => {
      return (req.session as any)?.externalRedirectUri || req.cookies?.app_redirect_uri;
    };
    
    // Helper to clear redirect URI from both session and cookie
    const clearExternalRedirectUri = () => {
      delete (req.session as any).externalRedirectUri;
      res.clearCookie('app_redirect_uri');
    };
    
    // Helper to check if redirect is to a custom app scheme (exp://, mibu://, etc.)
    const isCustomScheme = (uri: string) => {
      return uri.startsWith('exp://') || uri.startsWith('mibu://') || uri.startsWith('myapp://');
    };
    
    // Helper to redirect using HTML bounce page (for iOS Safari compatibility)
    const redirectWithBouncePage = (targetUrl: string, message: string) => {
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登入成功</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; 
      justify-content: center; 
      align-items: center; 
      height: 100vh; 
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
    }
    .container { padding: 20px; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    p { font-size: 16px; opacity: 0.9; }
    .spinner { 
      width: 40px; 
      height: 40px; 
      border: 3px solid rgba(255,255,255,0.3); 
      border-top-color: white; 
      border-radius: 50%; 
      animation: spin 1s linear infinite; 
      margin: 20px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <h1>${message}</h1>
    <div class="spinner"></div>
    <p>正在跳轉回 APP...</p>
  </div>
  <script>
    window.location.href = "${targetUrl}";
  </script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    };
    
    if (req.query.error) {
      console.log("OAuth denied:", req.query.error, req.query.error_description);
      const externalRedirectUri = getExternalRedirectUri();
      if (externalRedirectUri) {
        clearExternalRedirectUri();
        const targetUrl = `${externalRedirectUri}?error=access_denied`;
        if (isCustomScheme(externalRedirectUri)) {
          return redirectWithBouncePage(targetUrl, '登入已取消');
        }
        return res.redirect(targetUrl);
      }
      return res.redirect("/");
    }
    
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, (err: any, user: any) => {
      if (err || !user) {
        const externalRedirectUri = getExternalRedirectUri();
        if (externalRedirectUri) {
          clearExternalRedirectUri();
          const targetUrl = `${externalRedirectUri}?error=auth_failed`;
          if (isCustomScheme(externalRedirectUri)) {
            return redirectWithBouncePage(targetUrl, '登入失敗');
          }
          return res.redirect(targetUrl);
        }
        return res.redirect("/");
      }
      
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return res.redirect("/");
        }
        
        const externalRedirectUri = getExternalRedirectUri();
        if (externalRedirectUri) {
          clearExternalRedirectUri();
          const token = generateJwtToken(user);
          const separator = externalRedirectUri.includes('?') ? '&' : '?';
          const targetUrl = `${externalRedirectUri}${separator}token=${token}`;
          
          if (isCustomScheme(externalRedirectUri)) {
            return redirectWithBouncePage(targetUrl, '登入成功！');
          }
          return res.redirect(targetUrl);
        }
        
        return res.redirect("/");
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });

  app.get("/api/auth/verify", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyJwtToken(token);
    
    if (!decoded) {
      return res.status(401).json({ valid: false, error: 'Invalid or expired token' });
    }
    
    return res.json({
      valid: true,
      user: {
        id: decoded.sub,
        email: decoded.email,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        profileImageUrl: decoded.profileImageUrl,
      }
    });
  });

  app.post("/api/auth/refresh-token", async (req, res) => {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }
    
    const decoded = verifyJwtToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    const user = await storage.getUser(decoded.sub);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const newToken = generateJwtToken({
      claims: {
        sub: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        profile_image_url: user.profileImageUrl,
      }
    });
    
    return res.json({ token: newToken });
  });

  // ============ Email/Password Auth Routes ============

  // POST /api/register - 註冊新帳號
  app.post("/api/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName, role } = req.body;

      // 驗證輸入
      const validated = registerUserSchema.parse({ email, password, firstName, lastName, role });

      // 檢查 email 是否已存在
      const existingUser = await storage.getUserByEmail(validated.email);
      if (existingUser) {
        return res.status(409).json({ error: "此電子郵件已被註冊" });
      }

      // 決定是否需要審核
      const needsApproval = ['merchant', 'specialist', 'admin'].includes(validated.role || 'consumer');
      const isApproved = !needsApproval; // consumer 直接通過，其他需審核

      // 建立使用者
      const user = await storage.createUser({
        email: validated.email,
        password: hashPassword(validated.password),
        firstName: validated.firstName || null,
        lastName: validated.lastName || null,
        role: validated.role || 'consumer',
        provider: 'email',
        isApproved,
      });

      if (needsApproval) {
        return res.status(201).json({
          success: true,
          message: "註冊成功！您的帳號需要管理員審核後才能登入。",
          needsApproval: true,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          }
        });
      }

      // 如果不需要審核，直接發放 token
      const token = generateJwtToken({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });

      return res.status(201).json({
        success: true,
        message: "註冊成功！",
        needsApproval: false,
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "輸入格式錯誤" });
      }
      console.error("Register error:", error);
      return res.status(500).json({ error: "註冊失敗，請稍後再試" });
    }
  });

  // POST /api/login - 登入（email/password）
  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "請輸入電子郵件和密碼" });
      }

      // 查找使用者
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "電子郵件或密碼錯誤" });
      }

      // 檢查是否是 email 註冊的使用者
      if (!user.password) {
        return res.status(401).json({ error: "此帳號使用其他方式登入（如 Replit）" });
      }

      // 檢查審核狀態
      if (!user.isApproved) {
        return res.status(403).json({ 
          error: "帳號待審核中，請聯繫管理員",
          code: "PENDING_APPROVAL"
        });
      }

      // 驗證密碼
      if (!verifyPassword(password, user.password)) {
        return res.status(401).json({ error: "電子郵件或密碼錯誤" });
      }

      // 發放 token
      const token = generateJwtToken({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          profileImageUrl: user.profileImageUrl,
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "登入失敗，請稍後再試" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyJwtToken(token);
    if (decoded) {
      (req as any).jwtUser = decoded;
      (req as any).user = {
        claims: {
          sub: decoded.sub,
          email: decoded.email,
          first_name: decoded.firstName,
          last_name: decoded.lastName,
          profile_image_url: decoded.profileImageUrl,
        }
      };
      return next();
    }
    return res.status(401).json({ message: "Invalid token" });
  }

  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Role-based access control middleware
export const requireRole = (...allowedRoles: string[]): RequestHandler => {
  return async (req, res, next) => {
    const user = req.user as any;
    
    if (!req.isAuthenticated() || !user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const dbUser = await storage.getUser(user.claims.sub);
      if (!dbUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const userRole = dbUser.role || 'consumer';
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: "Forbidden: insufficient permissions" });
      }
      
      // Attach role to request for downstream use
      (req as any).userRole = userRole;
      (req as any).dbUser = dbUser;
      
      return next();
    } catch (error) {
      console.error("Role check error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
};

// Middleware for merchant-only routes
export const isMerchant = requireRole('merchant', 'admin');

// Middleware for admin-only routes
export const isAdmin = requireRole('admin');

import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import jwt from "jsonwebtoken";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const JWT_SECRET = process.env.JWT_SECRET || 'mibu_secret_key_fixed_12345';
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

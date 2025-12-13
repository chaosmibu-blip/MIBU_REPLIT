import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import jwt from "jsonwebtoken";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  console.error('WARNING: JWT_SECRET or SESSION_SECRET must be set for JWT token signing');
}
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
  if (!JWT_SECRET) {
    return null;
  }
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
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
    if (req.query.error) {
      console.log("OAuth denied:", req.query.error, req.query.error_description);
      const externalRedirectUri = (req.session as any)?.externalRedirectUri;
      if (externalRedirectUri) {
        delete (req.session as any).externalRedirectUri;
        return res.redirect(`${externalRedirectUri}?error=access_denied`);
      }
      return res.redirect("/");
    }
    
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, (err: any, user: any) => {
      if (err || !user) {
        const externalRedirectUri = (req.session as any)?.externalRedirectUri;
        if (externalRedirectUri) {
          delete (req.session as any).externalRedirectUri;
          return res.redirect(`${externalRedirectUri}?error=auth_failed`);
        }
        return res.redirect("/");
      }
      
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return res.redirect("/");
        }
        
        const externalRedirectUri = (req.session as any)?.externalRedirectUri;
        if (externalRedirectUri) {
          delete (req.session as any).externalRedirectUri;
          const token = generateJwtToken(user);
          const separator = externalRedirectUri.includes('?') ? '&' : '?';
          return res.redirect(`${externalRedirectUri}${separator}token=${token}`);
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

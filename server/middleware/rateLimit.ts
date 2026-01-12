import { Request, Response, NextFunction } from 'express';

// ⚠️ WARNING: This in-memory rate limiter only works for single-instance deployments.
// For multi-instance/load-balanced setups, use Redis-backed rate limiting (e.g., rate-limit-redis).
// TODO: Migrate to Redis when scaling to multiple instances.
if (!process.env.REDIS_URL) {
  console.warn('⚠️ [Rate Limit] Using in-memory store. Not suitable for multi-instance deployment.');
  console.warn('   Set REDIS_URL environment variable to enable distributed rate limiting.');
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, message = 'Too many requests, please try again later' } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.claims?.sub || req.ip || 'anonymous';
    const routeKey = `${userId}:${req.path}`;
    const now = Date.now();

    let entry = rateLimitStore.get(routeKey);

    if (!entry || now > entry.resetTime) {
      entry = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(routeKey, entry);
      return next();
    }

    entry.count++;

    if (entry.count > maxRequests) {
      console.log(`⚠️ [Rate Limit] ${routeKey} exceeded ${maxRequests} requests`);
      return res.status(429).json({ error: message, retryAfter: Math.ceil((entry.resetTime - now) / 1000) });
    }

    next();
  };
}

export const gachaRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 10,
  message: '抽卡次數過於頻繁，請稍後再試',
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 100,
  message: '請求過於頻繁，請稍後再試',
});

export const strictRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 5,
  message: '操作過於頻繁，請稍後再試',
});

// Admin API 速率限制（每分鐘 10 次，防止暴力破解密鑰）
export const adminRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 10,
  message: '管理操作過於頻繁，請稍後再試',
});

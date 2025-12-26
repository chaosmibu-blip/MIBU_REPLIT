import { Request, Response, NextFunction } from 'express';

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

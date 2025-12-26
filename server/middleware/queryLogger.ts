import { Request, Response, NextFunction } from 'express';

const SLOW_QUERY_THRESHOLD_MS = 500;

export function queryLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const originalJson = res.json.bind(res);

  res.json = function(body: any) {
    const duration = Date.now() - startTime;
    
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(`🐢 [Slow Query] ${req.method} ${req.path} took ${duration}ms`);
    }
    
    return originalJson(body);
  };

  next();
}

export function logSlowQuery(operation: string, startTime: number) {
  const duration = Date.now() - startTime;
  if (duration > SLOW_QUERY_THRESHOLD_MS) {
    console.warn(`🐢 [Slow DB] ${operation} took ${duration}ms`);
  }
  return duration;
}

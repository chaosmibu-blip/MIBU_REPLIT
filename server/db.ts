import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isProduction = process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: isProduction ? 10 : 25,
  idleTimeoutMillis: isProduction ? 30000 : 300000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  console.error('⚠️ [DB Pool] Unexpected error:', err.message);
});

pool.on('connect', () => {
  console.log('🔗 [DB Pool] New connection established');
});

export const db = drizzle(pool, { schema });

let warmupInterval: NodeJS.Timeout | null = null;

export function startDbWarmup() {
  if (warmupInterval) return;
  
  const warmup = async () => {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('[DB Warmup] Ping successful');
    } catch (err: any) {
      console.error('[DB Warmup] Ping failed:', err.message);
    }
  };

  warmup();
  
  warmupInterval = setInterval(warmup, 4 * 60 * 1000);
  console.log('[DB Warmup] Started (every 4 minutes)');
}

export function stopDbWarmup() {
  if (warmupInterval) {
    clearInterval(warmupInterval);
    warmupInterval = null;
    console.log('[DB Warmup] Stopped');
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      const isRetryable = 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNRESET' ||
        error.code === '57P01' ||
        error.code === '57P03' ||
        error.code === '53300' ||
        error.message?.includes('Connection terminated') ||
        error.message?.includes('connection timeout') ||
        error.message?.includes('connection reset') ||
        error.message?.includes('too many clients') ||
        error.message?.includes('backend startup') ||
        error.message?.includes('shutting down') ||
        error.message?.includes('server closed the connection');
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      console.warn(`[DB Retry] Attempt ${attempt} failed (${error.code || error.message?.slice(0, 50)}), retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
  
  throw lastError;
}

export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

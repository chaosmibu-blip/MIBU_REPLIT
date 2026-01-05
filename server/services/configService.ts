import { db } from "../db";
import { systemConfigs, SystemConfig } from "@shared/schema";
import { eq, and } from "drizzle-orm";

class ConfigService {
  private cache: Map<string, any> = new Map();

  async get<T = any>(category: string, key: string): Promise<T | null> {
    const cacheKey = `${category}:${key}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as T;
    }

    const config = await db.query.systemConfigs.findFirst({
      where: and(
        eq(systemConfigs.category, category),
        eq(systemConfigs.key, key)
      ),
    });

    if (config) {
      this.cache.set(cacheKey, config.value);
      return config.value as T;
    }

    return null;
  }

  async getWithDefault<T = any>(category: string, key: string, defaultValue: T): Promise<T> {
    const value = await this.get<T>(category, key);
    return value !== null ? value : defaultValue;
  }

  async set(category: string, key: string, value: any, userId?: number): Promise<void> {
    await db.update(systemConfigs)
      .set({ 
        value, 
        updatedAt: new Date(), 
        updatedBy: userId ?? null 
      })
      .where(and(
        eq(systemConfigs.category, category),
        eq(systemConfigs.key, key)
      ));

    this.cache.delete(`${category}:${key}`);
  }

  async getByCategory(category: string): Promise<SystemConfig[]> {
    return await db.query.systemConfigs.findMany({
      where: eq(systemConfigs.category, category),
    });
  }

  async getAll(): Promise<SystemConfig[]> {
    return await db.query.systemConfigs.findMany();
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const configService = new ConfigService();

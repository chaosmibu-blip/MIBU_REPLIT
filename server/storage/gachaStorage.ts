import { db, withRetry } from "../db";
import { eq, and, desc, sql, isNotNull } from "drizzle-orm";
import {
  collections,
  userInventory,
  couponRedemptions,
  couponRarityConfigs,
  userDailyGachaStats,
  gachaAiLogs,
  coupons,
  places,
  merchantPlaceLinks,
  userNotifications,
  INVENTORY_MAX_SLOTS,
  type Collection, type InsertCollection,
  type UserInventoryItem, type InsertUserInventoryItem,
  type CouponRedemption, type InsertCouponRedemption,
  type CouponRarityConfig, type InsertCouponRarityConfig,
  type GachaAiLog, type InsertGachaAiLog,
  type Place, type Coupon, type MerchantPlaceLink,
} from "@shared/schema";

export const gachaStorage = {
  async getUserCollections(userId: string): Promise<Collection[]> {
    return await db
      .select()
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(desc(collections.collectedAt));
  },

  async getRecentCollectionPlaceIds(userId: string, limit: number = 36): Promise<number[]> {
    const results = await db
      .select({ officialPlaceId: collections.officialPlaceId })
      .from(collections)
      .where(and(
        eq(collections.userId, userId),
        isNotNull(collections.officialPlaceId)
      ))
      .orderBy(desc(collections.collectedAt))
      .limit(limit);
    return results.map(r => r.officialPlaceId!).filter(id => id !== null);
  },

  async addToCollection(collection: InsertCollection): Promise<Collection> {
    const normalizeDistrict = (d: string | undefined | null): string | undefined => {
      if (!d) return undefined;
      return d.replace(/郷/g, '鄉').replace(/県/g, '縣').replace(/市$/g, '市').trim();
    };
    
    const normalizedDistrict = normalizeDistrict(collection.district);
    
    const existing = await db
      .select()
      .from(collections)
      .where(
        and(
          eq(collections.userId, collection.userId),
          eq(collections.placeName, collection.placeName),
          normalizedDistrict ? eq(collections.district, normalizedDistrict) : sql`TRUE`
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    if (collection.district && collection.district !== normalizedDistrict) {
      const existingWithOriginal = await db
        .select()
        .from(collections)
        .where(
          and(
            eq(collections.userId, collection.userId),
            eq(collections.placeName, collection.placeName),
            eq(collections.district, collection.district)
          )
        )
        .limit(1);
      
      if (existingWithOriginal.length > 0) {
        return existingWithOriginal[0];
      }
    }
    
    const dataToInsert = {
      ...collection,
      district: normalizedDistrict || collection.district
    };
    
    const [newCollection] = await db.insert(collections).values(dataToInsert).returning();
    return newCollection;
  },

  async getUserInventory(userId: string): Promise<UserInventoryItem[]> {
    return db.select().from(userInventory)
      .where(and(
        eq(userInventory.userId, userId), 
        eq(userInventory.isDeleted, false)
      ))
      .orderBy(userInventory.slotIndex);
  },

  async getInventorySlotCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(userInventory)
      .where(and(eq(userInventory.userId, userId), eq(userInventory.isDeleted, false)));
    return Number(result[0]?.count || 0);
  },

  async isInventoryFull(userId: string): Promise<boolean> {
    const count = await gachaStorage.getInventorySlotCount(userId);
    return count >= INVENTORY_MAX_SLOTS;
  },

  async getNextAvailableSlot(userId: string): Promise<number | null> {
    const items = await db.select({ slotIndex: userInventory.slotIndex })
      .from(userInventory)
      .where(and(eq(userInventory.userId, userId), eq(userInventory.isDeleted, false)));
    
    const usedSlots = new Set(items.map(i => i.slotIndex));
    for (let i = 0; i < INVENTORY_MAX_SLOTS; i++) {
      if (!usedSlots.has(i)) return i;
    }
    return null;
  },

  async addToUserInventory(item: InsertUserInventoryItem): Promise<UserInventoryItem | null> {
    const nextSlot = await gachaStorage.getNextAvailableSlot(item.userId);
    if (nextSlot === null) return null;
    
    const [created] = await db.insert(userInventory).values({
      ...item,
      slotIndex: nextSlot
    }).returning();
    await gachaStorage.incrementUnreadCount(item.userId, 'itembox');
    return created;
  },

  async markInventoryItemRead(itemId: number): Promise<void> {
    await db.update(userInventory).set({ isRead: true }).where(eq(userInventory.id, itemId));
  },

  async softDeleteInventoryItem(itemId: number, userId: string): Promise<boolean> {
    const [item] = await db.select().from(userInventory)
      .where(and(eq(userInventory.id, itemId), eq(userInventory.userId, userId)));
    if (!item) return false;

    await db.update(userInventory)
      .set({ isDeleted: true, deletedAt: new Date(), status: 'deleted' })
      .where(eq(userInventory.id, itemId));
    return true;
  },

  async redeemInventoryItem(itemId: number, userId: string): Promise<UserInventoryItem | null> {
    const [item] = await db.select().from(userInventory)
      .where(and(
        eq(userInventory.id, itemId),
        eq(userInventory.userId, userId),
        eq(userInventory.isDeleted, false),
        eq(userInventory.isRedeemed, false)
      ));
    if (!item) return null;

    const [updated] = await db.update(userInventory)
      .set({
        isRedeemed: true,
        redeemedAt: new Date(),
        status: 'redeemed',
      })
      .where(eq(userInventory.id, itemId))
      .returning();
    return updated || null;
  },

  async getInventoryItemById(itemId: number, userId: string): Promise<UserInventoryItem | undefined> {
    const [item] = await db.select().from(userInventory)
      .where(and(eq(userInventory.id, itemId), eq(userInventory.userId, userId), eq(userInventory.isDeleted, false)));
    return item || undefined;
  },

  async getUnreadInventoryCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(userInventory)
      .where(and(eq(userInventory.userId, userId), eq(userInventory.isRead, false), eq(userInventory.isDeleted, false)));
    return Number(result[0]?.count || 0);
  },

  async incrementUnreadCount(userId: string, notificationType: string): Promise<void> {
    const [existing] = await db.select().from(userNotifications)
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.notificationType, notificationType)));
    
    if (existing) {
      await db.update(userNotifications)
        .set({ unreadCount: sql`${userNotifications.unreadCount} + 1`, lastUpdatedAt: new Date() })
        .where(eq(userNotifications.id, existing.id));
    } else {
      await db.insert(userNotifications).values({ userId, notificationType, unreadCount: 1 });
    }
  },

  async createCouponRedemption(redemption: InsertCouponRedemption): Promise<CouponRedemption> {
    const [created] = await db.insert(couponRedemptions).values(redemption).returning();
    return created;
  },

  async createAndVerifyCouponRedemption(redemption: InsertCouponRedemption): Promise<CouponRedemption> {
    const [created] = await db.insert(couponRedemptions).values({
      ...redemption,
      status: 'verified',
      verifiedAt: new Date()
    }).returning();
    return created;
  },

  async verifyCouponRedemption(redemptionId: number): Promise<CouponRedemption | undefined> {
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
    const [updated] = await db.update(couponRedemptions)
      .set({ status: 'verified', verifiedAt: new Date(), expiresAt })
      .where(eq(couponRedemptions.id, redemptionId))
      .returning();
    return updated || undefined;
  },

  async expireRedemptionsAndDeleteCoupons(): Promise<number> {
    const now = new Date();
    const expiredRedemptions = await db.select()
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.status, 'verified'), sql`${couponRedemptions.expiresAt} < ${now}`));
    
    for (const redemption of expiredRedemptions) {
      await db.update(userInventory)
        .set({ isRedeemed: true, redeemedAt: new Date() })
        .where(eq(userInventory.id, redemption.userInventoryId));
      
      await db.update(couponRedemptions)
        .set({ status: 'expired' })
        .where(eq(couponRedemptions.id, redemption.id));
    }
    return expiredRedemptions.length;
  },

  async getGlobalRarityConfig(): Promise<CouponRarityConfig | undefined> {
    const [config] = await db.select().from(couponRarityConfigs)
      .where(and(eq(couponRarityConfigs.configKey, 'global'), eq(couponRarityConfigs.isActive, true)));
    return config || undefined;
  },

  async getAllRarityConfigs(): Promise<CouponRarityConfig[]> {
    return db.select().from(couponRarityConfigs).orderBy(couponRarityConfigs.configKey);
  },

  async upsertRarityConfig(config: InsertCouponRarityConfig): Promise<CouponRarityConfig> {
    const [existing] = await db.select().from(couponRarityConfigs)
      .where(eq(couponRarityConfigs.configKey, config.configKey || 'global'));
    
    if (existing) {
      const [updated] = await db.update(couponRarityConfigs)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(couponRarityConfigs.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(couponRarityConfigs).values(config).returning();
      return created;
    }
  },

  async deleteRarityConfig(id: number): Promise<void> {
    await db.delete(couponRarityConfigs).where(eq(couponRarityConfigs.id, id));
  },

  async rollCouponTier(): Promise<string | null> {
    const config = await gachaStorage.getGlobalRarityConfig();
    const rates = config ? {
      SP: config.spRate,
      SSR: config.ssrRate,
      SR: config.srRate,
      S: config.sRate,
      R: config.rRate
    } : { SP: 2, SSR: 8, SR: 15, S: 23, R: 32 };

    const roll = Math.random() * 100;
    let cumulative = 0;
    
    for (const [tier, rate] of Object.entries(rates)) {
      cumulative += rate;
      if (roll < cumulative) return tier;
    }
    return null;
  },

  async getUserDailyGachaCount(userId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const [stat] = await db.select()
      .from(userDailyGachaStats)
      .where(and(
        eq(userDailyGachaStats.userId, userId),
        eq(userDailyGachaStats.date, today)
      ));
    return stat?.pullCount || 0;
  },

  async incrementUserDailyGachaCount(userId: string, count: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await db.execute(sql`
      INSERT INTO user_daily_gacha_stats (user_id, date, pull_count, updated_at)
      VALUES (${userId}, ${today}, ${count}, NOW())
      ON CONFLICT (user_id, date) 
      DO UPDATE SET 
        pull_count = user_daily_gacha_stats.pull_count + ${count},
        updated_at = NOW()
      RETURNING pull_count
    `);
    
    const rows = result.rows as Array<{ pull_count: number }>;
    return rows[0]?.pull_count || count;
  },

  async saveGachaAiLog(log: InsertGachaAiLog): Promise<GachaAiLog> {
    const shouldPublish = await gachaStorage.checkTripDedup(log.orderedPlaceIds ?? undefined);
    
    const [newLog] = await db
      .insert(gachaAiLogs)
      .values({
        ...log,
        isPublished: shouldPublish,
        publishedAt: shouldPublish ? new Date() : undefined,
      })
      .returning();
    
    if (shouldPublish) {
      console.log('[Gacha] Trip auto-published:', { 
        sessionId: log.sessionId, 
        city: log.city, 
        district: log.district,
        placeCount: log.orderedPlaceIds?.length 
      });
    }
    
    return newLog;
  },

  async checkTripDedup(orderedPlaceIds?: number[]): Promise<boolean> {
    if (!orderedPlaceIds || orderedPlaceIds.length < 3) {
      return false;
    }
    
    const sortedIds = [...orderedPlaceIds].sort((a, b) => a - b);
    
    const existingTrips = await db
      .select({ orderedPlaceIds: gachaAiLogs.orderedPlaceIds })
      .from(gachaAiLogs)
      .where(eq(gachaAiLogs.isPublished, true))
      .limit(1000);
    
    for (const trip of existingTrips) {
      if (!trip.orderedPlaceIds) continue;
      const existingSorted = [...trip.orderedPlaceIds].sort((a, b) => a - b);
      if (JSON.stringify(existingSorted) === JSON.stringify(sortedIds)) {
        console.log('[Gacha] Duplicate trip detected, skipping publish');
        return false;
      }
    }
    
    return true;
  },

  async getTripSequenceNumber(city: string, district?: string): Promise<number> {
    const conditions = [
      eq(gachaAiLogs.isPublished, true),
      eq(gachaAiLogs.city, city),
    ];
    if (district) {
      conditions.push(eq(gachaAiLogs.district, district));
    }
    
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gachaAiLogs)
      .where(and(...conditions));
    
    return (result?.count || 0) + 1;
  },

  async saveToCollectionWithCoupon(userId: string, place: Place, wonCoupon?: Coupon, aiReason?: string, gachaSessionId?: string): Promise<Collection> {
    const collectionData: InsertCollection = {
      userId,
      officialPlaceId: place.id,
      gachaSessionId: gachaSessionId || undefined,
      placeName: place.placeName,
      country: place.country,
      city: place.city,
      district: place.district,
      category: place.category,
      subcategory: place.subcategory || undefined,
      description: place.description || undefined,
      address: place.address || undefined,
      placeId: place.googlePlaceId || undefined,
      rating: place.rating?.toString(),
      locationLat: place.locationLat?.toString(),
      locationLng: place.locationLng?.toString(),
      isCoupon: !!wonCoupon,
      couponData: wonCoupon ? { 
        title: wonCoupon.title, 
        code: wonCoupon.code, 
        terms: wonCoupon.terms 
      } : undefined,
      wonCouponId: wonCoupon?.id,
      aiReason: aiReason || undefined,
    };

    const [newCollection] = await db
      .insert(collections)
      .values(collectionData)
      .returning();
    
    if (wonCoupon) {
      await db
        .update(coupons)
        .set({ 
          remainingQuantity: sql`${coupons.remainingQuantity} - 1`,
          impressionCount: sql`${coupons.impressionCount} + 1`
        })
        .where(eq(coupons.id, wonCoupon.id));
    }

    return newCollection;
  },

  async getClaimByOfficialPlaceId(officialPlaceId: number): Promise<{ claim: MerchantPlaceLink; coupons: Coupon[] } | undefined> {
    const [claim] = await db
      .select()
      .from(merchantPlaceLinks)
      .where(
        and(
          eq(merchantPlaceLinks.officialPlaceId, officialPlaceId),
          eq(merchantPlaceLinks.status, 'approved')
        )
      );
    
    if (!claim) {
      return undefined;
    }

    const placeCoupons = await db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.placeId, officialPlaceId),
          eq(coupons.isActive, true),
          eq(coupons.archived, false),
          sql`${coupons.remainingQuantity} > 0`
        )
      );

    return { claim, coupons: placeCoupons };
  },

  async getOfficialPlacesByDistrict(city: string, district: string, limit?: number): Promise<Place[]> {
    return withRetry(async () => {
      const query = db
        .select()
        .from(places)
        .where(and(
          eq(places.city, city), 
          eq(places.district, district),
          eq(places.isActive, true)
        ))
        .orderBy(sql`RANDOM()`);
      
      if (limit) {
        return await query.limit(limit);
      }
      return await query;
    });
  },

  async getOfficialPlacesByCity(city: string, limit?: number): Promise<Place[]> {
    return withRetry(async () => {
      const query = db
        .select()
        .from(places)
        .where(and(
          eq(places.city, city),
          eq(places.isActive, true)
        ))
        .orderBy(sql`RANDOM()`);
      
      if (limit) {
        return await query.limit(limit);
      }
      return await query;
    });
  },

  async getPlaceByGoogleId(googlePlaceId: string): Promise<Place | undefined> {
    return withRetry(async () => {
      const [place] = await db
        .select()
        .from(places)
        .where(and(
          eq(places.googlePlaceId, googlePlaceId),
          eq(places.isActive, true)
        ))
        .limit(1);
      return place;
    });
  },

  async getPlacesByDistrict(city: string, district: string): Promise<Place[]> {
    return withRetry(async () => {
      return await db
        .select()
        .from(places)
        .where(and(
          eq(places.city, city), 
          eq(places.district, district),
          eq(places.isActive, true)
        ));
    });
  },

  async getJackpotPlaces(city: string, district: string): Promise<Place[]> {
    return withRetry(async () => {
      return await db
        .select()
        .from(places)
        .where(
          sql`${places.city} = ${city} AND ${places.district} = ${district} AND ${places.isActive} = true AND (${places.rating} >= 4.5 OR ${places.merchantId} IS NOT NULL)`
        );
    });
  },

  async getCouponsByPlaceId(placeId: number): Promise<Coupon[]> {
    return await db
      .select()
      .from(coupons)
      .where(eq(coupons.placeId, placeId));
  },

  /**
   * 標記過期的道具箱優惠券
   * 檢查 validUntil 已過期且尚未標記的項目
   */
  async markExpiredInventoryItems(): Promise<number> {
    const now = new Date();
    const result = await db.update(userInventory)
      .set({
        isExpired: true,
        status: 'expired',
      })
      .where(and(
        eq(userInventory.isExpired, false),
        eq(userInventory.isDeleted, false),
        eq(userInventory.isRedeemed, false),
        sql`${userInventory.validUntil} IS NOT NULL`,
        sql`${userInventory.validUntil} < ${now}`
      ))
      .returning({ id: userInventory.id });
    return result.length;
  },

  /**
   * 取得即將過期的優惠券（未來 N 天內）
   */
  async getExpiringInventoryItems(userId: string, daysAhead: number = 7): Promise<UserInventoryItem[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    return await db
      .select()
      .from(userInventory)
      .where(and(
        eq(userInventory.userId, userId),
        eq(userInventory.isExpired, false),
        eq(userInventory.isDeleted, false),
        eq(userInventory.isRedeemed, false),
        sql`${userInventory.validUntil} IS NOT NULL`,
        sql`${userInventory.validUntil} > ${now}`,
        sql`${userInventory.validUntil} <= ${futureDate}`
      ))
      .orderBy(userInventory.validUntil);
  },
};

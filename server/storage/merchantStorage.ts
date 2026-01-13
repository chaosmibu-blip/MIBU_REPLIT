import { db } from "../db";
import { eq, and, desc, sql, ilike, or, gte, lte, isNull } from "drizzle-orm";
import {
  merchants, coupons, merchantCoupons, merchantPlaceLinks, placeProducts, placeCache,
  transactions, merchantAnalytics, districts, regions,
  type Merchant, type InsertMerchant,
  type Coupon, type InsertCoupon,
  type MerchantCoupon, type InsertMerchantCoupon,
  type PlaceProduct, type InsertPlaceProduct,
  type Transaction, type InsertTransaction,
  type MerchantAnalytics, type InsertMerchantAnalytics
} from "@shared/schema";

export const merchantStorage = {
  async getMerchantByUserId(userId: string): Promise<Merchant | undefined> {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.userId, userId));
    return merchant || undefined;
  },

  async getMerchantById(id: number): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
    return merchant || undefined;
  },

  async getMerchantByEmail(email: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.email, email));
    return merchant || undefined;
  },

  async createMerchant(merchant: InsertMerchant): Promise<Merchant> {
    const [newMerchant] = await db
      .insert(merchants)
      .values(merchant)
      .returning();
    return newMerchant;
  },

  async updateMerchantPlan(merchantId: number, plan: string): Promise<Merchant> {
    const [updated] = await db
      .update(merchants)
      .set({ subscriptionPlan: plan })
      .where(eq(merchants.id, merchantId))
      .returning();
    return updated;
  },

  async updateMerchant(merchantId: number, data: Partial<Merchant>): Promise<Merchant | undefined> {
    const [updated] = await db
      .update(merchants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(merchants.id, merchantId))
      .returning();
    return updated;
  },

  async updateMerchantDailySeedCode(merchantId: number, seedCode: string): Promise<Merchant | undefined> {
    const [updated] = await db
      .update(merchants)
      .set({
        dailySeedCode: seedCode,
        codeUpdatedAt: new Date()
      })
      .where(eq(merchants.id, merchantId))
      .returning();
    return updated || undefined;
  },

  async getMerchantDailySeedCode(merchantId: number): Promise<{ seedCode: string; updatedAt: Date } | undefined> {
    const [merchant] = await db
      .select({ 
        dailySeedCode: merchants.dailySeedCode, 
        codeUpdatedAt: merchants.codeUpdatedAt 
      })
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    
    if (merchant?.dailySeedCode && merchant?.codeUpdatedAt) {
      return { seedCode: merchant.dailySeedCode, updatedAt: merchant.codeUpdatedAt };
    }
    return undefined;
  },

  async createMerchantCoupon(data: InsertMerchantCoupon): Promise<MerchantCoupon> {
    const [coupon] = await db.insert(merchantCoupons).values(data).returning();
    return coupon;
  },

  async updateMerchantCoupon(couponId: number, merchantId: number, data: Partial<MerchantCoupon>): Promise<MerchantCoupon | null> {
    const [coupon] = await db.select().from(merchantCoupons)
      .where(and(eq(merchantCoupons.id, couponId), eq(merchantCoupons.merchantId, merchantId)));
    if (!coupon) return null;
    
    const [updated] = await db.update(merchantCoupons)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(merchantCoupons.id, couponId))
      .returning();
    return updated;
  },

  async deleteMerchantCoupon(couponId: number, merchantId: number): Promise<boolean> {
    const [coupon] = await db.select().from(merchantCoupons)
      .where(and(eq(merchantCoupons.id, couponId), eq(merchantCoupons.merchantId, merchantId)));
    if (!coupon) return false;
    
    await db.delete(merchantCoupons).where(eq(merchantCoupons.id, couponId));
    return true;
  },

  async getMerchantCoupons(merchantId: number): Promise<Coupon[]> {
    return await db
      .select()
      .from(coupons)
      .where(eq(coupons.merchantId, merchantId))
      .orderBy(desc(coupons.createdAt));
  },

  async getActiveCoupons(merchantId: number): Promise<Coupon[]> {
    return await db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.merchantId, merchantId),
          eq(coupons.isActive, true),
          eq(coupons.archived, false)
        )
      );
  },

  async createCoupon(coupon: InsertCoupon): Promise<Coupon> {
    const [newCoupon] = await db
      .insert(coupons)
      .values(coupon)
      .returning();
    return newCoupon;
  },

  async updateCoupon(couponId: number, data: Partial<Coupon>): Promise<Coupon> {
    const [updated] = await db
      .update(coupons)
      .set(data)
      .where(eq(coupons.id, couponId))
      .returning();
    return updated;
  },

  async getCouponById(couponId: number): Promise<Coupon | null> {
    const [coupon] = await db
      .select()
      .from(coupons)
      .where(eq(coupons.id, couponId));
    return coupon || null;
  },

  async getRegionPrizePoolCoupons(regionId: number): Promise<any[]> {
    const regionDistricts = await db
      .select()
      .from(districts)
      .where(eq(districts.regionId, regionId));
    
    if (regionDistricts.length === 0) {
      return [];
    }

    const [region] = await db
      .select()
      .from(regions)
      .where(eq(regions.id, regionId));
    
    if (!region) {
      return [];
    }

    const districtNames = regionDistricts.flatMap(d => [d.nameZh, d.nameEn].filter(Boolean));
    const cityNames = [region.nameZh, region.nameEn].filter(Boolean);

    const prizePoolCoupons = await db
      .select({
        id: coupons.id,
        title: coupons.title,
        description: coupons.terms,
        rarity: coupons.rarity,
        merchantName: merchants.name,
        discount: coupons.code,
        merchantId: coupons.merchantId,
        placeDistrict: merchantPlaceLinks.district,
        placeCity: merchantPlaceLinks.city,
      })
      .from(coupons)
      .innerJoin(merchants, eq(coupons.merchantId, merchants.id))
      .leftJoin(merchantPlaceLinks, eq(coupons.merchantPlaceLinkId, merchantPlaceLinks.id))
      .where(
        and(
          eq(coupons.isActive, true),
          eq(coupons.archived, false),
          or(
            eq(coupons.rarity, 'SP'),
            eq(coupons.rarity, 'SSR')
          )
        )
      );

    const filteredCoupons = prizePoolCoupons.filter(coupon => {
      if (!coupon.placeDistrict && !coupon.placeCity) {
        return true;
      }
      
      if (coupon.placeDistrict && districtNames.some(d => 
        d.toLowerCase() === coupon.placeDistrict?.toLowerCase()
      )) {
        return true;
      }
      
      if (coupon.placeCity && cityNames.some(c => 
        c.toLowerCase() === coupon.placeCity?.toLowerCase()
      )) {
        return true;
      }
      
      return false;
    });

    return filteredCoupons.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      rarity: c.rarity,
      merchantName: c.merchantName || 'Unknown',
      discount: c.discount,
    }));
  },

  async getPlaceNamesWithProducts(): Promise<string[]> {
    const products = await db.select({ placeCacheId: placeProducts.placeCacheId })
      .from(placeProducts)
      .where(eq(placeProducts.isActive, true))
      .groupBy(placeProducts.placeCacheId);
    
    if (products.length === 0) return [];
    
    const placeIds = products.map(p => p.placeCacheId).filter((id): id is number => id !== null);
    if (placeIds.length === 0) return [];
    
    const placesResult = await db.select({ placeName: placeCache.placeName })
      .from(placeCache)
      .where(sql`${placeCache.id} = ANY(${placeIds})`);
    
    return placesResult.map(p => p.placeName);
  },

  async getProductsByPlaceId(placeCacheId: number): Promise<PlaceProduct[]> {
    return db.select().from(placeProducts).where(
      and(eq(placeProducts.placeCacheId, placeCacheId), eq(placeProducts.isActive, true))
    );
  },

  async getProductsByPlaceName(placeName: string): Promise<PlaceProduct[]> {
    const placesResult = await db.select().from(placeCache).where(ilike(placeCache.placeName, `%${placeName}%`)).limit(5);
    if (placesResult.length === 0) return [];
    const placeIds = placesResult.map(p => p.id);
    return db.select().from(placeProducts).where(
      and(sql`${placeProducts.placeCacheId} = ANY(${placeIds})`, eq(placeProducts.isActive, true))
    );
  },

  async getProductById(productId: number): Promise<PlaceProduct | undefined> {
    const [product] = await db.select().from(placeProducts).where(eq(placeProducts.id, productId));
    return product;
  },

  async createProduct(product: InsertPlaceProduct): Promise<PlaceProduct> {
    const [created] = await db.insert(placeProducts).values(product).returning();
    return created;
  },

  async updateProduct(productId: number, data: Partial<PlaceProduct>): Promise<PlaceProduct> {
    const [updated] = await db.update(placeProducts).set({ ...data, updatedAt: new Date() }).where(eq(placeProducts.id, productId)).returning();
    return updated;
  },

  async deleteProduct(productId: number): Promise<void> {
    await db.delete(placeProducts).where(eq(placeProducts.id, productId));
  },

  async searchPlacesByName(query: string): Promise<any[]> {
    return db.select().from(placeCache).where(ilike(placeCache.placeName, `%${query}%`)).limit(10);
  },

  async getMerchantProducts(merchantId: number): Promise<PlaceProduct[]> {
    return db.select().from(placeProducts).where(eq(placeProducts.merchantId, merchantId)).orderBy(desc(placeProducts.createdAt));
  },

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [created] = await db.insert(transactions).values(transaction).returning();
    return created;
  },

  async getTransactionById(id: number): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || undefined;
  },

  async getTransactionsByMerchantId(merchantId: number): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.merchantId, merchantId)).orderBy(desc(transactions.createdAt));
  },

  async updateTransactionStatus(id: number, status: string): Promise<Transaction | undefined> {
    const [updated] = await db.update(transactions).set({ paymentStatus: status, paidAt: status === 'paid' ? new Date() : undefined }).where(eq(transactions.id, id)).returning();
    return updated || undefined;
  },

  async recordMerchantAnalytics(data: InsertMerchantAnalytics): Promise<MerchantAnalytics> {
    const [record] = await db.insert(merchantAnalytics).values(data).returning();
    return record;
  },

  async getMerchantAnalytics(merchantId: number, startDate?: string, endDate?: string): Promise<MerchantAnalytics[]> {
    const conditions = [eq(merchantAnalytics.merchantId, merchantId)];
    
    if (startDate) {
      conditions.push(gte(merchantAnalytics.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(merchantAnalytics.date, endDate));
    }
    
    return db.select().from(merchantAnalytics)
      .where(and(...conditions))
      .orderBy(desc(merchantAnalytics.date));
  },

  async getMerchantAnalyticsSummary(merchantId: number): Promise<{
    totalCollectors: number;
    totalClicks: number;
    totalCouponUsage: number;
    totalCouponIssued: number;
    totalPrizePoolViews: number;
    todayCollected: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await db.select({
      totalCollectors: sql<number>`COALESCE(SUM(${merchantAnalytics.totalCollectors}), 0)`,
      totalClicks: sql<number>`COALESCE(SUM(${merchantAnalytics.clickCount}), 0)`,
      totalCouponUsage: sql<number>`COALESCE(SUM(${merchantAnalytics.couponUsageCount}), 0)`,
      totalCouponIssued: sql<number>`COALESCE(SUM(${merchantAnalytics.couponIssuedCount}), 0)`,
      totalPrizePoolViews: sql<number>`COALESCE(SUM(${merchantAnalytics.prizePoolViews}), 0)`,
    }).from(merchantAnalytics)
      .where(eq(merchantAnalytics.merchantId, merchantId));

    const todayResult = await db.select({
      todayCollected: sql<number>`COALESCE(SUM(${merchantAnalytics.collectedCount}), 0)`,
    }).from(merchantAnalytics)
      .where(and(
        eq(merchantAnalytics.merchantId, merchantId),
        eq(merchantAnalytics.date, today)
      ));

    return {
      totalCollectors: Number(result[0]?.totalCollectors) || 0,
      totalClicks: Number(result[0]?.totalClicks) || 0,
      totalCouponUsage: Number(result[0]?.totalCouponUsage) || 0,
      totalCouponIssued: Number(result[0]?.totalCouponIssued) || 0,
      totalPrizePoolViews: Number(result[0]?.totalPrizePoolViews) || 0,
      todayCollected: Number(todayResult[0]?.todayCollected) || 0,
    };
  },

  async incrementAnalyticsCounter(
    merchantId: number, 
    placeId: number | null, 
    field: 'collectedCount' | 'clickCount' | 'couponUsageCount' | 'couponIssuedCount' | 'prizePoolViews'
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    const existing = await db.select().from(merchantAnalytics)
      .where(and(
        eq(merchantAnalytics.merchantId, merchantId),
        placeId ? eq(merchantAnalytics.placeId, placeId) : isNull(merchantAnalytics.placeId),
        eq(merchantAnalytics.date, today)
      ));

    if (existing.length > 0) {
      const updateData: Record<string, any> = { updatedAt: new Date() };
      updateData[field] = sql`${merchantAnalytics[field]} + 1`;
      
      if (field === 'collectedCount') {
        updateData.totalCollectors = sql`${merchantAnalytics.totalCollectors} + 1`;
      }

      await db.update(merchantAnalytics)
        .set(updateData)
        .where(eq(merchantAnalytics.id, existing[0].id));
    } else {
      const insertData: InsertMerchantAnalytics = {
        merchantId,
        placeId,
        date: today,
        collectedCount: field === 'collectedCount' ? 1 : 0,
        totalCollectors: field === 'collectedCount' ? 1 : 0,
        clickCount: field === 'clickCount' ? 1 : 0,
        couponUsageCount: field === 'couponUsageCount' ? 1 : 0,
        couponIssuedCount: field === 'couponIssuedCount' ? 1 : 0,
        prizePoolViews: field === 'prizePoolViews' ? 1 : 0,
      };
      await db.insert(merchantAnalytics).values(insertData);
    }
  },

  async getMerchantCouponsByPlaceLink(merchantPlaceLinkId: number): Promise<MerchantCoupon[]> {
    return db.select().from(merchantCoupons)
      .where(and(eq(merchantCoupons.merchantPlaceLinkId, merchantPlaceLinkId), eq(merchantCoupons.isActive, true)));
  },
};

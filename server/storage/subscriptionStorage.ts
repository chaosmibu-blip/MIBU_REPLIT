import { db } from "../db";
import { merchantSubscriptions, merchants, places, InsertMerchantSubscription, MerchantSubscription } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export const subscriptionStorage = {
  async createSubscription(data: InsertMerchantSubscription): Promise<MerchantSubscription> {
    const [subscription] = await db.insert(merchantSubscriptions).values(data).returning();
    return subscription;
  },

  async getSubscriptionById(id: number): Promise<MerchantSubscription | null> {
    const [subscription] = await db
      .select()
      .from(merchantSubscriptions)
      .where(eq(merchantSubscriptions.id, id));
    return subscription || null;
  },

  async getSubscriptionByProviderId(provider: string, providerSubscriptionId: string): Promise<MerchantSubscription | null> {
    const [subscription] = await db
      .select()
      .from(merchantSubscriptions)
      .where(
        and(
          eq(merchantSubscriptions.provider, provider),
          eq(merchantSubscriptions.providerSubscriptionId, providerSubscriptionId)
        )
      );
    return subscription || null;
  },

  async getMerchantActiveSubscription(merchantId: number, type: 'merchant' | 'place', placeId?: number): Promise<MerchantSubscription | null> {
    const conditions = [
      eq(merchantSubscriptions.merchantId, merchantId),
      eq(merchantSubscriptions.type, type),
      eq(merchantSubscriptions.status, 'active'),
    ];

    if (type === 'place' && placeId) {
      conditions.push(eq(merchantSubscriptions.placeId, placeId));
    }

    const [subscription] = await db
      .select()
      .from(merchantSubscriptions)
      .where(and(...conditions))
      .orderBy(desc(merchantSubscriptions.createdAt))
      .limit(1);

    return subscription || null;
  },

  async getMerchantSubscriptions(merchantId: number): Promise<MerchantSubscription[]> {
    return db
      .select()
      .from(merchantSubscriptions)
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .orderBy(desc(merchantSubscriptions.createdAt));
  },

  async updateSubscription(id: number, data: Partial<MerchantSubscription>): Promise<MerchantSubscription | null> {
    const [subscription] = await db
      .update(merchantSubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(merchantSubscriptions.id, id))
      .returning();
    return subscription || null;
  },

  async updateMerchantLevel(merchantId: number, level: string, expiresAt: Date | null): Promise<void> {
    await db
      .update(merchants)
      .set({
        merchantLevel: level,
        merchantLevelExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(merchants.id, merchantId));
  },

  async updateMerchantStripeCustomerId(merchantId: number, stripeCustomerId: string): Promise<void> {
    await db
      .update(merchants)
      .set({
        stripeCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(merchants.id, merchantId));
  },

  async updateMerchantRecurCustomerId(merchantId: number, recurCustomerId: string): Promise<void> {
    await db
      .update(merchants)
      .set({
        recurCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(merchants.id, merchantId));
  },

  async updatePlaceCardTier(placeId: number, tier: string, expiresAt: Date | null): Promise<void> {
    await db
      .update(places)
      .set({
        placeCardTier: tier,
        placeCardTierExpiresAt: expiresAt,
      })
      .where(eq(places.id, placeId));
  },

  async cancelSubscription(id: number): Promise<MerchantSubscription | null> {
    const [subscription] = await db
      .update(merchantSubscriptions)
      .set({
        status: 'canceling',
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(merchantSubscriptions.id, id))
      .returning();
    return subscription || null;
  },

  async expireSubscription(id: number): Promise<MerchantSubscription | null> {
    const [subscription] = await db
      .update(merchantSubscriptions)
      .set({
        status: 'expired',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(merchantSubscriptions.id, id))
      .returning();
    return subscription || null;
  },
};

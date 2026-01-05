import { db } from "../db";
import { eq, and, desc, sql, ilike, or, isNull, isNotNull, gte, inArray } from "drizzle-orm";
import {
  placeCache,
  placeFeedback,
  merchantPlaceLinks,
  placeDrafts,
  placeApplications,
  merchants,
  type PlaceCache,
  type InsertPlaceCache,
  type PlaceFeedback,
  type MerchantPlaceLink,
  type InsertMerchantPlaceLink,
  type PlaceDraft,
  type InsertPlaceDraft,
  type PlaceApplication,
  type InsertPlaceApplication,
  type Merchant,
} from "@shared/schema";

export const placeStorage = {
  // Place Cache methods
  async getCachedPlace(subCategory: string, district: string, city: string, country: string): Promise<PlaceCache | undefined> {
    const [place] = await db
      .select()
      .from(placeCache)
      .where(
        and(
          eq(placeCache.subCategory, subCategory),
          eq(placeCache.district, district),
          eq(placeCache.city, city),
          eq(placeCache.country, country)
        )
      )
      .limit(1);
    return place || undefined;
  },

  async getCachedPlaces(district: string, city: string, country: string): Promise<PlaceCache[]> {
    return await db
      .select()
      .from(placeCache)
      .where(
        and(
          eq(placeCache.district, district),
          eq(placeCache.city, city),
          eq(placeCache.country, country)
        )
      );
  },

  async savePlaceToCache(place: InsertPlaceCache): Promise<PlaceCache> {
    const [newPlace] = await db
      .insert(placeCache)
      .values(place)
      .returning();
    return newPlace;
  },

  async savePlacesToCache(places: InsertPlaceCache[]): Promise<PlaceCache[]> {
    if (places.length === 0) return [];
    return await db
      .insert(placeCache)
      .values(places)
      .returning();
  },

  async getUnreviewedPlaceCache(limit: number): Promise<PlaceCache[]> {
    return await db
      .select()
      .from(placeCache)
      .where(or(eq(placeCache.aiReviewed, false), isNull(placeCache.aiReviewed)))
      .limit(limit);
  },

  async markPlaceCacheReviewed(id: number, reviewed: boolean): Promise<void> {
    await db
      .update(placeCache)
      .set({ 
        aiReviewed: reviewed, 
        aiReviewedAt: new Date() 
      })
      .where(eq(placeCache.id, id));
  },

  async deletePlaceCache(id: number): Promise<void> {
    await db.delete(placeCache).where(eq(placeCache.id, id));
  },

  async getPlaceCacheReviewStats(): Promise<{ total: number; reviewed: number; unreviewed: number }> {
    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        reviewed: sql<number>`count(*) filter (where ${placeCache.aiReviewed} = true)::int`,
        unreviewed: sql<number>`count(*) filter (where ${placeCache.aiReviewed} = false or ${placeCache.aiReviewed} is null)::int`
      })
      .from(placeCache);
    return {
      total: stats?.total ?? 0,
      reviewed: stats?.reviewed ?? 0,
      unreviewed: stats?.unreviewed ?? 0
    };
  },

  async getPlaceCacheByCity(city: string): Promise<PlaceCache[]> {
    return await db
      .select()
      .from(placeCache)
      .where(eq(placeCache.city, city));
  },

  // Place Feedback methods
  async getPlacePenalty(userId: string, placeName: string, district: string, city: string): Promise<number> {
    const [feedback] = await db
      .select()
      .from(placeFeedback)
      .where(and(
        eq(placeFeedback.userId, userId),
        eq(placeFeedback.placeName, placeName),
        eq(placeFeedback.district, district),
        eq(placeFeedback.city, city)
      ));
    return feedback?.penaltyScore || 0;
  },

  async incrementPlacePenalty(userId: string, placeName: string, district: string, city: string, placeCacheId?: number): Promise<PlaceFeedback> {
    const existing = await db
      .select()
      .from(placeFeedback)
      .where(and(
        eq(placeFeedback.userId, userId),
        eq(placeFeedback.placeName, placeName),
        eq(placeFeedback.district, district),
        eq(placeFeedback.city, city)
      ));

    if (existing.length > 0) {
      const [updated] = await db
        .update(placeFeedback)
        .set({
          penaltyScore: existing[0].penaltyScore + 1,
          lastInteractedAt: new Date()
        })
        .where(eq(placeFeedback.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(placeFeedback)
        .values({
          userId,
          placeName,
          district,
          city,
          placeCacheId: placeCacheId || null,
          penaltyScore: 1,
          lastInteractedAt: new Date()
        })
        .returning();
      return created;
    }
  },

  async getExcludedPlaceNames(userId: string, district: string, city: string, threshold: number = 3): Promise<string[]> {
    const results = await db
      .select({ placeName: placeFeedback.placeName })
      .from(placeFeedback)
      .where(and(
        eq(placeFeedback.district, district),
        eq(placeFeedback.city, city),
        or(
          isNull(placeFeedback.userId),
          and(
            eq(placeFeedback.userId, userId),
            sql`${placeFeedback.penaltyScore} >= ${threshold}`
          )
        )
      ));
    return results.map(r => r.placeName);
  },

  async createPlaceFeedback(data: { userId: string; placeName: string; district: string; city: string; penaltyScore: number }): Promise<PlaceFeedback> {
    const [created] = await db
      .insert(placeFeedback)
      .values({
        userId: data.userId,
        placeName: data.placeName,
        district: data.district,
        city: data.city,
        penaltyScore: data.penaltyScore,
        lastInteractedAt: new Date()
      })
      .returning();
    return created;
  },

  async addGlobalExclusion(data: { placeName: string; district: string; city: string }): Promise<PlaceFeedback> {
    const existing = await db
      .select()
      .from(placeFeedback)
      .where(and(
        isNull(placeFeedback.userId),
        eq(placeFeedback.placeName, data.placeName),
        eq(placeFeedback.district, data.district),
        eq(placeFeedback.city, data.city)
      ));

    if (existing.length > 0) {
      return existing[0];
    }

    const [created] = await db
      .insert(placeFeedback)
      .values({
        userId: null,
        placeName: data.placeName,
        district: data.district,
        city: data.city,
        penaltyScore: 999,
        lastInteractedAt: new Date()
      })
      .returning();
    return created;
  },

  async getGlobalExclusions(district?: string, city?: string): Promise<PlaceFeedback[]> {
    if (district && city) {
      return db
        .select()
        .from(placeFeedback)
        .where(and(
          isNull(placeFeedback.userId),
          eq(placeFeedback.district, district),
          eq(placeFeedback.city, city)
        ))
        .orderBy(desc(placeFeedback.createdAt));
    }
    return db
      .select()
      .from(placeFeedback)
      .where(isNull(placeFeedback.userId))
      .orderBy(desc(placeFeedback.createdAt));
  },

  async removeGlobalExclusion(id: number): Promise<boolean> {
    const result = await db
      .delete(placeFeedback)
      .where(and(
        eq(placeFeedback.id, id),
        isNull(placeFeedback.userId)
      ))
      .returning();
    return result.length > 0;
  },

  // Merchant Place Links methods
  async getMerchantPlaceLinks(merchantId: number): Promise<MerchantPlaceLink[]> {
    return db
      .select()
      .from(merchantPlaceLinks)
      .where(eq(merchantPlaceLinks.merchantId, merchantId))
      .orderBy(desc(merchantPlaceLinks.createdAt));
  },

  async getPlaceLinkByPlace(placeName: string, district: string, city: string): Promise<MerchantPlaceLink | undefined> {
    const [link] = await db
      .select()
      .from(merchantPlaceLinks)
      .where(and(
        eq(merchantPlaceLinks.placeName, placeName),
        eq(merchantPlaceLinks.district, district),
        eq(merchantPlaceLinks.city, city),
        eq(merchantPlaceLinks.status, 'approved')
      ));
    return link;
  },

  async getPlaceLinkByGooglePlaceId(googlePlaceId: string): Promise<MerchantPlaceLink | undefined> {
    const [link] = await db
      .select()
      .from(merchantPlaceLinks)
      .where(and(
        eq(merchantPlaceLinks.googlePlaceId, googlePlaceId),
        eq(merchantPlaceLinks.status, 'approved')
      ));
    return link;
  },

  async createMerchantPlaceLink(link: InsertMerchantPlaceLink): Promise<MerchantPlaceLink> {
    const [created] = await db
      .insert(merchantPlaceLinks)
      .values(link)
      .returning();
    return created;
  },

  async updateMerchantPlaceLink(linkId: number, data: Partial<MerchantPlaceLink>): Promise<MerchantPlaceLink> {
    const [updated] = await db
      .update(merchantPlaceLinks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(merchantPlaceLinks.id, linkId))
      .returning();
    return updated;
  },

  async searchPlacesForClaim(query: string, district?: string, city?: string): Promise<PlaceCache[]> {
    const conditions = [ilike(placeCache.placeName, `%${query}%`)];
    
    if (district) {
      conditions.push(eq(placeCache.district, district));
    }
    if (city) {
      conditions.push(eq(placeCache.city, city));
    }

    return db
      .select()
      .from(placeCache)
      .where(and(...conditions))
      .limit(20);
  },

  // Place Drafts methods
  async createPlaceDraft(draft: InsertPlaceDraft): Promise<PlaceDraft> {
    const [created] = await db.insert(placeDrafts).values(draft).returning();
    return created;
  },

  async getPlaceDraftById(id: number): Promise<PlaceDraft | undefined> {
    const [draft] = await db.select().from(placeDrafts).where(eq(placeDrafts.id, id));
    return draft;
  },

  async getPlaceDraftsByMerchant(merchantId: number): Promise<PlaceDraft[]> {
    return db.select().from(placeDrafts)
      .where(eq(placeDrafts.merchantId, merchantId))
      .orderBy(desc(placeDrafts.createdAt));
  },

  async getAllPlaceDrafts(): Promise<PlaceDraft[]> {
    return db.select().from(placeDrafts)
      .orderBy(desc(placeDrafts.createdAt));
  },

  async getFilteredPlaceDrafts(filters: { minRating?: number; minReviewCount?: number; status?: string }): Promise<PlaceDraft[]> {
    const conditions = [];
    
    if (filters.status) {
      conditions.push(eq(placeDrafts.status, filters.status));
    }
    if (filters.minRating !== undefined) {
      conditions.push(
        and(
          isNotNull(placeDrafts.googleRating),
          gte(placeDrafts.googleRating, filters.minRating)
        )
      );
    }
    if (filters.minReviewCount !== undefined) {
      conditions.push(
        and(
          isNotNull(placeDrafts.googleReviewCount),
          gte(placeDrafts.googleReviewCount, filters.minReviewCount)
        )
      );
    }
    
    if (conditions.length === 0) {
      return db.select().from(placeDrafts).orderBy(desc(placeDrafts.googleRating));
    }
    
    return db.select().from(placeDrafts)
      .where(and(...conditions))
      .orderBy(desc(placeDrafts.googleRating));
  },

  async updatePlaceDraft(id: number, data: Partial<PlaceDraft>): Promise<PlaceDraft> {
    const [updated] = await db.update(placeDrafts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(placeDrafts.id, id))
      .returning();
    return updated;
  },

  async deletePlaceDraft(id: number): Promise<void> {
    await db.delete(placeDrafts).where(eq(placeDrafts.id, id));
  },

  async batchDeletePlaceDrafts(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db.delete(placeDrafts).where(inArray(placeDrafts.id, ids));
    return ids.length;
  },

  // Place Applications methods
  async createPlaceApplication(application: InsertPlaceApplication): Promise<PlaceApplication> {
    const [created] = await db.insert(placeApplications).values(application).returning();
    return created;
  },

  async getPlaceApplicationById(id: number): Promise<PlaceApplication | undefined> {
    const [application] = await db.select().from(placeApplications).where(eq(placeApplications.id, id));
    return application;
  },

  async getPlaceApplicationsByMerchant(merchantId: number): Promise<PlaceApplication[]> {
    return db.select().from(placeApplications)
      .where(eq(placeApplications.merchantId, merchantId))
      .orderBy(desc(placeApplications.createdAt));
  },

  async getPendingApplications(): Promise<PlaceApplication[]> {
    return db.select().from(placeApplications)
      .where(eq(placeApplications.status, 'pending'))
      .orderBy(placeApplications.createdAt);
  },

  async getPendingApplicationsWithDetails(): Promise<Array<PlaceApplication & { placeDraft?: PlaceDraft; merchant?: Merchant }>> {
    const applications = await db.select().from(placeApplications)
      .where(eq(placeApplications.status, 'pending'))
      .orderBy(placeApplications.createdAt);
    
    const results = await Promise.all(applications.map(async (app) => {
      const [draft] = await db.select().from(placeDrafts).where(eq(placeDrafts.id, app.placeDraftId));
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, app.merchantId));
      return { ...app, placeDraft: draft, merchant };
    }));
    
    return results;
  },

  async updatePlaceApplication(id: number, data: Partial<PlaceApplication>): Promise<PlaceApplication> {
    const [updated] = await db.update(placeApplications)
      .set(data)
      .where(eq(placeApplications.id, id))
      .returning();
    return updated;
  },
};

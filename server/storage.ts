import { 
  users, collections, merchants, coupons, placeCache,
  countries, regions, districts, categories, subcategories,
  type User, type UpsertUser,
  type Collection, type InsertCollection,
  type Merchant, type InsertMerchant,
  type Coupon, type InsertCoupon,
  type PlaceCache, type InsertPlaceCache,
  type Country, type Region, type District,
  type Category, type Subcategory
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Users (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Collections
  getUserCollections(userId: string): Promise<Collection[]>;
  addToCollection(collection: InsertCollection): Promise<Collection>;

  // Merchants
  getMerchantByUserId(userId: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  updateMerchantPlan(merchantId: number, plan: string): Promise<Merchant>;

  // Coupons
  getMerchantCoupons(merchantId: number): Promise<Coupon[]>;
  getActiveCoupons(merchantId: number): Promise<Coupon[]>;
  createCoupon(coupon: InsertCoupon): Promise<Coupon>;
  updateCoupon(couponId: number, data: Partial<Coupon>): Promise<Coupon>;

  // Place Cache
  getCachedPlace(subCategory: string, district: string, city: string, country: string): Promise<PlaceCache | undefined>;
  getCachedPlaces(district: string, city: string, country: string): Promise<PlaceCache[]>;
  savePlaceToCache(place: InsertPlaceCache): Promise<PlaceCache>;
  savePlacesToCache(places: InsertPlaceCache[]): Promise<PlaceCache[]>;

  // Location hierarchy
  getCountries(): Promise<Country[]>;
  getRegionsByCountry(countryId: number): Promise<Region[]>;
  getDistrictsByRegion(regionId: number): Promise<District[]>;
  getDistrictsByCountry(countryId: number): Promise<District[]>;
  getRandomDistrictByCountry(countryId: number): Promise<District | undefined>;
  getRandomDistrictByRegion(regionId: number): Promise<District | undefined>;
  getDistrictWithParents(districtId: number): Promise<{ district: District; region: Region; country: Country } | undefined>;

  // Categories
  getCategories(): Promise<Category[]>;
  getSubcategoriesByCategory(categoryId: number): Promise<Subcategory[]>;
  getAllSubcategoriesWithCategory(): Promise<Array<Subcategory & { category: Category }>>;
  getRandomCategory(): Promise<Category | undefined>;
  getRandomSubcategoryByCategory(categoryId: number): Promise<Subcategory | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Collections
  async getUserCollections(userId: string): Promise<Collection[]> {
    return await db
      .select()
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(desc(collections.collectedAt));
  }

  async addToCollection(collection: InsertCollection): Promise<Collection> {
    const [newCollection] = await db
      .insert(collections)
      .values(collection)
      .returning();
    return newCollection;
  }

  // Merchants
  async getMerchantByUserId(userId: string): Promise<Merchant | undefined> {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.userId, userId));
    return merchant || undefined;
  }

  async createMerchant(merchant: InsertMerchant): Promise<Merchant> {
    const [newMerchant] = await db
      .insert(merchants)
      .values(merchant)
      .returning();
    return newMerchant;
  }

  async updateMerchantPlan(merchantId: number, plan: string): Promise<Merchant> {
    const [updated] = await db
      .update(merchants)
      .set({ subscriptionPlan: plan })
      .where(eq(merchants.id, merchantId))
      .returning();
    return updated;
  }

  // Coupons
  async getMerchantCoupons(merchantId: number): Promise<Coupon[]> {
    return await db
      .select()
      .from(coupons)
      .where(eq(coupons.merchantId, merchantId))
      .orderBy(desc(coupons.createdAt));
  }

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
  }

  async createCoupon(coupon: InsertCoupon): Promise<Coupon> {
    const [newCoupon] = await db
      .insert(coupons)
      .values(coupon)
      .returning();
    return newCoupon;
  }

  async updateCoupon(couponId: number, data: Partial<Coupon>): Promise<Coupon> {
    const [updated] = await db
      .update(coupons)
      .set(data)
      .where(eq(coupons.id, couponId))
      .returning();
    return updated;
  }

  // Place Cache
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
  }

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
  }

  async savePlaceToCache(place: InsertPlaceCache): Promise<PlaceCache> {
    const [newPlace] = await db
      .insert(placeCache)
      .values(place)
      .returning();
    return newPlace;
  }

  async savePlacesToCache(places: InsertPlaceCache[]): Promise<PlaceCache[]> {
    if (places.length === 0) return [];
    return await db
      .insert(placeCache)
      .values(places)
      .returning();
  }

  // Location hierarchy
  async getCountries(): Promise<Country[]> {
    return await db
      .select()
      .from(countries)
      .where(eq(countries.isActive, true));
  }

  async getRegionsByCountry(countryId: number): Promise<Region[]> {
    return await db
      .select()
      .from(regions)
      .where(and(eq(regions.countryId, countryId), eq(regions.isActive, true)));
  }

  async getDistrictsByRegion(regionId: number): Promise<District[]> {
    return await db
      .select()
      .from(districts)
      .where(and(eq(districts.regionId, regionId), eq(districts.isActive, true)));
  }

  async getDistrictsByCountry(countryId: number): Promise<District[]> {
    const result = await db
      .select({ district: districts })
      .from(districts)
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .where(and(eq(regions.countryId, countryId), eq(districts.isActive, true)));
    return result.map(r => r.district);
  }

  async getRandomDistrictByCountry(countryId: number): Promise<District | undefined> {
    const result = await db
      .select({ district: districts })
      .from(districts)
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .where(and(eq(regions.countryId, countryId), eq(districts.isActive, true)))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return result[0]?.district;
  }

  async getRandomDistrictByRegion(regionId: number): Promise<District | undefined> {
    const [district] = await db
      .select()
      .from(districts)
      .where(and(eq(districts.regionId, regionId), eq(districts.isActive, true)))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return district;
  }

  async getDistrictWithParents(districtId: number): Promise<{ district: District; region: Region; country: Country } | undefined> {
    const result = await db
      .select({
        district: districts,
        region: regions,
        country: countries
      })
      .from(districts)
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .innerJoin(countries, eq(regions.countryId, countries.id))
      .where(eq(districts.id, districtId))
      .limit(1);
    return result[0];
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    return await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.sortOrder);
  }

  async getSubcategoriesByCategory(categoryId: number): Promise<Subcategory[]> {
    return await db
      .select()
      .from(subcategories)
      .where(and(eq(subcategories.categoryId, categoryId), eq(subcategories.isActive, true)));
  }

  async getRandomCategory(): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return category;
  }

  async getRandomSubcategoryByCategory(categoryId: number): Promise<Subcategory | undefined> {
    const [subcategory] = await db
      .select()
      .from(subcategories)
      .where(and(eq(subcategories.categoryId, categoryId), eq(subcategories.isActive, true)))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return subcategory;
  }

  async getAllSubcategoriesWithCategory(): Promise<Array<Subcategory & { category: Category }>> {
    const results = await db
      .select({
        subcategory: subcategories,
        category: categories
      })
      .from(subcategories)
      .innerJoin(categories, eq(subcategories.categoryId, categories.id))
      .where(and(eq(subcategories.isActive, true), eq(categories.isActive, true)));
    
    return results.map(r => ({
      ...r.subcategory,
      category: r.category
    }));
  }
}

export const storage = new DatabaseStorage();

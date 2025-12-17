import { 
  users, collections, merchants, coupons, placeCache, placeFeedback, merchantPlaceLinks,
  countries, regions, districts, categories, subcategories, chatInvites,
  placeProducts, cartItems, commerceOrders, klookProducts, messageHighlights,
  placeDrafts, placeApplications, userLocations, planners, serviceOrders, places,
  specialists, transactions, serviceRelations, announcements,
  type User, type UpsertUser,
  type Collection, type InsertCollection,
  type Merchant, type InsertMerchant,
  type Coupon, type InsertCoupon,
  type PlaceCache, type InsertPlaceCache,
  type PlaceFeedback, type InsertPlaceFeedback,
  type MerchantPlaceLink, type InsertMerchantPlaceLink,
  type Country, type Region, type District,
  type Category, type Subcategory,
  type ChatInvite,
  type PlaceProduct, type InsertPlaceProduct,
  type CartItem, type InsertCartItem,
  type CommerceOrder, type InsertCommerceOrder,
  type KlookProduct, type InsertKlookProduct,
  type MessageHighlight, type InsertMessageHighlight,
  type PlaceDraft, type InsertPlaceDraft,
  type PlaceApplication, type InsertPlaceApplication,
  type UserLocation, type InsertUserLocation,
  type Place,
  type Specialist, type InsertSpecialist,
  type Transaction, type InsertTransaction,
  type ServiceRelation, type InsertServiceRelation,
  type Announcement, type InsertAnnouncement, type AnnouncementType
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, ilike, or, isNull, lt, gt, gte, lte } from "drizzle-orm";

export interface IStorage {
  // Users (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getPendingApprovalUsers(): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  approveUser(userId: string): Promise<User | undefined>;

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
  getRegionPrizePoolCoupons(regionId: number): Promise<any[]>;

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

  // Place Feedback (exclusion tracking)
  getPlacePenalty(userId: string, placeName: string, district: string, city: string): Promise<number>;
  incrementPlacePenalty(userId: string, placeName: string, district: string, city: string, placeCacheId?: number): Promise<PlaceFeedback>;
  getExcludedPlaceNames(userId: string, district: string, city: string, threshold?: number): Promise<string[]>;
  
  // Global Exclusions (全域排除)
  addGlobalExclusion(data: { placeName: string; district: string; city: string }): Promise<PlaceFeedback>;
  getGlobalExclusions(district?: string, city?: string): Promise<PlaceFeedback[]>;
  removeGlobalExclusion(id: number): Promise<boolean>;

  // Merchant Place Links (ownership/claim)
  getMerchantPlaceLinks(merchantId: number): Promise<MerchantPlaceLink[]>;
  getPlaceLinkByPlace(placeName: string, district: string, city: string): Promise<MerchantPlaceLink | undefined>;
  getPlaceLinkByGooglePlaceId(googlePlaceId: string): Promise<MerchantPlaceLink | undefined>;
  createMerchantPlaceLink(link: InsertMerchantPlaceLink): Promise<MerchantPlaceLink>;
  updateMerchantPlaceLink(linkId: number, data: Partial<MerchantPlaceLink>): Promise<MerchantPlaceLink>;
  searchPlacesForClaim(query: string, district?: string, city?: string): Promise<PlaceCache[]>;

  // Chat Invites
  createChatInvite(invite: { conversationSid: string; inviterUserId: string; status: string; expiresAt: Date }, inviteCode: string): Promise<ChatInvite>;
  getChatInviteByCode(inviteCode: string): Promise<ChatInvite | undefined>;
  updateChatInvite(inviteId: number, data: { status?: string; usedByUserId?: string }): Promise<ChatInvite>;

  // Commerce - Products
  getPlaceNamesWithProducts(): Promise<string[]>;
  getProductsByPlaceId(placeCacheId: number): Promise<PlaceProduct[]>;
  getProductsByPlaceName(placeName: string): Promise<PlaceProduct[]>;
  getProductById(productId: number): Promise<PlaceProduct | undefined>;
  createProduct(product: InsertPlaceProduct): Promise<PlaceProduct>;
  updateProduct(productId: number, data: Partial<PlaceProduct>): Promise<PlaceProduct>;
  deleteProduct(productId: number): Promise<void>;
  searchPlacesByName(query: string): Promise<PlaceCache[]>;
  getMerchantProducts(merchantId: number): Promise<PlaceProduct[]>;

  // Commerce - Cart
  getCartItems(userId: string): Promise<Array<CartItem & { product: PlaceProduct }>>;
  addToCart(item: InsertCartItem): Promise<CartItem>;
  updateCartItemQuantity(cartItemId: number, quantity: number): Promise<CartItem>;
  removeFromCart(cartItemId: number): Promise<void>;
  clearCart(userId: string): Promise<void>;

  // Commerce - Orders
  createOrder(order: InsertCommerceOrder): Promise<CommerceOrder>;
  getOrderById(orderId: number): Promise<CommerceOrder | undefined>;
  getOrderBySessionId(sessionId: string): Promise<CommerceOrder | undefined>;
  updateOrderStatus(orderId: number, status: string, sessionId?: string): Promise<CommerceOrder>;
  getUserOrders(userId: string): Promise<CommerceOrder[]>;

  // Klook Products
  searchKlookProducts(query: string): Promise<KlookProduct[]>;
  getKlookProductByName(normalizedName: string): Promise<KlookProduct | undefined>;
  createKlookProduct(product: InsertKlookProduct): Promise<KlookProduct>;

  // Message Highlights
  getMessageHighlights(conversationSid: string, messageSid: string): Promise<MessageHighlight[]>;
  createMessageHighlight(highlight: InsertMessageHighlight): Promise<MessageHighlight>;
  getConversationHighlights(conversationSid: string): Promise<MessageHighlight[]>;

  // Place Drafts (商家草稿地點)
  createPlaceDraft(draft: InsertPlaceDraft): Promise<PlaceDraft>;
  getPlaceDraftById(id: number): Promise<PlaceDraft | undefined>;
  getPlaceDraftsByMerchant(merchantId: number): Promise<PlaceDraft[]>;
  getAllPlaceDrafts(): Promise<PlaceDraft[]>;
  updatePlaceDraft(id: number, data: Partial<PlaceDraft>): Promise<PlaceDraft>;
  deletePlaceDraft(id: number): Promise<void>;

  // Place Applications (地點申請紀錄)
  createPlaceApplication(application: InsertPlaceApplication): Promise<PlaceApplication>;
  getPlaceApplicationById(id: number): Promise<PlaceApplication | undefined>;
  getPlaceApplicationsByMerchant(merchantId: number): Promise<PlaceApplication[]>;
  getPendingApplications(): Promise<PlaceApplication[]>;
  getPendingApplicationsWithDetails(): Promise<Array<PlaceApplication & { placeDraft?: PlaceDraft; merchant?: Merchant }>>;
  updatePlaceApplication(id: number, data: Partial<PlaceApplication>): Promise<PlaceApplication>;

  // User Locations (位置共享)
  upsertUserLocation(userId: string, lat: number, lon: number, isSharingEnabled: boolean, sosMode?: boolean): Promise<UserLocation>;
  getUserLocation(userId: string): Promise<UserLocation | undefined>;
  getSharedLocationsForPlanner(plannerId: number): Promise<Array<{ userId: string; lat: number; lon: number; updatedAt: Date; firstName: string | null; lastName: string | null; profileImageUrl: string | null; sosMode: boolean }>>;
  
  // SOS 緊急救援
  setSosMode(userId: string, enabled: boolean): Promise<UserLocation | undefined>;
  getUserBySosKey(sosKey: string): Promise<User | undefined>;
  generateSosKey(userId: string): Promise<string>;

  // Places (Gacha Pool)
  getPlacesByDistrict(city: string, district: string): Promise<Place[]>;
  getJackpotPlaces(city: string, district: string): Promise<Place[]>;
  getCouponsByPlaceId(placeId: number): Promise<Coupon[]>;

  // Gacha 2.0 - Official Pool
  getOfficialPlacesByDistrict(city: string, district: string, limit?: number): Promise<Place[]>;
  getClaimByOfficialPlaceId(officialPlaceId: number): Promise<{ claim: MerchantPlaceLink; coupons: Coupon[] } | undefined>;
  saveToCollectionWithCoupon(userId: string, place: Place, wonCoupon?: Coupon): Promise<Collection>;

  // Specialists (旅遊專員)
  getSpecialistByUserId(userId: string): Promise<Specialist | undefined>;
  getSpecialistById(id: number): Promise<Specialist | undefined>;
  createSpecialist(specialist: InsertSpecialist): Promise<Specialist>;
  updateSpecialist(id: number, data: Partial<Specialist>): Promise<Specialist | undefined>;
  getActiveSpecialistsByRegion(regionCode: string): Promise<Specialist[]>;
  findAvailableSpecialist(regionCode: string): Promise<Specialist | undefined>;

  // Transactions (交易紀錄)
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getTransactionById(id: number): Promise<Transaction | undefined>;
  getTransactionsByMerchantId(merchantId: number): Promise<Transaction[]>;
  updateTransactionStatus(id: number, status: string): Promise<Transaction | undefined>;

  // Service Relations (服務關係)
  createServiceRelation(relation: InsertServiceRelation): Promise<ServiceRelation>;
  getServiceRelationById(id: number): Promise<ServiceRelation | undefined>;
  getActiveServiceRelationByTraveler(travelerId: string): Promise<ServiceRelation | undefined>;
  getActiveServiceRelationsBySpecialist(specialistId: number): Promise<ServiceRelation[]>;
  updateServiceRelation(id: number, data: Partial<ServiceRelation>): Promise<ServiceRelation | undefined>;
  endServiceRelation(id: number, rating?: number): Promise<ServiceRelation | undefined>;

  // Merchant Credits (商家點數)
  getMerchantById(id: number): Promise<Merchant | undefined>;
  updateMerchantDailySeedCode(merchantId: number, seedCode: string): Promise<Merchant | undefined>;
  updateMerchantCreditBalance(merchantId: number, amount: number): Promise<Merchant | undefined>;
  getMerchantDailySeedCode(merchantId: number): Promise<{ seedCode: string; updatedAt: Date } | undefined>;

  // Announcements & Events (公告與活動系統)
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  getAnnouncementById(id: number): Promise<Announcement | undefined>;
  getAllAnnouncements(): Promise<Announcement[]>;
  getActiveAnnouncements(type?: AnnouncementType): Promise<Announcement[]>;
  updateAnnouncement(id: number, data: Partial<Announcement>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: number): Promise<void>;
  deleteExpiredEvents(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Users (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
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

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getPendingApprovalUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.isApproved, false));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async approveUser(userId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ isApproved: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
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
    const existing = await db
      .select()
      .from(collections)
      .where(
        and(
          eq(collections.userId, collection.userId),
          eq(collections.placeName, collection.placeName),
          collection.district ? eq(collections.district, collection.district) : sql`TRUE`
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      return existing[0];
    }
    
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

  async getRegionPrizePoolCoupons(regionId: number): Promise<any[]> {
    // Get all districts in this region
    const regionDistricts = await db
      .select()
      .from(districts)
      .where(eq(districts.regionId, regionId));
    
    if (regionDistricts.length === 0) {
      return [];
    }

    // Get region info for city name
    const [region] = await db
      .select()
      .from(regions)
      .where(eq(regions.id, regionId));
    
    if (!region) {
      return [];
    }

    // Get district names in both zh and en for matching
    const districtNames = regionDistricts.flatMap(d => [d.nameZh, d.nameEn].filter(Boolean));
    const cityNames = [region.nameZh, region.nameEn].filter(Boolean);

    // Find coupons with SP or SSR rarity that are active
    // We join with merchantPlaceLinks to get location data for filtering
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

    // Filter by region - match district name or city name
    const filteredCoupons = prizePoolCoupons.filter(coupon => {
      // If coupon has no place link, check if merchant is in this region (include as general prize for now)
      if (!coupon.placeDistrict && !coupon.placeCity) {
        return true; // Include global coupons
      }
      
      // Check if district matches any district in the region
      if (coupon.placeDistrict && districtNames.some(d => 
        d.toLowerCase() === coupon.placeDistrict?.toLowerCase()
      )) {
        return true;
      }
      
      // Check if city matches the region name
      if (coupon.placeCity && cityNames.some(c => 
        c.toLowerCase() === coupon.placeCity?.toLowerCase()
      )) {
        return true;
      }
      
      return false;
    });

    // Remove internal fields before returning
    return filteredCoupons.map(({ placeDistrict, placeCity, ...coupon }) => coupon);
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
  }

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
  }

  async getExcludedPlaceNames(userId: string, district: string, city: string, threshold: number = 3): Promise<string[]> {
    // 查詢個人排除（penaltyScore >= threshold）和全域排除（userId = null）
    const results = await db
      .select({ placeName: placeFeedback.placeName })
      .from(placeFeedback)
      .where(and(
        eq(placeFeedback.district, district),
        eq(placeFeedback.city, city),
        or(
          // 全域排除：userId 為 null 的地點永遠排除
          isNull(placeFeedback.userId),
          // 個人排除：該用戶的 penaltyScore 達到門檻
          and(
            eq(placeFeedback.userId, userId),
            sql`${placeFeedback.penaltyScore} >= ${threshold}`
          )
        )
      ));
    return results.map(r => r.placeName);
  }

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
  }

  // 創建全域排除地點（userId = null，任何使用者都不會抽到）
  async addGlobalExclusion(data: { placeName: string; district: string; city: string }): Promise<PlaceFeedback> {
    // 先檢查是否已存在
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
        penaltyScore: 999, // 高分代表永久排除
        lastInteractedAt: new Date()
      })
      .returning();
    return created;
  }

  // 取得全域排除清單
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
  }

  // 移除全域排除地點
  async removeGlobalExclusion(id: number): Promise<boolean> {
    const result = await db
      .delete(placeFeedback)
      .where(and(
        eq(placeFeedback.id, id),
        isNull(placeFeedback.userId)
      ))
      .returning();
    return result.length > 0;
  }

  // Merchant Place Links methods
  async getMerchantPlaceLinks(merchantId: number): Promise<MerchantPlaceLink[]> {
    return db
      .select()
      .from(merchantPlaceLinks)
      .where(eq(merchantPlaceLinks.merchantId, merchantId))
      .orderBy(desc(merchantPlaceLinks.createdAt));
  }

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
  }

  async getPlaceLinkByGooglePlaceId(googlePlaceId: string): Promise<MerchantPlaceLink | undefined> {
    const [link] = await db
      .select()
      .from(merchantPlaceLinks)
      .where(and(
        eq(merchantPlaceLinks.googlePlaceId, googlePlaceId),
        eq(merchantPlaceLinks.status, 'approved')
      ));
    return link;
  }

  async createMerchantPlaceLink(link: InsertMerchantPlaceLink): Promise<MerchantPlaceLink> {
    const [created] = await db
      .insert(merchantPlaceLinks)
      .values(link)
      .returning();
    return created;
  }

  async updateMerchantPlaceLink(linkId: number, data: Partial<MerchantPlaceLink>): Promise<MerchantPlaceLink> {
    const [updated] = await db
      .update(merchantPlaceLinks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(merchantPlaceLinks.id, linkId))
      .returning();
    return updated;
  }

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
  }

  // Chat Invites
  async createChatInvite(invite: { conversationSid: string; inviterUserId: string; status: string; expiresAt: Date }, inviteCode: string): Promise<ChatInvite> {
    const [created] = await db
      .insert(chatInvites)
      .values({
        ...invite,
        inviteCode,
      })
      .returning();
    return created;
  }

  async getChatInviteByCode(inviteCode: string): Promise<ChatInvite | undefined> {
    const [invite] = await db
      .select()
      .from(chatInvites)
      .where(eq(chatInvites.inviteCode, inviteCode));
    return invite;
  }

  async updateChatInvite(inviteId: number, data: { status?: string; usedByUserId?: string }): Promise<ChatInvite> {
    const [updated] = await db
      .update(chatInvites)
      .set(data)
      .where(eq(chatInvites.id, inviteId))
      .returning();
    return updated;
  }

  // Commerce - Products
  async getPlaceNamesWithProducts(): Promise<string[]> {
    const products = await db.select({ placeCacheId: placeProducts.placeCacheId })
      .from(placeProducts)
      .where(eq(placeProducts.isActive, true))
      .groupBy(placeProducts.placeCacheId);
    
    if (products.length === 0) return [];
    
    const placeIds = products.map(p => p.placeCacheId).filter((id): id is number => id !== null);
    if (placeIds.length === 0) return [];
    
    const places = await db.select({ placeName: placeCache.placeName })
      .from(placeCache)
      .where(sql`${placeCache.id} = ANY(${placeIds})`);
    
    return places.map(p => p.placeName);
  }

  async getProductsByPlaceId(placeCacheId: number): Promise<PlaceProduct[]> {
    return db.select().from(placeProducts).where(
      and(eq(placeProducts.placeCacheId, placeCacheId), eq(placeProducts.isActive, true))
    );
  }

  async getProductsByPlaceName(placeName: string): Promise<PlaceProduct[]> {
    const places = await db.select().from(placeCache).where(ilike(placeCache.placeName, `%${placeName}%`)).limit(5);
    if (places.length === 0) return [];
    const placeIds = places.map(p => p.id);
    return db.select().from(placeProducts).where(
      and(sql`${placeProducts.placeCacheId} = ANY(${placeIds})`, eq(placeProducts.isActive, true))
    );
  }

  async getProductById(productId: number): Promise<PlaceProduct | undefined> {
    const [product] = await db.select().from(placeProducts).where(eq(placeProducts.id, productId));
    return product;
  }

  async createProduct(product: InsertPlaceProduct): Promise<PlaceProduct> {
    const [created] = await db.insert(placeProducts).values(product).returning();
    return created;
  }

  async updateProduct(productId: number, data: Partial<PlaceProduct>): Promise<PlaceProduct> {
    const [updated] = await db.update(placeProducts).set({ ...data, updatedAt: new Date() }).where(eq(placeProducts.id, productId)).returning();
    return updated;
  }

  async deleteProduct(productId: number): Promise<void> {
    await db.delete(placeProducts).where(eq(placeProducts.id, productId));
  }

  async searchPlacesByName(query: string): Promise<PlaceCache[]> {
    return db.select().from(placeCache).where(ilike(placeCache.placeName, `%${query}%`)).limit(10);
  }

  async getMerchantProducts(merchantId: number): Promise<PlaceProduct[]> {
    return db.select().from(placeProducts).where(eq(placeProducts.merchantId, merchantId)).orderBy(desc(placeProducts.createdAt));
  }

  // Commerce - Cart
  async getCartItems(userId: string): Promise<Array<CartItem & { product: PlaceProduct }>> {
    const items = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
    const result: Array<CartItem & { product: PlaceProduct }> = [];
    for (const item of items) {
      const [product] = await db.select().from(placeProducts).where(eq(placeProducts.id, item.productId));
      if (product) {
        result.push({ ...item, product });
      }
    }
    return result;
  }

  async addToCart(item: InsertCartItem): Promise<CartItem> {
    const existing = await db.select().from(cartItems).where(
      and(eq(cartItems.userId, item.userId), eq(cartItems.productId, item.productId))
    );
    if (existing.length > 0) {
      const [updated] = await db.update(cartItems)
        .set({ quantity: existing[0].quantity + (item.quantity || 1) })
        .where(eq(cartItems.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(cartItems).values(item).returning();
    return created;
  }

  async updateCartItemQuantity(cartItemId: number, quantity: number): Promise<CartItem> {
    const [updated] = await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, cartItemId)).returning();
    return updated;
  }

  async removeFromCart(cartItemId: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, cartItemId));
  }

  async clearCart(userId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

  // Commerce - Orders
  async createOrder(order: InsertCommerceOrder): Promise<CommerceOrder> {
    const [created] = await db.insert(commerceOrders).values(order).returning();
    return created;
  }

  async getOrderById(orderId: number): Promise<CommerceOrder | undefined> {
    const [order] = await db.select().from(commerceOrders).where(eq(commerceOrders.id, orderId));
    return order;
  }

  async getOrderBySessionId(sessionId: string): Promise<CommerceOrder | undefined> {
    const [order] = await db.select().from(commerceOrders).where(eq(commerceOrders.stripeSessionId, sessionId));
    return order;
  }

  async updateOrderStatus(orderId: number, status: string, sessionId?: string): Promise<CommerceOrder> {
    const updateData: Partial<CommerceOrder> = { status, updatedAt: new Date() };
    if (sessionId) updateData.stripeSessionId = sessionId;
    const [updated] = await db.update(commerceOrders).set(updateData).where(eq(commerceOrders.id, orderId)).returning();
    return updated;
  }

  async getUserOrders(userId: string): Promise<CommerceOrder[]> {
    return db.select().from(commerceOrders).where(eq(commerceOrders.userId, userId)).orderBy(desc(commerceOrders.createdAt));
  }

  // Klook Products
  async searchKlookProducts(query: string): Promise<KlookProduct[]> {
    const normalized = query.toLowerCase().replace(/\s+/g, '');
    return db.select().from(klookProducts)
      .where(and(
        ilike(klookProducts.nameNormalized, `%${normalized}%`),
        eq(klookProducts.isActive, true)
      ))
      .limit(10);
  }

  async getKlookProductByName(normalizedName: string): Promise<KlookProduct | undefined> {
    const [product] = await db.select().from(klookProducts)
      .where(eq(klookProducts.nameNormalized, normalizedName));
    return product;
  }

  async createKlookProduct(product: InsertKlookProduct): Promise<KlookProduct> {
    const [created] = await db.insert(klookProducts).values(product).returning();
    return created;
  }

  // Message Highlights
  async getMessageHighlights(conversationSid: string, messageSid: string): Promise<MessageHighlight[]> {
    return db.select().from(messageHighlights)
      .where(and(
        eq(messageHighlights.conversationSid, conversationSid),
        eq(messageHighlights.messageSid, messageSid)
      ));
  }

  async createMessageHighlight(highlight: InsertMessageHighlight): Promise<MessageHighlight> {
    const [created] = await db.insert(messageHighlights).values(highlight).returning();
    return created;
  }

  async getConversationHighlights(conversationSid: string): Promise<MessageHighlight[]> {
    return db.select().from(messageHighlights)
      .where(eq(messageHighlights.conversationSid, conversationSid));
  }

  // Place Drafts (商家草稿地點)
  async createPlaceDraft(draft: InsertPlaceDraft): Promise<PlaceDraft> {
    const [created] = await db.insert(placeDrafts).values(draft).returning();
    return created;
  }

  async getPlaceDraftById(id: number): Promise<PlaceDraft | undefined> {
    const [draft] = await db.select().from(placeDrafts).where(eq(placeDrafts.id, id));
    return draft;
  }

  async getPlaceDraftsByMerchant(merchantId: number): Promise<PlaceDraft[]> {
    return db.select().from(placeDrafts)
      .where(eq(placeDrafts.merchantId, merchantId))
      .orderBy(desc(placeDrafts.createdAt));
  }

  async getAllPlaceDrafts(): Promise<PlaceDraft[]> {
    return db.select().from(placeDrafts)
      .orderBy(desc(placeDrafts.createdAt));
  }

  async updatePlaceDraft(id: number, data: Partial<PlaceDraft>): Promise<PlaceDraft> {
    const [updated] = await db.update(placeDrafts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(placeDrafts.id, id))
      .returning();
    return updated;
  }

  async deletePlaceDraft(id: number): Promise<void> {
    await db.delete(placeDrafts).where(eq(placeDrafts.id, id));
  }

  // Place Applications (地點申請紀錄)
  async createPlaceApplication(application: InsertPlaceApplication): Promise<PlaceApplication> {
    const [created] = await db.insert(placeApplications).values(application).returning();
    return created;
  }

  async getPlaceApplicationById(id: number): Promise<PlaceApplication | undefined> {
    const [application] = await db.select().from(placeApplications).where(eq(placeApplications.id, id));
    return application;
  }

  async getPlaceApplicationsByMerchant(merchantId: number): Promise<PlaceApplication[]> {
    return db.select().from(placeApplications)
      .where(eq(placeApplications.merchantId, merchantId))
      .orderBy(desc(placeApplications.createdAt));
  }

  async getPendingApplications(): Promise<PlaceApplication[]> {
    return db.select().from(placeApplications)
      .where(eq(placeApplications.status, 'pending'))
      .orderBy(placeApplications.createdAt);
  }

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
  }

  async updatePlaceApplication(id: number, data: Partial<PlaceApplication>): Promise<PlaceApplication> {
    const [updated] = await db.update(placeApplications)
      .set(data)
      .where(eq(placeApplications.id, id))
      .returning();
    return updated;
  }

  // User Locations (位置共享)
  async upsertUserLocation(userId: string, lat: number, lon: number, isSharingEnabled: boolean, sosMode?: boolean): Promise<UserLocation> {
    const setData: Record<string, any> = { 
      lat, 
      lon, 
      isSharingEnabled, 
      updatedAt: new Date() 
    };
    
    if (sosMode !== undefined) {
      setData.sosMode = sosMode;
    }
    
    const [location] = await db
      .insert(userLocations)
      .values({ userId, lat, lon, isSharingEnabled, sosMode: sosMode ?? false })
      .onConflictDoUpdate({
        target: userLocations.userId,
        set: setData,
      })
      .returning();
    return location;
  }

  async getUserLocation(userId: string): Promise<UserLocation | undefined> {
    const [location] = await db.select().from(userLocations).where(eq(userLocations.userId, userId));
    return location;
  }

  async getSharedLocationsForPlanner(plannerId: number): Promise<Array<{ userId: string; lat: number; lon: number; updatedAt: Date; firstName: string | null; lastName: string | null; profileImageUrl: string | null; sosMode: boolean }>> {
    const results = await db
      .select({
        userId: userLocations.userId,
        lat: userLocations.lat,
        lon: userLocations.lon,
        updatedAt: userLocations.updatedAt,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        sosMode: userLocations.sosMode,
      })
      .from(userLocations)
      .innerJoin(users, eq(userLocations.userId, users.id))
      .innerJoin(serviceOrders, eq(serviceOrders.userId, userLocations.userId))
      .where(
        and(
          eq(serviceOrders.plannerId, plannerId),
          sql`(${userLocations.isSharingEnabled} = true OR ${userLocations.sosMode} = true)`
        )
      );
    return results;
  }

  // SOS 緊急救援
  async setSosMode(userId: string, enabled: boolean): Promise<UserLocation | undefined> {
    const [location] = await db
      .update(userLocations)
      .set({ sosMode: enabled, updatedAt: new Date() })
      .where(eq(userLocations.userId, userId))
      .returning();
    return location;
  }

  async getUserBySosKey(sosKey: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.sosSecretKey, sosKey));
    return user;
  }

  async generateSosKey(userId: string): Promise<string> {
    const key = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    await db
      .update(users)
      .set({ sosSecretKey: key, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return key;
  }

  // Places (Gacha Pool)
  async getPlacesByDistrict(city: string, district: string): Promise<Place[]> {
    return await db
      .select()
      .from(places)
      .where(and(eq(places.city, city), eq(places.district, district)));
  }

  async getJackpotPlaces(city: string, district: string): Promise<Place[]> {
    return await db
      .select()
      .from(places)
      .where(
        sql`${places.city} = ${city} AND ${places.district} = ${district} AND (${places.rating} >= 4.5 OR ${places.merchantId} IS NOT NULL)`
      );
  }

  async getCouponsByPlaceId(placeId: number): Promise<Coupon[]> {
    return await db
      .select()
      .from(coupons)
      .where(eq(coupons.placeId, placeId));
  }

  // Gacha 2.0 - Official Pool
  async getOfficialPlacesByDistrict(city: string, district: string, limit?: number): Promise<Place[]> {
    const query = db
      .select()
      .from(places)
      .where(and(eq(places.city, city), eq(places.district, district)))
      .orderBy(sql`RANDOM()`);
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

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
  }

  async saveToCollectionWithCoupon(userId: string, place: Place, wonCoupon?: Coupon): Promise<Collection> {
    const collectionData: InsertCollection = {
      userId,
      officialPlaceId: place.id,
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
  }

  // AI 生成地點存入草稿（根據文字名稱查詢 ID）
  async saveAIPlacesToDrafts(places: Array<{
    placeName: string;
    description: string;
    category: string;
    subCategory: string;
    district: string;
    city: string;
    country: string;
    googlePlaceId?: string | null;
    googleRating?: number | null;
    locationLat?: string | null;
    locationLng?: string | null;
    address?: string | null;
  }>): Promise<PlaceDraft[]> {
    if (places.length === 0) return [];

    const results: PlaceDraft[] = [];

    for (const place of places) {
      try {
        // 1. 查詢 country ID（用 nameZh 或 nameEn）
        const [countryRow] = await db
          .select()
          .from(countries)
          .where(
            sql`${countries.nameZh} = ${place.country} OR ${countries.nameEn} = ${place.country}`
          )
          .limit(1);
        if (!countryRow) {
          console.log(`[AI Draft] Country not found: ${place.country}`);
          continue;
        }

        // 2. 查詢 region ID（用 nameZh 或 nameEn，city 對應 region）
        const [regionRow] = await db
          .select()
          .from(regions)
          .where(
            and(
              eq(regions.countryId, countryRow.id),
              sql`${regions.nameZh} = ${place.city} OR ${regions.nameEn} = ${place.city}`
            )
          )
          .limit(1);
        if (!regionRow) {
          console.log(`[AI Draft] Region/City not found: ${place.city}`);
          continue;
        }

        // 3. 查詢 district ID
        const [districtRow] = await db
          .select()
          .from(districts)
          .where(
            and(
              eq(districts.regionId, regionRow.id),
              sql`${districts.nameZh} = ${place.district} OR ${districts.nameEn} = ${place.district}`
            )
          )
          .limit(1);
        if (!districtRow) {
          console.log(`[AI Draft] District not found: ${place.district}`);
          continue;
        }

        // 4. 查詢 category ID（用 nameZh 或 nameEn）
        const [categoryRow] = await db
          .select()
          .from(categories)
          .where(
            sql`${categories.nameZh} = ${place.category} OR ${categories.nameEn} = ${place.category}`
          )
          .limit(1);
        if (!categoryRow) {
          console.log(`[AI Draft] Category not found: ${place.category}`);
          continue;
        }

        // 5. 查詢 subcategory ID
        const [subcategoryRow] = await db
          .select()
          .from(subcategories)
          .where(
            and(
              eq(subcategories.categoryId, categoryRow.id),
              sql`${subcategories.nameZh} = ${place.subCategory} OR ${subcategories.nameEn} = ${place.subCategory}`
            )
          )
          .limit(1);
        if (!subcategoryRow) {
          console.log(`[AI Draft] Subcategory not found: ${place.subCategory}`);
          continue;
        }

        // 6. 檢查是否已存在相同的草稿（避免重複）
        const [existingDraft] = await db
          .select()
          .from(placeDrafts)
          .where(
            and(
              eq(placeDrafts.placeName, place.placeName),
              eq(placeDrafts.districtId, districtRow.id)
            )
          )
          .limit(1);
        
        if (existingDraft) {
          console.log(`[AI Draft] Already exists: ${place.placeName}`);
          continue;
        }

        // 7. 存入 place_drafts
        const [draft] = await db
          .insert(placeDrafts)
          .values({
            merchantId: null, // AI 生成的沒有商家
            source: 'ai',
            placeName: place.placeName,
            categoryId: categoryRow.id,
            subcategoryId: subcategoryRow.id,
            description: place.description,
            districtId: districtRow.id,
            regionId: regionRow.id,
            countryId: countryRow.id,
            address: place.address || null,
            googlePlaceId: place.googlePlaceId || null,
            googleRating: place.googleRating || null,
            locationLat: place.locationLat || null,
            locationLng: place.locationLng || null,
          })
          .returning();

        results.push(draft);
        console.log(`[AI Draft] Saved: ${place.placeName}`);
      } catch (error) {
        console.error(`[AI Draft] Error saving ${place.placeName}:`, error);
      }
    }

    return results;
  }

  // Specialists (旅遊專員)
  async getSpecialistByUserId(userId: string): Promise<Specialist | undefined> {
    const [specialist] = await db.select().from(specialists).where(eq(specialists.userId, userId));
    return specialist || undefined;
  }

  async getSpecialistById(id: number): Promise<Specialist | undefined> {
    const [specialist] = await db.select().from(specialists).where(eq(specialists.id, id));
    return specialist || undefined;
  }

  async createSpecialist(specialist: InsertSpecialist): Promise<Specialist> {
    const [created] = await db.insert(specialists).values(specialist).returning();
    return created;
  }

  async updateSpecialist(id: number, data: Partial<Specialist>): Promise<Specialist | undefined> {
    const [updated] = await db.update(specialists).set(data).where(eq(specialists.id, id)).returning();
    return updated || undefined;
  }

  async getActiveSpecialistsByRegion(serviceRegion: string): Promise<Specialist[]> {
    return await db.select().from(specialists).where(
      and(
        eq(specialists.isAvailable, true),
        eq(specialists.serviceRegion, serviceRegion)
      )
    );
  }

  async findAvailableSpecialist(serviceRegion: string): Promise<Specialist | undefined> {
    const [specialist] = await db
      .select()
      .from(specialists)
      .where(
        and(
          eq(specialists.isAvailable, true),
          eq(specialists.serviceRegion, serviceRegion),
          sql`${specialists.currentTravelers} < ${specialists.maxTravelers}`
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return specialist || undefined;
  }

  // Transactions (交易紀錄)
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [created] = await db.insert(transactions).values(transaction).returning();
    return created;
  }

  async getTransactionById(id: number): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || undefined;
  }

  async getTransactionsByMerchantId(merchantId: number): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.merchantId, merchantId)).orderBy(desc(transactions.createdAt));
  }

  async updateTransactionStatus(id: number, status: string): Promise<Transaction | undefined> {
    const [updated] = await db.update(transactions).set({ paymentStatus: status, paidAt: status === 'paid' ? new Date() : undefined }).where(eq(transactions.id, id)).returning();
    return updated || undefined;
  }

  // Service Relations (服務關係)
  async createServiceRelation(relation: InsertServiceRelation): Promise<ServiceRelation> {
    const [created] = await db.insert(serviceRelations).values(relation).returning();
    return created;
  }

  async getServiceRelationById(id: number): Promise<ServiceRelation | undefined> {
    const [relation] = await db.select().from(serviceRelations).where(eq(serviceRelations.id, id));
    return relation || undefined;
  }

  async getActiveServiceRelationByTraveler(travelerId: string): Promise<ServiceRelation | undefined> {
    const [relation] = await db
      .select()
      .from(serviceRelations)
      .where(
        and(
          eq(serviceRelations.travelerId, travelerId),
          eq(serviceRelations.status, 'active')
        )
      );
    return relation || undefined;
  }

  async getActiveServiceRelationsBySpecialist(specialistId: number): Promise<ServiceRelation[]> {
    return await db
      .select()
      .from(serviceRelations)
      .where(
        and(
          eq(serviceRelations.specialistId, specialistId),
          eq(serviceRelations.status, 'active')
        )
      );
  }

  async updateServiceRelation(id: number, data: Partial<ServiceRelation>): Promise<ServiceRelation | undefined> {
    const [updated] = await db.update(serviceRelations).set(data).where(eq(serviceRelations.id, id)).returning();
    return updated || undefined;
  }

  async endServiceRelation(id: number, rating?: number): Promise<ServiceRelation | undefined> {
    const updateData: Partial<ServiceRelation> = {
      status: 'completed',
      endedAt: new Date(),
    };
    // Note: rating is stored but not used since schema doesn't have rating field
    const [updated] = await db.update(serviceRelations).set(updateData).where(eq(serviceRelations.id, id)).returning();
    return updated || undefined;
  }

  // Merchant Credits (商家點數)
  async getMerchantById(id: number): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
    return merchant || undefined;
  }

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
  }

  async updateMerchantCreditBalance(merchantId: number, amount: number): Promise<Merchant | undefined> {
    const [updated] = await db
      .update(merchants)
      .set({ 
        creditBalance: sql`${merchants.creditBalance} + ${amount}` 
      })
      .where(eq(merchants.id, merchantId))
      .returning();
    return updated || undefined;
  }

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
  }

  // Announcements & Events (公告與活動系統)
  async createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement> {
    const [created] = await db.insert(announcements).values(announcement).returning();
    return created;
  }

  async getAnnouncementById(id: number): Promise<Announcement | undefined> {
    const [announcement] = await db.select().from(announcements).where(eq(announcements.id, id));
    return announcement || undefined;
  }

  async getAllAnnouncements(): Promise<Announcement[]> {
    return db.select().from(announcements).orderBy(desc(announcements.priority), desc(announcements.createdAt));
  }

  async getActiveAnnouncements(type?: AnnouncementType): Promise<Announcement[]> {
    const now = new Date();
    const conditions = [
      eq(announcements.isActive, true),
      lte(announcements.startDate, now),
      or(
        isNull(announcements.endDate),
        gte(announcements.endDate, now)
      )
    ];
    
    if (type) {
      conditions.push(eq(announcements.type, type));
    }
    
    return db.select()
      .from(announcements)
      .where(and(...conditions))
      .orderBy(desc(announcements.priority), desc(announcements.createdAt));
  }

  async updateAnnouncement(id: number, data: Partial<Announcement>): Promise<Announcement | undefined> {
    const [updated] = await db
      .update(announcements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteAnnouncement(id: number): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  async deleteExpiredEvents(): Promise<number> {
    const now = new Date();
    const result = await db
      .delete(announcements)
      .where(
        and(
          or(
            eq(announcements.type, 'flash_event'),
            eq(announcements.type, 'holiday_event')
          ),
          lt(announcements.endDate, now)
        )
      )
      .returning();
    return result.length;
  }
}

export const storage = new DatabaseStorage();

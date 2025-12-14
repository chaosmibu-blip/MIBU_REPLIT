import { 
  users, collections, merchants, coupons, placeCache, placeFeedback, merchantPlaceLinks,
  countries, regions, districts, categories, subcategories, chatInvites,
  placeProducts, cartItems, commerceOrders, klookProducts, messageHighlights,
  placeDrafts, placeApplications, userLocations, planners, serviceOrders,
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
  type UserLocation, type InsertUserLocation
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, ilike } from "drizzle-orm";

export interface IStorage {
  // Users (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

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

  // Place Feedback (exclusion tracking)
  getPlacePenalty(userId: string, placeName: string, district: string, city: string): Promise<number>;
  incrementPlacePenalty(userId: string, placeName: string, district: string, city: string, placeCacheId?: number): Promise<PlaceFeedback>;
  getExcludedPlaceNames(userId: string, district: string, city: string, threshold?: number): Promise<string[]>;

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
  updateOrderStatus(orderId: number, status: string, paymentIntentId?: string): Promise<CommerceOrder>;
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
  updatePlaceDraft(id: number, data: Partial<PlaceDraft>): Promise<PlaceDraft>;
  deletePlaceDraft(id: number): Promise<void>;

  // Place Applications (地點申請紀錄)
  createPlaceApplication(application: InsertPlaceApplication): Promise<PlaceApplication>;
  getPlaceApplicationById(id: number): Promise<PlaceApplication | undefined>;
  getPlaceApplicationsByMerchant(merchantId: number): Promise<PlaceApplication[]>;
  getPendingApplications(): Promise<PlaceApplication[]>;
  updatePlaceApplication(id: number, data: Partial<PlaceApplication>): Promise<PlaceApplication>;

  // User Locations (位置共享)
  upsertUserLocation(userId: string, lat: number, lon: number, isSharingEnabled: boolean): Promise<UserLocation>;
  getUserLocation(userId: string): Promise<UserLocation | undefined>;
  getSharedLocationsForPlanner(plannerId: number): Promise<Array<{ userId: string; lat: number; lon: number; updatedAt: Date; firstName: string | null; lastName: string | null; profileImageUrl: string | null }>>;
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

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
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
    const results = await db
      .select({ placeName: placeFeedback.placeName })
      .from(placeFeedback)
      .where(and(
        eq(placeFeedback.userId, userId),
        eq(placeFeedback.district, district),
        eq(placeFeedback.city, city),
        sql`${placeFeedback.penaltyScore} >= ${threshold}`
      ));
    return results.map(r => r.placeName);
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

  async updateOrderStatus(orderId: number, status: string, paymentIntentId?: string): Promise<CommerceOrder> {
    const updateData: Partial<CommerceOrder> = { status, updatedAt: new Date() };
    if (paymentIntentId) updateData.stripePaymentIntentId = paymentIntentId;
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

  async updatePlaceApplication(id: number, data: Partial<PlaceApplication>): Promise<PlaceApplication> {
    const [updated] = await db.update(placeApplications)
      .set(data)
      .where(eq(placeApplications.id, id))
      .returning();
    return updated;
  }

  // User Locations (位置共享)
  async upsertUserLocation(userId: string, lat: number, lon: number, isSharingEnabled: boolean): Promise<UserLocation> {
    const [location] = await db
      .insert(userLocations)
      .values({ userId, lat, lon, isSharingEnabled })
      .onConflictDoUpdate({
        target: userLocations.userId,
        set: { lat, lon, isSharingEnabled, updatedAt: new Date() },
      })
      .returning();
    return location;
  }

  async getUserLocation(userId: string): Promise<UserLocation | undefined> {
    const [location] = await db.select().from(userLocations).where(eq(userLocations.userId, userId));
    return location;
  }

  async getSharedLocationsForPlanner(plannerId: number): Promise<Array<{ userId: string; lat: number; lon: number; updatedAt: Date; firstName: string | null; lastName: string | null; profileImageUrl: string | null }>> {
    const results = await db
      .select({
        userId: userLocations.userId,
        lat: userLocations.lat,
        lon: userLocations.lon,
        updatedAt: userLocations.updatedAt,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(userLocations)
      .innerJoin(users, eq(userLocations.userId, users.id))
      .innerJoin(serviceOrders, eq(serviceOrders.userId, userLocations.userId))
      .where(
        and(
          eq(serviceOrders.plannerId, plannerId),
          eq(userLocations.isSharingEnabled, true)
        )
      );
    return results;
  }
}

export const storage = new DatabaseStorage();

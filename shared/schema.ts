import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer, boolean, jsonb, index, doublePrecision, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============ Enums ============

export const eventTypeEnum = pgEnum('event_type', ['flash', 'holiday']);
export const userCouponStatusEnum = pgEnum('user_coupon_status', ['active', 'used', 'expired']);

// ============ Location Hierarchy Tables ============

// Countries table
export const countries = pgTable("countries", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  nameJa: text("name_ja"),
  nameKo: text("name_ko"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Regions table (e.g., 北部, 中部, 南部, 東部 for Taiwan)
export const regions = pgTable("regions", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").references(() => countries.id).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  nameJa: text("name_ja"),
  nameKo: text("name_ko"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_regions_country").on(table.countryId),
]);

// Districts table (行政區 e.g., 信義區, 大安區)
export const districts = pgTable("districts", {
  id: serial("id").primaryKey(),
  regionId: integer("region_id").references(() => regions.id).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  nameJa: text("name_ja"),
  nameKo: text("name_ko"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_districts_region").on(table.regionId),
]);

// ============ Category Hierarchy Tables ============

// Main categories (食, 宿, 生態文化教育, 遊程體驗, 娛樂設施, 活動, 景點, 購物)
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  nameJa: text("name_ja"),
  nameKo: text("name_ko"),
  colorHex: varchar("color_hex", { length: 7 }).default('#6366f1'),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Subcategories (e.g., 火鍋, 鐵板燒, 排餐 under 食)
// preferredTimeSlot: morning, lunch, afternoon, dinner, evening, anytime
export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => categories.id).notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  nameJa: text("name_ja"),
  nameKo: text("name_ko"),
  searchKeywords: text("search_keywords"),
  preferredTimeSlot: varchar("preferred_time_slot", { length: 20 }).default('anytime'),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_subcategories_category").on(table.categoryId),
]);

// ============ Session Storage ============

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User roles: traveler (default), merchant, specialist, admin
export type UserRole = 'traveler' | 'merchant' | 'specialist' | 'admin';

// Users table - supports Replit Auth, guest login, and email/password auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email"),
  password: text("password"), // Hashed password for email auth (null for OAuth users)
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).default('traveler').notNull(),
  provider: varchar("provider", { length: 20 }), // 'replit' | 'guest' | 'email'
  isApproved: boolean("is_approved").default(false).notNull(), // Requires admin approval for certain roles
  stripeCustomerId: varchar("stripe_customer_id"),
  sosSecretKey: varchar("sos_secret_key", { length: 64 }), // Long-lived SOS webhook key
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Personal profile fields
  gender: varchar("gender", { length: 50 }),
  dateOfBirth: timestamp("date_of_birth"),
  phone: varchar("phone", { length: 50 }),
  dietaryRestrictions: jsonb("dietary_restrictions").default([]),
  medicalHistory: jsonb("medical_history").default([]),
  emergencyContact: jsonb("emergency_contact"),
});

// Merchants
export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subscriptionPlan: text("subscription_plan").default('free').notNull(),
  dailySeedCode: text("daily_seed_code"), // 每日核銷碼
  codeUpdatedAt: timestamp("code_updated_at"), // 核銷碼更新時間
  creditBalance: integer("credit_balance").default(0).notNull(), // 平台點數餘額
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Specialists (專員)
export const specialists = pgTable("specialists", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  serviceRegion: text("service_region").notNull(), // 服務地區 (e.g., "taipei", "taichung")
  isAvailable: boolean("is_available").default(true).notNull(), // 是否可接案
  maxTravelers: integer("max_travelers").default(5).notNull(), // 最大同時服務人數
  currentTravelers: integer("current_travelers").default(0).notNull(), // 目前服務人數
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_specialists_region").on(table.serviceRegion),
]);

// Transactions (交易記錄)
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type PaymentProvider = 'stripe' | 'recur';

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  amount: integer("amount").notNull(), // 金額（點數）
  price: integer("price"), // 實際支付金額（TWD）
  provider: varchar("provider", { length: 20 }), // 金流提供者: 'stripe' | 'recur'
  paymentStatus: varchar("payment_status", { length: 20 }).default('pending').notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }), // 付款方式
  externalOrderId: text("external_order_id"), // 外部金流訂單編號
  createdAt: timestamp("created_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"), // 付款完成時間
}, (table) => [
  index("IDX_transactions_merchant").on(table.merchantId),
]);

// Service Relations (專員-旅客服務關係)
export const serviceRelations = pgTable("service_relations", {
  id: serial("id").primaryKey(),
  specialistId: integer("specialist_id").references(() => specialists.id).notNull(),
  travelerId: varchar("traveler_id").references(() => users.id).notNull(),
  twilioChannelSid: text("twilio_channel_sid"), // Twilio 聊天室 SID
  region: text("region").notNull(), // 服務地區
  status: varchar("status", { length: 20 }).default('active').notNull(), // active, completed, cancelled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
}, (table) => [
  index("IDX_service_relations_specialist").on(table.specialistId),
  index("IDX_service_relations_traveler").on(table.travelerId),
]);

// Place cache for AI-generated content
export const placeCache = pgTable("place_cache", {
  id: serial("id").primaryKey(),
  subCategory: text("sub_category").notNull(),
  district: text("district").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  placeName: text("place_name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  suggestedTime: text("suggested_time"),
  duration: text("duration"),
  searchQuery: text("search_query"),
  rarity: text("rarity"),
  colorHex: text("color_hex"),
  placeId: text("place_id"),
  verifiedName: text("verified_name"),
  verifiedAddress: text("verified_address"),
  googleRating: text("google_rating"),
  googleTypes: text("google_types"),
  primaryType: text("primary_type"),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  isLocationVerified: boolean("is_location_verified").default(false),
  businessStatus: varchar("business_status", { length: 50 }),
  lastVerifiedAt: timestamp("last_verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_place_cache_lookup").on(table.subCategory, table.district, table.city, table.country),
]);

// Place feedback for exclusion tracking (per-user)
export const placeFeedback = pgTable("place_feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).references(() => users.id),
  placeCacheId: integer("place_cache_id").references(() => placeCache.id),
  placeName: text("place_name").notNull(),
  district: text("district").notNull(),
  city: text("city").notNull(),
  penaltyScore: integer("penalty_score").default(1).notNull(),
  lastInteractedAt: timestamp("last_interacted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_place_feedback_lookup").on(table.userId, table.placeName, table.district, table.city),
]);

// Gacha Rarity Types
export type GachaRarity = 'SP' | 'SSR' | 'SR' | 'S' | 'R';

// Places - 正式行程卡池 (Google 驗證過的地點)
export const places = pgTable("places", {
  id: serial("id").primaryKey(),
  placeName: text("place_name").notNull(),
  country: text("country").notNull(),
  city: text("city").notNull(),
  district: text("district").notNull(),
  address: text("address"),
  locationLat: doublePrecision("location_lat"),
  locationLng: doublePrecision("location_lng"),
  googlePlaceId: text("google_place_id").unique(),
  rating: doublePrecision("rating"),
  photoReference: text("photo_reference"),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  description: text("description"),
  merchantId: integer("merchant_id").references(() => merchants.id),
  isPromoActive: boolean("is_promo_active").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_places_google_place_id").on(table.googlePlaceId),
  index("IDX_places_city_district").on(table.city, table.district),
  index("IDX_places_category").on(table.category),
  index("IDX_places_merchant").on(table.merchantId),
]);

// Merchant-Place Links (ownership/claim system) - 單一認領制
export const merchantPlaceLinks = pgTable("merchant_place_links", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  officialPlaceId: integer("official_place_id").references(() => places.id).unique(),
  placeCacheId: integer("place_cache_id").references(() => placeCache.id),
  googlePlaceId: text("google_place_id"),
  placeName: text("place_name").notNull(),
  district: text("district").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  status: varchar("status", { length: 50 }).default('pending').notNull(),
  couponDropRate: doublePrecision("coupon_drop_rate").default(0.1),
  promoTitle: text("promo_title"),
  promoDescription: text("promo_description"),
  promoImageUrl: text("promo_image_url"),
  isPromoActive: boolean("is_promo_active").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_merchant_place_links_lookup").on(table.placeName, table.district, table.city),
  index("IDX_merchant_place_links_merchant").on(table.merchantId),
  index("IDX_merchant_place_links_google_place_id").on(table.googlePlaceId),
  index("IDX_merchant_place_links_official").on(table.officialPlaceId),
]);

// Merchant coupons
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  merchantPlaceLinkId: integer("merchant_place_link_id").references(() => merchantPlaceLinks.id),
  placeId: integer("place_id").references(() => places.id),
  placeName: text("place_name").notNull(),
  title: text("title").notNull(),
  code: text("code").notNull(),
  terms: text("terms"),
  rarity: varchar("rarity", { length: 10 }),
  dropRate: doublePrecision("drop_rate"),
  remainingQuantity: integer("remaining_quantity").default(0).notNull(),
  redeemedCount: integer("redeemed_count").default(0).notNull(),
  impressionCount: integer("impression_count").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User's collected places (圖鑑/背包)
export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  officialPlaceId: integer("official_place_id").references(() => places.id),
  placeName: text("place_name").notNull(),
  country: text("country").notNull(),
  city: text("city").notNull(),
  district: text("district"),
  category: text("category"),
  subcategory: text("subcategory"),
  description: text("description"),
  address: text("address"),
  placeId: text("place_id"),
  rating: text("rating"),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  googleTypes: text("google_types"),
  isCoupon: boolean("is_coupon").default(false),
  couponData: jsonb("coupon_data"),
  wonCouponId: integer("won_coupon_id").references(() => coupons.id),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_collections_user_place").on(table.userId, table.placeName, table.district),
  index("IDX_collections_official_place").on(table.officialPlaceId),
]);

// ============ Relations ============

// Location hierarchy relations
export const countriesRelations = relations(countries, ({ many }) => ({
  regions: many(regions),
}));

export const regionsRelations = relations(regions, ({ one, many }) => ({
  country: one(countries, {
    fields: [regions.countryId],
    references: [countries.id],
  }),
  districts: many(districts),
}));

export const districtsRelations = relations(districts, ({ one }) => ({
  region: one(regions, {
    fields: [districts.regionId],
    references: [regions.id],
  }),
}));

// Category hierarchy relations
export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
}));

export const subcategoriesRelations = relations(subcategories, ({ one }) => ({
  category: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
}));

// User relations
export const usersRelations = relations(users, ({ many }) => ({
  collections: many(collections),
  merchants: many(merchants),
  userCoupons: many(userCoupons),
  userCollection: many(userCollection),
}));

export const collectionsRelations = relations(collections, ({ one }) => ({
  user: one(users, {
    fields: [collections.userId],
    references: [users.id],
  }),
}));

export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  user: one(users, {
    fields: [merchants.userId],
    references: [users.id],
  }),
  coupons: many(coupons),
}));

export const couponsRelations = relations(coupons, ({ one }) => ({
  merchant: one(merchants, {
    fields: [coupons.merchantId],
    references: [merchants.id],
  }),
  place: one(places, {
    fields: [coupons.placeId],
    references: [places.id],
  }),
}));

// Places relations
export const placesRelations = relations(places, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [places.merchantId],
    references: [merchants.id],
  }),
  coupons: many(coupons),
}));

// Insert/Upsert schemas
export const upsertUserSchema = createInsertSchema(users);

// Registration schema for email/password signup
export const registerUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  firstName: true,
  lastName: true,
  role: true,
}).extend({
  email: z.string().email("請輸入有效的電子郵件"),
  password: z.string().min(8, "密碼至少需要 8 個字元"),
  role: z.enum(['traveler', 'merchant', 'specialist', 'admin']).default('traveler'),
});

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  collectedAt: true,
});

export const insertMerchantSchema = createInsertSchema(merchants).omit({
  id: true,
  createdAt: true,
});

export const insertSpecialistSchema = createInsertSchema(specialists).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertServiceRelationSchema = createInsertSchema(serviceRelations).omit({
  id: true,
  createdAt: true,
});

export const insertCouponSchema = createInsertSchema(coupons).omit({
  id: true,
  createdAt: true,
});

export const insertMerchantPlaceLinkSchema = createInsertSchema(merchantPlaceLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlaceCacheSchema = createInsertSchema(placeCache).omit({
  id: true,
  createdAt: true,
});

export const insertPlaceFeedbackSchema = createInsertSchema(placeFeedback).omit({
  id: true,
  createdAt: true,
});

export const insertPlaceSchema = createInsertSchema(places).omit({
  id: true,
  createdAt: true,
});

// Location schemas
export const insertCountrySchema = createInsertSchema(countries).omit({
  id: true,
  createdAt: true,
});

export const insertRegionSchema = createInsertSchema(regions).omit({
  id: true,
  createdAt: true,
});

export const insertDistrictSchema = createInsertSchema(districts).omit({
  id: true,
  createdAt: true,
});

// Category schemas
export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});

export const insertSubcategorySchema = createInsertSchema(subcategories).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Collection = typeof collections.$inferSelect;

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;

export type InsertSpecialist = z.infer<typeof insertSpecialistSchema>;
export type Specialist = typeof specialists.$inferSelect;

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export type InsertServiceRelation = z.infer<typeof insertServiceRelationSchema>;
export type ServiceRelation = typeof serviceRelations.$inferSelect;

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof coupons.$inferSelect;

export type InsertMerchantPlaceLink = z.infer<typeof insertMerchantPlaceLinkSchema>;
export type MerchantPlaceLink = typeof merchantPlaceLinks.$inferSelect;

export type InsertPlaceCache = z.infer<typeof insertPlaceCacheSchema>;
export type PlaceCache = typeof placeCache.$inferSelect;

export type InsertPlaceFeedback = z.infer<typeof insertPlaceFeedbackSchema>;
export type PlaceFeedback = typeof placeFeedback.$inferSelect;

export type InsertPlace = z.infer<typeof insertPlaceSchema>;
export type Place = typeof places.$inferSelect;

// Location types
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type Country = typeof countries.$inferSelect;

export type InsertRegion = z.infer<typeof insertRegionSchema>;
export type Region = typeof regions.$inferSelect;

export type InsertDistrict = z.infer<typeof insertDistrictSchema>;
export type District = typeof districts.$inferSelect;

// Category types
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

export type InsertSubcategory = z.infer<typeof insertSubcategorySchema>;
export type Subcategory = typeof subcategories.$inferSelect;

// ============ Trip Planner Module Tables ============

export const tripPlans = pgTable("trip_plans", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  destination: text("destination").notNull(),
  destinationDistrict: text("destination_district"),
  destinationCity: text("destination_city"),
  destinationCountry: text("destination_country"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: varchar("status", { length: 20 }).default('draft').notNull(),
  coverImageUrl: text("cover_image_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_trip_plans_user").on(table.userId),
  index("IDX_trip_plans_status").on(table.status),
]);

export const tripDays = pgTable("trip_days", {
  id: serial("id").primaryKey(),
  tripPlanId: integer("trip_plan_id").references(() => tripPlans.id).notNull(),
  dayNumber: integer("day_number").notNull(),
  date: text("date").notNull(),
  title: text("title"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_trip_days_plan").on(table.tripPlanId),
]);

export const tripActivities = pgTable("trip_activities", {
  id: serial("id").primaryKey(),
  tripDayId: integer("trip_day_id").references(() => tripDays.id).notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  timeSlot: varchar("time_slot", { length: 20 }).default('morning').notNull(),
  placeName: text("place_name").notNull(),
  placeId: text("place_id"),
  category: text("category"),
  subcategory: text("subcategory"),
  description: text("description"),
  address: text("address"),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  duration: integer("duration"),
  notes: text("notes"),
  isFromGacha: boolean("is_from_gacha").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_trip_activities_day").on(table.tripDayId),
]);

export const tripPlansRelations = relations(tripPlans, ({ one, many }) => ({
  user: one(users, {
    fields: [tripPlans.userId],
    references: [users.id],
  }),
  days: many(tripDays),
}));

export const tripDaysRelations = relations(tripDays, ({ one, many }) => ({
  tripPlan: one(tripPlans, {
    fields: [tripDays.tripPlanId],
    references: [tripPlans.id],
  }),
  activities: many(tripActivities),
}));

export const tripActivitiesRelations = relations(tripActivities, ({ one }) => ({
  tripDay: one(tripDays, {
    fields: [tripActivities.tripDayId],
    references: [tripDays.id],
  }),
}));

export const insertTripPlanSchema = createInsertSchema(tripPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTripDaySchema = createInsertSchema(tripDays).omit({
  id: true,
  createdAt: true,
});

export const insertTripActivitySchema = createInsertSchema(tripActivities).omit({
  id: true,
  createdAt: true,
});

export type TripPlan = typeof tripPlans.$inferSelect;
export type InsertTripPlan = z.infer<typeof insertTripPlanSchema>;
export type TripDay = typeof tripDays.$inferSelect;
export type InsertTripDay = z.infer<typeof insertTripDaySchema>;
export type TripActivity = typeof tripActivities.$inferSelect;
export type InsertTripActivity = z.infer<typeof insertTripActivitySchema>;

// ============ Planner Service Tables ============

// Planners - 旅程策劃師
export const planners = pgTable("planners", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  profileImageUrl: text("profile_image_url"),
  specialties: text("specialties").array(),
  languages: text("languages").array(),
  rating: integer("rating").default(0),
  totalOrders: integer("total_orders").default(0),
  isAvailable: boolean("is_available").default(true).notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_planners_user").on(table.userId),
  index("IDX_planners_available").on(table.isAvailable),
]);

// Service Plans - 服務方案
export const servicePlans = pgTable("service_plans", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  nameZh: text("name_zh").notNull(),
  nameEn: text("name_en").notNull(),
  description: text("description"),
  features: text("features").array(),
  priceNtd: integer("price_ntd").notNull(),
  priceUsd: integer("price_usd"),
  durationDays: integer("duration_days").default(7),
  maxMessages: integer("max_messages"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Service Orders - 服務訂單
export type OrderStatus = 'pending' | 'paid' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'stripe' | 'payuni' | 'manual';

export const serviceOrders = pgTable("service_orders", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  servicePlanId: integer("service_plan_id").references(() => servicePlans.id).notNull(),
  plannerId: integer("planner_id").references(() => planners.id),
  status: varchar("status", { length: 20 }).default('pending').notNull(),
  paymentMethod: varchar("payment_method", { length: 20 }),
  paymentId: varchar("payment_id", { length: 100 }),
  amountPaid: integer("amount_paid"),
  currency: varchar("currency", { length: 10 }).default('TWD'),
  conversationSid: varchar("conversation_sid", { length: 50 }),
  notes: text("notes"),
  paidAt: timestamp("paid_at"),
  assignedAt: timestamp("assigned_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),
  verificationCode: varchar("verification_code", { length: 8 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_orders_user").on(table.userId),
  index("IDX_orders_planner").on(table.plannerId),
  index("IDX_orders_status").on(table.status),
]);

// Relations
export const plannersRelations = relations(planners, ({ one, many }) => ({
  user: one(users, {
    fields: [planners.userId],
    references: [users.id],
  }),
  orders: many(serviceOrders),
}));

export const servicePlansRelations = relations(servicePlans, ({ many }) => ({
  orders: many(serviceOrders),
}));

export const serviceOrdersRelations = relations(serviceOrders, ({ one }) => ({
  user: one(users, {
    fields: [serviceOrders.userId],
    references: [users.id],
  }),
  servicePlan: one(servicePlans, {
    fields: [serviceOrders.servicePlanId],
    references: [servicePlans.id],
  }),
  planner: one(planners, {
    fields: [serviceOrders.plannerId],
    references: [planners.id],
  }),
}));

// Insert schemas
export const insertPlannerSchema = createInsertSchema(planners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServicePlanSchema = createInsertSchema(servicePlans).omit({
  id: true,
  createdAt: true,
});

export const insertServiceOrderSchema = createInsertSchema(serviceOrders).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type Planner = typeof planners.$inferSelect;
export type InsertPlanner = z.infer<typeof insertPlannerSchema>;
export type ServicePlan = typeof servicePlans.$inferSelect;
export type InsertServicePlan = z.infer<typeof insertServicePlanSchema>;
export type ServiceOrder = typeof serviceOrders.$inferSelect;
export type InsertServiceOrder = z.infer<typeof insertServiceOrderSchema>;

// ============ Travel Companions Tables ============

// Travel Companions - 已確認的旅伴
export type CompanionRole = 'owner' | 'companion';
export type CompanionStatus = 'active' | 'removed';

export const travelCompanions = pgTable("travel_companions", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => serviceOrders.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: varchar("role", { length: 20 }).default('companion').notNull(),
  status: varchar("status", { length: 20 }).default('active').notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_companions_order").on(table.orderId),
  index("IDX_companions_user").on(table.userId),
]);

// Companion Invites - 待確認的邀請
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

export const companionInvites = pgTable("companion_invites", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => serviceOrders.id).notNull(),
  inviterUserId: varchar("inviter_user_id").references(() => users.id).notNull(),
  inviteeEmail: varchar("invitee_email", { length: 255 }),
  inviteeUserId: varchar("invitee_user_id").references(() => users.id),
  inviteCode: varchar("invite_code", { length: 50 }).notNull().unique(),
  status: varchar("status", { length: 20 }).default('pending').notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_invites_order").on(table.orderId),
  index("IDX_invites_code").on(table.inviteCode),
]);

// Relations
export const travelCompanionsRelations = relations(travelCompanions, ({ one }) => ({
  order: one(serviceOrders, {
    fields: [travelCompanions.orderId],
    references: [serviceOrders.id],
  }),
  user: one(users, {
    fields: [travelCompanions.userId],
    references: [users.id],
  }),
}));

export const companionInvitesRelations = relations(companionInvites, ({ one }) => ({
  order: one(serviceOrders, {
    fields: [companionInvites.orderId],
    references: [serviceOrders.id],
  }),
  inviter: one(users, {
    fields: [companionInvites.inviterUserId],
    references: [users.id],
  }),
}));

// Chat Invites - 聊天室邀請連結
export const chatInvites = pgTable("chat_invites", {
  id: serial("id").primaryKey(),
  conversationSid: varchar("conversation_sid", { length: 100 }).notNull(),
  inviterUserId: varchar("inviter_user_id").references(() => users.id).notNull(),
  inviteCode: varchar("invite_code", { length: 50 }).notNull().unique(),
  status: varchar("status", { length: 20 }).default('pending').notNull(),
  usedByUserId: varchar("used_by_user_id").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_chat_invites_code").on(table.inviteCode),
  index("IDX_chat_invites_conversation").on(table.conversationSid),
]);

// ============ User Locations (位置共享) ============

export const userLocations = pgTable("user_locations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  isSharingEnabled: boolean("is_sharing_enabled").default(true).notNull(),
  sosMode: boolean("sos_mode").default(false).notNull(), // Emergency SOS mode - forces location sharing
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_user_locations_user").on(table.userId),
  index("IDX_user_locations_sharing").on(table.isSharingEnabled),
]);

export const userLocationsRelations = relations(userLocations, ({ one }) => ({
  user: one(users, {
    fields: [userLocations.userId],
    references: [users.id],
  }),
}));

export const insertUserLocationSchema = createInsertSchema(userLocations).omit({
  id: true,
  updatedAt: true,
});

export type UserLocation = typeof userLocations.$inferSelect;
export type InsertUserLocation = z.infer<typeof insertUserLocationSchema>;

// Insert schemas
export const insertTravelCompanionSchema = createInsertSchema(travelCompanions).omit({
  id: true,
  joinedAt: true,
});

export const insertCompanionInviteSchema = createInsertSchema(companionInvites).omit({
  id: true,
  inviteCode: true,
  createdAt: true,
});

export const insertChatInviteSchema = createInsertSchema(chatInvites).omit({
  id: true,
  inviteCode: true,
  createdAt: true,
});

// Types
export type TravelCompanion = typeof travelCompanions.$inferSelect;
export type InsertTravelCompanion = z.infer<typeof insertTravelCompanionSchema>;
export type CompanionInvite = typeof companionInvites.$inferSelect;
export type InsertCompanionInvite = z.infer<typeof insertCompanionInviteSchema>;
export type ChatInvite = typeof chatInvites.$inferSelect;
export type InsertChatInvite = z.infer<typeof insertChatInviteSchema>;

// =====================================================
// 聊天商務系統 (In-Chat Commerce)
// =====================================================

// Place Products - 商家商品/服務
export const placeProducts = pgTable("place_products", {
  id: serial("id").primaryKey(),
  placeCacheId: integer("place_cache_id").references(() => placeCache.id),
  merchantId: integer("merchant_id").references(() => merchants.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  currency: varchar("currency", { length: 10 }).default('TWD').notNull(),
  category: varchar("category", { length: 50 }),
  imageUrl: text("image_url"),
  stripeProductId: varchar("stripe_product_id", { length: 100 }),
  stripePriceId: varchar("stripe_price_id", { length: 100 }),
  isActive: boolean("is_active").default(true).notNull(),
  stock: integer("stock"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_place_products_place").on(table.placeCacheId),
  index("IDX_place_products_merchant").on(table.merchantId),
]);

// Cart Items - 購物車項目
export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => placeProducts.id).notNull(),
  quantity: integer("quantity").default(1).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_cart_items_user").on(table.userId),
]);

// Commerce Orders - 商務訂單
export const commerceOrders = pgTable("commerce_orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  stripeSessionId: varchar("stripe_session_id", { length: 200 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 200 }),
  status: varchar("status", { length: 30 }).default('pending').notNull(),
  totalAmount: integer("total_amount").notNull(),
  currency: varchar("currency", { length: 10 }).default('TWD').notNull(),
  items: jsonb("items").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_commerce_orders_user").on(table.userId),
  index("IDX_commerce_orders_session").on(table.stripeSessionId),
]);

// Insert schemas for commerce
export const insertPlaceProductSchema = createInsertSchema(placeProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  addedAt: true,
});

export const insertCommerceOrderSchema = createInsertSchema(commerceOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Commerce types
export type PlaceProduct = typeof placeProducts.$inferSelect;
export type InsertPlaceProduct = z.infer<typeof insertPlaceProductSchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CommerceOrder = typeof commerceOrders.$inferSelect;
export type InsertCommerceOrder = z.infer<typeof insertCommerceOrderSchema>;

// =====================================================
// KLOOK INTEGRATION TABLES
// =====================================================

// Klook Products Cache - Klook 商品快取
export const klookProducts = pgTable("klook_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameNormalized: text("name_normalized").notNull(),
  klookUrl: text("klook_url").notNull(),
  category: text("category"),
  region: text("region"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_klook_products_name").on(table.nameNormalized),
  index("IDX_klook_products_region").on(table.region),
]);

// Message Highlights - 訊息中的 Klook 商品標記
export const messageHighlights = pgTable("message_highlights", {
  id: serial("id").primaryKey(),
  conversationSid: varchar("conversation_sid", { length: 100 }).notNull(),
  messageSid: varchar("message_sid", { length: 100 }).notNull(),
  productName: text("product_name").notNull(),
  productUrl: text("product_url").notNull(),
  startIndex: integer("start_index").notNull(),
  endIndex: integer("end_index").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_message_highlights_conversation").on(table.conversationSid),
  index("IDX_message_highlights_message").on(table.messageSid),
]);

// Klook insert schemas
export const insertKlookProductSchema = createInsertSchema(klookProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageHighlightSchema = createInsertSchema(messageHighlights).omit({
  id: true,
  createdAt: true,
});

// Klook types
export type KlookProduct = typeof klookProducts.$inferSelect;
export type InsertKlookProduct = z.infer<typeof insertKlookProductSchema>;
export type MessageHighlight = typeof messageHighlights.$inferSelect;
export type InsertMessageHighlight = z.infer<typeof insertMessageHighlightSchema>;

// =====================================================
// 商家地點申請系統 (Place Application System)
// =====================================================

// Place Drafts - 草稿地點（待審核）
export type PlaceDraftStatus = 'pending' | 'approved' | 'rejected';

export type DraftSource = 'ai' | 'merchant';
export type DraftStatus = 'pending' | 'approved' | 'rejected';

export const placeDrafts = pgTable("place_drafts", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  source: varchar("source", { length: 20 }).default('merchant').notNull(),
  placeName: text("place_name").notNull(),
  categoryId: integer("category_id").references(() => categories.id).notNull(),
  subcategoryId: integer("subcategory_id").references(() => subcategories.id).notNull(),
  description: text("description"),
  districtId: integer("district_id").references(() => districts.id).notNull(),
  regionId: integer("region_id").references(() => regions.id).notNull(),
  countryId: integer("country_id").references(() => countries.id).notNull(),
  address: text("address"),
  googlePlaceId: text("google_place_id"),
  googleRating: doublePrecision("google_rating"),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  status: varchar("status", { length: 20 }).default('pending').notNull(),
  approvedPlaceId: integer("approved_place_id").references(() => places.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_place_drafts_merchant").on(table.merchantId),
  index("IDX_place_drafts_status").on(table.status),
  index("IDX_place_drafts_district").on(table.districtId),
  index("IDX_place_drafts_source").on(table.source),
]);

// Place Applications - 申請紀錄（審核流程）
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export const placeApplications = pgTable("place_applications", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  placeDraftId: integer("place_draft_id").references(() => placeDrafts.id).notNull(),
  status: varchar("status", { length: 20 }).default('pending').notNull(),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  placeCacheId: integer("place_cache_id").references(() => placeCache.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_place_applications_merchant").on(table.merchantId),
  index("IDX_place_applications_status").on(table.status),
  index("IDX_place_applications_draft").on(table.placeDraftId),
]);

// Relations for Place Application System
export const placeDraftsRelations = relations(placeDrafts, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [placeDrafts.merchantId],
    references: [merchants.id],
  }),
  category: one(categories, {
    fields: [placeDrafts.categoryId],
    references: [categories.id],
  }),
  subcategory: one(subcategories, {
    fields: [placeDrafts.subcategoryId],
    references: [subcategories.id],
  }),
  district: one(districts, {
    fields: [placeDrafts.districtId],
    references: [districts.id],
  }),
  region: one(regions, {
    fields: [placeDrafts.regionId],
    references: [regions.id],
  }),
  country: one(countries, {
    fields: [placeDrafts.countryId],
    references: [countries.id],
  }),
  applications: many(placeApplications),
}));

export const placeApplicationsRelations = relations(placeApplications, ({ one }) => ({
  merchant: one(merchants, {
    fields: [placeApplications.merchantId],
    references: [merchants.id],
  }),
  placeDraft: one(placeDrafts, {
    fields: [placeApplications.placeDraftId],
    references: [placeDrafts.id],
  }),
  reviewer: one(users, {
    fields: [placeApplications.reviewedBy],
    references: [users.id],
  }),
  placeCache: one(placeCache, {
    fields: [placeApplications.placeCacheId],
    references: [placeCache.id],
  }),
}));

// Insert schemas for Place Application System
export const insertPlaceDraftSchema = createInsertSchema(placeDrafts).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlaceApplicationSchema = createInsertSchema(placeApplications).omit({
  id: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
  placeCacheId: true,
  createdAt: true,
});

// Types for Place Application System
export type PlaceDraft = typeof placeDrafts.$inferSelect;
export type InsertPlaceDraft = z.infer<typeof insertPlaceDraftSchema>;
export type PlaceApplication = typeof placeApplications.$inferSelect;
export type InsertPlaceApplication = z.infer<typeof insertPlaceApplicationSchema>;

// ============ SOS Events Table ============

export type SosEventStatus = 'pending' | 'processing' | 'resolved' | 'false_alarm';

export const sosEvents = pgTable("sos_events", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  status: varchar("status", { length: 20 }).default('pending').notNull(),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  audioUrl: text("audio_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_sos_events_user").on(table.userId),
  index("IDX_sos_events_status").on(table.status),
]);

export const sosEventsRelations = relations(sosEvents, ({ one }) => ({
  user: one(users, {
    fields: [sosEvents.userId],
    references: [users.id],
  }),
  resolver: one(users, {
    fields: [sosEvents.resolvedBy],
    references: [users.id],
  }),
}));

export const insertSosEventSchema = createInsertSchema(sosEvents).omit({
  id: true,
  createdAt: true,
});

export type SosEvent = typeof sosEvents.$inferSelect;
export type InsertSosEvent = z.infer<typeof insertSosEventSchema>;

// ============ Announcements Table ============

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
});

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;

// ============ Events Table ============

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 256 }).notNull(),
  content: text('content'),
  eventType: eventTypeEnum('event_type').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  imageUrl: varchar('image_url', { length: 512 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

// ============ User Coupons Table (道具箱) ============

export const userCoupons = pgTable('user_coupons', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  couponId: integer('coupon_id').references(() => coupons.id).notNull(),
  acquiredAt: timestamp('acquired_at').defaultNow(),
  status: userCouponStatusEnum('status').default('active').notNull(),
}, (table) => [
  index("IDX_user_coupons_user").on(table.userId),
  index("IDX_user_coupons_coupon").on(table.couponId),
]);

export const userCouponsRelations = relations(userCoupons, ({ one }) => ({
  user: one(users, { fields: [userCoupons.userId], references: [users.id] }),
  couponTemplate: one(coupons, { fields: [userCoupons.couponId], references: [coupons.id] }),
}));

export const insertUserCouponSchema = createInsertSchema(userCoupons).omit({
  id: true,
  acquiredAt: true,
});

export type UserCoupon = typeof userCoupons.$inferSelect;
export type InsertUserCoupon = z.infer<typeof insertUserCouponSchema>;

// ============ User Collection Table (圖鑑) ============

export const userCollection = pgTable('user_collection', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  placeId: integer('place_id').references(() => places.id).notNull(),
  firstAcquiredAt: timestamp('first_acquired_at').defaultNow(),
  isNew: boolean('is_new').default(true),
}, (table) => [
  index("IDX_user_collection_user").on(table.userId),
  index("IDX_user_collection_place").on(table.placeId),
]);

export const userCollectionRelations = relations(userCollection, ({ one }) => ({
  user: one(users, { fields: [userCollection.userId], references: [users.id] }),
  place: one(places, { fields: [userCollection.placeId], references: [places.id] }),
}));

export const insertUserCollectionSchema = createInsertSchema(userCollection).omit({
  id: true,
  firstAcquiredAt: true,
});

export type UserCollectionItem = typeof userCollection.$inferSelect;
export type InsertUserCollectionItem = z.infer<typeof insertUserCollectionSchema>;

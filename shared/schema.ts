import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

// Users table - supports Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User's collected places
export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
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
  isCoupon: boolean("is_coupon").default(false),
  couponData: jsonb("coupon_data"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_collections_user_place").on(table.userId, table.placeName, table.district),
]);

// Merchants
export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subscriptionPlan: text("subscription_plan").default('free').notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

// Merchant-Place Links (ownership/claim system)
export const merchantPlaceLinks = pgTable("merchant_place_links", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  placeCacheId: integer("place_cache_id").references(() => placeCache.id),
  googlePlaceId: text("google_place_id"), // Google Places API place_id for accurate matching
  placeName: text("place_name").notNull(),
  district: text("district").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  status: varchar("status", { length: 50 }).default('pending').notNull(), // pending, approved, rejected
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
]);

// Merchant coupons
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  merchantPlaceLinkId: integer("merchant_place_link_id").references(() => merchantPlaceLinks.id),
  placeName: text("place_name").notNull(),
  title: text("title").notNull(),
  code: text("code").notNull(),
  terms: text("terms"),
  rarity: text("rarity"),
  remainingQuantity: integer("remaining_quantity").default(0).notNull(),
  redeemedCount: integer("redeemed_count").default(0).notNull(),
  impressionCount: integer("impression_count").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
}));

// Insert/Upsert schemas
export const upsertUserSchema = createInsertSchema(users);

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  collectedAt: true,
});

export const insertMerchantSchema = createInsertSchema(merchants).omit({
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

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof coupons.$inferSelect;

export type InsertMerchantPlaceLink = z.infer<typeof insertMerchantPlaceLinkSchema>;
export type MerchantPlaceLink = typeof merchantPlaceLinks.$inferSelect;

export type InsertPlaceCache = z.infer<typeof insertPlaceCacheSchema>;
export type PlaceCache = typeof placeCache.$inferSelect;

export type InsertPlaceFeedback = z.infer<typeof insertPlaceFeedbackSchema>;
export type PlaceFeedback = typeof placeFeedback.$inferSelect;

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

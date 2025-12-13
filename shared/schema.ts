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

// User roles: consumer (default), merchant, admin
export type UserRole = 'consumer' | 'merchant' | 'admin';

// Users table - supports Replit Auth and guest login
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).default('consumer').notNull(),
  provider: varchar("provider", { length: 20 }), // 'replit' | 'guest' | 'email'
  stripeCustomerId: varchar("stripe_customer_id"),
  isActive: boolean("is_active").default(true).notNull(),
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
  googleTypes: text("google_types"),
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

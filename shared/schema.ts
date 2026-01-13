import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer, boolean, jsonb, index, uniqueIndex, doublePrecision, date } from "drizzle-orm/pg-core";
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

// User roles: traveler (default), merchant, specialist, admin
export type UserRole = 'traveler' | 'merchant' | 'specialist' | 'admin';

// Auth provider types
export type AuthProvider = 'google' | 'apple' | 'email' | 'replit' | 'guest';

// Users table - supports multiple OAuth providers and email/password auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email"),
  password: text("password"), // Hashed password for email auth (null for OAuth users)
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).default('traveler').notNull(),
  provider: varchar("provider", { length: 20 }), // 'google' | 'apple' | 'email' | 'replit' | 'guest'
  isApproved: boolean("is_approved").default(false).notNull(), // Requires admin approval for certain roles
  stripeCustomerId: varchar("stripe_customer_id"),
  sosSecretKey: varchar("sos_secret_key", { length: 64 }), // Long-lived SOS webhook key
  isActive: boolean("is_active").default(true).notNull(),
  // 個人資料擴展欄位
  gender: varchar("gender", { length: 10 }), // 'male' | 'female' | 'other'
  birthDate: date("birth_date"),
  phone: varchar("phone", { length: 20 }),
  dietaryRestrictions: text("dietary_restrictions").array(), // 飲食禁忌 (標籤陣列)
  medicalHistory: text("medical_history").array(), // 疾病史 (標籤陣列)
  emergencyContactName: varchar("emergency_contact_name", { length: 100 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 20 }),
  emergencyContactRelation: varchar("emergency_contact_relation", { length: 50 }),
  preferredLanguage: varchar("preferred_language", { length: 10 }).default('zh-TW'), // 'zh-TW' | 'en' | 'ja' | 'ko'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Auth Identities - 支援一個用戶多種登入方式
// 例如：同一個用戶可以用 Google 和 Apple 登入，都連結到同一個 users.id
export const authIdentities = pgTable("auth_identities", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  provider: varchar("provider", { length: 20 }).notNull(), // 'google' | 'apple' | 'email' | 'replit'
  providerUserId: varchar("provider_user_id", { length: 255 }).notNull(), // OAuth sub 或 email
  email: varchar("email"), // OAuth 回傳的 email（用於帳號連結比對）
  emailVerified: boolean("email_verified").default(false),
  accessToken: text("access_token"), // OAuth access token（可選）
  refreshToken: text("refresh_token"), // OAuth refresh token（可選）
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_auth_identities_user").on(table.userId),
  index("IDX_auth_identities_email").on(table.email),
  // Unique constraint: 每個 provider 只能有一個 providerUserId
  uniqueIndex("UQ_auth_identities_provider_user").on(table.provider, table.providerUserId),
]);

// Insert schema for auth_identities
export const insertAuthIdentitySchema = createInsertSchema(authIdentities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAuthIdentity = z.infer<typeof insertAuthIdentitySchema>;
export type AuthIdentity = typeof authIdentities.$inferSelect;

// Merchants (商家)
export type MerchantStatus = 'pending' | 'approved' | 'rejected';
export type MerchantLevel = 'free' | 'pro' | 'premium';

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  // 基本資料
  ownerName: text("owner_name"), // 負責人姓名 (nullable for backward compat)
  businessName: text("business_name"), // 商家名稱 (nullable for backward compat)
  taxId: varchar("tax_id", { length: 20 }), // 統一編號 (選填)
  businessCategory: varchar("business_category", { length: 50 }), // 營業類別
  address: text("address"), // 地點
  phone: varchar("phone", { length: 20 }), // 電話
  mobile: varchar("mobile", { length: 20 }), // 手機
  email: text("email").notNull(),
  // 舊欄位 (保留向下相容)
  name: text("name"), // 保留舊欄位
  subscriptionPlan: text("subscription_plan").default('free').notNull(),
  dailySeedCode: text("daily_seed_code"),
  codeUpdatedAt: timestamp("code_updated_at"),
  creditBalance: integer("credit_balance").default(0).notNull(),
  // 審核與等級
  status: varchar("status", { length: 20 }).default('pending').notNull(), // 'pending' | 'approved' | 'rejected'
  merchantLevel: varchar("merchant_level", { length: 20 }).default('free').notNull(), // 'free' | 'pro' | 'premium'
  merchantLevelExpiresAt: timestamp("merchant_level_expires_at"), // 訂閱到期時間
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }), // Stripe 客戶 ID
  recurCustomerId: varchar("recur_customer_id", { length: 255 }), // Recur 客戶 ID
  rejectionReason: text("rejection_reason"), // 審核拒絕原因
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_merchants_user").on(table.userId),
  index("IDX_merchants_status").on(table.status),
]);

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

// Merchant Subscriptions (商家訂閱記錄)
export type SubscriptionType = 'merchant' | 'place';
export type SubscriptionTier = 'pro' | 'premium';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceling' | 'expired' | 'cancelled';
export type SubscriptionProvider = 'stripe' | 'recur';

export const merchantSubscriptions = pgTable("merchant_subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  
  type: varchar("type", { length: 20 }).notNull(), // 'merchant' | 'place'
  tier: varchar("tier", { length: 20 }).notNull(), // 'pro' | 'premium'
  placeId: integer("place_id").references(() => places.id), // 若 type='place'，關聯的 place
  
  provider: varchar("provider", { length: 20 }).notNull(), // 'stripe' | 'recur'
  providerSubscriptionId: varchar("provider_subscription_id", { length: 255 }).notNull(),
  providerCustomerId: varchar("provider_customer_id", { length: 255 }),
  
  status: varchar("status", { length: 20 }).default("active").notNull(), // 'active' | 'past_due' | 'canceling' | 'expired' | 'cancelled'
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  scheduledDowngradeTo: varchar("scheduled_downgrade_to", { length: 20 }), // 預定降級的目標等級
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  
  amount: integer("amount"), // 訂閱金額
  currency: varchar("currency", { length: 10 }).default("TWD"),
  lastPaymentIntentId: varchar("last_payment_intent_id", { length: 255 }),
  
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_merchant_subscriptions_merchant").on(table.merchantId),
  index("IDX_merchant_subscriptions_status").on(table.status),
  index("IDX_merchant_subscriptions_provider").on(table.provider, table.providerSubscriptionId),
]);

// Refund Requests (退款申請記錄)
export type RefundRequestStatus = 'pending' | 'approved' | 'rejected' | 'manual_review' | 'processed';

export const refundRequests = pgTable("refund_requests", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").references(() => merchantSubscriptions.id).notNull(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  
  reason: text("reason").notNull(), // 用戶提供的退款原因
  status: varchar("status", { length: 20 }).default("pending").notNull(), // 'pending' | 'approved' | 'rejected' | 'manual_review' | 'processed'
  
  daysSinceSubscription: integer("days_since_subscription"), // 申請時距訂閱多少天
  isWithin7Days: boolean("is_within_7_days").default(false), // 是否在 7 天鑑賞期內
  
  provider: varchar("provider", { length: 20 }), // 'stripe' | 'recur'
  stripeRefundId: varchar("stripe_refund_id", { length: 255 }), // Stripe 退款 ID
  stripeChargeId: varchar("stripe_charge_id", { length: 255 }), // 被退款的 charge ID
  refundAmount: integer("refund_amount"), // 退款金額（分為單位）
  refundCurrency: varchar("refund_currency", { length: 10 }).default("TWD"),
  
  processedBy: varchar("processed_by", { length: 255 }), // 處理人員 (人工處理時)
  processedAt: timestamp("processed_at"), // 處理時間
  adminNotes: text("admin_notes"), // 客服備註
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_refund_requests_subscription").on(table.subscriptionId),
  index("IDX_refund_requests_merchant").on(table.merchantId),
  index("IDX_refund_requests_status").on(table.status),
  index("IDX_refund_requests_created").on(table.createdAt),
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
  placeNameI18n: jsonb("place_name_i18n").$type<{ en?: string; ja?: string; ko?: string }>(),
  description: text("description").notNull(),
  descriptionI18n: jsonb("description_i18n").$type<{ en?: string; ja?: string; ko?: string }>(),
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
  aiReviewed: boolean("ai_reviewed").default(false),
  aiReviewedAt: timestamp("ai_reviewed_at"),
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
  placeNameI18n: jsonb("place_name_i18n").$type<{ en?: string; ja?: string; ko?: string }>(),
  country: text("country").notNull(),
  city: text("city").notNull(),
  district: text("district").notNull(),
  address: text("address"),
  addressI18n: jsonb("address_i18n").$type<{ en?: string; ja?: string; ko?: string }>(),
  locationLat: doublePrecision("location_lat"),
  locationLng: doublePrecision("location_lng"),
  googlePlaceId: text("google_place_id").unique(),
  googleTypes: text("google_types"),
  primaryType: text("primary_type"),
  rating: doublePrecision("rating"),
  photoReference: text("photo_reference"),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  description: text("description"),
  descriptionI18n: jsonb("description_i18n").$type<{ en?: string; ja?: string; ko?: string }>(),
  openingHours: jsonb("opening_hours").$type<{ weekdayText?: string[]; periods?: any[] }>(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  isPromoActive: boolean("is_promo_active").default(false),
  promoTitle: text("promo_title"),
  promoDescription: text("promo_description"),
  claimStatus: varchar("claim_status", { length: 20 }).default('unclaimed'),
  placeCardTier: varchar("place_card_tier", { length: 20 }).default('free'), // 'free' | 'pro' | 'premium'
  placeCardTierExpiresAt: timestamp("place_card_tier_expires_at"), // 行程卡訂閱到期時間
  businessStatus: varchar("business_status", { length: 50 }), // Google 營業狀態: OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_places_google_place_id").on(table.googlePlaceId),
  index("IDX_places_city_district").on(table.city, table.district),
  index("IDX_places_category").on(table.category),
  index("IDX_places_merchant").on(table.merchantId),
  index("IDX_places_is_active").on(table.isActive),
  index("IDX_places_claim_status").on(table.claimStatus),
]);

// Merchant-Place Links (ownership/claim system) - 單一認領制 / 行程卡
export type CardLevel = 'free' | 'pro' | 'premium';

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
  // 行程卡基本資料
  description: text("description"), // 基本介紹
  categoryId: integer("category_id"), // 八大種類 (參照 categories 表)
  googleMapUrl: text("google_map_url"), // Google 地圖連結
  // 審核狀態
  status: varchar("status", { length: 50 }).default('pending').notNull(), // 'pending' | 'approved' | 'rejected'
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  // 行程卡等級與特效
  cardLevel: varchar("card_level", { length: 20 }).default('free').notNull(), // 'free' | 'pro' | 'premium'
  cardFrameEnabled: boolean("card_frame_enabled").default(false), // 是否顯示外框 (Pro+)
  specialEffectEnabled: boolean("special_effect_enabled").default(false), // 抽中時特效 (Premium)
  // 優惠資訊
  couponDropRate: doublePrecision("coupon_drop_rate").default(0.1),
  promoTitle: text("promo_title"),
  promoDescription: text("promo_description"),
  promoImageUrl: text("promo_image_url"),
  inventoryImageUrl: text("inventory_image_url"), // 道具箱圖片 (Pro+)
  isPromoActive: boolean("is_promo_active").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_merchant_place_links_lookup").on(table.placeName, table.district, table.city),
  index("IDX_merchant_place_links_merchant").on(table.merchantId),
  index("IDX_merchant_place_links_google_place_id").on(table.googlePlaceId),
  index("IDX_merchant_place_links_official").on(table.officialPlaceId),
  index("IDX_merchant_place_links_status").on(table.status),
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

// Gacha AI Logs (每輪 AI 排序記錄)
export const gachaAiLogs = pgTable("gacha_ai_logs", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 36 }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  city: text("city").notNull(),
  district: text("district"),
  requestedCount: integer("requested_count").notNull(),
  
  orderedPlaceIds: integer("ordered_place_ids").array(),
  rejectedPlaceIds: integer("rejected_place_ids").array(),
  aiReason: text("ai_reason"),
  
  aiModel: text("ai_model"),
  reorderRounds: integer("reorder_rounds"),
  durationMs: integer("duration_ms"),
  
  categoryDistribution: jsonb("category_distribution"),
  isShortfall: boolean("is_shortfall").default(false),
  
  tripImageUrl: text("trip_image_url"),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_gacha_ai_logs_user").on(table.userId),
  uniqueIndex("IDX_gacha_ai_logs_session_unique").on(table.sessionId),
  index("IDX_gacha_ai_logs_created").on(table.createdAt),
  index("IDX_gacha_ai_logs_published").on(table.isPublished),
]);

// User's collected places (圖鑑/背包)
export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  officialPlaceId: integer("official_place_id").references(() => places.id),
  gachaSessionId: varchar("gacha_session_id", { length: 36 }),
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
  aiReason: text("ai_reason"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_collections_user_place").on(table.userId, table.placeName, table.district),
  index("IDX_collections_official_place").on(table.officialPlaceId),
  index("IDX_collections_gacha_session").on(table.gachaSessionId),
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
  authIdentities: many(authIdentities),
}));

// Auth identities relations
export const authIdentitiesRelations = relations(authIdentities, ({ one }) => ({
  user: one(users, {
    fields: [authIdentities.userId],
    references: [users.id],
  }),
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
export const registerUserSchema = z.object({
  email: z.string().email("請輸入有效的電子郵件"),
  password: z.string().min(8, "密碼至少需要 8 個字元"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(['traveler', 'merchant', 'specialist', 'admin']).default('traveler'),
});

// Profile update schema (for settings page)
export const updateProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  birthDate: z.string().optional(), // ISO date string
  phone: z.string().optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
  medicalHistory: z.array(z.string()).optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  preferredLanguage: z.enum(['zh-TW', 'en', 'ja', 'ko']).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const insertGachaAiLogSchema = createInsertSchema(gachaAiLogs).omit({
  id: true,
  createdAt: true,
});

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  collectedAt: true,
});

export const insertMerchantSchema = createInsertSchema(merchants).omit({
  id: true,
  status: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Make new fields optional for backwards compatibility
  ownerName: z.string().optional(),
  businessName: z.string().optional(),
});

// 商家註冊 Schema (送審用)
export const merchantRegisterSchema = z.object({
  ownerName: z.string().min(1, "請輸入負責人姓名"),
  businessName: z.string().min(1, "請輸入商家名稱"),
  taxId: z.string().optional(), // 統一編號 (選填)
  businessCategory: z.string().min(1, "請選擇營業類別"),
  address: z.string().min(1, "請輸入地點"),
  phone: z.string().optional(),
  mobile: z.string().min(1, "請輸入手機號碼"),
  email: z.string().email("請輸入有效的 Email"),
});

export type MerchantRegisterInput = z.infer<typeof merchantRegisterSchema>;

export const insertSpecialistSchema = createInsertSchema(specialists).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertMerchantSubscriptionSchema = createInsertSchema(merchantSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMerchantSubscription = z.infer<typeof insertMerchantSubscriptionSchema>;
export type MerchantSubscription = typeof merchantSubscriptions.$inferSelect;

export const insertRefundRequestSchema = createInsertSchema(refundRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRefundRequest = z.infer<typeof insertRefundRequestSchema>;
export type RefundRequest = typeof refundRequests.$inferSelect;

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

export type InsertGachaAiLog = z.infer<typeof insertGachaAiLogSchema>;
export type GachaAiLog = typeof gachaAiLogs.$inferSelect;

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
  placeNameI18n: jsonb("place_name_i18n").$type<{ en?: string; ja?: string; ko?: string }>(),
  categoryId: integer("category_id").references(() => categories.id).notNull(),
  subcategoryId: integer("subcategory_id").references(() => subcategories.id).notNull(),
  description: text("description"),
  descriptionI18n: jsonb("description_i18n").$type<{ en?: string; ja?: string; ko?: string }>(),
  districtId: integer("district_id").references(() => districts.id).notNull(),
  regionId: integer("region_id").references(() => regions.id).notNull(),
  countryId: integer("country_id").references(() => countries.id).notNull(),
  address: text("address"),
  googlePlaceId: text("google_place_id"),
  googleRating: doublePrecision("google_rating"),
  googleReviewCount: integer("google_review_count"), // 評論數
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
// status 保留可傳入，預設為 'pending'，AutoDraft 會傳 'auto_generated'
export const insertPlaceDraftSchema = createInsertSchema(placeDrafts).omit({
  id: true,
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

// ============ Announcements & Events System ============

// Announcement types: announcement (公告), flash_event (快閃活動), holiday_event (節日限定活動)
export type AnnouncementType = 'announcement' | 'flash_event' | 'holiday_event';

export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).default('announcement').notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"), // null = permanent (for regular announcements)
  isActive: boolean("is_active").default(true).notNull(),
  priority: integer("priority").default(0).notNull(), // Higher = show first
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_announcements_type").on(table.type),
  index("IDX_announcements_dates").on(table.startDate, table.endDate),
  index("IDX_announcements_active").on(table.isActive),
]);

export const announcementsRelations = relations(announcements, ({ one }) => ({
  creator: one(users, {
    fields: [announcements.createdBy],
    references: [users.id],
  }),
}));

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;

// ============ Enhanced Coupon System with Tiers ============

// Coupon tier: SP (2%), SSR (8%), SR (15%), S (23%), R (32%)
export type CouponTier = 'SP' | 'SSR' | 'SR' | 'S' | 'R';

export const couponTierProbabilities: Record<CouponTier, number> = {
  SP: 0.02,
  SSR: 0.08,
  SR: 0.15,
  S: 0.23,
  R: 0.32,
};

// Enhanced coupons table (extends existing coupons)
export const merchantCoupons = pgTable("merchant_coupons", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  merchantPlaceLinkId: integer("merchant_place_link_id").references(() => merchantPlaceLinks.id),
  name: text("name").notNull(),
  tier: varchar("tier", { length: 10 }).default('R').notNull(), // SP, SSR, SR, S, R
  terms: text("terms"), // 使用條款
  content: text("content").notNull(), // 優惠內容
  quantity: integer("quantity").default(-1).notNull(), // -1 = unlimited
  usedCount: integer("used_count").default(0).notNull(),
  validFrom: timestamp("valid_from").defaultNow().notNull(),
  validUntil: timestamp("valid_until"), // null = no expiry
  backgroundImageUrl: text("background_image_url"),
  inventoryImageUrl: text("inventory_image_url"), // For S+ tiers
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_merchant_coupons_merchant").on(table.merchantId),
  index("IDX_merchant_coupons_tier").on(table.tier),
  index("IDX_merchant_coupons_active").on(table.isActive),
]);

export const insertMerchantCouponSchema = createInsertSchema(merchantCoupons).omit({
  id: true,
  usedCount: true,
  createdAt: true,
  updatedAt: true,
});

export type MerchantCoupon = typeof merchantCoupons.$inferSelect;
export type InsertMerchantCoupon = z.infer<typeof insertMerchantCouponSchema>;

// ============ Merchant Analytics (商家數據分析) ============

export const merchantAnalytics = pgTable("merchant_analytics", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  placeId: integer("place_id").references(() => merchantPlaceLinks.id), // 行程卡 ID (null = 商家總計)
  date: date("date").notNull(), // 統計日期
  // 數據指標
  collectedCount: integer("collected_count").default(0).notNull(), // 當日被收錄圖鑑卡人數
  totalCollectors: integer("total_collectors").default(0).notNull(), // 累計已有圖鑑卡人數
  clickCount: integer("click_count").default(0).notNull(), // 圖鑑被點擊次數
  couponUsageCount: integer("coupon_usage_count").default(0).notNull(), // 優惠券總使用次數
  couponIssuedCount: integer("coupon_issued_count").default(0).notNull(), // 優惠券發放數
  prizePoolViews: integer("prize_pool_views").default(0).notNull(), // 被查看獎池人數
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_merchant_analytics_merchant").on(table.merchantId),
  index("IDX_merchant_analytics_place").on(table.placeId),
  index("IDX_merchant_analytics_date").on(table.date),
]);

export const insertMerchantAnalyticsSchema = createInsertSchema(merchantAnalytics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MerchantAnalytics = typeof merchantAnalytics.$inferSelect;
export type InsertMerchantAnalytics = z.infer<typeof insertMerchantAnalyticsSchema>;

// ============ User Inventory System (道具箱) ============

export type InventoryItemType = 'coupon' | 'badge' | 'item';
export type InventoryItemStatus = 'active' | 'expired' | 'redeemed' | 'deleted';

export const INVENTORY_MAX_SLOTS = 30;

export const userInventory = pgTable("user_inventory", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  slotIndex: integer("slot_index").notNull(), // 0-29 for 30 slots
  itemType: varchar("item_type", { length: 20 }).default('coupon').notNull(),
  merchantCouponId: integer("merchant_coupon_id").references(() => merchantCoupons.id), // Link to coupon template
  itemName: text("item_name").notNull(),
  itemDescription: text("item_description"),
  imageUrl: text("image_url"),
  tier: varchar("tier", { length: 10 }), // For coupons: SP, SSR, SR, S, R
  merchantId: integer("merchant_id").references(() => merchants.id),
  merchantName: text("merchant_name"),
  terms: text("terms"),
  content: text("content"),
  validUntil: timestamp("valid_until"),
  status: varchar("status", { length: 20 }).default('active').notNull(), // active, expired, redeemed, deleted
  isRedeemed: boolean("is_redeemed").default(false).notNull(),
  redeemedAt: timestamp("redeemed_at"),
  isExpired: boolean("is_expired").default(false).notNull(),
  isRead: boolean("is_read").default(false).notNull(), // For notification dot
  isDeleted: boolean("is_deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_user_inventory_user").on(table.userId),
  index("IDX_user_inventory_type").on(table.itemType),
  index("IDX_user_inventory_read").on(table.isRead),
  index("IDX_user_inventory_slot").on(table.userId, table.slotIndex),
  index("IDX_user_inventory_status").on(table.status),
]);

export const userInventoryRelations = relations(userInventory, ({ one }) => ({
  user: one(users, {
    fields: [userInventory.userId],
    references: [users.id],
  }),
  merchantCoupon: one(merchantCoupons, {
    fields: [userInventory.merchantCouponId],
    references: [merchantCoupons.id],
  }),
  merchant: one(merchants, {
    fields: [userInventory.merchantId],
    references: [merchants.id],
  }),
}));

export const insertUserInventorySchema = createInsertSchema(userInventory).omit({
  id: true,
  slotIndex: true, // Auto-assigned by storage
  isRedeemed: true,
  redeemedAt: true,
  isExpired: true,
  isRead: true,
  createdAt: true,
});

export type UserInventoryItem = typeof userInventory.$inferSelect;
export type InsertUserInventoryItem = z.infer<typeof insertUserInventorySchema>;

// ============ Coupon Rarity Config (優惠券機率設定) ============

export const couponRarityConfigs = pgTable("coupon_rarity_configs", {
  id: serial("id").primaryKey(),
  configKey: varchar("config_key", { length: 50 }).default('global').notNull().unique(), // 'global' or merchant-specific key
  spRate: integer("sp_rate").default(2).notNull(), // 2%
  ssrRate: integer("ssr_rate").default(8).notNull(), // 8%
  srRate: integer("sr_rate").default(15).notNull(), // 15%
  sRate: integer("s_rate").default(23).notNull(), // 23%
  rRate: integer("r_rate").default(32).notNull(), // 32% (remaining 20% = no coupon)
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCouponRarityConfigSchema = createInsertSchema(couponRarityConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CouponRarityConfig = typeof couponRarityConfigs.$inferSelect;
export type InsertCouponRarityConfig = z.infer<typeof insertCouponRarityConfigSchema>;

// ============ SOS Alerts (安全中心求救) ============

export type SosAlertStatus = 'pending' | 'acknowledged' | 'resolved' | 'cancelled';

export const sosAlerts = pgTable("sos_alerts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  serviceOrderId: integer("service_order_id"), // 關聯的旅程訂單 ID (from trip-planner)
  plannerId: integer("planner_id"), // 負責的旅程策畫師 ID
  location: text("location"), // GPS 座標 (e.g., "25.0330,121.5654")
  locationAddress: text("location_address"), // 可讀地址
  message: text("message"), // 用戶附加訊息
  status: varchar("status", { length: 20 }).default('pending').notNull(), // 'pending' | 'acknowledged' | 'resolved' | 'cancelled'
  acknowledgedBy: varchar("acknowledged_by"), // 處理人員 ID
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_sos_alerts_user").on(table.userId),
  index("IDX_sos_alerts_planner").on(table.plannerId),
  index("IDX_sos_alerts_status").on(table.status),
]);

export const sosAlertsRelations = relations(sosAlerts, ({ one }) => ({
  user: one(users, {
    fields: [sosAlerts.userId],
    references: [users.id],
  }),
}));

export const insertSosAlertSchema = createInsertSchema(sosAlerts).omit({
  id: true,
  status: true,
  acknowledgedBy: true,
  acknowledgedAt: true,
  resolvedAt: true,
  createdAt: true,
});

export type SosAlert = typeof sosAlerts.$inferSelect;
export type InsertSosAlert = z.infer<typeof insertSosAlertSchema>;

// ============ Extended User Profile ============

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  gender: varchar("gender", { length: 20 }),
  birthDate: timestamp("birth_date"),
  phone: varchar("phone", { length: 50 }),
  dietaryRestrictions: text("dietary_restrictions").array(), // 飲食禁忌 (array of tags)
  medicalHistory: text("medical_history").array(), // 疾病史 (array of tags)
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  emergencyContactRelation: text("emergency_contact_relation"),
  preferredLanguage: varchar("preferred_language", { length: 10 }).default('zh'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_user_profiles_user").on(table.userId),
]);

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;

// ============ Extended Merchant Profile ============

export type MerchantTier = 'free' | 'pro' | 'premium';
export type TripCardTier = 'free' | 'pro' | 'premium';

export const merchantProfiles = pgTable("merchant_profiles", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull().unique(),
  ownerName: text("owner_name").notNull(), // 管理者姓名
  businessName: text("business_name").notNull(), // 商家名稱
  taxId: text("tax_id"), // 統編（選填）
  businessCategory: text("business_category").notNull(), // 營業類別
  address: text("address").notNull(), // 地址
  phone: text("phone"), // 電話
  mobile: text("mobile"), // 手機
  email: text("email").notNull(),
  merchantTier: varchar("merchant_tier", { length: 20 }).default('free').notNull(), // free, pro, premium
  tripCardTier: varchar("trip_card_tier", { length: 20 }).default('free').notNull(), // free, pro, premium
  maxTripCards: integer("max_trip_cards").default(1).notNull(), // Based on merchant tier
  maxCouponSchemes: integer("max_coupon_schemes").default(1).notNull(), // Based on trip card tier
  isApproved: boolean("is_approved").default(false).notNull(), // 審核狀態
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_merchant_profiles_merchant").on(table.merchantId),
  index("IDX_merchant_profiles_approved").on(table.isApproved),
]);

export const merchantProfilesRelations = relations(merchantProfiles, ({ one }) => ({
  merchant: one(merchants, {
    fields: [merchantProfiles.merchantId],
    references: [merchants.id],
  }),
  approver: one(users, {
    fields: [merchantProfiles.approvedBy],
    references: [users.id],
  }),
}));

export const insertMerchantProfileSchema = createInsertSchema(merchantProfiles).omit({
  id: true,
  isApproved: true,
  approvedBy: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type MerchantProfile = typeof merchantProfiles.$inferSelect;
export type InsertMerchantProfile = z.infer<typeof insertMerchantProfileSchema>;

// ============ Collection Enhancements ============

// Add read status to collections for notification
export const collectionReadStatus = pgTable("collection_read_status", {
  id: serial("id").primaryKey(),
  collectionId: integer("collection_id").references(() => collections.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  hasPromo: boolean("has_promo").default(false).notNull(), // 商家有優惠資訊
  lastPromoUpdate: timestamp("last_promo_update"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_collection_read_user").on(table.userId),
  index("IDX_collection_read_status").on(table.isRead),
]);

// ============ Coupon Probability Settings (Global) ============

export const couponProbabilitySettings = pgTable("coupon_probability_settings", {
  id: serial("id").primaryKey(),
  tier: varchar("tier", { length: 10 }).notNull().unique(), // SP, SSR, SR, S, R
  probability: doublePrecision("probability").notNull(), // 0.02, 0.08, 0.15, 0.23, 0.32
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCouponProbabilitySettingSchema = createInsertSchema(couponProbabilitySettings).omit({
  id: true,
  updatedAt: true,
});

export type CouponProbabilitySetting = typeof couponProbabilitySettings.$inferSelect;

// ============ Merchant Analytics Tracking (已移至上方) ============
// merchantAnalytics table defined earlier in the file

// ============ Trip Service Purchases ============

export const tripServicePurchases = pgTable("trip_service_purchases", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  purchasedForUserId: varchar("purchased_for_user_id").references(() => users.id), // 為他人購買
  countryId: integer("country_id").references(() => countries.id).notNull(),
  regionId: integer("region_id").references(() => regions.id).notNull(),
  arrivalDate: timestamp("arrival_date").notNull(),
  departureDate: timestamp("departure_date").notNull(),
  dailyPrice: integer("daily_price").default(399).notNull(), // TWD
  totalPrice: integer("total_price").notNull(),
  paymentStatus: varchar("payment_status", { length: 20 }).default('pending').notNull(),
  specialistId: integer("specialist_id").references(() => specialists.id),
  chatRoomId: text("chat_room_id"), // Twilio channel SID
  isLocationSharingEnabled: boolean("is_location_sharing_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_trip_service_user").on(table.userId),
  index("IDX_trip_service_specialist").on(table.specialistId),
  index("IDX_trip_service_dates").on(table.arrivalDate, table.departureDate),
]);

export const tripServicePurchasesRelations = relations(tripServicePurchases, ({ one }) => ({
  user: one(users, {
    fields: [tripServicePurchases.userId],
    references: [users.id],
  }),
  purchasedForUser: one(users, {
    fields: [tripServicePurchases.purchasedForUserId],
    references: [users.id],
  }),
  specialist: one(specialists, {
    fields: [tripServicePurchases.specialistId],
    references: [specialists.id],
  }),
  country: one(countries, {
    fields: [tripServicePurchases.countryId],
    references: [countries.id],
  }),
  region: one(regions, {
    fields: [tripServicePurchases.regionId],
    references: [regions.id],
  }),
}));

export const insertTripServicePurchaseSchema = createInsertSchema(tripServicePurchases).omit({
  id: true,
  paymentStatus: true,
  specialistId: true,
  chatRoomId: true,
  isLocationSharingEnabled: true,
  createdAt: true,
  updatedAt: true,
});

export type TripServicePurchase = typeof tripServicePurchases.$inferSelect;
export type InsertTripServicePurchase = z.infer<typeof insertTripServicePurchaseSchema>;

// ============ User Notification Badges (未讀通知) ============

export const userNotifications = pgTable("user_notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  notificationType: varchar("notification_type", { length: 30 }).notNull(), // 'collection', 'itembox', 'announcement'
  unreadCount: integer("unread_count").default(0).notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_user_notifications_user").on(table.userId),
  index("IDX_user_notifications_type").on(table.notificationType),
]);

export const userNotificationsRelations = relations(userNotifications, ({ one }) => ({
  user: one(users, {
    fields: [userNotifications.userId],
    references: [users.id],
  }),
}));

export type UserNotification = typeof userNotifications.$inferSelect;

// ============ Coupon Redemption Queue (核銷待處理) ============

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  userInventoryId: integer("user_inventory_id").references(() => userInventory.id).notNull(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  redemptionCode: varchar("redemption_code", { length: 20 }).notNull(), // 用戶輸入的核銷碼
  status: varchar("status", { length: 20 }).default('pending').notNull(), // pending, verified, expired
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at").notNull(), // 3 minutes after verification
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_coupon_redemptions_user").on(table.userId),
  index("IDX_coupon_redemptions_status").on(table.status),
  index("IDX_coupon_redemptions_expires").on(table.expiresAt),
]);

export const couponRedemptionsRelations = relations(couponRedemptions, ({ one }) => ({
  user: one(users, {
    fields: [couponRedemptions.userId],
    references: [users.id],
  }),
  userInventoryItem: one(userInventory, {
    fields: [couponRedemptions.userInventoryId],
    references: [userInventory.id],
  }),
  merchant: one(merchants, {
    fields: [couponRedemptions.merchantId],
    references: [merchants.id],
  }),
}));

export const insertCouponRedemptionSchema = createInsertSchema(couponRedemptions).omit({
  id: true,
  status: true,
  verifiedAt: true,
  createdAt: true,
});

export type CouponRedemption = typeof couponRedemptions.$inferSelect;
export type InsertCouponRedemption = z.infer<typeof insertCouponRedemptionSchema>;

// ============ User Daily Gacha Stats (每日抽卡統計) ============

export const userDailyGachaStats = pgTable("user_daily_gacha_stats", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  date: date("date").notNull(), // YYYY-MM-DD format
  pullCount: integer("pull_count").default(0).notNull(), // 當日已抽卡片數
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_user_daily_gacha_user").on(table.userId),
  index("IDX_user_daily_gacha_date").on(table.date),
  uniqueIndex("UQ_user_daily_gacha_user_date").on(table.userId, table.date),
]);

export const userDailyGachaStatsRelations = relations(userDailyGachaStats, ({ one }) => ({
  user: one(users, {
    fields: [userDailyGachaStats.userId],
    references: [users.id],
  }),
}));

export type UserDailyGachaStat = typeof userDailyGachaStats.$inferSelect;

// ============ System Configs (系統設定表) ============

export const systemConfigs = pgTable("system_configs", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 50 }).notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  value: jsonb("value").notNull(),
  valueType: varchar("value_type", { length: 20 }).notNull(),
  defaultValue: jsonb("default_value"),
  label: text("label").notNull(),
  description: text("description"),
  uiType: varchar("ui_type", { length: 20 }),
  uiOptions: jsonb("ui_options"),
  validation: jsonb("validation"),
  editableBy: varchar("editable_by", { length: 20 }).default('admin'),
  isReadOnly: boolean("is_read_only").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by"),
}, (table) => [
  uniqueIndex("UQ_system_configs_category_key").on(table.category, table.key),
]);

export const insertSystemConfigSchema = createInsertSchema(systemConfigs).omit({
  id: true,
  updatedAt: true,
});

export type SystemConfig = typeof systemConfigs.$inferSelect;
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;

// ============ Subscription Plans (官網訂閱方案設定) ============

export type SubscriptionPlanTier = 'free' | 'pro' | 'premium' | 'partner';

export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  tier: varchar("tier", { length: 20 }).notNull().unique(), // 'free' | 'pro' | 'premium' | 'partner'
  name: text("name").notNull(), // 顯示名稱 (e.g., "Pro", "招財貓計畫")
  nameEn: text("name_en"), // 英文名稱
  
  // 價格設定
  priceMonthly: integer("price_monthly").default(0).notNull(), // 月費 (TWD)
  priceYearly: integer("price_yearly"), // 年費 (TWD)，null 表示不提供年繳
  pricePeriodLabel: text("price_period_label").default('/月'), // 價格週期標籤
  
  // UI 顯示
  features: text("features").array().notNull(), // 功能列表 ["3 間店家", "20 張優惠券", ...]
  buttonText: text("button_text").notNull(), // 按鈕文字 "升級 Pro"
  highlighted: boolean("highlighted").default(false), // 是否突顯（推薦）
  highlightLabel: text("highlight_label"), // 突顯標籤 (e.g., "推薦", "最划算")
  
  // 金流對應
  stripeMonthlyPriceId: varchar("stripe_monthly_price_id", { length: 255 }), // Stripe Price ID (月)
  stripeYearlyPriceId: varchar("stripe_yearly_price_id", { length: 255 }), // Stripe Price ID (年)
  recurMonthlyProductId: varchar("recur_monthly_product_id", { length: 255 }), // Recur Product ID (月)
  recurYearlyProductId: varchar("recur_yearly_product_id", { length: 255 }), // Recur Product ID (年)
  
  // 權限配額
  maxPlaces: integer("max_places").default(1).notNull(), // 最大店家數
  maxCoupons: integer("max_coupons").default(5).notNull(), // 最大優惠券數
  hasAdvancedAnalytics: boolean("has_advanced_analytics").default(false), // 進階報表
  hasPriorityExposure: boolean("has_priority_exposure").default(false), // 優先曝光
  hasDedicatedSupport: boolean("has_dedicated_support").default(false), // 專屬客服
  
  // 狀態
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;

// ============ Ad Placements (廣告版位配置 - AdMob) ============

export const adPlacements = pgTable("ad_placements", {
  id: serial("id").primaryKey(),

  // 版位識別
  placement: varchar("placement", { length: 50 }).notNull(), // 'gacha_loading', 'gacha_result', 'collection_detail', 'itembox_open'
  platform: varchar("platform", { length: 20 }).notNull(), // 'ios', 'android', 'web'

  // AdMob 設定
  adUnitId: varchar("ad_unit_id", { length: 255 }), // AdMob Unit ID (如: ca-app-pub-xxx/xxx)
  adType: varchar("ad_type", { length: 30 }).notNull(), // 'banner', 'interstitial', 'rewarded', 'native'

  // 備用/自有廣告 (AdMob 無法載入時顯示)
  fallbackImageUrl: text("fallback_image_url"),
  fallbackLinkUrl: text("fallback_link_url"),
  fallbackTitle: text("fallback_title"),

  // 控制
  isActive: boolean("is_active").default(true).notNull(),
  priority: integer("priority").default(0).notNull(), // 優先級，數字越大越優先
  showProbability: integer("show_probability").default(100).notNull(), // 顯示機率 0-100

  // 時間控制
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_ad_placements_placement").on(table.placement),
  index("IDX_ad_placements_platform").on(table.platform),
  uniqueIndex("UQ_ad_placements_placement_platform").on(table.placement, table.platform),
]);

export const insertAdPlacementSchema = createInsertSchema(adPlacements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AdPlacement = typeof adPlacements.$inferSelect;
export type InsertAdPlacement = z.infer<typeof insertAdPlacementSchema>;

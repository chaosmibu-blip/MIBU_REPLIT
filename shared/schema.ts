import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - supports both OAuth and guest users
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email"),
  name: text("name").notNull(),
  avatar: text("avatar"),
  provider: text("provider"), // 'google', 'replit', 'guest'
  providerId: text("provider_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User's collected places
export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  placeName: text("place_name").notNull(),
  country: text("country").notNull(),
  city: text("city").notNull(),
  rarity: text("rarity").notNull(), // 'R', 'S', 'SR', 'SSR', 'SP'
  category: text("category"),
  description: text("description"),
  isCoupon: boolean("is_coupon").default(false),
  couponData: jsonb("coupon_data"), // {title, code, terms}
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});

// Merchants
export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subscriptionPlan: text("subscription_plan").default('free').notNull(), // 'free', 'partner', 'premium'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Merchant coupons
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  placeName: text("place_name").notNull(),
  title: text("title").notNull(),
  code: text("code").notNull(),
  terms: text("terms"),
  rarity: text("rarity").notNull(),
  remainingQuantity: integer("remaining_quantity").default(0).notNull(),
  redeemedCount: integer("redeemed_count").default(0).notNull(),
  impressionCount: integer("impression_count").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
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

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

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

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Collection = typeof collections.$inferSelect;

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof coupons.$inferSelect;

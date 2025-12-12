import { pgTable, text, varchar, serial, timestamp, integer, boolean, date, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "../../../shared/schema";

export const tripPlans = pgTable("trip_plans", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  destination: text("destination").notNull(),
  destinationDistrict: text("destination_district"),
  destinationCity: text("destination_city"),
  destinationCountry: text("destination_country"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
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
  date: date("date").notNull(),
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

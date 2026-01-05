import { db } from "../db";
import { eq, and, desc, or, isNull, lt, lte, gte } from "drizzle-orm";
import {
  announcements,
  adPlacements,
  userNotifications,
  type Announcement,
  type InsertAnnouncement,
  type AnnouncementType,
  type AdPlacementRecord,
  type InsertAdPlacement,
  type UserNotification,
} from "@shared/schema";

export const adminStorage = {
  async createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement> {
    const [created] = await db.insert(announcements).values(announcement).returning();
    return created;
  },

  async getAnnouncementById(id: number): Promise<Announcement | undefined> {
    const [announcement] = await db.select().from(announcements).where(eq(announcements.id, id));
    return announcement || undefined;
  },

  async getAllAnnouncements(): Promise<Announcement[]> {
    return db.select().from(announcements).orderBy(desc(announcements.priority), desc(announcements.createdAt));
  },

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
  },

  async updateAnnouncement(id: number, data: Partial<Announcement>): Promise<Announcement | undefined> {
    const [updated] = await db
      .update(announcements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return updated || undefined;
  },

  async deleteAnnouncement(id: number): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  },

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
  },

  async getAllAdPlacements(): Promise<AdPlacementRecord[]> {
    return db.select().from(adPlacements).orderBy(adPlacements.placementKey);
  },

  async getAdPlacement(placementKey: string, platform?: string): Promise<AdPlacementRecord | undefined> {
    const conditions = [eq(adPlacements.placementKey, placementKey), eq(adPlacements.isActive, true)];
    if (platform && platform !== 'all') {
      conditions.push(or(eq(adPlacements.platform, platform), eq(adPlacements.platform, 'all'))!);
    }
    const [placement] = await db.select().from(adPlacements).where(and(...conditions));
    return placement || undefined;
  },

  async createAdPlacement(placement: InsertAdPlacement): Promise<AdPlacementRecord> {
    const [created] = await db.insert(adPlacements).values(placement).returning();
    return created;
  },

  async updateAdPlacement(id: number, data: Partial<AdPlacementRecord>): Promise<AdPlacementRecord | undefined> {
    const [updated] = await db.update(adPlacements).set({ ...data, updatedAt: new Date() }).where(eq(adPlacements.id, id)).returning();
    return updated || undefined;
  },

  async deleteAdPlacement(id: number): Promise<void> {
    await db.delete(adPlacements).where(eq(adPlacements.id, id));
  },

  async getUserNotifications(userId: string): Promise<UserNotification[]> {
    return db.select().from(userNotifications).where(eq(userNotifications.userId, userId));
  },

  async markNotificationsSeen(userId: string, notificationType: string): Promise<void> {
    await db.update(userNotifications)
      .set({ unreadCount: 0, lastSeenAt: new Date() })
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.notificationType, notificationType)));
  },
};

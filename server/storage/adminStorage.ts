import { db } from "../db";
import { eq, and, desc, or, isNull, lt, lte, gte } from "drizzle-orm";
import {
  announcements,
  userNotifications,
  type Announcement,
  type InsertAnnouncement,
  type AnnouncementType,
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

  async getUserNotifications(userId: string): Promise<UserNotification[]> {
    return db.select().from(userNotifications).where(eq(userNotifications.userId, userId));
  },

  async markNotificationsSeen(userId: string, notificationType: string): Promise<void> {
    await db.update(userNotifications)
      .set({ unreadCount: 0, lastSeenAt: new Date() })
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.notificationType, notificationType)));
  },
};

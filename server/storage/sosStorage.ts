import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  users,
  userLocations,
  sosAlerts,
  serviceOrders,
  type User,
  type UserLocation,
  type SosAlert,
  type InsertSosAlert,
  type SosAlertStatus,
} from "@shared/schema";

export const sosStorage = {
  async getUserLocation(userId: string): Promise<UserLocation | undefined> {
    const [location] = await db.select().from(userLocations).where(eq(userLocations.userId, userId));
    return location;
  },

  async updateUserLocation(userId: string, lat: number, lon: number, isSharingEnabled: boolean, sosMode?: boolean): Promise<UserLocation> {
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
  },

  async setSosMode(userId: string, enabled: boolean): Promise<UserLocation | undefined> {
    const [location] = await db
      .update(userLocations)
      .set({ sosMode: enabled, updatedAt: new Date() })
      .where(eq(userLocations.userId, userId))
      .returning();
    return location;
  },

  async getUserBySosKey(sosKey: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.sosSecretKey, sosKey));
    return user;
  },

  async generateSosKey(userId: string): Promise<string> {
    const key = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    await db
      .update(users)
      .set({ sosSecretKey: key, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return key;
  },

  async createSosAlert(data: InsertSosAlert): Promise<SosAlert> {
    const [alert] = await db.insert(sosAlerts).values(data).returning();
    return alert;
  },

  async getSosAlertById(alertId: number): Promise<SosAlert | undefined> {
    const [alert] = await db.select().from(sosAlerts).where(eq(sosAlerts.id, alertId));
    return alert || undefined;
  },

  async getUserSosAlerts(userId: string): Promise<SosAlert[]> {
    return db.select().from(sosAlerts)
      .where(eq(sosAlerts.userId, userId))
      .orderBy(desc(sosAlerts.createdAt));
  },

  async getPlannerSosAlerts(plannerId: number): Promise<SosAlert[]> {
    return db.select().from(sosAlerts)
      .where(eq(sosAlerts.plannerId, plannerId))
      .orderBy(desc(sosAlerts.createdAt));
  },

  async getPendingSosAlerts(): Promise<SosAlert[]> {
    return db.select().from(sosAlerts)
      .where(eq(sosAlerts.status, 'pending'))
      .orderBy(desc(sosAlerts.createdAt));
  },

  async updateSosAlertStatus(alertId: number, status: SosAlertStatus, acknowledgedBy?: string): Promise<SosAlert | undefined> {
    const updateData: Partial<SosAlert> = { status };
    
    if (status === 'acknowledged' && acknowledgedBy) {
      updateData.acknowledgedBy = acknowledgedBy;
      updateData.acknowledgedAt = new Date();
    } else if (status === 'resolved') {
      updateData.resolvedAt = new Date();
    }
    
    const [alert] = await db.update(sosAlerts)
      .set(updateData)
      .where(eq(sosAlerts.id, alertId))
      .returning();
    return alert || undefined;
  },

  async hasUserPurchasedTripService(userId: string): Promise<boolean> {
    const [order] = await db.select({ id: serviceOrders.id })
      .from(serviceOrders)
      .where(and(
        eq(serviceOrders.userId, userId),
        eq(serviceOrders.status, 'completed')
      ));
    return !!order;
  },
};

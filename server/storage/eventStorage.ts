import { db } from "../db";
import { eventSources, events, type Event, type EventSource } from "@shared/schema";
import { eq, and, desc, asc, gte, lte, or, ilike, sql } from "drizzle-orm";

export const eventStorage = {
  // ============ Event Sources ============

  async createEventSource(data: {
    name: string;
    url: string;
    sourceType: string;
    description?: string;
    crawlSelector?: string;
    createdBy?: string;
  }): Promise<EventSource> {
    const [source] = await db
      .insert(eventSources)
      .values(data)
      .returning();
    return source;
  },

  async updateEventSource(id: number, data: Partial<EventSource>): Promise<EventSource | undefined> {
    const [source] = await db
      .update(eventSources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(eventSources.id, id))
      .returning();
    return source;
  },

  async getEventSource(id: number): Promise<EventSource | undefined> {
    const [source] = await db
      .select()
      .from(eventSources)
      .where(eq(eventSources.id, id));
    return source;
  },

  async getActiveEventSources(): Promise<EventSource[]> {
    return await db
      .select()
      .from(eventSources)
      .where(eq(eventSources.isActive, true))
      .orderBy(asc(eventSources.name));
  },

  async getAllEventSources(): Promise<EventSource[]> {
    return await db
      .select()
      .from(eventSources)
      .orderBy(desc(eventSources.createdAt));
  },

  async deleteEventSource(id: number): Promise<boolean> {
    const result = await db
      .delete(eventSources)
      .where(eq(eventSources.id, id));
    return true;
  },

  async updateCrawlStatus(id: number, status: string, error?: string): Promise<void> {
    await db
      .update(eventSources)
      .set({
        lastCrawledAt: new Date(),
        lastCrawlStatus: status,
        lastCrawlError: error || null,
        updatedAt: new Date(),
      })
      .where(eq(eventSources.id, id));
  },

  // ============ Events ============

  async createEvent(data: {
    title: string;
    description?: string;
    eventType: string;
    location?: string;
    locationCity?: string;
    locationDistrict?: string;
    locationLat?: number;
    locationLng?: number;
    startDate?: Date;
    endDate?: Date;
    imageUrl?: string;
    sourceUrl?: string;
    sourceId?: number;
    externalId?: string;
    status?: string;
    priority?: number;
    isSticky?: boolean;
    createdBy?: string;
    createdByType?: string;
  }): Promise<Event> {
    const [event] = await db
      .insert(events)
      .values(data)
      .returning();
    return event;
  },

  async updateEvent(id: number, data: Partial<Event>): Promise<Event | undefined> {
    const [event] = await db
      .update(events)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return event;
  },

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, id));
    return event;
  },

  async getEventByExternalId(sourceId: number, externalId: string): Promise<Event | undefined> {
    const [event] = await db
      .select()
      .from(events)
      .where(and(
        eq(events.sourceId, sourceId),
        eq(events.externalId, externalId)
      ));
    return event;
  },

  async getApprovedEvents(options: {
    eventType?: string;
    city?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Event[]> {
    const { eventType, city, limit = 20, offset = 0 } = options;

    const conditions = [
      eq(events.status, "approved"),
      or(
        gte(events.endDate, new Date()),
        sql`${events.endDate} IS NULL`
      ),
    ];

    if (eventType) {
      conditions.push(eq(events.eventType, eventType));
    }
    if (city) {
      conditions.push(eq(events.locationCity, city));
    }

    return await db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.isSticky), desc(events.priority), asc(events.startDate))
      .limit(limit)
      .offset(offset);
  },

  async getPendingEvents(limit: number = 50): Promise<Event[]> {
    return await db
      .select()
      .from(events)
      .where(eq(events.status, "pending"))
      .orderBy(desc(events.createdAt))
      .limit(limit);
  },

  async getAllEventsAdmin(options: {
    status?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ events: Event[]; total: number }> {
    const { status, eventType, limit = 20, offset = 0 } = options;

    const conditions = [];
    if (status) conditions.push(eq(events.status, status));
    if (eventType) conditions.push(eq(events.eventType, eventType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [eventList, countResult] = await Promise.all([
      db
        .select()
        .from(events)
        .where(whereClause)
        .orderBy(desc(events.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(events)
        .where(whereClause),
    ]);

    return {
      events: eventList,
      total: Number(countResult[0]?.count || 0),
    };
  },

  async approveEvent(id: number, reviewedBy: string): Promise<Event | undefined> {
    const [event] = await db
      .update(events)
      .set({
        status: "approved",
        reviewedBy,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();
    return event;
  },

  async rejectEvent(id: number, reviewedBy: string, reason?: string): Promise<Event | undefined> {
    const [event] = await db
      .update(events)
      .set({
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();
    return event;
  },

  async deleteEvent(id: number): Promise<boolean> {
    await db.delete(events).where(eq(events.id, id));
    return true;
  },

  async incrementViewCount(id: number): Promise<void> {
    await db
      .update(events)
      .set({
        viewCount: sql`${events.viewCount} + 1`,
      })
      .where(eq(events.id, id));
  },

  async expireOldEvents(): Promise<number> {
    const result = await db
      .update(events)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(and(
        eq(events.status, "approved"),
        lte(events.endDate, new Date())
      ))
      .returning();
    return result.length;
  },

  async getEventStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    byType: { type: string; count: number }[];
  }> {
    const [total, pending, approved, rejected, byType] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(events),
      db.select({ count: sql<number>`count(*)` }).from(events).where(eq(events.status, "pending")),
      db.select({ count: sql<number>`count(*)` }).from(events).where(eq(events.status, "approved")),
      db.select({ count: sql<number>`count(*)` }).from(events).where(eq(events.status, "rejected")),
      db
        .select({
          type: events.eventType,
          count: sql<number>`count(*)`,
        })
        .from(events)
        .groupBy(events.eventType),
    ]);

    return {
      total: Number(total[0]?.count || 0),
      pending: Number(pending[0]?.count || 0),
      approved: Number(approved[0]?.count || 0),
      rejected: Number(rejected[0]?.count || 0),
      byType: byType.map(t => ({ type: t.type, count: Number(t.count) })),
    };
  },
};

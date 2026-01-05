import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  specialists,
  serviceRelations,
  type Specialist,
  type InsertSpecialist,
  type ServiceRelation,
  type InsertServiceRelation,
} from "@shared/schema";

export const specialistStorage = {
  async getSpecialistByUserId(userId: string): Promise<Specialist | undefined> {
    const [specialist] = await db.select().from(specialists).where(eq(specialists.userId, userId));
    return specialist || undefined;
  },

  async getSpecialistById(id: number): Promise<Specialist | undefined> {
    const [specialist] = await db.select().from(specialists).where(eq(specialists.id, id));
    return specialist || undefined;
  },

  async createSpecialist(specialist: InsertSpecialist): Promise<Specialist> {
    const [created] = await db.insert(specialists).values(specialist).returning();
    return created;
  },

  async updateSpecialist(id: number, data: Partial<Specialist>): Promise<Specialist | undefined> {
    const [updated] = await db.update(specialists).set(data).where(eq(specialists.id, id)).returning();
    return updated || undefined;
  },

  async getActiveSpecialistsByRegion(serviceRegion: string): Promise<Specialist[]> {
    return await db.select().from(specialists).where(
      and(
        eq(specialists.isAvailable, true),
        eq(specialists.serviceRegion, serviceRegion)
      )
    );
  },

  async findAvailableSpecialist(serviceRegion: string): Promise<Specialist | undefined> {
    const [specialist] = await db
      .select()
      .from(specialists)
      .where(
        and(
          eq(specialists.isAvailable, true),
          eq(specialists.serviceRegion, serviceRegion),
          sql`${specialists.currentTravelers} < ${specialists.maxTravelers}`
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return specialist || undefined;
  },

  async createServiceRelation(relation: InsertServiceRelation): Promise<ServiceRelation> {
    const [created] = await db.insert(serviceRelations).values(relation).returning();
    return created;
  },

  async getServiceRelationById(id: number): Promise<ServiceRelation | undefined> {
    const [relation] = await db.select().from(serviceRelations).where(eq(serviceRelations.id, id));
    return relation || undefined;
  },

  async getActiveServiceRelationByTraveler(travelerId: string): Promise<ServiceRelation | undefined> {
    const [relation] = await db
      .select()
      .from(serviceRelations)
      .where(
        and(
          eq(serviceRelations.travelerId, travelerId),
          eq(serviceRelations.status, 'active')
        )
      );
    return relation || undefined;
  },

  async getActiveServiceRelationsBySpecialist(specialistId: number): Promise<ServiceRelation[]> {
    return await db
      .select()
      .from(serviceRelations)
      .where(
        and(
          eq(serviceRelations.specialistId, specialistId),
          eq(serviceRelations.status, 'active')
        )
      );
  },

  async updateServiceRelation(id: number, data: Partial<ServiceRelation>): Promise<ServiceRelation | undefined> {
    const [updated] = await db.update(serviceRelations).set(data).where(eq(serviceRelations.id, id)).returning();
    return updated || undefined;
  },

  async endServiceRelation(id: number, rating?: number): Promise<ServiceRelation | undefined> {
    const updateData: Partial<ServiceRelation> = {
      status: 'completed',
      endedAt: new Date(),
    };
    const [updated] = await db.update(serviceRelations).set(updateData).where(eq(serviceRelations.id, id)).returning();
    return updated || undefined;
  },
};

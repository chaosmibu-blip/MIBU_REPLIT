import { db } from "../../../server/db";
import { eq, and, desc } from "drizzle-orm";
import { 
  tripPlans, tripDays, tripActivities, 
  InsertTripPlan, InsertTripDay, InsertTripActivity, 
  TripPlan, TripDay, TripActivity 
} from "@shared/schema";

class TripPlannerStorage {
  async getUserTripPlans(userId: string): Promise<TripPlan[]> {
    return db
      .select()
      .from(tripPlans)
      .where(eq(tripPlans.userId, userId))
      .orderBy(desc(tripPlans.createdAt));
  }

  async getTripPlan(planId: number, userId: string): Promise<TripPlan | undefined> {
    const [plan] = await db
      .select()
      .from(tripPlans)
      .where(and(eq(tripPlans.id, planId), eq(tripPlans.userId, userId)));
    return plan;
  }

  async getTripPlanWithDetails(planId: number, userId: string): Promise<{
    plan: TripPlan;
    days: Array<TripDay & { activities: TripActivity[] }>;
  } | undefined> {
    const plan = await this.getTripPlan(planId, userId);
    if (!plan) return undefined;

    const days = await db
      .select()
      .from(tripDays)
      .where(eq(tripDays.tripPlanId, planId))
      .orderBy(tripDays.dayNumber);

    const daysWithActivities = await Promise.all(
      days.map(async (day) => {
        const activities = await db
          .select()
          .from(tripActivities)
          .where(eq(tripActivities.tripDayId, day.id))
          .orderBy(tripActivities.orderIndex);
        return { ...day, activities };
      })
    );

    return { plan, days: daysWithActivities };
  }

  async createTripPlan(data: InsertTripPlan): Promise<TripPlan> {
    const [plan] = await db
      .insert(tripPlans)
      .values(data)
      .returning();

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const dayCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    for (let i = 0; i < dayCount; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + i);
      await db.insert(tripDays).values({
        tripPlanId: plan.id,
        dayNumber: i + 1,
        date: dayDate.toISOString().split('T')[0],
      });
    }

    return plan;
  }

  async updateTripPlan(planId: number, userId: string, data: Partial<TripPlan>): Promise<TripPlan | undefined> {
    const [updated] = await db
      .update(tripPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tripPlans.id, planId), eq(tripPlans.userId, userId)))
      .returning();
    return updated;
  }

  async deleteTripPlan(planId: number, userId: string): Promise<boolean> {
    const days = await db
      .select({ id: tripDays.id })
      .from(tripDays)
      .where(eq(tripDays.tripPlanId, planId));

    for (const day of days) {
      await db.delete(tripActivities).where(eq(tripActivities.tripDayId, day.id));
    }
    await db.delete(tripDays).where(eq(tripDays.tripPlanId, planId));
    
    await db
      .delete(tripPlans)
      .where(and(eq(tripPlans.id, planId), eq(tripPlans.userId, userId)));
    
    return true;
  }

  async addActivity(data: InsertTripActivity): Promise<TripActivity> {
    const existingActivities = await db
      .select({ orderIndex: tripActivities.orderIndex })
      .from(tripActivities)
      .where(eq(tripActivities.tripDayId, data.tripDayId))
      .orderBy(desc(tripActivities.orderIndex))
      .limit(1);

    const newOrderIndex = existingActivities.length > 0 ? existingActivities[0].orderIndex + 1 : 0;

    const [activity] = await db
      .insert(tripActivities)
      .values({ ...data, orderIndex: newOrderIndex })
      .returning();
    return activity;
  }

  async updateActivity(activityId: number, data: Partial<TripActivity>): Promise<TripActivity | undefined> {
    const [updated] = await db
      .update(tripActivities)
      .set(data)
      .where(eq(tripActivities.id, activityId))
      .returning();
    return updated;
  }

  async deleteActivity(activityId: number): Promise<void> {
    await db.delete(tripActivities).where(eq(tripActivities.id, activityId));
  }

  async reorderActivities(dayId: number, activityIds: number[]): Promise<void> {
    for (let i = 0; i < activityIds.length; i++) {
      await db
        .update(tripActivities)
        .set({ orderIndex: i })
        .where(eq(tripActivities.id, activityIds[i]));
    }
  }
}

export const tripPlannerStorage = new TripPlannerStorage();

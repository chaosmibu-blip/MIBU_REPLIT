import { db } from "../../../server/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { 
  planners, servicePlans, serviceOrders,
  InsertPlanner, InsertServicePlan, InsertServiceOrder,
  Planner, ServicePlan, ServiceOrder
} from "../../../shared/schema";

class PlannerServiceStorage {
  async getAvailablePlanners(): Promise<Planner[]> {
    return db
      .select()
      .from(planners)
      .where(and(eq(planners.isAvailable, true), eq(planners.isVerified, true)))
      .orderBy(planners.totalOrders);
  }

  async getPlanner(plannerId: number): Promise<Planner | undefined> {
    const [planner] = await db
      .select()
      .from(planners)
      .where(eq(planners.id, plannerId));
    return planner;
  }

  async getPlannerByUserId(userId: string): Promise<Planner | undefined> {
    const [planner] = await db
      .select()
      .from(planners)
      .where(eq(planners.userId, userId));
    return planner;
  }

  async createPlanner(data: InsertPlanner): Promise<Planner> {
    const [planner] = await db
      .insert(planners)
      .values(data)
      .returning();
    return planner;
  }

  async updatePlanner(plannerId: number, data: Partial<Planner>): Promise<Planner | undefined> {
    const [updated] = await db
      .update(planners)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(planners.id, plannerId))
      .returning();
    return updated;
  }

  async findAvailablePlanner(): Promise<Planner | undefined> {
    const [planner] = await db
      .select()
      .from(planners)
      .where(and(eq(planners.isAvailable, true), eq(planners.isVerified, true)))
      .orderBy(planners.totalOrders)
      .limit(1);
    return planner;
  }

  async getActiveServicePlans(): Promise<ServicePlan[]> {
    return db
      .select()
      .from(servicePlans)
      .where(eq(servicePlans.isActive, true))
      .orderBy(servicePlans.sortOrder);
  }

  async getServicePlan(planId: number): Promise<ServicePlan | undefined> {
    const [plan] = await db
      .select()
      .from(servicePlans)
      .where(eq(servicePlans.id, planId));
    return plan;
  }

  async getServicePlanByCode(code: string): Promise<ServicePlan | undefined> {
    const [plan] = await db
      .select()
      .from(servicePlans)
      .where(eq(servicePlans.code, code));
    return plan;
  }

  async createServicePlan(data: InsertServicePlan): Promise<ServicePlan> {
    const [plan] = await db
      .insert(servicePlans)
      .values(data)
      .returning();
    return plan;
  }

  async generateOrderNumber(): Promise<string> {
    const date = new Date();
    const prefix = `TP${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${random}`;
  }

  async createOrder(data: InsertServiceOrder): Promise<ServiceOrder> {
    const orderNumber = await this.generateOrderNumber();
    const [order] = await db
      .insert(serviceOrders)
      .values({ ...data, orderNumber })
      .returning();
    return order;
  }

  async getOrder(orderId: number): Promise<ServiceOrder | undefined> {
    const [order] = await db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.id, orderId));
    return order;
  }

  async getOrderByNumber(orderNumber: string): Promise<ServiceOrder | undefined> {
    const [order] = await db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.orderNumber, orderNumber));
    return order;
  }

  async getUserOrders(userId: string): Promise<ServiceOrder[]> {
    return db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.userId, userId))
      .orderBy(desc(serviceOrders.createdAt));
  }

  async getPlannerOrders(plannerId: number): Promise<ServiceOrder[]> {
    return db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.plannerId, plannerId))
      .orderBy(desc(serviceOrders.createdAt));
  }

  async updateOrder(orderId: number, data: Partial<ServiceOrder>): Promise<ServiceOrder | undefined> {
    const [updated] = await db
      .update(serviceOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(serviceOrders.id, orderId))
      .returning();
    return updated;
  }

  async assignPlannerToOrder(orderId: number, plannerId: number): Promise<ServiceOrder | undefined> {
    return this.updateOrder(orderId, {
      plannerId,
      status: 'assigned',
      assignedAt: new Date(),
    });
  }

  async incrementPlannerOrderCount(plannerId: number): Promise<void> {
    await db
      .update(planners)
      .set({ 
        totalOrders: sql`${planners.totalOrders} + 1`,
        updatedAt: new Date() 
      })
      .where(eq(planners.id, plannerId));
  }
}

export const plannerServiceStorage = new PlannerServiceStorage();

import { db } from "../../../server/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { 
  planners, servicePlans, serviceOrders, travelCompanions, companionInvites,
  InsertPlanner, InsertServicePlan, InsertServiceOrder, InsertTravelCompanion, InsertCompanionInvite,
  Planner, ServicePlan, ServiceOrder, TravelCompanion, CompanionInvite
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

  // ============ Travel Companions Methods ============

  async getOrderCompanions(orderId: number): Promise<TravelCompanion[]> {
    return db
      .select()
      .from(travelCompanions)
      .where(and(eq(travelCompanions.orderId, orderId), eq(travelCompanions.status, 'active')));
  }

  async addCompanion(data: InsertTravelCompanion): Promise<TravelCompanion> {
    const [companion] = await db
      .insert(travelCompanions)
      .values(data)
      .returning();
    return companion;
  }

  async removeCompanion(companionId: number): Promise<void> {
    await db
      .update(travelCompanions)
      .set({ status: 'removed' })
      .where(eq(travelCompanions.id, companionId));
  }

  async isUserCompanionOfOrder(orderId: number, userId: string): Promise<boolean> {
    const [companion] = await db
      .select()
      .from(travelCompanions)
      .where(and(
        eq(travelCompanions.orderId, orderId),
        eq(travelCompanions.userId, userId),
        eq(travelCompanions.status, 'active')
      ));
    return !!companion;
  }

  async getUserAccessibleOrders(userId: string): Promise<ServiceOrder[]> {
    const ownOrders = await this.getUserOrders(userId);
    
    const companionOrders = await db
      .select({ order: serviceOrders })
      .from(travelCompanions)
      .innerJoin(serviceOrders, eq(travelCompanions.orderId, serviceOrders.id))
      .where(and(
        eq(travelCompanions.userId, userId),
        eq(travelCompanions.status, 'active')
      ));
    
    const companionOrdersList = companionOrders.map(r => r.order);
    const allOrders = [...ownOrders, ...companionOrdersList];
    
    const uniqueOrders = allOrders.filter((order, index, self) => 
      index === self.findIndex(o => o.id === order.id)
    );
    
    return uniqueOrders.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // ============ Companion Invites Methods ============

  generateInviteCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  async createInvite(data: Omit<InsertCompanionInvite, 'inviteCode'>): Promise<CompanionInvite> {
    const inviteCode = this.generateInviteCode();
    const [invite] = await db
      .insert(companionInvites)
      .values({ ...data, inviteCode })
      .returning();
    return invite;
  }

  async getInviteByCode(inviteCode: string): Promise<CompanionInvite | undefined> {
    const [invite] = await db
      .select()
      .from(companionInvites)
      .where(eq(companionInvites.inviteCode, inviteCode));
    return invite;
  }

  async getOrderInvites(orderId: number): Promise<CompanionInvite[]> {
    return db
      .select()
      .from(companionInvites)
      .where(eq(companionInvites.orderId, orderId))
      .orderBy(desc(companionInvites.createdAt));
  }

  async updateInvite(inviteId: number, data: Partial<CompanionInvite>): Promise<CompanionInvite | undefined> {
    const [updated] = await db
      .update(companionInvites)
      .set(data)
      .where(eq(companionInvites.id, inviteId))
      .returning();
    return updated;
  }

  async acceptInvite(inviteCode: string, userId: string): Promise<{ success: boolean; error?: string; orderId?: number }> {
    const invite = await this.getInviteByCode(inviteCode);
    
    if (!invite) {
      return { success: false, error: '邀請碼無效' };
    }
    
    if (invite.status !== 'pending') {
      return { success: false, error: '邀請已被使用或已取消' };
    }
    
    if (new Date() > invite.expiresAt) {
      await this.updateInvite(invite.id, { status: 'expired' });
      return { success: false, error: '邀請已過期' };
    }

    const isAlreadyCompanion = await this.isUserCompanionOfOrder(invite.orderId, userId);
    if (isAlreadyCompanion) {
      return { success: false, error: '您已經是這個行程的旅伴了' };
    }

    const order = await this.getOrder(invite.orderId);
    if (!order) {
      return { success: false, error: '訂單不存在' };
    }
    
    if (order.userId === userId) {
      return { success: false, error: '您是這個行程的購買者，不需要接受邀請' };
    }

    await this.addCompanion({
      orderId: invite.orderId,
      userId,
      role: 'companion',
      status: 'active',
    });

    await this.updateInvite(invite.id, { 
      status: 'accepted',
      inviteeUserId: userId,
    });

    return { success: true, orderId: invite.orderId };
  }

  async revokeInvite(inviteId: number, userId: string): Promise<boolean> {
    const [invite] = await db
      .select()
      .from(companionInvites)
      .where(eq(companionInvites.id, inviteId));
    
    if (!invite || invite.inviterUserId !== userId) {
      return false;
    }

    await this.updateInvite(inviteId, { status: 'revoked' });
    return true;
  }
}

export const plannerServiceStorage = new PlannerServiceStorage();

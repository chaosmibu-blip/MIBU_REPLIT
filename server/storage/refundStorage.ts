import { eq, desc, and } from "drizzle-orm";
import { db } from "../db";
import { refundRequests, InsertRefundRequest, RefundRequest, RefundRequestStatus } from "@shared/schema";

export const refundStorage = {
  async createRefundRequest(data: InsertRefundRequest): Promise<RefundRequest> {
    const [request] = await db.insert(refundRequests).values(data).returning();
    return request;
  },

  async getRefundRequestById(id: number): Promise<RefundRequest | null> {
    const [request] = await db.select().from(refundRequests).where(eq(refundRequests.id, id));
    return request || null;
  },

  async getRefundRequestsByMerchant(merchantId: number): Promise<RefundRequest[]> {
    return db.select().from(refundRequests)
      .where(eq(refundRequests.merchantId, merchantId))
      .orderBy(desc(refundRequests.createdAt));
  },

  async getRefundRequestsBySubscription(subscriptionId: number): Promise<RefundRequest[]> {
    return db.select().from(refundRequests)
      .where(eq(refundRequests.subscriptionId, subscriptionId))
      .orderBy(desc(refundRequests.createdAt));
  },

  async getPendingRefundRequests(): Promise<RefundRequest[]> {
    return db.select().from(refundRequests)
      .where(eq(refundRequests.status, 'manual_review'))
      .orderBy(desc(refundRequests.createdAt));
  },

  async updateRefundRequest(
    id: number, 
    data: Partial<Omit<RefundRequest, 'id' | 'createdAt'>>
  ): Promise<RefundRequest | null> {
    const [updated] = await db.update(refundRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(refundRequests.id, id))
      .returning();
    return updated || null;
  },

  async markAsProcessed(
    id: number, 
    processedBy: string, 
    adminNotes?: string
  ): Promise<RefundRequest | null> {
    return this.updateRefundRequest(id, {
      status: 'processed' as RefundRequestStatus,
      processedBy,
      processedAt: new Date(),
      adminNotes,
    });
  },
};

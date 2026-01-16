/**
 * 募資系統 Storage
 * 處理募資活動、貢獻相關的資料存取
 */

import { eq, and, desc, sql, gte, ne } from "drizzle-orm";
import { db } from "../db";
import {
  crowdfundCampaigns,
  crowdfundContributions,
  type CrowdfundCampaign,
  type CrowdfundContribution,
} from "../../shared/schema";

// ============ 募資活動 ============

export async function getAllCampaigns(): Promise<CrowdfundCampaign[]> {
  return db.select().from(crowdfundCampaigns).orderBy(desc(crowdfundCampaigns.createdAt));
}

export async function getCampaignsByStatus(status: string): Promise<CrowdfundCampaign[]> {
  return db.select().from(crowdfundCampaigns)
    .where(eq(crowdfundCampaigns.status, status))
    .orderBy(desc(crowdfundCampaigns.createdAt));
}

export async function getActiveCampaigns(): Promise<CrowdfundCampaign[]> {
  return db.select().from(crowdfundCampaigns)
    .where(eq(crowdfundCampaigns.status, "active"))
    .orderBy(desc(crowdfundCampaigns.createdAt));
}

export async function getCampaignById(id: number): Promise<CrowdfundCampaign | undefined> {
  const [result] = await db.select().from(crowdfundCampaigns).where(eq(crowdfundCampaigns.id, id));
  return result;
}

export async function getCampaignByCountryCode(countryCode: string): Promise<CrowdfundCampaign | undefined> {
  const [result] = await db.select().from(crowdfundCampaigns)
    .where(eq(crowdfundCampaigns.countryCode, countryCode.toUpperCase()));
  return result;
}

export async function createCampaign(data: {
  countryCode: string;
  countryNameZh: string;
  countryNameEn: string;
  goalAmount: number;
  estimatedPlaces?: number;
  startDate: Date;
  endDate?: Date;
  description?: string;
  descriptionEn?: string;
  imageUrl?: string;
}): Promise<CrowdfundCampaign> {
  const [result] = await db.insert(crowdfundCampaigns).values({
    ...data,
    countryCode: data.countryCode.toUpperCase(),
    status: "upcoming",
  }).returning();
  return result;
}

export async function updateCampaign(id: number, data: Partial<Pick<CrowdfundCampaign, 'status' | 'goalAmount' | 'startDate' | 'endDate' | 'description' | 'descriptionEn' | 'imageUrl' | 'launchedAt'>>): Promise<CrowdfundCampaign | undefined> {
  const [result] = await db.update(crowdfundCampaigns)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(crowdfundCampaigns.id, id))
    .returning();
  return result;
}

export async function updateCampaignProgress(campaignId: number, amount: number): Promise<CrowdfundCampaign | undefined> {
  // 原子操作：增加金額和人數
  const [result] = await db.update(crowdfundCampaigns)
    .set({
      currentAmount: sql`${crowdfundCampaigns.currentAmount} + ${amount}`,
      contributorCount: sql`${crowdfundCampaigns.contributorCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(crowdfundCampaigns.id, campaignId))
    .returning();

  // 檢查是否達標
  if (result && result.currentAmount >= result.goalAmount && result.status === "active") {
    await updateCampaign(campaignId, { status: "completed" });
    return { ...result, status: "completed" };
  }

  return result;
}

// ============ 募資貢獻 ============

export async function getContributionsByCampaign(campaignId: number, limit = 50): Promise<CrowdfundContribution[]> {
  return db.select().from(crowdfundContributions)
    .where(and(
      eq(crowdfundContributions.campaignId, campaignId),
      eq(crowdfundContributions.status, "verified")
    ))
    .orderBy(desc(crowdfundContributions.createdAt))
    .limit(limit);
}

export async function getContributionsByUser(userId: string): Promise<(CrowdfundContribution & { campaign: CrowdfundCampaign })[]> {
  return db.select({
    id: crowdfundContributions.id,
    campaignId: crowdfundContributions.campaignId,
    userId: crowdfundContributions.userId,
    email: crowdfundContributions.email,
    displayName: crowdfundContributions.displayName,
    amount: crowdfundContributions.amount,
    paymentMethod: crowdfundContributions.paymentMethod,
    transactionId: crowdfundContributions.transactionId,
    receiptData: crowdfundContributions.receiptData,
    stripeSessionId: crowdfundContributions.stripeSessionId,
    status: crowdfundContributions.status,
    priorityAccessUsed: crowdfundContributions.priorityAccessUsed,
    priorityAccessExpiresAt: crowdfundContributions.priorityAccessExpiresAt,
    createdAt: crowdfundContributions.createdAt,
    campaign: crowdfundCampaigns,
  })
    .from(crowdfundContributions)
    .innerJoin(crowdfundCampaigns, eq(crowdfundContributions.campaignId, crowdfundCampaigns.id))
    .where(eq(crowdfundContributions.userId, userId))
    .orderBy(desc(crowdfundContributions.createdAt));
}

export async function getUserContributionSummary(userId: string): Promise<{
  totalAmount: number;
  campaignsSupported: number;
  campaignsLaunched: number;
}> {
  const contributions = await getContributionsByUser(userId);

  const uniqueCampaigns = new Set(contributions.map(c => c.campaignId));
  const launchedCampaigns = contributions.filter(c => c.campaign.status === "launched").map(c => c.campaignId);
  const uniqueLaunched = new Set(launchedCampaigns);

  return {
    totalAmount: contributions.reduce((sum, c) => sum + c.amount, 0),
    campaignsSupported: uniqueCampaigns.size,
    campaignsLaunched: uniqueLaunched.size,
  };
}

export async function getUserCampaignContribution(userId: string, campaignId: number): Promise<{
  totalAmount: number;
  contributionCount: number;
  priorityAccessUsed: boolean;
} | null> {
  const contributions = await db.select().from(crowdfundContributions)
    .where(and(
      eq(crowdfundContributions.userId, userId),
      eq(crowdfundContributions.campaignId, campaignId),
      eq(crowdfundContributions.status, "verified")
    ));

  if (contributions.length === 0) return null;

  return {
    totalAmount: contributions.reduce((sum, c) => sum + c.amount, 0),
    contributionCount: contributions.length,
    priorityAccessUsed: contributions.some(c => c.priorityAccessUsed),
  };
}

export async function createContribution(data: {
  campaignId: number;
  userId?: string;
  email?: string;
  displayName?: string;
  amount: number;
  paymentMethod: string;
  transactionId?: string;
  receiptData?: string;
  stripeSessionId?: string;
}): Promise<CrowdfundContribution> {
  const [result] = await db.insert(crowdfundContributions).values({
    ...data,
    status: "pending",
  }).returning();
  return result;
}

export async function verifyContribution(id: number, priorityAccessHours = 24): Promise<CrowdfundContribution | undefined> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + priorityAccessHours);

  const [result] = await db.update(crowdfundContributions)
    .set({
      status: "verified",
      priorityAccessExpiresAt: expiresAt,
    })
    .where(eq(crowdfundContributions.id, id))
    .returning();

  // 更新活動進度
  if (result) {
    await updateCampaignProgress(result.campaignId, result.amount);
  }

  return result;
}

export async function failContribution(id: number): Promise<CrowdfundContribution | undefined> {
  const [result] = await db.update(crowdfundContributions)
    .set({ status: "failed" })
    .where(eq(crowdfundContributions.id, id))
    .returning();
  return result;
}

export async function getContributionByTransactionId(transactionId: string): Promise<CrowdfundContribution | undefined> {
  const [result] = await db.select().from(crowdfundContributions)
    .where(eq(crowdfundContributions.transactionId, transactionId));
  return result;
}

export async function getContributionByStripeSession(sessionId: string): Promise<CrowdfundContribution | undefined> {
  const [result] = await db.select().from(crowdfundContributions)
    .where(eq(crowdfundContributions.stripeSessionId, sessionId));
  return result;
}

export async function usePriorityAccess(contributionId: number): Promise<boolean> {
  const [result] = await db.update(crowdfundContributions)
    .set({ priorityAccessUsed: true })
    .where(eq(crowdfundContributions.id, contributionId))
    .returning();
  return !!result;
}

// ============ 統計 ============

export async function getTopContributors(campaignId: number, limit = 10): Promise<{
  userId: string | null;
  displayName: string | null;
  totalAmount: number;
}[]> {
  const result = await db.select({
    userId: crowdfundContributions.userId,
    displayName: crowdfundContributions.displayName,
    totalAmount: sql<number>`sum(${crowdfundContributions.amount})`.as("total_amount"),
  })
    .from(crowdfundContributions)
    .where(and(
      eq(crowdfundContributions.campaignId, campaignId),
      eq(crowdfundContributions.status, "verified")
    ))
    .groupBy(crowdfundContributions.userId, crowdfundContributions.displayName)
    .orderBy(desc(sql`sum(${crowdfundContributions.amount})`))
    .limit(limit);

  return result.map(r => ({
    userId: r.userId,
    displayName: r.displayName,
    totalAmount: Number(r.totalAmount),
  }));
}

export async function getRecentContributors(campaignId: number, limit = 10): Promise<{
  displayName: string | null;
  amount: number;
  createdAt: Date;
}[]> {
  const result = await db.select({
    displayName: crowdfundContributions.displayName,
    amount: crowdfundContributions.amount,
    createdAt: crowdfundContributions.createdAt,
  })
    .from(crowdfundContributions)
    .where(and(
      eq(crowdfundContributions.campaignId, campaignId),
      eq(crowdfundContributions.status, "verified")
    ))
    .orderBy(desc(crowdfundContributions.createdAt))
    .limit(limit);

  return result;
}

// ============ 優先抽取權 ============

export async function hasActivePriorityAccess(userId: string, countryCode: string): Promise<boolean> {
  const campaign = await getCampaignByCountryCode(countryCode);
  if (!campaign) return false;

  const now = new Date();
  const [result] = await db.select({ id: crowdfundContributions.id })
    .from(crowdfundContributions)
    .where(and(
      eq(crowdfundContributions.userId, userId),
      eq(crowdfundContributions.campaignId, campaign.id),
      eq(crowdfundContributions.status, "verified"),
      eq(crowdfundContributions.priorityAccessUsed, false),
      gte(crowdfundContributions.priorityAccessExpiresAt, now)
    ))
    .limit(1);

  return !!result;
}

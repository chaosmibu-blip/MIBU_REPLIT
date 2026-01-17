/**
 * 推薦系統 Storage
 * 處理推薦碼、用戶推薦、商家推薦、餘額、提現相關的資料存取
 */

import { eq, and, desc, sql, gte } from "drizzle-orm";
import { db } from "../db";
import {
  referralCodes,
  userReferrals,
  merchantReferrals,
  userBalances,
  balanceTransactions,
  withdrawalRequests,
  users,
  type ReferralCode,
  type UserReferral,
  type MerchantReferral,
  type UserBalance,
  type BalanceTransaction,
  type WithdrawalRequest,
} from "../../shared/schema";

// ============ 推薦碼 ============

export async function getReferralCodeByUserId(userId: string): Promise<ReferralCode | undefined> {
  const [result] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
  return result;
}

export async function getReferralCodeByCode(code: string): Promise<ReferralCode | undefined> {
  const [result] = await db.select().from(referralCodes).where(eq(referralCodes.code, code.toUpperCase()));
  return result;
}

export async function createReferralCode(userId: string): Promise<ReferralCode> {
  // 生成唯一的推薦碼
  const code = generateReferralCode();

  const [result] = await db.insert(referralCodes).values({
    userId,
    code,
  }).returning();
  return result;
}

export async function getOrCreateReferralCode(userId: string): Promise<ReferralCode> {
  const existing = await getReferralCodeByUserId(userId);
  if (existing) return existing;
  return createReferralCode(userId);
}

function generateReferralCode(): string {
  // 生成 6 位英數字推薦碼
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除容易混淆的字元
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============ 用戶推薦 ============

export async function getUserReferralByRefereeId(refereeId: string): Promise<UserReferral | undefined> {
  const [result] = await db.select().from(userReferrals).where(eq(userReferrals.refereeId, refereeId));
  return result;
}

export async function getReferralsByReferrerId(referrerId: string): Promise<(UserReferral & { referee: { displayName: string | null } })[]> {
  return db.select({
    id: userReferrals.id,
    referrerId: userReferrals.referrerId,
    refereeId: userReferrals.refereeId,
    status: userReferrals.status,
    registeredAt: userReferrals.registeredAt,
    activatedAt: userReferrals.activatedAt,
    referrerRewardPaid: userReferrals.referrerRewardPaid,
    createdAt: userReferrals.createdAt,
    referee: {
      displayName: users.displayName,
    },
  })
    .from(userReferrals)
    .innerJoin(users, eq(userReferrals.refereeId, users.id))
    .where(eq(userReferrals.referrerId, referrerId))
    .orderBy(desc(userReferrals.createdAt));
}

export async function createUserReferral(referrerId: string, refereeId: string): Promise<UserReferral> {
  const [result] = await db.insert(userReferrals).values({
    referrerId,
    refereeId,
    status: "registered",
  }).returning();
  return result;
}

export async function activateUserReferral(refereeId: string): Promise<UserReferral | undefined> {
  const [result] = await db.update(userReferrals)
    .set({
      status: "activated",
      activatedAt: new Date(),
    })
    .where(eq(userReferrals.refereeId, refereeId))
    .returning();
  return result;
}

export async function markReferrerRewardPaid(referralId: number): Promise<void> {
  await db.update(userReferrals)
    .set({ referrerRewardPaid: true })
    .where(eq(userReferrals.id, referralId));
}

export async function getReferralStats(referrerId: string): Promise<{
  totalReferrals: number;
  activatedReferrals: number;
  pendingReferrals: number;
}> {
  const referrals = await getReferralsByReferrerId(referrerId);
  return {
    totalReferrals: referrals.length,
    activatedReferrals: referrals.filter(r => r.status === 'activated').length,
    pendingReferrals: referrals.filter(r => r.status === 'registered').length,
  };
}

// ============ 商家推薦 ============

export async function getMerchantReferralById(id: number): Promise<MerchantReferral | undefined> {
  const [result] = await db.select().from(merchantReferrals).where(eq(merchantReferrals.id, id));
  return result;
}

export async function getMerchantReferralsByReferrerId(referrerId: string): Promise<MerchantReferral[]> {
  return db.select().from(merchantReferrals)
    .where(eq(merchantReferrals.referrerId, referrerId))
    .orderBy(desc(merchantReferrals.createdAt));
}

export async function getMerchantReferralsByStatus(status: string): Promise<MerchantReferral[]> {
  return db.select().from(merchantReferrals)
    .where(eq(merchantReferrals.status, status))
    .orderBy(desc(merchantReferrals.createdAt));
}

export async function createMerchantReferral(data: {
  referrerId: string;
  merchantName: string;
  address: string;
  city: string;
  country?: string;
  category: string;
  contactInfo?: string;
  googlePlaceId?: string;
  notes?: string;
}): Promise<MerchantReferral> {
  const [result] = await db.insert(merchantReferrals).values({
    ...data,
    status: "pending",
  }).returning();
  return result;
}

export async function updateMerchantReferralStatus(
  id: number,
  status: string,
  reviewedBy: string,
  rejectionReason?: string
): Promise<MerchantReferral | undefined> {
  const [result] = await db.update(merchantReferrals)
    .set({
      status,
      reviewedBy,
      reviewedAt: new Date(),
      rejectionReason,
    })
    .where(eq(merchantReferrals.id, id))
    .returning();
  return result;
}

export async function linkMerchantReferralToMerchant(
  referralId: number,
  merchantId: number,
  placeId?: number
): Promise<MerchantReferral | undefined> {
  const [result] = await db.update(merchantReferrals)
    .set({
      linkedMerchantId: merchantId,
      linkedPlaceId: placeId,
      status: "merchant_registered",
    })
    .where(eq(merchantReferrals.id, referralId))
    .returning();
  return result;
}

export async function checkDuplicateMerchantReferral(googlePlaceId: string): Promise<MerchantReferral | undefined> {
  const [result] = await db.select().from(merchantReferrals)
    .where(eq(merchantReferrals.googlePlaceId, googlePlaceId));
  return result;
}

// ============ 用戶餘額 ============

export async function getUserBalance(userId: string): Promise<UserBalance | undefined> {
  const [result] = await db.select().from(userBalances).where(eq(userBalances.userId, userId));
  return result;
}

export async function getOrCreateUserBalance(userId: string): Promise<UserBalance> {
  const existing = await getUserBalance(userId);
  if (existing) return existing;

  const [result] = await db.insert(userBalances).values({
    userId,
    availableBalance: 0,
    pendingBalance: 0,
    lifetimeEarned: 0,
    lifetimeWithdrawn: 0,
  }).returning();
  return result;
}

export async function addBalanceReward(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceType?: string,
  referenceId?: number
): Promise<UserBalance> {
  // 確保餘額記錄存在
  await getOrCreateUserBalance(userId);

  // 更新餘額
  const [balance] = await db.update(userBalances)
    .set({
      availableBalance: sql`${userBalances.availableBalance} + ${amount}`,
      lifetimeEarned: sql`${userBalances.lifetimeEarned} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(userBalances.userId, userId))
    .returning();

  // 記錄交易
  await db.insert(balanceTransactions).values({
    userId,
    amount,
    type,
    referenceType,
    referenceId,
    description,
  });

  return balance;
}

export async function deductBalance(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceType?: string,
  referenceId?: number
): Promise<UserBalance | null> {
  const balance = await getUserBalance(userId);
  if (!balance || balance.availableBalance < amount) {
    return null;
  }

  // 扣除餘額
  const [updated] = await db.update(userBalances)
    .set({
      availableBalance: sql`${userBalances.availableBalance} - ${amount}`,
      lifetimeWithdrawn: sql`${userBalances.lifetimeWithdrawn} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(userBalances.userId, userId))
    .returning();

  // 記錄交易（負數）
  await db.insert(balanceTransactions).values({
    userId,
    amount: -amount,
    type,
    referenceType,
    referenceId,
    description,
  });

  return updated;
}

// ============ 餘額交易記錄 ============

export async function getBalanceTransactions(userId: string, limit = 20, offset = 0): Promise<BalanceTransaction[]> {
  return db.select().from(balanceTransactions)
    .where(eq(balanceTransactions.userId, userId))
    .orderBy(desc(balanceTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getBalanceTransactionCount(userId: string): Promise<number> {
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(balanceTransactions)
    .where(eq(balanceTransactions.userId, userId));
  return Number(result?.count || 0);
}

// ============ 提現申請 ============

export async function getWithdrawalRequestById(id: number): Promise<WithdrawalRequest | undefined> {
  const [result] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id));
  return result;
}

export async function getWithdrawalRequestsByUserId(userId: string): Promise<WithdrawalRequest[]> {
  return db.select().from(withdrawalRequests)
    .where(eq(withdrawalRequests.userId, userId))
    .orderBy(desc(withdrawalRequests.createdAt));
}

export async function getWithdrawalRequestsByStatus(status: string): Promise<WithdrawalRequest[]> {
  return db.select().from(withdrawalRequests)
    .where(eq(withdrawalRequests.status, status))
    .orderBy(desc(withdrawalRequests.createdAt));
}

export async function createWithdrawalRequest(data: {
  userId: string;
  amount: number;
  bankCode: string;
  bankAccount: string;
  accountName: string;
}): Promise<WithdrawalRequest | null> {
  // 檢查餘額
  const balance = await getUserBalance(data.userId);
  if (!balance || balance.availableBalance < data.amount) {
    return null;
  }

  // 計算手續費
  const fee = data.amount >= 500 ? 0 : 15;
  const netAmount = data.amount - fee;

  // 建立申請
  const [request] = await db.insert(withdrawalRequests).values({
    ...data,
    fee,
    netAmount,
    status: "pending",
  }).returning();

  // 扣除餘額並記錄
  await deductBalance(
    data.userId,
    data.amount,
    "withdraw",
    `提現申請 #${request.id}`,
    "withdrawal",
    request.id
  );

  return request;
}

export async function updateWithdrawalRequestStatus(
  id: number,
  status: string,
  processedBy: string,
  rejectionReason?: string
): Promise<WithdrawalRequest | undefined> {
  const [result] = await db.update(withdrawalRequests)
    .set({
      status,
      processedBy,
      processedAt: new Date(),
      rejectionReason,
    })
    .where(eq(withdrawalRequests.id, id))
    .returning();

  // 如果拒絕，退還餘額
  if (status === "rejected" && result) {
    await addBalanceReward(
      result.userId,
      result.amount,
      "adjustment",
      `退還提現申請 #${id}`,
      "withdrawal",
      id
    );
  }

  return result;
}

export async function hasPendingWithdrawal(userId: string): Promise<boolean> {
  const [result] = await db.select({ id: withdrawalRequests.id })
    .from(withdrawalRequests)
    .where(and(
      eq(withdrawalRequests.userId, userId),
      eq(withdrawalRequests.status, "pending")
    ))
    .limit(1);
  return !!result;
}

// ============ 獎勵常數 ============

export const REFERRAL_REWARDS = {
  // 用戶推薦獎勵
  USER_REGISTER_REFERRER_EXP: 100,   // 推薦人：被推薦人註冊
  USER_REGISTER_REFEREE_EXP: 50,     // 被推薦人：使用推薦碼註冊
  USER_ACTIVATE_REFERRER_EXP: 150,   // 推薦人：被推薦人首次扭蛋
  USER_ACTIVATE_REFERRER_CASH: 10,   // 推薦人：被推薦人首次扭蛋（現金）

  // 商家推薦獎勵
  MERCHANT_APPROVED_EXP: 500,        // 商家推薦審核通過
  MERCHANT_APPROVED_CASH: 50,        // 商家推薦審核通過（現金）
  MERCHANT_REGISTERED_EXP: 1000,     // 商家完成註冊
  MERCHANT_REGISTERED_CASH: 100,     // 商家完成註冊（現金）
  MERCHANT_SUBSCRIBED_CASH: 200,     // 商家首次訂閱（現金）

  // 商家自推獎勵
  SELF_REFER_EXP: 500,               // 商家自推審核通過
  // 不獲得現金，但獲得免費試用期（在商家模組處理）
};

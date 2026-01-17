/**
 * 帳號系統 Storage
 * 處理策劃師申請、訪客遷移、帳號連結相關的資料存取
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  specialistApplications,
  guestMigrations,
  authIdentities,
  users,
  collections,
  userInventory,
  notifications,
  userLevels,
  type SpecialistApplication,
  type GuestMigration,
  type AuthIdentity,
} from "../../shared/schema";

// ============ 策劃師申請 ============

export async function getSpecialistApplicationById(id: number): Promise<SpecialistApplication | undefined> {
  const [result] = await db.select().from(specialistApplications).where(eq(specialistApplications.id, id));
  return result;
}

export async function getSpecialistApplicationByUserId(userId: string): Promise<SpecialistApplication | undefined> {
  const [result] = await db.select().from(specialistApplications)
    .where(eq(specialistApplications.userId, userId))
    .orderBy(desc(specialistApplications.createdAt))
    .limit(1);
  return result;
}

export async function getSpecialistApplicationsByStatus(status: string): Promise<SpecialistApplication[]> {
  return db.select().from(specialistApplications)
    .where(eq(specialistApplications.status, status))
    .orderBy(desc(specialistApplications.createdAt));
}

export async function createSpecialistApplication(data: {
  userId: string;
  realName: string;
  regions: string[];
  introduction: string;
  contactInfo: string;
}): Promise<SpecialistApplication> {
  const [result] = await db.insert(specialistApplications).values({
    userId: data.userId,
    realName: data.realName,
    regions: data.regions,
    introduction: data.introduction,
    contactInfo: data.contactInfo,
    status: "pending",
  }).returning();

  // 更新 userLevels 記錄申請時間
  await db.update(userLevels)
    .set({ specialistAppliedAt: new Date() })
    .where(eq(userLevels.userId, data.userId));

  return result;
}

export async function updateSpecialistApplicationStatus(
  id: number,
  status: string,
  reviewedBy: string,
  rejectionReason?: string
): Promise<SpecialistApplication | undefined> {
  const [result] = await db.update(specialistApplications)
    .set({
      status,
      reviewedBy,
      reviewedAt: new Date(),
      rejectionReason,
    })
    .where(eq(specialistApplications.id, id))
    .returning();

  // 如果審核通過，更新用戶角色
  if (status === "approved" && result) {
    await db.update(users)
      .set({ roles: sql`array_append(${users.roles}, 'specialist')` })
      .where(eq(users.id, result.userId));
  }

  return result;
}

export async function hasPendingApplication(userId: string): Promise<boolean> {
  const [result] = await db.select({ id: specialistApplications.id })
    .from(specialistApplications)
    .where(and(
      eq(specialistApplications.userId, userId),
      eq(specialistApplications.status, "pending")
    ))
    .limit(1);
  return !!result;
}

// ============ 訪客帳號遷移 ============

export async function getGuestMigrationByGuestId(guestUserId: string): Promise<GuestMigration | undefined> {
  const [result] = await db.select().from(guestMigrations)
    .where(eq(guestMigrations.guestUserId, guestUserId));
  return result;
}

export async function migrateGuestAccount(guestUserId: string, newUserId: string): Promise<GuestMigration | null> {
  // 檢查是否已遷移
  const existing = await getGuestMigrationByGuestId(guestUserId);
  if (existing) {
    return null; // 已遷移過
  }

  // 遷移 collections
  const collectionsResult = await db.update(collections)
    .set({ userId: newUserId })
    .where(eq(collections.userId, guestUserId))
    .returning({ id: collections.id });
  const migratedCollections = collectionsResult.length;

  // 遷移 user_inventory
  const inventoryResult = await db.update(userInventory)
    .set({ userId: newUserId })
    .where(eq(userInventory.userId, guestUserId))
    .returning({ id: userInventory.id });
  const migratedInventory = inventoryResult.length;

  // 遷移 notifications
  const notificationsResult = await db.update(notifications)
    .set({ userId: newUserId })
    .where(eq(notifications.userId, guestUserId))
    .returning({ id: notifications.id });
  const migratedNotifications = notificationsResult.length;

  // 記錄遷移
  const [migration] = await db.insert(guestMigrations).values({
    guestUserId,
    newUserId,
    migratedCollections,
    migratedInventory,
    migratedNotifications,
  }).returning();

  return migration;
}

// ============ 帳號連結 ============

export async function getAuthIdentitiesByUserId(userId: string): Promise<AuthIdentity[]> {
  return db.select().from(authIdentities)
    .where(eq(authIdentities.userId, userId))
    .orderBy(desc(authIdentities.createdAt));
}

export async function getAuthIdentityByProvider(userId: string, provider: string): Promise<AuthIdentity | undefined> {
  const [result] = await db.select().from(authIdentities)
    .where(and(
      eq(authIdentities.userId, userId),
      eq(authIdentities.provider, provider)
    ));
  return result;
}

export async function getAuthIdentityByProviderUserId(provider: string, providerUserId: string): Promise<AuthIdentity | undefined> {
  const [result] = await db.select().from(authIdentities)
    .where(and(
      eq(authIdentities.provider, provider),
      eq(authIdentities.providerUserId, providerUserId)
    ));
  return result;
}

export async function linkAuthIdentity(
  userId: string,
  provider: string,
  providerUserId: string,
  email?: string,
  accessToken?: string,
  refreshToken?: string
): Promise<AuthIdentity | null> {
  // 檢查是否已綁定到其他帳號
  const existingIdentity = await getAuthIdentityByProviderUserId(provider, providerUserId);
  if (existingIdentity && existingIdentity.userId !== userId) {
    return null; // 此 provider 帳號已綁定到其他用戶
  }

  // 檢查當前用戶是否已有此 provider
  const currentIdentity = await getAuthIdentityByProvider(userId, provider);
  if (currentIdentity) {
    // 更新現有記錄
    const [result] = await db.update(authIdentities)
      .set({
        providerUserId,
        email,
        accessToken,
        refreshToken,
        updatedAt: new Date(),
      })
      .where(eq(authIdentities.id, currentIdentity.id))
      .returning();
    return result;
  }

  // 建立新連結
  const [result] = await db.insert(authIdentities).values({
    userId,
    provider,
    providerUserId,
    email,
    accessToken,
    refreshToken,
  }).returning();
  return result;
}

export async function unlinkAuthIdentity(userId: string, provider: string): Promise<boolean> {
  // 至少保留一個登入方式
  const identities = await getAuthIdentitiesByUserId(userId);
  if (identities.length <= 1) {
    return false; // 不能解除最後一個登入方式
  }

  await db.delete(authIdentities)
    .where(and(
      eq(authIdentities.userId, userId),
      eq(authIdentities.provider, provider)
    ));
  return true;
}

// ============ 帳號查詢 ============

export async function getUserById(userId: string) {
  const [result] = await db.select().from(users).where(eq(users.id, userId));
  return result;
}

export async function updateUserRole(userId: string, role: string): Promise<void> {
  await db.update(users)
    .set({ role })
    .where(eq(users.id, userId));
}

export async function isUserSpecialist(userId: string): Promise<boolean> {
  const [result] = await db.select({ roles: users.roles })
    .from(users)
    .where(eq(users.id, userId));

  if (!result?.roles) return false;
  return Array.isArray(result.roles) && result.roles.includes("specialist");
}

// ============ 策劃師邀請 ============

export const SPECIALIST_REQUIRED_LEVEL = 10;

export async function checkSpecialistEligibility(userId: string): Promise<{
  isEligible: boolean;
  currentLevel: number;
  hasApplied: boolean;
  isSpecialist: boolean;
}> {
  // 取得用戶等級
  const [userLevel] = await db.select().from(userLevels).where(eq(userLevels.userId, userId));
  const currentLevel = userLevel?.currentLevel || 1;

  // 檢查是否已申請
  const hasApplied = await hasPendingApplication(userId);

  // 檢查是否已是策劃師
  const isSpecialist = await isUserSpecialist(userId);

  return {
    isEligible: currentLevel >= SPECIALIST_REQUIRED_LEVEL && !hasApplied && !isSpecialist,
    currentLevel,
    hasApplied,
    isSpecialist,
  };
}

export async function markSpecialistInvited(userId: string): Promise<void> {
  await db.update(userLevels)
    .set({ specialistInvitedAt: new Date() })
    .where(eq(userLevels.userId, userId));
}

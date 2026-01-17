/**
 * 遊戲經濟系統 Storage
 * 處理等級、經驗值、成就相關的資料存取
 */

import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  levelDefinitions,
  userLevels,
  userExpTransactions,
  achievements,
  userAchievements,
  userTendencies,
  userDailyExpStats,
  placeDislikeStats,
  userPlaceBlacklists,
  type LevelDefinition,
  type UserLevel,
  type UserExpTransaction,
  type Achievement,
  type UserAchievement,
  type UserTendency,
  type UserDailyExpStat,
  type PlaceDislikeStat,
  type UserPlaceBlacklist,
} from "../../shared/schema";

// ============ 等級定義 ============

export async function getAllLevelDefinitions(): Promise<LevelDefinition[]> {
  return db.select().from(levelDefinitions).orderBy(levelDefinitions.level);
}

export async function getLevelDefinition(level: number): Promise<LevelDefinition | undefined> {
  const [result] = await db.select().from(levelDefinitions).where(eq(levelDefinitions.level, level));
  return result;
}

export async function getUnlockedLevels(): Promise<LevelDefinition[]> {
  return db.select().from(levelDefinitions)
    .where(eq(levelDefinitions.isUnlocked, true))
    .orderBy(levelDefinitions.level);
}

// ============ 用戶等級 ============

export async function getUserLevel(userId: string): Promise<UserLevel | undefined> {
  const [result] = await db.select().from(userLevels).where(eq(userLevels.userId, userId));
  return result;
}

export async function createUserLevel(userId: string): Promise<UserLevel> {
  const [result] = await db.insert(userLevels).values({
    userId,
    currentExp: 0,
    currentLevel: 1,
  }).returning();
  return result;
}

export async function getOrCreateUserLevel(userId: string): Promise<UserLevel> {
  const existing = await getUserLevel(userId);
  if (existing) return existing;
  return createUserLevel(userId);
}

export async function updateUserLevel(userId: string, data: Partial<Pick<UserLevel, 'currentExp' | 'currentLevel' | 'specialistInvitedAt' | 'specialistAppliedAt'>>): Promise<UserLevel | undefined> {
  const [result] = await db.update(userLevels)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(userLevels.userId, userId))
    .returning();
  return result;
}

export async function addExperience(userId: string, amount: number, eventType: string, referenceType?: string, referenceId?: string, description?: string): Promise<{ newExp: number; newLevel: number; leveledUp: boolean; levelsGained: number }> {
  // 取得或建立用戶等級
  const userLevel = await getOrCreateUserLevel(userId);

  // 計算新經驗值
  const newExp = userLevel.currentExp + amount;

  // 取得所有已解鎖等級
  const levels = await getUnlockedLevels();

  // 計算新等級
  let newLevel = userLevel.currentLevel;
  for (const level of levels) {
    if (newExp >= level.requiredExp) {
      newLevel = level.level;
    } else {
      break;
    }
  }

  const leveledUp = newLevel > userLevel.currentLevel;
  const levelsGained = newLevel - userLevel.currentLevel;

  // 更新用戶等級
  await updateUserLevel(userId, {
    currentExp: newExp,
    currentLevel: newLevel,
  });

  // 記錄經驗交易
  await db.insert(userExpTransactions).values({
    userId,
    amount,
    eventType,
    referenceType,
    referenceId,
    description,
  });

  return { newExp, newLevel, leveledUp, levelsGained };
}

// ============ 經驗交易記錄 ============

export async function getUserExpTransactions(userId: string, limit = 20, offset = 0): Promise<UserExpTransaction[]> {
  return db.select().from(userExpTransactions)
    .where(eq(userExpTransactions.userId, userId))
    .orderBy(desc(userExpTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getUserExpTransactionCount(userId: string): Promise<number> {
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(userExpTransactions)
    .where(eq(userExpTransactions.userId, userId));
  return Number(result?.count || 0);
}

export async function getTodayExpByType(userId: string, eventType: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [result] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(userExpTransactions)
    .where(and(
      eq(userExpTransactions.userId, userId),
      eq(userExpTransactions.eventType, eventType),
      gte(userExpTransactions.createdAt, today)
    ));

  return Number(result?.total || 0);
}

// ============ 成就 ============

export async function getAllAchievements(): Promise<Achievement[]> {
  return db.select().from(achievements)
    .where(eq(achievements.isActive, true))
    .orderBy(achievements.category, achievements.sortOrder);
}

export async function getAchievementsByCategory(category: string): Promise<Achievement[]> {
  return db.select().from(achievements)
    .where(and(
      eq(achievements.category, category),
      eq(achievements.isActive, true)
    ))
    .orderBy(achievements.sortOrder);
}

export async function getAchievementByCode(code: string): Promise<Achievement | undefined> {
  const [result] = await db.select().from(achievements).where(eq(achievements.code, code));
  return result;
}

export async function getAchievementById(id: number): Promise<Achievement | undefined> {
  const [result] = await db.select().from(achievements).where(eq(achievements.id, id));
  return result;
}

// ============ 用戶成就 ============

export async function getUserAchievements(userId: string): Promise<(UserAchievement & { achievement: Achievement })[]> {
  return db.select({
    id: userAchievements.id,
    userId: userAchievements.userId,
    achievementId: userAchievements.achievementId,
    unlockedAt: userAchievements.unlockedAt,
    rewardClaimed: userAchievements.rewardClaimed,
    claimedAt: userAchievements.claimedAt,
    achievement: achievements,
  })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
    .where(eq(userAchievements.userId, userId))
    .orderBy(desc(userAchievements.unlockedAt));
}

export async function hasUserAchievement(userId: string, achievementId: number): Promise<boolean> {
  const [result] = await db.select({ id: userAchievements.id })
    .from(userAchievements)
    .where(and(
      eq(userAchievements.userId, userId),
      eq(userAchievements.achievementId, achievementId)
    ));
  return !!result;
}

export async function unlockAchievement(userId: string, achievementId: number): Promise<UserAchievement | null> {
  // 檢查是否已解鎖
  const exists = await hasUserAchievement(userId, achievementId);
  if (exists) return null;

  const [result] = await db.insert(userAchievements).values({
    userId,
    achievementId,
  }).returning();

  return result;
}

export async function claimAchievementReward(userId: string, achievementId: number): Promise<{ success: boolean; achievement?: Achievement; expReward?: number }> {
  // 取得用戶成就記錄
  const [userAchievement] = await db.select()
    .from(userAchievements)
    .where(and(
      eq(userAchievements.userId, userId),
      eq(userAchievements.achievementId, achievementId)
    ));

  if (!userAchievement) {
    return { success: false };
  }

  if (userAchievement.rewardClaimed) {
    return { success: false };
  }

  // 取得成就資料
  const achievement = await getAchievementById(achievementId);
  if (!achievement) {
    return { success: false };
  }

  // 標記已領取
  await db.update(userAchievements)
    .set({ rewardClaimed: true, claimedAt: new Date() })
    .where(eq(userAchievements.id, userAchievement.id));

  // 發放經驗獎勵
  if (achievement.expReward > 0) {
    await addExperience(
      userId,
      achievement.expReward,
      "achievement",
      "achievement",
      String(achievementId),
      `領取成就「${achievement.nameZh}」獎勵`
    );
  }

  return { success: true, achievement, expReward: achievement.expReward };
}

// ============ 用戶傾向 ============

export async function getUserTendency(userId: string): Promise<UserTendency | undefined> {
  const [result] = await db.select().from(userTendencies).where(eq(userTendencies.userId, userId));
  return result;
}

export async function updateUserTendency(userId: string, scores: Partial<Pick<UserTendency, 'consumerScore' | 'investorScore' | 'promoterScore' | 'businessScore' | 'specialistScore'>>): Promise<UserTendency> {
  const existing = await getUserTendency(userId);

  if (existing) {
    const [result] = await db.update(userTendencies)
      .set({ ...scores, updatedAt: new Date() })
      .where(eq(userTendencies.userId, userId))
      .returning();
    return result;
  } else {
    const [result] = await db.insert(userTendencies).values({
      userId,
      ...scores,
    }).returning();
    return result;
  }
}

// ============ 每日經驗統計 ============

export async function getUserDailyExpStat(userId: string, date: Date): Promise<UserDailyExpStat | undefined> {
  const dateStr = date.toISOString().split('T')[0];
  const [result] = await db.select().from(userDailyExpStats)
    .where(and(
      eq(userDailyExpStats.userId, userId),
      eq(userDailyExpStats.date, dateStr)
    ));
  return result;
}

export async function updateUserDailyExpStat(userId: string, date: Date, updates: Partial<Pick<UserDailyExpStat, 'loginExp' | 'gachaExp' | 'voteExp' | 'shareExp'>>): Promise<UserDailyExpStat> {
  const dateStr = date.toISOString().split('T')[0];
  const existing = await getUserDailyExpStat(userId, date);

  if (existing) {
    const newTotal = (updates.loginExp || existing.loginExp) +
                     (updates.gachaExp || existing.gachaExp) +
                     (updates.voteExp || existing.voteExp) +
                     (updates.shareExp || existing.shareExp);

    const [result] = await db.update(userDailyExpStats)
      .set({ ...updates, totalExp: newTotal })
      .where(eq(userDailyExpStats.id, existing.id))
      .returning();
    return result;
  } else {
    const totalExp = (updates.loginExp || 0) + (updates.gachaExp || 0) + (updates.voteExp || 0) + (updates.shareExp || 0);
    const [result] = await db.insert(userDailyExpStats).values({
      userId,
      date: dateStr,
      ...updates,
      totalExp,
    }).returning();
    return result;
  }
}

// ============ 景點黑名單 ============

export async function getPlaceDislikeStat(placeId: number): Promise<PlaceDislikeStat | undefined> {
  const [result] = await db.select().from(placeDislikeStats).where(eq(placeDislikeStats.placeId, placeId));
  return result;
}

export async function incrementPlaceDislike(placeId: number): Promise<PlaceDislikeStat> {
  const existing = await getPlaceDislikeStat(placeId);

  if (existing) {
    const newMonthly = existing.monthlyDislikeCount + 1;
    const newTotal = existing.totalDislikeCount + 1;

    // 判斷狀態
    let status = existing.status;
    if (newMonthly >= 100) {
      status = "excluded";
    } else if (newMonthly >= 50) {
      status = "reduced";
    } else if (newMonthly >= 30) {
      status = "pending_vote";
    }

    const [result] = await db.update(placeDislikeStats)
      .set({
        monthlyDislikeCount: newMonthly,
        totalDislikeCount: newTotal,
        status,
        updatedAt: new Date(),
      })
      .where(eq(placeDislikeStats.placeId, placeId))
      .returning();
    return result;
  } else {
    const [result] = await db.insert(placeDislikeStats).values({
      placeId,
      monthlyDislikeCount: 1,
      totalDislikeCount: 1,
    }).returning();
    return result;
  }
}

export async function getUserPlaceBlacklist(userId: string): Promise<UserPlaceBlacklist[]> {
  return db.select().from(userPlaceBlacklists)
    .where(eq(userPlaceBlacklists.userId, userId))
    .orderBy(desc(userPlaceBlacklists.createdAt));
}

export async function isPlaceBlacklisted(userId: string, placeId: number): Promise<boolean> {
  const [result] = await db.select({ id: userPlaceBlacklists.id })
    .from(userPlaceBlacklists)
    .where(and(
      eq(userPlaceBlacklists.userId, userId),
      eq(userPlaceBlacklists.placeId, placeId)
    ));
  return !!result;
}

export async function addPlaceToBlacklist(userId: string, placeId: number): Promise<{ success: boolean; alreadyExists?: boolean }> {
  const exists = await isPlaceBlacklisted(userId, placeId);
  if (exists) {
    return { success: false, alreadyExists: true };
  }

  await db.insert(userPlaceBlacklists).values({ userId, placeId });

  // 更新全域統計
  await incrementPlaceDislike(placeId);

  return { success: true };
}

export async function removePlaceFromBlacklist(userId: string, placeId: number): Promise<boolean> {
  const result = await db.delete(userPlaceBlacklists)
    .where(and(
      eq(userPlaceBlacklists.userId, userId),
      eq(userPlaceBlacklists.placeId, placeId)
    ));
  return true;
}

// ============ 輔助函數 ============

/**
 * 計算用戶當前權益（每日抽卡上限、背包格數）
 */
export async function getUserPerks(userId: string): Promise<{ dailyPulls: number; inventorySlots: number }> {
  const userLevel = await getOrCreateUserLevel(userId);
  const levels = await getUnlockedLevels();

  // 基礎值
  let dailyPulls = 24;
  let inventorySlots = 20;

  // 累計到當前等級的所有權益
  for (const level of levels) {
    if (level.level > userLevel.currentLevel) break;

    if (level.perks) {
      const perks = level.perks as any;
      if (perks.dailyPulls) dailyPulls = perks.dailyPulls;
      if (perks.inventorySlots) inventorySlots = perks.inventorySlots;
    }
  }

  return { dailyPulls, inventorySlots };
}

/**
 * 計算距離下一等還需多少經驗
 */
export async function getExpToNextLevel(userId: string): Promise<{ currentExp: number; nextLevelExp: number; expNeeded: number } | null> {
  const userLevel = await getOrCreateUserLevel(userId);
  const nextLevel = await getLevelDefinition(userLevel.currentLevel + 1);

  if (!nextLevel || !nextLevel.isUnlocked) {
    return null; // 已達最高等級
  }

  return {
    currentExp: userLevel.currentExp,
    nextLevelExp: nextLevel.requiredExp,
    expNeeded: nextLevel.requiredExp - userLevel.currentExp,
  };
}

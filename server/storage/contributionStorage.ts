/**
 * 用戶貢獻系統 Storage
 * 處理歇業回報、景點建議、黑名單、投票相關的資料存取
 */

import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  placeReports,
  placeSuggestions,
  suggestionVotes,
  placeExclusionVotes,
  userDailyContributions,
  userPlaceBlacklists,
  placeDislikeStats,
  places,
  type PlaceReport,
  type PlaceSuggestion,
  type SuggestionVote,
  type PlaceExclusionVote,
  type UserDailyContribution,
  type UserPlaceBlacklist,
  type PlaceDislikeStat,
} from "../../shared/schema";

// ============ 獎勵常數 ============

export const CONTRIBUTION_REWARDS = {
  // 回報歇業
  REPORT_APPROVED_EXP: 40,
  REPORT_DAILY_LIMIT_EXP: 90, // 約 2-3 次
  REPORT_DAILY_LIMIT: 3,

  // 建議景點
  SUGGESTION_APPROVED_EXP: 120,
  SUGGESTION_DAILY_LIMIT_EXP: 240, // 約 2 次
  SUGGESTION_DAILY_LIMIT: 2,

  // 投票
  VOTE_EXP: 5,
  VOTE_DAILY_LIMIT_EXP: 25, // 約 5 次
  VOTE_DAILY_LIMIT: 5,

  // 投票門檻
  SUGGESTION_VOTE_PASS: 3,    // 3 票同意通過
  SUGGESTION_VOTE_REJECT: 3,  // 3 票否決拒絕
  SUGGESTION_VOTE_HOURS: 72,  // 72 小時超時

  // 排除投票門檻
  EXCLUSION_VOTE_PASS: 20,    // 20 票排除
  EXCLUSION_VOTE_KEEP: 20,    // 20 票保留
  EXCLUSION_PENDING_THRESHOLD: 30, // 30 人標記進入待投票

  // 投票資格
  VOTE_MIN_LEVEL: 7, // Lv.7+ 才能投票
};

// ============ 歇業回報 ============

export async function getPlaceReportById(id: number): Promise<PlaceReport | undefined> {
  const [result] = await db.select().from(placeReports).where(eq(placeReports.id, id));
  return result;
}

export async function getPlaceReportsByUserId(userId: string): Promise<PlaceReport[]> {
  return db.select().from(placeReports)
    .where(eq(placeReports.userId, userId))
    .orderBy(desc(placeReports.createdAt));
}

export async function getPlaceReportsByStatus(status: string): Promise<PlaceReport[]> {
  return db.select().from(placeReports)
    .where(eq(placeReports.status, status))
    .orderBy(desc(placeReports.createdAt));
}

export async function getPlaceReportsByPlaceId(placeId: number): Promise<PlaceReport[]> {
  return db.select().from(placeReports)
    .where(eq(placeReports.placeId, placeId))
    .orderBy(desc(placeReports.createdAt));
}

export async function createPlaceReport(data: {
  placeId: number;
  userId: string;
  reason: string;
  description?: string;
}): Promise<PlaceReport> {
  const [result] = await db.insert(placeReports).values({
    ...data,
    status: "pending",
  }).returning();
  return result;
}

export async function updatePlaceReportStatus(
  id: number,
  status: string,
  reviewedBy?: string,
  rejectionReason?: string,
  aiScore?: number
): Promise<PlaceReport | undefined> {
  const [result] = await db.update(placeReports)
    .set({
      status,
      reviewedBy,
      reviewedAt: new Date(),
      rejectionReason,
      aiScore,
    })
    .where(eq(placeReports.id, id))
    .returning();
  return result;
}

export async function markReportRewardPaid(id: number): Promise<void> {
  await db.update(placeReports)
    .set({ rewardPaid: true })
    .where(eq(placeReports.id, id));
}

export async function countReportsByPlaceId(placeId: number): Promise<number> {
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(placeReports)
    .where(and(
      eq(placeReports.placeId, placeId),
      eq(placeReports.status, "pending")
    ));
  return Number(result?.count || 0);
}

// ============ 景點建議 ============

export async function getPlaceSuggestionById(id: number): Promise<PlaceSuggestion | undefined> {
  const [result] = await db.select().from(placeSuggestions).where(eq(placeSuggestions.id, id));
  return result;
}

export async function getPlaceSuggestionsByUserId(userId: string): Promise<PlaceSuggestion[]> {
  return db.select().from(placeSuggestions)
    .where(eq(placeSuggestions.userId, userId))
    .orderBy(desc(placeSuggestions.createdAt));
}

export async function getPlaceSuggestionsByStatus(status: string): Promise<PlaceSuggestion[]> {
  return db.select().from(placeSuggestions)
    .where(eq(placeSuggestions.status, status))
    .orderBy(desc(placeSuggestions.createdAt));
}

export async function getPendingVoteSuggestions(): Promise<PlaceSuggestion[]> {
  return db.select().from(placeSuggestions)
    .where(eq(placeSuggestions.status, "pending_vote"))
    .orderBy(desc(placeSuggestions.createdAt));
}

export async function createPlaceSuggestion(data: {
  userId: string;
  placeName: string;
  address: string;
  city: string;
  country?: string;
  category: string;
  description?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
}): Promise<PlaceSuggestion> {
  const [result] = await db.insert(placeSuggestions).values({
    ...data,
    status: "pending_ai",
  }).returning();
  return result;
}

export async function updatePlaceSuggestionStatus(
  id: number,
  status: string,
  reviewedBy?: string,
  rejectionReason?: string,
  aiScore?: number
): Promise<PlaceSuggestion | undefined> {
  const updateData: any = { status };
  if (reviewedBy) {
    updateData.reviewedBy = reviewedBy;
    updateData.reviewedAt = new Date();
  }
  if (rejectionReason) updateData.rejectionReason = rejectionReason;
  if (aiScore !== undefined) updateData.aiScore = aiScore;

  // 設定投票截止時間
  if (status === "pending_vote") {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + CONTRIBUTION_REWARDS.SUGGESTION_VOTE_HOURS);
    updateData.voteDeadline = deadline;
  }

  const [result] = await db.update(placeSuggestions)
    .set(updateData)
    .where(eq(placeSuggestions.id, id))
    .returning();
  return result;
}

export async function linkSuggestionToPlace(suggestionId: number, placeId: number): Promise<void> {
  await db.update(placeSuggestions)
    .set({ linkedPlaceId: placeId })
    .where(eq(placeSuggestions.id, suggestionId));
}

export async function markSuggestionRewardPaid(id: number): Promise<void> {
  await db.update(placeSuggestions)
    .set({ rewardPaid: true })
    .where(eq(placeSuggestions.id, id));
}

// ============ 建議投票 ============

export async function getSuggestionVote(suggestionId: number, userId: string): Promise<SuggestionVote | undefined> {
  const [result] = await db.select().from(suggestionVotes)
    .where(and(
      eq(suggestionVotes.suggestionId, suggestionId),
      eq(suggestionVotes.userId, userId)
    ));
  return result;
}

export async function createSuggestionVote(suggestionId: number, userId: string, vote: string): Promise<SuggestionVote | null> {
  // 檢查是否已投票
  const existing = await getSuggestionVote(suggestionId, userId);
  if (existing) return null;

  const [result] = await db.insert(suggestionVotes).values({
    suggestionId,
    userId,
    vote,
  }).returning();

  // 更新投票計數
  if (vote === "approve") {
    await db.update(placeSuggestions)
      .set({ voteApprove: sql`${placeSuggestions.voteApprove} + 1` })
      .where(eq(placeSuggestions.id, suggestionId));
  } else {
    await db.update(placeSuggestions)
      .set({ voteReject: sql`${placeSuggestions.voteReject} + 1` })
      .where(eq(placeSuggestions.id, suggestionId));
  }

  // 檢查是否達到門檻
  const suggestion = await getPlaceSuggestionById(suggestionId);
  if (suggestion) {
    if (suggestion.voteApprove + 1 >= CONTRIBUTION_REWARDS.SUGGESTION_VOTE_PASS) {
      await updatePlaceSuggestionStatus(suggestionId, "approved");
    } else if (suggestion.voteReject + 1 >= CONTRIBUTION_REWARDS.SUGGESTION_VOTE_REJECT) {
      await updatePlaceSuggestionStatus(suggestionId, "rejected", undefined, "社群投票否決");
    }
  }

  return result;
}

export async function getSuggestionVotesByUser(userId: string): Promise<SuggestionVote[]> {
  return db.select().from(suggestionVotes)
    .where(eq(suggestionVotes.userId, userId))
    .orderBy(desc(suggestionVotes.createdAt));
}

// ============ 排除投票 ============

export async function getPlaceExclusionVote(placeId: number, userId: string): Promise<PlaceExclusionVote | undefined> {
  const [result] = await db.select().from(placeExclusionVotes)
    .where(and(
      eq(placeExclusionVotes.placeId, placeId),
      eq(placeExclusionVotes.userId, userId)
    ));
  return result;
}

export async function createPlaceExclusionVote(placeId: number, userId: string, vote: string): Promise<PlaceExclusionVote | null> {
  // 檢查是否已投票
  const existing = await getPlaceExclusionVote(placeId, userId);
  if (existing) return null;

  const [result] = await db.insert(placeExclusionVotes).values({
    placeId,
    userId,
    vote,
  }).returning();

  // 計算投票結果
  const votes = await db.select({
    excludeCount: sql<number>`sum(case when vote = 'exclude' then 1 else 0 end)`,
    keepCount: sql<number>`sum(case when vote = 'keep' then 1 else 0 end)`,
  })
    .from(placeExclusionVotes)
    .where(eq(placeExclusionVotes.placeId, placeId));

  const excludeCount = Number(votes[0]?.excludeCount || 0);
  const keepCount = Number(votes[0]?.keepCount || 0);

  // 更新景點狀態
  if (excludeCount >= CONTRIBUTION_REWARDS.EXCLUSION_VOTE_PASS) {
    // 軟刪除景點
    await db.update(places)
      .set({ isActive: false })
      .where(eq(places.id, placeId));
    await db.update(placeDislikeStats)
      .set({ status: "excluded" })
      .where(eq(placeDislikeStats.placeId, placeId));
  } else if (keepCount >= CONTRIBUTION_REWARDS.EXCLUSION_VOTE_KEEP) {
    // 取消待投票狀態
    await db.update(placeDislikeStats)
      .set({ status: "normal" })
      .where(eq(placeDislikeStats.placeId, placeId));
  }

  return result;
}

export async function getPendingExclusionPlaces(): Promise<PlaceDislikeStat[]> {
  return db.select().from(placeDislikeStats)
    .where(eq(placeDislikeStats.status, "pending_vote"))
    .orderBy(desc(placeDislikeStats.monthlyDislikeCount));
}

export async function getPlaceExclusionVoteCount(placeId: number): Promise<{ excludeCount: number; keepCount: number }> {
  const [result] = await db.select({
    excludeCount: sql<number>`sum(case when vote = 'exclude' then 1 else 0 end)`,
    keepCount: sql<number>`sum(case when vote = 'keep' then 1 else 0 end)`,
  })
    .from(placeExclusionVotes)
    .where(eq(placeExclusionVotes.placeId, placeId));

  return {
    excludeCount: Number(result?.excludeCount || 0),
    keepCount: Number(result?.keepCount || 0),
  };
}

// ============ 每日貢獻統計 ============

export async function getUserDailyContribution(userId: string, date: Date): Promise<UserDailyContribution | undefined> {
  const dateStr = date.toISOString().split('T')[0];
  const [result] = await db.select().from(userDailyContributions)
    .where(and(
      eq(userDailyContributions.userId, userId),
      eq(userDailyContributions.date, dateStr)
    ));
  return result;
}

export async function getOrCreateUserDailyContribution(userId: string, date: Date): Promise<UserDailyContribution> {
  const existing = await getUserDailyContribution(userId, date);
  if (existing) return existing;

  const dateStr = date.toISOString().split('T')[0];
  const [result] = await db.insert(userDailyContributions).values({
    userId,
    date: dateStr,
  }).returning();
  return result;
}

export async function incrementDailyReport(userId: string): Promise<boolean> {
  const today = new Date();
  const daily = await getOrCreateUserDailyContribution(userId, today);

  if (daily.reportCount >= CONTRIBUTION_REWARDS.REPORT_DAILY_LIMIT) {
    return false; // 已達上限
  }

  await db.update(userDailyContributions)
    .set({ reportCount: sql`${userDailyContributions.reportCount} + 1` })
    .where(eq(userDailyContributions.id, daily.id));
  return true;
}

export async function incrementDailySuggestion(userId: string): Promise<boolean> {
  const today = new Date();
  const daily = await getOrCreateUserDailyContribution(userId, today);

  if (daily.suggestionCount >= CONTRIBUTION_REWARDS.SUGGESTION_DAILY_LIMIT) {
    return false; // 已達上限
  }

  await db.update(userDailyContributions)
    .set({ suggestionCount: sql`${userDailyContributions.suggestionCount} + 1` })
    .where(eq(userDailyContributions.id, daily.id));
  return true;
}

export async function incrementDailyVote(userId: string): Promise<boolean> {
  const today = new Date();
  const daily = await getOrCreateUserDailyContribution(userId, today);

  if (daily.voteCount >= CONTRIBUTION_REWARDS.VOTE_DAILY_LIMIT) {
    return false; // 已達上限
  }

  await db.update(userDailyContributions)
    .set({ voteCount: sql`${userDailyContributions.voteCount} + 1` })
    .where(eq(userDailyContributions.id, daily.id));
  return true;
}

// ============ 用戶黑名單（從 economyStorage 複製相關功能）============

export async function getUserBlacklist(userId: string): Promise<UserPlaceBlacklist[]> {
  return db.select().from(userPlaceBlacklists)
    .where(eq(userPlaceBlacklists.userId, userId))
    .orderBy(desc(userPlaceBlacklists.createdAt));
}

export async function isPlaceInUserBlacklist(userId: string, placeId: number): Promise<boolean> {
  const [result] = await db.select({ id: userPlaceBlacklists.id })
    .from(userPlaceBlacklists)
    .where(and(
      eq(userPlaceBlacklists.userId, userId),
      eq(userPlaceBlacklists.placeId, placeId)
    ));
  return !!result;
}

export async function addToUserBlacklist(userId: string, placeId: number): Promise<{ success: boolean; alreadyExists?: boolean }> {
  const exists = await isPlaceInUserBlacklist(userId, placeId);
  if (exists) {
    return { success: false, alreadyExists: true };
  }

  await db.insert(userPlaceBlacklists).values({ userId, placeId });

  // 更新全域統計
  await incrementPlaceDislike(placeId);

  return { success: true };
}

export async function removeFromUserBlacklist(userId: string, placeId: number): Promise<boolean> {
  await db.delete(userPlaceBlacklists)
    .where(and(
      eq(userPlaceBlacklists.userId, userId),
      eq(userPlaceBlacklists.placeId, placeId)
    ));
  return true;
}

// ============ 全域黑名單統計 ============

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
      // 軟刪除景點
      await db.update(places)
        .set({ isActive: false })
        .where(eq(places.id, placeId));
    } else if (newMonthly >= 50) {
      status = "reduced";
    } else if (newMonthly >= CONTRIBUTION_REWARDS.EXCLUSION_PENDING_THRESHOLD) {
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

export async function resetMonthlyDislikes(): Promise<number> {
  const result = await db.update(placeDislikeStats)
    .set({
      monthlyDislikeCount: 0,
      status: sql`case when status = 'excluded' then 'excluded' else 'normal' end`,
      lastResetAt: new Date(),
      updatedAt: new Date(),
    });
  return 0; // Drizzle doesn't return affected count easily
}

// ============ 統計 ============

export async function getUserContributionStats(userId: string): Promise<{
  totalReports: number;
  approvedReports: number;
  totalSuggestions: number;
  approvedSuggestions: number;
  totalVotes: number;
}> {
  const reports = await getPlaceReportsByUserId(userId);
  const suggestions = await getPlaceSuggestionsByUserId(userId);
  const votes = await getSuggestionVotesByUser(userId);

  return {
    totalReports: reports.length,
    approvedReports: reports.filter(r => r.status === "approved").length,
    totalSuggestions: suggestions.length,
    approvedSuggestions: suggestions.filter(s => s.status === "approved").length,
    totalVotes: votes.length,
  };
}

/**
 * 用戶貢獻系統路由
 * 處理歇業回報、景點建議、黑名單、投票 API
 */

import { Router, Request, Response } from "express";
import { isAuthenticated } from "../replitAuth";
import * as contributionStorage from "../storage/contributionStorage";
import * as economyStorage from "../storage/economyStorage";

const router = Router();

// ============ 歇業回報 API ============

/**
 * POST /api/contribution/report-closed
 * 回報歇業
 */
router.post("/contribution/report-closed", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const { placeId, reason, description } = req.body;

    // 驗證必填欄位
    if (!placeId || !reason) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少必要欄位" });
    }

    // 驗證原因
    const validReasons = ["permanently_closed", "temporarily_closed", "relocated", "info_error"];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的回報原因" });
    }

    // 檢查每日上限
    const canReport = await contributionStorage.incrementDailyReport(userId);
    if (!canReport) {
      return res.status(400).json({ errorCode: "E13001", message: "今日回報已達上限" });
    }

    // 建立回報
    const report = await contributionStorage.createPlaceReport({
      placeId,
      userId,
      reason,
      description,
    });

    res.json({
      success: true,
      report: {
        id: report.id,
        placeId: report.placeId,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/contribution/my-reports
 * 我的回報記錄
 */
router.get("/contribution/my-reports", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const reports = await contributionStorage.getPlaceReportsByUserId(userId);

    res.json({
      reports: reports.map((r) => ({
        id: r.id,
        placeId: r.placeId,
        reason: r.reason,
        description: r.description,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() || null,
        rejectionReason: r.rejectionReason,
      })),
    });
  } catch (error) {
    console.error("Error getting reports:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 建議景點 API ============

/**
 * POST /api/contribution/suggest-place
 * 建議景點
 */
router.post("/contribution/suggest-place", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const { placeName, address, city, country, category, description, googleMapsUrl, googlePlaceId } = req.body;

    // 驗證必填欄位
    if (!placeName || !address || !city || !category) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少必要欄位" });
    }

    // 驗證分類
    const validCategories = ["美食", "住宿", "景點", "購物", "娛樂設施", "生態文化教育", "遊程體驗"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的景點分類" });
    }

    // 檢查每日上限
    const canSuggest = await contributionStorage.incrementDailySuggestion(userId);
    if (!canSuggest) {
      return res.status(400).json({ errorCode: "E13002", message: "今日建議已達上限" });
    }

    // 建立建議
    const suggestion = await contributionStorage.createPlaceSuggestion({
      userId,
      placeName,
      address,
      city,
      country,
      category,
      description,
      googleMapsUrl,
      googlePlaceId,
    });

    res.json({
      success: true,
      suggestion: {
        id: suggestion.id,
        placeName: suggestion.placeName,
        city: suggestion.city,
        category: suggestion.category,
        status: suggestion.status,
        createdAt: suggestion.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating suggestion:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/contribution/my-suggestions
 * 我的建議記錄
 */
router.get("/contribution/my-suggestions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const suggestions = await contributionStorage.getPlaceSuggestionsByUserId(userId);

    res.json({
      suggestions: suggestions.map((s) => ({
        id: s.id,
        placeName: s.placeName,
        address: s.address,
        city: s.city,
        category: s.category,
        status: s.status,
        voteApprove: s.voteApprove,
        voteReject: s.voteReject,
        voteDeadline: s.voteDeadline?.toISOString() || null,
        createdAt: s.createdAt.toISOString(),
        reviewedAt: s.reviewedAt?.toISOString() || null,
        rejectionReason: s.rejectionReason,
      })),
    });
  } catch (error) {
    console.error("Error getting suggestions:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 黑名單 API ============

/**
 * POST /api/collection/:placeId/blacklist
 * 加入黑名單
 */
router.post("/collection/:placeId/blacklist", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const placeId = parseInt(req.params.placeId);
    if (isNaN(placeId)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的景點 ID" });
    }

    const result = await contributionStorage.addToUserBlacklist(userId, placeId);
    if (!result.success) {
      if (result.alreadyExists) {
        return res.status(400).json({ errorCode: "E13003", message: "已在黑名單中" });
      }
      return res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error adding to blacklist:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * DELETE /api/collection/:placeId/blacklist
 * 移除黑名單
 */
router.delete("/collection/:placeId/blacklist", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const placeId = parseInt(req.params.placeId);
    if (isNaN(placeId)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的景點 ID" });
    }

    await contributionStorage.removeFromUserBlacklist(userId, placeId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing from blacklist:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/collection/blacklist
 * 我的黑名單
 */
router.get("/collection/blacklist", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const blacklist = await contributionStorage.getUserBlacklist(userId);

    res.json({
      blacklist: blacklist.map((b) => ({
        placeId: b.placeId,
        createdAt: b.createdAt.toISOString(),
      })),
      count: blacklist.length,
    });
  } catch (error) {
    console.error("Error getting blacklist:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 投票 API ============

/**
 * GET /api/contribution/pending-votes
 * 待投票景點列表（排除投票）
 */
router.get("/contribution/pending-votes", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    // 檢查等級要求
    const userLevel = await economyStorage.getOrCreateUserLevel(userId);
    if (userLevel.currentLevel < contributionStorage.CONTRIBUTION_REWARDS.VOTE_MIN_LEVEL) {
      return res.status(403).json({
        errorCode: "E13004",
        message: `需要達到 Lv.${contributionStorage.CONTRIBUTION_REWARDS.VOTE_MIN_LEVEL} 才能參與投票`,
      });
    }

    const pendingPlaces = await contributionStorage.getPendingExclusionPlaces();

    // 取得每個景點的投票數
    const placesWithVotes = await Promise.all(
      pendingPlaces.map(async (p) => {
        const votes = await contributionStorage.getPlaceExclusionVoteCount(p.placeId);
        const userVote = await contributionStorage.getPlaceExclusionVote(p.placeId, userId);
        return {
          placeId: p.placeId,
          monthlyDislikeCount: p.monthlyDislikeCount,
          excludeVotes: votes.excludeCount,
          keepVotes: votes.keepCount,
          hasVoted: !!userVote,
          myVote: userVote?.vote || null,
        };
      })
    );

    res.json({ pendingPlaces: placesWithVotes });
  } catch (error) {
    console.error("Error getting pending votes:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * POST /api/contribution/vote/:placeId
 * 投票（排除/不排除）
 */
router.post("/contribution/vote/:placeId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const placeId = parseInt(req.params.placeId);
    if (isNaN(placeId)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的景點 ID" });
    }

    const { vote } = req.body;
    if (!vote || !["exclude", "keep"].includes(vote)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的投票選項" });
    }

    // 檢查等級要求
    const userLevel = await economyStorage.getOrCreateUserLevel(userId);
    if (userLevel.currentLevel < contributionStorage.CONTRIBUTION_REWARDS.VOTE_MIN_LEVEL) {
      return res.status(403).json({
        errorCode: "E13004",
        message: `需要達到 Lv.${contributionStorage.CONTRIBUTION_REWARDS.VOTE_MIN_LEVEL} 才能參與投票`,
      });
    }

    // 檢查每日上限
    const canVote = await contributionStorage.incrementDailyVote(userId);
    if (!canVote) {
      return res.status(400).json({ errorCode: "E13005", message: "今日投票已達上限" });
    }

    // 投票
    const result = await contributionStorage.createPlaceExclusionVote(placeId, userId, vote);
    if (!result) {
      return res.status(400).json({ errorCode: "E13006", message: "您已投過票" });
    }

    // 發放經驗獎勵
    await economyStorage.addExperience(
      userId,
      contributionStorage.CONTRIBUTION_REWARDS.VOTE_EXP,
      "vote",
      "place_exclusion_vote",
      String(result.id),
      "參與排除投票"
    );

    res.json({
      success: true,
      vote: {
        placeId,
        vote: result.vote,
        createdAt: result.createdAt.toISOString(),
      },
      rewards: {
        exp: contributionStorage.CONTRIBUTION_REWARDS.VOTE_EXP,
      },
    });
  } catch (error) {
    console.error("Error voting:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/contribution/pending-suggestions
 * 待投票建議列表
 */
router.get("/contribution/pending-suggestions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    // 檢查等級要求
    const userLevel = await economyStorage.getOrCreateUserLevel(userId);
    if (userLevel.currentLevel < contributionStorage.CONTRIBUTION_REWARDS.VOTE_MIN_LEVEL) {
      return res.status(403).json({
        errorCode: "E13004",
        message: `需要達到 Lv.${contributionStorage.CONTRIBUTION_REWARDS.VOTE_MIN_LEVEL} 才能參與投票`,
      });
    }

    const suggestions = await contributionStorage.getPendingVoteSuggestions();

    // 取得用戶已投票的建議
    const suggestionsWithVotes = await Promise.all(
      suggestions.map(async (s) => {
        const userVote = await contributionStorage.getSuggestionVote(s.id, userId);
        return {
          id: s.id,
          placeName: s.placeName,
          address: s.address,
          city: s.city,
          category: s.category,
          description: s.description,
          googleMapsUrl: s.googleMapsUrl,
          voteApprove: s.voteApprove,
          voteReject: s.voteReject,
          voteDeadline: s.voteDeadline?.toISOString() || null,
          hasVoted: !!userVote,
          myVote: userVote?.vote || null,
        };
      })
    );

    res.json({ suggestions: suggestionsWithVotes });
  } catch (error) {
    console.error("Error getting pending suggestions:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * POST /api/contribution/vote-suggestion/:id
 * 投票建議景點（通過/否決）
 */
router.post("/contribution/vote-suggestion/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const suggestionId = parseInt(req.params.id);
    if (isNaN(suggestionId)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的建議 ID" });
    }

    const { vote } = req.body;
    if (!vote || !["approve", "reject"].includes(vote)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的投票選項" });
    }

    // 檢查等級要求
    const userLevel = await economyStorage.getOrCreateUserLevel(userId);
    if (userLevel.currentLevel < contributionStorage.CONTRIBUTION_REWARDS.VOTE_MIN_LEVEL) {
      return res.status(403).json({
        errorCode: "E13004",
        message: `需要達到 Lv.${contributionStorage.CONTRIBUTION_REWARDS.VOTE_MIN_LEVEL} 才能參與投票`,
      });
    }

    // 檢查每日上限
    const canVote = await contributionStorage.incrementDailyVote(userId);
    if (!canVote) {
      return res.status(400).json({ errorCode: "E13005", message: "今日投票已達上限" });
    }

    // 投票
    const result = await contributionStorage.createSuggestionVote(suggestionId, userId, vote);
    if (!result) {
      return res.status(400).json({ errorCode: "E13006", message: "您已投過票" });
    }

    // 發放經驗獎勵
    await economyStorage.addExperience(
      userId,
      contributionStorage.CONTRIBUTION_REWARDS.VOTE_EXP,
      "vote",
      "suggestion_vote",
      String(result.id),
      "參與建議投票"
    );

    res.json({
      success: true,
      vote: {
        suggestionId,
        vote: result.vote,
        createdAt: result.createdAt.toISOString(),
      },
      rewards: {
        exp: contributionStorage.CONTRIBUTION_REWARDS.VOTE_EXP,
      },
    });
  } catch (error) {
    console.error("Error voting suggestion:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 統計 API ============

/**
 * GET /api/contribution/stats
 * 我的貢獻統計
 */
router.get("/contribution/stats", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const stats = await contributionStorage.getUserContributionStats(userId);

    // 取得今日統計
    const today = new Date();
    const dailyStats = await contributionStorage.getUserDailyContribution(userId, today);

    res.json({
      stats,
      daily: {
        reportCount: dailyStats?.reportCount || 0,
        reportLimit: contributionStorage.CONTRIBUTION_REWARDS.REPORT_DAILY_LIMIT,
        suggestionCount: dailyStats?.suggestionCount || 0,
        suggestionLimit: contributionStorage.CONTRIBUTION_REWARDS.SUGGESTION_DAILY_LIMIT,
        voteCount: dailyStats?.voteCount || 0,
        voteLimit: contributionStorage.CONTRIBUTION_REWARDS.VOTE_DAILY_LIMIT,
      },
    });
  } catch (error) {
    console.error("Error getting contribution stats:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

export default router;

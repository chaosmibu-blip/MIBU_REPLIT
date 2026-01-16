/**
 * 遊戲經濟系統路由
 * 處理等級、經驗值、成就 API
 */

import { Router, Request, Response } from "express";
import { isAuthenticated } from "../replitAuth";
import * as economyStorage from "../storage/economyStorage";

const router = Router();

// ============ 等級系統 ============

/**
 * GET /api/user/level
 * 取得用戶等級資訊
 */
router.get("/user/level", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.jwtUser?.userId || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    // 取得用戶等級
    const userLevel = await economyStorage.getOrCreateUserLevel(userId);

    // 取得等級定義
    const levelDef = await economyStorage.getLevelDefinition(userLevel.currentLevel);

    // 取得權益
    const perks = await economyStorage.getUserPerks(userId);

    // 取得距離下一等的經驗
    const expInfo = await economyStorage.getExpToNextLevel(userId);

    // 取得最近經驗記錄
    const recentExp = await economyStorage.getUserExpTransactions(userId, 10);

    res.json({
      level: {
        userId: userLevel.userId,
        currentLevel: userLevel.currentLevel,
        currentExp: userLevel.currentExp,
        nextLevelExp: expInfo?.nextLevelExp || null,
        expToNextLevel: expInfo?.expNeeded || 0,
        title: levelDef?.title || "旅人",
        titleEn: levelDef?.titleEn || "Traveler",
        dailyPullLimit: perks.dailyPulls,
        inventorySlots: perks.inventorySlots,
        specialistInvited: !!userLevel.specialistInvitedAt,
        isMilestone: levelDef?.isMilestone || false,
        perks: levelDef?.perks || null,
      },
      recentExp: recentExp.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        eventType: tx.eventType,
        description: tx.description,
        createdAt: tx.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error getting user level:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/user/experience/history
 * 取得經驗值記錄
 */
router.get("/user/experience/history", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.jwtUser?.userId || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;

    const transactions = await economyStorage.getUserExpTransactions(userId, limit, offset);
    const total = await economyStorage.getUserExpTransactionCount(userId);

    // 今日經驗統計
    const today = new Date();
    const todayStat = await economyStorage.getUserDailyExpStat(userId, today);

    res.json({
      transactions: transactions.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        eventType: tx.eventType,
        referenceType: tx.referenceType,
        referenceId: tx.referenceId,
        description: tx.description,
        createdAt: tx.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      summary: {
        totalEarned: total,
        todayEarned: todayStat?.totalExp || 0,
        dailyLimit: 120, // 每日經驗上限約 120
      },
    });
  } catch (error) {
    console.error("Error getting experience history:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 成就系統 ============

/**
 * GET /api/user/achievements
 * 取得成就列表
 */
router.get("/user/achievements", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.jwtUser?.userId || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const category = req.query.category as string | undefined;
    const unlockedOnly = req.query.unlockedOnly === "true";

    // 取得所有成就
    let allAchievements = category
      ? await economyStorage.getAchievementsByCategory(category)
      : await economyStorage.getAllAchievements();

    // 取得用戶已解鎖的成就
    const userAchievements = await economyStorage.getUserAchievements(userId);
    const unlockedMap = new Map(userAchievements.map((ua) => [ua.achievementId, ua]));

    // 組合資料
    let achievements = allAchievements.map((a) => {
      const ua = unlockedMap.get(a.id);
      return {
        id: a.id,
        code: a.code,
        category: a.category,
        nameZh: a.nameZh,
        nameEn: a.nameEn,
        description: a.description,
        descriptionEn: a.descriptionEn,
        rarity: a.rarity,
        expReward: a.expReward,
        otherRewards: a.otherRewards,
        isUnlocked: !!ua,
        unlockedAt: ua?.unlockedAt?.toISOString() || null,
        rewardClaimed: ua?.rewardClaimed || false,
      };
    });

    // 篩選已解鎖
    if (unlockedOnly) {
      achievements = achievements.filter((a) => a.isUnlocked);
    }

    // 統計
    const summary = {
      total: allAchievements.length,
      unlocked: userAchievements.length,
      byCategory: {} as Record<string, { total: number; unlocked: number }>,
    };

    const categories = ["collector", "investor", "promoter", "business", "specialist"];
    for (const cat of categories) {
      const catAchievements = allAchievements.filter((a) => a.category === cat);
      const catUnlocked = userAchievements.filter((ua) => ua.achievement.category === cat);
      summary.byCategory[cat] = {
        total: catAchievements.length,
        unlocked: catUnlocked.length,
      };
    }

    res.json({ achievements, summary });
  } catch (error) {
    console.error("Error getting achievements:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * POST /api/user/achievements/:id/claim
 * 領取成就獎勵
 */
router.post("/user/achievements/:id/claim", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.jwtUser?.userId || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const achievementId = parseInt(req.params.id);
    if (isNaN(achievementId)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的成就 ID" });
    }

    // 檢查成就是否存在
    const achievement = await economyStorage.getAchievementById(achievementId);
    if (!achievement) {
      return res.status(404).json({ errorCode: "E10002", message: "成就不存在" });
    }

    // 檢查是否已解鎖
    const hasUnlocked = await economyStorage.hasUserAchievement(userId, achievementId);
    if (!hasUnlocked) {
      return res.status(400).json({ errorCode: "E10003", message: "成就尚未解鎖" });
    }

    // 領取獎勵
    const result = await economyStorage.claimAchievementReward(userId, achievementId);

    if (!result.success) {
      return res.status(400).json({ errorCode: "E10004", message: "獎勵已領取" });
    }

    // 取得更新後的等級資訊
    const userLevel = await economyStorage.getUserLevel(userId);
    const levelDef = userLevel ? await economyStorage.getLevelDefinition(userLevel.currentLevel) : null;
    const perks = await economyStorage.getUserPerks(userId);

    res.json({
      success: true,
      achievement: {
        id: result.achievement!.id,
        code: result.achievement!.code,
        nameZh: result.achievement!.nameZh,
        rarity: result.achievement!.rarity,
      },
      rewards: {
        exp: result.expReward,
        ...result.achievement!.otherRewards,
      },
      newLevel: userLevel ? {
        currentLevel: userLevel.currentLevel,
        currentExp: userLevel.currentExp,
        title: levelDef?.title || "旅人",
        dailyPullLimit: perks.dailyPulls,
        inventorySlots: perks.inventorySlots,
      } : null,
    });
  } catch (error) {
    console.error("Error claiming achievement reward:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 等級定義（公開） ============

/**
 * GET /api/levels
 * 取得所有等級定義（公開）
 */
router.get("/levels", async (req: Request, res: Response) => {
  try {
    const levels = await economyStorage.getUnlockedLevels();

    res.json({
      levels: levels.map((l) => ({
        level: l.level,
        requiredExp: l.requiredExp,
        title: l.title,
        titleEn: l.titleEn,
        isMilestone: l.isMilestone,
        perks: l.perks,
      })),
      maxLevel: 30,
    });
  } catch (error) {
    console.error("Error getting level definitions:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/achievements/all
 * 取得所有成就定義（公開）
 */
router.get("/achievements/all", async (req: Request, res: Response) => {
  try {
    const achievements = await economyStorage.getAllAchievements();

    res.json({
      achievements: achievements.map((a) => ({
        id: a.id,
        code: a.code,
        category: a.category,
        nameZh: a.nameZh,
        nameEn: a.nameEn,
        description: a.description,
        descriptionEn: a.descriptionEn,
        rarity: a.rarity,
        expReward: a.expReward,
        otherRewards: a.otherRewards,
      })),
    });
  } catch (error) {
    console.error("Error getting all achievements:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

export default router;

/**
 * 募資系統路由
 * 處理募資活動、貢獻 API
 */

import { Router, Request, Response } from "express";
import { isAuthenticated } from "../replitAuth";
import * as crowdfundStorage from "../storage/crowdfundStorage";
import * as economyStorage from "../storage/economyStorage";

const router = Router();

// ============ 公開 API ============

/**
 * GET /api/crowdfund/campaigns
 * 取得募資活動列表（公開）
 */
router.get("/crowdfund/campaigns", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;

    let campaigns;
    if (status) {
      campaigns = await crowdfundStorage.getCampaignsByStatus(status);
    } else {
      campaigns = await crowdfundStorage.getAllCampaigns();
    }

    res.json({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        countryCode: c.countryCode,
        countryNameZh: c.countryNameZh,
        countryNameEn: c.countryNameEn,
        goalAmount: c.goalAmount,
        currentAmount: c.currentAmount,
        contributorCount: c.contributorCount,
        progressPercent: Math.round((c.currentAmount / c.goalAmount) * 100),
        estimatedPlaces: c.estimatedPlaces,
        status: c.status,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate?.toISOString() || null,
        launchedAt: c.launchedAt?.toISOString() || null,
        imageUrl: c.imageUrl,
      })),
      total: campaigns.length,
    });
  } catch (error) {
    console.error("Error getting campaigns:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/crowdfund/campaigns/:id
 * 取得募資活動詳情（公開）
 */
router.get("/crowdfund/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);
    if (isNaN(campaignId)) {
      return res.status(400).json({ errorCode: "E5002", message: "無效的活動 ID" });
    }

    const campaign = await crowdfundStorage.getCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ errorCode: "E11001", message: "募資活動不存在" });
    }

    // 取得最近贊助者
    const recentContributors = await crowdfundStorage.getRecentContributors(campaignId, 10);

    // 取得 Top 贊助者
    const topContributors = await crowdfundStorage.getTopContributors(campaignId, 10);

    // 檢查當前用戶的貢獻（如果已登入）
    const userId = (req as any).jwtUser?.sub || (req as any).user?.claims?.sub;
    let myContribution = null;
    if (userId) {
      myContribution = await crowdfundStorage.getUserCampaignContribution(userId, campaignId);
    }

    res.json({
      campaign: {
        id: campaign.id,
        countryCode: campaign.countryCode,
        countryNameZh: campaign.countryNameZh,
        countryNameEn: campaign.countryNameEn,
        goalAmount: campaign.goalAmount,
        currentAmount: campaign.currentAmount,
        contributorCount: campaign.contributorCount,
        progressPercent: Math.round((campaign.currentAmount / campaign.goalAmount) * 100),
        estimatedPlaces: campaign.estimatedPlaces,
        status: campaign.status,
        startDate: campaign.startDate.toISOString(),
        endDate: campaign.endDate?.toISOString() || null,
        launchedAt: campaign.launchedAt?.toISOString() || null,
        description: campaign.description,
        descriptionEn: campaign.descriptionEn,
        imageUrl: campaign.imageUrl,
      },
      myContribution,
      recentContributors: recentContributors.map((c) => ({
        name: maskName(c.displayName),
        amount: c.amount,
        createdAt: c.createdAt.toISOString(),
      })),
      topContributors: topContributors.map((c) => ({
        name: maskName(c.displayName),
        totalAmount: c.totalAmount,
      })),
    });
  } catch (error) {
    console.error("Error getting campaign:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ APP API（需認證）============

/**
 * POST /api/crowdfund/contribute
 * 參與募資（IAP 驗證後）
 */
router.post("/crowdfund/contribute", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.sub || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const { campaignId, amount, paymentMethod, transactionId, receiptData } = req.body;

    // 驗證必填欄位
    if (!campaignId || !amount || !paymentMethod || !transactionId) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少必要欄位" });
    }

    // 驗證金額
    if (amount <= 0) {
      return res.status(400).json({ errorCode: "E11004", message: "無效的貢獻金額" });
    }

    // 檢查活動是否存在且為 active
    const campaign = await crowdfundStorage.getCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ errorCode: "E11001", message: "募資活動不存在" });
    }
    if (campaign.status !== "active") {
      return res.status(400).json({ errorCode: "E11002", message: "募資活動未開放" });
    }

    // 檢查交易 ID 是否重複
    const existingContribution = await crowdfundStorage.getContributionByTransactionId(transactionId);
    if (existingContribution) {
      return res.status(400).json({ errorCode: "E5009", message: "交易已處理" });
    }

    // TODO: 實際驗證 IAP 收據
    // 這裡假設 IAP 驗證通過

    // 建立貢獻記錄
    const contribution = await crowdfundStorage.createContribution({
      campaignId,
      userId,
      amount,
      paymentMethod,
      transactionId,
      receiptData,
    });

    // 驗證通過（實際應該在 IAP 驗證成功後）
    const verified = await crowdfundStorage.verifyContribution(contribution.id);

    // 取得更新後的活動資訊
    const updatedCampaign = await crowdfundStorage.getCampaignById(campaignId);

    // 發放經驗獎勵
    const isFirstContribution = (await crowdfundStorage.getUserContributionSummary(userId)).campaignsSupported === 1;
    let expReward = 100; // 每次參與 100 經驗
    if (isFirstContribution) {
      expReward += 50; // 首次額外 50 經驗
    }

    await economyStorage.addExperience(
      userId,
      expReward,
      "crowdfund_contribute",
      "crowdfund_contribution",
      String(contribution.id),
      `參與「${campaign.countryNameZh}」募資`
    );

    // 檢查是否達標並解鎖成就
    let unlockedAchievement = null;
    if (updatedCampaign?.status === "completed" || campaign.currentAmount + amount >= campaign.goalAmount) {
      // 達標成就
      const achievementCode = "MAP_UNLOCKER";
      const achievement = await economyStorage.getAchievementByCode(achievementCode);
      if (achievement) {
        const unlocked = await economyStorage.unlockAchievement(userId, achievement.id);
        if (unlocked) {
          unlockedAchievement = achievement;
        }
      }
    }

    // 首次參與成就
    if (isFirstContribution) {
      const achievementCode = "PIONEER_FIRST";
      const achievement = await economyStorage.getAchievementByCode(achievementCode);
      if (achievement) {
        await economyStorage.unlockAchievement(userId, achievement.id);
      }
    }

    res.json({
      success: true,
      contribution: {
        id: verified?.id || contribution.id,
        campaignId,
        amount,
        paymentMethod,
        priorityAccessUsed: false,
        createdAt: contribution.createdAt.toISOString(),
      },
      campaign: updatedCampaign ? {
        id: updatedCampaign.id,
        countryCode: updatedCampaign.countryCode,
        countryNameZh: updatedCampaign.countryNameZh,
        currentAmount: updatedCampaign.currentAmount,
        progressPercent: Math.round((updatedCampaign.currentAmount / updatedCampaign.goalAmount) * 100),
        status: updatedCampaign.status,
      } : null,
      rewards: {
        exp: expReward,
        achievement: unlockedAchievement ? {
          id: unlockedAchievement.id,
          code: unlockedAchievement.code,
          nameZh: unlockedAchievement.nameZh,
          rarity: unlockedAchievement.rarity,
        } : undefined,
      },
    });
  } catch (error) {
    console.error("Error contributing:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/crowdfund/my-contributions
 * 取得我的募資記錄
 */
router.get("/crowdfund/my-contributions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.sub || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const contributions = await crowdfundStorage.getContributionsByUser(userId);
    const summary = await crowdfundStorage.getUserContributionSummary(userId);

    res.json({
      contributions: contributions.map((c) => ({
        id: c.id,
        campaign: {
          id: c.campaign.id,
          countryCode: c.campaign.countryCode,
          countryNameZh: c.campaign.countryNameZh,
          countryNameEn: c.campaign.countryNameEn,
          status: c.campaign.status,
        },
        amount: c.amount,
        paymentMethod: c.paymentMethod,
        priorityAccessUsed: c.priorityAccessUsed,
        createdAt: c.createdAt.toISOString(),
      })),
      summary,
    });
  } catch (error) {
    console.error("Error getting contributions:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 官網 API ============

/**
 * POST /api/crowdfund/checkout
 * 建立募資結帳（Stripe）
 */
router.post("/crowdfund/checkout", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.sub || (req as any).user?.claims?.sub;
    const { campaignId, amount, email, name, successUrl, cancelUrl } = req.body;

    // 驗證必填欄位
    if (!campaignId || !amount || !successUrl || !cancelUrl) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少必要欄位" });
    }

    // 未登入時需要 email
    if (!userId && !email) {
      return res.status(400).json({ errorCode: "E5003", message: "未登入時需提供 email" });
    }

    // 驗證金額
    if (amount <= 0) {
      return res.status(400).json({ errorCode: "E11004", message: "無效的貢獻金額" });
    }

    // 檢查活動
    const campaign = await crowdfundStorage.getCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ errorCode: "E11001", message: "募資活動不存在" });
    }
    if (campaign.status !== "active") {
      return res.status(400).json({ errorCode: "E11002", message: "募資活動未開放" });
    }

    // TODO: 實際整合 Stripe Checkout
    // 這裡先回傳模擬資料
    const mockSessionId = `cs_mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 建立 pending 貢獻記錄
    const contribution = await crowdfundStorage.createContribution({
      campaignId,
      userId: userId || undefined,
      email: email || undefined,
      displayName: name || undefined,
      amount,
      paymentMethod: "stripe",
      stripeSessionId: mockSessionId,
    });

    res.json({
      checkoutUrl: `https://checkout.stripe.com/pay/${mockSessionId}`, // 模擬
      sessionId: mockSessionId,
      contributionId: contribution.id,
    });
  } catch (error) {
    console.error("Error creating checkout:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 輔助函數 ============

function maskName(name: string | null): string {
  if (!name) return "匿名";
  if (name.length <= 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

export default router;

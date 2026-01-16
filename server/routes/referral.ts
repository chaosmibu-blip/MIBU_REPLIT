/**
 * 推薦系統路由
 * 處理推薦碼、用戶推薦、商家推薦、餘額、提現 API
 */

import { Router, Request, Response } from "express";
import { isAuthenticated } from "../replitAuth";
import * as referralStorage from "../storage/referralStorage";
import * as economyStorage from "../storage/economyStorage";

const router = Router();

// ============ 推薦碼 API ============

/**
 * GET /api/referral/my-code
 * 取得我的推薦碼
 */
router.get("/referral/my-code", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const referralCode = await referralStorage.getOrCreateReferralCode(userId);
    const stats = await referralStorage.getReferralStats(userId);

    res.json({
      code: `MIBU${referralCode.code}`,
      shortCode: referralCode.code,
      inviteLink: `https://mibu.app/invite/${referralCode.code}`,
      stats,
    });
  } catch (error) {
    console.error("Error getting referral code:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/referral/validate/:code
 * 驗證推薦碼
 */
router.get("/referral/validate/:code", async (req: Request, res: Response) => {
  try {
    const code = req.params.code.toUpperCase().replace('MIBU', '');

    const referralCode = await referralStorage.getReferralCodeByCode(code);
    if (!referralCode) {
      return res.status(404).json({ errorCode: "E12001", message: "推薦碼不存在" });
    }

    res.json({
      valid: true,
      code: `MIBU${referralCode.code}`,
    });
  } catch (error) {
    console.error("Error validating referral code:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 用戶推薦 API ============

/**
 * POST /api/referral/apply
 * 使用推薦碼（註冊時）
 */
router.post("/referral/apply", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少推薦碼" });
    }

    // 檢查是否已被推薦過
    const existingReferral = await referralStorage.getUserReferralByRefereeId(userId);
    if (existingReferral) {
      return res.status(400).json({ errorCode: "E12002", message: "您已使用過推薦碼" });
    }

    // 驗證推薦碼
    const shortCode = code.toUpperCase().replace('MIBU', '');
    const referralCode = await referralStorage.getReferralCodeByCode(shortCode);
    if (!referralCode) {
      return res.status(404).json({ errorCode: "E12001", message: "推薦碼不存在" });
    }

    // 不能推薦自己
    if (referralCode.userId === userId) {
      return res.status(400).json({ errorCode: "E12003", message: "不能使用自己的推薦碼" });
    }

    // 建立推薦關係
    const referral = await referralStorage.createUserReferral(referralCode.userId, userId);

    // 發放獎勵給推薦人
    await economyStorage.addExperience(
      referralCode.userId,
      referralStorage.REFERRAL_REWARDS.USER_REGISTER_REFERRER_EXP,
      "referral_user_register",
      "user_referral",
      String(referral.id),
      "推薦新用戶註冊"
    );

    // 發放獎勵給被推薦人
    await economyStorage.addExperience(
      userId,
      referralStorage.REFERRAL_REWARDS.USER_REGISTER_REFEREE_EXP,
      "referral_referee_bonus",
      "user_referral",
      String(referral.id),
      "使用推薦碼註冊獎勵"
    );

    // 檢查推薦成就
    const stats = await referralStorage.getReferralStats(referralCode.userId);
    if (stats.totalReferrals === 3) {
      const achievement = await economyStorage.getAchievementByCode("WORD_OF_MOUTH");
      if (achievement) {
        await economyStorage.unlockAchievement(referralCode.userId, achievement.id);
      }
    }

    res.json({
      success: true,
      referral: {
        id: referral.id,
        referrerId: referral.referrerId,
        status: referral.status,
      },
      rewards: {
        exp: referralStorage.REFERRAL_REWARDS.USER_REGISTER_REFEREE_EXP,
      },
    });
  } catch (error) {
    console.error("Error applying referral code:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/referral/my-referrals
 * 我推薦的人列表
 */
router.get("/referral/my-referrals", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const referrals = await referralStorage.getReferralsByReferrerId(userId);
    const stats = await referralStorage.getReferralStats(userId);

    res.json({
      referrals: referrals.map((r) => ({
        id: r.id,
        displayName: maskName(r.referee?.displayName),
        status: r.status,
        registeredAt: r.registeredAt.toISOString(),
        activatedAt: r.activatedAt?.toISOString() || null,
      })),
      stats,
    });
  } catch (error) {
    console.error("Error getting referrals:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/referral/my-referrer
 * 誰推薦了我
 */
router.get("/referral/my-referrer", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const referral = await referralStorage.getUserReferralByRefereeId(userId);
    if (!referral) {
      return res.json({ hasReferrer: false });
    }

    res.json({
      hasReferrer: true,
      referral: {
        id: referral.id,
        status: referral.status,
        registeredAt: referral.registeredAt.toISOString(),
        activatedAt: referral.activatedAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("Error getting referrer:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 商家推薦 API ============

/**
 * POST /api/referral/merchant
 * 提交商家推薦
 */
router.post("/referral/merchant", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const { merchantName, address, city, country, category, contactInfo, googlePlaceId, notes } = req.body;

    // 驗證必填欄位
    if (!merchantName || !address || !city || !category) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少必要欄位" });
    }

    // 檢查重複（如果有 Google Place ID）
    if (googlePlaceId) {
      const existing = await referralStorage.checkDuplicateMerchantReferral(googlePlaceId);
      if (existing) {
        return res.status(400).json({ errorCode: "E12004", message: "此商家已被推薦過" });
      }
    }

    const referral = await referralStorage.createMerchantReferral({
      referrerId: userId,
      merchantName,
      address,
      city,
      country,
      category,
      contactInfo,
      googlePlaceId,
      notes,
    });

    res.json({
      success: true,
      referral: {
        id: referral.id,
        merchantName: referral.merchantName,
        status: referral.status,
        createdAt: referral.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating merchant referral:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/referral/my-merchant-referrals
 * 我推薦的商家列表
 */
router.get("/referral/my-merchant-referrals", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const referrals = await referralStorage.getMerchantReferralsByReferrerId(userId);

    // 計算統計
    const stats = {
      total: referrals.length,
      pending: referrals.filter(r => r.status === 'pending').length,
      approved: referrals.filter(r => r.status === 'approved').length,
      merchantRegistered: referrals.filter(r => r.status === 'merchant_registered').length,
      rejected: referrals.filter(r => r.status === 'rejected').length,
    };

    res.json({
      referrals: referrals.map((r) => ({
        id: r.id,
        merchantName: r.merchantName,
        city: r.city,
        category: r.category,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() || null,
        rejectionReason: r.rejectionReason,
      })),
      stats,
    });
  } catch (error) {
    console.error("Error getting merchant referrals:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 餘額 API ============

/**
 * GET /api/referral/balance
 * 我的餘額
 */
router.get("/referral/balance", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const balance = await referralStorage.getOrCreateUserBalance(userId);

    res.json({
      availableBalance: balance.availableBalance,
      pendingBalance: balance.pendingBalance,
      lifetimeEarned: balance.lifetimeEarned,
      lifetimeWithdrawn: balance.lifetimeWithdrawn,
    });
  } catch (error) {
    console.error("Error getting balance:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/referral/transactions
 * 獎勵/提現記錄
 */
router.get("/referral/transactions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = await referralStorage.getBalanceTransactions(userId, limit, offset);
    const total = await referralStorage.getBalanceTransactionCount(userId);

    res.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + transactions.length < total,
      },
    });
  } catch (error) {
    console.error("Error getting transactions:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 提現 API ============

/**
 * POST /api/referral/withdraw
 * 申請提現
 */
router.post("/referral/withdraw", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const { amount, bankCode, bankAccount, accountName } = req.body;

    // 驗證必填欄位
    if (!amount || !bankCode || !bankAccount || !accountName) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少必要欄位" });
    }

    // 驗證金額
    if (amount < 100) {
      return res.status(400).json({ errorCode: "E12005", message: "最低提現金額為 NT$ 100" });
    }

    // 檢查是否有待處理的提現
    const hasPending = await referralStorage.hasPendingWithdrawal(userId);
    if (hasPending) {
      return res.status(400).json({ errorCode: "E12006", message: "您有待處理的提現申請" });
    }

    // 建立提現申請
    const request = await referralStorage.createWithdrawalRequest({
      userId,
      amount,
      bankCode,
      bankAccount,
      accountName,
    });

    if (!request) {
      return res.status(400).json({ errorCode: "E12007", message: "餘額不足" });
    }

    res.json({
      success: true,
      withdrawal: {
        id: request.id,
        amount: request.amount,
        fee: request.fee,
        netAmount: request.netAmount,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating withdrawal:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/referral/withdraw/history
 * 提現歷史
 */
router.get("/referral/withdraw/history", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const requests = await referralStorage.getWithdrawalRequestsByUserId(userId);

    res.json({
      withdrawals: requests.map((r) => ({
        id: r.id,
        amount: r.amount,
        fee: r.fee,
        netAmount: r.netAmount,
        bankCode: r.bankCode,
        bankAccount: maskBankAccount(r.bankAccount),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        processedAt: r.processedAt?.toISOString() || null,
        rejectionReason: r.rejectionReason,
      })),
    });
  } catch (error) {
    console.error("Error getting withdrawal history:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 輔助函數 ============

function maskName(name: string | null): string {
  if (!name) return "匿名";
  if (name.length <= 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

function maskBankAccount(account: string): string {
  if (account.length <= 4) return "****";
  return "****" + account.slice(-4);
}

export default router;

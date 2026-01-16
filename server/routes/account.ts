/**
 * 帳號系統路由
 * 處理策劃師申請、訪客遷移、帳號連結 API
 */

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { isAuthenticated } from "../replitAuth";
import * as accountStorage from "../storage/accountStorage";
import * as economyStorage from "../storage/economyStorage";

const router = Router();

// ============ 策劃師申請 API ============

/**
 * GET /api/specialist/eligibility
 * 檢查策劃師申請資格
 */
router.get("/specialist/eligibility", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const eligibility = await accountStorage.checkSpecialistEligibility(userId);

    res.json({
      isEligible: eligibility.isEligible,
      currentLevel: eligibility.currentLevel,
      requiredLevel: accountStorage.SPECIALIST_REQUIRED_LEVEL,
      hasApplied: eligibility.hasApplied,
      isSpecialist: eligibility.isSpecialist,
    });
  } catch (error) {
    console.error("Error checking specialist eligibility:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * POST /api/specialist/apply
 * 申請成為策劃師
 */
router.post("/specialist/apply", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const { realName, regions, introduction, contactInfo } = req.body;

    // 驗證必填欄位
    if (!realName || !regions || !introduction || !contactInfo) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少必要欄位" });
    }

    // 驗證 regions 是陣列
    if (!Array.isArray(regions) || regions.length === 0) {
      return res.status(400).json({ errorCode: "E5002", message: "請選擇至少一個擅長地區" });
    }

    // 檢查資格
    const eligibility = await accountStorage.checkSpecialistEligibility(userId);
    if (!eligibility.isEligible) {
      if (eligibility.isSpecialist) {
        return res.status(400).json({ errorCode: "E14001", message: "您已是策劃師" });
      }
      if (eligibility.hasApplied) {
        return res.status(400).json({ errorCode: "E14002", message: "您已有待審核的申請" });
      }
      if (eligibility.currentLevel < accountStorage.SPECIALIST_REQUIRED_LEVEL) {
        return res.status(400).json({
          errorCode: "E14003",
          message: `需要達到 Lv.${accountStorage.SPECIALIST_REQUIRED_LEVEL} 才能申請`,
        });
      }
    }

    // 建立申請
    const application = await accountStorage.createSpecialistApplication({
      userId,
      realName,
      regions,
      introduction,
      contactInfo,
    });

    res.json({
      success: true,
      application: {
        id: application.id,
        status: application.status,
        createdAt: application.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating specialist application:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * GET /api/specialist/application-status
 * 查詢申請狀態
 */
router.get("/specialist/application-status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const application = await accountStorage.getSpecialistApplicationByUserId(userId);

    if (!application) {
      return res.json({
        status: "none",
        application: null,
      });
    }

    res.json({
      status: application.status,
      application: {
        id: application.id,
        realName: application.realName,
        regions: application.regions,
        createdAt: application.createdAt.toISOString(),
        reviewedAt: application.reviewedAt?.toISOString() || null,
        rejectionReason: application.rejectionReason,
      },
    });
  } catch (error) {
    console.error("Error getting application status:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * POST /api/specialist/mark-invited
 * 標記已顯示邀請彈窗
 */
router.post("/specialist/mark-invited", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    await accountStorage.markSpecialistInvited(userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking specialist invited:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 訪客遷移 API ============

/**
 * POST /api/auth/migrate-guest
 * 遷移訪客帳號資料到新帳號
 */
router.post("/auth/migrate-guest", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const newUserId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!newUserId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const { guestToken } = req.body;
    if (!guestToken) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少訪客 Token" });
    }

    // 驗證 guest token
    let guestUserId: string;
    try {
      const decoded = jwt.verify(guestToken, process.env.JWT_SECRET || "mibu_jwt_secret") as any;
      guestUserId = decoded.userId;
    } catch (error) {
      return res.status(400).json({ errorCode: "E1002", message: "無效的訪客 Token" });
    }

    // 確認是訪客帳號
    if (!guestUserId.startsWith("guest_")) {
      return res.status(400).json({ errorCode: "E14004", message: "此 Token 不是訪客帳號" });
    }

    // 不能遷移到自己
    if (guestUserId === newUserId) {
      return res.status(400).json({ errorCode: "E14005", message: "無法遷移到相同帳號" });
    }

    // 執行遷移
    const migration = await accountStorage.migrateGuestAccount(guestUserId, newUserId);
    if (!migration) {
      return res.status(400).json({ errorCode: "E14006", message: "此訪客帳號已遷移過" });
    }

    res.json({
      success: true,
      migration: {
        guestUserId: migration.guestUserId,
        newUserId: migration.newUserId,
        migratedCollections: migration.migratedCollections,
        migratedInventory: migration.migratedInventory,
        migratedNotifications: migration.migratedNotifications,
      },
    });
  } catch (error) {
    console.error("Error migrating guest:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 帳號連結 API ============

/**
 * GET /api/auth/linked-accounts
 * 取得已連結的帳號
 */
router.get("/auth/linked-accounts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const identities = await accountStorage.getAuthIdentitiesByUserId(userId);

    res.json({
      accounts: identities.map((i) => ({
        provider: i.provider,
        email: i.email,
        emailVerified: i.emailVerified,
        linkedAt: i.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error getting linked accounts:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * POST /api/auth/link
 * 連結新的登入方式
 */
router.post("/auth/link", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const { provider, providerUserId, email, idToken } = req.body;

    // 驗證必填欄位
    if (!provider || !providerUserId) {
      return res.status(400).json({ errorCode: "E5003", message: "缺少必要欄位" });
    }

    // 驗證 provider
    const validProviders = ["google", "apple"];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ errorCode: "E5002", message: "不支援的登入方式" });
    }

    // TODO: 驗證 idToken（實際應該驗證 Google/Apple 的 ID Token）
    // 這裡假設已驗證通過

    // 連結帳號
    const identity = await accountStorage.linkAuthIdentity(
      userId,
      provider,
      providerUserId,
      email
    );

    if (!identity) {
      return res.status(400).json({ errorCode: "E14007", message: "此帳號已綁定到其他用戶" });
    }

    res.json({
      success: true,
      account: {
        provider: identity.provider,
        email: identity.email,
        linkedAt: identity.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error linking account:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

/**
 * DELETE /api/auth/unlink/:provider
 * 解除連結
 */
router.delete("/auth/unlink/:provider", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const provider = req.params.provider;

    const success = await accountStorage.unlinkAuthIdentity(userId, provider);
    if (!success) {
      return res.status(400).json({ errorCode: "E14008", message: "無法解除最後一個登入方式" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error unlinking account:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

// ============ 帳號資訊 API ============

/**
 * GET /api/account/profile
 * 取得帳號資訊
 */
router.get("/account/profile", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).jwtUser?.userId || (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ errorCode: "E1001", message: "請先登入" });
    }

    const user = await accountStorage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ errorCode: "E1003", message: "用戶不存在" });
    }

    const userLevel = await economyStorage.getOrCreateUserLevel(userId);
    const linkedAccounts = await accountStorage.getAuthIdentitiesByUserId(userId);
    const specialistStatus = await accountStorage.getSpecialistApplicationByUserId(userId);
    const isSpecialist = await accountStorage.isUserSpecialist(userId);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        roles: user.roles || [],
        createdAt: user.createdAt.toISOString(),
      },
      level: {
        currentLevel: userLevel.currentLevel,
        currentExp: userLevel.currentExp,
      },
      linkedAccounts: linkedAccounts.map((a) => ({
        provider: a.provider,
        email: a.email,
      })),
      specialist: {
        isSpecialist,
        applicationStatus: specialistStatus?.status || "none",
      },
    });
  } catch (error) {
    console.error("Error getting account profile:", error);
    res.status(500).json({ errorCode: "E9001", message: "伺服器錯誤" });
  }
});

export default router;

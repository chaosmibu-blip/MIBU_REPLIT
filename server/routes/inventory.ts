import { Router, Request, Response } from "express";
import { isAuthenticated } from "../replitAuth";
import { gachaStorage } from "../storage/gachaStorage";
import { storage } from "../storage";
import { INVENTORY_MAX_SLOTS } from "@shared/schema";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

/**
 * GET /api/inventory/capacity
 * 取得用戶道具箱容量狀態
 */
router.get("/capacity", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const used = await gachaStorage.getInventorySlotCount(userId);
    const isFull = used >= INVENTORY_MAX_SLOTS;

    res.json({
      used,
      max: INVENTORY_MAX_SLOTS,
      available: INVENTORY_MAX_SLOTS - used,
      isFull,
    });
  } catch (error) {
    console.error("Get inventory capacity error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得道具箱容量'));
  }
});

/**
 * GET /api/inventory
 * 取得用戶所有道具箱物品
 */
router.get("/", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const items = await gachaStorage.getUserInventory(userId);
    const unreadCount = await gachaStorage.getUnreadInventoryCount(userId);

    res.json({
      items,
      count: items.length,
      max: INVENTORY_MAX_SLOTS,
      unreadCount,
    });
  } catch (error) {
    console.error("Get inventory error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得道具箱'));
  }
});

/**
 * GET /api/inventory/expiring
 * 取得即將過期的優惠券
 */
router.get("/expiring", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const days = parseInt(req.query.days as string) || 7;
    const items = await gachaStorage.getExpiringInventoryItems(userId, days);

    res.json({
      items,
      count: items.length,
      withinDays: days,
    });
  } catch (error) {
    console.error("Get expiring inventory error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得即將過期的道具'));
  }
});

/**
 * GET /api/inventory/:id
 * 取得單一道具詳情
 */
router.get("/:id", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的道具 ID'));
    }

    const item = await gachaStorage.getInventoryItemById(itemId, userId);
    if (!item) {
      return res.status(404).json(createErrorResponse(ErrorCode.INVENTORY_ITEM_NOT_FOUND));
    }

    // 標記為已讀
    if (!item.isRead) {
      await gachaStorage.markInventoryItemRead(itemId);
    }

    res.json({ item });
  } catch (error) {
    console.error("Get inventory item error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得道具'));
  }
});

/**
 * POST /api/inventory/:id/redeem
 * 核銷優惠券道具
 * 參數: { dailyCode: "ABC123" }
 */
router.post("/:id/redeem", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const itemId = parseInt(req.params.id);
    const { dailyCode } = req.body;

    if (isNaN(itemId)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的道具 ID'));
    }

    if (!dailyCode) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, '需要提供核銷碼'));
    }

    // 1. 驗證道具屬於用戶且未核銷
    const item = await gachaStorage.getInventoryItemById(itemId, userId);
    if (!item) {
      return res.status(404).json(createErrorResponse(ErrorCode.INVENTORY_ITEM_NOT_FOUND));
    }

    if (item.isRedeemed) {
      return res.status(400).json(createErrorResponse(ErrorCode.COUPON_ALREADY_USED, '此優惠券已核銷'));
    }

    if (item.isExpired) {
      return res.status(400).json(createErrorResponse(ErrorCode.COUPON_EXPIRED, '此優惠券已過期'));
    }

    // 2. 從 item 自動取得 merchantId
    const merchantId = item.merchantId;
    if (!merchantId) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '此優惠券無關聯商家'));
    }

    // 3. 驗證商家核銷碼
    const codeData = await storage.getMerchantDailySeedCode(merchantId);
    if (!codeData) {
      return res.status(404).json(createErrorResponse(ErrorCode.NO_CODE_SET, '商家尚未設定核銷碼'));
    }

    const today = new Date().toDateString();
    const codeDate = new Date(codeData.updatedAt).toDateString();
    if (codeDate !== today) {
      return res.status(400).json(createErrorResponse(ErrorCode.CODE_EXPIRED, '核銷碼已過期'));
    }

    if (codeData.seedCode.toUpperCase() !== dailyCode.toUpperCase()) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_CODE, '核銷碼錯誤'));
    }

    // 4. 執行核銷
    const redeemed = await gachaStorage.redeemInventoryItem(itemId, userId);
    if (!redeemed) {
      return res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '核銷失敗'));
    }

    res.json({
      success: true,
      message: '核銷成功',
      item: redeemed,
    });
  } catch (error) {
    console.error("Redeem inventory item error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '核銷失敗'));
  }
});

/**
 * DELETE /api/inventory/:id
 * 刪除/丟棄道具
 */
router.delete("/:id", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的道具 ID'));
    }

    const item = await gachaStorage.getInventoryItemById(itemId, userId);
    if (!item) {
      return res.status(404).json(createErrorResponse(ErrorCode.INVENTORY_ITEM_NOT_FOUND));
    }

    await gachaStorage.softDeleteInventoryItem(itemId, userId);

    res.json({ success: true, message: '道具已丟棄' });
  } catch (error) {
    console.error("Delete inventory item error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '刪除失敗'));
  }
});

export default router;

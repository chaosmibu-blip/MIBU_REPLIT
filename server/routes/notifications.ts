import { Router } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

/**
 * GET /api/notifications
 * 取得用戶未讀通知狀態（紅點顯示用）
 *
 * Response:
 * {
 *   itembox: boolean,      // 道具箱是否有未讀
 *   collection: boolean,   // 圖鑑是否有未讀
 *   announcement: boolean  // 公告是否有未讀
 * }
 */
router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    // 取得各類型的未讀數量
    const [itemboxCount, collectionCount, announcementCount] = await Promise.all([
      storage.getUnreadNotificationCount(userId, 'itembox'),
      storage.getUnreadNotificationCount(userId, 'collection'),
      storage.getUnreadNotificationCount(userId, 'announcement'),
    ]);

    // 返回布林值表示是否有未讀（紅點顯示）
    res.json({
      itembox: itemboxCount > 0,
      collection: collectionCount > 0,
      announcement: announcementCount > 0,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得通知狀態'));
  }
});

/**
 * POST /api/notifications/:type/seen
 * 標記特定類型的通知為已讀
 *
 * type: 'itembox' | 'collection' | 'announcement'
 */
router.post("/:type/seen", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { type } = req.params;
    const validTypes = ['itembox', 'collection', 'announcement'];

    if (!validTypes.includes(type)) {
      return res.status(400).json(createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        `無效的通知類型，有效值: ${validTypes.join(', ')}`
      ));
    }

    await storage.markNotificationsRead(userId, type);

    res.json({ success: true });
  } catch (error) {
    console.error("Mark notification seen error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法標記已讀'));
  }
});

export default router;

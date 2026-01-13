import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../replitAuth";
import { z } from "zod";
import { hasAdminAccess } from "./shared";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

router.get("/announcements", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));
    }

    const announcements = await storage.getAllAnnouncements();
    res.json({ announcements });
  } catch (error) {
    console.error("Get announcements error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得公告失敗'));
  }
});

router.post("/announcements", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));
    }

    const schema = z.object({
      type: z.enum(['announcement', 'flash_event', 'holiday_event']).default('announcement'),
      title: z.string().min(1),
      content: z.string().min(1),
      imageUrl: z.string().url().optional().nullable(),
      linkUrl: z.string().url().optional().nullable(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional().nullable(),
      isActive: z.boolean().default(true),
      priority: z.number().int().default(0),
    });

    const validated = schema.parse(req.body);

    const announcement = await storage.createAnnouncement({
      ...validated,
      startDate: validated.startDate ? new Date(validated.startDate) : new Date(),
      endDate: validated.endDate ? new Date(validated.endDate) : null,
      createdBy: userId,
    });

    res.json({ success: true, announcement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', error.errors));
    }
    console.error("Create announcement error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '建立公告失敗'));
  }
});

router.patch("/announcements/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));
    }

    const announcementId = parseInt(req.params.id);
    const schema = z.object({
      type: z.enum(['announcement', 'flash_event', 'holiday_event']).optional(),
      title: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
      imageUrl: z.string().url().optional().nullable(),
      linkUrl: z.string().url().optional().nullable(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional().nullable(),
      isActive: z.boolean().optional(),
      priority: z.number().int().optional(),
    });

    const validated = schema.parse(req.body);

    const updateData: any = { ...validated };
    if (validated.startDate) updateData.startDate = new Date(validated.startDate);
    if (validated.endDate) updateData.endDate = new Date(validated.endDate);

    const announcement = await storage.updateAnnouncement(announcementId, updateData);

    if (!announcement) {
      return res.status(404).json(createErrorResponse(ErrorCode.ANNOUNCEMENT_NOT_FOUND));
    }

    res.json({ success: true, announcement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', error.errors));
    }
    console.error("Update announcement error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '更新公告失敗'));
  }
});

router.delete("/announcements/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));
    }

    const announcementId = parseInt(req.params.id);
    await storage.deleteAnnouncement(announcementId);

    res.json({ success: true, message: "Announcement deleted" });
  } catch (error) {
    console.error("Delete announcement error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '刪除公告失敗'));
  }
});

router.post("/announcements/cleanup", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));
    }

    const deletedCount = await storage.deleteExpiredEvents();

    res.json({ success: true, deletedCount, message: `Deleted ${deletedCount} expired events` });
  } catch (error) {
    console.error("Cleanup expired events error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '清理過期活動失敗'));
  }
});

export default router;

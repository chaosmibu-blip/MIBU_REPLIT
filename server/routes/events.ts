import { Router } from "express";
import { z } from "zod";
import { eventStorage } from "../storage";
import { isAuthenticated, requireRole } from "../replitAuth";
import { ErrorCode, createErrorResponse } from "@shared/errors";
import { crawlAllSources, crawlSingleSource } from "../services/eventCrawler";

const router = Router();
const adminRouter = Router();

// ============ 公開 API (APP/官網使用) ============

// 取得已審核的活動列表
router.get("/", async (req, res) => {
  try {
    const querySchema = z.object({
      type: z.enum(["announcement", "festival", "limited"]).optional(),
      city: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    });

    const { type, city, limit, offset } = querySchema.parse(req.query);

    const events = await eventStorage.getApprovedEvents({
      eventType: type,
      city,
      limit,
      offset,
    });

    res.json({
      success: true,
      events,
    });
  } catch (error: any) {
    console.error("[Events] Get events error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "參數錯誤"));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法取得活動"));
  }
});

// 取得單一活動詳情
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "無效的活動 ID"));
    }

    const event = await eventStorage.getEvent(id);
    if (!event || event.status !== "approved") {
      return res.status(404).json(createErrorResponse(ErrorCode.NOT_FOUND, "活動不存在"));
    }

    // 增加瀏覽次數
    await eventStorage.incrementViewCount(id);

    res.json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("[Events] Get event error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法取得活動"));
  }
});

// ============ 管理員 API ============

// 取得所有活動（含未審核）
adminRouter.get("/", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const querySchema = z.object({
      status: z.enum(["pending", "approved", "rejected", "expired"]).optional(),
      type: z.enum(["announcement", "festival", "limited"]).optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    });

    const { status, type, limit, offset } = querySchema.parse(req.query);

    const result = await eventStorage.getAllEventsAdmin({
      status,
      eventType: type,
      limit,
      offset,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[Events Admin] Get events error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "參數錯誤"));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法取得活動"));
  }
});

// 取得活動統計
adminRouter.get("/stats", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const stats = await eventStorage.getEventStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("[Events Admin] Get stats error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法取得統計"));
  }
});

// 取得待審核活動
adminRouter.get("/pending", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const events = await eventStorage.getPendingEvents();
    res.json({
      success: true,
      events,
    });
  } catch (error) {
    console.error("[Events Admin] Get pending error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法取得待審核活動"));
  }
});

// 手動新增活動
adminRouter.post("/", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const createSchema = z.object({
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      eventType: z.enum(["announcement", "festival", "limited"]),
      location: z.string().optional(),
      locationCity: z.string().optional(),
      locationDistrict: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      imageUrl: z.string().url().optional(),
      sourceUrl: z.string().url().optional(),
      priority: z.number().min(0).max(100).default(0),
      isSticky: z.boolean().default(false),
      status: z.enum(["pending", "approved"]).default("approved"),
    });

    const data = createSchema.parse(req.body);
    const userId = req.jwtUser?.userId || req.user?.claims?.sub;

    const event = await eventStorage.createEvent({
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      createdBy: userId,
      createdByType: "admin",
      reviewedBy: data.status === "approved" ? userId : undefined,
      reviewedAt: data.status === "approved" ? new Date() : undefined,
    });

    res.json({
      success: true,
      event,
    });
  } catch (error: any) {
    console.error("[Events Admin] Create error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "資料格式錯誤"));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法建立活動"));
  }
});

// 更新活動
adminRouter.put("/:id", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "無效的活動 ID"));
    }

    const updateSchema = z.object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      eventType: z.enum(["announcement", "festival", "limited"]).optional(),
      location: z.string().optional(),
      locationCity: z.string().optional(),
      locationDistrict: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      imageUrl: z.string().url().optional().nullable(),
      sourceUrl: z.string().url().optional().nullable(),
      priority: z.number().min(0).max(100).optional(),
      isSticky: z.boolean().optional(),
    });

    const data = updateSchema.parse(req.body);

    const event = await eventStorage.updateEvent(id, {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    });

    if (!event) {
      return res.status(404).json(createErrorResponse(ErrorCode.NOT_FOUND, "活動不存在"));
    }

    res.json({
      success: true,
      event,
    });
  } catch (error: any) {
    console.error("[Events Admin] Update error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "資料格式錯誤"));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法更新活動"));
  }
});

// 審核通過
adminRouter.post("/:id/approve", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "無效的活動 ID"));
    }

    const userId = req.jwtUser?.userId || req.user?.claims?.sub;
    const event = await eventStorage.approveEvent(id, userId);

    if (!event) {
      return res.status(404).json(createErrorResponse(ErrorCode.NOT_FOUND, "活動不存在"));
    }

    res.json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("[Events Admin] Approve error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法審核活動"));
  }
});

// 審核拒絕
adminRouter.post("/:id/reject", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "無效的活動 ID"));
    }

    const rejectSchema = z.object({
      reason: z.string().optional(),
    });

    const { reason } = rejectSchema.parse(req.body);
    const userId = req.jwtUser?.userId || req.user?.claims?.sub;
    const event = await eventStorage.rejectEvent(id, userId, reason);

    if (!event) {
      return res.status(404).json(createErrorResponse(ErrorCode.NOT_FOUND, "活動不存在"));
    }

    res.json({
      success: true,
      event,
    });
  } catch (error: any) {
    console.error("[Events Admin] Reject error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "資料格式錯誤"));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法拒絕活動"));
  }
});

// 刪除活動
adminRouter.delete("/:id", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "無效的活動 ID"));
    }

    await eventStorage.deleteEvent(id);

    res.json({
      success: true,
      message: "活動已刪除",
    });
  } catch (error) {
    console.error("[Events Admin] Delete error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法刪除活動"));
  }
});

// ============ 爬蟲來源管理 ============

// 取得所有爬蟲來源
adminRouter.get("/sources", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const sources = await eventStorage.getAllEventSources();
    res.json({
      success: true,
      sources,
    });
  } catch (error) {
    console.error("[Events Admin] Get sources error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法取得爬蟲來源"));
  }
});

// 新增爬蟲來源
adminRouter.post("/sources", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const createSchema = z.object({
      name: z.string().min(1).max(100),
      url: z.string().url(),
      sourceType: z.enum(["festival", "limited", "both"]),
      description: z.string().optional(),
      crawlSelector: z.string().optional(),
    });

    const data = createSchema.parse(req.body);
    const userId = req.jwtUser?.userId || req.user?.claims?.sub;

    const source = await eventStorage.createEventSource({
      ...data,
      createdBy: userId,
    });

    res.json({
      success: true,
      source,
    });
  } catch (error: any) {
    console.error("[Events Admin] Create source error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "資料格式錯誤"));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法建立爬蟲來源"));
  }
});

// 更新爬蟲來源
adminRouter.put("/sources/:id", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "無效的來源 ID"));
    }

    const updateSchema = z.object({
      name: z.string().min(1).max(100).optional(),
      url: z.string().url().optional(),
      sourceType: z.enum(["festival", "limited", "both"]).optional(),
      description: z.string().optional(),
      crawlSelector: z.string().optional(),
      isActive: z.boolean().optional(),
    });

    const data = updateSchema.parse(req.body);
    const source = await eventStorage.updateEventSource(id, data);

    if (!source) {
      return res.status(404).json(createErrorResponse(ErrorCode.NOT_FOUND, "來源不存在"));
    }

    res.json({
      success: true,
      source,
    });
  } catch (error: any) {
    console.error("[Events Admin] Update source error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "資料格式錯誤"));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法更新爬蟲來源"));
  }
});

// 刪除爬蟲來源
adminRouter.delete("/sources/:id", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "無效的來源 ID"));
    }

    await eventStorage.deleteEventSource(id);

    res.json({
      success: true,
      message: "來源已刪除",
    });
  } catch (error) {
    console.error("[Events Admin] Delete source error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "無法刪除爬蟲來源"));
  }
});

// ============ 爬蟲控制 ============

// 手動觸發所有來源爬取
adminRouter.post("/crawl", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    console.log("[Events Admin] Manual crawl triggered by admin");
    const result = await crawlAllSources();

    res.json({
      success: true,
      message: "爬蟲執行完成",
      ...result,
    });
  } catch (error: any) {
    console.error("[Events Admin] Manual crawl error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "爬蟲執行失敗: " + error.message));
  }
});

// 手動觸發單一來源爬取
adminRouter.post("/sources/:id/crawl", isAuthenticated, requireRole(["admin"]), async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "無效的來源 ID"));
    }

    console.log(`[Events Admin] Manual crawl for source ${id} triggered by admin`);
    const result = await crawlSingleSource(id);

    res.json({
      success: result.success,
      message: result.success ? "爬蟲執行完成" : "爬蟲執行失敗",
      eventsFound: result.eventsFound,
      eventsCreated: result.eventsCreated,
      error: result.error,
    });
  } catch (error: any) {
    console.error("[Events Admin] Manual source crawl error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, "爬蟲執行失敗: " + error.message));
  }
});

export { adminRouter as eventsAdminRouter };
export default router;

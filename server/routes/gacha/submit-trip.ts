import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { gachaAiLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { verifyJwtToken } from "../../replitAuth";

const router = Router();

const jwtAuth = (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false,
      error: "Missing or invalid Authorization header",
      message: "請提供有效的認證 token",
    });
  }
  const token = authHeader.substring(7);
  const decoded = verifyJwtToken(token);
  if (!decoded) {
    return res.status(401).json({ 
      success: false,
      error: "Invalid token",
      message: "Token 無效或已過期",
    });
  }
  req.userId = decoded.sub;
  next();
};

router.post("/submit-trip", jwtAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { sessionId, tripImageUrl } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required",
        message: "請提供扭蛋 session ID",
      });
    }

    if (!tripImageUrl) {
      return res.status(400).json({
        success: false,
        error: "tripImageUrl is required",
        message: "請提供行程截圖 URL",
      });
    }

    const [existingLog] = await db
      .select()
      .from(gachaAiLogs)
      .where(eq(gachaAiLogs.sessionId, sessionId))
      .limit(1);

    if (!existingLog) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
        message: "找不到該扭蛋記錄",
      });
    }

    if (existingLog.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized",
        message: "無權限修改此記錄",
      });
    }

    const [updated] = await db
      .update(gachaAiLogs)
      .set({
        tripImageUrl,
        isPublished: true,
        publishedAt: new Date(),
      })
      .where(eq(gachaAiLogs.sessionId, sessionId))
      .returning();

    res.json({
      success: true,
      message: "行程已成功提交",
      trip: {
        sessionId: updated.sessionId,
        city: updated.city,
        district: updated.district,
        tripImageUrl: updated.tripImageUrl,
        aiReason: updated.aiReason,
        isPublished: updated.isPublished,
        publishedAt: updated.publishedAt,
      },
    });
  } catch (error) {
    console.error("Error submitting trip:", error);
    res.status(500).json({
      success: false,
      error: "Failed to submit trip",
      message: "提交失敗，請稍後再試",
    });
  }
});

export default router;

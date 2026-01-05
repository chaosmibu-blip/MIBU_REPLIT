import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../replitAuth";
import { insertAdPlacementSchema } from "@shared/schema";
import { z } from "zod";
import { hasAdminAccess } from "./shared";

const router = Router();

router.get("/announcements", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const announcements = await storage.getAllAnnouncements();
    res.json({ announcements });
  } catch (error) {
    console.error("Get announcements error:", error);
    res.status(500).json({ error: "Failed to get announcements" });
  }
});

router.post("/announcements", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
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
      return res.status(400).json({ error: error.errors });
    }
    console.error("Create announcement error:", error);
    res.status(500).json({ error: "Failed to create announcement" });
  }
});

router.patch("/announcements/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
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
      return res.status(404).json({ error: "Announcement not found" });
    }
    
    res.json({ success: true, announcement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Update announcement error:", error);
    res.status(500).json({ error: "Failed to update announcement" });
  }
});

router.delete("/announcements/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const announcementId = parseInt(req.params.id);
    await storage.deleteAnnouncement(announcementId);
    
    res.json({ success: true, message: "Announcement deleted" });
  } catch (error) {
    console.error("Delete announcement error:", error);
    res.status(500).json({ error: "Failed to delete announcement" });
  }
});

router.post("/announcements/cleanup", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const deletedCount = await storage.deleteExpiredEvents();
    
    res.json({ success: true, deletedCount, message: `Deleted ${deletedCount} expired events` });
  } catch (error) {
    console.error("Cleanup expired events error:", error);
    res.status(500).json({ error: "Failed to cleanup expired events" });
  }
});

router.get("/ads", isAuthenticated, async (req: any, res) => {
  try {
    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    const ads = await storage.getAllAdPlacements();
    res.json({ ads });
  } catch (error) {
    console.error("Get all ads error:", error);
    res.status(500).json({ error: "Failed to get ads" });
  }
});

router.post("/ads", isAuthenticated, async (req: any, res) => {
  try {
    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const validatedData = insertAdPlacementSchema.parse(req.body);
    const ad = await storage.createAdPlacement(validatedData);
    res.json({ success: true, ad });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Invalid ad placement data", details: error.errors });
    }
    console.error("Create ad error:", error);
    res.status(500).json({ error: "Failed to create ad" });
  }
});

router.patch("/ads/:id", isAuthenticated, async (req: any, res) => {
  try {
    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: "At least one field must be provided for update" });
    }
    
    const allowedFields = ['placementKey', 'platform', 'adUnitIdIos', 'adUnitIdAndroid', 'adType', 'fallbackImageUrl', 'fallbackLinkUrl', 'isActive', 'showFrequency', 'metadata'];
    const nullableFields = ['adUnitIdIos', 'adUnitIdAndroid', 'fallbackImageUrl', 'fallbackLinkUrl', 'metadata'];
    const filteredBody: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in req.body && req.body[key] !== undefined) {
        if (req.body[key] === null && !nullableFields.includes(key)) {
          return res.status(400).json({ error: `Field '${key}' cannot be null` });
        }
        filteredBody[key] = req.body[key];
      }
    }
    
    if (Object.keys(filteredBody).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }
    
    const partialSchema = insertAdPlacementSchema.partial();
    const validatedData = partialSchema.parse(filteredBody);
    
    const ad = await storage.updateAdPlacement(parseInt(req.params.id), validatedData);
    if (!ad) {
      return res.status(404).json({ error: "Ad placement not found" });
    }
    res.json({ success: true, ad });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Invalid ad placement data", details: error.errors });
    }
    console.error("Update ad error:", error);
    res.status(500).json({ error: "Failed to update ad" });
  }
});

router.delete("/ads/:id", isAuthenticated, async (req: any, res) => {
  try {
    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    await storage.deleteAdPlacement(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error("Delete ad error:", error);
    res.status(500).json({ error: "Failed to delete ad" });
  }
});

export default router;

import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

// ============ Specialist Routes ============

// POST /api/specialist/register - Register as specialist
router.post("/register", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json(createErrorResponse(ErrorCode.USER_NOT_FOUND));
    }

    const existing = await storage.getSpecialistByUserId(userId);
    if (existing) {
      return res.status(400).json(createErrorResponse(ErrorCode.ALREADY_REGISTERED, '已經註冊為專員'));
    }

    const { name, serviceRegion } = req.body;
    if (!name || !serviceRegion) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'name 和 serviceRegion 為必填'));
    }

    const specialist = await storage.createSpecialist({
      userId,
      name,
      serviceRegion,
      isAvailable: false,
      maxTravelers: 5,
      currentTravelers: 0,
    });

    res.status(201).json({ specialist });
  } catch (error) {
    console.error("Specialist registration error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法註冊為專員'));
  }
});

// GET /api/specialist/me - Get current specialist profile
router.get("/me", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const specialist = await storage.getSpecialistByUserId(userId);
    res.json({ specialist: specialist || null });
  } catch (error) {
    console.error("Get specialist error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得專員資料'));
  }
});

// POST /api/specialist/toggle-online - Toggle online status
router.post("/toggle-online", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const specialist = await storage.getSpecialistByUserId(userId);
    if (!specialist) {
      return res.status(403).json(createErrorResponse(ErrorCode.SPECIALIST_REQUIRED));
    }

    if (!specialist.isAvailable) {
      const updated = await storage.updateSpecialist(specialist.id, {
        isAvailable: true,
      });
      return res.json({ isAvailable: updated?.isAvailable });
    } else {
      const updated = await storage.updateSpecialist(specialist.id, {
        isAvailable: false,
      });
      return res.json({ isAvailable: updated?.isAvailable });
    }
  } catch (error) {
    console.error("Toggle online error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法切換上線狀態'));
  }
});

// GET /api/specialist/services - Get active service relations for specialist
router.get("/services", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const specialist = await storage.getSpecialistByUserId(userId);
    if (!specialist) {
      return res.status(403).json(createErrorResponse(ErrorCode.SPECIALIST_REQUIRED));
    }

    const relations = await storage.getActiveServiceRelationsBySpecialist(specialist.id);
    res.json({ services: relations });
  } catch (error) {
    console.error("Get services error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得服務列表'));
  }
});

// POST /api/specialist/match - Auto-match traveler with available specialist
router.post("/match", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const matchSchema = z.object({
      region: z.string().min(1),
    });

    const validated = matchSchema.parse(req.body);
    
    const existingService = await storage.getActiveServiceRelationByTraveler(userId);
    if (existingService) {
      const specialist = await storage.getSpecialistById(existingService.specialistId);
      return res.json({
        matched: true,
        existing: true,
        serviceId: existingService.id,
        specialist: specialist ? {
          id: specialist.id,
          name: specialist.name,
          region: specialist.serviceRegion,
        } : null,
        twilioChannelSid: existingService.twilioChannelSid,
      });
    }

    const specialist = await storage.findAvailableSpecialist(validated.region);
    
    if (!specialist) {
      return res.status(404).json({
        ...createErrorResponse(ErrorCode.SERVICE_NOT_FOUND, `目前 ${validated.region} 地區沒有可用的專員，請稍後再試`),
        matched: false,
      });
    }

    const serviceRelation = await storage.createServiceRelation({
      specialistId: specialist.id,
      travelerId: userId,
      region: validated.region,
      status: 'active',
    });

    await storage.updateSpecialist(specialist.id, {
      currentTravelers: specialist.currentTravelers + 1,
    });

    res.json({
      matched: true,
      existing: false,
      serviceId: serviceRelation.id,
      specialist: {
        id: specialist.id,
        name: specialist.name,
        region: specialist.serviceRegion,
      },
      message: `已成功媒合專員 ${specialist.name}`,
    });
  } catch (error: any) {
    console.error("Specialist match error:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '媒合失敗'));
  }
});

// POST /api/specialist/service/:serviceId/end - End a service relation (specialist side)
router.post("/service/:serviceId/end", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const serviceId = parseInt(req.params.serviceId);
    const { rating } = req.body;

    const service = await storage.getServiceRelationById(serviceId);
    if (!service) {
      return res.status(404).json(createErrorResponse(ErrorCode.SERVICE_NOT_FOUND));
    }

    const specialist = await storage.getSpecialistByUserId(userId);
    const isSpecialist = specialist && specialist.id === service.specialistId;
    const isTraveler = service.travelerId === userId;

    if (!isSpecialist && !isTraveler) {
      return res.status(403).json(createErrorResponse(ErrorCode.FORBIDDEN, '無權限結束此服務'));
    }

    const endedService = await storage.endServiceRelation(serviceId, rating);

    if (specialist || service.specialistId) {
      const sp = specialist || await storage.getSpecialistById(service.specialistId);
      if (sp && sp.currentTravelers > 0) {
        await storage.updateSpecialist(sp.id, {
          currentTravelers: sp.currentTravelers - 1,
        });
      }
    }

    res.json({
      success: true,
      service: endedService,
      message: "服務已結束",
    });
  } catch (error) {
    console.error("End service error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '結束服務失敗'));
  }
});

// ============ Traveler Service Routes ============

// POST /api/service/request - Request a specialist (auto-match by region)
router.post("/service/request", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { region } = req.body;
    if (!region) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'region 為必填'));
    }

    const existing = await storage.getActiveServiceRelationByTraveler(userId);
    if (existing) {
      return res.status(400).json(createErrorResponse(ErrorCode.ALREADY_ACTIVE, '已有進行中的服務'));
    }

    const specialist = await storage.findAvailableSpecialist(region);
    if (!specialist) {
      return res.status(404).json(createErrorResponse(ErrorCode.SERVICE_NOT_FOUND, '該地區沒有可用的專員'));
    }

    const relation = await storage.createServiceRelation({
      travelerId: userId,
      specialistId: specialist.id,
      region,
    });

    res.status(201).json({ 
      service: relation,
      specialist: {
        id: specialist.id,
        name: specialist.name,
        serviceRegion: specialist.serviceRegion,
      }
    });
  } catch (error) {
    console.error("Request service error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法請求專員'));
  }
});

// GET /api/service/current - Get current service for traveler
router.get("/service/current", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const relation = await storage.getActiveServiceRelationByTraveler(userId);
    if (!relation) {
      return res.json({ service: null });
    }

    const specialist = await storage.getSpecialistById(relation.specialistId);
    res.json({ 
      service: relation,
      specialist: specialist ? {
        id: specialist.id,
        name: specialist.name,
        serviceRegion: specialist.serviceRegion,
      } : null
    });
  } catch (error) {
    console.error("Get current service error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得目前服務'));
  }
});

// POST /api/service/:id/end - End service and rate specialist (traveler side)
router.post("/service/:id/end", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const serviceId = parseInt(req.params.id);
    const { rating } = req.body;

    const relation = await storage.getServiceRelationById(serviceId);
    if (!relation) {
      return res.status(404).json(createErrorResponse(ErrorCode.SERVICE_NOT_FOUND));
    }

    if (relation.travelerId !== userId) {
      return res.status(403).json(createErrorResponse(ErrorCode.FORBIDDEN, '無權限結束此服務'));
    }

    const updated = await storage.endServiceRelation(serviceId, rating);

    res.json({ success: true, service: updated });
  } catch (error) {
    console.error("End service error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '結束服務失敗'));
  }
});

export default router;

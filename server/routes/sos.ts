import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { ErrorCode, createErrorResponse } from "@shared/errors";
import { checkGeofence } from "../lib/geofencing";

const router = Router();

// ============ SOS Alerts (安全中心) ============

router.get('/sos/eligibility', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub || req.jwtUser?.userId;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const hasPurchased = await storage.hasUserPurchasedTripService(userId);
    res.json({ 
      eligible: hasPurchased,
      reason: hasPurchased ? null : '需購買旅程服務才能使用安全中心功能'
    });
  } catch (error) {
    console.error('SOS eligibility check error:', error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法檢查資格'));
  }
});

router.post('/sos/alert', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub || req.jwtUser?.userId;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const hasPurchased = await storage.hasUserPurchasedTripService(userId);
    if (!hasPurchased) {
      return res.status(403).json({ 
        error: '需購買旅程服務才能使用 SOS 求救功能',
        requiresPurchase: true
      });
    }

    const { insertSosAlertSchema } = await import('@shared/schema');
    const validated = insertSosAlertSchema.parse({ ...req.body, userId });

    const alert = await storage.createSosAlert(validated);
    console.log('🆘 SOS Alert Created:', alert);

    res.json({
      success: true,
      alertId: alert.id,
      message: '求救訊號已發送，我們會盡快聯繫您',
    });
  } catch (error: any) {
    console.error('Create SOS alert error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: '資料格式錯誤', details: error.errors });
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法發送求救訊號'));
  }
});

router.get('/sos/alerts', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub || req.jwtUser?.userId;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const alerts = await storage.getUserSosAlerts(userId);
    res.json({ alerts });
  } catch (error) {
    console.error('Get SOS alerts error:', error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得求救記錄'));
  }
});

router.patch('/sos/alerts/:id/cancel', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub || req.jwtUser?.userId;
    const alertId = parseInt(req.params.id);
    
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const alert = await storage.getSosAlertById(alertId);
    if (!alert || alert.userId !== userId) {
      return res.status(404).json({ error: '找不到求救記錄' });
    }

    if (alert.status !== 'pending') {
      return res.status(400).json({ error: '無法取消已處理的求救' });
    }

    const updated = await storage.updateSosAlertStatus(alertId, 'cancelled');
    res.json({ success: true, alert: updated });
  } catch (error) {
    console.error('Cancel SOS alert error:', error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取消求救'));
  }
});

// ============ Location Routes ============

router.post('/location/update', isAuthenticated, async (req: any, res) => {
  const userId = req.user?.claims?.sub;
  console.log('📍 Location Update Request:', { userId, body: req.body });
  
  const locationSchema = z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    isSharingEnabled: z.boolean().optional(),
    targets: z.array(z.object({
      id: z.union([z.string(), z.number()]),
      name: z.string(),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      radiusMeters: z.number().min(1).max(10000).default(50),
    })).optional(),
  });

  try {
    const validated = locationSchema.parse(req.body);
    console.log('📍 Location Update Validated:', { userId, lat: validated.lat, lon: validated.lon, isSharingEnabled: validated.isSharingEnabled });
    
    let sharingEnabled = validated.isSharingEnabled;
    if (sharingEnabled === undefined) {
      const existingLocation = await storage.getUserLocation(userId);
      sharingEnabled = existingLocation?.isSharingEnabled ?? true;
    }
    
    const location = await storage.upsertUserLocation(
      userId,
      validated.lat,
      validated.lon,
      sharingEnabled
    );
    
    const geofenceResult = checkGeofence(
      { lat: validated.lat, lon: validated.lon },
      validated.targets || []
    );
    
    res.json({ 
      status: "ok",
      arrived: geofenceResult.arrived,
      target: geofenceResult.target,
      distanceMeters: geofenceResult.distanceMeters,
      location,
      message: sharingEnabled ? '位置已更新' : '位置共享已關閉'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ status: "error", error: error.errors });
    }
    console.error("Error updating location:", error);
    res.status(500).json({ status: "error", error: "Failed to update location" });
  }
});

router.get('/location/me', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const location = await storage.getUserLocation(userId);
    res.json(location || null);
  } catch (error) {
    console.error("Error fetching location:", error);
    res.status(500).json({ error: "Failed to fetch location" });
  }
});

// ============ SOS Emergency Routes ============

// Trigger SOS mode via webhook (for iOS Shortcuts, no auth required - uses secret key)
router.post('/sos/trigger', async (req, res) => {
  const key = req.query.key as string;
  console.log('🚨 SOS Trigger Request:', { key: key ? `${key.slice(0, 8)}...` : 'missing', body: req.body });
  
  const sosSchema = z.object({
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
  });

  try {
    if (!key) {
      console.log('🚨 SOS Trigger Failed: Missing key');
      return res.status(401).json({ status: "error", error: "Missing SOS key" });
    }

    const user = await storage.getUserBySosKey(key);
    if (!user) {
      console.log('🚨 SOS Trigger Failed: Invalid key');
      return res.status(401).json({ status: "error", error: "Invalid SOS key" });
    }

    console.log('🚨 SOS Trigger Authenticated:', { userId: user.id, userName: `${user.firstName} ${user.lastName}` });
    const validated = sosSchema.parse(req.body);
    
    // Enable SOS mode
    let location = await storage.getUserLocation(user.id);
    
    if (validated.lat !== undefined && validated.lon !== undefined) {
      // Update location and enable SOS mode
      location = await storage.upsertUserLocation(
        user.id,
        validated.lat,
        validated.lon,
        location?.isSharingEnabled ?? true,
        true // sosMode = true
      );
    } else if (location) {
      // Just enable SOS mode without updating location
      location = await storage.setSosMode(user.id, true);
    } else {
      return res.status(400).json({ status: "error", error: "No location data available. Please provide lat/lon." });
    }

    // TODO: Notify planner via push notification or SMS
    console.log(`[SOS TRIGGERED] User ${user.id} (${user.firstName} ${user.lastName}) triggered SOS mode`);
    
    res.json({ 
      status: "ok", 
      message: "SOS mode activated",
      location
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ status: "error", error: error.errors });
    }
    console.error("Error triggering SOS:", error);
    res.status(500).json({ status: "error", error: "Failed to trigger SOS" });
  }
});

// Deactivate SOS mode (requires auth)
router.post('/sos/deactivate', isAuthenticated, async (req: any, res) => {
  const userId = req.user?.claims?.sub;
  console.log('🚨 SOS Deactivate Request:', { userId });
  
  try {
    const location = await storage.setSosMode(userId, false);
    
    if (!location) {
      return res.status(404).json({ status: "error", error: "No location found" });
    }

    console.log(`[SOS DEACTIVATED] User ${userId} deactivated SOS mode`);
    res.json({ status: "ok", message: "SOS mode deactivated", location });
  } catch (error) {
    console.error("Error deactivating SOS:", error);
    res.status(500).json({ status: "error", error: "Failed to deactivate SOS" });
  }
});

// Get SOS webhook link (requires auth)
router.get('/user/sos-link', isAuthenticated, async (req: any, res) => {
  const userId = req.user?.claims?.sub;
  console.log('🔗 SOS Link Request:', { userId });
  
  try {
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let sosKey = user.sosSecretKey;
    
    // Generate new key if not exists
    if (!sosKey) {
      sosKey = await storage.generateSosKey(userId);
    }

    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DOMAINS?.split(',')[0] 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'https://your-app.replit.app';

    const webhookUrl = `${baseUrl}/api/sos/trigger?key=${sosKey}`;
    
    res.json({ 
      webhookUrl,
      sosKey,
      instructions: {
        method: "POST",
        body: "Optional JSON: { \"lat\": number, \"lon\": number }",
        example: `curl -X POST "${webhookUrl}" -H "Content-Type: application/json" -d '{"lat": 25.0330, "lon": 121.5654}'`
      }
    });
  } catch (error) {
    console.error("Error getting SOS link:", error);
    res.status(500).json({ error: "Failed to get SOS link" });
  }
});

// Regenerate SOS key (requires auth)
router.post('/user/sos-key/regenerate', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const newKey = await storage.generateSosKey(userId);
    
    res.json({ 
      status: "ok",
      message: "SOS key regenerated successfully",
      sosKey: newKey
    });
  } catch (error) {
    console.error("Error regenerating SOS key:", error);
    res.status(500).json({ error: "Failed to regenerate SOS key" });
  }
});

// ============ Delete User Account ============

router.delete('/user/account', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: "未授權",
        code: "UNAUTHORIZED" 
      });
    }
    
    console.log(`[Account Deletion] User ${userId} requested account deletion`);
    
    const result = await storage.deleteUserAccount(userId);
    
    if (result.success) {
      console.log(`[Account Deletion] User ${userId} account deleted successfully`);
      res.json({ 
        success: true, 
        message: "帳號已成功刪除" 
      });
    } else {
      // 根據錯誤代碼返回適當的狀態碼
      const statusCode = result.code === 'MERCHANT_ACCOUNT_EXISTS' ? 400 : 500;
      console.log(`[Account Deletion] Failed to delete user ${userId}: ${result.code}`);
      res.status(statusCode).json({ 
        success: false, 
        error: result.error,
        code: result.code
      });
    }
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ 
      success: false, 
      error: "刪除帳號時發生錯誤",
      code: "SERVER_ERROR" 
    });
  }
});

export default router;

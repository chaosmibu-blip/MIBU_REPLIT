import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertCollectionSchema, insertMerchantSchema, insertCouponSchema, insertCartItemSchema, insertPlaceDraftSchema, insertPlaceApplicationSchema, registerUserSchema, insertSpecialistSchema, insertServiceRelationSchema } from "@shared/schema";
import * as crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { createTripPlannerRoutes } from "../modules/trip-planner/server/routes";
import { createPlannerServiceRoutes } from "../modules/trip-planner/server/planner-routes";
import { registerStripeRoutes } from "./stripeRoutes";
import { getUncachableStripeClient } from "./stripeClient";
import { checkGeofence } from "./lib/geofencing";
import { callGemini, generatePlaceWithAI, verifyPlaceWithGoogle } from "./lib/placeGenerator";
import twilio from "twilio";
const { AccessToken } = twilio.jwt;
const ChatGrant = AccessToken.ChatGrant;
const VoiceGrant = AccessToken.VoiceGrant;

const RECUR_API_URL = "https://api.recur.tw/v1";
const RECUR_PREMIUM_PLAN_ID = "adkwbl9dya0wc6b53parl9yk";
const UNLIMITED_GENERATION_EMAILS = ["s8869420@gmail.com"];
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface PlaceSearchResult {
  name: string;
  formatted_address: string;
  place_id: string;
  geometry?: {
    location: { lat: number; lng: number };
  };
  rating?: number;
  types?: string[];
  business_status?: string;
}

const EXCLUDED_BUSINESS_STATUS = ['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'];
// Exclude non-tourism Google Place types
const EXCLUDED_PLACE_TYPES = [
  'travel_agency', 'insurance_agency', 'real_estate_agency', 'lawyer', 'accounting', 
  'bank', 'library', 'local_government_office', 'city_hall', 'courthouse', 'post_office',
  'police', 'fire_station', 'hospital', 'doctor', 'dentist', 'pharmacy', 'veterinary_care',
  'school', 'primary_school', 'secondary_school', 'university', 'car_dealer', 'car_rental',
  'car_repair', 'car_wash', 'gas_station', 'parking', 'transit_station', 'bus_station',
  'train_station', 'subway_station', 'taxi_stand', 'atm', 'funeral_home', 'cemetery',
  'church', 'mosque', 'synagogue', 'hindu_temple', 'place_of_worship'
];
// Exclude non-tourism places by name patterns (Chinese and English)
const GENERIC_NAME_PATTERNS = [
  // Travel/tour related
  '探索', '旅行社', '旅行', 'Travel', 'Explore', 'Tour',
  // Government/public services
  '農會', '公所', '區公所', '鄉公所', '鎮公所', '市公所', '縣政府', '市政府', '衛生所', '戶政事務所',
  '警察局', '派出所', '消防隊', '消防局', '郵局', '稅務局', '地政事務所',
  // Non-tourism services
  '診所', '牙醫', '醫院', '藥局', '獸醫', '銀行', '加油站', '停車場', '汽車', '機車行',
  '葬儀', '殯儀館', '靈骨塔', '納骨塔',
  // Generic/placeholder names
  '服務中心', '遊客中心'
];

function isPlaceValid(place: any): boolean {
  if (place.business_status && EXCLUDED_BUSINESS_STATUS.includes(place.business_status)) {
    return false;
  }
  
  if (place.types && place.types.some((t: string) => EXCLUDED_PLACE_TYPES.includes(t))) {
    return false;
  }
  
  if (place.name && GENERIC_NAME_PATTERNS.some(pattern => place.name.includes(pattern))) {
    return false;
  }
  
  return true;
}

async function searchPlaceInDistrict(
  query: string,
  district: string,
  city: string,
  country: string
): Promise<PlaceSearchResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not configured");
    return null;
  }

  try {
    const searchQuery = encodeURIComponent(`${query} ${district} ${city}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      for (const place of data.results) {
        if (!isPlaceValid(place)) {
          continue;
        }
        
        return {
          name: place.name,
          formatted_address: place.formatted_address,
          place_id: place.place_id,
          geometry: place.geometry,
          rating: place.rating,
          types: place.types,
          business_status: place.business_status
        };
      }
      return null;
    }
    return null;
  } catch (error) {
    console.error("Google Places API error:", error);
    return null;
  }
}

async function getDistrictBoundary(
  district: string,
  city: string,
  country: string
): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const address = encodeURIComponent(`${district}, ${city}, ${country}`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
    return null;
  } catch (error) {
    console.error("Google Geocoding API error:", error);
    return null;
  }
}

function isWithinRadius(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number },
  radiusKm: number
): boolean {
  const R = 6371;
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance <= radiusKm;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);

  // ============ Health Check ============
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running correctly!', timestamp: new Date().toISOString() });
  });

  // ============ Public Config Routes ============
  // Mapbox access token (public tokens are designed to be exposed to clients)
  // Security is managed via URL restrictions in Mapbox dashboard
  app.get('/api/config/mapbox', (req, res) => {
    const token = process.env.VITE_MAPBOX_ACCESS_TOKEN || '';
    if (!token) {
      return res.status(503).json({ error: 'Mapbox token not configured' });
    }
    res.json({ accessToken: token });
  });

  // ============ Module Routes ============
  // Trip Planner Module
  app.use('/api/planner', createTripPlannerRoutes());
  
  // Planner Service Routes (策劃師服務)
  createPlannerServiceRoutes(app);

  // ============ Auth Routes ============
  
  // Password hashing utilities
  const hashPassword = (password: string): string => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  };
  
  const verifyPassword = (password: string, storedHash: string): boolean => {
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  };
  
  const generateToken = (userId: string, role: string): string => {
    const secret = process.env.SESSION_SECRET || 'mibu-secret-key';
    return jwt.sign({ sub: userId, role }, secret, { expiresIn: '30d' });
  };

  // Email/Password Registration
  app.post('/api/auth/register', async (req, res) => {
    try {
      const validated = registerUserSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(validated.email);
      if (existingUser) {
        return res.status(400).json({ error: '此電子郵件已被註冊' });
      }
      
      // Hash password
      const hashedPassword = hashPassword(validated.password);
      
      // Generate unique user ID
      const userId = `email_${crypto.randomBytes(16).toString('hex')}`;
      
      // Create user with traveler role by default
      const user = await storage.createUser({
        id: userId,
        email: validated.email,
        password: hashedPassword,
        firstName: validated.firstName || null,
        lastName: validated.lastName || null,
        role: validated.role || 'traveler',
        isApproved: validated.role === 'traveler', // Travelers are auto-approved
        provider: 'email',
      });
      
      // Generate JWT token
      const token = generateToken(user.id, user.role || 'traveler');
      
      res.status(201).json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          firstName: user.firstName, 
          lastName: user.lastName,
          role: user.role,
          isApproved: user.isApproved,
        }, 
        token 
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: '輸入資料格式錯誤', details: error.errors });
      }
      res.status(500).json({ error: '註冊失敗，請稍後再試' });
    }
  });

  // Email/Password Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const loginSchema = z.object({
        email: z.string().email('請輸入有效的電子郵件'),
        password: z.string().min(1, '請輸入密碼'),
      });
      
      const validated = loginSchema.parse(req.body);
      
      // Find user by email
      const user = await storage.getUserByEmail(validated.email);
      if (!user || !user.password) {
        return res.status(401).json({ error: '電子郵件或密碼錯誤' });
      }
      
      // Verify password
      if (!verifyPassword(validated.password, user.password)) {
        return res.status(401).json({ error: '電子郵件或密碼錯誤' });
      }
      
      // Check approval status for non-traveler roles
      if (user.role !== 'traveler' && !user.isApproved) {
        return res.status(403).json({ 
          error: '帳號審核中，請等待管理員核准',
          isApproved: user.isApproved 
        });
      }
      
      // Generate JWT token
      const token = generateToken(user.id, user.role || 'traveler');
      
      res.json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          firstName: user.firstName, 
          lastName: user.lastName,
          role: user.role,
          isApproved: user.isApproved,
        }, 
        token 
      });
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: '輸入資料格式錯誤' });
      }
      res.status(500).json({ error: '登入失敗，請稍後再試' });
    }
  });

  // Get current authenticated user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Check if user is super admin (can access any interface)
      const SUPER_ADMIN_EMAIL = 's8869420@gmail.com';
      const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
      
      res.json({
        ...user,
        isSuperAdmin,
        accessibleRoles: isSuperAdmin 
          ? ['traveler', 'merchant', 'specialist', 'admin'] 
          : [user?.role || 'traveler']
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Check if user has unlimited generation privilege
  app.get('/api/auth/privileges', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const hasUnlimitedGeneration = user?.email && UNLIMITED_GENERATION_EMAILS.includes(user.email);
      res.json({ hasUnlimitedGeneration });
    } catch (error) {
      res.json({ hasUnlimitedGeneration: false });
    }
  });

  // ============ Location Routes ============

  app.post('/api/location/update', isAuthenticated, async (req: any, res) => {
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

  app.get('/api/location/me', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/sos/trigger', async (req, res) => {
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
  app.post('/api/sos/deactivate', isAuthenticated, async (req: any, res) => {
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
  app.get('/api/user/sos-link', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/user/sos-key/regenerate', isAuthenticated, async (req: any, res) => {
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

  // ============ Collection Routes ============
  
  app.get("/api/collections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const items = await storage.getUserCollections(userId);
      res.json({ collections: items });
    } catch (error) {
      console.error("Fetch collections error:", error);
      res.status(500).json({ error: "Failed to fetch collections" });
    }
  });

  // Get merchant promo for a specific place (by placeId or placeName+district+city)
  app.get("/api/place/promo", async (req, res) => {
    try {
      const { placeId, placeName, district, city } = req.query;
      
      let merchantLink = null;
      
      // First try to find by Google Place ID (most accurate)
      if (placeId && typeof placeId === 'string') {
        merchantLink = await storage.getPlaceLinkByGooglePlaceId(placeId);
      }
      
      // Fallback to placeName + district + city
      if (!merchantLink && placeName && district && city) {
        merchantLink = await storage.getPlaceLinkByPlace(
          placeName as string,
          district as string,
          city as string
        );
      }
      
      if (!merchantLink || !merchantLink.isPromoActive) {
        return res.json({ promo: null });
      }
      
      res.json({
        promo: {
          title: merchantLink.promoTitle,
          description: merchantLink.promoDescription,
          imageUrl: merchantLink.promoImageUrl
        }
      });
    } catch (error) {
      console.error("Get place promo error:", error);
      res.status(500).json({ error: "Failed to get place promo" });
    }
  });

  app.post("/api/collections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validated = insertCollectionSchema.parse({ ...req.body, userId });
      const collection = await storage.addToCollection(validated);
      res.json({ collection });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Add collection error:", error);
      res.status(500).json({ error: "Failed to add to collection" });
    }
  });

  // ============ Merchant Routes ============
  
  app.get("/api/merchant", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const merchant = await storage.getMerchantByUserId(userId);
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      res.json({ merchant });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch merchant" });
    }
  });

  app.post("/api/merchant", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validated = insertMerchantSchema.parse({ ...req.body, userId });
      const merchant = await storage.createMerchant(validated);
      res.json({ merchant });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create merchant" });
    }
  });

  app.patch("/api/merchant/:id/plan", isAuthenticated, async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { plan } = req.body;
      
      if (!['free', 'partner', 'premium'].includes(plan)) {
        return res.status(400).json({ error: "Invalid plan" });
      }
      
      const merchant = await storage.updateMerchantPlan(merchantId, plan);
      res.json({ merchant });
    } catch (error) {
      res.status(500).json({ error: "Failed to update plan" });
    }
  });

  // ============ Coupon Routes ============
  
  app.get("/api/coupons/merchant/:merchantId", isAuthenticated, async (req, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const allCoupons = await storage.getMerchantCoupons(merchantId);
      res.json({ coupons: allCoupons });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch coupons" });
    }
  });

  app.post("/api/coupons", isAuthenticated, async (req, res) => {
    try {
      const validated = insertCouponSchema.parse(req.body);
      const coupon = await storage.createCoupon(validated);
      res.json({ coupon });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create coupon" });
    }
  });

  app.patch("/api/coupons/:id", isAuthenticated, async (req, res) => {
    try {
      const couponId = parseInt(req.params.id);
      const coupon = await storage.updateCoupon(couponId, req.body);
      res.json({ coupon });
    } catch (error) {
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });

  // ============ District Data for Random Selection ============
  const DISTRICT_DATA: Record<string, Record<string, string[]>> = {
    taiwan: {
      taipei: ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
      new_taipei: ['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '土城區', '蘆洲區', '汐止區', '樹林區', '鶯歌區', '三峽區', '淡水區', '瑞芳區', '五股區', '泰山區', '林口區', '深坑區', '石碇區', '坪林區', '三芝區', '石門區', '八里區', '平溪區', '雙溪區', '貢寮區', '金山區', '萬里區', '烏來區'],
      taoyuan: ['桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區', '龍潭區', '龜山區', '大園區', '觀音區', '新屋區', '復興區'],
      taichung: ['中區', '東區', '南區', '西區', '北區', '北屯區', '西屯區', '南屯區', '太平區', '大里區', '霧峰區', '烏日區', '豐原區', '后里區', '石岡區', '東勢區', '和平區', '新社區', '潭子區', '大雅區', '神岡區', '大肚區', '沙鹿區', '龍井區', '梧棲區', '清水區', '大甲區', '外埔區', '大安區'],
      tainan: ['中西區', '東區', '南區', '北區', '安平區', '安南區', '永康區', '歸仁區', '新化區', '左鎮區', '玉井區', '楠西區', '南化區', '仁德區', '關廟區', '龍崎區', '官田區', '麻豆區', '佳里區', '西港區', '七股區', '將軍區', '學甲區', '北門區', '新營區', '後壁區', '白河區', '東山區', '六甲區', '下營區', '柳營區', '鹽水區', '善化區', '大內區', '山上區', '新市區', '安定區'],
      kaohsiung: ['楠梓區', '左營區', '鼓山區', '三民區', '鹽埕區', '前金區', '新興區', '苓雅區', '前鎮區', '旗津區', '小港區', '鳳山區', '大寮區', '林園區', '大樹區', '大社區', '仁武區', '鳥松區', '岡山區', '橋頭區', '燕巢區', '田寮區', '阿蓮區', '路竹區', '湖內區', '茄萣區', '永安區', '彌陀區', '梓官區', '旗山區', '美濃區', '六龜區', '甲仙區', '杉林區', '內門區', '茂林區', '桃源區', '那瑪夏區'],
      keelung: ['仁愛區', '信義區', '中正區', '中山區', '安樂區', '暖暖區', '七堵區'],
      hsinchu_city: ['東區', '北區', '香山區'],
      chiayi_city: ['東區', '西區'],
    },
    japan: {
      tokyo: ['千代田區', '中央區', '港區', '新宿區', '文京區', '台東區', '墨田區', '江東區', '品川區', '目黑區', '大田區', '世田谷區', '渋谷區', '中野區', '杉並區', '豐島區', '北區', '荒川區', '板橋區', '練馬區', '足立區', '葛飾區', '江戸川區'],
      osaka: ['北區', '都島區', '福島區', '此花區', '中央區', '西區', '港區', '大正區', '天王寺區', '浪速區', '西淀川區', '淀川區', '東淀川區', '東成區', '生野區', '旭區', '城東區', '鶴見區', '阿倍野區', '住之江區', '住吉區', '東住吉區', '平野區', '西成區'],
      kyoto: ['北區', '上京區', '左京區', '中京區', '東山區', '下京區', '南區', '右京區', '伏見區', '山科區', '西京區'],
      fukuoka: ['東區', '博多區', '中央區', '南區', '城南區', '早良區', '西區'],
    },
    hong_kong: {
      hong_kong: ['中西區', '灣仔區', '東區', '南區', '油尖旺區', '深水埗區', '九龍城區', '黃大仙區', '觀塘區', '葵青區', '荃灣區', '屯門區', '元朗區', '北區', '大埔區', '沙田區', '西貢區', '離島區'],
    }
  };

  function getRandomDistrict(country: string, city: string): string | null {
    const countryData = DISTRICT_DATA[country];
    if (!countryData) return null;
    const districts = countryData[city];
    if (!districts || districts.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * districts.length);
    return districts[randomIndex];
  }

  // ============ Category & Sub-category Data ============
  const CATEGORY_DATA: Record<string, { subCategories: string[]; weight: number; timeSlots: string[] }> = {
    '食': {
      subCategories: ['火鍋', '小吃', '異國料理', '日式料理', '中式料理', '西式料理', '咖啡廳', '甜點', '夜市美食', '素食', '海鮮', '燒烤', '拉麵', '鐵板燒', '牛排', '早午餐', '台式便當', '港式飲茶'],
      weight: 3,
      timeSlots: ['breakfast', 'lunch', 'tea_time', 'dinner', 'late_night']
    },
    '宿': {
      subCategories: ['五星飯店', '商務旅館', '民宿', '青年旅社', '溫泉旅館', '設計旅店', '膠囊旅館', '度假村'],
      weight: 0,
      timeSlots: ['overnight']
    },
    '生態文化教育': {
      subCategories: ['博物館', '美術館', '科學館', '歷史古蹟', '文化中心', '圖書館', '紀念館', '展覽館'],
      weight: 2,
      timeSlots: ['morning', 'afternoon']
    },
    '遊程體驗': {
      subCategories: ['導覽行程', '手作體驗', '烹飪課程', '文化體驗', '農場體驗', '茶道體驗', '攝影之旅', '單車遊'],
      weight: 2,
      timeSlots: ['morning', 'afternoon']
    },
    '娛樂設施': {
      subCategories: ['遊樂園', '電影院', 'KTV', '酒吧', '夜店', '桌遊店', '密室逃脫', '電玩中心'],
      weight: 1,
      timeSlots: ['afternoon', 'evening', 'night']
    },
    '活動': {
      subCategories: ['登山健行', '水上活動', '極限運動', '瑜珈課程', '運動賽事', '音樂會', '市集活動', 'SPA按摩'],
      weight: 2,
      timeSlots: ['morning', 'afternoon', 'evening']
    },
    '景點': {
      subCategories: ['自然風景', '地標建築', '公園綠地', '觀景台', '寺廟宗教', '老街', '海灘', '溫泉'],
      weight: 3,
      timeSlots: ['morning', 'afternoon', 'evening']
    },
    '購物': {
      subCategories: ['百貨公司', '購物中心', '傳統市場', '商店街', '特色小店', '伴手禮店', '二手店', '藥妝店'],
      weight: 1,
      timeSlots: ['afternoon', 'evening']
    }
  };

  const TIME_SLOT_ORDER = ['breakfast', 'morning', 'lunch', 'afternoon', 'tea_time', 'dinner', 'evening', 'night', 'late_night', 'overnight'];

  interface SkeletonItem {
    order: number;
    category: string;
    subCategory: string;
    timeSlot: string;
    suggestedTime: string;
    energyLevel: 'high' | 'medium' | 'low';
  }

  function generateItinerarySkeleton(country: string, city: string, cardCount: number): {
    targetDistrict: string;
    userRequestCount: number;
    generatedCount: number;
    skeleton: SkeletonItem[];
  } {
    const K = Math.min(12, Math.max(5, cardCount));
    
    const lockedDistrict = getRandomDistrict(country, city) || city;
    
    const stayCount = K >= 8 ? 1 : 0;
    let foodMin = 2;
    if (K >= 7 && K <= 8) foodMin = 3;
    if (K >= 9) foodMin = 4;
    
    const skeleton: SkeletonItem[] = [];
    const usedSubCategories = new Set<string>();
    
    function pickSubCategory(category: string): string {
      const subs = CATEGORY_DATA[category].subCategories;
      const available = subs.filter(s => !usedSubCategories.has(`${category}:${s}`));
      if (available.length === 0) {
        return subs[Math.floor(Math.random() * subs.length)];
      }
      const picked = available[Math.floor(Math.random() * available.length)];
      usedSubCategories.add(`${category}:${picked}`);
      return picked;
    }

    const foodTimeSlots = ['breakfast', 'lunch', 'dinner', 'tea_time', 'late_night'];
    let foodSlotIndex = 0;
    for (let i = 0; i < foodMin; i++) {
      skeleton.push({
        order: 0,
        category: '食',
        subCategory: pickSubCategory('食'),
        timeSlot: foodTimeSlots[foodSlotIndex % foodTimeSlots.length],
        suggestedTime: '',
        energyLevel: 'low'
      });
      foodSlotIndex++;
    }

    if (stayCount > 0) {
      skeleton.push({
        order: 0,
        category: '宿',
        subCategory: pickSubCategory('宿'),
        timeSlot: 'overnight',
        suggestedTime: '22:00',
        energyLevel: 'low'
      });
    }

    const remainingSlots = K - skeleton.length;
    const fillableCategories = ['生態文化教育', '遊程體驗', '娛樂設施', '活動', '景點', '購物'];
    const weights = fillableCategories.map(c => CATEGORY_DATA[c].weight);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let lastActivityCount = 0;
    const activityCategories = ['生態文化教育', '遊程體驗', '活動', '景點'];

    for (let i = 0; i < remainingSlots; i++) {
      let selectedCategory: string;
      
      if (lastActivityCount >= 2) {
        const restCategories = ['食', '購物'];
        selectedCategory = restCategories[Math.floor(Math.random() * restCategories.length)];
        lastActivityCount = 0;
      } else {
        const rand = Math.random() * totalWeight;
        let cumulative = 0;
        selectedCategory = fillableCategories[0];
        for (let j = 0; j < fillableCategories.length; j++) {
          cumulative += weights[j];
          if (rand < cumulative) {
            selectedCategory = fillableCategories[j];
            break;
          }
        }
      }

      if (activityCategories.includes(selectedCategory)) {
        lastActivityCount++;
      } else {
        lastActivityCount = 0;
      }

      const validSlots = CATEGORY_DATA[selectedCategory].timeSlots;
      const timeSlot = validSlots[Math.floor(Math.random() * validSlots.length)];

      let energyLevel: 'high' | 'medium' | 'low' = 'medium';
      if (['活動', '遊程體驗'].includes(selectedCategory)) {
        energyLevel = 'high';
      } else if (['食', '購物', '宿'].includes(selectedCategory)) {
        energyLevel = 'low';
      }

      skeleton.push({
        order: 0,
        category: selectedCategory,
        subCategory: pickSubCategory(selectedCategory),
        timeSlot: timeSlot,
        suggestedTime: '',
        energyLevel: energyLevel
      });
    }

    skeleton.sort((a, b) => {
      const aIdx = TIME_SLOT_ORDER.indexOf(a.timeSlot);
      const bIdx = TIME_SLOT_ORDER.indexOf(b.timeSlot);
      return aIdx - bIdx;
    });

    const timeMap: Record<string, string> = {
      'breakfast': '08:00',
      'morning': '10:00',
      'lunch': '12:30',
      'afternoon': '14:30',
      'tea_time': '16:00',
      'dinner': '18:30',
      'evening': '20:00',
      'night': '21:30',
      'late_night': '22:30',
      'overnight': '23:00'
    };

    skeleton.forEach((item, idx) => {
      item.order = idx + 1;
      item.suggestedTime = timeMap[item.timeSlot] || '12:00';
    });

    return {
      targetDistrict: lockedDistrict,
      userRequestCount: cardCount,
      generatedCount: skeleton.length,
      skeleton: skeleton
    };
  }

  // ============ Gemini AI Itinerary Generation ============

  app.post("/api/generate-itinerary", async (req, res) => {
    console.log('[generate-itinerary] API called with:', { country: req.body.country, city: req.body.city, level: req.body.level });
    try {
      const { country, city, level, language, collectedNames } = req.body;
      
      const langMap: Record<string, string> = {
        'zh-TW': '繁體中文',
        'en': 'English',
        'ja': '日本語',
        'ko': '한국어'
      };
      const outputLang = langMap[language] || 'English';
      
      const itemCount = Math.min(12, Math.max(5, Math.floor(level * 1.2)));
      
      const skeletonResult = generateItinerarySkeleton(country, city, itemCount);
      const { targetDistrict, skeleton } = skeletonResult;

      const categoryMap: Record<string, string> = {
        '食': 'Food', '宿': 'Stay', '生態文化教育': 'Education',
        '遊程體驗': 'Activity', '娛樂設施': 'Entertainment',
        '活動': 'Activity', '景點': 'Scenery', '購物': 'Shopping'
      };

      // Check cache for existing places
      const cachedPlaces = await storage.getCachedPlaces(targetDistrict, city, country);
      const cacheMap = new Map(cachedPlaces.map(p => [p.subCategory, p]));
      
      // Separate skeleton items into cached and uncached
      // Track used place names to prevent duplicates within the same pull
      const usedPlaceNamesInPull: Set<string> = new Set(collectedNames || []);
      const cachedItems: any[] = [];
      const uncachedSkeleton: Array<typeof skeleton[0] & { originalIdx: number }> = [];
      
      skeleton.forEach((item, idx) => {
        const cached = cacheMap.get(item.subCategory);
        // Check both collectedNames AND usedPlaceNamesInPull to prevent duplicates
        if (cached && !usedPlaceNamesInPull.has(cached.placeName)) {
          cachedItems.push({
            skeletonIdx: idx,
            cached: cached,
            skeleton: item
          });
          // Mark this place as used so it won't appear again in this pull
          usedPlaceNamesInPull.add(cached.placeName);
        } else {
          uncachedSkeleton.push({ ...item, originalIdx: idx });
        }
      });

      console.log(`Cache hit: ${cachedItems.length}/${skeleton.length} items from cache`);

      let aiGeneratedItems: any[] = [];

      // Only call Gemini if there are uncached items
      if (uncachedSkeleton.length > 0) {
        const skeletonInstructions = uncachedSkeleton.map((item, idx) => 
          `${idx + 1}. [${item.timeSlot}] ${categoryMap[item.category] || item.category} - ${item.subCategory} (${item.suggestedTime}, energy: ${item.energyLevel})`
        ).join('\n');

        const prompt = `You are a professional travel planner AI. Fill in REAL place names for this itinerary skeleton in ${city}, ${country}.

【目標區域 Target District】
All places MUST be in "${targetDistrict}" district (within 5-10km radius).

【行程骨架 Itinerary Skeleton - FOLLOW THIS EXACTLY】
${skeletonInstructions}

【任務說明 Your Task】
For each skeleton slot above, find a REAL, existing place in ${targetDistrict} that matches:
- The category and sub-category specified
- The time slot and energy level
- Must be an actual business/location that exists

【排除清單 Exclusions】
Do NOT include any of these places (already used): ${usedPlaceNamesInPull.size > 0 ? Array.from(usedPlaceNamesInPull).join(', ') : 'none'}

Output language: ${outputLang}
Output ONLY valid JSON array, no markdown, no explanation.

[
${uncachedSkeleton.map((item, idx) => `  {
    "place_name": "REAL place name for ${item.subCategory} in ${targetDistrict}",
    "description": "2-3 sentence description",
    "category": "${categoryMap[item.category] || item.category}",
    "sub_category": "${item.subCategory}",
    "suggested_time": "${item.suggestedTime}",
    "duration": "1-2 hours",
    "time_slot": "${item.timeSlot}",
    "search_query": "place name ${city}",
    "color_hex": "#6366f1",
    "energy_level": "${item.energyLevel}"
  }`).join(',\n')}
]`;

        const responseText = await callGemini(prompt);
        let jsonText = responseText || '';
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        aiGeneratedItems = JSON.parse(jsonText);
      }

      // Merge cached and AI-generated items
      const districtCenter = await getDistrictBoundary(targetDistrict, city, country);
      const finalInventory: any[] = new Array(skeleton.length);

      // Process cached items (no Google API calls needed - data already in cache)
      for (const { skeletonIdx, cached, skeleton: skelItem } of cachedItems) {
        const cachedLocation = cached.locationLat && cached.locationLng 
          ? { lat: parseFloat(cached.locationLat), lng: parseFloat(cached.locationLng) }
          : null;
        
        finalInventory[skeletonIdx] = {
          id: Date.now() + skeletonIdx,
          place_name: cached.placeName,
          description: cached.description,
          category: cached.category,
          sub_category: cached.subCategory,
          suggested_time: skelItem.suggestedTime,
          duration: cached.duration || '1-2 hours',
          time_slot: skelItem.timeSlot,
          search_query: cached.searchQuery,
          color_hex: cached.colorHex || '#6366f1',
          city: city,
          country: country,
          district: targetDistrict,
          energy_level: skelItem.energyLevel,
          is_coupon: false,
          coupon_data: null,
          operating_status: 'OPEN',
          place_id: cached.placeId || null,
          verified_name: cached.verifiedName || cached.placeName,
          verified_address: cached.verifiedAddress || null,
          google_rating: cached.googleRating ? Number(cached.googleRating) : null,
          location: cachedLocation,
          is_location_verified: cached.isLocationVerified === true,
          district_center: districtCenter,
          from_cache: true
        };
      }

      // Process AI-generated items (need Google API verification and cache saving)
      const newCacheEntries: any[] = [];
      
      for (let i = 0; i < uncachedSkeleton.length; i++) {
        const skelItem = uncachedSkeleton[i];
        const aiItem = aiGeneratedItems[i];
        const originalIdx = skelItem.originalIdx;

        const placeResult = await searchPlaceInDistrict(
          aiItem.place_name,
          targetDistrict,
          city,
          country
        );

        let isVerified = false;
        let placeLocation: { lat: number; lng: number } | null = null;

        if (placeResult && placeResult.geometry) {
          placeLocation = placeResult.geometry.location;
          if (districtCenter) {
            isVerified = isWithinRadius(districtCenter, placeLocation, 5);
          } else {
            isVerified = true;
          }
        }

        const inventoryItem = {
          id: Date.now() + originalIdx,
          place_name: aiItem.place_name,
          description: aiItem.description,
          category: aiItem.category,
          sub_category: aiItem.sub_category,
          suggested_time: skelItem.suggestedTime,
          duration: aiItem.duration || '1-2 hours',
          time_slot: skelItem.timeSlot,
          search_query: aiItem.search_query,
          color_hex: aiItem.color_hex || '#6366f1',
          city: city,
          country: country,
          district: targetDistrict,
          energy_level: skelItem.energyLevel,
          is_coupon: false,
          coupon_data: null,
          operating_status: 'OPEN',
          place_id: placeResult?.place_id || null,
          verified_name: placeResult?.name || aiItem.place_name,
          verified_address: placeResult?.formatted_address || null,
          google_rating: placeResult?.rating || null,
          location: placeLocation,
          is_location_verified: isVerified,
          district_center: districtCenter,
          from_cache: false
        };

        finalInventory[originalIdx] = inventoryItem;

        // Prepare cache entry
        newCacheEntries.push({
          subCategory: aiItem.sub_category,
          district: targetDistrict,
          city: city,
          country: country,
          placeName: aiItem.place_name,
          description: aiItem.description,
          category: aiItem.category,
          suggestedTime: skelItem.suggestedTime,
          duration: aiItem.duration || '1-2 hours',
          searchQuery: aiItem.search_query,
          colorHex: aiItem.color_hex || '#6366f1',
          placeId: placeResult?.place_id || null,
          verifiedName: placeResult?.name || null,
          verifiedAddress: placeResult?.formatted_address || null,
          googleRating: placeResult?.rating?.toString() || null,
          locationLat: placeLocation?.lat?.toString() || null,
          locationLng: placeLocation?.lng?.toString() || null,
          isLocationVerified: isVerified
        });
      }

      // Save new entries to drafts (待審核) instead of cache
      if (newCacheEntries.length > 0) {
        try {
          // 映射代碼到資料庫中的實際名稱
          const countryNameMap: Record<string, string> = {
            'taiwan': '台灣',
            'japan': '日本',
            'hong_kong': '香港',
          };
          const cityNameMap: Record<string, string> = {
            'taipei': '台北市',
            'new_taipei': '新北市',
            'taoyuan': '桃園市',
            'taichung': '台中市',
            'tainan': '台南市',
            'kaohsiung': '高雄市',
            'keelung': '基隆市',
            'hsinchu_city': '新竹市',
            'chiayi_city': '嘉義市',
            'tokyo': '東京都',
            'osaka': '大阪市',
            'kyoto': '京都市',
            'fukuoka': '福岡市',
            'hong_kong': '香港',
          };
          const categoryNameMap: Record<string, string> = {
            'Food': '食',
            'Stay': '宿',
            'Education': '生態文化教育',
            'Activity': '遊程體驗',
            'Entertainment': '娛樂設施',
            'Scenery': '景點',
            'Shopping': '購物',
          };

          const draftEntries = newCacheEntries.map(entry => ({
            placeName: entry.placeName,
            description: entry.description,
            category: categoryNameMap[entry.category] || entry.category,
            subCategory: entry.subCategory,
            district: entry.district,
            city: cityNameMap[entry.city] || entry.city,
            country: countryNameMap[entry.country] || entry.country,
            googlePlaceId: entry.placeId,
            googleRating: entry.googleRating ? parseFloat(entry.googleRating) : null,
            locationLat: entry.locationLat,
            locationLng: entry.locationLng,
            address: entry.verifiedAddress,
          }));
          const savedDrafts = await storage.saveAIPlacesToDrafts(draftEntries);
          console.log(`Saved ${savedDrafts.length} new AI places to drafts (pending review)`);
        } catch (draftError) {
          console.error('Failed to save to drafts:', draftError);
        }
      }

      const data = {
        status: 'success',
        meta: {
          date: new Date().toISOString().split('T')[0],
          country: country,
          city: city,
          locked_district: targetDistrict,
          user_level: level,
          total_items: skeleton.length,
          verification_enabled: !!GOOGLE_MAPS_API_KEY,
          cache_hits: cachedItems.length,
          ai_generated: uncachedSkeleton.length
        },
        inventory: finalInventory
      };

      res.json({ data, sources: [] });
    } catch (error) {
      console.error("Gemini generation error:", error);
      res.status(500).json({ error: "Failed to generate itinerary" });
    }
  });

  // ============ Recur Payment Routes ============
  
  app.post("/api/checkout/create-session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { customerEmail } = req.body;
      
      const secretKey = process.env.RECUR_SECRET_KEY;
      if (!secretKey) {
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const appUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;

      const response = await fetch(`${RECUR_API_URL}/checkout/sessions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: RECUR_PREMIUM_PLAN_ID,
          mode: "SUBSCRIPTION",
          successUrl: `${appUrl}?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${appUrl}?payment_cancelled=true`,
          customerEmail: customerEmail || undefined,
          metadata: {
            userId: userId,
            plan: "premium"
          }
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Recur API error:", data);
        return res.status(response.status).json({ error: data.error || "Checkout failed" });
      }

      res.json({ url: data.url, sessionId: data.id });
    } catch (error) {
      console.error("Create checkout session error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.get("/api/checkout/session/:sessionId", isAuthenticated, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const secretKey = process.env.RECUR_SECRET_KEY;
      
      if (!secretKey) {
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const response = await fetch(`${RECUR_API_URL}/checkout/sessions/${sessionId}`, {
        headers: {
          "Authorization": `Bearer ${secretKey}`,
        },
      });

      const session = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: session.error });
      }

      res.json({ session });
    } catch (error) {
      console.error("Fetch checkout session error:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // Webhook for Recur payment events
  app.post("/api/webhooks/recur", async (req, res) => {
    try {
      const event = req.body;
      console.log("=== Recur Webhook Received ===");
      console.log("Event Type:", event.type);
      console.log("Event Data:", JSON.stringify(event, null, 2));

      switch (event.type) {
        case "checkout.completed": {
          // 結帳完成 - 啟用訂閱
          const checkout = event.data;
          const userId = checkout.metadata?.userId;
          
          if (userId) {
            const merchant = await storage.getMerchantByUserId(userId);
            if (merchant) {
              await storage.updateMerchantPlan(merchant.id, "premium");
              console.log(`[checkout.completed] Upgraded merchant ${merchant.id} to premium`);
            }
          }
          break;
        }

        case "subscription.created": {
          // 訂閱建立
          const subscription = event.data;
          const userId = subscription.metadata?.userId;
          console.log(`[subscription.created] Subscription ${subscription.id} created for user ${userId}`);
          
          if (userId && subscription.status === "active") {
            const merchant = await storage.getMerchantByUserId(userId);
            if (merchant) {
              await storage.updateMerchantPlan(merchant.id, "premium");
              console.log(`[subscription.created] Activated premium for merchant ${merchant.id}`);
            }
          }
          break;
        }

        case "subscription.updated": {
          // 訂閱更新
          const subscription = event.data;
          const userId = subscription.metadata?.userId;
          console.log(`[subscription.updated] Subscription ${subscription.id} updated, status: ${subscription.status}`);
          
          if (userId) {
            const merchant = await storage.getMerchantByUserId(userId);
            if (merchant) {
              if (subscription.status === "active") {
                await storage.updateMerchantPlan(merchant.id, "premium");
                console.log(`[subscription.updated] Merchant ${merchant.id} plan set to premium`);
              } else if (subscription.status === "canceled" || subscription.status === "expired") {
                await storage.updateMerchantPlan(merchant.id, "free");
                console.log(`[subscription.updated] Merchant ${merchant.id} plan downgraded to free`);
              }
            }
          }
          break;
        }

        case "subscription.canceled": {
          // 訂閱取消
          const subscription = event.data;
          const userId = subscription.metadata?.userId;
          console.log(`[subscription.canceled] Subscription ${subscription.id} canceled for user ${userId}`);
          
          if (userId) {
            const merchant = await storage.getMerchantByUserId(userId);
            if (merchant) {
              await storage.updateMerchantPlan(merchant.id, "free");
              console.log(`[subscription.canceled] Downgraded merchant ${merchant.id} to free`);
            }
          }
          break;
        }

        case "invoice.paid": {
          // 發票付款成功 - 續訂成功
          const invoice = event.data;
          console.log(`[invoice.paid] Invoice ${invoice.id} paid`);
          break;
        }

        case "invoice.payment_failed": {
          // 發票付款失敗
          const invoice = event.data;
          console.log(`[invoice.payment_failed] Invoice ${invoice.id} payment failed`);
          break;
        }

        default:
          console.log(`[webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Endpoint to get the webhook URL (for configuration reference)
  app.get("/api/webhooks/recur/info", (req, res) => {
    const domain = process.env.REPLIT_DEV_DOMAIN || `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    const webhookUrl = `https://${domain}/api/webhooks/recur`;
    res.json({ 
      webhookUrl,
      supportedEvents: [
        "checkout.completed",
        "subscription.created", 
        "subscription.updated",
        "subscription.canceled",
        "invoice.paid",
        "invoice.payment_failed"
      ]
    });
  });

  // ============ Location Hierarchy Routes ============

  app.get("/api/locations/countries", async (req, res) => {
    try {
      const countriesList = await storage.getCountries();
      res.json({ countries: countriesList });
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ error: "Failed to fetch countries" });
    }
  });

  app.get("/api/locations/regions/:countryId", async (req, res) => {
    try {
      const countryId = parseInt(req.params.countryId);
      const regionsList = await storage.getRegionsByCountry(countryId);
      res.json({ regions: regionsList });
    } catch (error) {
      console.error("Error fetching regions:", error);
      res.status(500).json({ error: "Failed to fetch regions" });
    }
  });

  app.get("/api/locations/districts/:regionId", async (req, res) => {
    try {
      const regionId = parseInt(req.params.regionId);
      const districtsList = await storage.getDistrictsByRegion(regionId);
      res.json({ districts: districtsList });
    } catch (error) {
      console.error("Error fetching districts:", error);
      res.status(500).json({ error: "Failed to fetch districts" });
    }
  });

  app.get("/api/locations/districts/country/:countryId", async (req, res) => {
    try {
      const countryId = parseInt(req.params.countryId);
      const districtsList = await storage.getDistrictsByCountry(countryId);
      res.json({ districts: districtsList, count: districtsList.length });
    } catch (error) {
      console.error("Error fetching districts by country:", error);
      res.status(500).json({ error: "Failed to fetch districts" });
    }
  });

  // ============ Category Routes ============

  app.get("/api/categories", async (req, res) => {
    try {
      const categoriesList = await storage.getCategories();
      res.json({ categories: categoriesList });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.get("/api/categories/:categoryId/subcategories", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      const subcategoriesList = await storage.getSubcategoriesByCategory(categoryId);
      res.json({ subcategories: subcategoriesList });
    } catch (error) {
      console.error("Error fetching subcategories:", error);
      res.status(500).json({ error: "Failed to fetch subcategories" });
    }
  });

  // ============ Gacha Pull Route ============

  // Helper function to generate a single place for a subcategory in a specific district
  async function generatePlaceForSubcategory(
    districtNameZh: string,
    regionNameZh: string,
    countryNameZh: string,
    category: any,
    subcategory: any,
    language: string,
    excludePlaceNames: string[] = []
  ): Promise<{
    category: any;
    subcategory: any;
    place: any;
    source: 'cache' | 'ai';
    isVerified: boolean;
  } | null> {
    const subcategoryNameZh = subcategory.nameZh;
    const categoryNameZh = category.nameZh;

    // Check cache first
    const cachedPlace = await storage.getCachedPlace(
      subcategoryNameZh,
      districtNameZh,
      regionNameZh,
      countryNameZh
    );

    // Only use cache if the place is not in the exclusion list
    if (cachedPlace && !excludePlaceNames.includes(cachedPlace.placeName)) {
      return {
        category,
        subcategory,
        place: {
          name: cachedPlace.placeName,
          description: cachedPlace.description,
          address: cachedPlace.verifiedAddress,
          placeId: cachedPlace.placeId,
          rating: cachedPlace.googleRating,
          googleTypes: cachedPlace.googleTypes?.split(',').filter(Boolean) || [],
          primaryType: cachedPlace.primaryType || null,
          location: cachedPlace.locationLat && cachedPlace.locationLng ? {
            lat: parseFloat(cachedPlace.locationLat),
            lng: parseFloat(cachedPlace.locationLng)
          } : null
        },
        source: 'cache',
        isVerified: cachedPlace.isLocationVerified || false
      };
    }

    // Generate with AI and verify
    const MAX_RETRIES = 2;
    let attempts = 0;
    let failedAttempts: string[] = [];

    while (attempts < MAX_RETRIES) {
      attempts++;
      
      // Combine failed attempts with already used places
      const allExclusions = [...excludePlaceNames, ...failedAttempts];
      
      const aiResult = await generatePlaceWithAI(
        districtNameZh,
        regionNameZh,
        countryNameZh,
        subcategoryNameZh,
        categoryNameZh,
        allExclusions
      );

      if (aiResult) {
        const verification = await verifyPlaceWithGoogle(
          aiResult.placeName,
          districtNameZh,
          regionNameZh
        );

        if (verification.verified) {
          // Save to cache
          const cacheEntry = await storage.savePlaceToCache({
            subCategory: subcategoryNameZh,
            district: districtNameZh,
            city: regionNameZh,
            country: countryNameZh,
            placeName: verification.verifiedName || aiResult.placeName,
            description: aiResult.description,
            category: categoryNameZh,
            searchQuery: `${subcategoryNameZh} ${districtNameZh} ${regionNameZh}`,
            placeId: verification.placeId || null,
            verifiedName: verification.verifiedName || null,
            verifiedAddress: verification.verifiedAddress || null,
            googleRating: verification.rating?.toString() || null,
            googleTypes: verification.googleTypes?.join(',') || null,
            primaryType: verification.primaryType || null,
            locationLat: verification.location?.lat?.toString() || null,
            locationLng: verification.location?.lng?.toString() || null,
            isLocationVerified: true
          });

          console.log(`[${categoryNameZh}] Verified: ${aiResult.placeName}`);
          return {
            category,
            subcategory,
            place: {
              name: cacheEntry.placeName,
              description: cacheEntry.description,
              address: cacheEntry.verifiedAddress,
              placeId: cacheEntry.placeId,
              rating: cacheEntry.googleRating,
              googleTypes: cacheEntry.googleTypes?.split(',').filter(Boolean) || [],
              primaryType: cacheEntry.primaryType || null,
              location: cacheEntry.locationLat && cacheEntry.locationLng ? {
                lat: parseFloat(cacheEntry.locationLat),
                lng: parseFloat(cacheEntry.locationLng)
              } : null
            },
            source: 'ai',
            isVerified: true
          };
        } else {
          failedAttempts.push(aiResult.placeName);
        }
      }
    }

    // Return a placeholder if no verified place found
    return {
      category,
      subcategory,
      place: {
        name: `${districtNameZh}${categoryNameZh}探索`,
        description: `探索${regionNameZh}${districtNameZh}的${subcategoryNameZh}特色。`,
        address: null,
        placeId: null,
        rating: null,
        location: null,
        warning: `該區域目前較少此類型店家`
      },
      source: 'ai',
      isVerified: false
    };
  }

  // New endpoint: Generate a complete itinerary using parallel time-slot AI architecture
  app.post("/api/gacha/itinerary", async (req, res) => {
    try {
      const { countryId, regionId, language = 'zh-TW', itemCount = 8 } = req.body;

      if (!countryId) {
        return res.status(400).json({ error: "countryId is required" });
      }

      // Step 1: Random district selection
      let district;
      if (regionId) {
        district = await storage.getRandomDistrictByRegion(regionId);
      } else {
        district = await storage.getRandomDistrictByCountry(countryId);
      }
      if (!district) {
        return res.status(404).json({ error: "No districts found" });
      }

      const districtWithParents = await storage.getDistrictWithParents(district.id);
      if (!districtWithParents) {
        return res.status(500).json({ error: "Failed to get district info" });
      }

      const getLocalizedName = (item: any, lang: string): string => {
        switch (lang) {
          case 'ja': return item.nameJa || item.nameZh || item.nameEn;
          case 'ko': return item.nameKo || item.nameZh || item.nameEn;
          case 'en': return item.nameEn;
          default: return item.nameZh || item.nameEn;
        }
      };

      const districtNameZh = districtWithParents.district.nameZh;
      const regionNameZh = districtWithParents.region.nameZh;
      const countryNameZh = districtWithParents.country.nameZh;

      // Step 2: Get all subcategories with their parent categories
      const allSubcategories = await storage.getAllSubcategoriesWithCategory();
      if (!allSubcategories || allSubcategories.length === 0) {
        return res.status(404).json({ error: "No subcategories found" });
      }

      // Step 3: Define AI worker distribution based on itemCount
      // Each AI has specific responsibilities per time slot
      type AIWorker = 'ai1_morning' | 'ai2_afternoon' | 'ai3_evening' | 'ai4_night';
      
      interface AITask {
        worker: AIWorker;
        tasks: { type: 'breakfast' | 'lunch' | 'dinner' | 'activity' | 'stay'; count: number }[];
      }
      
      const getAIDistribution = (count: number): AITask[] => {
        switch (count) {
          case 5: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 1 }] }, // 早餐 + 1項早上活動
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] }  // 午餐 + 2項下午活動
          ];
          case 6: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] }, // 早餐 + 2項早上活動
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] }  // 午餐 + 2項下午活動
          ];
          case 7: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }] }
          ];
          case 8: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 1 }] }
          ];
          case 9: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] }
          ];
          case 10: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai4_night', tasks: [{ type: 'stay', count: 1 }] }
          ];
          case 11: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai4_night', tasks: [{ type: 'stay', count: 1 }, { type: 'activity', count: 1 }] }
          ];
          case 12: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai4_night', tasks: [{ type: 'stay', count: 1 }, { type: 'activity', count: 2 }] }
          ];
          default: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] }
          ];
        }
      };

      const aiDistribution = getAIDistribution(itemCount);
      
      console.log(`\n=== Generating itinerary for ${regionNameZh}${districtNameZh} (${itemCount} items, ${aiDistribution.length} AI workers) ===`);
      console.log(`AI Distribution:`, aiDistribution.map(a => `${a.worker}: ${a.tasks.map(t => `${t.type}×${t.count}`).join('+')}`).join(' | '));

      // === HARDCODED PROBABILITY CONSTANTS ===
      const CACHE_USE_PROBABILITY = 0.25; // 25% chance to use cache
      const COLLECTED_REDUCTION_PROBABILITY = 0.45; // 45% reduction for collected items
      
      // Step 4: Select subcategory using 1/8 category probability, then 1/N subcategory probability
      // with time-appropriate filtering to avoid awkward combinations
      const selectSubcategoryForTask = (worker: AIWorker, taskType: string): typeof allSubcategories[0] | null => {
        // Define excluded categories/subcategories per worker to avoid awkward combinations
        const excludedByWorker: Record<AIWorker, { categories: string[]; subcategories: string[] }> = {
          'ai1_morning': { 
            categories: [], 
            subcategories: ['酒吧', 'KTV', '夜市'] // No nightlife in morning
          },
          'ai2_afternoon': { 
            categories: [], 
            subcategories: ['早午餐'] // No breakfast in afternoon
          },
          'ai3_evening': { 
            categories: [], 
            subcategories: ['早午餐', '咖啡廳'] // No breakfast/cafe at dinner
          },
          'ai4_night': { 
            categories: [], 
            subcategories: ['早午餐', '咖啡廳'] // No breakfast at night
          }
        };

        // For specific task types, filter directly
        if (taskType === 'breakfast') {
          // Prefer breakfast-appropriate food: 早午餐, 咖啡廳, 在地早餐
          const breakfastSubcats = allSubcategories.filter(s => 
            s.category.code === 'food' && 
            (s.nameZh.includes('早') || s.nameZh.includes('咖啡') || s.nameZh.includes('甜點'))
          );
          // Fallback to any food if no breakfast-specific found
          const fallback = allSubcategories.filter(s => s.category.code === 'food');
          const options = breakfastSubcats.length > 0 ? breakfastSubcats : fallback;
          return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
        } else if (taskType === 'lunch') {
          // Any food subcategory for lunch, excluding late-night options
          const lunchSubcats = allSubcategories.filter(s => 
            s.category.code === 'food' && 
            !s.nameZh.includes('宵夜') && !s.nameZh.includes('酒')
          );
          const fallback = allSubcategories.filter(s => s.category.code === 'food');
          const options = lunchSubcats.length > 0 ? lunchSubcats : fallback;
          return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
        } else if (taskType === 'dinner') {
          // Any food subcategory for dinner
          const dinnerSubcats = allSubcategories.filter(s => 
            s.category.code === 'food' && !s.nameZh.includes('早')
          );
          const fallback = allSubcategories.filter(s => s.category.code === 'food');
          const options = dinnerSubcats.length > 0 ? dinnerSubcats : fallback;
          return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
        } else if (taskType === 'stay') {
          const staySubcats = allSubcategories.filter(s => s.category.code === 'stay');
          return staySubcats.length > 0 ? staySubcats[Math.floor(Math.random() * staySubcats.length)] : null;
        }
        
        // For 'activity' task type: use 1/8 category probability, then 1/N subcategory probability
        // Step A: Get all 8 categories (excluding food and stay for activities)
        const allCategorySet = new Set<string>();
        allSubcategories.forEach(s => allCategorySet.add(s.category.code));
        const allCategories = Array.from(allCategorySet);
        const activityCategories = allCategories.filter(code => 
          code !== 'food' && code !== 'stay'
        );
        
        if (activityCategories.length === 0) return null;
        
        // Step B: Apply worker-specific exclusions
        const exclusions = excludedByWorker[worker];
        const validCategories = activityCategories.filter(code => !exclusions.categories.includes(code));
        
        if (validCategories.length === 0) return null;
        
        // Step C: Pick random category with 1/N probability (equal chance)
        const selectedCategoryCode = validCategories[Math.floor(Math.random() * validCategories.length)];
        
        // Step D: Get subcategories for this category, excluding awkward ones
        const categorySubcats = allSubcategories.filter(s => 
          s.category.code === selectedCategoryCode &&
          !exclusions.subcategories.includes(s.nameZh) &&
          s.preferredTimeSlot !== 'stay'
        );
        
        if (categorySubcats.length === 0) return null;
        
        // Step E: Pick random subcategory with 1/N probability (equal chance)
        return categorySubcats[Math.floor(Math.random() * categorySubcats.length)];
      };

      const startTime = Date.now();
      let cacheHits = 0;
      let aiGenerated = 0;

      // Helper to build item with merchant promo
      const buildItemWithPromo = async (result: any) => {
        let merchantPromo = null;
        let merchantLink = null;
        
        if (result.place?.place_id) {
          merchantLink = await storage.getPlaceLinkByGooglePlaceId(result.place.place_id);
        }
        if (!merchantLink && result.place?.name) {
          merchantLink = await storage.getPlaceLinkByPlace(result.place.name, districtNameZh, regionNameZh);
        }
        
        if (merchantLink && merchantLink.isPromoActive && merchantLink.promoTitle) {
          merchantPromo = {
            merchantId: merchantLink.merchantId,
            title: merchantLink.promoTitle,
            description: merchantLink.promoDescription,
            imageUrl: merchantLink.promoImageUrl
          };
        }

        return {
          category: {
            id: result.category.id,
            code: result.category.code,
            name: getLocalizedName(result.category, language),
            colorHex: result.category.colorHex
          },
          subcategory: {
            id: result.subcategory.id,
            code: result.subcategory.code,
            name: getLocalizedName(result.subcategory, language)
          },
          place: result.place,
          isVerified: result.isVerified,
          source: result.source,
          is_promo_active: !!merchantPromo,
          store_promo: merchantPromo?.title || null,
          merchant_promo: merchantPromo
        };
      };

      // Step 5: Preload cache for this district
      const cachedPlacesForDistrict = await storage.getCachedPlaces(
        districtNameZh,
        regionNameZh,
        countryNameZh
      );
      const cacheBySubcategory = new Map<string, typeof cachedPlacesForDistrict[0]>();
      for (const cached of cachedPlacesForDistrict) {
        if (!cacheBySubcategory.has(cached.subCategory)) {
          cacheBySubcategory.set(cached.subCategory, cached);
        }
      }

      // Step 6: Get user's collected place names for probability reduction
      const userId = (req as any).user?.id;
      let collectedPlaceNames: Set<string> = new Set();
      if (userId) {
        try {
          const userCollections = await storage.getUserCollections(userId);
          for (const collection of userCollections) {
            if (collection.placeName) {
              collectedPlaceNames.add(collection.placeName);
            }
          }
        } catch (e) {
          console.log("Could not fetch user collections for probability adjustment");
        }
      }
      
      // Step 7: Execute each AI worker in TRUE PARALLEL
      // Each worker handles its assigned tasks (breakfast/lunch/dinner/activity/stay)
      // Tasks within each worker also run in parallel for maximum speed
      const executeAIWorker = async (aiTask: AITask): Promise<any[]> => {
        const usedSubcatIds = new Set<number>();
        
        // Phase 1: Pre-select all subcategories for this worker (synchronous)
        interface TaskItem {
          taskType: string;
          selectedSubcat: typeof allSubcategories[0];
          cached: typeof cachedPlacesForDistrict[0] | null;
          shouldUseCache: boolean;
        }
        const taskItems: TaskItem[] = [];
        
        for (const task of aiTask.tasks) {
          for (let i = 0; i < task.count; i++) {
            let selectedSubcat = selectSubcategoryForTask(aiTask.worker, task.type);
            
            let retries = 0;
            while (selectedSubcat && usedSubcatIds.has(selectedSubcat.id) && retries < 3) {
              selectedSubcat = selectSubcategoryForTask(aiTask.worker, task.type);
              retries++;
            }
            
            if (!selectedSubcat || usedSubcatIds.has(selectedSubcat.id)) continue;
            usedSubcatIds.add(selectedSubcat.id);
            
            const shouldUseCache = Math.random() < CACHE_USE_PROBABILITY;
            const cached = cacheBySubcategory.get(selectedSubcat.nameZh) || null;
            
            taskItems.push({
              taskType: task.type,
              selectedSubcat,
              cached,
              shouldUseCache
            });
          }
        }
        
        console.log(`[${aiTask.worker}] Processing ${taskItems.length} tasks in parallel`);
        
        // Phase 2: Execute all tasks in parallel
        const taskPromises = taskItems.map(async (taskItem) => {
          const { taskType, selectedSubcat, cached, shouldUseCache } = taskItem;
          
          // Try cache first
          if (shouldUseCache && cached && cached.placeName) {
            if (collectedPlaceNames.has(cached.placeName)) {
              if (Math.random() < COLLECTED_REDUCTION_PROBABILITY) {
                console.log(`[${aiTask.worker}] Skipping collected: ${cached.placeName}`);
              } else {
                const item = await buildItemWithPromo({
                  category: selectedSubcat.category,
                  subcategory: selectedSubcat,
                  place: {
                    name: cached.placeName,
                    description: cached.description,
                    place_id: cached.placeId,
                    verified_name: cached.verifiedName,
                    verified_address: cached.verifiedAddress,
                    google_rating: cached.googleRating,
                    lat: cached.locationLat,
                    lng: cached.locationLng,
                    google_types: cached.googleTypes,
                    primary_type: cached.primaryType
                  },
                  isVerified: cached.isLocationVerified,
                  source: 'cache'
                });
                return { ...item, aiWorker: aiTask.worker, taskType };
              }
            } else {
              const item = await buildItemWithPromo({
                category: selectedSubcat.category,
                subcategory: selectedSubcat,
                place: {
                  name: cached.placeName,
                  description: cached.description,
                  place_id: cached.placeId,
                  verified_name: cached.verifiedName,
                  verified_address: cached.verifiedAddress,
                  google_rating: cached.googleRating,
                  lat: cached.locationLat,
                  lng: cached.locationLng,
                  google_types: cached.googleTypes,
                  primary_type: cached.primaryType
                },
                isVerified: cached.isLocationVerified,
                source: 'cache'
              });
              return { ...item, aiWorker: aiTask.worker, taskType };
            }
          }
          
          // Generate with AI (runs in parallel with other tasks)
          const result = await generatePlaceForSubcategory(
            districtNameZh, regionNameZh, countryNameZh,
            selectedSubcat.category, selectedSubcat, language,
            []
          );

          if (result && result.place?.name) {
            // Skip if AI returned "no match found" type response
            const desc = result.place.description || '';
            if (desc.includes('無符合條件') || desc.includes('目前無符合') || desc.includes('沒有符合')) {
              console.log(`[${aiTask.worker}] Skipping no-match result: ${result.place.name}`);
              return null;
            }
            
            if (collectedPlaceNames.has(result.place.name)) {
              if (Math.random() < COLLECTED_REDUCTION_PROBABILITY) {
                console.log(`[${aiTask.worker}] Skipping collected AI: ${result.place.name}`);
                return null;
              }
            }
            
            const item = await buildItemWithPromo(result);
            return { ...item, aiWorker: aiTask.worker, taskType };
          }
          
          return null;
        });
        
        // Wait for all tasks to complete in parallel
        const results = await Promise.all(taskPromises);
        
        // Normalize place names by removing common suffixes/variations
        // Returns original trimmed name if normalization results in empty string
        const normalizePlaceName = (name: string): string => {
          if (!name) return '';
          const trimmed = name.trim();
          const normalized = trimmed
            .replace(/[（(][^）)]*[）)]/g, '') // Remove content in parentheses
            .replace(/旅遊服務園區|生態園區|園區|服務中心|遊客中心|觀光工廠|休閒農場/g, '')
            .replace(/\s+/g, '')
            .trim();
          // Fall back to original if normalization removes everything
          return normalized || trimmed;
        };
        
        // Filter out null results AND deduplicate by Google Place ID (or normalized name as fallback)
        const seenPlaceIds = new Set<string>();
        return results.filter((item): item is NonNullable<typeof item> => {
          if (item === null) return false;
          const placeId = item.place?.place_id || item.place?.placeId;
          const placeName = item.place?.name;
          const normalizedName = normalizePlaceName(placeName || '');
          // Use Place ID as primary dedup key, fall back to normalized name
          const dedupKey = placeId || normalizedName;
          if (!dedupKey || seenPlaceIds.has(dedupKey)) {
            console.log(`[Dedup] Skipping duplicate: ${placeName} (key: ${dedupKey})`);
            return false;
          }
          seenPlaceIds.add(dedupKey);
          return true;
        });
      };

      // Run ALL AI workers in TRUE PARALLEL (not sequential!)
      console.log(`\n=== Starting ${aiDistribution.length} AI workers in PARALLEL ===`);
      const parallelStartTime = Date.now();
      
      const workerPromises = aiDistribution.map(aiTask => {
        const workerStart = Date.now();
        return executeAIWorker(aiTask).then(result => {
          console.log(`[${aiTask.worker}] Completed in ${Date.now() - workerStart}ms (${result.length} items)`);
          return result;
        });
      });
      
      const workerResults = await Promise.all(workerPromises);
      console.log(`=== All workers completed in ${Date.now() - parallelStartTime}ms (parallel execution) ===\n`);

      // Normalize place names by removing common suffixes/variations
      // Returns original trimmed name if normalization results in empty string
      const normalizePlaceName = (name: string): string => {
        if (!name) return '';
        const trimmed = name.trim();
        const normalized = trimmed
          .replace(/[（(][^）)]*[）)]/g, '') // Remove content in parentheses
          .replace(/旅遊服務園區|生態園區|園區|服務中心|遊客中心|觀光工廠|休閒農場/g, '')
          .replace(/\s+/g, '')
          .trim();
        // Fall back to original if normalization removes everything
        return normalized || trimmed;
      };
      
      // Merge results in order: ai1_morning -> ai2_afternoon -> ai3_evening -> ai4_night
      // Use Google Place ID for deduplication to avoid same location with different names
      const items: any[] = [];
      const globalSeenPlaceIds = new Set<string>();
      
      for (const workerItems of workerResults) {
        for (const item of workerItems) {
          const placeId = item.place?.place_id || item.place?.placeId;
          const placeName = item.place?.name;
          const normalizedName = normalizePlaceName(placeName || '');
          const dedupKey = placeId || normalizedName;
          
          if (dedupKey && !globalSeenPlaceIds.has(dedupKey)) {
            globalSeenPlaceIds.add(dedupKey);
            items.push(item);
            if (item.source === 'cache') cacheHits++;
            else aiGenerated++;
          } else {
            console.log(`[Global Dedup] Skipping: ${placeName} (key: ${dedupKey})`);
          }
        }
      }

      // === BACKFILL PHASE: Try to fill missing slots ===
      let shortageWarning: string | null = null;
      const usedSubcatIds = new Set<number>(items.map(i => i.subcategory?.id).filter(Boolean));
      
      if (items.length < itemCount) {
        const missing = itemCount - items.length;
        console.log(`\n=== BACKFILL: Need ${missing} more items ===`);
        
        let backfillAttempts = 0;
        const maxBackfillAttempts = missing * 3;
        
        // Clone and shuffle to avoid mutating original array
        const availableSubcats = allSubcategories
          .filter(s => !usedSubcatIds.has(s.id))
          .slice()
          .sort(() => Math.random() - 0.5);
        
        for (const subcat of availableSubcats) {
          if (items.length >= itemCount || backfillAttempts >= maxBackfillAttempts) break;
          backfillAttempts++;
          
          console.log(`[Backfill] Trying: ${subcat.category?.nameZh} - ${subcat.nameZh}`);
          const result = await generatePlaceForSubcategory(
            districtNameZh, regionNameZh, countryNameZh,
            subcat.category, subcat, language, []
          );
          
          if (result && result.place?.name) {
            // Skip if AI returned "no match found" type response
            const desc = result.place.description || '';
            if (desc.includes('無符合條件') || desc.includes('目前無符合') || desc.includes('沒有符合')) {
              console.log(`[Backfill] Skipping no-match result: ${result.place.name}`);
              continue;
            }
            
            const placeId = result.place.place_id || result.place.placeId;
            const normalizedName = normalizePlaceName(result.place.name);
            const dedupKey = placeId || normalizedName;
            if (!globalSeenPlaceIds.has(dedupKey)) {
              globalSeenPlaceIds.add(dedupKey);
              usedSubcatIds.add(subcat.id);
              const item = await buildItemWithPromo(result);
              items.push({ ...item, aiWorker: 'backfill', taskType: 'backfill' });
              aiGenerated++;
              console.log(`[Backfill] Added: ${result.place.name}`);
            }
          }
        }
      }
      
      // Always set warning when below target
      if (items.length < itemCount) {
        shortageWarning = language === 'zh-TW' 
          ? `此區域的觀光資源有限，僅找到 ${items.length} 個地點`
          : language === 'ja'
          ? `このエリアでは ${items.length} 件のスポットのみ見つかりました`
          : language === 'ko'
          ? `이 지역에서 ${items.length}개의 장소만 찾았습니다`
          : `Only ${items.length} spots found in this area`;
        console.log(`[Shortage] Warning: ${shortageWarning}`);
      }

      const duration = Date.now() - startTime;
      console.log(`Generated ${items.length}/${itemCount} items in ${duration}ms (cache: ${cacheHits}, AI: ${aiGenerated}, workers: ${aiDistribution.length})`);

      // Return the complete itinerary
      res.json({
        success: true,
        itinerary: {
          location: {
            district: {
              id: district.id,
              code: district.code,
              name: getLocalizedName(districtWithParents.district, language),
              nameZh: districtNameZh
            },
            region: {
              id: districtWithParents.region.id,
              code: districtWithParents.region.code,
              name: getLocalizedName(districtWithParents.region, language),
              nameZh: regionNameZh
            },
            country: {
              id: districtWithParents.country.id,
              code: districtWithParents.country.code,
              name: getLocalizedName(districtWithParents.country, language)
            }
          },
          items,
          meta: {
            totalItems: items.length,
            requestedItems: itemCount,
            cacheHits,
            aiGenerated,
            verifiedCount: items.filter(i => i.isVerified).length,
            shortageWarning
          }
        }
      });
    } catch (error) {
      console.error("Itinerary generation error:", error);
      res.status(500).json({ error: "Failed to generate itinerary" });
    }
  });

  // Keep original single pull endpoint for backward compatibility
  app.post("/api/gacha/pull", async (req, res) => {
    try {
      const { countryId, regionId, language = 'zh-TW' } = req.body;

      if (!countryId) {
        return res.status(400).json({ error: "countryId is required" });
      }

      // Step 1: Random district selection
      let district;
      if (regionId) {
        district = await storage.getRandomDistrictByRegion(regionId);
      } else {
        district = await storage.getRandomDistrictByCountry(countryId);
      }
      if (!district) {
        return res.status(404).json({ error: "No districts found" });
      }

      const districtWithParents = await storage.getDistrictWithParents(district.id);
      if (!districtWithParents) {
        return res.status(500).json({ error: "Failed to get district info" });
      }

      // Step 2: Random category and subcategory selection
      const category = await storage.getRandomCategory();
      if (!category) {
        return res.status(404).json({ error: "No categories found" });
      }
      
      const subcategory = await storage.getRandomSubcategoryByCategory(category.id);
      if (!subcategory) {
        return res.status(404).json({ error: "No subcategories found" });
      }

      // Get names for response
      const getLocalizedName = (item: any, lang: string): string => {
        switch (lang) {
          case 'ja': return item.nameJa || item.nameZh || item.nameEn;
          case 'ko': return item.nameKo || item.nameZh || item.nameEn;
          case 'en': return item.nameEn;
          default: return item.nameZh || item.nameEn;
        }
      };

      const districtNameZh = districtWithParents.district.nameZh;
      const regionNameZh = districtWithParents.region.nameZh;
      const countryNameZh = districtWithParents.country.nameZh;

      // Generate place for this subcategory
      const result = await generatePlaceForSubcategory(
        districtNameZh,
        regionNameZh,
        countryNameZh,
        category,
        subcategory,
        language
      );

      if (!result) {
        return res.status(500).json({ error: "Failed to generate place" });
      }

      // Return the gacha result
      res.json({
        success: true,
        pull: {
          location: {
            district: {
              id: district.id,
              code: district.code,
              name: getLocalizedName(districtWithParents.district, language),
              nameZh: districtNameZh
            },
            region: {
              id: districtWithParents.region.id,
              code: districtWithParents.region.code,
              name: getLocalizedName(districtWithParents.region, language),
              nameZh: regionNameZh
            },
            country: {
              id: districtWithParents.country.id,
              code: districtWithParents.country.code,
              name: getLocalizedName(districtWithParents.country, language)
            }
          },
          category: {
            id: result.category.id,
            code: result.category.code,
            name: getLocalizedName(result.category, language),
            colorHex: result.category.colorHex
          },
          subcategory: {
            id: result.subcategory.id,
            code: result.subcategory.code,
            name: getLocalizedName(result.subcategory, language)
          },
          place: result.place,
          meta: {
            source: result.source,
            isVerified: result.isVerified
          }
        }
      });
    } catch (error) {
      console.error("Gacha pull error:", error);
      res.status(500).json({ error: "Failed to perform gacha pull" });
    }
  });

  // ============ Gacha V2 - Places Pool Based ============
  
  // Gacha pool preview - show jackpot places for a district
  app.get("/api/gacha/pool/:city/:district", async (req, res) => {
    try {
      const { city, district } = req.params;
      
      if (!city || !district) {
        return res.status(400).json({ error: "city and district are required" });
      }

      const decodedCity = decodeURIComponent(city);
      const decodedDistrict = decodeURIComponent(district);
      
      // Get jackpot places: rating > 4.5 or has merchantId
      const jackpotPlaces = await storage.getJackpotPlaces(decodedCity, decodedDistrict);
      
      res.json({
        success: true,
        pool: {
          city: decodedCity,
          district: decodedDistrict,
          jackpots: jackpotPlaces.map(p => ({
            id: p.id,
            placeName: p.placeName,
            category: p.category,
            rating: p.rating,
            hasMerchant: !!p.merchantId,
            isPromoActive: p.isPromoActive,
          })),
          totalInPool: jackpotPlaces.length,
        }
      });
    } catch (error) {
      console.error("Gacha pool error:", error);
      res.status(500).json({ error: "Failed to get gacha pool" });
    }
  });

  // Gacha pull V2 - from verified places pool with weighted selection
  app.post("/api/gacha/pull/v2", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { city, district, itemCount = 5 } = req.body;
      
      if (!city || !district) {
        return res.status(400).json({ error: "city and district are required" });
      }

      // Get current hour to determine time slot
      const hour = new Date().getHours();
      let timeSlots: string[] = [];
      
      if (hour >= 6 && hour < 10) {
        timeSlots = ['morning', 'FOOD'];
      } else if (hour >= 10 && hour < 14) {
        timeSlots = ['lunch', 'FOOD', 'SPOT'];
      } else if (hour >= 14 && hour < 17) {
        timeSlots = ['afternoon', 'SPOT', 'SHOP', 'EXP'];
      } else if (hour >= 17 && hour < 21) {
        timeSlots = ['dinner', 'FOOD', 'FUN'];
      } else {
        timeSlots = ['evening', 'FUN', 'FOOD'];
      }

      // Get all places in the pool for this district
      const allPlaces = await storage.getPlacesByDistrict(city, district);
      
      if (allPlaces.length === 0) {
        return res.json({
          success: true,
          items: [],
          meta: {
            message: "No places found in this district. Run seed to populate.",
            city,
            district,
          }
        });
      }

      // Get user's collected places for de-weighting
      const userCollections = userId ? await storage.getUserCollections(userId) : [];
      const collectedPlaceNames = new Set(userCollections.map(c => c.placeName));

      // Calculate weights for each place
      const weightedPlaces = allPlaces.map(place => {
        let weight = 1.0;
        
        // Boost places matching time slot categories
        if (timeSlots.includes(place.category)) {
          weight *= 1.5;
        }
        
        // Boost high-rated places
        if (place.rating && place.rating >= 4.5) {
          weight *= 1.3;
        }
        
        // Boost merchant places with active promo
        if (place.merchantId && place.isPromoActive) {
          weight *= 1.4;
        }
        
        // De-weight already collected places by 45%
        if (collectedPlaceNames.has(place.placeName)) {
          weight *= 0.55;
        }
        
        return { place, weight };
      });

      // Weighted random selection without replacement
      const selectedPlaces: typeof allPlaces = [];
      const availablePlaces = [...weightedPlaces];

      for (let i = 0; i < Math.min(itemCount, allPlaces.length) && availablePlaces.length > 0; i++) {
        const totalWeight = availablePlaces.reduce((sum, p) => sum + p.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (let j = 0; j < availablePlaces.length; j++) {
          random -= availablePlaces[j].weight;
          if (random <= 0) {
            selectedPlaces.push(availablePlaces[j].place);
            availablePlaces.splice(j, 1);
            break;
          }
        }
      }

      // Determine coupon drops for each place
      const RARITY_DROP_RATES: Record<string, number> = {
        SP: 0.02,
        SSR: 0.08,
        SR: 0.15,
        S: 0.20,
        R: 0.35,
      };

      const items = await Promise.all(selectedPlaces.map(async (place) => {
        let couponDrop = null;
        
        // Check if this place has active coupons
        const coupons = await storage.getCouponsByPlaceId(place.id);
        const activeCoupons = coupons.filter(c => c.isActive && !c.archived && c.remainingQuantity > 0);
        
        if (activeCoupons.length > 0) {
          // Roll for each coupon based on rarity
          for (const coupon of activeCoupons) {
            const dropRate = coupon.dropRate || RARITY_DROP_RATES[coupon.rarity || 'R'] || 0.35;
            if (Math.random() < dropRate) {
              couponDrop = {
                id: coupon.id,
                title: coupon.title,
                code: coupon.code,
                rarity: coupon.rarity,
                terms: coupon.terms,
              };
              break;
            }
          }
        }

        return {
          id: place.id,
          placeName: place.placeName,
          category: place.category,
          subcategory: place.subcategory,
          description: place.description,
          address: place.address,
          rating: place.rating,
          locationLat: place.locationLat,
          locationLng: place.locationLng,
          googlePlaceId: place.googlePlaceId,
          photoReference: place.photoReference,
          coupon: couponDrop,
        };
      }));

      res.json({
        success: true,
        pull: {
          city,
          district,
          timeSlot: timeSlots[0],
          items,
        },
        meta: {
          totalItems: items.length,
          requestedItems: itemCount,
          poolSize: allPlaces.length,
          couponDrops: items.filter(i => i.coupon).length,
        }
      });
    } catch (error) {
      console.error("Gacha pull v2 error:", error);
      res.status(500).json({ error: "Failed to perform gacha pull" });
    }
  });

  // ============ Gacha V3 - Official Pool with Coupon Drop ============
  
  app.post("/api/gacha/pull/v3", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const pullSchema = z.object({
        city: z.string().min(1),
        district: z.string().min(1),
        count: z.number().int().min(1).max(10).optional().default(5),
      });

      const validated = pullSchema.parse(req.body);
      const { city, district, count } = validated;

      const pulledPlaces = await storage.getOfficialPlacesByDistrict(city, district, count);
      
      if (pulledPlaces.length === 0) {
        return res.json({
          success: true,
          places: [],
          couponsWon: [],
          meta: {
            message: "No places found in this district pool.",
            city,
            district,
          }
        });
      }

      const placesResult: Array<{
        id: number;
        placeName: string;
        category: string;
        subcategory?: string | null;
        description?: string | null;
        address?: string | null;
        rating?: number | null;
        locationLat?: number | null;
        locationLng?: number | null;
        googlePlaceId?: string | null;
        hasMerchantClaim: boolean;
        couponWon?: {
          id: number;
          title: string;
          code: string;
          terms?: string | null;
        } | null;
      }> = [];
      
      const couponsWon: Array<{
        couponId: number;
        placeId: number;
        placeName: string;
        title: string;
        code: string;
        terms?: string | null;
      }> = [];

      for (const place of pulledPlaces) {
        let couponWon: typeof couponsWon[0] | null = null;
        let hasMerchantClaim = false;

        const claimInfo = await storage.getClaimByOfficialPlaceId(place.id);
        
        if (claimInfo) {
          hasMerchantClaim = true;
          
          const dropRate = claimInfo.claim.couponDropRate ?? 0.1;
          
          if (Math.random() < dropRate && claimInfo.coupons.length > 0) {
            const randomIndex = Math.floor(Math.random() * claimInfo.coupons.length);
            const wonCoupon = claimInfo.coupons[randomIndex];
            
            couponWon = {
              couponId: wonCoupon.id,
              placeId: place.id,
              placeName: place.placeName,
              title: wonCoupon.title,
              code: wonCoupon.code,
              terms: wonCoupon.terms,
            };
            
            couponsWon.push(couponWon);
            
            await storage.saveToCollectionWithCoupon(userId, place, wonCoupon);
          } else {
            await storage.saveToCollectionWithCoupon(userId, place);
          }
        } else {
          await storage.saveToCollectionWithCoupon(userId, place);
        }

        placesResult.push({
          id: place.id,
          placeName: place.placeName,
          category: place.category,
          subcategory: place.subcategory,
          description: place.description,
          address: place.address,
          rating: place.rating,
          locationLat: place.locationLat,
          locationLng: place.locationLng,
          googlePlaceId: place.googlePlaceId,
          hasMerchantClaim,
          couponWon: couponWon ? {
            id: couponWon.couponId,
            title: couponWon.title,
            code: couponWon.code,
            terms: couponWon.terms,
          } : null,
        });
      }

      res.json({
        success: true,
        places: placesResult,
        couponsWon,
        meta: {
          city,
          district,
          totalPlaces: placesResult.length,
          totalCouponsWon: couponsWon.length,
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Gacha pull v3 error:", error);
      res.status(500).json({ error: "Failed to perform gacha pull" });
    }
  });

  // ============ Gacha V3 - One-Day Itinerary from Official Pool ============
  
  app.post("/api/gacha/itinerary/v3", isAuthenticated, async (req: any, res) => {
    console.log('[Gacha V3] Request received:', { body: req.body, userId: req.user?.claims?.sub });
    
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        console.log('[Gacha V3] No userId found in request');
        return res.status(401).json({ 
          success: false,
          error: "需要登入才能使用扭蛋功能",
          code: "AUTH_REQUIRED"
        });
      }

      const itinerarySchema = z.object({
        city: z.string().min(1, "請選擇城市"),
        district: z.string().min(1, "請選擇區域"),
        pace: z.enum(['relaxed', 'moderate', 'packed']).optional().default('moderate'),
      });

      const validated = itinerarySchema.parse(req.body);
      const { city, district, pace } = validated;
      
      console.log('[Gacha V3] Validated params:', { city, district, pace, userId });

      const itemCounts = { relaxed: 5, moderate: 7, packed: 10 };
      const targetCount = itemCounts[pace];

      const allPlaces = await storage.getOfficialPlacesByDistrict(city, district, 50);
      
      console.log('[Gacha V3] Found places:', allPlaces.length);
      
      if (allPlaces.length === 0) {
        console.log('[Gacha V3] No places found for:', { city, district });
        return res.json({
          success: true,
          itinerary: [],
          couponsWon: [],
          meta: { 
            message: `${city}${district}目前還沒有上線的景點，我們正在努力擴充中！`,
            code: "NO_PLACES_AVAILABLE",
            city, 
            district 
          }
        });
      }

      const categoryToTimeSlot: Record<string, string[]> = {
        'food': ['breakfast', 'lunch', 'dinner'],
        'scenery': ['morning', 'afternoon'],
        'activity': ['morning', 'afternoon', 'evening'],
        'entertainment': ['afternoon', 'evening'],
        'education': ['morning', 'afternoon'],
        'experience': ['morning', 'afternoon'],
        'shopping': ['afternoon', 'evening'],
        'stay': ['evening'],
      };

      const timeSlotOrder = ['breakfast', 'morning', 'lunch', 'afternoon', 'dinner', 'evening'];
      
      const timeSlotQuotas: Record<string, number> = pace === 'relaxed' 
        ? { breakfast: 1, morning: 1, lunch: 1, afternoon: 1, dinner: 1 }
        : pace === 'moderate'
        ? { breakfast: 1, morning: 1, lunch: 1, afternoon: 2, dinner: 1, evening: 1 }
        : { breakfast: 1, morning: 2, lunch: 1, afternoon: 3, dinner: 1, evening: 2 };

      const itinerary: Array<{
        timeSlot: string;
        place: {
          id: number;
          placeName: string;
          category: string;
          subcategory?: string | null;
          description?: string | null;
          address?: string | null;
          rating?: number | null;
          locationLat?: number | null;
          locationLng?: number | null;
          googlePlaceId?: string | null;
        };
        couponWon?: { id: number; title: string; code: string; terms?: string | null } | null;
      }> = [];
      
      const couponsWon: Array<{ couponId: number; placeId: number; placeName: string; title: string; code: string; terms?: string | null }> = [];
      const usedPlaceIds = new Set<number>();

      for (const timeSlot of timeSlotOrder) {
        const quota = timeSlotQuotas[timeSlot] || 0;
        if (quota === 0) continue;

        const isFood = ['breakfast', 'lunch', 'dinner'].includes(timeSlot);
        
        let candidatePlaces = allPlaces.filter(p => {
          if (usedPlaceIds.has(p.id)) return false;
          const slots = categoryToTimeSlot[p.category] || ['afternoon'];
          if (isFood) {
            return p.category === 'food' && slots.includes(timeSlot);
          }
          return p.category !== 'food' && slots.includes(timeSlot);
        });

        for (let i = candidatePlaces.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidatePlaces[i], candidatePlaces[j]] = [candidatePlaces[j], candidatePlaces[i]];
        }

        const selected = candidatePlaces.slice(0, quota);
        
        for (const place of selected) {
          usedPlaceIds.add(place.id);
          
          let couponWon = null;
          const claimInfo = await storage.getClaimByOfficialPlaceId(place.id);
          
          if (claimInfo) {
            const dropRate = claimInfo.claim.couponDropRate ?? 0.1;
            if (Math.random() < dropRate && claimInfo.coupons.length > 0) {
              const randomIdx = Math.floor(Math.random() * claimInfo.coupons.length);
              const wonCoupon = claimInfo.coupons[randomIdx];
              couponWon = { id: wonCoupon.id, title: wonCoupon.title, code: wonCoupon.code, terms: wonCoupon.terms };
              couponsWon.push({ couponId: wonCoupon.id, placeId: place.id, placeName: place.placeName, title: wonCoupon.title, code: wonCoupon.code, terms: wonCoupon.terms });
              await storage.saveToCollectionWithCoupon(userId, place, wonCoupon);
            } else {
              await storage.saveToCollectionWithCoupon(userId, place);
            }
          } else {
            await storage.saveToCollectionWithCoupon(userId, place);
          }

          itinerary.push({
            timeSlot,
            place: {
              id: place.id,
              placeName: place.placeName,
              category: place.category,
              subcategory: place.subcategory,
              description: place.description,
              address: place.address,
              rating: place.rating,
              locationLat: place.locationLat,
              locationLng: place.locationLng,
              googlePlaceId: place.googlePlaceId,
            },
            couponWon,
          });
        }
      }

      res.json({
        success: true,
        itinerary,
        couponsWon,
        meta: {
          city,
          district,
          pace,
          totalPlaces: itinerary.length,
          totalCouponsWon: couponsWon.length,
        }
      });
    } catch (error) {
      console.error("[Gacha V3] Error:", error);
      
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        return res.status(400).json({ 
          success: false,
          error: firstError?.message || "請求參數格式錯誤",
          code: "INVALID_PARAMS",
          details: error.errors
        });
      }
      
      res.status(500).json({ 
        success: false,
        error: "扭蛋系統暫時無法使用，請稍後再試",
        code: "INTERNAL_ERROR"
      });
    }
  });

  // ============ Merchant Registration ============
  app.post("/api/merchant/register", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if merchant already exists
      let merchant = await storage.getMerchantByUserId(userId);
      if (merchant) {
        return res.json({ success: true, merchant, isNew: false });
      }

      // Get user info
      const user = await storage.getUser(userId);
      const name = req.body.name || user?.firstName || 'Merchant';
      const email = req.body.email || user?.email || '';

      // Create new merchant
      merchant = await storage.createMerchant({
        userId,
        name,
        email,
        subscriptionPlan: 'free'
      });

      res.json({ success: true, merchant, isNew: true });
    } catch (error) {
      console.error("Merchant registration error:", error);
      res.status(500).json({ error: "Failed to register merchant" });
    }
  });

  app.get("/api/merchant/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.json({ merchant: null });
      }

      res.json({ merchant });
    } catch (error) {
      console.error("Get merchant error:", error);
      res.status(500).json({ error: "Failed to get merchant info" });
    }
  });

  // ============ Merchant Daily Seed Code ============
  // Get daily seed code
  app.get("/api/merchant/daily-code", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const codeData = await storage.getMerchantDailySeedCode(merchant.id);
      
      // Check if code needs to be regenerated (new day)
      const today = new Date().toDateString();
      const codeDate = codeData?.updatedAt ? new Date(codeData.updatedAt).toDateString() : null;
      
      if (!codeData || codeDate !== today) {
        // Generate new daily code
        const newCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        await storage.updateMerchantDailySeedCode(merchant.id, newCode);
        return res.json({ code: newCode, generatedAt: new Date() });
      }

      res.json({ code: codeData.seedCode, generatedAt: codeData.updatedAt });
    } catch (error) {
      console.error("Get daily code error:", error);
      res.status(500).json({ error: "Failed to get daily code" });
    }
  });

  // Verify daily code (for check-in verification)
  app.post("/api/merchant/verify-code", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { merchantId, code } = req.body;
      if (!merchantId || !code) {
        return res.status(400).json({ error: "merchantId and code are required" });
      }

      const codeData = await storage.getMerchantDailySeedCode(merchantId);
      if (!codeData) {
        return res.status(404).json({ error: "No code found for this merchant" });
      }

      // Check if code is from today
      const today = new Date().toDateString();
      const codeDate = new Date(codeData.updatedAt).toDateString();
      if (codeDate !== today) {
        return res.status(400).json({ error: "Code has expired", isValid: false });
      }

      const isValid = codeData.seedCode === code.toUpperCase();
      res.json({ isValid, merchantId });
    } catch (error) {
      console.error("Verify code error:", error);
      res.status(500).json({ error: "Failed to verify code" });
    }
  });

  // ============ Merchant Credits ============
  // Get merchant credit balance
  app.get("/api/merchant/credits", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      res.json({ 
        creditBalance: merchant.creditBalance || 0,
        subscriptionPlan: merchant.subscriptionPlan 
      });
    } catch (error) {
      console.error("Get credits error:", error);
      res.status(500).json({ error: "Failed to get credits" });
    }
  });

  // Purchase credits - supports both Stripe and Recur payment providers
  app.post("/api/merchant/credits/purchase", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const { amount, provider } = req.body;
      if (!amount || amount < 100) {
        return res.status(400).json({ error: "Minimum purchase amount is 100 credits" });
      }

      const paymentProvider = provider === 'recur' ? 'recur' : 'stripe';

      // Create pending transaction
      const transaction = await storage.createTransaction({
        merchantId: merchant.id,
        amount,
        paymentStatus: 'pending',
        paymentMethod: paymentProvider,
      });

      // Generate checkout URL based on provider
      let checkoutUrl: string | null = null;
      
      if (paymentProvider === 'stripe') {
        try {
          const stripeClient = await getUncachableStripeClient();
          const session = await stripeClient.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
              price_data: {
                currency: 'twd',
                product_data: {
                  name: `${amount} 平台點數`,
                  description: `購買 ${amount} 點平台點數`,
                },
                unit_amount: amount * 100,
              },
              quantity: 1,
            }],
            metadata: {
              transactionId: transaction.id.toString(),
              merchantId: merchant.id.toString(),
              amount: amount.toString(),
              type: 'credits_purchase',
            },
            success_url: `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://gacha-travel--s8869420.replit.app'}/merchant/credits?success=true`,
            cancel_url: `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://gacha-travel--s8869420.replit.app'}/merchant/credits?canceled=true`,
          });
          checkoutUrl = session.url;
        } catch (stripeError) {
          console.error("Stripe checkout error:", stripeError);
          return res.status(500).json({ error: "Failed to create Stripe checkout session" });
        }
      } else if (paymentProvider === 'recur') {
        // Recur (PAYUNi) checkout - generate payment URL
        // Note: This requires PAYUNi API integration
        const recurSecretKey = process.env.RECUR_SECRET_KEY;
        if (!recurSecretKey) {
          return res.status(500).json({ error: "Recur payment not configured" });
        }
        // For now, return pending status - actual Recur integration would generate a payment URL
        checkoutUrl = null; // TODO: Implement PAYUNi/Recur checkout URL generation
      }

      res.json({ 
        transactionId: transaction.id,
        amount,
        provider: paymentProvider,
        checkoutUrl,
        status: 'pending',
        message: checkoutUrl ? '請前往付款頁面完成付款' : '請完成付款以獲得點數'
      });
    } catch (error) {
      console.error("Purchase credits error:", error);
      res.status(500).json({ error: "Failed to create purchase request" });
    }
  });

  // Get merchant transaction history
  app.get("/api/merchant/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const transactions = await storage.getTransactionsByMerchantId(merchant.id);
      res.json({ transactions });
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({ error: "Failed to get transactions" });
    }
  });

  // ============ Specialist Routes ============
  // Register as specialist
  app.post("/api/specialist/register", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if already a specialist
      const existing = await storage.getSpecialistByUserId(userId);
      if (existing) {
        return res.status(400).json({ error: "Already registered as specialist" });
      }

      const { name, serviceRegion } = req.body;
      if (!name || !serviceRegion) {
        return res.status(400).json({ error: "name and serviceRegion are required" });
      }

      const specialist = await storage.createSpecialist({
        userId,
        name,
        serviceRegion,
        isAvailable: false, // Start as unavailable until admin approves
        maxTravelers: 5,
        currentTravelers: 0,
      });

      res.status(201).json({ specialist });
    } catch (error) {
      console.error("Specialist registration error:", error);
      res.status(500).json({ error: "Failed to register as specialist" });
    }
  });

  // Get current specialist profile
  app.get("/api/specialist/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const specialist = await storage.getSpecialistByUserId(userId);
      res.json({ specialist: specialist || null });
    } catch (error) {
      console.error("Get specialist error:", error);
      res.status(500).json({ error: "Failed to get specialist profile" });
    }
  });

  // Toggle online status
  app.post("/api/specialist/toggle-online", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const specialist = await storage.getSpecialistByUserId(userId);
      if (!specialist) {
        return res.status(403).json({ error: "Specialist registration required" });
      }

      if (!specialist.isAvailable) {
        // Toggle to available
        const updated = await storage.updateSpecialist(specialist.id, {
          isAvailable: true,
        });
        return res.json({ isAvailable: updated?.isAvailable });
      } else {
        // Toggle to unavailable
        const updated = await storage.updateSpecialist(specialist.id, {
          isAvailable: false,
        });
        return res.json({ isAvailable: updated?.isAvailable });
      }
    } catch (error) {
      console.error("Toggle online error:", error);
      res.status(500).json({ error: "Failed to toggle online status" });
    }
  });

  // Get active service relations for specialist
  app.get("/api/specialist/services", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const specialist = await storage.getSpecialistByUserId(userId);
      if (!specialist) {
        return res.status(403).json({ error: "Specialist registration required" });
      }

      const relations = await storage.getActiveServiceRelationsBySpecialist(specialist.id);
      res.json({ services: relations });
    } catch (error) {
      console.error("Get services error:", error);
      res.status(500).json({ error: "Failed to get services" });
    }
  });

  // ============ Traveler Service Routes ============
  // Request a specialist (auto-match by region)
  app.post("/api/service/request", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { region } = req.body;
      if (!region) {
        return res.status(400).json({ error: "region is required" });
      }

      // Check if already has active service
      const existing = await storage.getActiveServiceRelationByTraveler(userId);
      if (existing) {
        return res.status(400).json({ error: "Already have an active service session" });
      }

      // Find available specialist in region
      const specialist = await storage.findAvailableSpecialist(region);
      if (!specialist) {
        return res.status(404).json({ error: "No available specialists in your region" });
      }

      // Create service relation
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
      res.status(500).json({ error: "Failed to request specialist" });
    }
  });

  // Get current service for traveler
  app.get("/api/service/current", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
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
      res.status(500).json({ error: "Failed to get current service" });
    }
  });

  // End service and rate specialist
  app.post("/api/service/:id/end", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const serviceId = parseInt(req.params.id);
      const { rating } = req.body;

      const relation = await storage.getServiceRelationById(serviceId);
      if (!relation) {
        return res.status(404).json({ error: "Service not found" });
      }

      if (relation.travelerId !== userId) {
        return res.status(403).json({ error: "Not authorized to end this service" });
      }

      const updated = await storage.endServiceRelation(serviceId, rating);

      res.json({ success: true, service: updated });
    } catch (error) {
      console.error("End service error:", error);
      res.status(500).json({ error: "Failed to end service" });
    }
  });

  // ============ Merchant Place Claim Routes ============
  app.get("/api/merchant/places/search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { query, district, city } = req.query;
      if (!query || query.length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters" });
      }

      const places = await storage.searchPlacesForClaim(query, district, city);
      res.json({ places });
    } catch (error) {
      console.error("Place search error:", error);
      res.status(500).json({ error: "Failed to search places" });
    }
  });

  app.post("/api/merchant/places/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "You must be a registered merchant to claim places" });
      }

      const { placeName, district, city, country, placeCacheId, googlePlaceId } = req.body;
      if (!placeName || !district || !city || !country) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if place is already claimed - prefer Google Place ID check
      let existingLink = null;
      if (googlePlaceId) {
        existingLink = await storage.getPlaceLinkByGooglePlaceId(googlePlaceId);
      }
      if (!existingLink) {
        existingLink = await storage.getPlaceLinkByPlace(placeName, district, city);
      }
      
      if (existingLink) {
        return res.status(409).json({ error: "This place is already claimed by another merchant" });
      }

      const link = await storage.createMerchantPlaceLink({
        merchantId: merchant.id,
        placeCacheId: placeCacheId || null,
        googlePlaceId: googlePlaceId || null,
        placeName,
        district,
        city,
        country,
        status: 'approved'
      });

      res.json({ success: true, link });
    } catch (error) {
      console.error("Place claim error:", error);
      res.status(500).json({ error: "Failed to claim place" });
    }
  });

  app.get("/api/merchant/places", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant account required" });
      }

      const links = await storage.getMerchantPlaceLinks(merchant.id);
      res.json({ places: links });
    } catch (error) {
      console.error("Get merchant places error:", error);
      res.status(500).json({ error: "Failed to get merchant places" });
    }
  });

  app.put("/api/merchant/places/:linkId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant account required" });
      }

      const linkId = parseInt(req.params.linkId);
      const { promoTitle, promoDescription, promoImageUrl, isPromoActive } = req.body;

      const updated = await storage.updateMerchantPlaceLink(linkId, {
        promoTitle,
        promoDescription,
        promoImageUrl,
        isPromoActive
      });

      res.json({ success: true, link: updated });
    } catch (error) {
      console.error("Update merchant place error:", error);
      res.status(500).json({ error: "Failed to update place" });
    }
  });

  // ============ Merchant Products Routes ============
  app.get("/api/merchant/products", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant account required" });
      }

      const products = await storage.getMerchantProducts(merchant.id);
      res.json({ products });
    } catch (error) {
      console.error("Get merchant products error:", error);
      res.status(500).json({ error: "Failed to get products" });
    }
  });

  app.post("/api/merchant/products", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant account required" });
      }

      const { name, description, price, category, imageUrl, stock } = req.body;
      if (!name || price === undefined) {
        return res.status(400).json({ error: "Name and price are required" });
      }

      const product = await storage.createProduct({
        merchantId: merchant.id,
        name,
        description: description || null,
        price: parseInt(price),
        currency: 'TWD',
        category: category || null,
        imageUrl: imageUrl || null,
        isActive: true,
        stock: stock ? parseInt(stock) : null
      });

      res.json({ success: true, product });
    } catch (error) {
      console.error("Create product error:", error);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.put("/api/merchant/products/:productId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant account required" });
      }

      const productId = parseInt(req.params.productId);
      const existing = await storage.getProductById(productId);
      if (!existing || existing.merchantId !== merchant.id) {
        return res.status(404).json({ error: "Product not found" });
      }

      const { name, description, price, category, imageUrl, isActive, stock } = req.body;
      const updated = await storage.updateProduct(productId, {
        name,
        description,
        price: price !== undefined ? parseInt(price) : undefined,
        category,
        imageUrl,
        isActive,
        stock: stock !== undefined ? parseInt(stock) : undefined
      });

      res.json({ success: true, product: updated });
    } catch (error) {
      console.error("Update product error:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/merchant/products/:productId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant account required" });
      }

      const productId = parseInt(req.params.productId);
      const existing = await storage.getProductById(productId);
      if (!existing || existing.merchantId !== merchant.id) {
        return res.status(404).json({ error: "Product not found" });
      }

      await storage.deleteProduct(productId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete product error:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // ============ Twilio Chat Routes ============
  // GET /api/chat/token - Get Twilio Conversations token for chat
  app.get("/api/chat/token", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const apiKeySid = process.env.TWILIO_API_KEY_SID;
      const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
      const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

      if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
        console.error("Missing Twilio credentials");
        return res.status(500).json({ error: "Chat service not configured" });
      }

      const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
        identity: userId,
        ttl: 3600
      });

      const chatGrant = new ChatGrant({
        serviceSid: conversationsServiceSid
      });
      token.addGrant(chatGrant);

      res.json({ 
        token: token.toJwt(),
        identity: userId
      });
    } catch (error) {
      console.error("Twilio token error:", error);
      res.status(500).json({ error: "Failed to generate chat token" });
    }
  });

  app.post("/api/chat/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { friendlyName, uniqueName } = req.body;
      
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const apiKeySid = process.env.TWILIO_API_KEY_SID;
      const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
      const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

      if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
        return res.status(500).json({ error: "Chat service not configured" });
      }

      const client = twilio(apiKeySid, apiKeySecret, { accountSid });

      const conversation = await client.conversations.v1
        .services(conversationsServiceSid)
        .conversations
        .create({
          friendlyName: friendlyName || `Trip Chat ${Date.now()}`,
          uniqueName: uniqueName || `trip_${Date.now()}_${userId.slice(0, 8)}`
        });

      // Add the creator as a participant
      await client.conversations.v1
        .services(conversationsServiceSid)
        .conversations(conversation.sid)
        .participants
        .create({ identity: userId });

      res.json({ 
        conversationSid: conversation.sid,
        friendlyName: conversation.friendlyName
      });
    } catch (error: any) {
      console.error("Create conversation error:", error);
      if (error.code === 50433) {
        return res.status(409).json({ error: "Conversation already exists" });
      }
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.get("/api/chat/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const apiKeySid = process.env.TWILIO_API_KEY_SID;
      const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
      const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

      if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
        return res.status(500).json({ error: "Chat service not configured" });
      }

      const client = twilio(apiKeySid, apiKeySecret, { accountSid });

      // Get all participant records for this user
      const participants = await client.conversations.v1
        .services(conversationsServiceSid)
        .participantConversations
        .list({ identity: userId, limit: 50 });

      const conversations = participants.map((p: any) => ({
        conversationSid: p.conversationSid,
        friendlyName: p.conversationFriendlyName,
        state: p.conversationState,
        unreadMessagesCount: p.unreadMessagesCount || 0
      }));

      res.json({ conversations });
    } catch (error) {
      console.error("List conversations error:", error);
      res.status(500).json({ error: "Failed to list conversations" });
    }
  });

  app.post("/api/chat/conversations/:conversationSid/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { conversationSid } = req.params;
      
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const apiKeySid = process.env.TWILIO_API_KEY_SID;
      const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
      const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

      if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
        return res.status(500).json({ error: "Chat service not configured" });
      }

      const client = twilio(apiKeySid, apiKeySecret, { accountSid });

      await client.conversations.v1
        .services(conversationsServiceSid)
        .conversations(conversationSid)
        .participants
        .create({ identity: userId });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Join conversation error:", error);
      if (error.code === 50433) {
        return res.json({ success: true, message: "Already a participant" });
      }
      res.status(500).json({ error: "Failed to join conversation" });
    }
  });

  // Delete a conversation
  app.delete("/api/chat/conversations/:conversationSid", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { conversationSid } = req.params;
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const apiKeySid = process.env.TWILIO_API_KEY_SID;
      const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
      const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

      if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
        return res.status(500).json({ error: "Chat service not configured" });
      }

      const client = twilio(apiKeySid, apiKeySecret, { accountSid });

      await client.conversations.v1
        .services(conversationsServiceSid)
        .conversations(conversationSid)
        .remove();

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete conversation error:", error);
      res.status(500).json({ error: error.message || "Failed to delete conversation" });
    }
  });

  // Start a call in conversation
  app.post("/api/chat/conversations/:conversationSid/call", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { conversationSid } = req.params;
      
      // For now, we'll generate a simple call URL using Jitsi Meet (free, no API key needed)
      const roomName = `mibu-${conversationSid.replace(/[^a-zA-Z0-9]/g, '')}`;
      const callUrl = `https://meet.jit.si/${roomName}`;

      res.json({ 
        success: true,
        callUrl,
        roomName
      });
    } catch (error: any) {
      console.error("Start call error:", error);
      res.status(500).json({ error: error.message || "Failed to start call" });
    }
  });

  // ============ Twilio Unified Token (Chat + Voice) ============
  app.get("/api/token", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const apiKeySid = process.env.TWILIO_API_KEY_SID;
      const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
      const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;
      const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

      if (!accountSid || !apiKeySid || !apiKeySecret) {
        console.error("Missing Twilio credentials");
        return res.status(500).json({ error: "Twilio not configured" });
      }

      const identity = userId;

      const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
        identity: identity,
        ttl: 3600
      });

      if (conversationsServiceSid) {
        const chatGrant = new ChatGrant({
          serviceSid: conversationsServiceSid
        });
        token.addGrant(chatGrant);
      }

      if (twimlAppSid) {
        const voiceGrant = new VoiceGrant({
          outgoingApplicationSid: twimlAppSid,
          incomingAllow: true
        });
        token.addGrant(voiceGrant);
      }

      res.json({ 
        token: token.toJwt(),
        identity: identity
      });
    } catch (error) {
      console.error("Twilio unified token error:", error);
      res.status(500).json({ error: "Failed to generate token" });
    }
  });

  // ============ Twilio Voice Webhook ============
  app.post("/api/voice/connect", (req, res) => {
    const { To } = req.body;
    const voiceResponse = new twilio.twiml.VoiceResponse();

    if (To) {
      const callerId = process.env.TWILIO_CALLER_ID;
      const dial = voiceResponse.dial({ callerId: callerId || undefined });
      dial.client(To);
    } else {
      voiceResponse.say("Invalid connection target.");
    }

    res.type('text/xml');
    res.send(voiceResponse.toString());
  });

  // Generate invite link for a conversation
  app.post("/api/chat/conversations/:conversationSid/invite-link", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { conversationSid } = req.params;
      
      // Generate unique invite code
      const inviteCode = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Store invite in database
      await storage.createChatInvite({
        conversationSid,
        inviterUserId: userId,
        status: 'pending',
        expiresAt,
      }, inviteCode);

      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co`
        : 'http://localhost:5000';
      
      const inviteLink = `${baseUrl}/chat/join/${inviteCode}`;

      res.json({ 
        inviteLink,
        inviteCode,
        expiresAt: expiresAt.toISOString()
      });
    } catch (error) {
      console.error("Generate invite link error:", error);
      res.status(500).json({ error: "Failed to generate invite link" });
    }
  });

  // Accept chat invite
  app.post("/api/chat/invites/:inviteCode/accept", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { inviteCode } = req.params;
      
      // Get invite from database
      const invite = await storage.getChatInviteByCode(inviteCode);
      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }

      if (invite.status !== 'pending') {
        return res.status(400).json({ error: "Invite already used or expired" });
      }

      if (new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Invite has expired" });
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const apiKeySid = process.env.TWILIO_API_KEY_SID;
      const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
      const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

      if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
        return res.status(500).json({ error: "Chat service not configured" });
      }

      const client = twilio(apiKeySid, apiKeySecret, { accountSid });

      // Add user to conversation
      try {
        await client.conversations.v1
          .services(conversationsServiceSid)
          .conversations(invite.conversationSid)
          .participants
          .create({ identity: userId });
      } catch (err: any) {
        if (err.code !== 50433) { // Not already a participant
          throw err;
        }
      }

      // Mark invite as used
      await storage.updateChatInvite(invite.id, {
        status: 'accepted',
        usedByUserId: userId,
      });

      res.json({ 
        success: true,
        conversationSid: invite.conversationSid
      });
    } catch (error) {
      console.error("Accept invite error:", error);
      res.status(500).json({ error: "Failed to accept invite" });
    }
  });

  // ============ Klook Detection Routes ============
  
  // Detect Klook products in a message
  app.post("/api/klook/detect", isAuthenticated, async (req: any, res) => {
    try {
      const { messageText, conversationSid, messageSid } = req.body;
      
      if (!messageText || !conversationSid || !messageSid) {
        return res.status(400).json({ 
          error: "Missing required fields: messageText, conversationSid, messageSid" 
        });
      }

      const { detectKlookProducts } = await import("./klookService");
      const result = await detectKlookProducts(messageText, conversationSid, messageSid);
      
      res.json({ 
        success: true,
        products: result.products
      });
    } catch (error) {
      console.error("Klook detection error:", error);
      res.status(500).json({ error: "Failed to detect products" });
    }
  });

  // Get highlights for a specific message
  app.get("/api/klook/highlights/:conversationSid/:messageSid", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationSid, messageSid } = req.params;
      
      const { getMessageHighlights } = await import("./klookService");
      const highlights = await getMessageHighlights(conversationSid, messageSid);
      
      res.json({ highlights });
    } catch (error) {
      console.error("Get highlights error:", error);
      res.status(500).json({ error: "Failed to get highlights" });
    }
  });

  // Get all highlights for a conversation
  app.get("/api/klook/highlights/:conversationSid", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationSid } = req.params;
      
      const { getConversationHighlights } = await import("./klookService");
      const highlights = await getConversationHighlights(conversationSid);
      
      res.json({ highlights });
    } catch (error) {
      console.error("Get conversation highlights error:", error);
      res.status(500).json({ error: "Failed to get highlights" });
    }
  });

  // ============ Place Feedback Routes ============
  app.post("/api/feedback/exclude", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { placeName, district, city, placeCacheId } = req.body;
      
      if (!placeName || !district || !city) {
        return res.status(400).json({ 
          error: "Missing required fields: placeName, district, city" 
        });
      }

      const feedback = await storage.incrementPlacePenalty(
        userId,
        placeName,
        district,
        city,
        placeCacheId || undefined
      );

      res.json({
        success: true,
        message: `Place "${placeName}" has been excluded`,
        feedback: {
          id: feedback.id,
          placeName: feedback.placeName,
          penaltyScore: feedback.penaltyScore
        }
      });
    } catch (error) {
      console.error("Feedback exclusion error:", error);
      res.status(500).json({ error: "Failed to exclude place" });
    }
  });

  // ============ Commerce Routes (In-Chat Shopping) ============
  
  // Get all place names that have products (for chat message parsing)
  app.get("/api/commerce/places/names", async (req, res) => {
    try {
      const names = await storage.getPlaceNamesWithProducts();
      res.json({ names });
    } catch (error) {
      console.error("Get place names error:", error);
      res.status(500).json({ error: "Failed to get place names" });
    }
  });

  // Search places by name (for commerce matching)
  app.get("/api/commerce/places/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json([]);
      }
      const places = await storage.searchPlacesByName(query);
      res.json(places);
    } catch (error) {
      console.error("Place search error:", error);
      res.status(500).json({ error: "Failed to search places" });
    }
  });

  // Get products by place ID
  app.get("/api/commerce/products/place/:placeId", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const products = await storage.getProductsByPlaceId(placeId);
      res.json(products);
    } catch (error) {
      console.error("Get products error:", error);
      res.status(500).json({ error: "Failed to get products" });
    }
  });

  // Get products by place name (for chat matching)
  app.get("/api/commerce/products/by-name", async (req, res) => {
    try {
      const placeName = req.query.name as string;
      if (!placeName) {
        return res.json({ products: [] });
      }
      const products = await storage.getProductsByPlaceName(placeName);
      res.json({ products });
    } catch (error) {
      console.error("Get products by name error:", error);
      res.status(500).json({ error: "Failed to get products" });
    }
  });

  // Get cart items
  app.get("/api/commerce/cart", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const items = await storage.getCartItems(userId);
      res.json({ items });
    } catch (error) {
      console.error("Get cart error:", error);
      res.status(500).json({ error: "Failed to get cart" });
    }
  });

  // Add to cart
  app.post("/api/commerce/cart", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const parsed = insertCartItemSchema.safeParse({ ...req.body, userId });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid cart item data" });
      }
      const cartItem = await storage.addToCart(parsed.data);
      const product = await storage.getProductById(cartItem.productId);
      res.json({ item: { ...cartItem, product } });
    } catch (error) {
      console.error("Add to cart error:", error);
      res.status(500).json({ error: "Failed to add to cart" });
    }
  });

  // Update cart item quantity
  app.patch("/api/commerce/cart/:itemId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const itemId = parseInt(req.params.itemId);
      const { quantity } = req.body;
      if (typeof quantity !== 'number' || quantity < 1) {
        return res.status(400).json({ error: "Invalid quantity" });
      }
      const item = await storage.updateCartItemQuantity(itemId, quantity);
      res.json(item);
    } catch (error) {
      console.error("Update cart item error:", error);
      res.status(500).json({ error: "Failed to update cart item" });
    }
  });

  // Remove from cart
  app.delete("/api/commerce/cart/:itemId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const itemId = parseInt(req.params.itemId);
      await storage.removeFromCart(itemId);
      res.json({ success: true });
    } catch (error) {
      console.error("Remove from cart error:", error);
      res.status(500).json({ error: "Failed to remove from cart" });
    }
  });

  // Clear cart
  app.delete("/api/commerce/cart", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      await storage.clearCart(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Clear cart error:", error);
      res.status(500).json({ error: "Failed to clear cart" });
    }
  });

  // Checkout - Create Stripe session
  app.post("/api/commerce/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const cartItems = await storage.getCartItems(userId);
      if (cartItems.length === 0) {
        return res.status(400).json({ error: "Cart is empty" });
      }

      const stripe = (await import('stripe')).default;
      const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!);

      const lineItems = cartItems.map(item => ({
        price_data: {
          currency: item.product.currency.toLowerCase(),
          product_data: {
            name: item.product.name,
            description: item.product.description || undefined,
          },
          unit_amount: item.product.price,
        },
        quantity: item.quantity,
      }));

      const totalAmount = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

      // Create order first
      const order = await storage.createOrder({
        userId,
        status: 'pending',
        totalAmount,
        currency: 'TWD',
        items: cartItems.map(item => ({
          productId: item.productId,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
        })),
      });

      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${req.headers.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/checkout/cancel`,
        metadata: {
          orderId: order.id.toString(),
          userId,
        },
      });

      // Update order with session ID
      await storage.updateOrderStatus(order.id, 'pending', session.id);

      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // Get user orders
  app.get("/api/commerce/orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const orders = await storage.getUserOrders(userId);
      res.json(orders);
    } catch (error) {
      console.error("Get orders error:", error);
      res.status(500).json({ error: "Failed to get orders" });
    }
  });

  // ============ Place Application Routes (商家地點申請) ============

  // 商家建立草稿地點
  app.post("/api/merchant/place-drafts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) return res.status(403).json({ error: "Merchant account required" });

      const validated = insertPlaceDraftSchema.parse({ ...req.body, merchantId: merchant.id });
      const draft = await storage.createPlaceDraft(validated);
      
      // 自動建立申請紀錄
      const application = await storage.createPlaceApplication({
        merchantId: merchant.id,
        placeDraftId: draft.id,
      });

      res.json({ draft, application });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Create place draft error:", error);
      res.status(500).json({ error: "Failed to create place draft" });
    }
  });

  // 取得商家的草稿地點
  app.get("/api/merchant/place-drafts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) return res.status(403).json({ error: "Merchant account required" });

      const drafts = await storage.getPlaceDraftsByMerchant(merchant.id);
      res.json({ drafts });
    } catch (error) {
      console.error("Get place drafts error:", error);
      res.status(500).json({ error: "Failed to get place drafts" });
    }
  });

  // 取得商家的申請紀錄
  app.get("/api/merchant/applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) return res.status(403).json({ error: "Merchant account required" });

      const applications = await storage.getPlaceApplicationsByMerchant(merchant.id);
      res.json({ applications });
    } catch (error) {
      console.error("Get applications error:", error);
      res.status(500).json({ error: "Failed to get applications" });
    }
  });

  // 管理員：取得待審核申請（包含草稿和商家詳情）
  app.get("/api/admin/applications/pending", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const applications = await storage.getPendingApplicationsWithDetails();
      res.json({ applications });
    } catch (error) {
      console.error("Get pending applications error:", error);
      res.status(500).json({ error: "Failed to get pending applications" });
    }
  });

  // 管理員：審核申請（通過/退回）
  app.patch("/api/admin/applications/:id/review", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const applicationId = parseInt(req.params.id);
      const { status, reviewNotes } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }

      const application = await storage.getPlaceApplicationById(applicationId);
      if (!application) return res.status(404).json({ error: "Application not found" });

      // 更新申請狀態
      const updated = await storage.updatePlaceApplication(applicationId, {
        status,
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes,
      });

      // 同時更新草稿狀態
      await storage.updatePlaceDraft(application.placeDraftId, { status });

      // 如果通過，將地點發布到 place_cache
      if (status === 'approved') {
        const draft = await storage.getPlaceDraftById(application.placeDraftId);
        if (draft) {
          const districtInfo = await storage.getDistrictWithParents(draft.districtId);
          if (districtInfo) {
            const categories = await storage.getCategories();
            const category = categories.find(c => c.id === draft.categoryId);
            const subcategories = await storage.getSubcategoriesByCategory(draft.categoryId);
            const subcategory = subcategories.find(s => s.id === draft.subcategoryId);

            const newPlace = await storage.savePlaceToCache({
              placeName: draft.placeName,
              description: draft.description || '',
              category: category?.nameZh || '',
              subCategory: subcategory?.nameZh || '',
              district: districtInfo.district.nameZh,
              city: districtInfo.region.nameZh,
              country: districtInfo.country.nameZh,
              placeId: draft.googlePlaceId || undefined,
              locationLat: draft.locationLat || undefined,
              locationLng: draft.locationLng || undefined,
              verifiedAddress: draft.address || undefined,
            });

            // 更新申請紀錄的 placeCacheId
            await storage.updatePlaceApplication(applicationId, { placeCacheId: newPlace.id });

            // 自動建立商家認領連結
            await storage.createMerchantPlaceLink({
              merchantId: application.merchantId,
              placeCacheId: newPlace.id,
              googlePlaceId: draft.googlePlaceId || undefined,
              placeName: draft.placeName,
              district: districtInfo.district.nameZh,
              city: districtInfo.region.nameZh,
              country: districtInfo.country.nameZh,
              status: 'approved',
            });
          }
        }
      }

      res.json({ application: updated });
    } catch (error) {
      console.error("Review application error:", error);
      res.status(500).json({ error: "Failed to review application" });
    }
  });

  // ============ Admin Place Draft Routes (管理員地點草稿) ============

  // 管理員：建立草稿地點（無需商家帳號）
  app.post("/api/admin/place-drafts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const validated = insertPlaceDraftSchema.parse({ ...req.body, source: 'ai' });
      const draft = await storage.createPlaceDraft(validated);

      res.json({ draft });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Admin create place draft error:", error);
      res.status(500).json({ error: "Failed to create place draft" });
    }
  });

  // 管理員：取得所有草稿地點
  app.get("/api/admin/place-drafts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const drafts = await storage.getAllPlaceDrafts();
      res.json({ drafts });
    } catch (error) {
      console.error("Admin get place drafts error:", error);
      res.status(500).json({ error: "Failed to get place drafts" });
    }
  });

  // 管理員：直接發布草稿到行程卡池（跳過申請流程）
  app.post("/api/admin/place-drafts/:id/publish", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const draftId = parseInt(req.params.id);
      const draft = await storage.getPlaceDraftById(draftId);
      if (!draft) return res.status(404).json({ error: "Draft not found" });

      const districtInfo = await storage.getDistrictWithParents(draft.districtId);
      if (!districtInfo) return res.status(400).json({ error: "Invalid district" });

      const categories = await storage.getCategories();
      const category = categories.find(c => c.id === draft.categoryId);
      const subcategories = await storage.getSubcategoriesByCategory(draft.categoryId);
      const subcategory = subcategories.find(s => s.id === draft.subcategoryId);

      const newPlace = await storage.savePlaceToCache({
        placeName: draft.placeName,
        description: draft.description || '',
        category: category?.nameZh || '',
        subCategory: subcategory?.nameZh || '',
        district: districtInfo.district.nameZh,
        city: districtInfo.region.nameZh,
        country: districtInfo.country.nameZh,
        placeId: draft.googlePlaceId || undefined,
        locationLat: draft.locationLat || undefined,
        locationLng: draft.locationLng || undefined,
        verifiedAddress: draft.address || undefined,
      });

      // 發布後從 drafts 刪除（不只是標記 approved）
      await storage.deletePlaceDraft(draftId);

      res.json({ placeCache: newPlace, published: true });
    } catch (error) {
      console.error("Admin publish place draft error:", error);
      res.status(500).json({ error: "Failed to publish place draft" });
    }
  });

  // 管理員：刪除草稿地點
  app.delete("/api/admin/place-drafts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const draftId = parseInt(req.params.id);
      const draft = await storage.getPlaceDraftById(draftId);
      if (!draft) return res.status(404).json({ error: "Draft not found" });

      // 刪除前先存入 place_feedback 排除表，避免 AI 再次生成
      const districtInfo = await storage.getDistrictWithParents(draft.districtId);
      if (districtInfo) {
        await storage.createPlaceFeedback({
          userId: userId,
          placeName: draft.placeName,
          district: districtInfo.district.nameZh,
          city: districtInfo.region.nameZh,
          penaltyScore: 100, // 高分代表完全排除
        });
      }

      await storage.deletePlaceDraft(draftId);
      res.json({ success: true, message: "Draft deleted and added to exclusion list" });
    } catch (error: any) {
      console.error("Error deleting draft:", error);
      res.status(500).json({ error: "Failed to delete draft" });
    }
  });

  // 管理員：更新草稿地點（名稱、描述）
  app.patch("/api/admin/place-drafts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const draftId = parseInt(req.params.id);
      const draft = await storage.getPlaceDraftById(draftId);
      if (!draft) return res.status(404).json({ error: "Draft not found" });

      const updateSchema = z.object({
        placeName: z.string().min(1).optional(),
        description: z.string().optional(),
      });

      const validated = updateSchema.parse(req.body);
      const updated = await storage.updatePlaceDraft(draftId, validated);
      res.json({ draft: updated });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Admin update place draft error:", error);
      res.status(500).json({ error: "Failed to update place draft" });
    }
  });

  // 管理員：用 AI 重新生成草稿描述
  app.post("/api/admin/place-drafts/:id/regenerate-description", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const draftId = parseInt(req.params.id);
      const draft = await storage.getPlaceDraftById(draftId);
      if (!draft) return res.status(404).json({ error: "Draft not found" });

      const districtInfo = await storage.getDistrictWithParents(draft.districtId);
      const categories = await storage.getCategories();
      const category = categories.find(c => c.id === draft.categoryId);
      const subcategories = await storage.getSubcategoriesByCategory(draft.categoryId);
      const subcategory = subcategories.find(s => s.id === draft.subcategoryId);

      const prompt = `你是一位專業的旅遊作家。請為以下景點撰寫一段吸引觀光客的介紹文字（繁體中文，50-100字）：

景點名稱：${draft.placeName}
類別：${category?.nameZh || ''} / ${subcategory?.nameZh || ''}
地區：${districtInfo?.country?.nameZh || ''} ${districtInfo?.region?.nameZh || ''} ${districtInfo?.district?.nameZh || ''}
${draft.address ? `地址：${draft.address}` : ''}

請直接輸出介紹文字，不需要標題或其他格式。文字應該生動有趣，突出景點特色，吸引遊客前往。`;

      const newDescription = await callGemini(prompt);
      const cleanDescription = newDescription.trim();

      const updated = await storage.updatePlaceDraft(draftId, { description: cleanDescription });
      res.json({ draft: updated, description: cleanDescription });
    } catch (error) {
      console.error("Admin regenerate description error:", error);
      res.status(500).json({ error: "Failed to regenerate description" });
    }
  });

  // ============ Admin User Management Routes ============

  // 管理員：取得待審核用戶
  app.get("/api/admin/users/pending", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const pendingUsers = await storage.getPendingApprovalUsers();
      res.json({ 
        users: pendingUsers.map(u => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          provider: u.provider,
          isApproved: u.isApproved,
          createdAt: u.createdAt,
        }))
      });
    } catch (error) {
      console.error("Get pending users error:", error);
      res.status(500).json({ error: "Failed to get pending users" });
    }
  });

  // 管理員：審核用戶（通過/拒絕）
  app.patch("/api/admin/users/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      if (!adminId) return res.status(401).json({ error: "Authentication required" });

      const admin = await storage.getUser(adminId);
      if (admin?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const targetUserId = req.params.id;
      const { approved } = req.body;

      if (typeof approved !== 'boolean') {
        return res.status(400).json({ error: "approved must be a boolean" });
      }

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) return res.status(404).json({ error: "User not found" });

      const updated = await storage.updateUser(targetUserId, { isApproved: approved });
      res.json({ 
        success: true, 
        user: {
          id: updated?.id,
          email: updated?.email,
          role: updated?.role,
          isApproved: updated?.isApproved,
        }
      });
    } catch (error) {
      console.error("Approve user error:", error);
      res.status(500).json({ error: "Failed to approve user" });
    }
  });

  // 管理員：取得所有用戶
  app.get("/api/admin/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const allUsers = await storage.getAllUsers();
      res.json({ 
        users: allUsers.map(u => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          provider: u.provider,
          isApproved: u.isApproved,
          isActive: u.isActive,
          createdAt: u.createdAt,
        }))
      });
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  // ============ Admin Global Exclusions (全域排除地點) ============

  // 取得全域排除清單
  app.get("/api/admin/global-exclusions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const { district, city } = req.query;
      const exclusions = await storage.getGlobalExclusions(
        district as string | undefined,
        city as string | undefined
      );
      res.json({ exclusions });
    } catch (error) {
      console.error("Get global exclusions error:", error);
      res.status(500).json({ error: "Failed to get global exclusions" });
    }
  });

  // 新增全域排除地點
  app.post("/api/admin/global-exclusions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const schema = z.object({
        placeName: z.string().min(1),
        district: z.string().min(1),
        city: z.string().min(1),
      });

      const validated = schema.parse(req.body);
      const exclusion = await storage.addGlobalExclusion(validated);
      res.json({ success: true, exclusion });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Add global exclusion error:", error);
      res.status(500).json({ error: "Failed to add global exclusion" });
    }
  });

  // 移除全域排除地點
  app.delete("/api/admin/global-exclusions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const exclusionId = parseInt(req.params.id);
      const removed = await storage.removeGlobalExclusion(exclusionId);
      
      if (!removed) {
        return res.status(404).json({ error: "Exclusion not found" });
      }
      
      res.json({ success: true, message: "Global exclusion removed" });
    } catch (error) {
      console.error("Remove global exclusion error:", error);
      res.status(500).json({ error: "Failed to remove global exclusion" });
    }
  });

  registerStripeRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}

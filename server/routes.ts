import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import * as path from "path";
import * as fs from "fs";
import { setupAuth, isAuthenticated, generateJwtToken } from "./replitAuth";
import { insertCollectionSchema, insertMerchantSchema, insertCouponSchema, insertCartItemSchema, insertPlaceDraftSchema, insertPlaceApplicationSchema, registerUserSchema, insertSpecialistSchema, insertServiceRelationSchema, insertAdPlacementSchema, insertCouponRarityConfigSchema, INVENTORY_MAX_SLOTS, type PlaceDraft, type Subcategory } from "@shared/schema";
import { ErrorCode, createErrorResponse } from "@shared/errors";
import * as crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { createTripPlannerRoutes } from "../modules/trip-planner/server/routes";
import { createPlannerServiceRoutes } from "../modules/trip-planner/server/planner-routes";
import { registerStripeRoutes } from "./stripeRoutes";
import { getUncachableStripeClient } from "./stripeClient";
import { checkGeofence } from "./lib/geofencing";
import { callGemini, batchGeneratePlaces, batchGenerateDescriptions, batchGenerateWithClassification, classifyAndDescribePlaces, reclassifyPlace, type PlaceResult, type PlaceWithClassification } from "./lib/placeGenerator";
import { determineCategory, determineSubcategory, generateFallbackDescription, classifyPlace } from "./lib/categoryMapping";
import { inferTimeSlot, sortPlacesByTimeSlot, type TimeSlot } from "./lib/timeSlotInferrer";
import twilio from "twilio";
import appleSignin from "apple-signin-auth";
import { gachaRateLimiter, apiRateLimiter, strictRateLimiter } from "./middleware/rateLimit";
import { queryLogger } from "./middleware/queryLogger";
const { AccessToken } = twilio.jwt;
const ChatGrant = AccessToken.ChatGrant;
const VoiceGrant = AccessToken.VoiceGrant;

const RECUR_API_URL = "https://api.recur.tw/v1";
const RECUR_PREMIUM_PLAN_ID = "adkwbl9dya0wc6b53parl9yk";
const UNLIMITED_GENERATION_EMAILS = ["s8869420@gmail.com"];
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ========== 扭蛋去重保護機制 ==========
// 新機制：從用戶圖鑑讀取最近 36 張，完全排除這些地點
const GACHA_DEDUP_LIMIT = 36;

// Guest 用戶的 session 級別去重快取（30 分鐘 TTL）
interface GuestSessionDedup {
  placeIds: number[];
  timestamp: number;
}
const guestSessionDedup = new Map<string, GuestSessionDedup>();

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

function getDistanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getGeoDedupeRadiusMeters(category: string): number {
  switch (category) {
    case '景點':
    case '生態文化教育':
    case '遊程體驗':
      return 200;
    case '美食':
    case '購物':
      return 50;
    case '活動':
    case '娛樂設施':
      return 100;
    case '住宿':
    default:
      return 0;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);

  // ============ Global Middleware ============
  app.use('/api', queryLogger);

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
    // 使用與 replitAuth.ts 相同的 JWT_SECRET，確保 token 可以被正確驗證
    const secret = process.env.JWT_SECRET || 'mibu_secret_key_fixed_12345';
    return jwt.sign({ sub: userId, role }, secret, { expiresIn: '30d' });
  };

  // Email/Password Registration (Traveler only)
  // For merchant/specialist registration, use /api/auth/register/merchant or /api/auth/register/specialist
  app.post('/api/auth/register', async (req, res) => {
    try {
      const travelerRegisterSchema = z.object({
        email: z.string().email('請輸入有效的電子郵件'),
        password: z.string().min(6, '密碼至少6個字'),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      });
      
      const validated = travelerRegisterSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(validated.email);
      if (existingUser) {
        return res.status(400).json(createErrorResponse(ErrorCode.EMAIL_ALREADY_EXISTS));
      }
      
      // Hash password
      const hashedPassword = hashPassword(validated.password);
      
      // Generate unique user ID
      const userId = `email_${crypto.randomBytes(16).toString('hex')}`;
      
      // Security: Always create as traveler, always auto-approved
      // Merchant/Specialist must use dedicated registration endpoints
      const user = await storage.createUser({
        id: userId,
        email: validated.email,
        password: hashedPassword,
        firstName: validated.firstName || null,
        lastName: validated.lastName || null,
        role: 'traveler', // Always traveler
        isApproved: true, // Travelers are always auto-approved
        provider: 'email',
      });
      
      // Generate JWT token
      const token = generateToken(user.id, 'traveler');
      
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
      res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '註冊失敗，請稍後再試'));
    }
  });

  // Merchant Registration (商家註冊)
  app.post('/api/auth/register/merchant', async (req, res) => {
    try {
      const merchantRegisterSchema = z.object({
        email: z.string().email('請輸入有效的電子郵件'),
        password: z.string().min(6, '密碼至少6個字'),
        businessName: z.string().min(1, '請輸入商家名稱'),
        contactName: z.string().min(1, '請輸入聯絡人名稱'),
        taxId: z.string().optional(), // 統一編號（選填）
        businessCategory: z.string().min(1, '請選擇產業類別'),
        address: z.string().min(1, '請輸入營業地址'),
        otherContact: z.string().optional(), // 其他聯絡方式
      });
      
      const validated = merchantRegisterSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(validated.email);
      if (existingUser) {
        return res.status(400).json(createErrorResponse(ErrorCode.EMAIL_ALREADY_EXISTS));
      }
      
      // Hash password
      const hashedPassword = hashPassword(validated.password);
      
      // Generate unique user ID
      const userId = `email_${crypto.randomBytes(16).toString('hex')}`;
      
      // Create user with merchant role (pending approval)
      const user = await storage.createUser({
        id: userId,
        email: validated.email,
        password: hashedPassword,
        firstName: validated.contactName,
        lastName: null,
        role: 'merchant',
        isApproved: false, // Requires admin approval
        provider: 'email',
      });
      
      // Create merchant record
      await storage.createMerchant({
        userId: user.id,
        email: validated.email,
        businessName: validated.businessName,
        ownerName: validated.contactName,
        taxId: validated.taxId || null,
        businessCategory: validated.businessCategory,
        address: validated.address,
        phone: validated.otherContact || null,
        name: validated.businessName, // For backward compatibility
        subscriptionPlan: 'free',
        creditBalance: 0,
      });
      
      console.log(`[Merchant Register] New merchant application: ${validated.email}, business: ${validated.businessName}`);
      
      res.status(201).json({
        success: true,
        message: '已收到您的申請，立馬為您處理',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          isApproved: user.isApproved,
        },
      });
    } catch (error: any) {
      console.error("Merchant registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: '輸入資料格式錯誤', details: error.errors });
      }
      res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '註冊失敗，請稍後再試'));
    }
  });

  // Specialist Registration (專員註冊)
  app.post('/api/auth/register/specialist', async (req, res) => {
    try {
      const specialistRegisterSchema = z.object({
        email: z.string().email('請輸入有效的電子郵件'),
        password: z.string().min(6, '密碼至少6個字'),
        name: z.string().min(1, '請輸入名稱'),
        otherContact: z.string().optional(), // 其他聯絡方式
        serviceRegion: z.string().optional(), // 服務地區（可後續設定）
      });
      
      const validated = specialistRegisterSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(validated.email);
      if (existingUser) {
        return res.status(400).json(createErrorResponse(ErrorCode.EMAIL_ALREADY_EXISTS));
      }
      
      // Hash password
      const hashedPassword = hashPassword(validated.password);
      
      // Generate unique user ID
      const userId = `email_${crypto.randomBytes(16).toString('hex')}`;
      
      // Create user with specialist role (pending approval)
      const user = await storage.createUser({
        id: userId,
        email: validated.email,
        password: hashedPassword,
        firstName: validated.name,
        lastName: null,
        role: 'specialist',
        isApproved: false, // Requires admin approval
        provider: 'email',
      });
      
      // Create specialist record
      await storage.createSpecialist({
        userId: user.id,
        name: validated.name,
        serviceRegion: validated.serviceRegion || 'taipei', // Default region
        isAvailable: false, // Not available until approved
        maxTravelers: 5,
        currentTravelers: 0,
      });
      
      console.log(`[Specialist Register] New specialist application: ${validated.email}, name: ${validated.name}`);
      
      res.status(201).json({
        success: true,
        message: '已收到您的申請，立馬為您處理',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          isApproved: user.isApproved,
        },
      });
    } catch (error: any) {
      console.error("Specialist registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: '輸入資料格式錯誤', details: error.errors });
      }
      res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '註冊失敗，請稍後再試'));
    }
  });

  // Super Admin Email (God Mode)
  const SUPER_ADMIN_EMAIL = 's8869420@gmail.com';
  const VALID_ROLES = ['traveler', 'merchant', 'specialist', 'admin'] as const;
  type TargetRole = typeof VALID_ROLES[number];

  // Email/Password Login with God Mode support
  app.post('/api/auth/login', async (req, res) => {
    try {
      const loginSchema = z.object({
        email: z.string().email('請輸入有效的電子郵件'),
        password: z.string().min(1, '請輸入密碼'),
        target_role: z.enum(VALID_ROLES).optional(),
      });
      
      const validated = loginSchema.parse(req.body);
      const targetRole = validated.target_role || 'traveler';
      
      // Find user by email
      const user = await storage.getUserByEmail(validated.email);
      if (!user || !user.password) {
        return res.status(401).json(createErrorResponse(ErrorCode.INVALID_CREDENTIALS));
      }
      
      // Verify password
      if (!verifyPassword(validated.password, user.password)) {
        return res.status(401).json(createErrorResponse(ErrorCode.INVALID_CREDENTIALS));
      }
      
      const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;
      
      // Super Admin (God Mode) - can login as any role
      if (isSuperAdmin) {
        console.log(`[GOD MODE] Super admin ${user.email} logging in as ${targetRole}`);
        
        // Auto-seeding for merchant/specialist if needed
        if (targetRole === 'merchant') {
          let merchant = await storage.getMerchantByUserId(user.id);
          if (!merchant) {
            merchant = await storage.createMerchant({
              userId: user.id,
              name: `${user.firstName || 'Admin'}'s Test Store`,
              email: user.email!,
              subscriptionPlan: 'premium',
              dailySeedCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
              creditBalance: 10000,
            });
            console.log(`[GOD MODE] Auto-created merchant for super admin: ${merchant.id}`);
          }
        } else if (targetRole === 'specialist') {
          let specialist = await storage.getSpecialistByUserId(user.id);
          if (!specialist) {
            specialist = await storage.createSpecialist({
              userId: user.id,
              name: `${user.firstName || 'Admin'} Specialist`,
              serviceRegion: 'taipei',
              isAvailable: true,
              maxTravelers: 10,
              currentTravelers: 0,
            });
            console.log(`[GOD MODE] Auto-created specialist for super admin: ${specialist.id}`);
          }
        }
        
        // Generate token with target role (masquerading)
        const token = generateToken(user.id, targetRole);
        
        return res.json({ 
          user: { 
            id: user.id, 
            email: user.email, 
            firstName: user.firstName, 
            lastName: user.lastName,
            role: targetRole,
            actualRole: user.role,
            isApproved: true,
            isSuperAdmin: true,
          }, 
          token 
        });
      }
      
      // Normal User (Strict Mode) - must match target role
      if (user.role !== targetRole) {
        return res.status(403).json({ 
          error: `您的帳號角色為 ${user.role}，無法從 ${targetRole} 入口登入。請使用正確的入口或註冊新帳號。`,
          code: 'ROLE_MISMATCH',
          currentRole: user.role,
          targetRole: targetRole,
        });
      }
      
      // Check approval status for non-traveler roles
      if (user.role !== 'traveler' && !user.isApproved) {
        return res.status(403).json({ 
          error: '帳號審核中，請等待管理員核准',
          code: 'PENDING_APPROVAL',
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
        return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR));
      }
      res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '登入失敗，請稍後再試'));
    }
  });

  // Apple Sign In
  app.post('/api/auth/apple', async (req, res) => {
    console.log('[Apple Auth] Request received:', JSON.stringify({
      hasIdentityToken: !!req.body?.identityToken,
      hasUser: !!req.body?.user,
      portal: req.body?.portal,
      targetPortal: req.body?.targetPortal,
      keys: Object.keys(req.body || {}),
    }));
    
    try {
      const appleAuthSchema = z.object({
        identityToken: z.string().min(1, 'Identity token is required'),
        fullName: z.object({
          givenName: z.string().nullable().optional(),
          familyName: z.string().nullable().optional(),
        }).nullable().optional(),
        email: z.string().email().nullable().optional(),
        user: z.string().min(1, 'Apple user ID is required'),
        targetPortal: z.enum(['traveler', 'merchant', 'specialist', 'admin']).nullable().optional(),
        portal: z.enum(['traveler', 'merchant', 'specialist', 'admin']).nullable().optional(),
      });
      
      const validated = appleAuthSchema.parse(req.body);
      const { identityToken, fullName, email, user: appleUserId } = validated;
      const targetPortal = validated.targetPortal || validated.portal || 'traveler';
      
      console.log(`[Apple Auth] Verifying token for Apple user: ${appleUserId}`);
      
      // Verify Apple identity token
      // Support both production Bundle ID and Expo Go testing (host.exp.Exponent)
      const validAudiences = [
        process.env.APPLE_CLIENT_ID,
        'host.exp.Exponent', // Expo Go development testing
      ].filter(Boolean) as string[];
      
      let appleTokenPayload: any;
      let verificationSucceeded = false;
      
      for (const audience of validAudiences) {
        try {
          appleTokenPayload = await appleSignin.verifyIdToken(identityToken, {
            audience: audience,
            ignoreExpiration: false,
          });
          verificationSucceeded = true;
          console.log(`[Apple Auth] Token verified with audience: ${audience}`);
          break;
        } catch (verifyError: any) {
          console.log(`[Apple Auth] Token verification failed for audience ${audience}: ${verifyError.message}`);
          continue;
        }
      }
      
      if (!verificationSucceeded) {
        console.error('[Apple Auth] Token verification failed for all audiences');
        return res.status(401).json(createErrorResponse(ErrorCode.INVALID_CREDENTIALS, 'Apple token verification failed'));
      }
      
      // Extract email from token or request body (Apple only sends email on first login)
      const userEmail = appleTokenPayload.email || email;
      const firstName = fullName?.givenName || null;
      const lastName = fullName?.familyName || null;
      
      console.log(`[Apple Auth] Verified. Email: ${userEmail}, Apple sub: ${appleTokenPayload.sub}`);
      
      // Generate unique user ID for Apple users
      const userId = `apple_${appleUserId}`;
      
      // Try to find existing user by Apple ID first
      let existingUser = await storage.getUser(userId);
      
      // If no user found by ID but we have email, check if there's an existing user with this email
      // This handles account merging (e.g., guest user → Apple login)
      if (!existingUser && userEmail) {
        const existingUserByEmail = await storage.getUserByEmail(userEmail);
        if (existingUserByEmail && existingUserByEmail.id !== userId) {
          console.log(`[Apple Auth] Found existing user with same email. Will merge: ${existingUserByEmail.id} -> ${userId}`);
          existingUser = existingUserByEmail; // Use existing user's role for validation
        }
      }
      
      // Security: Apple login only allows 'traveler' portal
      // Merchant/Specialist must use email registration
      if (targetPortal !== 'traveler') {
        return res.status(400).json({
          success: false,
          error: '商家與專員請使用 Email 註冊',
          code: 'APPLE_LOGIN_TRAVELER_ONLY',
        });
      }
      
      // For existing users, validate they're accessing the correct portal
      let userRole: string = 'traveler';
      if (existingUser) {
        userRole = existingUser.role || 'traveler';
        // Check if user is trying to access a different portal than their role
        if (userRole !== 'traveler' && existingUser.email !== SUPER_ADMIN_EMAIL) {
          return res.status(403).json({
            success: false,
            error: `您的帳號角色為 ${userRole}，請使用對應入口登入`,
            code: 'ROLE_MISMATCH',
            currentRole: userRole,
            targetPortal: targetPortal,
          });
        }
      }
      
      // upsertUser handles account merging if email matches existing user
      const user = await storage.upsertUser({
        id: userId,
        email: userEmail,
        firstName: firstName,
        lastName: lastName,
        role: userRole,
        provider: 'apple',
        isApproved: userRole === 'traveler' ? true : (existingUser?.isApproved || false),
      });
      
      console.log(`[Apple Auth] User upserted: ${user.id}, role: ${user.role}`);
      
      const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;
      
      // For non-traveler roles, check approval status (unless super admin)
      if (!isSuperAdmin && user.role !== 'traveler' && !user.isApproved) {
        return res.status(403).json({
          success: false,
          error: '帳號審核中，請等待管理員核准',
          code: 'PENDING_APPROVAL',
        });
      }
      
      // Generate JWT token
      const token = generateToken(user.id, user.role || 'traveler');
      
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email || '',
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Apple User',
          role: user.role,
          isApproved: user.isApproved,
          isSuperAdmin,
        },
      });
    } catch (error: any) {
      console.error('[Apple Auth] Error:', error);
      if (error.name === 'ZodError') {
        const zodError = error as z.ZodError;
        const issues = zodError.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        console.error(`[Apple Auth] Zod validation failed: ${issues}`);
        console.error(`[Apple Auth] Received body keys: ${Object.keys(req.body || {}).join(', ')}`);
        console.error(`[Apple Auth] Received body (masked):`, JSON.stringify({
          identityToken: req.body?.identityToken ? `[${String(req.body.identityToken).length} chars]` : undefined,
          user: req.body?.user,
          portal: req.body?.portal,
          targetPortal: req.body?.targetPortal,
          email: req.body?.email,
          fullName: req.body?.fullName,
        }));
        return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, `Invalid request data: ${issues}`));
      }
      res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, 'Apple authentication failed'));
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
      
      const accessibleRoles = isSuperAdmin 
        ? ['traveler', 'merchant', 'specialist', 'admin'] 
        : [user?.role || 'traveler'];
      
      // Get active role: Priority: JWT token > session > database role
      // For JWT auth (mobile app), read from jwtUser.activeRole
      // For session auth (web), read from session.activeRole
      const jwtActiveRole = req.jwtUser?.activeRole;
      const sessionActiveRole = req.session?.activeRole;
      const activeRole = jwtActiveRole || sessionActiveRole || user?.role || 'traveler';
      
      console.log(`[/api/auth/user] userId: ${userId}, jwtActiveRole: ${jwtActiveRole}, sessionActiveRole: ${sessionActiveRole}, finalActiveRole: ${activeRole}`);
      
      // For super admin god mode: return activeRole as the "role" field for frontend compatibility
      const responseRole = isSuperAdmin ? activeRole : (user?.role || 'traveler');
      
      res.json({
        ...user,
        isSuperAdmin,
        accessibleRoles,
        activeRole: accessibleRoles.includes(activeRole) ? activeRole : (user?.role || 'traveler'),
        role: responseRole, // Override role for super admin god mode
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Switch active role (for super admin God Mode)
  app.post('/api/auth/switch-role', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      const SUPER_ADMIN_EMAIL = 's8869420@gmail.com';
      const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
      
      const switchRoleSchema = z.object({
        role: z.enum(['traveler', 'merchant', 'specialist', 'admin']),
      });
      
      const { role: targetRole } = switchRoleSchema.parse(req.body);
      
      // Check if user can access this role
      const accessibleRoles = isSuperAdmin 
        ? ['traveler', 'merchant', 'specialist', 'admin'] 
        : [user?.role || 'traveler'];
      
      if (!accessibleRoles.includes(targetRole)) {
        return res.status(403).json({ 
          error: '您沒有權限切換到此角色', 
          code: 'ROLE_NOT_ACCESSIBLE' 
        });
      }
      
      // Store active role in session
      if (req.session) {
        req.session.activeRole = targetRole;
      }
      
      // Auto-seed merchant/specialist data for super admin
      if (isSuperAdmin) {
        if (targetRole === 'merchant') {
          let merchant = await storage.getMerchantByUserId(user!.id);
          if (!merchant) {
            merchant = await storage.createMerchant({
              userId: user!.id,
              name: `${user!.firstName || 'Admin'}'s Test Store`,
              email: user!.email!,
              subscriptionPlan: 'premium',
              dailySeedCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
              creditBalance: 10000,
            });
            console.log(`[GOD MODE] Auto-created merchant for super admin: ${merchant.id}`);
          }
        } else if (targetRole === 'specialist') {
          let specialist = await storage.getSpecialistByUserId(user!.id);
          if (!specialist) {
            specialist = await storage.createSpecialist({
              userId: user!.id,
              name: `${user!.firstName || 'Admin'} Specialist`,
              serviceRegion: 'taipei',
              isAvailable: true,
              maxTravelers: 10,
            });
            console.log(`[GOD MODE] Auto-created specialist for super admin: ${specialist.id}`);
          }
        }
      }
      
      console.log(`[Role Switch] User ${userId} switched to role: ${targetRole}`);
      
      // Generate new JWT token with updated activeRole
      const newToken = generateJwtToken({
        claims: {
          sub: user!.id,
          email: user!.email,
          first_name: user!.firstName,
          last_name: user!.lastName,
          profile_image_url: user!.profileImageUrl,
        }
      }, targetRole);
      
      res.json({ 
        success: true, 
        activeRole: targetRole,
        role: targetRole, // For frontend compatibility
        token: newToken, // New token with updated activeRole
        message: `已切換至${targetRole === 'traveler' ? '旅客' : targetRole === 'merchant' ? '商家' : targetRole === 'specialist' ? '專員' : '管理員'}模式`
      });
    } catch (error: any) {
      console.error("Switch role error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: '無效的角色', code: 'INVALID_ROLE' });
      }
      res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '切換角色失敗'));
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

  // ============ Logout ============
  
  app.post('/api/auth/logout', async (req: any, res) => {
    try {
      if (req.session) {
        req.session.destroy((err: any) => {
          if (err) console.error('Session destroy error:', err);
        });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: '已成功登出' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '登出失敗'));
    }
  });

  // ============ Profile Routes (設定頁面) ============

  app.get('/api/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
      
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json(createErrorResponse(ErrorCode.USER_NOT_FOUND));

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: user.role,
        gender: user.gender,
        birthDate: user.birthDate,
        phone: user.phone,
        dietaryRestrictions: user.dietaryRestrictions || [],
        medicalHistory: user.medicalHistory || [],
        emergencyContactName: user.emergencyContactName,
        emergencyContactPhone: user.emergencyContactPhone,
        emergencyContactRelation: user.emergencyContactRelation,
        preferredLanguage: user.preferredLanguage || 'zh-TW',
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得用戶資料'));
    }
  });

  app.patch('/api/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

      const { updateProfileSchema } = await import('@shared/schema');
      const validated = updateProfileSchema.parse(req.body);
      
      const updateData: any = { ...validated };
      if (validated.birthDate) {
        let dateStr = validated.birthDate.replace(/[\/\.\-\s]/g, '');
        if (/^\d{8}$/.test(dateStr)) {
          dateStr = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        }
        updateData.birthDate = new Date(dateStr);
      }

      const updatedUser = await storage.updateUser(userId, updateData);
      if (!updatedUser) return res.status(404).json(createErrorResponse(ErrorCode.USER_NOT_FOUND));

      res.json({
        success: true,
        message: '個人資料已更新',
        profile: {
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          gender: updatedUser.gender,
          birthDate: updatedUser.birthDate,
          phone: updatedUser.phone,
          dietaryRestrictions: updatedUser.dietaryRestrictions || [],
          medicalHistory: updatedUser.medicalHistory || [],
          emergencyContactName: updatedUser.emergencyContactName,
          emergencyContactPhone: updatedUser.emergencyContactPhone,
          emergencyContactRelation: updatedUser.emergencyContactRelation,
          preferredLanguage: updatedUser.preferredLanguage,
        }
      });
    } catch (error: any) {
      console.error('Update profile error:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: '資料格式錯誤', details: error.errors });
      }
      res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法更新用戶資料'));
    }
  });

  // ============ SOS Alerts (安全中心) ============

  app.get('/api/sos/eligibility', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/sos/alert', isAuthenticated, async (req: any, res) => {
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

  app.get('/api/sos/alerts', isAuthenticated, async (req: any, res) => {
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

  app.patch('/api/sos/alerts/:id/cancel', isAuthenticated, async (req: any, res) => {
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

  // ============ Delete User Account ============
  
  app.delete('/api/user/account', isAuthenticated, async (req: any, res) => {
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

  // 取得區域獎池 (SP/SSR 優惠券)
  app.get("/api/coupons/region/:regionId/pool", async (req, res) => {
    try {
      const regionId = parseInt(req.params.regionId);
      if (isNaN(regionId)) {
        return res.status(400).json({ error: "Invalid region ID" });
      }
      
      const coupons = await storage.getRegionPrizePoolCoupons(regionId);
      res.json({ coupons });
    } catch (error) {
      console.error("Failed to fetch prize pool:", error);
      res.status(500).json({ error: "Failed to fetch prize pool" });
    }
  });

  // ============ Category & Sub-category Data ============
  // Note: DISTRICT_DATA and getRandomDistrict removed - now using database queries via storage.getRandomDistrictByRegion/getRandomDistrictByCountry
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

  function generateItinerarySkeleton(targetDistrict: string, cardCount: number): {
    targetDistrict: string;
    userRequestCount: number;
    generatedCount: number;
    skeleton: SkeletonItem[];
  } {
    const K = Math.min(12, Math.max(5, cardCount));
    
    const lockedDistrict = targetDistrict;
    
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
    console.log('[generate-itinerary] API called with:', req.body);
    try {
      const { regionId, countryId, level, language, collectedNames } = req.body;
      
      // Validate: must have regionId or countryId (use database, no hardcoding)
      if (!regionId && !countryId) {
        return res.status(400).json(createErrorResponse(ErrorCode.MISSING_LOCATION_ID));
      }
      
      // Step 1: Get random district from database (no DISTRICT_DATA)
      let district;
      if (regionId) {
        district = await storage.getRandomDistrictByRegion(regionId);
      } else {
        district = await storage.getRandomDistrictByCountry(countryId);
      }
      
      if (!district) {
        return res.status(404).json(createErrorResponse(ErrorCode.NO_DISTRICT_FOUND));
      }
      
      // Step 2: Get full hierarchy (district, region, country) from database
      const hierarchy = await storage.getDistrictWithParents(district.id);
      if (!hierarchy) {
        return res.status(500).json({ error: "Failed to get location hierarchy" });
      }
      
      const { district: districtInfo, region, country: countryInfo } = hierarchy;
      const targetDistrict = districtInfo.nameZh;
      const city = region.nameZh;
      const country = countryInfo.nameZh;
      
      console.log('[generate-itinerary] Resolved location:', { targetDistrict, city, country, districtId: district.id });
      
      const langMap: Record<string, string> = {
        'zh-TW': '繁體中文',
        'en': 'English',
        'ja': '日本語',
        'ko': '한국어'
      };
      const outputLang = langMap[language] || 'English';
      
      const itemCount = Math.min(12, Math.max(5, Math.floor(level * 1.2)));
      
      // Pass targetDistrict directly (no more getRandomDistrict call)
      const skeletonResult = generateItinerarySkeleton(targetDistrict, itemCount);
      const { skeleton } = skeletonResult;

      const categoryMap: Record<string, string> = {
        '食': 'Food', '宿': 'Stay', '生態文化教育': 'Education',
        '遊程體驗': 'Activity', '娛樂設施': 'Entertainment',
        '活動': 'Activity', '景點': 'Scenery', '購物': 'Shopping'
      };

      // Check cache for existing places (using DB-resolved names)
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
All places MUST be in or near "${targetDistrict}" district.

【行程骨架 Itinerary Skeleton - FOLLOW THIS EXACTLY】
${skeletonInstructions}

【重要規則 CRITICAL RULES】
1. place_name 必須是「真實存在的店家名稱」，例如：
   - 正確: "阿嬌熱炒"、"蘭姐鴨肉飯"、"石碇老街"、"功維敘隧道"
   - 錯誤: "壯圍鄉景點探索"、"南澳鄉食探索"、"XX鄉購物探索"
2. 絕對禁止使用「地區名+類別+探索」格式的假名稱
3. 如果該區域確實沒有符合類別的店家，請推薦鄰近區域的真實店家
4. place_name 必須可以在 Google Maps 搜尋到

【動線順暢原則 Route Flow】
- 推薦鄰近區域的店家時，優先選擇「相鄰區域」而非遠方區域
- 考慮時間順序：早上的地點、中午的地點、下午的地點應該在合理的移動範圍內
- 避免讓使用者來回奔波，地點之間的移動距離應控制在 30 分鐘車程以內
- 如果必須跨區，請選擇同一方向上的區域

【任務說明 Your Task】
For each skeleton slot, find a REAL business/location in or near ${targetDistrict}:
- Must be an actual restaurant, shop, attraction, or business with a real name
- Can be searched and found on Google Maps
- If no matching place in ${targetDistrict}, suggest one from a nearby district (prefer adjacent areas)
- Ensure route flow is smooth - places should be geographically close to minimize travel time

【排除清單 Exclusions】
Do NOT include: ${usedPlaceNamesInPull.size > 0 ? Array.from(usedPlaceNamesInPull).join(', ') : 'none'}

Output language: ${outputLang}
Output ONLY valid JSON array, no markdown, no explanation:

[
${uncachedSkeleton.map((item, idx) => `  {
    "place_name": "真實店家名稱",
    "description": "2-3句描述這個地點的特色",
    "category": "${categoryMap[item.category] || item.category}",
    "sub_category": "${item.subCategory}",
    "suggested_time": "${item.suggestedTime}",
    "duration": "1-2 hours",
    "time_slot": "${item.timeSlot}",
    "search_query": "店家名稱 ${city}",
    "color_hex": "#6366f1",
    "energy_level": "${item.energyLevel}"
  }`).join(',\n')}
]`;

        const responseText = await callGemini(prompt);
        let jsonText = responseText || '';
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        aiGeneratedItems = JSON.parse(jsonText);
        
        // 驗證並過濾掉無效的 place_name (搜索詞格式的假名稱)
        const invalidPatterns = [
          /探索$/,  // 以「探索」結尾
          /^.{2,4}(鄉|區|市|鎮|村).{2,6}探索$/,  // 區域名+探索
          /^.{2,4}(鄉|區|市|鎮|村).{2,4}(美食|購物|景點|住宿|體驗)$/,  // 區域名+類別
          /真實店家名稱/,  // 模板佔位符
          /^REAL place/i,  // 英文模板佔位符
        ];
        
        aiGeneratedItems = aiGeneratedItems.map((item: any, idx: number) => {
          const isInvalid = invalidPatterns.some(pattern => pattern.test(item.place_name));
          if (isInvalid) {
            console.log(`[AI Validation] Rejected invalid place_name: "${item.place_name}"`);
            // 使用 sub_category + 區域作為備用，標記為需要人工審核
            return {
              ...item,
              place_name: `[待審核] ${targetDistrict}${item.sub_category}推薦`,
              description: `此地點需要人工確認，AI 無法找到符合條件的真實店家。原始分類：${item.sub_category}`,
              needs_review: true
            };
          }
          return item;
        });
      }

      // Merge cached and AI-generated items
      const districtCenter = await getDistrictBoundary(targetDistrict, city, country);
      const finalInventory: any[] = new Array(skeleton.length);

      // Process cached items (no Google API calls needed - data already in cache)
      for (const { skeletonIdx, cached, skeleton: skelItem } of cachedItems) {
        const cachedLocation = cached.locationLat && cached.locationLng 
          ? { lat: parseFloat(cached.locationLat), lng: parseFloat(cached.locationLng) }
          : null;
        
        const categoryZhMapCached: Record<string, string> = {
          'Food': '美食', 'Stay': '住宿', 'Education': '生態文化教育',
          'Activity': '遊程體驗', 'Entertainment': '娛樂設施', 'Scenery': '景點', 'Shopping': '購物'
        };
        finalInventory[skeletonIdx] = {
          id: Date.now() + skeletonIdx,
          placeName: cached.placeName,
          description: cached.description,
          category: categoryZhMapCached[cached.category] || cached.category,
          subCategory: cached.subCategory,
          suggestedTime: skelItem.suggestedTime,
          duration: cached.duration || '1-2 hours',
          timeSlot: skelItem.timeSlot,
          searchQuery: cached.searchQuery,
          colorHex: cached.colorHex || '#6366f1',
          city: city,
          country: country,
          district: targetDistrict,
          energyLevel: skelItem.energyLevel,
          isCoupon: false,
          couponData: null,
          operatingStatus: 'OPEN',
          placeId: cached.placeId || null,
          verifiedName: cached.verifiedName || cached.placeName,
          verifiedAddress: cached.verifiedAddress || null,
          googleRating: cached.googleRating ? Number(cached.googleRating) : null,
          location: cachedLocation,
          isLocationVerified: cached.isLocationVerified === true,
          districtCenter: districtCenter,
          fromCache: true
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

        const categoryZhMap: Record<string, string> = {
          'Food': '美食', 'Stay': '住宿', 'Education': '生態文化教育',
          'Activity': '遊程體驗', 'Entertainment': '娛樂設施', 'Scenery': '景點', 'Shopping': '購物'
        };
        const inventoryItem = {
          id: Date.now() + originalIdx,
          placeName: aiItem.place_name,
          description: aiItem.description,
          category: categoryZhMap[aiItem.category] || aiItem.category,
          subCategory: aiItem.sub_category,
          suggestedTime: skelItem.suggestedTime,
          duration: aiItem.duration || '1-2 hours',
          timeSlot: skelItem.timeSlot,
          searchQuery: aiItem.search_query,
          colorHex: aiItem.color_hex || '#6366f1',
          city: city,
          country: country,
          district: targetDistrict,
          energyLevel: skelItem.energyLevel,
          isCoupon: false,
          couponData: null,
          operatingStatus: 'OPEN',
          placeId: placeResult?.place_id || null,
          verifiedName: placeResult?.name || aiItem.place_name,
          verifiedAddress: placeResult?.formatted_address || null,
          googleRating: placeResult?.rating || null,
          location: placeLocation,
          isLocationVerified: isVerified,
          districtCenter: districtCenter,
          fromCache: false
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

      // ===== Merchant Promo Overlay: 檢查商家認領並附加優惠資訊與優惠券機率 =====
      // SECURITY: 只從已驗證的 auth context 取得 userId，不接受 req.body.userId
      // 驗證 session 或 JWT 是否真正已認證
      const reqAny = req as any;
      const isActuallyAuthenticated = !!(
        (reqAny.user?.claims?.sub && reqAny.session?.userId) ||  // Replit Auth with valid session
        (reqAny.jwtUser?.userId && req.headers.authorization)  // Valid JWT token
      );
      const userId = isActuallyAuthenticated 
        ? (reqAny.user?.claims?.sub || reqAny.jwtUser?.userId) 
        : null;
      let couponsWon: any[] = [];
      
      const enrichedInventory = await Promise.all(finalInventory.map(async (item: any) => {
        if (!item) return item;
        
        try {
          // 查找商家是否認領此地點
          const merchantLink = await storage.getMerchantPlaceLinkByPlaceName(
            item.placeName || item.verifiedName,
            item.district || '',
            item.city
          );
          
          if (merchantLink) {
            // 附加商家優惠資訊 overlay
            item.merchantPromo = {
              merchantId: merchantLink.merchantId,
              isPromoActive: merchantLink.isPromoActive || false,
              promoTitle: merchantLink.promoTitle,
              promoDescription: merchantLink.promoDescription,
              promoImageUrl: merchantLink.promoImageUrl
            };
            
            // 如果有登入用戶(已驗證)且背包未滿，進行優惠券抽獎
            if (isActuallyAuthenticated && userId && merchantLink.isPromoActive) {
              const isFull = await storage.isInventoryFull(userId);
              if (!isFull) {
                // 使用機率系統抽取優惠券等級
                const tier = await storage.rollCouponTier();
                
                if (tier) {
                  // 獲取該商家的優惠券模板
                  const merchantCoupons = await storage.getMerchantCouponsByPlaceLink(merchantLink.id);
                  // 根據等級找到匹配的優惠券
                  const matchingCoupon = merchantCoupons.find(c => c.tier === tier) || merchantCoupons[0];
                  
                  if (matchingCoupon) {
                    // 計算有效期限: 使用優惠券的 validUntil 或預設 30 天
                    const validUntil = matchingCoupon.validUntil 
                      ? new Date(matchingCoupon.validUntil)
                      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    
                    // 新增到用戶背包
                    const inventoryItem = await storage.addToUserInventory({
                      userId,
                      itemType: 'coupon',
                      itemName: matchingCoupon.name,
                      itemDescription: matchingCoupon.content,
                      tier: tier,
                      merchantId: merchantLink.merchantId,
                      merchantCouponId: matchingCoupon.id,
                      terms: matchingCoupon.terms,
                      content: JSON.stringify({
                        placeName: item.placeName,
                        district: item.district,
                        city: item.city,
                        country: item.country,
                        promoTitle: merchantLink.promoTitle
                      }),
                      validUntil,
                    });
                    
                    if (inventoryItem) {
                      item.isCoupon = true;
                      item.couponData = {
                        inventoryId: inventoryItem.id,
                        tier: tier,
                        name: matchingCoupon.name,
                        description: matchingCoupon.content,
                        validUntil: validUntil.toISOString(),
                        slotIndex: inventoryItem.slotIndex
                      };
                      couponsWon.push({
                        tier,
                        placeName: item.placeName,
                        couponName: matchingCoupon.name
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (promoError) {
          console.error(`Error enriching place ${item.placeName} with promo:`, promoError);
        }
        
        return item;
      }));

      const data = {
        status: 'success',
        meta: {
          date: new Date().toISOString().split('T')[0],
          country: country,
          city: city,
          lockedDistrict: targetDistrict,
          userLevel: level,
          totalItems: skeleton.length,
          verificationEnabled: !!GOOGLE_MAPS_API_KEY,
          cacheHits: cachedItems.length,
          aiGenerated: uncachedSkeleton.length,
          couponsWon: couponsWon.length
        },
        inventory: enrichedInventory,
        couponsWon: couponsWon
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

  // Helper function to get a place for a subcategory from cache (no AI generation)
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

    // Check cache only (AI generation disabled)
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

    // No cache available - return placeholder (AI generation disabled)
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
      source: 'cache',
      isVerified: false
    };
  }

  // New endpoint: Generate a complete itinerary using parallel time-slot AI architecture
  app.post("/api/gacha/itinerary", gachaRateLimiter, async (req, res) => {
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

      const getLocalizedDescription = (place: any, lang: string): string => {
        const i18n = place.descriptionI18n || place.description_i18n;
        const defaultDesc = place.description || '';
        if (!i18n) return defaultDesc;
        switch (lang) {
          case 'ja': return i18n.ja || defaultDesc;
          case 'ko': return i18n.ko || defaultDesc;
          case 'en': return i18n.en || defaultDesc;
          default: return defaultDesc;
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
      const COLLECTED_REDUCTION_PROBABILITY = 0.40; // 40% reduction for collected items
      
      // Step 4: Select subcategory using 1/N category probability (excluding food/stay for activities), then 1/N subcategory probability
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
        
        // For 'activity' task type: use 1/N category probability (excluding food/stay = 6 categories), then 1/N subcategory probability
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

  // GET /api/gacha/pool/:city - 用城市名稱查詢獎池預覽
  app.get("/api/gacha/pool/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const decodedCity = decodeURIComponent(city);
      
      // 取得該城市的所有快取地點作為獎池
      const places = await storage.getPlaceCacheByCity(decodedCity);
      
      // 篩選高評分的地點作為大獎
      const jackpots = places.filter(p => {
        const rating = p.googleRating ? parseFloat(p.googleRating) : 0;
        return rating >= 4.5;
      }).slice(0, 20);

      res.json({
        success: true,
        pool: {
          city: decodedCity,
          jackpots: jackpots.map(p => ({
            id: p.id,
            placeName: p.placeName,
            category: p.category,
            subCategory: p.subCategory,
            rating: p.googleRating,
          })),
          totalInPool: places.length,
          jackpotCount: jackpots.length,
        }
      });
    } catch (error) {
      console.error("Gacha pool by city error:", error);
      res.status(500).json({ error: "Failed to get gacha pool" });
    }
  });

  // GET /api/gacha/pool - 用 regionId 查詢獎池
  app.get("/api/gacha/pool", async (req, res) => {
    try {
      const { regionId, city } = req.query;
      
      if (!regionId && !city) {
        return res.status(400).json({ error: "regionId or city is required" });
      }

      let cityName = city as string;
      
      // 如果提供 regionId，查詢對應的城市名稱
      if (regionId && !city) {
        const parsedRegionId = parseInt(regionId as string);
        if (isNaN(parsedRegionId)) {
          return res.status(400).json({ error: "Invalid regionId" });
        }
        const region = await storage.getRegionById(parsedRegionId);
        if (!region) {
          return res.status(404).json({ error: "Region not found" });
        }
        cityName = region.nameZh;
      }

      // 取得該城市的所有快取地點作為獎池
      const places = await storage.getPlaceCacheByCity(cityName);
      
      // 篩選高評分或有商家的地點作為大獎
      const jackpots = places.filter(p => {
        const rating = p.googleRating ? parseFloat(p.googleRating) : 0;
        return rating >= 4.5;
      }).slice(0, 20);

      res.json({
        success: true,
        pool: {
          city: cityName,
          jackpots: jackpots.map(p => ({
            id: p.id,
            placeName: p.placeName,
            category: p.category,
            subCategory: p.subCategory,
            rating: p.googleRating,
          })),
          totalInPool: places.length,
          jackpotCount: jackpots.length,
        }
      });
    } catch (error) {
      console.error("Gacha pool by region error:", error);
      res.status(500).json({ error: "Failed to get gacha pool" });
    }
  });

  // GET /api/gacha/prize-pool - 查看獎池（高稀有度優惠券）
  app.get("/api/gacha/prize-pool", async (req, res) => {
    try {
      const { regionId } = req.query;
      
      if (!regionId) {
        return res.status(400).json({ error: "regionId is required" });
      }

      const parsedRegionId = parseInt(regionId as string);
      if (isNaN(parsedRegionId)) {
        return res.status(400).json({ error: "Invalid regionId" });
      }

      // 取得該地區的高稀有度優惠券 (SP, SSR)
      const prizePoolCoupons = await storage.getRegionPrizePoolCoupons(parsedRegionId);

      // 追蹤獎池查看數據
      for (const coupon of prizePoolCoupons) {
        if (coupon.merchantId) {
          try {
            await storage.incrementAnalyticsCounter(coupon.merchantId, coupon.placeLinkId, 'prizePoolViews');
          } catch (e) {
            console.error("Failed to track prize pool view:", e);
          }
        }
      }

      res.json({
        success: true,
        coupons: prizePoolCoupons.map(c => ({
          id: c.id,
          tier: c.rarity || c.tier || 'R',
          name: c.title || c.name,
          merchantName: c.merchantName || c.businessName,
          placeName: c.placeName,
          terms: c.terms,
        }))
      });
    } catch (error) {
      console.error("Get prize pool error:", error);
      res.status(500).json({ error: "Failed to get prize pool" });
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
      // 注意：這些值必須與 /api/rarity-config 返回的值一致（Apple 審核要求）
      // 資料庫預設值：SP 2%, SSR 8%, SR 15%, S 23%, R 32%
      const RARITY_DROP_RATES: Record<string, number> = {
        SP: 0.02,   // 2%
        SSR: 0.08,  // 8%
        SR: 0.15,   // 15%
        S: 0.23,    // 23% (與資料庫一致)
        R: 0.32,    // 32% (與資料庫一致)
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
          
          // 追蹤圖鑑收錄
          try {
            await storage.incrementAnalyticsCounter(claimInfo.claim.merchantId, claimInfo.claim.id, 'collectedCount');
          } catch (e) {
            console.error("Failed to track collection:", e);
          }
          
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
            
            // 追蹤優惠券發放
            try {
              await storage.incrementAnalyticsCounter(claimInfo.claim.merchantId, claimInfo.claim.id, 'couponIssuedCount');
            } catch (e) {
              console.error("Failed to track coupon issue:", e);
            }
            
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
  
  app.post("/api/gacha/itinerary/v3", async (req: any, res) => {
    const userId = req.user?.claims?.sub || 'guest';
    console.log('[Gacha V3] Request received:', { body: req.body, userId });
    
    try {

      // Support both old format (city, district) and new simplified format (regionId, itemCount)
      const itinerarySchema = z.object({
        // New simplified format from mobile app
        regionId: z.number().optional(),
        countryId: z.number().optional(),
        language: z.string().optional(),
        itemCount: z.number().min(5).max(12).optional(),
        count: z.number().min(5).max(12).optional(), // Alias for itemCount
        // Legacy format
        city: z.string().optional(),
        district: z.string().optional(),
        pace: z.enum(['relaxed', 'moderate', 'packed']).optional(),
      });

      const validated = itinerarySchema.parse(req.body);
      let { city, district, pace } = validated;
      const { regionId, language = 'zh-TW' } = validated;
      const itemCount = validated.itemCount || validated.count; // Support both
      
      const getLocalizedDescription = (place: any, lang: string): string => {
        const i18n = place.descriptionI18n || place.description_i18n;
        const defaultDesc = place.description || '';
        if (!i18n) return defaultDesc;
        switch (lang) {
          case 'ja': return i18n.ja || defaultDesc;
          case 'ko': return i18n.ko || defaultDesc;
          case 'en': return i18n.en || defaultDesc;
          default: return defaultDesc;
        }
      };
      
      // ========== 每日抽卡限制檢查 ==========
      const DAILY_PULL_LIMIT = 36; // 每人每天最多抽 36 張卡
      const requestedCount = itemCount || 7; // 預設 7 張
      
      if (userId !== 'guest') {
        const currentDailyCount = await storage.getUserDailyGachaCount(userId);
        const remainingQuota = DAILY_PULL_LIMIT - currentDailyCount;
        
        if (remainingQuota <= 0) {
          return res.status(429).json({
            success: false,
            error: "今日抽卡次數已達上限，請明天再來！",
            code: "DAILY_LIMIT_EXCEEDED",
            dailyLimit: DAILY_PULL_LIMIT,
            currentCount: currentDailyCount,
            remainingQuota: 0
          });
        }
        
        if (requestedCount > remainingQuota) {
          return res.status(400).json({
            success: false,
            error: `今日剩餘額度為 ${remainingQuota} 張，請調整抽取數量`,
            code: "EXCEEDS_REMAINING_QUOTA",
            dailyLimit: DAILY_PULL_LIMIT,
            currentCount: currentDailyCount,
            remainingQuota
          });
        }
      }
      
      // If regionId is provided, look up the city name from database
      if (regionId && !city) {
        const region = await storage.getRegionById(regionId);
        if (!region) {
          return res.status(400).json({ 
            success: false, 
            error: "找不到指定的區域",
            code: "REGION_NOT_FOUND"
          });
        }
        city = region.nameZh;
        console.log('[Gacha V3] Resolved regionId', regionId, 'to city:', city);
      }
      
      // Validate that we have city at minimum
      if (!city) {
        return res.status(400).json({ 
          success: false, 
          error: "請選擇城市（需提供 city 或 regionId）",
          code: "CITY_REQUIRED"
        });
      }
      
      // Convert itemCount to pace if provided
      if (itemCount && !pace) {
        if (itemCount <= 5) pace = 'relaxed';
        else if (itemCount <= 7) pace = 'moderate';
        else pace = 'packed';
      }
      pace = pace || 'moderate';
      
      console.log('[Gacha V3] Validated params:', { city, district, pace, itemCount, userId });

      const itemCounts = { relaxed: 5, moderate: 7, packed: 10 };
      const targetCount = itemCount || itemCounts[pace];

      // ========== Step 1: 錨點策略 (Anchor Strategy) ==========
      // 如果沒有指定 district，從該縣市的鄉鎮區中隨機選一個當核心錨點
      let anchorDistrict = district;
      if (!anchorDistrict && regionId) {
        const districts = await storage.getDistrictsByRegion(regionId);
        if (districts.length > 0) {
          const randomIdx = Math.floor(Math.random() * districts.length);
          anchorDistrict = districts[randomIdx].nameZh;
          console.log('[Gacha V3] Anchor district selected:', anchorDistrict);
        }
      }
      
      // ========== Step 2: 結構化選點 (Structured Selection) ==========
      // 美食保底 + 住宿規則 + 剩餘等權重隨機分配
      const SIX_CATEGORIES = ['美食', '景點', '購物', '娛樂設施', '生態文化教育', '遊程體驗'];
      
      // 美食上限：不超過總數一半
      const maxFoodCount = Math.floor(targetCount / 2);
      
      // 美食保底規則：5-6張=2個, 7-8張=3個, 9+張=3個
      // 但不能超過 maxFoodCount（處理 targetCount < 5 的邊界情況）
      let minFoodCount = 2;
      if (targetCount >= 7 && targetCount <= 8) minFoodCount = 3;
      if (targetCount >= 9) minFoodCount = 3;
      minFoodCount = Math.min(minFoodCount, maxFoodCount); // 確保保底不超過上限
      
      // 住宿規則：≥9張才有住宿
      const stayCount = targetCount >= 9 ? 1 : 0;
      
      console.log('[Gacha V3] Selection config:', { targetCount, minFoodCount, maxFoodCount, stayCount });
      
      // 查詢錨點區域的地點
      let anchorPlaces = anchorDistrict 
        ? await storage.getOfficialPlacesByDistrict(city, anchorDistrict, 200)
        : await storage.getOfficialPlacesByCity(city, 200);
      
      console.log('[Gacha V3] Anchor places found:', anchorPlaces.length, 'in', anchorDistrict || city);
      
      // Fallback: 如果錨點區沒有地點，擴展到整個城市
      if (anchorPlaces.length === 0 && anchorDistrict) {
        console.log('[Gacha V3] Anchor district empty, falling back to city-wide search');
        anchorPlaces = await storage.getOfficialPlacesByCity(city, 200);
        console.log('[Gacha V3] City-wide places found:', anchorPlaces.length);
        anchorDistrict = undefined;
      }
      
      // 只有整個城市都沒有地點時才返回錯誤
      if (anchorPlaces.length === 0) {
        return res.json({
          success: true,
          itinerary: [],
          couponsWon: [],
          meta: { 
            message: `${city}目前還沒有上線的景點，我們正在努力擴充中！`,
            code: "NO_PLACES_AVAILABLE",
            city, 
            district: null
          }
        });
      }
      
      // 按類別分組
      const groupByCategory = (places: any[]) => {
        const groups: Record<string, any[]> = {};
        for (const p of places) {
          const cat = p.category || '其他';
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(p);
        }
        return groups;
      };
      
      const anchorByCategory = groupByCategory(anchorPlaces);
      const selectedPlaces: any[] = [];
      
      // ========== 去重保護：排除用戶圖鑑最近 36 張地點 ==========
      let recentCollectionIds: number[] = [];
      if (userId && userId !== 'guest') {
        recentCollectionIds = await storage.getRecentCollectionPlaceIds(userId, GACHA_DEDUP_LIMIT);
      }
      
      // Guest 用戶：從 session 快取中取得去重 ID（同一次 session 內不重複）
      const sessionKey = `guest:${city}`;
      if (userId === 'guest') {
        const sessionDedup = guestSessionDedup.get(sessionKey);
        if (sessionDedup && Date.now() - sessionDedup.timestamp < 30 * 60 * 1000) {
          recentCollectionIds = sessionDedup.placeIds;
        }
      }
      
      const usedIds = new Set<number>(recentCollectionIds);
      console.log('[Gacha V3] Collection dedup exclusion:', recentCollectionIds.length, 'places');
      
      // 輔助函數：從類別中隨機選取
      const pickFromCategory = (category: string, count: number): any[] => {
        const picked: any[] = [];
        let pool = [...(anchorByCategory[category] || [])];
        
        // 打亂
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        
        for (const p of pool) {
          if (picked.length >= count) break;
          if (usedIds.has(p.id)) continue;
          picked.push(p);
          usedIds.add(p.id);
        }
        return picked;
      };
      
      // 錨點區的所有地點
      const districtPlaces = anchorPlaces;
      
      // ========== 去重安全檢查 ==========
      const availableAfterDedup = districtPlaces.filter(p => !usedIds.has(p.id)).length;
      if (availableAfterDedup < targetCount) {
        console.log('[Gacha V3] Dedup safety: only', availableAfterDedup, 'available (need', targetCount, '), ignoring dedup');
        usedIds.clear(); // 清空去重限制
      }
      
      // ========== 結構化選點：保底 + 等權重隨機分配 ==========
      const categoryPickCounts: Record<string, number> = {};
      
      // Step 2a: 先選取保底美食
      const foodPicks = pickFromCategory('美食', minFoodCount);
      selectedPlaces.push(...foodPicks);
      categoryPickCounts['美食'] = foodPicks.length;
      console.log('[Gacha V3] Food picks (guaranteed):', foodPicks.length, '/', minFoodCount);
      
      // Step 2b: 若需要住宿，選取 1 個
      if (stayCount > 0) {
        const stayPicks = pickFromCategory('住宿', 1);
        selectedPlaces.push(...stayPicks);
        categoryPickCounts['住宿'] = stayPicks.length;
        console.log('[Gacha V3] Stay picks:', stayPicks.length);
      }
      
      // Step 2c: 剩餘額度用等權重隨機分配（排除住宿，因為已固定）
      let remaining = targetCount - selectedPlaces.length;
      console.log('[Gacha V3] Remaining slots for random:', remaining);
      
      // 初始化權重（六大類別，住宿已固定所以不參與）
      const categoryWeights: Record<string, number> = {};
      let totalWeight = 0;
      for (const cat of SIX_CATEGORIES) {
        if (anchorByCategory[cat] && anchorByCategory[cat].length > 0) {
          categoryWeights[cat] = 1;
          totalWeight += 1;
        }
      }
      
      while (remaining > 0 && totalWeight > 0) {
        // 加權隨機選擇類別
        let rand = Math.random() * totalWeight;
        let selectedCategory = '';
        for (const [cat, weight] of Object.entries(categoryWeights)) {
          rand -= weight;
          if (rand <= 0) {
            selectedCategory = cat;
            break;
          }
        }
        if (!selectedCategory) selectedCategory = Object.keys(categoryWeights)[0];
        
        // 檢查美食上限
        const currentCategoryCount = categoryPickCounts[selectedCategory] || 0;
        if (selectedCategory === '美食' && currentCategoryCount >= maxFoodCount) {
          categoryWeights[selectedCategory] = 0;
          totalWeight = Object.values(categoryWeights).reduce((a, b) => a + b, 0);
          continue;
        }
        
        // 從該類別選一個
        const picks = pickFromCategory(selectedCategory, 1);
        if (picks.length > 0) {
          selectedPlaces.push(...picks);
          categoryPickCounts[selectedCategory] = (categoryPickCounts[selectedCategory] || 0) + 1;
          remaining--;
        } else {
          // 該類別沒地點了，移除權重
          categoryWeights[selectedCategory] = 0;
          totalWeight = Object.values(categoryWeights).reduce((a, b) => a + b, 0);
        }
      }
      
      console.log('[Gacha V3] Selection result:', categoryPickCounts);
      console.log('[Gacha V3] Total selected:', selectedPlaces.length);
      
      // ========== Step 3: 經緯度排序 (Coordinate Sorting) ==========
      // 使用最近鄰居演算法排序
      const sortByCoordinates = (places: any[]) => {
        if (places.length <= 1) return places;
        
        // 分離有效座標和無效座標的地點
        const withCoords = places.filter(p => p.locationLat && p.locationLng);
        const withoutCoords = places.filter(p => !p.locationLat || !p.locationLng);
        
        if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];
        
        const sorted: any[] = [];
        const remaining = [...withCoords];
        
        // 從最北的點開始（早上通常從北邊開始）
        remaining.sort((a, b) => b.locationLat - a.locationLat);
        sorted.push(remaining.shift()!);
        
        // 最近鄰居
        while (remaining.length > 0) {
          const last = sorted[sorted.length - 1];
          let nearestIdx = 0;
          let nearestDist = Infinity;
          
          for (let i = 0; i < remaining.length; i++) {
            const p = remaining[i];
            const dist = Math.sqrt(
              Math.pow(p.locationLat - last.locationLat, 2) +
              Math.pow(p.locationLng - last.locationLng, 2)
            );
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestIdx = i;
            }
          }
          
          sorted.push(remaining.splice(nearestIdx, 1)[0]);
        }
        
        // 無座標的地點加到最後
        return [...sorted, ...withoutCoords];
      };
      
      const coordinateSortedPlaces = sortByCoordinates(selectedPlaces);
      
      // ========== Step 3b: 智慧時段排序 ==========
      // 根據營業時間/類別推斷最佳時段，早餐排前面、宵夜排後面、住宿最後
      const timeSlotSortedPlaces = sortPlacesByTimeSlot(coordinateSortedPlaces);
      
      // 記錄排序結果
      const stayPlaces = timeSlotSortedPlaces.filter(p => p.category === '住宿');
      const nonStayPlaces = timeSlotSortedPlaces.filter(p => p.category !== '住宿');
      const sortedPlaces = timeSlotSortedPlaces;
      
      console.log('[Gacha V3] After time slot sort:', { 
        nonStay: nonStayPlaces.length, 
        stay: stayPlaces.length,
        order: timeSlotSortedPlaces.slice(0, 5).map(p => `${p.placeName}(${inferTimeSlot(p).slot})`)
      });

      // ========== Step 3c: AI 智慧行程排序（權重最高）==========
      let finalPlaces = sortedPlaces;
      let aiReorderResult = 'skipped';
      let rejectedPlaceIds: number[] = [];
      
      if (selectedPlaces.length >= 2) {
        try {
          const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
          const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
          
          // 格式化營業時間
          const formatOpeningHours = (hours: any): string => {
            if (!hours) return '未提供';
            if (Array.isArray(hours)) return hours.slice(0, 2).join('; ');
            if (hours.weekday_text) return hours.weekday_text.slice(0, 2).join('; ');
            return '未提供';
          };
          
          // 準備完整的地點資訊（包含住宿）
          const allPlacesInfo = selectedPlaces.map((p, idx) => ({
            idx: idx + 1,
            name: p.placeName,
            category: p.category,
            subcategory: p.subcategory || '一般',
            lat: p.locationLat || 0,
            lng: p.locationLng || 0,
            description: (p.description || '').slice(0, 80),
            hours: formatOpeningHours(p.openingHours)
          }));
          
          const reorderPrompt = `你是一日遊行程排序專家。請根據地點資訊安排最佳順序。

地點列表：
${allPlacesInfo.map(p => `${p.idx}. ${p.name}｜${p.category}/${p.subcategory}｜${p.description || '無描述'}｜營業:${p.hours}`).join('\n')}

排序規則（依優先順序）：
1. 時段邏輯：早餐/咖啡廳→上午景點→午餐→下午活動→晚餐/夜市→宵夜/酒吧→住宿（住宿必須最後）
2. 地理動線：減少迂迴，鄰近地點連續安排
3. 類別穿插：避免連續3個同類（夜市內美食除外）
4. 排除不適合：永久歇業、非旅遊點、同園區重複景點（保留代表性最高者）

【輸出格式】只輸出一行 JSON（不要換行、不要 markdown）：
{"order":[3,1,5,2,4],"reason":"早餐先逛景點","reject":[]}`;
          
          const reorderResponse = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey || ''
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: reorderPrompt }] }],
              generationConfig: { 
                maxOutputTokens: 1000, 
                temperature: 0.1
              }
            })
          });
          
          const reorderData = await reorderResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>, error?: { code?: string; message?: string } };
          const reorderText = reorderData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          console.log('[Gacha V3] AI Reorder response (Gemini 3):', reorderText);
          
          if (reorderText) {
            try {
              // 去除 markdown code block 包裝
              let jsonText = reorderText;
              if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
              }
              
              // 嘗試解析完整 JSON，如果失敗則用正則提取 order
              let aiResult: { order?: number[]; reason?: string; reject?: number[] } = {};
              try {
                aiResult = JSON.parse(jsonText);
              } catch {
                // JSON 不完整，嘗試提取 order 陣列
                const orderMatch = jsonText.match(/"order"\s*:\s*\[([^\]]+)\]/);
                const rejectMatch = jsonText.match(/"reject"\s*:\s*\[([^\]]*)\]/);
                if (orderMatch) {
                  aiResult.order = orderMatch[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
                }
                if (rejectMatch && rejectMatch[1].trim()) {
                  aiResult.reject = rejectMatch[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
                }
              }
              console.log('[Gacha V3] AI Parsed:', { order: aiResult.order, reason: aiResult.reason, reject: aiResult.reject });
              
              // 處理被拒絕的地點
              if (aiResult.reject && Array.isArray(aiResult.reject)) {
                for (const idx of aiResult.reject) {
                  if (idx >= 1 && idx <= selectedPlaces.length) {
                    rejectedPlaceIds.push(selectedPlaces[idx - 1].id);
                  }
                }
                if (rejectedPlaceIds.length > 0) {
                  console.log('[Gacha V3] AI rejected places:', rejectedPlaceIds);
                }
              }
              
              // 處理排序
              if (aiResult.order && Array.isArray(aiResult.order) && aiResult.order.length > 0) {
                const validOrder = aiResult.order
                  .filter(n => typeof n === 'number' && n >= 1 && n <= selectedPlaces.length)
                  .filter(n => !rejectedPlaceIds.includes(selectedPlaces[n - 1]?.id));
                const uniqueOrder = Array.from(new Set(validOrder));
                
                if (uniqueOrder.length >= 2) {
                  const reorderedPlaces = uniqueOrder.map(idx => selectedPlaces[idx - 1]).filter(p => p);
                  
                  // 補全遺漏的地點
                  const reorderedIds = new Set(reorderedPlaces.map(p => p.id));
                  const missingPlaces = selectedPlaces.filter(p => 
                    !reorderedIds.has(p.id) && !rejectedPlaceIds.includes(p.id)
                  );
                  if (missingPlaces.length > 0) {
                    console.log('[Gacha V3] Adding missing places:', missingPlaces.length);
                    reorderedPlaces.push(...missingPlaces);
                  }
                  
                  finalPlaces = reorderedPlaces;
                  aiReorderResult = rejectedPlaceIds.length > 0 ? 'reordered_with_rejects' : 'reordered';
                  console.log('[Gacha V3] AI reordered:', uniqueOrder, 'reason:', aiResult.reason || 'N/A');
                } else {
                  aiReorderResult = 'partial_order';
                }
              } else {
                aiReorderResult = 'no_order';
              }
            } catch (parseError) {
              console.error('[Gacha V3] JSON parse failed, trying fallback:', parseError);
              // Fallback: 嘗試從文字中提取數字
              const allNumbers = reorderText.match(/\d+/g);
              if (allNumbers && allNumbers.length >= 2) {
                const newOrder = allNumbers
                  .map(n => parseInt(n))
                  .filter(n => !isNaN(n) && n >= 1 && n <= selectedPlaces.length);
                const uniqueOrder = Array.from(new Set(newOrder));
                if (uniqueOrder.length >= 2) {
                  finalPlaces = uniqueOrder.map(idx => selectedPlaces[idx - 1]).filter(p => p);
                  aiReorderResult = 'fallback_reordered';
                } else {
                  aiReorderResult = 'parse_failed';
                }
              } else {
                aiReorderResult = 'parse_failed';
              }
            }
          } else {
            aiReorderResult = 'empty_response';
          }
        } catch (reorderError) {
          console.error('[Gacha V3] AI reorder failed:', reorderError);
          aiReorderResult = 'error';
        }
      }
      
      console.log('[Gacha V3] AI reorder result:', aiReorderResult, 'rejected:', rejectedPlaceIds.length);
      
      // ========== 補充被拒絕的地點並重新送 AI 審核 ==========
      // 如果 AI 拒絕了某些地點，從備用池中補充，然後重新送 AI 排序
      if (rejectedPlaceIds.length > 0 && finalPlaces.length < targetCount) {
        const shortfall = targetCount - finalPlaces.length;
        console.log('[Gacha V3] Need to replace', shortfall, 'rejected places');
        
        // 計算當前各類別數量
        const currentCategoryCounts: Record<string, number> = {};
        for (const p of finalPlaces) {
          const cat = p.category || '其他';
          currentCategoryCounts[cat] = (currentCategoryCounts[cat] || 0) + 1;
        }
        
        // 建立已使用 ID 集合（包含所有已選地點）
        const currentUsedIds = new Set([
          ...Array.from(usedIds), // 用戶圖鑑去重
          ...selectedPlaces.map(p => p.id), // 本次選取
          ...rejectedPlaceIds // 被拒絕的
        ]);
        
        // 補充迴圈：持續嘗試直到達到目標數量或耗盡可用地點
        let addedCount = 0;
        const maxAttempts = 10;
        
        for (let attempt = 0; attempt < maxAttempts && finalPlaces.length < targetCount; attempt++) {
          const replacementPool = anchorPlaces.filter(p => {
            if (currentUsedIds.has(p.id)) return false;
            const cat = p.category || '其他';
            const currentCount = currentCategoryCounts[cat] || 0;
            if (cat === '美食' && currentCount >= maxFoodCount) return false;
            if (cat === '住宿' && currentCount >= stayCount) return false;
            return true;
          });
          
          if (replacementPool.length === 0) {
            console.log('[Gacha V3] Replacement pool exhausted after', attempt, 'attempts');
            break;
          }
          
          // 打亂並選取一個
          for (let i = replacementPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [replacementPool[i], replacementPool[j]] = [replacementPool[j], replacementPool[i]];
          }
          
          const replacement = replacementPool[0];
          finalPlaces.push(replacement);
          currentUsedIds.add(replacement.id);
          usedIds.add(replacement.id);
          
          const cat = replacement.category || '其他';
          currentCategoryCounts[cat] = (currentCategoryCounts[cat] || 0) + 1;
          addedCount++;
        }
        
        console.log('[Gacha V3] Added', addedCount, 'replacement places, final count:', finalPlaces.length);
        
        // ========== 補入新地點後重新送 AI 審核與排序 ==========
        if (addedCount > 0 && finalPlaces.length >= 2) {
          try {
            const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
            const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
            
            const formatHours = (hours: any): string => {
              if (!hours) return '未提供';
              if (Array.isArray(hours)) return hours.slice(0, 2).join('; ');
              if (hours.weekday_text) return hours.weekday_text.slice(0, 2).join('; ');
              return '未提供';
            };
            
            const updatedPlacesInfo = finalPlaces.map((p, idx) => ({
              idx: idx + 1,
              name: p.placeName,
              category: p.category,
              subcategory: p.subcategory || '一般',
              lat: p.locationLat || 0,
              lng: p.locationLng || 0,
              description: (p.description || '').slice(0, 80),
              hours: formatHours(p.openingHours)
            }));
            
            const revalidatePrompt = `你是一日遊行程排序專家。請根據地點資訊安排最佳順序。

地點列表：
${updatedPlacesInfo.map(p => `${p.idx}. ${p.name}｜${p.category}/${p.subcategory}｜${p.description || '無描述'}｜營業:${p.hours}`).join('\n')}

排序規則（依優先順序）：
1. 時段邏輯：早餐/咖啡廳→上午景點→午餐→下午活動→晚餐/夜市→宵夜/酒吧→住宿（住宿必須最後）
2. 地理動線：減少迂迴，鄰近地點連續安排
3. 類別穿插：避免連續3個同類（夜市內美食除外）
4. 排除不適合：永久歇業、非旅遊點、同園區重複景點（保留代表性最高者）

【輸出格式】只輸出一行 JSON（不要換行、不要 markdown）：
{"order":[3,1,5,2,4],"reason":"早餐先逛景點","reject":[]}`;
            
            const revalidateResponse = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey || ''
              },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: revalidatePrompt }] }],
                generationConfig: { 
                  maxOutputTokens: 500, 
                  temperature: 0.1
                }
              })
            });
            
            const revalidateData = await revalidateResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
            const revalidateText = revalidateData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            console.log('[Gacha V3] AI Revalidate response (Gemini 3):', revalidateText);
            
            if (revalidateText) {
              try {
                // 去除 markdown code block 包裝
                let jsonText = revalidateText;
                if (jsonText.startsWith('```')) {
                  jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
                }
                
                const revalidateResult = JSON.parse(jsonText) as { order?: number[]; reason?: string; reject?: number[] };
                console.log('[Gacha V3] Revalidate Parsed:', { order: revalidateResult.order, reason: revalidateResult.reason, reject: revalidateResult.reject });
                
                // 處理被拒絕的地點（這次不再補充，避免無限循環）
                const newRejectedIds: number[] = [];
                if (revalidateResult.reject && Array.isArray(revalidateResult.reject)) {
                  for (const idx of revalidateResult.reject) {
                    if (idx >= 1 && idx <= finalPlaces.length) {
                      newRejectedIds.push(finalPlaces[idx - 1].id);
                    }
                  }
                  if (newRejectedIds.length > 0) {
                    console.log('[Gacha V3] Revalidate rejected:', newRejectedIds.length);
                  }
                }
                
                // 處理排序
                if (revalidateResult.order && Array.isArray(revalidateResult.order) && revalidateResult.order.length > 0) {
                  const validOrder = revalidateResult.order
                    .filter(n => typeof n === 'number' && n >= 1 && n <= finalPlaces.length)
                    .filter(n => !newRejectedIds.includes(finalPlaces[n - 1]?.id));
                  const uniqueNewOrder = Array.from(new Set(validOrder));
                  
                  if (uniqueNewOrder.length >= 2) {
                    const revalidatedPlaces = uniqueNewOrder.map(idx => finalPlaces[idx - 1]).filter(p => p);
                    
                    // 補全遺漏的地點
                    const revalidatedIds = new Set(revalidatedPlaces.map(p => p.id));
                    const stillMissing = finalPlaces.filter(p => 
                      !revalidatedIds.has(p.id) && !newRejectedIds.includes(p.id)
                    );
                    if (stillMissing.length > 0) {
                      revalidatedPlaces.push(...stillMissing);
                    }
                    
                    finalPlaces = revalidatedPlaces;
                    aiReorderResult = 'revalidated';
                    console.log('[Gacha V3] Revalidated, reason:', revalidateResult.reason || 'N/A');
                  }
                }
              } catch (parseError) {
                console.error('[Gacha V3] Revalidate JSON parse failed:', parseError);
              }
            }
          } catch (revalidateError) {
            console.error('[Gacha V3] AI revalidate failed:', revalidateError);
          }
        }
      }
      
      // ========== 安全網：確保住宿永遠排最後 ==========
      // 即使 AI 沒有正確排序，也保證住宿在最後
      const stayPlacesInFinal = finalPlaces.filter(p => p.category === '住宿');
      const nonStayPlacesInFinal = finalPlaces.filter(p => p.category !== '住宿');
      if (stayPlacesInFinal.length > 0) {
        const lastPlace = finalPlaces[finalPlaces.length - 1];
        if (lastPlace.category !== '住宿') {
          finalPlaces = [...nonStayPlacesInFinal, ...stayPlacesInFinal];
          console.log('[Gacha V3] Safety net: moved stay to end');
        }
      }

      const itinerary: Array<{
        id: number;
        placeName: string;
        category: string;
        categoryCode: string;
        subCategory?: string | null;
        description?: string | null;
        address?: string | null;
        rating?: number | null;
        locationLat?: number | null;
        locationLng?: number | null;
        googlePlaceId?: string | null;
        timeSlot: string;
        colorHex: string;
        isCoupon: boolean;
        couponData?: { id: number; title: string; code: string; terms?: string | null } | null;
        rarity?: string | null;
        place?: any;
        couponWon?: any;
      }> = [];
      
      const couponsWon: Array<{ couponId: number; placeId: number; placeName: string; title: string; code: string; terms?: string | null }> = [];
      
      // 時段分配：使用智慧推斷取代 modulo 循環
      // 映射到舊的標籤名稱以保持向下相容
      const timeSlotLabelMap: Record<TimeSlot, string> = {
        morning: 'breakfast',   // 早上 → breakfast（早餐時段）
        noon: 'lunch',          // 中午 → lunch（午餐時段）
        afternoon: 'afternoon', // 下午 → afternoon
        evening: 'dinner',      // 晚上 → dinner（晚餐時段）
        night: 'evening',       // 深夜 → evening（晚間活動）
        flexible: 'afternoon'   // 彈性 → afternoon（預設下午）
      };
      
      for (let i = 0; i < finalPlaces.length; i++) {
        const place = finalPlaces[i];
        const inferredSlot = inferTimeSlot(place);
        const timeSlot = timeSlotLabelMap[inferredSlot.slot];
        
        let couponWon = null;
        const claimInfo = await storage.getClaimByOfficialPlaceId(place.id);
        
        if (claimInfo) {
          const dropRate = claimInfo.claim.couponDropRate ?? 0.1;
          if (Math.random() < dropRate && claimInfo.coupons.length > 0) {
            const randomIdx = Math.floor(Math.random() * claimInfo.coupons.length);
            const wonCoupon = claimInfo.coupons[randomIdx];
            couponWon = { id: wonCoupon.id, title: wonCoupon.title, code: wonCoupon.code, terms: wonCoupon.terms };
            couponsWon.push({ couponId: wonCoupon.id, placeId: place.id, placeName: place.placeName, title: wonCoupon.title, code: wonCoupon.code, terms: wonCoupon.terms });
            if (userId !== 'guest') {
              await storage.saveToCollectionWithCoupon(userId, place, wonCoupon);
            }
          } else {
            if (userId !== 'guest') {
              await storage.saveToCollectionWithCoupon(userId, place);
            }
          }
        } else {
          if (userId !== 'guest') {
            await storage.saveToCollectionWithCoupon(userId, place);
          }
        }

        // Category 中文 → 英文 code 映射（資料庫現在存中文八大類）
        const categoryCodeMap: Record<string, string> = {
          '美食': 'food', '住宿': 'stay', '生態文化教育': 'education',
          '遊程體驗': 'experience', '娛樂設施': 'entertainment', '景點': 'scenery', '購物': 'shopping',
          '活動': 'activity'
        };
        // 顏色映射（使用英文 code）
        const categoryColorMap: Record<string, string> = {
          'food': '#FF6B6B', 'stay': '#4ECDC4', 'education': '#45B7D1',
          'activity': '#96CEB4', 'entertainment': '#FFEAA7', 'scenery': '#DDA0DD', 'shopping': '#FFB347',
          'experience': '#96CEB4'
        };
        const categoryCode = categoryCodeMap[place.category] || place.category.toLowerCase();
        const colorHex = categoryColorMap[categoryCode] || '#6366f1';
        
        // 同時提供攤平格式和巢狀格式，確保向下相容
        const localizedDesc = getLocalizedDescription(place, language);
        itinerary.push({
          id: place.id,
          placeName: place.placeName,
          category: place.category,
          categoryCode: categoryCode,
          subCategory: place.subcategory,
          description: localizedDesc,
          address: place.address,
          rating: place.rating,
          locationLat: place.locationLat,
          locationLng: place.locationLng,
          googlePlaceId: place.googlePlaceId,
          timeSlot,
          colorHex,
          isCoupon: !!couponWon,
          couponData: couponWon,
          rarity: couponWon ? 'SR' : null,
          place: {
            id: place.id,
            placeName: place.placeName,
            category: place.category,
            categoryCode: categoryCode,
            subcategory: place.subcategory,
            description: localizedDesc,
            address: place.address,
            rating: place.rating,
            locationLat: place.locationLat,
            locationLng: place.locationLng,
            googlePlaceId: place.googlePlaceId,
          },
          couponWon,
        });
      }

      // 計算類別統計
      const categoryStats: Record<string, number> = {};
      for (const p of finalPlaces) {
        const cat = p.category || '其他';
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
      }
      
      // ========== Step 4: 主題介紹（已關閉 AI 生成以節省費用）==========
      const themeIntro = null;
      
      // 記錄 guest 用戶的去重資料（30 分鐘 TTL）
      if (userId === 'guest') {
        const drawnIds = itinerary.map(p => p.id);
        const existingDedup = guestSessionDedup.get(sessionKey);
        const existingIds = existingDedup?.placeIds || [];
        const newIds = [...existingIds, ...drawnIds].slice(-GACHA_DEDUP_LIMIT); // 只保留最近 36 個
        guestSessionDedup.set(sessionKey, { placeIds: newIds, timestamp: Date.now() });
        console.log('[Gacha V3] Guest dedup recorded:', newIds.length, 'places');
      }
      
      // 成功後遞增每日抽卡計數
      let newDailyCount = 0;
      let remainingQuota = DAILY_PULL_LIMIT;
      if (userId !== 'guest') {
        newDailyCount = await storage.incrementUserDailyGachaCount(userId, itinerary.length);
        remainingQuota = DAILY_PULL_LIMIT - newDailyCount;
      }
      
      // ========== 張數不足提示 ==========
      const isShortfall = itinerary.length < targetCount;
      const shortfallMessage = isShortfall 
        ? `${anchorDistrict || city}目前只有 ${itinerary.length} 個景點，我們正在努力擴充中！`
        : null;
      
      res.json({
        success: true,
        targetDistrict: anchorDistrict || city,
        city,
        country: '台灣',
        themeIntro,
        itinerary,
        couponsWon,
        meta: {
          city,
          anchorDistrict,
          pace,
          requestedCount: targetCount,
          totalPlaces: itinerary.length,
          isShortfall,
          shortfallMessage,
          totalCouponsWon: couponsWon.length,
          categoryDistribution: categoryStats,
          sortingMethod: aiReorderResult === 'reordered' ? 'ai_reordered' : 'coordinate',
          aiReorderResult,
          dailyLimit: DAILY_PULL_LIMIT,
          dailyPullCount: newDailyCount,
          remainingQuota
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
      console.log("[ClaimAPI] Request body:", JSON.stringify(req.body));
      
      const userId = req.user?.claims?.sub;
      if (!userId) {
        console.log("[ClaimAPI] No userId found");
        return res.status(401).json({ error: "Authentication required" });
      }
      console.log("[ClaimAPI] userId:", userId);

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        console.log("[ClaimAPI] No merchant found for userId:", userId);
        return res.status(403).json({ error: "You must be a registered merchant to claim places" });
      }
      console.log("[ClaimAPI] merchant:", merchant.id, merchant.businessName);

      let { placeName, district, city, country, placeCacheId, googlePlaceId } = req.body;
      console.log("[ClaimAPI] Parsed fields:", { placeName, district, city, country, placeCacheId, googlePlaceId });
      
      // Handle case where placeCacheId is actually a Google Place ID string (starts with "ChIJ")
      if (placeCacheId && typeof placeCacheId === 'string' && placeCacheId.startsWith('ChIJ')) {
        console.log("[ClaimAPI] Detected Google Place ID in placeCacheId field, moving to googlePlaceId");
        googlePlaceId = placeCacheId;
        placeCacheId = null;
      }
      
      // Ensure placeCacheId is a number if provided
      if (placeCacheId && typeof placeCacheId === 'string') {
        const parsed = parseInt(placeCacheId, 10);
        placeCacheId = isNaN(parsed) ? null : parsed;
      }
      
      if (!placeName || !district || !city || !country) {
        console.log("[ClaimAPI] Missing fields:", { placeName: !!placeName, district: !!district, city: !!city, country: !!country });
        return res.status(400).json({ error: "Missing required fields", details: { placeName: !!placeName, district: !!district, city: !!city, country: !!country } });
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
        console.log("[ClaimAPI] Place already claimed:", existingLink.id);
        return res.status(409).json({ error: "This place is already claimed by another merchant" });
      }

      console.log("[ClaimAPI] Creating link with:", { merchantId: merchant.id, placeCacheId, googlePlaceId, placeName, district, city, country });
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

      console.log("[ClaimAPI] Link created:", link.id);
      res.json({ success: true, link });
    } catch (error: any) {
      console.error("[ClaimAPI] Error:", error.message, error.stack);
      res.status(500).json({ error: "Failed to claim place", details: error.message });
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

  // ============ Merchant Daily Code & Credits Routes ============
  
  // GET /api/merchant/daily-code - Get or generate daily verification code
  app.get("/api/merchant/daily-code", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
      }

      const existingCode = await storage.getMerchantDailySeedCode(merchant.id);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Check if code exists and was updated today
      if (existingCode && existingCode.updatedAt) {
        const codeDate = new Date(existingCode.updatedAt);
        codeDate.setHours(0, 0, 0, 0);
        
        if (codeDate.getTime() === today.getTime()) {
          return res.json({ 
            seedCode: existingCode.seedCode,
            updatedAt: existingCode.updatedAt,
            expiresAt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          });
        }
      }

      // Generate new daily code
      const newCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      const updated = await storage.updateMerchantDailySeedCode(merchant.id, newCode);
      
      res.json({
        seedCode: newCode,
        updatedAt: updated?.codeUpdatedAt || new Date(),
        expiresAt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      console.error("Get daily code error:", error);
      res.status(500).json({ error: "取得核銷碼失敗", code: "SERVER_ERROR" });
    }
  });

  // POST /api/merchant/verify - Verify a daily code
  app.post("/api/merchant/verify", async (req, res) => {
    try {
      const verifySchema = z.object({
        merchantId: z.number(),
        code: z.string().min(1),
      });
      
      const validated = verifySchema.parse(req.body);
      
      const merchant = await storage.getMerchantById(validated.merchantId);
      if (!merchant) {
        return res.status(404).json({ ...createErrorResponse(ErrorCode.MERCHANT_NOT_FOUND), valid: false });
      }

      const existingCode = await storage.getMerchantDailySeedCode(merchant.id);
      if (!existingCode) {
        return res.status(400).json({ ...createErrorResponse(ErrorCode.NO_CODE_SET), valid: false });
      }

      // Check if code is expired (not from today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const codeDate = new Date(existingCode.updatedAt);
      codeDate.setHours(0, 0, 0, 0);
      
      if (codeDate.getTime() !== today.getTime()) {
        return res.status(400).json({ ...createErrorResponse(ErrorCode.CODE_EXPIRED), valid: false });
      }

      // Verify the code
      const isValid = existingCode.seedCode.toUpperCase() === validated.code.toUpperCase();
      
      if (isValid) {
        res.json({ 
          valid: true, 
          merchantName: merchant.name,
          message: "核銷碼驗證成功" 
        });
      } else {
        res.status(400).json({ 
          error: "核銷碼錯誤", 
          code: "INVALID_CODE", 
          valid: false 
        });
      }
    } catch (error: any) {
      console.error("Verify code error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "輸入資料格式錯誤", code: "VALIDATION_ERROR", valid: false });
      }
      res.status(500).json({ error: "驗證失敗", code: "SERVER_ERROR", valid: false });
    }
  });

  // POST /api/merchant/credits/purchase - Purchase credits with dual payment support
  app.post("/api/merchant/credits/purchase", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
      }

      const purchaseSchema = z.object({
        amount: z.number().min(100).max(100000), // Credits to purchase
        provider: z.enum(['stripe', 'recur']),
        successUrl: z.string().url().optional(),
        cancelUrl: z.string().url().optional(),
      });

      const validated = purchaseSchema.parse(req.body);
      
      // Calculate price (1 TWD = 1 credit for simplicity)
      const price = validated.amount;

      if (validated.provider === 'stripe') {
        // Stripe payment flow
        const { stripeService } = await import('./stripeService');
        const { getStripePublishableKey } = await import('./stripeClient');
        
        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.REPLIT_DOMAINS?.split(',')[0] 
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
            : 'https://localhost:5000';

        const successUrl = validated.successUrl || `${baseUrl}/merchant/credits/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = validated.cancelUrl || `${baseUrl}/merchant/credits`;

        // Create a transaction record
        const transaction = await storage.createTransaction({
          merchantId: merchant.id,
          amount: validated.amount,
          price: price,
          provider: 'stripe',
          paymentStatus: 'pending',
          paymentMethod: 'stripe_checkout',
        });

        // Create Stripe payment intent
        const paymentIntent = await stripeService.createPaymentIntent(
          price * 100, // Stripe uses cents
          'twd',
          merchant.userId,
          { 
            transactionId: transaction.id.toString(),
            merchantId: merchant.id.toString(),
            credits: validated.amount.toString(),
          }
        );

        res.json({
          provider: 'stripe',
          transactionId: transaction.id,
          clientSecret: paymentIntent.client_secret,
          publishableKey: await getStripePublishableKey(),
          amount: validated.amount,
          price: price,
        });
      } else if (validated.provider === 'recur') {
        // Recur payment flow - placeholder for actual Recur integration
        // Create a transaction record
        const transaction = await storage.createTransaction({
          merchantId: merchant.id,
          amount: validated.amount,
          price: price,
          provider: 'recur',
          paymentStatus: 'pending',
          paymentMethod: 'recur_pay',
        });

        // TODO: Integrate with Recur Helper function when available
        // For now, return the transaction details for frontend to handle
        res.json({
          provider: 'recur',
          transactionId: transaction.id,
          amount: validated.amount,
          price: price,
          message: "請使用 Recur 支付介面完成付款",
          // recurPaymentUrl would be generated here when Recur is integrated
        });
      }
    } catch (error: any) {
      console.error("Purchase credits error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "輸入資料格式錯誤", code: "VALIDATION_ERROR" });
      }
      res.status(500).json({ error: "購買失敗", code: "SERVER_ERROR" });
    }
  });

  // POST /api/merchant/credits/confirm - Confirm payment and add credits
  app.post("/api/merchant/credits/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "商家帳號必要" });
      }

      const { transactionId, externalOrderId } = req.body;
      
      const transaction = await storage.getTransactionById(transactionId);
      if (!transaction || transaction.merchantId !== merchant.id) {
        return res.status(404).json({ error: "交易不存在" });
      }

      if (transaction.paymentStatus === 'paid') {
        return res.status(400).json({ error: "此交易已完成" });
      }

      // Update transaction status
      await storage.updateTransactionStatus(transactionId, 'paid');
      
      // Add credits to merchant
      await storage.updateMerchantCreditBalance(merchant.id, transaction.amount);

      res.json({
        success: true,
        creditsAdded: transaction.amount,
        newBalance: (merchant.creditBalance || 0) + transaction.amount,
      });
    } catch (error) {
      console.error("Confirm credits error:", error);
      res.status(500).json({ error: "確認付款失敗" });
    }
  });

  // ============ Specialist Auto-Matching Routes ============
  
  // POST /api/specialist/match - Auto-match traveler with available specialist
  app.post("/api/specialist/match", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
      }

      const matchSchema = z.object({
        region: z.string().min(1),
      });

      const validated = matchSchema.parse(req.body);
      
      // Check if traveler already has an active service
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

      // Find available specialist in the region
      const specialist = await storage.findAvailableSpecialist(validated.region);
      
      if (!specialist) {
        return res.status(404).json({ 
          error: `目前 ${validated.region} 地區沒有可用的專員，請稍後再試`, 
          code: "NO_SPECIALIST_AVAILABLE",
          matched: false,
        });
      }

      // Create service relation
      const serviceRelation = await storage.createServiceRelation({
        specialistId: specialist.id,
        travelerId: userId,
        region: validated.region,
        status: 'active',
      });

      // Update specialist's current traveler count
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
        return res.status(400).json({ error: "輸入資料格式錯誤", code: "VALIDATION_ERROR" });
      }
      res.status(500).json({ error: "媒合失敗", code: "SERVER_ERROR" });
    }
  });

  // POST /api/specialist/service/:serviceId/end - End a service relation
  app.post("/api/specialist/service/:serviceId/end", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const serviceId = parseInt(req.params.serviceId);
      const { rating } = req.body;

      const service = await storage.getServiceRelationById(serviceId);
      if (!service) {
        return res.status(404).json({ error: "服務不存在" });
      }

      // Verify user is part of this service
      const specialist = await storage.getSpecialistByUserId(userId);
      const isSpecialist = specialist && specialist.id === service.specialistId;
      const isTraveler = service.travelerId === userId;

      if (!isSpecialist && !isTraveler) {
        return res.status(403).json({ error: "無權限結束此服務" });
      }

      // End the service
      const endedService = await storage.endServiceRelation(serviceId, rating);

      // Decrease specialist's current traveler count
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
      res.status(500).json({ error: "結束服務失敗" });
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
              category: category?.code || '',
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
        category: category?.code || '',
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

  // 管理員：篩選草稿地點（支援星級/評論數篩選）
  app.get("/api/admin/place-drafts/filter", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const minRating = req.query.minRating ? parseFloat(req.query.minRating) : undefined;
      const minReviewCount = req.query.minReviewCount ? parseInt(req.query.minReviewCount) : undefined;
      const status = req.query.status || 'pending';

      const drafts = await storage.getFilteredPlaceDrafts({ minRating, minReviewCount, status });
      
      res.json({ 
        drafts,
        filters: { minRating, minReviewCount, status },
        count: drafts.length
      });
    } catch (error) {
      console.error("Admin filter place drafts error:", error);
      res.status(500).json({ error: "Failed to filter place drafts" });
    }
  });

  // 管理員：一鍵批次發布（支援篩選條件）
  app.post("/api/admin/place-drafts/batch-publish", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const batchPublishSchema = z.object({
        minRating: z.number().min(0).max(5).optional(),
        minReviewCount: z.number().min(0).optional(),
        ids: z.array(z.number()).optional(), // 可選：指定 ID 列表
      });

      const validated = batchPublishSchema.parse(req.body);
      
      // 取得符合條件的草稿
      let draftsToPublish;
      if (validated.ids && validated.ids.length > 0) {
        // 使用指定的 ID 列表
        const allDrafts = await storage.getFilteredPlaceDrafts({ status: 'pending' });
        draftsToPublish = allDrafts.filter(d => validated.ids!.includes(d.id));
      } else {
        // 使用篩選條件
        draftsToPublish = await storage.getFilteredPlaceDrafts({
          minRating: validated.minRating,
          minReviewCount: validated.minReviewCount,
          status: 'pending'
        });
      }

      if (draftsToPublish.length === 0) {
        return res.json({ success: true, published: 0, message: "No drafts match the criteria" });
      }

      const categories = await storage.getCategories();
      const publishedIds: number[] = [];
      const errors: Array<{ id: number; placeName: string; error: string }> = [];

      for (const draft of draftsToPublish) {
        try {
          const districtInfo = await storage.getDistrictWithParents(draft.districtId);
          if (!districtInfo) {
            errors.push({ id: draft.id, placeName: draft.placeName, error: "Invalid district" });
            continue;
          }

          const category = categories.find(c => c.id === draft.categoryId);
          const subcategories = await storage.getSubcategoriesByCategory(draft.categoryId);
          const subcategory = subcategories.find(s => s.id === draft.subcategoryId);

          await storage.savePlaceToCache({
            placeName: draft.placeName,
            description: draft.description || '',
            category: category?.code || '',
            subCategory: subcategory?.nameZh || '',
            district: districtInfo.district.nameZh,
            city: districtInfo.region.nameZh,
            country: districtInfo.country.nameZh,
            placeId: draft.googlePlaceId || undefined,
            locationLat: draft.locationLat || undefined,
            locationLng: draft.locationLng || undefined,
            verifiedAddress: draft.address || undefined,
          });

          publishedIds.push(draft.id);
        } catch (e: any) {
          errors.push({ id: draft.id, placeName: draft.placeName, error: e.message });
        }
      }

      // 批次刪除已發布的草稿
      if (publishedIds.length > 0) {
        await storage.batchDeletePlaceDrafts(publishedIds);
      }

      res.json({
        success: true,
        published: publishedIds.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully published ${publishedIds.length} places`
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Admin batch publish error:", error);
      res.status(500).json({ error: "Failed to batch publish" });
    }
  });

  // 管理員：批次 AI 重新生成描述
  app.post("/api/admin/place-drafts/batch-regenerate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const { ids, filter } = req.body as {
        ids?: number[];
        filter?: { minRating?: number; minReviewCount?: number };
      };

      let draftsToRegenerate: PlaceDraft[] = [];

      if (ids && ids.length > 0) {
        const allDrafts = await storage.getAllPlaceDrafts();
        draftsToRegenerate = allDrafts.filter(d => ids.includes(d.id) && d.status === 'pending');
      } else if (filter) {
        draftsToRegenerate = await storage.getFilteredPlaceDrafts({
          ...filter,
          status: 'pending'
        });
      } else {
        return res.status(400).json({ error: "必須提供 ids 或 filter 參數" });
      }

      if (draftsToRegenerate.length === 0) {
        return res.json({ success: true, regenerated: 0, failed: 0, message: "沒有符合條件的草稿" });
      }

      // 預載分類和地區資料以提高效率
      const categories = await storage.getCategories();
      const allSubcategories: Map<number, Subcategory[]> = new Map();

      const regeneratedIds: number[] = [];
      const errors: { id: number; placeName: string; error: string }[] = [];

      for (const draft of draftsToRegenerate) {
        try {
          // 取得地區資訊
          const districtInfo = await storage.getDistrictWithParents(draft.districtId);
          const category = categories.find(c => c.id === draft.categoryId);
          
          // 快取子分類
          if (!allSubcategories.has(draft.categoryId)) {
            const subs = await storage.getSubcategoriesByCategory(draft.categoryId);
            allSubcategories.set(draft.categoryId, subs);
          }
          const subcategory = allSubcategories.get(draft.categoryId)?.find(s => s.id === draft.subcategoryId);

          // 使用更詳細的 prompt 生成更好的描述
          const prompt = `你是一位資深的旅遊作家和行銷專家。請為以下景點撰寫一段精彩、生動、吸引人的介紹文字。

景點名稱：${draft.placeName}
類別：${category?.nameZh || ''} / ${subcategory?.nameZh || ''}
地區：${districtInfo?.country?.nameZh || ''} ${districtInfo?.region?.nameZh || ''} ${districtInfo?.district?.nameZh || ''}
${draft.address ? `地址：${draft.address}` : ''}
${draft.googleRating ? `Google評分：${draft.googleRating}星` : ''}

撰寫要求：
1. 字數：80-120字（繁體中文）
2. 風格：生動活潑，富有感染力
3. 內容：突出景點特色、獨特體驗、推薦理由
4. 語氣：像是當地人熱情推薦給好友的口吻
5. 避免：空洞的形容詞堆砌，要有具體的描述

請直接輸出介紹文字，不需要標題或其他格式。`;

          const newDescription = await callGemini(prompt);
          const cleanDescription = newDescription.trim();

          await storage.updatePlaceDraft(draft.id, { description: cleanDescription });
          regeneratedIds.push(draft.id);
          
          console.log(`[BatchRegenerate] Regenerated description for: ${draft.placeName}`);
        } catch (e: any) {
          console.error(`[BatchRegenerate] Failed for ${draft.placeName}:`, e.message);
          errors.push({ id: draft.id, placeName: draft.placeName, error: e.message });
        }
      }

      res.json({
        success: true,
        regenerated: regeneratedIds.length,
        failed: errors.length,
        regeneratedIds,
        errors: errors.length > 0 ? errors : undefined,
        message: `成功重新生成 ${regeneratedIds.length} 筆描述`
      });
    } catch (error) {
      console.error("Admin batch regenerate error:", error);
      res.status(500).json({ error: "批次重新生成失敗" });
    }
  });

  // 管理員：回填現有草稿的 Google 評論數
  app.post("/api/admin/place-drafts/backfill-review-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const { limit = 50 } = req.body as { limit?: number };

      // 取得沒有評論數的待審核草稿
      const allDrafts = await storage.getAllPlaceDrafts();
      const draftsToUpdate = allDrafts.filter(d => 
        d.status === 'pending' && 
        d.googleReviewCount === null && 
        d.googlePlaceId
      ).slice(0, limit);

      if (draftsToUpdate.length === 0) {
        return res.json({ success: true, updated: 0, failed: 0, message: "沒有需要回填的草稿" });
      }

      const updatedIds: number[] = [];
      const errors: { id: number; placeName: string; error: string }[] = [];

      for (const draft of draftsToUpdate) {
        try {
          // 使用 Place Details API 取得評論數
          const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
          if (!GOOGLE_MAPS_API_KEY) {
            throw new Error("GOOGLE_MAPS_API_KEY not configured");
          }

          const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${draft.googlePlaceId}&fields=user_ratings_total,rating&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
          const response = await fetch(url);
          const data = await response.json();

          if (data.status === 'OK' && data.result) {
            const updateData: any = {};
            if (data.result.user_ratings_total !== undefined) {
              updateData.googleReviewCount = data.result.user_ratings_total;
            }
            if (data.result.rating !== undefined && draft.googleRating === null) {
              updateData.googleRating = data.result.rating;
            }

            if (Object.keys(updateData).length > 0) {
              await storage.updatePlaceDraft(draft.id, updateData);
              updatedIds.push(draft.id);
              console.log(`[BackfillReviewCount] Updated ${draft.placeName}: reviewCount=${updateData.googleReviewCount}`);
            }
          } else {
            console.log(`[BackfillReviewCount] No data for ${draft.placeName}: ${data.status}`);
          }

          // 避免 API 速率限制
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e: any) {
          console.error(`[BackfillReviewCount] Failed for ${draft.placeName}:`, e.message);
          errors.push({ id: draft.id, placeName: draft.placeName, error: e.message });
        }
      }

      res.json({
        success: true,
        updated: updatedIds.length,
        failed: errors.length,
        remaining: allDrafts.filter(d => d.status === 'pending' && d.googleReviewCount === null && d.googlePlaceId).length - updatedIds.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `成功回填 ${updatedIds.length} 筆評論數`
      });
    } catch (error) {
      console.error("Admin backfill review count error:", error);
      res.status(500).json({ error: "回填評論數失敗" });
    }
  });

  // ============ 批次生成地點 API (SSE 串流進度) ============
  // 管理員：批次採集地點（AI 關鍵字擴散 + 分頁 + 去重 + AI 自動分類）
  app.post("/api/admin/places/batch-generate", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

    const { 
      keyword = '', 
      regionId,
      districtId = null, 
      categoryId = null,
      maxKeywords: rawMaxKeywords = 8,
      maxPagesPerKeyword: rawMaxPages = 3,
      enableAIExpansion = true,
      saveToDrafts = true,
      useSSE = false
    } = req.body;

    const maxKeywords = Math.min(Math.max(1, rawMaxKeywords), 10);
    const maxPagesPerKeyword = Math.min(Math.max(1, rawMaxPages), 3);

    // regionId 必填
    if (!regionId) {
      return res.status(400).json({ error: "regionId 為必填" });
    }

    // 取得城市資訊
    const regionData = await storage.getRegionById(regionId);
    if (!regionData) {
      return res.status(400).json({ error: "無效的 regionId" });
    }

    // 取得國家資訊
    const countryData = await storage.getCountryById(regionData.countryId);
    if (!countryData) {
      return res.status(400).json({ error: "無效的國家" });
    }

    // 如果有指定鄉鎮區
    let districtName = '';
    if (districtId) {
      const districtInfo = await storage.getDistrictWithParents(districtId);
      if (districtInfo) {
        districtName = districtInfo.district.nameZh;
      }
    }

    // 取得八大種類
    const allCategories = await storage.getCategories();
    
    // 決定使用的種類（選擇或隨機）
    let selectedCategory = categoryId 
      ? allCategories.find(c => c.id === categoryId) 
      : allCategories[Math.floor(Math.random() * allCategories.length)];
    
    // 組合搜尋關鍵字
    let searchKeyword = keyword.trim();
    if (!searchKeyword && selectedCategory) {
      // 沒有關鍵字時，使用種類名稱作為基礎關鍵字
      searchKeyword = selectedCategory.nameZh;
    } else if (searchKeyword && selectedCategory) {
      // 同時有關鍵字和種類，組合使用
      searchKeyword = `${selectedCategory.nameZh}-${searchKeyword}`;
    }

    const cityName = regionData.nameZh;
    const countryName = countryData.nameZh;

    // SSE 模式：串流回傳進度
    if (useSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const sendProgress = (stage: string, current: number, total: number, message: string) => {
        res.write(`data: ${JSON.stringify({ stage, current, total, message })}\n\n`);
      };

      try {
        // 階段 1: 關鍵字擴散
        sendProgress('expanding_keywords', 0, 1, `正在擴散關鍵字... (種類: ${selectedCategory?.nameZh || '隨機'})`);
        
        const result = await batchGeneratePlaces(
          searchKeyword,
          districtName || cityName,
          cityName,
          { maxKeywords, maxPagesPerKeyword, enableAIExpansion }
        );

        sendProgress('searching_google', result.stats.keywords.length, result.stats.keywords.length, 
          `搜尋完成，找到 ${result.places.length} 個地點`);

        // 階段 2: 過濾去重
        sendProgress('filtering_results', 0, 1, '正在過濾與去重...');

        let savedCount = 0;
        let skippedCount = 0;
        const savedPlaces: any[] = [];

        if (saveToDrafts && result.places.length > 0) {
          const existingCache = await storage.getCachedPlaces(districtName || cityName, cityName, countryName);
          const existingCachePlaceIds = new Set(existingCache.map(c => c.placeId).filter(Boolean));
          const existingPlaces = await storage.getOfficialPlacesByCity(cityName, 1000);
          const existingPlacePlaceIds = new Set(existingPlaces.map(p => p.googlePlaceId).filter(Boolean));

          const placesToProcess = result.places.filter(place => 
            !existingCachePlaceIds.has(place.placeId) && !existingPlacePlaceIds.has(place.placeId)
          );
          skippedCount = result.places.length - placesToProcess.length;

          sendProgress('filtering_results', 1, 1, `需處理 ${placesToProcess.length} 筆，跳過 ${skippedCount} 筆重複`);

          // 階段 3: 規則映射分類 + AI 生成描述
          const CHUNK_SIZE = 15;
          const DELAY_BETWEEN_CHUNKS = 2000;
          const totalChunks = Math.ceil(placesToProcess.length / CHUNK_SIZE);
          
          for (let i = 0; i < placesToProcess.length; i += CHUNK_SIZE) {
            const chunk = placesToProcess.slice(i, i + CHUNK_SIZE);
            const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
            
            sendProgress('generating_descriptions', chunkNum, totalChunks, 
              `規則映射分類 + AI 生成描述 (批次 ${chunkNum}/${totalChunks})...`);
            
            // 使用新的規則映射 + AI 描述函數
            const classificationMap = await classifyAndDescribePlaces(chunk, cityName);
            
            // 階段 4: 儲存（含自動新增子分類）
            sendProgress('saving_places', savedCount, placesToProcess.length, 
              `正在儲存地點 (${savedCount}/${placesToProcess.length})...`);

            for (const place of chunk) {
              try {
                const classification = classificationMap.get(place.name);
                const classResult = classification || {
                  name: place.name,
                  category: determineCategory(place.primaryType, place.types),
                  subcategory: determineSubcategory(place.primaryType, place.types),
                  description: generateFallbackDescription(place.name, determineCategory(place.primaryType, place.types), determineSubcategory(place.primaryType, place.types), cityName),
                  descriptionSource: 'fallback' as const
                };

                // 根據規則判斷的種類找到對應的 category
                const matchedCategory = allCategories.find(c => c.nameZh === classResult.category) || selectedCategory;
                
                // 檢查子分類是否存在，不存在則新增
                let subcategoryName = classResult.subcategory;
                if (matchedCategory) {
                  const existingSubcategories = await storage.getSubcategoriesByCategory(matchedCategory.id);
                  const existingSubcategory = existingSubcategories.find(s => s.nameZh === classResult.subcategory);
                  
                  if (!existingSubcategory && classResult.subcategory) {
                    // 子分類不存在時，記錄 log（手動新增即可）
                    console.log(`[BatchGenerate] 子分類不存在: ${classResult.subcategory} (${matchedCategory.nameZh})`);
                  }
                }

                const cached = await storage.savePlaceToCache({
                  subCategory: subcategoryName,
                  district: districtName || cityName,
                  city: cityName,
                  country: countryName,
                  placeName: place.name,
                  description: classResult.description,
                  category: classResult.category,
                  suggestedTime: null,
                  duration: null,
                  searchQuery: searchKeyword,
                  rarity: null,
                  colorHex: null,
                  placeId: place.placeId,
                  verifiedName: place.name,
                  verifiedAddress: place.address,
                  googleRating: place.rating?.toString() || null,
                  googleTypes: place.types?.join(',') || null,
                  primaryType: place.primaryType || null,
                  locationLat: place.location?.lat?.toString() || null,
                  locationLng: place.location?.lng?.toString() || null,
                  isLocationVerified: true,
                  businessStatus: place.businessStatus || null,
                  lastVerifiedAt: new Date(),
                  aiReviewed: false,
                  aiReviewedAt: null
                });

                existingCachePlaceIds.add(place.placeId);
                savedPlaces.push({ id: cached.id, placeName: cached.placeName, placeId: cached.placeId });
                savedCount++;
              } catch (e: any) {
                console.error(`[BatchGenerate] Failed to save ${place.name}:`, e.message);
              }
            }
            
            if (i + CHUNK_SIZE < placesToProcess.length) {
              await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
            }
          }
        }

        // 完成
        sendProgress('complete', savedCount, savedCount, `完成！儲存 ${savedCount} 筆`);
        res.write(`data: ${JSON.stringify({ 
          stage: 'done', 
          success: true,
          saved: savedCount, 
          skipped: skippedCount, 
          total: result.places.length 
        })}\n\n`);
        res.end();
      } catch (error: any) {
        res.write(`data: ${JSON.stringify({ stage: 'error', error: error.message })}\n\n`);
        res.end();
      }
      return;
    }

    // 非 SSE 模式：傳統 JSON 回傳
    try {
      console.log(`[BatchGenerate] Admin ${userId} generating for: ${cityName}${districtName}, keyword: ${searchKeyword}`);

      const result = await batchGeneratePlaces(
        searchKeyword,
        districtName || cityName,
        cityName,
        { maxKeywords, maxPagesPerKeyword, enableAIExpansion }
      );

      let savedCount = 0;
      let skippedCount = 0;
      const savedPlaces: any[] = [];

      if (saveToDrafts && result.places.length > 0) {
        const existingCache = await storage.getCachedPlaces(districtName || cityName, cityName, countryName);
        const existingCachePlaceIds = new Set(existingCache.map(c => c.placeId).filter(Boolean));
        const existingPlaces = await storage.getOfficialPlacesByCity(cityName, 1000);
        const existingPlacePlaceIds = new Set(existingPlaces.map(p => p.googlePlaceId).filter(Boolean));

        const placesToProcess = result.places.filter(place => 
          !existingCachePlaceIds.has(place.placeId) && !existingPlacePlaceIds.has(place.placeId)
        );
        skippedCount = result.places.length - placesToProcess.length;

        const CHUNK_SIZE = 15;
        const DELAY_BETWEEN_CHUNKS = 2000;
        
        for (let i = 0; i < placesToProcess.length; i += CHUNK_SIZE) {
          const chunk = placesToProcess.slice(i, i + CHUNK_SIZE);
          
          // 使用新的規則映射 + AI 描述函數
          const classificationMap = await classifyAndDescribePlaces(chunk, cityName);
          
          for (const place of chunk) {
            try {
              const classification = classificationMap.get(place.name);
              const classResult = classification || {
                name: place.name,
                category: determineCategory(place.primaryType, place.types),
                subcategory: determineSubcategory(place.primaryType, place.types),
                description: generateFallbackDescription(place.name, determineCategory(place.primaryType, place.types), determineSubcategory(place.primaryType, place.types), cityName),
                descriptionSource: 'fallback' as const
              };

              const matchedCategory = allCategories.find(c => c.nameZh === classResult.category) || selectedCategory;
              
              if (matchedCategory) {
                const existingSubcategories = await storage.getSubcategoriesByCategory(matchedCategory.id);
                const existingSubcategory = existingSubcategories.find(s => s.nameZh === classResult.subcategory);
                
                if (!existingSubcategory && classResult.subcategory) {
                  console.log(`[BatchCollect] 子分類不存在: ${classResult.subcategory}`);
                }
              }

              const cached = await storage.savePlaceToCache({
                subCategory: classResult.subcategory,
                district: districtName || cityName,
                city: cityName,
                country: countryName,
                placeName: place.name,
                placeNameI18n: null,
                description: classResult.description,
                descriptionI18n: classResult.descriptionI18n || null,
                category: classResult.category,
                suggestedTime: null,
                duration: null,
                searchQuery: searchKeyword,
                rarity: null,
                colorHex: null,
                placeId: place.placeId,
                verifiedName: place.name,
                verifiedAddress: place.address,
                googleRating: place.rating?.toString() || null,
                googleTypes: place.types?.join(',') || null,
                primaryType: place.primaryType || null,
                locationLat: place.location?.lat?.toString() || null,
                locationLng: place.location?.lng?.toString() || null,
                isLocationVerified: true,
                businessStatus: place.businessStatus || null,
                lastVerifiedAt: new Date(),
                aiReviewed: false,
                aiReviewedAt: null
              });

              existingCachePlaceIds.add(place.placeId);
              savedPlaces.push({ id: cached.id, placeName: cached.placeName, placeId: cached.placeId });
              savedCount++;
            } catch (e: any) {
              console.error(`[BatchGenerate] Failed to save ${place.name}:`, e.message);
            }
          }
          
          if (i + CHUNK_SIZE < placesToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
          }
        }
      }

      res.json({
        success: true,
        stats: result.stats,
        saved: savedCount,
        skipped: skippedCount,
        total: result.places.length,
        savedPlaces: savedPlaces.slice(0, 20),
        message: `成功採集 ${result.places.length} 個地點，儲存 ${savedCount} 筆，跳過 ${skippedCount} 筆重複`
      });
    } catch (error: any) {
      console.error("Admin batch generate error:", error);
      res.status(500).json({ error: "批次生成失敗", details: error.message });
    }
  });

  // 管理員：預覽批次採集結果（不儲存）
  app.post("/api/admin/places/batch-preview", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const { 
        keyword, 
        regionId,
        districtId,
        maxKeywords: rawMaxKeywords = 5,
        maxPagesPerKeyword: rawMaxPages = 1,
        enableAIExpansion = true
      } = req.body;

      const maxKeywords = Math.min(Math.max(1, rawMaxKeywords), 5);
      const maxPagesPerKeyword = Math.min(Math.max(1, rawMaxPages), 2);

      if (!regionId) {
        return res.status(400).json({ error: "regionId 為必填" });
      }

      const regionData = await storage.getRegionById(regionId);
      if (!regionData) {
        return res.status(400).json({ error: "無效的 regionId" });
      }

      let districtName = '';
      if (districtId) {
        const districtInfo = await storage.getDistrictWithParents(districtId);
        if (districtInfo) {
          districtName = districtInfo.district.nameZh;
        }
      }

      const cityName = regionData.nameZh;
      const searchLocation = districtName || cityName;

      const result = await batchGeneratePlaces(
        keyword || '',
        searchLocation,
        cityName,
        { maxKeywords, maxPagesPerKeyword, enableAIExpansion }
      );

      res.json({
        success: true,
        stats: result.stats,
        places: result.places.slice(0, 50),
        total: result.places.length,
        message: `預覽找到 ${result.places.length} 個地點`
      });
    } catch (error: any) {
      console.error("Admin batch preview error:", error);
      res.status(500).json({ error: "預覽失敗", details: error.message });
    }
  });

  // 管理員：重新分類現有資料（Backfill）
  app.post("/api/admin/places/reclassify", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userEmail = req.user?.claims?.email;
      
      // 嘗試用 ID 或 email 查找用戶
      let user = userId ? await storage.getUser(userId) : null;
      if (!user && userEmail) {
        user = await storage.getUserByEmail(userEmail);
      }
      
      if (!user) {
        console.log('[Reclassify] User not found - userId:', userId, 'email:', userEmail);
        return res.status(401).json({ error: "Authentication required" });
      }
      
      if (user.role !== 'admin') {
        console.log('[Reclassify] Not admin - user:', user.email, 'role:', user.role);
        return res.status(403).json({ error: "Admin access required" });
      }

      const { target = 'cache', limit = 100 } = req.body;
      const results = { updated: 0, skipped: 0, errors: 0, details: [] as any[] };

      if (target === 'cache' || target === 'all') {
        const cacheItems = await db.execute(sql`
          SELECT id, place_name, city, primary_type, google_types, description, category, sub_category
          FROM place_cache
          WHERE (category = '景點' AND sub_category IN ('attraction', '景點'))
             OR description LIKE '%探索%的特色景點%'
          LIMIT ${limit}
        `);
        
        for (const item of cacheItems.rows as any[]) {
          try {
            const googleTypes = item.google_types ? item.google_types.split(',') : [];
            const reclassified = reclassifyPlace(
              item.place_name,
              item.city,
              item.primary_type,
              googleTypes,
              item.description || ''
            );
            
            await db.execute(sql`
              UPDATE place_cache
              SET category = ${reclassified.category},
                  sub_category = ${reclassified.subcategory},
                  description = ${reclassified.description}
              WHERE id = ${item.id}
            `);
            
            results.updated++;
            results.details.push({
              id: item.id,
              name: item.place_name,
              oldCategory: item.category,
              newCategory: reclassified.category,
              oldSubcategory: item.sub_category,
              newSubcategory: reclassified.subcategory
            });
          } catch (e: any) {
            results.errors++;
          }
        }
      }

      if (target === 'drafts' || target === 'all') {
        const draftItems = await db.execute(sql`
          SELECT id, place_name, city, primary_type, google_types, description, category, sub_category
          FROM place_drafts
          WHERE (category = '景點' AND sub_category IN ('attraction', '景點'))
             OR description LIKE '%探索%的特色景點%'
          LIMIT ${limit}
        `);
        
        for (const item of draftItems.rows as any[]) {
          try {
            const googleTypes = item.google_types ? item.google_types.split(',') : [];
            const reclassified = reclassifyPlace(
              item.place_name,
              item.city,
              item.primary_type,
              googleTypes,
              item.description || ''
            );
            
            await db.execute(sql`
              UPDATE place_drafts
              SET category = ${reclassified.category},
                  sub_category = ${reclassified.subcategory},
                  description = ${reclassified.description}
              WHERE id = ${item.id}
            `);
            
            results.updated++;
          } catch (e: any) {
            results.errors++;
          }
        }
      }

      if (target === 'places' || target === 'all') {
        const placeItems = await db.execute(sql`
          SELECT id, name, city, google_place_id, description, category, sub_category
          FROM places
          WHERE (category = '景點' AND sub_category IN ('attraction', '景點'))
             OR description LIKE '%探索%的特色景點%'
          LIMIT ${limit}
        `);
        
        for (const item of placeItems.rows as any[]) {
          try {
            const reclassified = reclassifyPlace(
              item.name,
              item.city,
              null,
              [],
              item.description || ''
            );
            
            await db.execute(sql`
              UPDATE places
              SET category = ${reclassified.category},
                  sub_category = ${reclassified.subcategory},
                  description = ${reclassified.description}
              WHERE id = ${item.id}
            `);
            
            results.updated++;
          } catch (e: any) {
            results.errors++;
          }
        }
      }

      res.json({
        success: true,
        message: `重新分類完成：更新 ${results.updated} 筆，錯誤 ${results.errors} 筆`,
        ...results
      });
    } catch (error: any) {
      console.error("Reclassify error:", error);
      res.status(500).json({ error: "重新分類失敗", details: error.message });
    }
  });

  // 管理員：取得快取審核統計
  app.get("/api/admin/place-cache/review-stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const stats = await storage.getPlaceCacheReviewStats();
      res.json(stats);
    } catch (error) {
      console.error("Get cache review stats error:", error);
      res.status(500).json({ error: "Failed to get review stats" });
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

  // ============ Announcements & Events API (公告與活動管理) ============
  
  // Helper: Check if user has admin access (via activeRole or super admin)
  const hasAdminAccess = async (req: any): Promise<boolean> => {
    const userId = req.user?.claims?.sub;
    if (!userId) return false;
    
    const user = await storage.getUser(userId);
    if (!user) return false;
    
    const SUPER_ADMIN_EMAIL = 's8869420@gmail.com';
    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;
    
    // Get activeRole from JWT or session
    const activeRole = req.jwtUser?.activeRole || (req.session as any)?.activeRole || user.role;
    
    // Allow if super admin or activeRole is 'admin'
    return isSuperAdmin || activeRole === 'admin';
  };

  // 取得所有公告 (管理端)
  app.get("/api/admin/announcements", isAuthenticated, async (req: any, res) => {
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

  // 取得有效的公告 (前台用)
  app.get("/api/announcements", async (req: any, res) => {
    try {
      const { type } = req.query;
      const validTypes = ['announcement', 'flash_event', 'holiday_event'];
      const announcementType = validTypes.includes(type as string) ? type as 'announcement' | 'flash_event' | 'holiday_event' : undefined;
      
      const announcements = await storage.getActiveAnnouncements(announcementType);
      res.json({ announcements });
    } catch (error) {
      console.error("Get active announcements error:", error);
      res.status(500).json({ error: "Failed to get announcements" });
    }
  });

  // 新增公告/活動
  app.post("/api/admin/announcements", isAuthenticated, async (req: any, res) => {
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

  // 更新公告/活動
  app.patch("/api/admin/announcements/:id", isAuthenticated, async (req: any, res) => {
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

  // 刪除公告/活動
  app.delete("/api/admin/announcements/:id", isAuthenticated, async (req: any, res) => {
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

  // 手動觸發清除過期活動
  app.post("/api/admin/announcements/cleanup", isAuthenticated, async (req: any, res) => {
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

  registerStripeRoutes(app);

  // ============ Ad Placements API (廣告設定) ============

  // 取得廣告設定（前端用）
  app.get("/api/ads/placements", async (req, res) => {
    try {
      const { placement, platform } = req.query;
      
      if (placement) {
        const ad = await storage.getAdPlacement(placement as string, platform as string);
        if (!ad) {
          return res.json({ ad: null });
        }
        return res.json({ 
          ad: {
            placementKey: ad.placementKey,
            platform: ad.platform,
            adUnitIdIos: ad.adUnitIdIos,
            adUnitIdAndroid: ad.adUnitIdAndroid,
            adType: ad.adType,
            fallbackImageUrl: ad.fallbackImageUrl,
            fallbackLinkUrl: ad.fallbackLinkUrl,
            showFrequency: ad.showFrequency,
            metadata: ad.metadata
          }
        });
      }
      
      const allAds = await storage.getAllAdPlacements();
      res.json({ ads: allAds.filter(a => a.isActive).map(ad => ({
        placementKey: ad.placementKey,
        platform: ad.platform,
        adType: ad.adType,
        showFrequency: ad.showFrequency
      })) });
    } catch (error) {
      console.error("Get ad placements error:", error);
      res.status(500).json({ error: "Failed to get ad placements" });
    }
  });

  // Admin: 列出所有廣告設定
  app.get("/api/admin/ads", isAuthenticated, async (req: any, res) => {
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

  // Admin: 新增廣告設定
  app.post("/api/admin/ads", isAuthenticated, async (req: any, res) => {
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

  // Admin: 更新廣告設定
  app.patch("/api/admin/ads/:id", isAuthenticated, async (req: any, res) => {
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

  // Admin: 刪除廣告設定
  app.delete("/api/admin/ads/:id", isAuthenticated, async (req: any, res) => {
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

  // ============ User Notifications API (未讀通知) ============

  // 取得使用者未讀通知狀態
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const notifications = await storage.getUserNotifications(userId);
      const unreadItembox = await storage.getUnreadInventoryCount(userId);
      
      const result: Record<string, number> = { itembox: unreadItembox };
      notifications.forEach(n => {
        result[n.notificationType] = n.unreadCount;
      });
      
      res.json({ notifications: result });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  // 標記通知已讀
  app.post("/api/notifications/:type/seen", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      await storage.markNotificationsSeen(userId, req.params.type);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notifications seen error:", error);
      res.status(500).json({ error: "Failed to mark notifications seen" });
    }
  });

  // ============ User Inventory API (道具箱) ============

  // 取得使用者道具箱 (30格遊戲風格)
  app.get("/api/inventory", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const items = await storage.getUserInventory(userId);
      const slotCount = await storage.getInventorySlotCount(userId);
      const isFull = slotCount >= INVENTORY_MAX_SLOTS;
      
      // 標記過期的優惠券 (不刪除，變灰色)
      const now = new Date();
      const enrichedItems = items.map(item => {
        const isExpired = item.validUntil && new Date(item.validUntil) < now;
        return {
          ...item,
          isExpired: isExpired || item.isExpired,
          status: isExpired ? 'expired' : item.status
        };
      });
      
      res.json({ 
        items: enrichedItems,
        slotCount,
        maxSlots: INVENTORY_MAX_SLOTS,
        isFull
      });
    } catch (error) {
      console.error("Get inventory error:", error);
      res.status(500).json({ error: "Failed to get inventory" });
    }
  });

  // 取得單一道具詳情
  app.get("/api/inventory/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const item = await storage.getInventoryItemById(parseInt(req.params.id), userId);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // 檢查是否過期
      const now = new Date();
      const isExpired = item.validUntil && new Date(item.validUntil) < now;
      
      res.json({ 
        item: {
          ...item,
          isExpired: isExpired || item.isExpired,
          status: isExpired ? 'expired' : item.status
        }
      });
    } catch (error) {
      console.error("Get inventory item error:", error);
      res.status(500).json({ error: "Failed to get inventory item" });
    }
  });

  // 標記道具已讀
  app.post("/api/inventory/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      await storage.markInventoryItemRead(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Mark inventory read error:", error);
      res.status(500).json({ error: "Failed to mark inventory read" });
    }
  });

  // 刪除道具 (軟刪除)
  app.delete("/api/inventory/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const success = await storage.softDeleteInventoryItem(parseInt(req.params.id), userId);
      if (!success) {
        return res.status(404).json({ error: "Item not found or already deleted" });
      }
      
      res.json({ success: true, message: "Item deleted" });
    } catch (error) {
      console.error("Delete inventory item error:", error);
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  // ============ Coupon Redemption API (優惠券核銷) ============

  // 提交優惠券核銷（用戶輸入核銷碼）
  app.post("/api/inventory/:id/redeem", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { redemptionCode } = req.body;
      const inventoryItemId = parseInt(req.params.id);

      // Get inventory item
      const item = await storage.getInventoryItemById(inventoryItemId, userId);
      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      
      // 檢查是否已過期 (變灰色的優惠券無法核銷)
      const now = new Date();
      if (item.validUntil && new Date(item.validUntil) < now) {
        return res.status(400).json({ error: "此優惠券已過期", isExpired: true });
      }
      
      // 檢查是否已核銷
      if (item.isRedeemed || item.status === 'redeemed') {
        return res.status(400).json({ error: "此優惠券已使用", isRedeemed: true });
      }
      
      if (!item.merchantId) {
        return res.status(400).json({ error: "This item cannot be redeemed" });
      }

      // Verify merchant daily seed code
      const merchantCode = await storage.getMerchantDailySeedCode(item.merchantId);
      if (!merchantCode) {
        return res.status(400).json({ error: "Merchant has no active redemption code" });
      }

      // Check if code is from today
      const today = new Date();
      const codeDate = new Date(merchantCode.updatedAt);
      if (today.toDateString() !== codeDate.toDateString()) {
        return res.status(400).json({ error: "Redemption code expired, please get today's code" });
      }

      // Verify code
      if (redemptionCode.toUpperCase() !== merchantCode.seedCode.toUpperCase()) {
        return res.status(400).json({ error: "Invalid redemption code" });
      }

      // Create and verify redemption record with 3-minute expiry
      const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
      const redemption = await storage.createAndVerifyCouponRedemption({
        userId,
        userInventoryId: inventoryItemId,
        merchantId: item.merchantId,
        redemptionCode: redemptionCode.toUpperCase(),
        expiresAt
      });

      // 追蹤優惠券使用
      try {
        await storage.incrementAnalyticsCounter(item.merchantId, null, 'couponUsageCount');
      } catch (e) {
        console.error("Failed to track coupon usage:", e);
      }

      res.json({ 
        success: true, 
        message: "Coupon redeemed! It will be removed in 3 minutes.",
        expiresAt: redemption.expiresAt,
        redemptionId: redemption.id
      });
    } catch (error) {
      console.error("Redeem coupon error:", error);
      res.status(500).json({ error: "Failed to redeem coupon" });
    }
  });

  // ============ Collection API (圖鑑) ============

  // 取得圖鑑（含商家優惠狀態）
  app.get("/api/collection/with-promo", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const collections = await storage.getCollectionWithPromoStatus(userId);
      
      // 按國家 -> 地區 -> 類別分組
      const grouped: Record<string, Record<string, Record<string, any[]>>> = {};
      
      collections.forEach(item => {
        const country = item.country || 'Unknown';
        const city = item.city || 'Unknown';
        const category = item.category || 'Other';
        
        if (!grouped[country]) grouped[country] = {};
        if (!grouped[country][city]) grouped[country][city] = {};
        if (!grouped[country][city][category]) grouped[country][city][category] = [];
        
        grouped[country][city][category].push(item);
      });
      
      res.json({ 
        collections,
        grouped,
        hasPromoItems: collections.some(c => c.hasPromo)
      });
    } catch (error) {
      console.error("Get collection with promo error:", error);
      res.status(500).json({ error: "Failed to get collection" });
    }
  });

  // 自動存入圖鑑（行程生成後調用）
  app.post("/api/collection/auto-save", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { placeName, country, city, district, category, subcategory, description, address, placeId, rating, locationLat, locationLng } = req.body;

      // Check if already exists
      const exists = await storage.checkCollectionExists(userId, placeName, district || '');
      if (exists) {
        return res.json({ success: true, message: "Already in collection", isNew: false });
      }

      // Check for merchant promo
      const merchantLink = await storage.getMerchantPlaceLinkByPlaceName(placeName, district || '', city);
      
      const collection = await storage.addToCollection({
        userId,
        placeName,
        country,
        city,
        district,
        category,
        subcategory,
        description,
        address,
        placeId,
        rating,
        locationLat,
        locationLng
      });

      // Increment unread count for collection
      await storage.incrementUnreadCount(userId, 'collection');

      res.json({ 
        success: true, 
        isNew: true,
        collection,
        hasPromo: merchantLink?.isPromoActive || false,
        promoTitle: merchantLink?.promoTitle,
        promoDescription: merchantLink?.promoDescription
      });
    } catch (error) {
      console.error("Auto-save collection error:", error);
      res.status(500).json({ error: "Failed to save to collection" });
    }
  });

  // Merchant: 取得今日核銷碼
  app.get("/api/merchant/redemption-code", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.jwtUser?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(404).json({ error: "Merchant profile not found" });
      }

      const code = await storage.getMerchantDailySeedCode(merchant.id);
      
      // Check if code is from today, if not generate new one
      const today = new Date();
      if (!code || today.toDateString() !== new Date(code.updatedAt).toDateString()) {
        const crypto = await import('crypto');
        const newCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        await storage.updateMerchantDailySeedCode(merchant.id, newCode);
        return res.json({ 
          code: newCode, 
          updatedAt: new Date(),
          expiresAt: new Date(today.setHours(23, 59, 59, 999))
        });
      }

      res.json({ 
        code: code.seedCode, 
        updatedAt: code.updatedAt,
        expiresAt: new Date(today.setHours(23, 59, 59, 999))
      });
    } catch (error) {
      console.error("Get redemption code error:", error);
      res.status(500).json({ error: "Failed to get redemption code" });
    }
  });

  // ============ Admin: Coupon Rarity Config (優惠券機率設定) ============

  // 取得所有機率設定
  app.get("/api/admin/rarity-config", isAuthenticated, async (req: any, res) => {
    try {
      if (!(await hasAdminAccess(req))) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const configs = await storage.getAllRarityConfigs();
      const globalConfig = await storage.getGlobalRarityConfig();
      res.json({ 
        configs, 
        globalConfig: globalConfig || {
          spRate: 2, ssrRate: 8, srRate: 15, sRate: 23, rRate: 32
        }
      });
    } catch (error) {
      console.error("Get rarity configs error:", error);
      res.status(500).json({ error: "Failed to get rarity configs" });
    }
  });

  // 更新全域機率設定
  app.post("/api/admin/rarity-config", isAuthenticated, async (req: any, res) => {
    try {
      if (!(await hasAdminAccess(req))) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const validatedData = insertCouponRarityConfigSchema.parse({
        ...req.body,
        configKey: req.body.configKey || 'global'
      });
      
      // 驗證總機率不超過100%
      const total = (validatedData.spRate || 2) + (validatedData.ssrRate || 8) + 
                    (validatedData.srRate || 15) + (validatedData.sRate || 23) + 
                    (validatedData.rRate || 32);
      if (total > 100) {
        return res.status(400).json({ error: "Total probability cannot exceed 100%" });
      }
      
      const config = await storage.upsertRarityConfig(validatedData);
      res.json({ success: true, config });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid rarity config data", details: error.errors });
      }
      console.error("Update rarity config error:", error);
      res.status(500).json({ error: "Failed to update rarity config" });
    }
  });

  // 刪除機率設定
  app.delete("/api/admin/rarity-config/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (!(await hasAdminAccess(req))) {
        return res.status(403).json({ error: "Admin access required" });
      }
      await storage.deleteRarityConfig(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete rarity config error:", error);
      res.status(500).json({ error: "Failed to delete rarity config" });
    }
  });

  // 公開 API: 取得當前機率設定 (供前端顯示)
  app.get("/api/rarity-config", async (req, res) => {
    try {
      const config = await storage.getGlobalRarityConfig();
      res.json({ 
        config: config || {
          spRate: 2, ssrRate: 8, srRate: 15, sRate: 23, rRate: 32
        }
      });
    } catch (error) {
      console.error("Get rarity config error:", error);
      res.status(500).json({ error: "Failed to get rarity config" });
    }
  });

  // 公開 API: 道具箱格數上限
  app.get("/api/inventory/config", async (req, res) => {
    res.json({ maxSlots: INVENTORY_MAX_SLOTS });
  });

  // ============ Merchant Analytics Dashboard ============

  // GET /api/merchant/analytics - 取得商家分析數據
  app.get("/api/merchant/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      // 取得商家認領的行程卡列表
      const placeLinks = await storage.getMerchantPlaceLinks(merchant.id);
      
      // 取得追蹤數據統計
      const analyticsSummary = await storage.getMerchantAnalyticsSummary(merchant.id);
      
      // 計算統計數據
      const stats = {
        totalPlaces: placeLinks.length,
        activePlaces: placeLinks.filter(p => p.status === 'approved').length,
        pendingPlaces: placeLinks.filter(p => p.status === 'pending').length,
        promoActivePlaces: placeLinks.filter(p => p.isPromoActive).length,
        merchantLevel: merchant.merchantLevel || 'free',
        subscriptionPlan: merchant.subscriptionPlan,
        status: merchant.status || 'pending',
        creditBalance: merchant.creditBalance || 0,
        // 擴展統計指標
        dailyCollectionCount: analyticsSummary.todayCollected,
        totalCollectionUsers: analyticsSummary.totalCollectors,
        collectionClickCount: analyticsSummary.totalClicks,
        couponUsageRate: analyticsSummary.totalCouponIssued > 0 
          ? Math.round((analyticsSummary.totalCouponUsage / analyticsSummary.totalCouponIssued) * 100) 
          : 0,
        couponTotalUsed: analyticsSummary.totalCouponUsage,
        couponTotalIssued: analyticsSummary.totalCouponIssued,
        prizePoolViewCount: analyticsSummary.totalPrizePoolViews,
      };

      res.json({
        success: true,
        merchant: {
          id: merchant.id,
          businessName: merchant.businessName || merchant.name,
          ownerName: merchant.ownerName,
          status: merchant.status,
          merchantLevel: merchant.merchantLevel,
          subscriptionPlan: merchant.subscriptionPlan,
          creditBalance: merchant.creditBalance,
        },
        stats,
        placeLinks: placeLinks.map(p => ({
          id: p.id,
          placeName: p.placeName,
          district: p.district,
          city: p.city,
          status: p.status,
          cardLevel: p.cardLevel || 'free',
          isPromoActive: p.isPromoActive,
          promoTitle: p.promoTitle,
        }))
      });
    } catch (error) {
      console.error("Get merchant analytics error:", error);
      res.status(500).json({ error: "Failed to get analytics" });
    }
  });

  // POST /api/merchant/apply - 商家申請送審 (使用新的註冊資料)
  app.post("/api/merchant/apply", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // 驗證申請資料
      const { ownerName, businessName, taxId, businessCategory, address, phone, mobile, email } = req.body;
      
      if (!ownerName || !businessName || !businessCategory || !address || !mobile || !email) {
        return res.status(400).json({ error: "請填寫所有必填欄位" });
      }

      // 檢查是否已有商家帳號
      let merchant = await storage.getMerchantByUserId(userId);
      
      if (merchant) {
        // 更新現有商家資料並重新送審
        await storage.updateMerchant(merchant.id, {
          ownerName,
          businessName,
          taxId,
          businessCategory,
          address,
          phone,
          mobile,
          email,
          status: 'pending',
        });
        merchant = await storage.getMerchantByUserId(userId);
        return res.json({ success: true, merchant, isNew: false, message: "商家資料已更新，審核中" });
      }

      // 建立新商家
      merchant = await storage.createMerchant({
        userId,
        name: businessName,
        email,
        ownerName,
        businessName,
        taxId,
        businessCategory,
        address,
        phone,
        mobile,
        subscriptionPlan: 'free',
      });

      res.json({ success: true, merchant, isNew: true, message: "商家申請已送出，等待審核" });
    } catch (error) {
      console.error("Merchant apply error:", error);
      res.status(500).json({ error: "商家申請失敗" });
    }
  });

  // GET /api/merchant/coupons - 取得商家的優惠券模板列表
  app.get("/api/merchant/coupons", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const coupons = await storage.getMerchantCoupons(merchant.id);
      res.json({ success: true, coupons });
    } catch (error) {
      console.error("Get merchant coupons error:", error);
      res.status(500).json({ error: "Failed to get coupons" });
    }
  });

  // POST /api/merchant/coupons - 建立新優惠券模板
  app.post("/api/merchant/coupons", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const { name, tier, content, terms, quantity, validUntil, merchantPlaceLinkId, backgroundImageUrl, inventoryImageUrl } = req.body;

      if (!name || !content) {
        return res.status(400).json({ error: "請填寫優惠券名稱與內容" });
      }

      const coupon = await storage.createMerchantCoupon({
        merchantId: merchant.id,
        merchantPlaceLinkId: merchantPlaceLinkId || null,
        name,
        tier: tier || 'R',
        content,
        terms,
        quantity: quantity || -1, // -1 = unlimited
        validUntil: validUntil ? new Date(validUntil) : null,
        backgroundImageUrl,
        inventoryImageUrl,
      });

      res.json({ success: true, coupon });
    } catch (error) {
      console.error("Create merchant coupon error:", error);
      res.status(500).json({ error: "Failed to create coupon" });
    }
  });

  // PUT /api/merchant/coupons/:id - 更新優惠券模板
  app.put("/api/merchant/coupons/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const couponId = parseInt(req.params.id);
      const { name, tier, content, terms, quantity, validUntil, isActive, backgroundImageUrl, inventoryImageUrl } = req.body;

      const coupon = await storage.updateMerchantCoupon(couponId, merchant.id, {
        name,
        tier,
        content,
        terms,
        quantity,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        isActive,
        backgroundImageUrl,
        inventoryImageUrl,
      });

      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }

      res.json({ success: true, coupon });
    } catch (error) {
      console.error("Update merchant coupon error:", error);
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });

  // DELETE /api/merchant/coupons/:id - 刪除優惠券模板
  app.delete("/api/merchant/coupons/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const couponId = parseInt(req.params.id);
      const deleted = await storage.deleteMerchantCoupon(couponId, merchant.id);

      if (!deleted) {
        return res.status(404).json({ error: "Coupon not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Delete merchant coupon error:", error);
      res.status(500).json({ error: "Failed to delete coupon" });
    }
  });

  // ============ Merchant Subscription Upgrade APIs ============
  
  // Subscription plan pricing (monthly, in TWD)
  const MERCHANT_PLAN_PRICES = {
    free: 0,
    pro: 999,      // NT$999/month
    premium: 2999, // NT$2,999/month
  };
  
  const PLACE_CARD_LEVEL_PRICES = {
    free: 0,
    pro: 299,      // NT$299/month per place card
    premium: 599,  // NT$599/month per place card
  };

  // GET /api/merchant/subscription/plans - 取得訂閱方案列表和價格
  app.get("/api/merchant/subscription/plans", async (req, res) => {
    try {
      res.json({
        merchantPlans: [
          {
            id: 'free',
            name: '免費版',
            nameEn: 'Free',
            price: MERCHANT_PLAN_PRICES.free,
            features: ['基本商家資料', '1張免費行程卡', '基本優惠券'],
          },
          {
            id: 'pro',
            name: '專業版',
            nameEn: 'Pro',
            price: MERCHANT_PLAN_PRICES.pro,
            features: ['所有免費版功能', '最多5張行程卡', 'SR等級優惠券', '基本數據分析'],
          },
          {
            id: 'premium',
            name: '旗艦版',
            nameEn: 'Premium',
            price: MERCHANT_PLAN_PRICES.premium,
            features: ['所有專業版功能', '無限行程卡', 'SP/SSR等級優惠券', '進階數據分析', '優先客服支援'],
          },
        ],
        placeCardLevels: [
          {
            id: 'free',
            name: '基礎版',
            nameEn: 'Basic',
            price: PLACE_CARD_LEVEL_PRICES.free,
            features: ['基本展示', '標準曝光'],
          },
          {
            id: 'pro',
            name: '進階版',
            nameEn: 'Pro',
            price: PLACE_CARD_LEVEL_PRICES.pro,
            features: ['優先曝光', '自訂圖片', '促銷標籤'],
          },
          {
            id: 'premium',
            name: '旗艦版',
            nameEn: 'Premium',
            price: PLACE_CARD_LEVEL_PRICES.premium,
            features: ['最高曝光', '影片展示', '專屬推薦', '數據報表'],
          },
        ],
      });
    } catch (error) {
      console.error("Get subscription plans error:", error);
      res.status(500).json({ error: "Failed to get subscription plans" });
    }
  });

  // POST /api/merchant/subscription/upgrade - 建立商家等級升級支付
  app.post("/api/merchant/subscription/upgrade", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const { targetPlan, provider = 'stripe' } = req.body;
      
      if (!['pro', 'premium'].includes(targetPlan)) {
        return res.status(400).json({ error: "Invalid target plan" });
      }

      const currentPlan = merchant.merchantLevel || 'free';
      const planOrder = { free: 0, pro: 1, premium: 2 };
      
      if (planOrder[targetPlan as keyof typeof planOrder] <= planOrder[currentPlan as keyof typeof planOrder]) {
        return res.status(400).json({ error: "Can only upgrade to a higher plan" });
      }

      const price = MERCHANT_PLAN_PRICES[targetPlan as keyof typeof MERCHANT_PLAN_PRICES];
      
      if (provider === 'stripe') {
        const stripeClient = await getUncachableStripeClient();
        const baseUrl = `https://${req.hostname}`;
        
        const session = await stripeClient.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'twd',
              product_data: {
                name: `商家等級升級 - ${targetPlan === 'pro' ? '專業版' : '旗艦版'}`,
                description: `從 ${currentPlan} 升級到 ${targetPlan}`,
              },
              unit_amount: price,
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          }],
          mode: 'subscription',
          success_url: `${baseUrl}/merchant/subscription/success?session_id={CHECKOUT_SESSION_ID}&plan=${targetPlan}`,
          cancel_url: `${baseUrl}/merchant/subscription`,
          metadata: {
            merchantId: merchant.id.toString(),
            upgradeType: 'merchant_plan',
            targetPlan,
            currentPlan,
          },
        });

        return res.json({
          provider: 'stripe',
          checkoutUrl: session.url,
          sessionId: session.id,
        });
      }
      
      // Recur payment (for Taiwan local payment)
      return res.json({
        provider: 'recur',
        price,
        merchantId: merchant.id,
        targetPlan,
        message: 'Recur payment integration pending',
      });
    } catch (error) {
      console.error("Merchant subscription upgrade error:", error);
      res.status(500).json({ error: "Failed to create upgrade session" });
    }
  });

  // POST /api/merchant/subscription/confirm - 確認升級 (webhook 或手動確認)
  app.post("/api/merchant/subscription/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const { sessionId, targetPlan } = req.body;
      
      if (!['pro', 'premium'].includes(targetPlan)) {
        return res.status(400).json({ error: "Invalid target plan" });
      }

      // Verify Stripe session if provided
      if (sessionId) {
        const stripeClient = await getUncachableStripeClient();
        const session = await stripeClient.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status !== 'paid') {
          return res.status(400).json({ error: "Payment not completed" });
        }
        
        // Verify session belongs to this merchant
        if (session.metadata?.merchantId !== merchant.id.toString()) {
          return res.status(403).json({ error: "Session does not belong to this merchant" });
        }
      }

      // Update merchant plan
      const updatedMerchant = await storage.updateMerchant(merchant.id, {
        merchantLevel: targetPlan,
        subscriptionPlan: targetPlan,
      });

      res.json({
        success: true,
        merchant: updatedMerchant,
        message: `Successfully upgraded to ${targetPlan} plan`,
      });
    } catch (error) {
      console.error("Confirm subscription upgrade error:", error);
      res.status(500).json({ error: "Failed to confirm upgrade" });
    }
  });

  // POST /api/merchant/places/:linkId/upgrade - 升級行程卡等級
  app.post("/api/merchant/places/:linkId/upgrade", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const linkId = parseInt(req.params.linkId);
      const { targetLevel, provider = 'stripe' } = req.body;
      
      if (!['pro', 'premium'].includes(targetLevel)) {
        return res.status(400).json({ error: "Invalid target level" });
      }

      // Get current place card
      const placeLinks = await storage.getMerchantPlaceLinks(merchant.id);
      const placeLink = placeLinks.find(link => link.id === linkId);
      if (!placeLink) {
        return res.status(404).json({ error: "Place card not found" });
      }

      const currentLevel = placeLink.cardLevel || 'free';
      const levelOrder = { free: 0, pro: 1, premium: 2 };
      
      if (levelOrder[targetLevel as keyof typeof levelOrder] <= levelOrder[currentLevel as keyof typeof levelOrder]) {
        return res.status(400).json({ error: "Can only upgrade to a higher level" });
      }

      const price = PLACE_CARD_LEVEL_PRICES[targetLevel as keyof typeof PLACE_CARD_LEVEL_PRICES];
      
      if (provider === 'stripe') {
        const stripeClient = await getUncachableStripeClient();
        const baseUrl = `https://${req.hostname}`;
        
        const session = await stripeClient.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'twd',
              product_data: {
                name: `行程卡升級 - ${targetLevel === 'pro' ? '進階版' : '旗艦版'}`,
                description: `行程卡 #${linkId} 從 ${currentLevel} 升級到 ${targetLevel}`,
              },
              unit_amount: price,
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          }],
          mode: 'subscription',
          success_url: `${baseUrl}/merchant/places/${linkId}/success?session_id={CHECKOUT_SESSION_ID}&level=${targetLevel}`,
          cancel_url: `${baseUrl}/merchant/places`,
          metadata: {
            merchantId: merchant.id.toString(),
            placeLinkId: linkId.toString(),
            upgradeType: 'place_card_level',
            targetLevel,
            currentLevel,
          },
        });

        return res.json({
          provider: 'stripe',
          checkoutUrl: session.url,
          sessionId: session.id,
        });
      }
      
      return res.json({
        provider: 'recur',
        price,
        placeLinkId: linkId,
        targetLevel,
        message: 'Recur payment integration pending',
      });
    } catch (error) {
      console.error("Place card upgrade error:", error);
      res.status(500).json({ error: "Failed to create upgrade session" });
    }
  });

  // POST /api/merchant/places/:linkId/upgrade/confirm - 確認行程卡升級
  app.post("/api/merchant/places/:linkId/upgrade/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      const linkId = parseInt(req.params.linkId);
      const { sessionId, targetLevel } = req.body;
      
      if (!['pro', 'premium'].includes(targetLevel)) {
        return res.status(400).json({ error: "Invalid target level" });
      }

      // Verify place belongs to merchant
      const allPlaceLinks = await storage.getMerchantPlaceLinks(merchant.id);
      const placeLink = allPlaceLinks.find(link => link.id === linkId);
      if (!placeLink) {
        return res.status(404).json({ error: "Place card not found" });
      }

      // Verify Stripe session if provided
      if (sessionId) {
        const stripeClient = await getUncachableStripeClient();
        const session = await stripeClient.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status !== 'paid') {
          return res.status(400).json({ error: "Payment not completed" });
        }
        
        if (session.metadata?.placeLinkId !== linkId.toString()) {
          return res.status(403).json({ error: "Session does not belong to this place card" });
        }
      }

      // Update place card level
      const updatedPlaceLink = await storage.updateMerchantPlaceLink(linkId, {
        cardLevel: targetLevel,
      });

      res.json({
        success: true,
        placeLink: updatedPlaceLink,
        message: `Successfully upgraded place card to ${targetLevel} level`,
      });
    } catch (error) {
      console.error("Confirm place card upgrade error:", error);
      res.status(500).json({ error: "Failed to confirm upgrade" });
    }
  });

  // GET /api/merchant/subscription - 取得當前訂閱狀態
  app.get("/api/merchant/subscription", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant registration required" });
      }

      // Get place cards with their levels
      const placeLinks = await storage.getMerchantPlaceLinks(merchant.id);
      
      res.json({
        merchantId: merchant.id,
        merchantLevel: merchant.merchantLevel || 'free',
        subscriptionPlan: merchant.subscriptionPlan || 'free',
        placeCards: placeLinks.map(link => ({
          id: link.id,
          placeName: link.placeName,
          cardLevel: link.cardLevel || 'free',
        })),
        limits: {
          maxPlaceCards: merchant.merchantLevel === 'premium' ? Infinity : 
                         merchant.merchantLevel === 'pro' ? 5 : 1,
          currentPlaceCards: placeLinks.length,
          canAddMoreCards: merchant.merchantLevel === 'premium' || 
                          (merchant.merchantLevel === 'pro' && placeLinks.length < 5) ||
                          (merchant.merchantLevel === 'free' && placeLinks.length < 1),
        },
      });
    } catch (error) {
      console.error("Get merchant subscription error:", error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  // POST /api/admin/sync-database - Super Admin: Full database sync from seed files
  app.post("/api/admin/sync-database", async (req: any, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Authorization required" });
      }
      
      const adminKey = authHeader.split(' ')[1];
      const expectedKey = process.env.SUPER_ADMIN_PASSWORD;
      
      if (!expectedKey || adminKey !== expectedKey) {
        return res.status(403).json({ error: "Invalid admin key" });
      }

      const fs = await import('fs');
      const path = await import('path');
      const seedDir = path.join(process.cwd(), 'server/seed');
      
      const results: Record<string, { total: number; inserted: number; skipped: number; errors: number }> = {};

      const syncOrder = [
        'countries',
        'regions', 
        'districts',
        'categories',
        'subcategories',
        'service_plans',
        'places',
        'place_cache'
      ];

      for (const tableName of syncOrder) {
        const seedPath = path.join(seedDir, `${tableName}-seed.json`);
        
        if (!fs.existsSync(seedPath)) {
          results[tableName] = { total: 0, inserted: 0, skipped: 0, errors: 0 };
          continue;
        }

        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
        if (!Array.isArray(seedData)) {
          results[tableName] = { total: 0, inserted: 0, skipped: 0, errors: 0 };
          continue;
        }

        let inserted = 0, skipped = 0, errors = 0;

        for (const record of seedData) {
          try {
            const syncResult = await storage.syncRecord(tableName, record);
            if (syncResult === 'inserted') inserted++;
            else if (syncResult === 'skipped') skipped++;
          } catch (err) {
            console.error(`Failed to sync ${tableName} record:`, err);
            errors++;
          }
        }

        results[tableName] = { total: seedData.length, inserted, skipped, errors };
      }

      const summary = Object.entries(results).map(([table, r]) => 
        `${table}: ${r.inserted} inserted, ${r.skipped} skipped, ${r.errors} errors`
      ).join('\n');

      res.json({
        success: true,
        results,
        summary,
      });
    } catch (error) {
      console.error("Sync database error:", error);
      res.status(500).json({ error: "Failed to sync database" });
    }
  });

  // ============ Category 統一 API（開發/正式環境都可用）============
  app.post("/api/admin/unify-categories", async (req: any, res) => {
    try {
      const { key } = req.body;
      const MIGRATION_KEY = process.env.ADMIN_MIGRATION_KEY || "mibu2024migrate";
      
      if (key !== MIGRATION_KEY) {
        return res.status(403).json({ error: "需要密鑰" });
      }
      
      // 統一 category 值到八大類標準名稱
      const updates = [
        { from: ['food', '食'], to: '美食' },
        { from: ['stay', '宿'], to: '住宿' },
        { from: ['scenery'], to: '景點' },
        { from: ['shopping'], to: '購物' },
        { from: ['activity'], to: '活動' },
        { from: ['entertainment'], to: '娛樂設施' },
        { from: ['education'], to: '生態文化教育' },
        { from: ['experience'], to: '遊程體驗' },
      ];
      
      const results: { category: string; updated: number }[] = [];
      
      for (const update of updates) {
        const fromList = update.from.map(f => `'${f}'`).join(',');
        const result = await db.execute(sql.raw(`
          UPDATE places SET category = '${update.to}' 
          WHERE category IN (${fromList})
        `));
        results.push({ category: update.to, updated: (result as any).rowCount || 0 });
      }
      
      // 統計結果
      const categoryCounts = await db.execute(sql`
        SELECT category, COUNT(*) as count 
        FROM places 
        WHERE is_active = true 
        GROUP BY category 
        ORDER BY count DESC
      `);
      
      res.json({
        success: true,
        message: 'Category 統一完成',
        updates: results,
        currentStats: categoryCounts.rows
      });
    } catch (error) {
      console.error("Unify categories error:", error);
      res.status(500).json({ error: "統一 category 失敗", details: String(error) });
    }
  });

  // ============ 導出景點資料 API（給其他環境獲取）============
  app.get("/api/admin/export-places", async (req: any, res) => {
    try {
      const { key, exclude } = req.query;
      const MIGRATION_KEY = process.env.ADMIN_MIGRATION_KEY || "mibu2024migrate";
      
      if (key !== MIGRATION_KEY) {
        return res.status(403).json({ error: "需要密鑰" });
      }
      
      // 排除已有的城市
      const excludeCities = exclude ? (exclude as string).split(',') : [];
      
      let query;
      if (excludeCities.length > 0) {
        query = sql`
          SELECT place_name, country, city, district, address, 
                 location_lat, location_lng, google_place_id, rating,
                 category, subcategory, description
          FROM places 
          WHERE is_active = true 
            AND google_place_id IS NOT NULL
            AND city NOT IN ${sql.raw(`('${excludeCities.join("','")}')`)}
          ORDER BY city, district
        `;
      } else {
        query = sql`
          SELECT place_name, country, city, district, address, 
                 location_lat, location_lng, google_place_id, rating,
                 category, subcategory, description
          FROM places 
          WHERE is_active = true AND google_place_id IS NOT NULL
          ORDER BY city, district
        `;
      }
      
      const result = await db.execute(query);
      
      res.json({
        success: true,
        count: result.rows.length,
        places: result.rows
      });
    } catch (error) {
      console.error("[Export] Error:", error);
      res.status(500).json({ error: "導出失敗", details: String(error) });
    }
  });

  // ============ 清空 places 資料表（正式環境用）============
  app.get("/api/admin/clear-places", async (req: any, res) => {
    try {
      const { key, confirm } = req.query;
      const MIGRATION_KEY = process.env.ADMIN_MIGRATION_KEY || "mibu2024migrate";
      
      if (key !== MIGRATION_KEY) {
        return res.status(403).json({ error: "需要密鑰" });
      }
      
      if (confirm !== 'yes') {
        return res.status(400).json({ 
          error: "需要確認參數",
          usage: "/api/admin/clear-places?key=mibu2024migrate&confirm=yes",
          warning: "此操作會清空所有 places 資料，請確認後再執行"
        });
      }
      
      console.log('[Clear] Starting places table truncation...');
      
      // 先統計現有資料
      const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM places`);
      const beforeCount = Number(countResult.rows[0]?.count || 0);
      
      // 使用 TRUNCATE CASCADE 清空資料
      await db.execute(sql`TRUNCATE places CASCADE`);
      
      console.log(`[Clear] Truncated ${beforeCount} places`);
      
      res.json({
        success: true,
        message: "places 資料表已清空",
        deletedCount: beforeCount,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[Clear] Error:", error);
      res.status(500).json({ error: "清空失敗", details: String(error) });
    }
  });

  // ============ 刪除黑名單地點 ============
  app.get("/api/admin/delete-blacklist-places", async (req: any, res) => {
    try {
      const { key, confirm } = req.query;
      const MIGRATION_KEY = process.env.ADMIN_MIGRATION_KEY || "mibu2024migrate";
      
      if (key !== MIGRATION_KEY) {
        return res.status(403).json({ error: "需要密鑰" });
      }
      
      // 黑名單關鍵字（保留蘭城百匯、森本屋）
      const BLACKLIST_KEYWORDS = [
        '資材行', '水電行', '汽車修理', '輪胎行', '洗衣店', '乾洗店',
        '當舖', '禮儀公司', '快餐店',
        '區公所', '市公所', '戶政事務所', '警察局', '派出所',
        '衛生所', '殯儀館', '火葬場', '納骨塔', '墓園',
        '停車場', '加油站', '銀行分行', '郵局'
      ];
      
      // 保留名單（即使含黑名單關鍵字也不刪除）
      const WHITELIST = ['蘭城百匯', '森本屋'];
      
      // 先查詢符合條件的資料
      const blacklistConditions = BLACKLIST_KEYWORDS.map(kw => `place_name ILIKE '%${kw}%'`).join(' OR ');
      const whitelistConditions = WHITELIST.map(w => `place_name NOT ILIKE '%${w}%'`).join(' AND ');
      
      const previewResult = await db.execute(sql.raw(`
        SELECT id, place_name, city, district, category
        FROM places 
        WHERE (${blacklistConditions}) AND (${whitelistConditions})
      `));
      
      if (confirm !== 'yes') {
        return res.json({
          preview: true,
          message: "以下是將被刪除的黑名單地點（需加 confirm=yes 執行刪除）",
          count: previewResult.rows.length,
          places: previewResult.rows,
          usage: "/api/admin/delete-blacklist-places?key=mibu2024migrate&confirm=yes"
        });
      }
      
      // 執行刪除
      const deleteResult = await db.execute(sql.raw(`
        DELETE FROM places 
        WHERE (${blacklistConditions}) AND (${whitelistConditions})
      `));
      
      console.log(`[Blacklist] Deleted ${previewResult.rows.length} blacklisted places`);
      
      res.json({
        success: true,
        message: "黑名單地點已刪除",
        deletedCount: previewResult.rows.length,
        deletedPlaces: previewResult.rows,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[Blacklist] Error:", error);
      res.status(500).json({ error: "刪除失敗", details: String(error) });
    }
  });

  // ============ 一鍵匯入：從遠端 API 獲取資料 ============
  app.get("/api/admin/seed-places", async (req: any, res) => {
    try {
      const { key, source } = req.query;
      const MIGRATION_KEY = process.env.ADMIN_MIGRATION_KEY || "mibu2024migrate";
      
      if (key !== MIGRATION_KEY) {
        return res.status(403).json({ error: "需要密鑰" });
      }
      
      console.log('[Seed] Starting places seed import...');
      
      // 獲取目前已有的城市
      const existingCities = await db.execute(sql`
        SELECT DISTINCT city FROM places WHERE is_active = true
      `);
      const excludeCities = existingCities.rows.map((r: any) => r.city).join(',');
      console.log('[Seed] Excluding cities:', excludeCities);
      
      // 從開發環境 API 獲取資料
      const devApiUrl = source || 'https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev';
      const exportUrl = `${devApiUrl}/api/admin/export-places?key=${MIGRATION_KEY}&exclude=${encodeURIComponent(excludeCities)}`;
      
      console.log('[Seed] Fetching from:', exportUrl);
      
      const response = await fetch(exportUrl, { 
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000) // 30 秒超時
      });
      
      if (!response.ok) {
        return res.status(502).json({ 
          error: "無法從開發環境獲取資料", 
          status: response.status 
        });
      }
      
      const data = await response.json();
      if (!data.success || !Array.isArray(data.places)) {
        return res.status(400).json({ error: "資料格式錯誤" });
      }
      
      console.log('[Seed] Received', data.places.length, 'places to import');
      
      let inserted = 0, skipped = 0, errors = 0;
      
      // 批量插入，每 50 筆一批
      const batchSize = 50;
      for (let i = 0; i < data.places.length; i += batchSize) {
        const batch = data.places.slice(i, i + batchSize);
        
        for (const place of batch) {
          try {
            if (!place.google_place_id) {
              skipped++;
              continue;
            }
            
            await db.execute(sql`
              INSERT INTO places (
                place_name, country, city, district, address,
                location_lat, location_lng, google_place_id, rating,
                category, subcategory, description, is_active, is_promo_active
              ) VALUES (
                ${place.place_name}, ${place.country}, ${place.city}, ${place.district}, ${place.address},
                ${place.location_lat}, ${place.location_lng}, ${place.google_place_id}, ${place.rating},
                ${place.category}, ${place.subcategory}, ${place.description}, true, false
              )
              ON CONFLICT (google_place_id) DO NOTHING
            `);
            inserted++;
          } catch (err) {
            errors++;
          }
        }
        
        console.log(`[Seed] Progress: ${Math.min(i + batchSize, data.places.length)}/${data.places.length}`);
      }
      
      // 取得統計
      const statsResult = await db.execute(sql`
        SELECT city, COUNT(*) as count 
        FROM places 
        WHERE is_active = true 
        GROUP BY city 
        ORDER BY count DESC
      `);
      
      const totalPlaces = statsResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.count), 0);
      
      console.log('[Seed] Complete! Inserted:', inserted, 'Skipped:', skipped, 'Errors:', errors);
      
      res.json({
        success: true,
        message: "✅ 匯入完成！",
        imported: { inserted, skipped, errors, total: data.places.length },
        totalPlaces,
        totalCities: statsResult.rows.length,
        byCity: statsResult.rows
      });
    } catch (error) {
      console.error("[Seed] Error:", error);
      res.status(500).json({ error: "匯入失敗", details: String(error) });
    }
  });

  // ============ 一鍵遷移：place_cache → places ============
  // 簡易版本：使用密鑰驗證（方便在 App 上操作）
  app.get("/api/admin/migrate-places", async (req: any, res) => {
    try {
      const { key } = req.query;
      const MIGRATION_KEY = process.env.ADMIN_MIGRATION_KEY || "mibu2024migrate";
      
      if (key !== MIGRATION_KEY) {
        return res.status(403).json({ 
          error: "需要密鑰",
          hint: "請使用正確的 key 參數訪問此 API"
        });
      }
      
      console.log('[Migration] Starting place_cache to places migration (simple key auth)...');
      
      // 執行遷移
      const insertResult = await db.execute(sql`
        INSERT INTO places (
          place_name, country, city, district, address,
          location_lat, location_lng, google_place_id, rating,
          category, subcategory, description, is_active, is_promo_active
        )
        SELECT 
          COALESCE(verified_name, place_name),
          country, city, district, verified_address,
          CASE WHEN location_lat ~ '^[0-9.-]+$' THEN location_lat::double precision ELSE NULL END,
          CASE WHEN location_lng ~ '^[0-9.-]+$' THEN location_lng::double precision ELSE NULL END,
          place_id,
          CASE WHEN google_rating ~ '^[0-9.]+$' THEN google_rating::double precision ELSE NULL END,
          category, sub_category, description, true, false
        FROM place_cache
        WHERE place_id IS NOT NULL AND place_id != ''
          AND is_location_verified = true
          AND business_status IS DISTINCT FROM 'CLOSED_PERMANENTLY'
        ON CONFLICT (google_place_id) DO NOTHING
      `);
      
      // 取得統計
      const statsResult = await db.execute(sql`
        SELECT city, COUNT(*) as count 
        FROM places 
        WHERE is_active = true 
        GROUP BY city 
        ORDER BY count DESC
      `);
      
      const totalPlaces = statsResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.count), 0);
      
      console.log('[Migration] Complete! Total places:', totalPlaces, 'Cities:', statsResult.rows.length);
      
      res.json({
        success: true,
        message: "✅ 遷移完成！place_cache 資料已轉移到 places 表",
        totalPlaces,
        totalCities: statsResult.rows.length,
        byCity: statsResult.rows
      });
    } catch (error) {
      console.error("[Migration] Error:", error);
      res.status(500).json({ error: "遷移失敗", details: String(error) });
    }
  });
  
  // 用於將 place_cache 中已驗證的景點轉移到 places 正式表
  app.post("/api/admin/migrate-cache-to-places", async (req: any, res) => {
    try {
      // 驗證管理員權限
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "需要登入" });
      }
      
      // 檢查是否為超級管理員
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'superadmin') {
        return res.status(403).json({ error: "需要超級管理員權限" });
      }
      
      console.log('[Migration] Starting place_cache to places migration...');
      
      // 執行遷移 SQL
      const result = await db.execute(sql`
        INSERT INTO places (
          place_name,
          country,
          city,
          district,
          address,
          location_lat,
          location_lng,
          google_place_id,
          rating,
          category,
          subcategory,
          description,
          is_active,
          is_promo_active
        )
        SELECT 
          COALESCE(verified_name, place_name) as place_name,
          country,
          city,
          district,
          verified_address as address,
          CASE WHEN location_lat ~ '^[0-9.-]+$' THEN location_lat::double precision ELSE NULL END as location_lat,
          CASE WHEN location_lng ~ '^[0-9.-]+$' THEN location_lng::double precision ELSE NULL END as location_lng,
          place_id as google_place_id,
          CASE WHEN google_rating ~ '^[0-9.]+$' THEN google_rating::double precision ELSE NULL END as rating,
          category,
          sub_category as subcategory,
          description,
          true as is_active,
          false as is_promo_active
        FROM place_cache
        WHERE 
          place_id IS NOT NULL 
          AND place_id != ''
          AND is_location_verified = true
          AND business_status IS DISTINCT FROM 'CLOSED_PERMANENTLY'
        ON CONFLICT (google_place_id) DO NOTHING
      `);
      
      // 統計結果
      const statsResult = await db.execute(sql`
        SELECT 
          (SELECT COUNT(*) FROM places WHERE is_active = true) as total_places,
          (SELECT COUNT(DISTINCT city) FROM places WHERE is_active = true) as total_cities,
          (SELECT COUNT(*) FROM place_cache WHERE is_location_verified = true) as total_cache
      `);
      const stats = statsResult.rows?.[0] || {};
      
      console.log('[Migration] Complete:', stats);
      
      res.json({
        success: true,
        message: "遷移完成！",
        stats: stats
      });
    } catch (error) {
      console.error("[Migration] Error:", error);
      res.status(500).json({ error: "遷移失敗", details: String(error) });
    }
  });
  
  // GET 版本（方便瀏覽器直接訪問）
  app.get("/api/admin/migrate-cache-to-places", async (req: any, res) => {
    try {
      // 驗證管理員權限
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ 
          error: "需要登入", 
          hint: "請先登入超級管理員帳號，然後再訪問此頁面"
        });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'superadmin') {
        return res.status(403).json({ 
          error: "需要超級管理員權限",
          currentRole: user?.role || 'unknown'
        });
      }
      
      console.log('[Migration] Starting place_cache to places migration (GET)...');
      
      // 執行遷移
      await db.execute(sql`
        INSERT INTO places (
          place_name, country, city, district, address,
          location_lat, location_lng, google_place_id, rating,
          category, subcategory, description, is_active, is_promo_active
        )
        SELECT 
          COALESCE(verified_name, place_name),
          country, city, district, verified_address,
          CASE WHEN location_lat ~ '^[0-9.-]+$' THEN location_lat::double precision ELSE NULL END,
          CASE WHEN location_lng ~ '^[0-9.-]+$' THEN location_lng::double precision ELSE NULL END,
          place_id,
          CASE WHEN google_rating ~ '^[0-9.]+$' THEN google_rating::double precision ELSE NULL END,
          category, sub_category, description, true, false
        FROM place_cache
        WHERE place_id IS NOT NULL AND place_id != ''
          AND is_location_verified = true
          AND business_status IS DISTINCT FROM 'CLOSED_PERMANENTLY'
        ON CONFLICT (google_place_id) DO NOTHING
      `);
      
      // 取得統計
      const statsResult = await db.execute(sql`
        SELECT city, COUNT(*) as count 
        FROM places 
        WHERE is_active = true 
        GROUP BY city 
        ORDER BY count DESC
      `);
      
      const totalPlaces = statsResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.count), 0);
      
      res.json({
        success: true,
        message: "✅ 遷移完成！",
        totalPlaces,
        totalCities: statsResult.rows.length,
        byCity: statsResult.rows
      });
    } catch (error) {
      console.error("[Migration] Error:", error);
      res.status(500).json({ error: "遷移失敗", details: String(error) });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

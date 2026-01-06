import { Router } from "express";
import * as crypto from "crypto";
import { z } from "zod";
import appleSignin from "apple-signin-auth";
import { OAuth2Client } from "google-auth-library";
import { hashPassword, verifyPassword, generateToken } from "../lib/utils/auth";
import { isAuthenticated, generateJwtToken } from "../replitAuth";
import { storage } from "../storage";
import { updateProfileSchema } from "@shared/schema";
import { ErrorCode, createErrorResponse } from "@shared/errors";

// Google OAuth client for ID token verification
const googleClient = new OAuth2Client();

const router = Router();
const profileRouter = Router();

const SUPER_ADMIN_EMAIL = 's8869420@gmail.com';
const VALID_ROLES = ['traveler', 'merchant', 'specialist', 'admin'] as const;
const UNLIMITED_GENERATION_EMAILS = ["s8869420@gmail.com"];

// Email/Password Registration (Traveler only)
router.post('/register', async (req, res) => {
  try {
    const travelerRegisterSchema = z.object({
      email: z.string().email('請輸入有效的電子郵件'),
      password: z.string().min(6, '密碼至少6個字'),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    });
    
    const validated = travelerRegisterSchema.parse(req.body);
    
    const existingUser = await storage.getUserByEmail(validated.email);
    if (existingUser) {
      return res.status(400).json(createErrorResponse(ErrorCode.EMAIL_ALREADY_EXISTS));
    }
    
    const hashedPassword = hashPassword(validated.password);
    const userId = `email_${crypto.randomBytes(16).toString('hex')}`;
    
    const user = await storage.createUser({
      id: userId,
      email: validated.email,
      password: hashedPassword,
      firstName: validated.firstName || null,
      lastName: validated.lastName || null,
      role: 'traveler',
      isApproved: true,
      provider: 'email',
    });
    
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
router.post('/register/merchant', async (req, res) => {
  try {
    const merchantRegisterSchema = z.object({
      email: z.string().email('請輸入有效的電子郵件'),
      password: z.string().min(6, '密碼至少6個字'),
      businessName: z.string().min(1, '請輸入商家名稱'),
      contactName: z.string().min(1, '請輸入聯絡人名稱'),
      taxId: z.string().optional(),
      businessCategory: z.string().min(1, '請選擇產業類別'),
      address: z.string().min(1, '請輸入營業地址'),
      otherContact: z.string().optional(),
    });
    
    const validated = merchantRegisterSchema.parse(req.body);
    
    const existingUser = await storage.getUserByEmail(validated.email);
    if (existingUser) {
      return res.status(400).json(createErrorResponse(ErrorCode.EMAIL_ALREADY_EXISTS));
    }
    
    const hashedPassword = hashPassword(validated.password);
    const userId = `email_${crypto.randomBytes(16).toString('hex')}`;
    
    const user = await storage.createUser({
      id: userId,
      email: validated.email,
      password: hashedPassword,
      firstName: validated.contactName,
      lastName: null,
      role: 'merchant',
      isApproved: false,
      provider: 'email',
    });
    
    await storage.createMerchant({
      userId: user.id,
      email: validated.email,
      businessName: validated.businessName,
      ownerName: validated.contactName,
      taxId: validated.taxId || null,
      businessCategory: validated.businessCategory,
      address: validated.address,
      phone: validated.otherContact || null,
      name: validated.businessName,
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
router.post('/register/specialist', async (req, res) => {
  try {
    const specialistRegisterSchema = z.object({
      email: z.string().email('請輸入有效的電子郵件'),
      password: z.string().min(6, '密碼至少6個字'),
      name: z.string().min(1, '請輸入名稱'),
      otherContact: z.string().optional(),
      serviceRegion: z.string().optional(),
    });
    
    const validated = specialistRegisterSchema.parse(req.body);
    
    const existingUser = await storage.getUserByEmail(validated.email);
    if (existingUser) {
      return res.status(400).json(createErrorResponse(ErrorCode.EMAIL_ALREADY_EXISTS));
    }
    
    const hashedPassword = hashPassword(validated.password);
    const userId = `email_${crypto.randomBytes(16).toString('hex')}`;
    
    const user = await storage.createUser({
      id: userId,
      email: validated.email,
      password: hashedPassword,
      firstName: validated.name,
      lastName: null,
      role: 'specialist',
      isApproved: false,
      provider: 'email',
    });
    
    await storage.createSpecialist({
      userId: user.id,
      name: validated.name,
      serviceRegion: validated.serviceRegion || 'taipei',
      isAvailable: false,
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

// Email/Password Login with God Mode support
router.post('/login', async (req, res) => {
  try {
    const loginSchema = z.object({
      email: z.string().email('請輸入有效的電子郵件'),
      password: z.string().min(1, '請輸入密碼'),
      target_role: z.enum(VALID_ROLES).optional(),
    });
    
    const validated = loginSchema.parse(req.body);
    const targetRole = validated.target_role || 'traveler';
    
    const user = await storage.getUserByEmail(validated.email);
    if (!user || !user.password) {
      return res.status(401).json(createErrorResponse(ErrorCode.INVALID_CREDENTIALS));
    }
    
    if (!verifyPassword(validated.password, user.password)) {
      return res.status(401).json(createErrorResponse(ErrorCode.INVALID_CREDENTIALS));
    }
    
    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;
    
    if (isSuperAdmin) {
      console.log(`[GOD MODE] Super admin ${user.email} logging in as ${targetRole}`);
      
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
    
    if (user.role !== targetRole) {
      return res.status(403).json({ 
        error: `您的帳號角色為 ${user.role}，無法從 ${targetRole} 入口登入。請使用正確的入口或註冊新帳號。`,
        code: 'ROLE_MISMATCH',
        currentRole: user.role,
        targetRole: targetRole,
      });
    }
    
    if (user.role !== 'traveler' && !user.isApproved) {
      return res.status(403).json({ 
        error: '帳號審核中，請等待管理員核准',
        code: 'PENDING_APPROVAL',
        isApproved: user.isApproved 
      });
    }
    
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
router.post('/apple', async (req, res) => {
  console.log('[Apple Auth] Request received:', JSON.stringify({
    hasIdentityToken: !!req.body?.identityToken,
    hasIdToken: !!req.body?.idToken,
    hasUser: !!req.body?.user,
    portal: req.body?.portal,
    targetPortal: req.body?.targetPortal,
    keys: Object.keys(req.body || {}),
  }));
  
  try {
    const appleAuthSchema = z.object({
      identityToken: z.string().min(1).optional(),
      idToken: z.string().min(1).optional(),
      fullName: z.object({
        givenName: z.string().nullable().optional(),
        familyName: z.string().nullable().optional(),
      }).nullable().optional(),
      email: z.string().email().nullable().optional(),
      user: z.string().optional(),
      targetPortal: z.enum(['traveler', 'merchant', 'specialist', 'admin']).nullable().optional(),
      portal: z.enum(['traveler', 'merchant', 'specialist', 'admin']).nullable().optional(),
    }).refine(data => data.identityToken || data.idToken, {
      message: 'Either identityToken or idToken is required',
    });
    
    const validated = appleAuthSchema.parse(req.body);
    const identityToken = validated.identityToken || validated.idToken!;
    const { fullName, email } = validated;
    const targetPortal = validated.targetPortal || validated.portal || 'traveler';
    
    console.log(`[Apple Auth] Verifying token...`);
    
    const validAudiences = [
      process.env.APPLE_CLIENT_ID,
      'com.chaos.mibu.travel',
      'host.exp.Exponent',
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
    
    const userEmail = appleTokenPayload.email || email;
    const firstName = fullName?.givenName || null;
    const lastName = fullName?.familyName || null;
    
    console.log(`[Apple Auth] Verified. Email: ${userEmail}, Apple sub: ${appleTokenPayload.sub}`);
    
    const appleUserId = validated.user || appleTokenPayload.sub;
    const userId = `apple_${appleUserId}`;
    
    let existingUser = await storage.getUser(userId);
    
    if (!existingUser && userEmail) {
      const existingUserByEmail = await storage.getUserByEmail(userEmail);
      if (existingUserByEmail && existingUserByEmail.id !== userId) {
        console.log(`[Apple Auth] Found existing user with same email. Will merge: ${existingUserByEmail.id} -> ${userId}`);
        existingUser = existingUserByEmail;
      }
    }
    
    // 檢查用戶是否已存在且角色匹配
    let userRole: string = 'traveler';
    if (existingUser) {
      userRole = existingUser.role || 'traveler';
      
      // 超級管理員可以任意切換角色
      if (existingUser.email === SUPER_ADMIN_EMAIL) {
        userRole = targetPortal;
      }
      // 已存在用戶：驗證角色是否匹配請求的入口
      else if (targetPortal !== 'traveler' && userRole !== targetPortal) {
        return res.status(403).json({
          success: false,
          error: `您的帳號角色為 ${userRole}，無法從 ${targetPortal} 入口登入`,
          code: 'ROLE_MISMATCH',
          currentRole: userRole,
          targetPortal: targetPortal,
        });
      }
    } else {
      // 新用戶：只有 traveler 可以透過 OAuth 直接註冊
      // 商家/專員需要先用 Email 註冊，之後可透過 OAuth 登入
      if (targetPortal !== 'traveler') {
        return res.status(400).json({
          success: false,
          error: '請下載 Mibu App 註冊商家帳號，註冊後即可使用 Apple 登入',
          code: 'OAUTH_NEW_USER_TRAVELER_ONLY',
        });
      }
    }
    
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
    
    // Sync to auth_identities for multi-provider linking
    await storage.upsertAuthIdentity({
      userId: user.id,
      provider: 'apple',
      providerUserId: appleTokenPayload.sub,
      email: userEmail,
      emailVerified: appleTokenPayload.email_verified || false,
    });
    console.log(`[Apple Auth] Auth identity synced for provider=apple, sub=${appleTokenPayload.sub}`);
    
    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;
    
    if (!isSuperAdmin && user.role !== 'traveler' && !user.isApproved) {
      return res.status(403).json({
        success: false,
        error: '帳號審核中，請等待管理員核准',
        code: 'PENDING_APPROVAL',
      });
    }
    
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

// Google Sign In
router.post('/google', async (req, res) => {
  console.log('[Google Auth] Request received:', JSON.stringify({
    hasIdToken: !!req.body?.idToken,
    hasUser: !!req.body?.user,
    portal: req.body?.portal,
    targetPortal: req.body?.targetPortal,
    keys: Object.keys(req.body || {}),
  }));
  
  try {
    const googleAuthSchema = z.object({
      idToken: z.string().min(1, 'ID token is required'),
      user: z.object({
        id: z.string().min(1, 'Google user ID is required'),
        email: z.string().email().nullable().optional(),
        name: z.string().nullable().optional(),
        givenName: z.string().nullable().optional(),
        familyName: z.string().nullable().optional(),
        photo: z.string().nullable().optional(),
      }).optional(),
      targetPortal: z.enum(['traveler', 'merchant', 'specialist', 'admin']).nullable().optional(),
      portal: z.enum(['traveler', 'merchant', 'specialist', 'admin']).nullable().optional(),
    });
    
    const validated = googleAuthSchema.parse(req.body);
    const { idToken } = validated;
    const targetPortal = validated.targetPortal || validated.portal || 'traveler';
    
    // ⚠️ CRITICAL: Verify ID token with Google
    // This ensures the token is authentic and not forged
    const validAudiences = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      'host.exp.Exponent', // Expo development
    ].filter(Boolean) as string[];
    
    let googleTokenPayload: any;
    let verificationSucceeded = false;
    
    for (const audience of validAudiences) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: idToken,
          audience: audience,
        });
        googleTokenPayload = ticket.getPayload();
        verificationSucceeded = true;
        console.log(`[Google Auth] Token verified with audience: ${audience}`);
        break;
      } catch (verifyError: any) {
        console.log(`[Google Auth] Token verification failed for audience ${audience}: ${verifyError.message}`);
        continue;
      }
    }
    
    if (!verificationSucceeded || !googleTokenPayload) {
      console.error('[Google Auth] Token verification failed for all audiences');
      return res.status(401).json(createErrorResponse(ErrorCode.INVALID_CREDENTIALS, 'Google token verification failed'));
    }
    
    // Extract verified user info from Google's payload (not from client)
    const googleSub = googleTokenPayload.sub;
    const userEmail = googleTokenPayload.email || null;
    const emailVerified = googleTokenPayload.email_verified || false;
    const firstName = googleTokenPayload.given_name || googleTokenPayload.name?.split(' ')[0] || null;
    const lastName = googleTokenPayload.family_name || null;
    const profileImageUrl = googleTokenPayload.picture || null;
    
    console.log(`[Google Auth] Verified. Email: ${userEmail}, Google sub: ${googleSub}`);
    
    const userId = `google_${googleSub}`;
    
    let existingUser = await storage.getUser(userId);
    
    if (!existingUser && userEmail) {
      const existingUserByEmail = await storage.getUserByEmail(userEmail);
      if (existingUserByEmail && existingUserByEmail.id !== userId) {
        console.log(`[Google Auth] Found existing user with same email. Will merge: ${existingUserByEmail.id} -> ${userId}`);
        existingUser = existingUserByEmail;
      }
    }
    
    // 檢查用戶是否已存在且角色匹配
    let userRole: string = 'traveler';
    if (existingUser) {
      userRole = existingUser.role || 'traveler';
      
      // 超級管理員可以任意切換角色
      if (existingUser.email === SUPER_ADMIN_EMAIL) {
        userRole = targetPortal;
      }
      // 已存在用戶：驗證角色是否匹配請求的入口
      else if (targetPortal !== 'traveler' && userRole !== targetPortal) {
        return res.status(403).json({
          success: false,
          error: `您的帳號角色為 ${userRole}，無法從 ${targetPortal} 入口登入`,
          code: 'ROLE_MISMATCH',
          currentRole: userRole,
          targetPortal: targetPortal,
        });
      }
    } else {
      // 新用戶：只有 traveler 可以透過 OAuth 直接註冊
      // 商家/專員需要先用 Email 註冊，之後可透過 OAuth 登入
      if (targetPortal !== 'traveler') {
        return res.status(400).json({
          success: false,
          error: '請下載 Mibu App 註冊商家帳號，註冊後即可使用 Google 登入',
          code: 'OAUTH_NEW_USER_TRAVELER_ONLY',
        });
      }
    }
    
    const user = await storage.upsertUser({
      id: userId,
      email: userEmail,
      firstName: firstName,
      lastName: lastName,
      profileImageUrl: profileImageUrl,
      role: userRole,
      provider: 'google',
      isApproved: userRole === 'traveler' ? true : (existingUser?.isApproved || false),
    });
    
    console.log(`[Google Auth] User upserted: ${user.id}, role: ${user.role}`);
    
    // Sync to auth_identities for multi-provider linking
    await storage.upsertAuthIdentity({
      userId: user.id,
      provider: 'google',
      providerUserId: googleSub,
      email: userEmail,
      emailVerified: emailVerified,
    });
    console.log(`[Google Auth] Auth identity synced for provider=google, sub=${googleSub}`);
    
    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;
    
    if (!isSuperAdmin && user.role !== 'traveler' && !user.isApproved) {
      return res.status(403).json({
        success: false,
        error: '帳號審核中，請等待管理員核准',
        code: 'PENDING_APPROVAL',
      });
    }
    
    const token = generateToken(user.id, user.role || 'traveler');
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email || '',
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Google User',
        role: user.role,
        isApproved: user.isApproved,
        isSuperAdmin,
      },
    });
  } catch (error: any) {
    console.error('[Google Auth] Error:', error);
    if (error.name === 'ZodError') {
      const zodError = error as z.ZodError;
      const issues = zodError.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      console.error(`[Google Auth] Zod validation failed: ${issues}`);
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, `Invalid request data: ${issues}`));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, 'Google authentication failed'));
  }
});

// Get current authenticated user
router.get('/user', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
    
    const accessibleRoles = isSuperAdmin 
      ? ['traveler', 'merchant', 'specialist', 'admin'] 
      : [user?.role || 'traveler'];
    
    const jwtActiveRole = req.jwtUser?.activeRole;
    const sessionActiveRole = req.session?.activeRole;
    const activeRole = jwtActiveRole || sessionActiveRole || user?.role || 'traveler';
    
    console.log(`[/api/auth/user] userId: ${userId}, jwtActiveRole: ${jwtActiveRole}, sessionActiveRole: ${sessionActiveRole}, finalActiveRole: ${activeRole}`);
    
    const responseRole = isSuperAdmin ? activeRole : (user?.role || 'traveler');
    
    res.json({
      ...user,
      isSuperAdmin,
      accessibleRoles,
      activeRole: accessibleRoles.includes(activeRole) ? activeRole : (user?.role || 'traveler'),
      role: responseRole,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

// Switch active role (for super admin God Mode)
router.post('/switch-role', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
    
    const switchRoleSchema = z.object({
      role: z.enum(['traveler', 'merchant', 'specialist', 'admin']),
    });
    
    const { role: targetRole } = switchRoleSchema.parse(req.body);
    
    const accessibleRoles = isSuperAdmin 
      ? ['traveler', 'merchant', 'specialist', 'admin'] 
      : [user?.role || 'traveler'];
    
    if (!accessibleRoles.includes(targetRole)) {
      return res.status(403).json({ 
        error: '您沒有權限切換到此角色', 
        code: 'ROLE_NOT_ACCESSIBLE' 
      });
    }
    
    if (req.session) {
      req.session.activeRole = targetRole;
    }
    
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
      role: targetRole,
      token: newToken,
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
router.get('/privileges', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    const hasUnlimitedGeneration = user?.email && UNLIMITED_GENERATION_EMAILS.includes(user.email);
    res.json({ hasUnlimitedGeneration });
  } catch (error) {
    res.json({ hasUnlimitedGeneration: false });
  }
});

// Logout
router.post('/logout', async (req: any, res) => {
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
// Note: These routes should be mounted at /api (not /api/auth) to get /api/profile

profileRouter.get('/profile', isAuthenticated, async (req: any, res) => {
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

profileRouter.patch('/profile', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub || req.jwtUser?.userId;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

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

export { profileRouter };
export default router;

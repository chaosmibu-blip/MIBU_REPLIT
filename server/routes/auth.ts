import { Router } from "express";
import * as crypto from "crypto";
import { z } from "zod";
import appleSignin from "apple-signin-auth";
import { OAuth2Client } from "google-auth-library";
import { generateToken } from "../lib/utils/auth";
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

// 共用 OAuth 角色驗證函數
type OAuthRoleValidationResult =
  | { valid: true; userRole: string }
  | { valid: false; status: number; response: object };

function validateOAuthUserRole(
  existingUser: { role?: string | null; email?: string | null; isApproved?: boolean | null } | null,
  targetPortal: string,
  provider: 'apple' | 'google'
): OAuthRoleValidationResult {
  if (existingUser) {
    let userRole = existingUser.role || 'traveler';

    // 超級管理員可以任意切換角色
    if (existingUser.email === SUPER_ADMIN_EMAIL) {
      return { valid: true, userRole: targetPortal };
    }

    // 已存在用戶：驗證角色是否匹配請求的入口
    if (targetPortal !== 'traveler' && userRole !== targetPortal) {
      return {
        valid: false,
        status: 403,
        response: {
          success: false,
          error: `您的帳號角色為 ${userRole}，無法從 ${targetPortal} 入口登入`,
          code: 'ROLE_MISMATCH',
          currentRole: userRole,
          targetPortal,
        }
      };
    }

    return { valid: true, userRole };
  }

  // 新用戶：只有 traveler 可以透過 OAuth 直接註冊
  if (targetPortal !== 'traveler') {
    const providerName = provider === 'apple' ? 'Apple' : 'Google';
    return {
      valid: false,
      status: 400,
      response: {
        success: false,
        error: `請下載 Mibu App 註冊商家帳號，註冊後即可使用 ${providerName} 登入`,
        code: 'OAUTH_NEW_USER_TRAVELER_ONLY',
      }
    };
  }

  return { valid: true, userRole: 'traveler' };
}

// ============ 統一 Mobile OAuth 端點 ============

// Apple Token 驗證
async function verifyAppleToken(idToken: string, fullName?: { givenName?: string | null; familyName?: string | null } | null, email?: string | null, appleUser?: string) {
  const validAudiences = [
    process.env.APPLE_CLIENT_ID,
    'com.chaos.mibu.travel',
    'host.exp.Exponent',
  ].filter(Boolean) as string[];

  let tokenPayload: any;
  for (const audience of validAudiences) {
    try {
      tokenPayload = await appleSignin.verifyIdToken(idToken, {
        audience: audience,
        ignoreExpiration: false,
      });
      console.log(`[Apple Auth] Token verified with audience: ${audience}`);
      break;
    } catch (verifyError: any) {
      console.log(`[Apple Auth] Token verification failed for audience ${audience}: ${verifyError.message}`);
      continue;
    }
  }

  if (!tokenPayload) {
    throw new Error('Apple token verification failed');
  }

  return {
    providerSub: tokenPayload.sub,
    userId: `apple_${appleUser || tokenPayload.sub}`,
    email: tokenPayload.email || email || null,
    emailVerified: tokenPayload.email_verified || false,
    firstName: fullName?.givenName || null,
    lastName: fullName?.familyName || null,
    profileImageUrl: null,
  };
}

// Google Token 驗證
async function verifyGoogleToken(idToken: string) {
  const validAudiences = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    'host.exp.Exponent',
  ].filter(Boolean) as string[];

  let tokenPayload: any;
  for (const audience of validAudiences) {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: idToken,
        audience: audience,
      });
      tokenPayload = ticket.getPayload();
      console.log(`[Google Auth] Token verified with audience: ${audience}`);
      break;
    } catch (verifyError: any) {
      console.log(`[Google Auth] Token verification failed for audience ${audience}: ${verifyError.message}`);
      continue;
    }
  }

  if (!tokenPayload) {
    throw new Error('Google token verification failed');
  }

  return {
    providerSub: tokenPayload.sub,
    userId: `google_${tokenPayload.sub}`,
    email: tokenPayload.email || null,
    emailVerified: tokenPayload.email_verified || false,
    firstName: tokenPayload.given_name || tokenPayload.name?.split(' ')[0] || null,
    lastName: tokenPayload.family_name || null,
    profileImageUrl: tokenPayload.picture || null,
  };
}

// 統一 Mobile OAuth (Apple/Google)
router.post('/mobile', async (req, res) => {
  const provider = req.body?.provider;
  console.log(`[Mobile Auth] Request received: provider=${provider}`, JSON.stringify({
    hasIdToken: !!req.body?.idToken,
    hasIdentityToken: !!req.body?.identityToken,
    portal: req.body?.portal,
    targetPortal: req.body?.targetPortal,
    keys: Object.keys(req.body || {}),
  }));

  try {
    const mobileAuthSchema = z.object({
      provider: z.enum(['apple', 'google']),
      idToken: z.string().min(1).optional(),
      identityToken: z.string().min(1).optional(),
      fullName: z.object({
        givenName: z.string().nullable().optional(),
        familyName: z.string().nullable().optional(),
      }).nullable().optional(),
      email: z.string().email().nullable().optional(),
      user: z.string().optional(),
      targetPortal: z.enum(['traveler', 'merchant', 'specialist', 'admin']).nullable().optional(),
      portal: z.enum(['traveler', 'merchant', 'specialist', 'admin']).nullable().optional(),
    }).refine(data => data.idToken || data.identityToken, {
      message: 'idToken or identityToken is required',
    });

    const validated = mobileAuthSchema.parse(req.body);
    const idToken = validated.idToken || validated.identityToken!;
    const targetPortal = validated.targetPortal || validated.portal || 'traveler';

    // 根據 provider 驗證 token
    let verifiedData: {
      providerSub: string;
      userId: string;
      email: string | null;
      emailVerified: boolean;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
    };

    if (validated.provider === 'apple') {
      verifiedData = await verifyAppleToken(idToken, validated.fullName, validated.email, validated.user);
    } else {
      verifiedData = await verifyGoogleToken(idToken);
    }

    console.log(`[Mobile Auth] Verified (${validated.provider}). Email: ${verifiedData.email}, sub: ${verifiedData.providerSub}`);

    // 查找現有用戶
    let existingUser = await storage.getUser(verifiedData.userId);
    if (!existingUser && verifiedData.email) {
      const existingUserByEmail = await storage.getUserByEmail(verifiedData.email);
      if (existingUserByEmail && existingUserByEmail.id !== verifiedData.userId) {
        console.log(`[Mobile Auth] Found existing user with same email. Will merge: ${existingUserByEmail.id} -> ${verifiedData.userId}`);
        existingUser = existingUserByEmail;
      }
    }

    // 驗證角色
    const roleValidation = validateOAuthUserRole(existingUser, targetPortal, validated.provider);
    if (!roleValidation.valid) {
      return res.status(roleValidation.status).json(roleValidation.response);
    }
    const userRole = roleValidation.userRole;

    // 建立或更新用戶
    const user = await storage.upsertUser({
      id: verifiedData.userId,
      email: verifiedData.email,
      firstName: verifiedData.firstName,
      lastName: verifiedData.lastName,
      profileImageUrl: verifiedData.profileImageUrl,
      role: userRole,
      provider: validated.provider,
      isApproved: userRole === 'traveler' ? true : (existingUser?.isApproved || false),
    });

    console.log(`[Mobile Auth] User upserted: ${user.id}, role: ${user.role}`);

    // 同步到 auth_identities
    await storage.upsertAuthIdentity({
      userId: user.id,
      provider: validated.provider,
      providerUserId: verifiedData.providerSub,
      email: verifiedData.email,
      emailVerified: verifiedData.emailVerified,
    });
    console.log(`[Mobile Auth] Auth identity synced for provider=${validated.provider}, sub=${verifiedData.providerSub}`);

    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;

    if (!isSuperAdmin && user.role !== 'traveler' && !user.isApproved) {
      return res.status(403).json(createErrorResponse(ErrorCode.PENDING_APPROVAL, '帳號審核中，請等待管理員核准'));
    }

    const token = generateToken(user.id, user.role || 'traveler');
    const providerName = validated.provider === 'apple' ? 'Apple' : 'Google';

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email || '',
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || `${providerName} User`,
        role: user.role,
        isApproved: user.isApproved,
        isSuperAdmin,
      },
    });
  } catch (error: any) {
    console.error(`[Mobile Auth] Error:`, error);
    if (error.name === 'ZodError') {
      const zodError = error as z.ZodError;
      const issues = zodError.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, `Invalid request data: ${issues}`));
    }
    if (error.message?.includes('token verification failed')) {
      return res.status(401).json(createErrorResponse(ErrorCode.INVALID_CREDENTIALS, error.message));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, 'Mobile authentication failed'));
  }
});

// 向後兼容：保留舊的 /apple 和 /google 端點作為轉發
router.post('/apple', async (req, res) => {
  req.body.provider = 'apple';
  req.url = '/mobile';
  router.handle(req, res, () => {});
});

router.post('/google', async (req, res) => {
  req.body.provider = 'google';
  req.url = '/mobile';
  router.handle(req, res, () => {});
});

// Get current authenticated user (包含 privileges)
router.get('/user', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);

    const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
    const hasUnlimitedGeneration = user?.email && UNLIMITED_GENERATION_EMAILS.includes(user.email);

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
      privileges: { hasUnlimitedGeneration },
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, 'Failed to fetch user'));
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
      return res.status(403).json(createErrorResponse(ErrorCode.ROLE_NOT_ACCESSIBLE, '您沒有權限切換到此角色'));
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
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_ROLE, '無效的角色'));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '切換角色失敗'));
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

// 共用的 profile 更新邏輯
async function handleProfileUpdate(req: any, res: any) {
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

    // 產生新的 JWT token 以包含更新後的 firstName/lastName
    const newToken = generateJwtToken(updatedUser, updatedUser.role || 'traveler');

    res.json({
      success: true,
      message: '個人資料已更新',
      token: newToken,
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
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '資料格式錯誤', error.errors));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法更新用戶資料'));
  }
}

// PATCH 和 PUT 都支援更新 profile
profileRouter.patch('/profile', isAuthenticated, handleProfileUpdate);
profileRouter.put('/profile', isAuthenticated, handleProfileUpdate);

// 向後兼容：/user/profile 轉發到 /profile
profileRouter.get('/user/profile', isAuthenticated, (req: any, res: any, next: any) => {
  req.url = '/profile';
  profileRouter.handle(req, res, next);
});
profileRouter.put('/user/profile', isAuthenticated, handleProfileUpdate);
profileRouter.patch('/user/profile', isAuthenticated, handleProfileUpdate);

export { profileRouter };
export default router;

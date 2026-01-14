import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../replitAuth";
import { z } from "zod";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

router.get("/applications/pending", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const applications = await storage.getPendingApplicationsWithDetails();
    res.json({ applications });
  } catch (error) {
    console.error("Get pending applications error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得待審核申請失敗'));
  }
});

router.patch("/applications/:id/review", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const applicationId = parseInt(req.params.id);
    const { status, reviewNotes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, "狀態必須是 'approved' 或 'rejected'"));
    }

    const application = await storage.getPlaceApplicationById(applicationId);
    if (!application) return res.status(404).json(createErrorResponse(ErrorCode.APPLICATION_NOT_FOUND));

    const updated = await storage.updatePlaceApplication(applicationId, {
      status,
      reviewedBy: userId,
      reviewedAt: new Date(),
      reviewNotes,
    });

    await storage.updatePlaceDraft(application.placeDraftId, { status });

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

          await storage.updatePlaceApplication(applicationId, { placeCacheId: newPlace.id });

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
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '審核申請失敗'));
  }
});

router.get("/place-cache/review-stats", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const stats = await storage.getPlaceCacheReviewStats();
    res.json(stats);
  } catch (error) {
    console.error("Get cache review stats error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得審核統計失敗'));
  }
});

router.get("/users/pending", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

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
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得待審核用戶失敗'));
  }
});

router.patch("/users/:id/approve", isAuthenticated, async (req: any, res) => {
  try {
    const adminId = req.user?.claims?.sub;
    if (!adminId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const admin = await storage.getUser(adminId);
    if (admin?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const targetUserId = req.params.id;
    const { approved } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, 'approved 必須是布林值'));
    }

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) return res.status(404).json(createErrorResponse(ErrorCode.USER_NOT_FOUND));

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
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '審核用戶失敗'));
  }
});

router.get("/users", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

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
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得用戶列表失敗'));
  }
});

// ============ 角色申請審核 (新版多角色系統) ============

/**
 * GET /api/admin/role-applications
 * 取得所有待審核的角色申請
 */
router.get("/role-applications", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const roleFilter = req.query.role as string;

    let applications;
    if (roleFilter) {
      applications = await storage.getPendingRolesByType(roleFilter as any);
    } else {
      applications = await storage.getPendingRoleApplications();
    }

    res.json({
      applications: applications.map(app => ({
        id: app.id,
        userId: app.userId,
        role: app.role,
        status: app.status,
        appliedAt: app.appliedAt,
        user: {
          id: app.user.id,
          email: app.user.email,
          firstName: app.user.firstName,
          lastName: app.user.lastName,
          provider: app.user.provider,
        }
      }))
    });
  } catch (error) {
    console.error("Get role applications error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得角色申請失敗'));
  }
});

/**
 * PATCH /api/admin/role-applications/:id/approve
 * 核准角色申請
 */
router.patch("/role-applications/:id/approve", isAuthenticated, async (req: any, res) => {
  try {
    const adminId = req.user?.claims?.sub;
    if (!adminId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const admin = await storage.getUser(adminId);
    if (admin?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const roleId = parseInt(req.params.id);
    const role = await storage.approveRole(roleId, adminId);

    if (!role) {
      return res.status(404).json(createErrorResponse(ErrorCode.NOT_FOUND, '找不到該角色申請'));
    }

    res.json({
      success: true,
      role,
      message: `已核准 ${role.role} 角色申請`
    });
  } catch (error) {
    console.error("Approve role error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '核准角色失敗'));
  }
});

/**
 * PATCH /api/admin/role-applications/:id/reject
 * 拒絕角色申請
 */
router.patch("/role-applications/:id/reject", isAuthenticated, async (req: any, res) => {
  try {
    const adminId = req.user?.claims?.sub;
    if (!adminId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const admin = await storage.getUser(adminId);
    if (admin?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const roleId = parseInt(req.params.id);
    const { reason } = req.body;

    const role = await storage.rejectRole(roleId, adminId, reason);

    if (!role) {
      return res.status(404).json(createErrorResponse(ErrorCode.NOT_FOUND, '找不到該角色申請'));
    }

    res.json({
      success: true,
      role,
      message: `已拒絕 ${role.role} 角色申請`
    });
  } catch (error) {
    console.error("Reject role error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '拒絕角色失敗'));
  }
});

/**
 * GET /api/admin/user/:id/roles
 * 取得特定用戶的所有角色
 */
router.get("/user/:id/roles", isAuthenticated, async (req: any, res) => {
  try {
    const adminId = req.user?.claims?.sub;
    if (!adminId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const admin = await storage.getUser(adminId);
    if (admin?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const targetUserId = req.params.id;
    const roles = await storage.getUserRoles(targetUserId);

    res.json({ roles });
  } catch (error) {
    console.error("Get user roles error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得用戶角色失敗'));
  }
});

router.get("/global-exclusions", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const { district, city } = req.query;
    const exclusions = await storage.getGlobalExclusions(
      district as string | undefined,
      city as string | undefined
    );
    res.json({ exclusions });
  } catch (error) {
    console.error("Get global exclusions error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得全域排除清單失敗'));
  }
});

router.post("/global-exclusions", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

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
      return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', error.errors));
    }
    console.error("Add global exclusion error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '新增全域排除失敗'));
  }
});

router.delete("/global-exclusions/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const exclusionId = parseInt(req.params.id);
    const removed = await storage.removeGlobalExclusion(exclusionId);

    if (!removed) {
      return res.status(404).json(createErrorResponse(ErrorCode.EXCLUSION_NOT_FOUND));
    }

    res.json({ success: true, message: "Global exclusion removed" });
  } catch (error) {
    console.error("Remove global exclusion error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '移除全域排除失敗'));
  }
});

export default router;

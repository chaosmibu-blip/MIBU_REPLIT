import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../replitAuth";
import { z } from "zod";

const router = Router();

router.get("/applications/pending", isAuthenticated, async (req: any, res) => {
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

router.patch("/applications/:id/review", isAuthenticated, async (req: any, res) => {
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
    res.status(500).json({ error: "Failed to review application" });
  }
});

router.get("/place-cache/review-stats", isAuthenticated, async (req: any, res) => {
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

router.get("/users/pending", isAuthenticated, async (req: any, res) => {
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

router.patch("/users/:id/approve", isAuthenticated, async (req: any, res) => {
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

router.get("/users", isAuthenticated, async (req: any, res) => {
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

router.get("/global-exclusions", isAuthenticated, async (req: any, res) => {
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

router.post("/global-exclusions", isAuthenticated, async (req: any, res) => {
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

router.delete("/global-exclusions/:id", isAuthenticated, async (req: any, res) => {
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

export default router;

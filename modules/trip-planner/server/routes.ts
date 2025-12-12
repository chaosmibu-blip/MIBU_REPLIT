import { Router } from "express";
import { isAuthenticated } from "../../../server/replitAuth";
import { tripPlannerStorage } from "./storage";

export function createTripPlannerRoutes(): Router {
  const router = Router();

  router.get("/plans", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const plans = await tripPlannerStorage.getUserTripPlans(userId);
      res.json({ success: true, plans });
    } catch (error) {
      console.error("Error fetching trip plans:", error);
      res.status(500).json({ error: "Failed to fetch trip plans" });
    }
  });

  router.post("/plans", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { title, destination, startDate, endDate, destinationCity, destinationCountry } = req.body;
      if (!title || !destination || !startDate || !endDate) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const plan = await tripPlannerStorage.createTripPlan({
        userId,
        title,
        destination,
        startDate,
        endDate,
        destinationCity,
        destinationCountry,
        status: 'draft',
      });
      res.json({ success: true, plan });
    } catch (error) {
      console.error("Error creating trip plan:", error);
      res.status(500).json({ error: "Failed to create trip plan" });
    }
  });

  router.get("/plans/:planId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const planId = parseInt(req.params.planId);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const plan = await tripPlannerStorage.getTripPlanWithDetails(planId, userId);
      if (!plan) {
        return res.status(404).json({ error: "Trip plan not found" });
      }
      res.json({ success: true, plan });
    } catch (error) {
      console.error("Error fetching trip plan:", error);
      res.status(500).json({ error: "Failed to fetch trip plan" });
    }
  });

  router.post("/plans/:planId/days/:dayId/activities", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const dayId = parseInt(req.params.dayId);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { placeName, placeId, category, subcategory, description, address, timeSlot, duration, isFromGacha } = req.body;
      if (!placeName) {
        return res.status(400).json({ error: "Place name is required" });
      }
      const activity = await tripPlannerStorage.addActivity({
        tripDayId: dayId,
        placeName,
        placeId,
        category,
        subcategory,
        description,
        address,
        timeSlot: timeSlot || 'morning',
        duration,
        isFromGacha: isFromGacha || false,
        orderIndex: 0,
      });
      res.json({ success: true, activity });
    } catch (error) {
      console.error("Error adding activity:", error);
      res.status(500).json({ error: "Failed to add activity" });
    }
  });

  router.delete("/activities/:activityId", isAuthenticated, async (req: any, res) => {
    try {
      const activityId = parseInt(req.params.activityId);
      await tripPlannerStorage.deleteActivity(activityId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting activity:", error);
      res.status(500).json({ error: "Failed to delete activity" });
    }
  });

  return router;
}

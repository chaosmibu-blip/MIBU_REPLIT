import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertCollectionSchema, insertMerchantSchema, insertCouponSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============ Auth Routes ============
  
  // Get current user or create guest user
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { name, email, avatar, provider, providerId } = req.body;

      let user;
      
      // OAuth login (Google/Replit)
      if (provider && providerId) {
        user = await storage.getUserByProvider(provider, providerId);
        if (!user) {
          user = await storage.createUser({
            name,
            email: email || null,
            avatar: avatar || null,
            provider,
            providerId,
          });
        }
      } 
      // Guest login
      else if (name) {
        user = await storage.createUser({
          name,
          email: null,
          avatar: avatar || null,
          provider: 'guest',
          providerId: null,
        });
      } else {
        return res.status(400).json({ error: "Invalid login data" });
      }

      res.json({ user });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/user/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // ============ Collection Routes ============
  
  app.get("/api/collections/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const items = await storage.getUserCollections(userId);
      res.json({ collections: items });
    } catch (error) {
      console.error("Fetch collections error:", error);
      res.status(500).json({ error: "Failed to fetch collections" });
    }
  });

  app.post("/api/collections", async (req, res) => {
    try {
      const validated = insertCollectionSchema.parse(req.body);
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
  
  app.get("/api/merchant/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const merchant = await storage.getMerchantByUserId(userId);
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      res.json({ merchant });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch merchant" });
    }
  });

  app.post("/api/merchant", async (req, res) => {
    try {
      const validated = insertMerchantSchema.parse(req.body);
      const merchant = await storage.createMerchant(validated);
      res.json({ merchant });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create merchant" });
    }
  });

  app.patch("/api/merchant/:id/plan", async (req, res) => {
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
  
  app.get("/api/coupons/merchant/:merchantId", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const allCoupons = await storage.getMerchantCoupons(merchantId);
      res.json({ coupons: allCoupons });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch coupons" });
    }
  });

  app.get("/api/coupons/active/:merchantId", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const activeCoupons = await storage.getActiveCoupons(merchantId);
      res.json({ coupons: activeCoupons });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active coupons" });
    }
  });

  app.post("/api/coupons", async (req, res) => {
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

  app.patch("/api/coupons/:id", async (req, res) => {
    try {
      const couponId = parseInt(req.params.id);
      const coupon = await storage.updateCoupon(couponId, req.body);
      res.json({ coupon });
    } catch (error) {
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });

  // ============ Gacha/Itinerary Generation ============
  // This will be handled by the existing geminiService.ts on the frontend
  // but we could add a backend proxy here if needed for API key security

  return httpServer;
}

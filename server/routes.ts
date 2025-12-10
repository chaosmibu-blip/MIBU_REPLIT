import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertCollectionSchema, insertMerchantSchema, insertCouponSchema } from "@shared/schema";
import { z } from "zod";

const RECUR_API_URL = "https://api.recur.tw/v1";
const RECUR_PREMIUM_PLAN_ID = "adkwbl9dya0wc6b53parl9yk";
const UNLIMITED_GENERATION_EMAILS = ["s8869420@gmail.com"];

async function callGemini(prompt: string): Promise<string> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini API not configured");
  }

  const response = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 8192,
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", errorText);
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);

  // ============ Auth Routes ============
  
  // Get current authenticated user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
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

  // ============ Gemini AI Itinerary Generation ============
  
  app.post("/api/generate-itinerary", async (req, res) => {
    try {
      const { country, city, level, language, collectedNames } = req.body;
      
      const langMap: Record<string, string> = {
        'zh-TW': '繁體中文',
        'en': 'English',
        'ja': '日本語',
        'ko': '한국어'
      };
      const outputLang = langMap[language] || 'English';
      
      const itemCount = Math.min(8, Math.max(3, Math.floor(level / 1.5)));
      
      const prompt = `You are a travel expert AI for a gacha-style travel app. Generate ${itemCount} unique travel recommendations for ${city}, ${country}.

IMPORTANT RULES:
1. Output ONLY valid JSON, no markdown, no explanation
2. Each place must be REAL and actually exist in ${city}
3. Do NOT include any places from this list: ${collectedNames.join(', ')}
4. Mix different categories: Food, Stay, Scenery, Shopping, Entertainment, Education, Activity
5. Assign rarity based on how special/unique the place is:
   - SP (5%): Legendary, once-in-a-lifetime experiences
   - SSR (10%): Very rare, hidden gems only locals know
   - SR (15%): Special places worth going out of your way for
   - S (20%): Good quality, recommended spots
   - R (50%): Nice everyday places

Output language: ${outputLang}

Return this exact JSON structure:
{
  "status": "success",
  "meta": {
    "date": "${new Date().toISOString().split('T')[0]}",
    "country": "${country}",
    "city": "${city}",
    "locked_district": "a specific district/area name in ${city}",
    "user_level": ${level}
  },
  "inventory": [
    {
      "id": 1,
      "place_name": "Real place name",
      "description": "2-3 sentence description of why this place is special",
      "category": "Food|Stay|Scenery|Shopping|Entertainment|Education|Activity",
      "suggested_time": "10:00",
      "duration": "1.5 hours",
      "search_query": "place name ${city}",
      "rarity": "R|S|SR|SSR|SP",
      "color_hex": "#6366f1",
      "city": "${city}",
      "country": "${country}",
      "is_coupon": false,
      "coupon_data": null,
      "operating_status": "OPEN"
    }
  ]
}`;

      const responseText = await callGemini(prompt);

      let jsonText = responseText || '';
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const data = JSON.parse(jsonText);
      
      data.inventory = data.inventory.map((item: any, idx: number) => ({
        ...item,
        id: Date.now() + idx
      }));

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

  const httpServer = createServer(app);
  return httpServer;
}

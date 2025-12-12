import type { Express } from "express";
import { isAuthenticated } from "../../../server/replitAuth";
import { plannerServiceStorage } from "./planner-storage";
import { z } from "zod";
import twilio from "twilio";

const { AccessToken } = twilio.jwt;
const ChatGrant = AccessToken.ChatGrant;

export function createPlannerServiceRoutes(app: Express) {
  app.get("/api/planner/service-plans", async (req, res) => {
    try {
      const plans = await plannerServiceStorage.getActiveServicePlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching service plans:", error);
      res.status(500).json({ error: "Failed to fetch service plans" });
    }
  });

  app.get("/api/planner/service-plans/:id", async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const plan = await plannerServiceStorage.getServicePlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Service plan not found" });
      }
      res.json(plan);
    } catch (error) {
      console.error("Error fetching service plan:", error);
      res.status(500).json({ error: "Failed to fetch service plan" });
    }
  });

  app.get("/api/planner/orders", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const orders = await plannerServiceStorage.getUserOrders(userId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/planner/orders/:id", isAuthenticated, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const order = await plannerServiceStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const userId = (req.user as any).claims.sub;
      if (order.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  app.post("/api/planner/orders", isAuthenticated, async (req, res) => {
    const createOrderSchema = z.object({
      servicePlanId: z.number(),
      paymentMethod: z.enum(['stripe', 'payuni']),
    });

    try {
      const validated = createOrderSchema.parse(req.body);
      const userId = (req.user as any).claims.sub;

      const servicePlan = await plannerServiceStorage.getServicePlan(validated.servicePlanId);
      if (!servicePlan) {
        return res.status(404).json({ error: "Service plan not found" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (servicePlan.durationDays || 7));

      const order = await plannerServiceStorage.createOrder({
        userId,
        servicePlanId: validated.servicePlanId,
        status: 'pending',
        paymentMethod: validated.paymentMethod,
        currency: validated.paymentMethod === 'stripe' ? 'USD' : 'TWD',
        amountPaid: validated.paymentMethod === 'stripe' ? servicePlan.priceUsd : servicePlan.priceNtd,
        expiresAt,
      });

      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.post("/api/planner/orders/:id/complete-payment", isAuthenticated, async (req, res) => {
    const paymentSchema = z.object({
      paymentId: z.string(),
    });

    try {
      const orderId = parseInt(req.params.id);
      const validated = paymentSchema.parse(req.body);
      const userId = (req.user as any).claims.sub;

      const order = await plannerServiceStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (order.status !== 'pending') {
        return res.status(400).json({ error: "Order already processed" });
      }

      let updatedOrder = await plannerServiceStorage.updateOrder(orderId, {
        status: 'paid',
        paymentId: validated.paymentId,
        paidAt: new Date(),
      });

      const planner = await plannerServiceStorage.findAvailablePlanner();
      
      if (planner) {
        let conversationSid: string | undefined;

        try {
          const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
          const twilioApiKeySid = process.env.TWILIO_API_KEY_SID;
          const twilioApiKeySecret = process.env.TWILIO_API_KEY_SECRET;
          const twilioConversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

          if (twilioAccountSid && twilioApiKeySid && twilioApiKeySecret && twilioConversationsServiceSid) {
            const twilioClient = twilio(twilioApiKeySid, twilioApiKeySecret, { accountSid: twilioAccountSid });
            
            const conversation = await twilioClient.conversations.v1
              .services(twilioConversationsServiceSid)
              .conversations.create({
                friendlyName: `Order ${order.orderNumber} - Planner Chat`,
                uniqueName: `order-${order.orderNumber}`,
              });
            
            conversationSid = conversation.sid;

            await twilioClient.conversations.v1
              .services(twilioConversationsServiceSid)
              .conversations(conversation.sid)
              .participants.create({ identity: userId });

            await twilioClient.conversations.v1
              .services(twilioConversationsServiceSid)
              .conversations(conversation.sid)
              .participants.create({ identity: planner.userId });
          }
        } catch (twilioError) {
          console.error("Error creating Twilio conversation:", twilioError);
        }

        updatedOrder = await plannerServiceStorage.updateOrder(orderId, {
          plannerId: planner.id,
          status: 'assigned',
          assignedAt: new Date(),
          conversationSid,
        });

        await plannerServiceStorage.incrementPlannerOrderCount(planner.id);

        res.json({
          order: updatedOrder,
          planner: {
            id: planner.id,
            displayName: planner.displayName,
            profileImageUrl: planner.profileImageUrl,
          },
          conversationSid,
        });
      } else {
        res.json({
          order: updatedOrder,
          planner: null,
          message: "No planner available, will be assigned shortly",
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error completing payment:", error);
      res.status(500).json({ error: "Failed to complete payment" });
    }
  });

  app.get("/api/planner/my-profile", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const planner = await plannerServiceStorage.getPlannerByUserId(userId);
      if (!planner) {
        return res.status(404).json({ error: "Not a planner" });
      }
      res.json(planner);
    } catch (error) {
      console.error("Error fetching planner profile:", error);
      res.status(500).json({ error: "Failed to fetch planner profile" });
    }
  });

  app.get("/api/planner/my-orders", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const planner = await plannerServiceStorage.getPlannerByUserId(userId);
      if (!planner) {
        return res.status(404).json({ error: "Not a planner" });
      }
      const orders = await plannerServiceStorage.getPlannerOrders(planner.id);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching planner orders:", error);
      res.status(500).json({ error: "Failed to fetch planner orders" });
    }
  });

  app.patch("/api/planner/my-profile", isAuthenticated, async (req, res) => {
    const updateSchema = z.object({
      displayName: z.string().optional(),
      bio: z.string().optional(),
      profileImageUrl: z.string().optional(),
      specialties: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      isAvailable: z.boolean().optional(),
    });

    try {
      const userId = (req.user as any).claims.sub;
      const validated = updateSchema.parse(req.body);
      
      const planner = await plannerServiceStorage.getPlannerByUserId(userId);
      if (!planner) {
        return res.status(404).json({ error: "Not a planner" });
      }

      const updated = await plannerServiceStorage.updatePlanner(planner.id, validated);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating planner profile:", error);
      res.status(500).json({ error: "Failed to update planner profile" });
    }
  });

  app.post("/api/admin/planners", isAuthenticated, async (req, res) => {
    const createPlannerSchema = z.object({
      userId: z.string(),
      displayName: z.string(),
      bio: z.string().optional(),
      profileImageUrl: z.string().optional(),
      specialties: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
    });

    try {
      const validated = createPlannerSchema.parse(req.body);
      
      const existingPlanner = await plannerServiceStorage.getPlannerByUserId(validated.userId);
      if (existingPlanner) {
        return res.status(400).json({ error: "User is already a planner" });
      }

      const planner = await plannerServiceStorage.createPlanner({
        userId: validated.userId,
        displayName: validated.displayName,
        bio: validated.bio,
        profileImageUrl: validated.profileImageUrl,
        specialties: validated.specialties,
        languages: validated.languages,
        isVerified: true,
        isAvailable: true,
      });

      res.json(planner);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating planner:", error);
      res.status(500).json({ error: "Failed to create planner" });
    }
  });

  app.post("/api/admin/service-plans", isAuthenticated, async (req, res) => {
    const createPlanSchema = z.object({
      code: z.string(),
      nameZh: z.string(),
      nameEn: z.string(),
      description: z.string().optional(),
      features: z.array(z.string()).optional(),
      priceNtd: z.number(),
      priceUsd: z.number().optional(),
      durationDays: z.number().optional(),
      maxMessages: z.number().optional(),
      sortOrder: z.number().optional(),
    });

    try {
      const validated = createPlanSchema.parse(req.body);
      
      const existingPlan = await plannerServiceStorage.getServicePlanByCode(validated.code);
      if (existingPlan) {
        return res.status(400).json({ error: "Plan code already exists" });
      }

      const plan = await plannerServiceStorage.createServicePlan(validated);
      res.json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating service plan:", error);
      res.status(500).json({ error: "Failed to create service plan" });
    }
  });
}

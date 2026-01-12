import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../replitAuth";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

// ============ Recur 金流相關 ============

const RECUR_API_URL = "https://api.recur.tw/v1";
const RECUR_PREMIUM_PLAN_ID = "adkwbl9dya0wc6b53parl9yk";

router.post("/checkout/create-session", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const { customerEmail } = req.body;

    const secretKey = process.env.RECUR_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json(createErrorResponse(ErrorCode.PAYMENT_NOT_CONFIGURED));
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
      return res.status(response.status).json(createErrorResponse(ErrorCode.PAYMENT_FAILED, data.error || 'Checkout failed'));
    }

    res.json({ url: data.url, sessionId: data.id });
  } catch (error) {
    console.error("Create checkout session error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, 'Failed to create checkout session'));
  }
});

router.get("/checkout/session/:sessionId", isAuthenticated, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const secretKey = process.env.RECUR_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json(createErrorResponse(ErrorCode.PAYMENT_NOT_CONFIGURED));
    }

    const response = await fetch(`${RECUR_API_URL}/checkout/sessions/${sessionId}`, {
      headers: {
        "Authorization": `Bearer ${secretKey}`,
      },
    });

    const session = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(createErrorResponse(ErrorCode.SERVER_ERROR, session.error));
    }

    res.json({ session });
  } catch (error) {
    console.error("Fetch checkout session error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, 'Failed to fetch session'));
  }
});

router.post("/webhooks/recur", async (req, res) => {
  try {
    const event = req.body;
    console.log("=== Recur Webhook Received ===");
    console.log("Event Type:", event.type);
    console.log("Event Data:", JSON.stringify(event, null, 2));

    switch (event.type) {
      case "checkout.completed": {
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
        const invoice = event.data;
        console.log(`[invoice.paid] Invoice ${invoice.id} paid`);
        break;
      }

      case "invoice.payment_failed": {
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
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, 'Webhook processing failed'));
  }
});

router.get("/webhooks/recur/info", (req, res) => {
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

export default router;

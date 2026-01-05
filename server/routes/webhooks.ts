import { Router, raw } from "express";
import { getUncachableStripeClient } from "../stripeClient";
import { subscriptionStorage } from "../storage/subscriptionStorage";
import { db } from "../db";
import { merchants, places } from "@shared/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { storage } from "../storage";
import { emitSubscriptionUpdated } from "../socketHandler";

const router = Router();

type SubscriptionEventType = 
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.cancelled'
  | 'subscription.renewed'
  | 'payment.succeeded'
  | 'payment.failed';

interface NormalizedSubscriptionEvent {
  type: SubscriptionEventType;
  subscriptionId: string;
  merchantId: number;
  tier: 'free' | 'pro' | 'premium';
  subscriptionType: 'merchant' | 'place';
  placeId?: number;
  currentPeriodEnd?: Date;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  provider: 'stripe' | 'recur';
}

function mapStripeStatus(status: string): 'active' | 'cancelled' | 'past_due' | 'trialing' {
  switch (status) {
    case 'active': return 'active';
    case 'canceled': return 'cancelled';
    case 'past_due': return 'past_due';
    case 'trialing': return 'trialing';
    default: return 'cancelled';
  }
}

function mapStripePriceToTier(priceId: string): 'free' | 'pro' | 'premium' {
  if (priceId === process.env.STRIPE_MERCHANT_PRO_PRICE_ID || priceId === process.env.STRIPE_PLACE_PRO_PRICE_ID) {
    return 'pro';
  }
  if (priceId === process.env.STRIPE_MERCHANT_PREMIUM_PRICE_ID || priceId === process.env.STRIPE_PLACE_PREMIUM_PRICE_ID) {
    return 'premium';
  }
  return 'free';
}

async function normalizeStripeEvent(event: Stripe.Event): Promise<NormalizedSubscriptionEvent | null> {
  let eventType: SubscriptionEventType;
  let subscription: Stripe.Subscription;
  let metadata: Record<string, string>;

  const isInvoiceEvent = event.type.startsWith('invoice.');

  if (isInvoiceEvent) {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoice.subscription as string;
    
    if (!subscriptionId) return null;

    try {
      const stripe = await getUncachableStripeClient();
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.error(`[Stripe Webhook] Failed to retrieve subscription ${subscriptionId}:`, error);
      return null;
    }

    metadata = subscription.metadata || {};
    
    switch (event.type) {
      case 'invoice.payment_succeeded':
        eventType = 'payment.succeeded';
        break;
      case 'invoice.payment_failed':
        eventType = 'payment.failed';
        break;
      default:
        return null;
    }
  } else {
    subscription = event.data.object as Stripe.Subscription;
    metadata = subscription.metadata || {};

    switch (event.type) {
      case 'customer.subscription.created':
        eventType = 'subscription.created';
        break;
      case 'customer.subscription.updated':
        eventType = 'subscription.updated';
        break;
      case 'customer.subscription.deleted':
        eventType = 'subscription.cancelled';
        break;
      default:
        return null;
    }
  }
  
  const merchantId = parseInt(metadata.merchantId);
  if (!merchantId) return null;

  const subscriptionType = (metadata.type as 'merchant' | 'place') || 'merchant';
  const placeId = metadata.placeId ? parseInt(metadata.placeId) : undefined;
  
  const priceId = subscription.items?.data[0]?.price?.id || '';
  const tier = mapStripePriceToTier(priceId);

  const currentPeriodEnd = (subscription as any).current_period_end 
    ? new Date((subscription as any).current_period_end * 1000)
    : new Date();

  return {
    type: eventType,
    subscriptionId: subscription.id,
    merchantId,
    tier,
    subscriptionType,
    placeId,
    currentPeriodEnd,
    status: mapStripeStatus(subscription.status),
    provider: 'stripe',
  };
}

async function handleSubscriptionEvent(event: NormalizedSubscriptionEvent): Promise<void> {
  console.log(`[Webhook] Processing ${event.type} for merchant ${event.merchantId}`);

  const existingSub = await subscriptionStorage.getSubscriptionByProviderId(event.provider, event.subscriptionId);

  switch (event.type) {
    case 'subscription.created':
    case 'subscription.renewed':
      if (!existingSub) {
        await subscriptionStorage.createSubscription({
          merchantId: event.merchantId,
          type: event.subscriptionType,
          tier: event.tier,
          provider: event.provider,
          providerSubscriptionId: event.subscriptionId,
          status: event.status,
          currentPeriodStart: new Date(),
          currentPeriodEnd: event.currentPeriodEnd || new Date(),
          placeId: event.placeId,
        });
      } else {
        await subscriptionStorage.updateSubscription(existingSub.id, {
          status: event.status,
          tier: event.tier,
          currentPeriodEnd: event.currentPeriodEnd,
        });
      }
      
      if (event.subscriptionType === 'merchant') {
        await db.update(merchants)
          .set({
            merchantLevel: event.tier,
            merchantLevelExpiresAt: event.currentPeriodEnd,
          })
          .where(eq(merchants.id, event.merchantId));
      } else if (event.subscriptionType === 'place' && event.placeId) {
        await db.update(places)
          .set({
            placeCardTier: event.tier,
            placeCardTierExpiresAt: event.currentPeriodEnd,
          })
          .where(eq(places.id, event.placeId));
      }
      break;

    case 'subscription.updated':
      if (existingSub) {
        await subscriptionStorage.updateSubscription(existingSub.id, {
          status: event.status,
          tier: event.tier,
          currentPeriodEnd: event.currentPeriodEnd,
        });

        if (event.subscriptionType === 'merchant') {
          await db.update(merchants)
            .set({
              merchantLevel: event.tier,
              merchantLevelExpiresAt: event.currentPeriodEnd,
            })
            .where(eq(merchants.id, event.merchantId));
        } else if (event.subscriptionType === 'place' && event.placeId) {
          await db.update(places)
            .set({
              placeCardTier: event.tier,
              placeCardTierExpiresAt: event.currentPeriodEnd,
            })
            .where(eq(places.id, event.placeId));
        }
      }
      break;

    case 'subscription.cancelled':
      if (existingSub) {
        await subscriptionStorage.updateSubscription(existingSub.id, {
          status: 'cancelled',
          cancelledAt: new Date(),
        });

        if (event.subscriptionType === 'merchant') {
          await db.update(merchants)
            .set({
              merchantLevel: 'free',
              merchantLevelExpiresAt: null,
            })
            .where(eq(merchants.id, event.merchantId));
        } else if (event.subscriptionType === 'place' && event.placeId) {
          await db.update(places)
            .set({
              placeCardTier: 'free',
              placeCardTierExpiresAt: null,
            })
            .where(eq(places.id, event.placeId));
        }
      }
      break;

    case 'payment.failed':
      if (existingSub) {
        await subscriptionStorage.updateSubscription(existingSub.id, {
          status: 'past_due',
        });
      }
      break;
  }

  try {
    const merchant = await storage.getMerchantById(event.merchantId);
    if (merchant && merchant.userId) {
      emitSubscriptionUpdated(merchant.userId, {
        merchantId: event.merchantId,
        type: event.subscriptionType,
        tier: event.tier,
        status: event.status,
        placeId: event.placeId,
        expiresAt: event.currentPeriodEnd,
      });
    }
  } catch (socketError) {
    console.error(`[Webhook] Failed to emit socket event: ${socketError}`);
  }

  console.log(`[Webhook] Completed ${event.type} for merchant ${event.merchantId}`);
}

router.post("/api/webhooks/stripe", raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn("[Stripe Webhook] No webhook secret configured");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  let event: Stripe.Event;

  try {
    const stripe = await getUncachableStripeClient();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  const subscriptionEvents = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
  ];

  if (subscriptionEvents.includes(event.type)) {
    const normalizedEvent = await normalizeStripeEvent(event);
    
    if (normalizedEvent) {
      try {
        await handleSubscriptionEvent(normalizedEvent);
      } catch (error) {
        console.error(`[Stripe Webhook] Error handling event: ${error}`);
        return res.status(500).json({ error: "Failed to process webhook" });
      }
    }
  }

  res.json({ received: true });
});

router.post("/api/webhooks/recur", async (req, res) => {
  console.log("[Recur Webhook] Received event:", req.body.type);
  res.status(501).json({ error: "Recur webhook not yet implemented" });
});

export default router;

import { Router, raw } from "express";
import { getUncachableStripeClient } from "../stripeClient";
import { subscriptionStorage } from "../storage/subscriptionStorage";
import { merchantStorage } from "../storage/merchantStorage";
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

type SubscriptionTier = 'free' | 'pro' | 'premium' | 'partner';

interface NormalizedSubscriptionEvent {
  type: SubscriptionEventType;
  subscriptionId: string;
  merchantId: number;
  tier: SubscriptionTier;
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

function mapStripePriceToTier(priceId: string): SubscriptionTier {
  if (priceId === process.env.STRIPE_MERCHANT_PRO_PRICE_ID || priceId === process.env.STRIPE_PLACE_PRO_PRICE_ID) {
    return 'pro';
  }
  if (priceId === process.env.STRIPE_MERCHANT_PREMIUM_PRICE_ID || priceId === process.env.STRIPE_PLACE_PREMIUM_PRICE_ID) {
    return 'premium';
  }
  if (priceId === process.env.STRIPE_MERCHANT_PARTNER_PRICE_ID || priceId === process.env.STRIPE_PLACE_PARTNER_PRICE_ID) {
    return 'partner';
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
      if (!stripe) {
        console.log('[Stripe Webhook] Stripe not configured, skipping');
        return null;
      }
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
    if (!stripe) {
      console.warn("[Stripe Webhook] Stripe not configured");
      return res.status(500).json({ error: "Stripe not configured" });
    }
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

function mapRecurStatus(status: string): 'active' | 'cancelled' | 'past_due' | 'trialing' {
  switch (status.toUpperCase()) {
    case 'ACTIVE': return 'active';
    case 'TRIAL': 
    case 'TRIALING': return 'trialing';
    case 'PAST_DUE': return 'past_due';
    case 'CANCELED':
    case 'CANCELLED':
    case 'EXPIRED': return 'cancelled';
    default: return 'cancelled';
  }
}

function mapRecurProductToTier(productId: string): SubscriptionTier {
  const RECUR_PRODUCT_MAP: Record<string, SubscriptionTier> = {
    'fpbnn9ah9090j7hxx5wcv7f4': 'pro',
    'adkwbl9dya0wc6b53parl9yk': 'premium',
    [process.env.RECUR_MERCHANT_PRO_PRODUCT_ID || '']: 'pro',
    [process.env.RECUR_MERCHANT_PREMIUM_PRODUCT_ID || '']: 'premium',
    [process.env.RECUR_MERCHANT_PARTNER_PRODUCT_ID || '']: 'partner',
    [process.env.RECUR_PLACE_PRO_PRODUCT_ID || '']: 'pro',
    [process.env.RECUR_PLACE_PREMIUM_PRODUCT_ID || '']: 'premium',
    [process.env.RECUR_PLACE_PARTNER_PRODUCT_ID || '']: 'partner',
  };
  
  delete RECUR_PRODUCT_MAP[''];
  
  const tier = RECUR_PRODUCT_MAP[productId];
  if (!tier) {
    console.warn(`[Recur Webhook] Unknown product ID: ${productId}, defaulting to 'free'`);
    return 'free';
  }
  return tier;
}

function parseExternalCustomerId(externalId: string): { merchantId: number; type: 'merchant' | 'place'; tier: string; placeId?: number } | null {
  const match = externalId.match(/^mibu_m(\d+)_(merchant|place)_(\w+)(?:_p(\d+))?$/);
  if (!match) return null;
  
  return {
    merchantId: parseInt(match[1]),
    type: match[2] as 'merchant' | 'place',
    tier: match[3],
    placeId: match[4] ? parseInt(match[4]) : undefined,
  };
}

async function normalizeRecurEvent(body: any): Promise<NormalizedSubscriptionEvent | null> {
  const { type, data } = body;
  
  if (!data) return null;
  
  const subscription = data.subscription || data;
  const customer = subscription.customer || data.customer;
  
  let merchantId: number | null = null;
  let subscriptionType: 'merchant' | 'place' = 'merchant';
  let placeId: number | undefined;
  let tierFromExternalId: string | undefined;

  const externalCustomerId = customer?.externalId || subscription.externalCustomerId;
  if (externalCustomerId) {
    const parsed = parseExternalCustomerId(externalCustomerId);
    if (parsed) {
      merchantId = parsed.merchantId;
      subscriptionType = parsed.type;
      placeId = parsed.placeId;
      tierFromExternalId = parsed.tier;
    }
  }

  if (!merchantId && customer?.email) {
    const merchant = await merchantStorage.getMerchantByEmail(customer.email);
    if (merchant) {
      merchantId = merchant.id;
    }
  }

  if (!merchantId) {
    console.warn('[Recur Webhook] Cannot resolve merchantId from event');
    return null;
  }

  const productId = subscription.productId || subscription.product?.id;
  
  function validateTier(t: string | undefined): SubscriptionTier {
    if (t === 'pro' || t === 'premium' || t === 'partner') return t;
    if (t && t !== 'free') {
      console.warn(`[Recur Webhook] Unknown tier in externalCustomerId: ${t}, defaulting to 'free'`);
    }
    return 'free';
  }
  
  const tier = tierFromExternalId ? validateTier(tierFromExternalId) : mapRecurProductToTier(productId);

  let eventType: SubscriptionEventType;
  switch (type) {
    case 'subscription.created':
      eventType = 'subscription.created';
      break;
    case 'subscription.updated':
      eventType = 'subscription.updated';
      break;
    case 'subscription.cancelled':
    case 'subscription.canceled':
      eventType = 'subscription.cancelled';
      break;
    case 'subscription.renewed':
      eventType = 'subscription.renewed';
      break;
    case 'invoice.payment_succeeded':
    case 'payment.succeeded':
      eventType = 'payment.succeeded';
      break;
    case 'invoice.payment_failed':
    case 'payment.failed':
      eventType = 'payment.failed';
      break;
    default:
      console.log(`[Recur Webhook] Unhandled event type: ${type}`);
      return null;
  }

  const currentPeriodEnd = subscription.currentPeriodEnd 
    ? new Date(subscription.currentPeriodEnd)
    : subscription.billingPeriodEnd
      ? new Date(subscription.billingPeriodEnd)
      : undefined;

  return {
    type: eventType,
    subscriptionId: subscription.id,
    merchantId,
    tier,
    subscriptionType,
    placeId,
    currentPeriodEnd,
    status: mapRecurStatus(subscription.status || 'active'),
    provider: 'recur',
  };
}

router.post("/api/webhooks/recur", async (req, res) => {
  console.log("[Recur Webhook] Received event:", req.body?.type);

  try {
    const normalizedEvent = await normalizeRecurEvent(req.body);
    
    if (normalizedEvent) {
      await handleSubscriptionEvent(normalizedEvent);
      console.log(`[Recur Webhook] Processed ${normalizedEvent.type} for merchant ${normalizedEvent.merchantId}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error("[Recur Webhook] Error:", error);
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

export default router;

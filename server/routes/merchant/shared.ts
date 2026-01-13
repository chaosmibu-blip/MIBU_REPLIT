// Shared imports and utilities for merchant routes
export { Router } from "express";
export { isAuthenticated } from "../../replitAuth";
export { storage } from "../../storage";
export { subscriptionStorage } from "../../storage/subscriptionStorage";
export { refundStorage } from "../../storage/refundStorage";
export { insertMerchantSchema, insertCouponSchema, InsertRefundRequest } from "@shared/schema";
export { ErrorCode, createErrorResponse } from "@shared/errors";
export { z } from "zod";
export { default as crypto } from "crypto";
export { getUncachableStripeClient } from "../../stripeClient";
export { getMerchantTier, getPlaceCardTier, MERCHANT_TIER_LIMITS, PLACE_CARD_TIER_LIMITS, hasAnalyticsAccess } from "../../lib/merchantPermissions";

// Subscription price configuration
export const SUBSCRIPTION_PRICES = {
  merchant: {
    pro: {
      stripe: process.env.STRIPE_MERCHANT_PRO_PRICE_ID,
      recur: process.env.RECUR_MERCHANT_PRO_PRODUCT_ID || 'fpbnn9ah9090j7hxx5wcv7f4',
      amount: 29900,
      currency: 'TWD'
    },
    premium: {
      stripe: process.env.STRIPE_MERCHANT_PREMIUM_PRICE_ID,
      recur: process.env.RECUR_MERCHANT_PREMIUM_PRODUCT_ID || 'adkwbl9dya0wc6b53parl9yk',
      amount: 79900,
      currency: 'TWD'
    },
  },
  place: {
    pro: {
      stripe: process.env.STRIPE_PLACE_PRO_PRICE_ID,
      recur: process.env.RECUR_PLACE_PRO_PRODUCT_ID,
      amount: 19900,
      currency: 'TWD'
    },
    premium: {
      stripe: process.env.STRIPE_PLACE_PREMIUM_PRICE_ID,
      recur: process.env.RECUR_PLACE_PREMIUM_PRODUCT_ID,
      amount: 39900,
      currency: 'TWD'
    },
  },
} as const;

export const RECUR_CONFIG = {
  publishableKey: process.env.RECUR_PUBLISHABLE_KEY,
};

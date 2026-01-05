import { db } from "../db";
import { merchants, places, merchantSubscriptions } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export const MERCHANT_TIER_LIMITS = {
  free: { maxPlaces: 1, analytics: false },
  pro: { maxPlaces: 5, analytics: true },
  premium: { maxPlaces: 20, analytics: true },
} as const;

export const PLACE_CARD_TIER_LIMITS = {
  free: {
    maxCoupons: 1,
    allowedRarities: ['R'],
    hasFrame: false,
    hasLoadingEffect: false,
    canEditPromo: false,
    canEditItemboxImage: false,
  },
  pro: {
    maxCoupons: 5,
    allowedRarities: ['R', 'S', 'SR', 'SSR'],
    hasFrame: true,
    hasLoadingEffect: false,
    canEditPromo: true,
    canEditItemboxImage: true,
  },
  premium: {
    maxCoupons: 10,
    allowedRarities: ['R', 'S', 'SR', 'SSR', 'SP'],
    hasFrame: true,
    hasLoadingEffect: true,
    canEditPromo: true,
    canEditItemboxImage: true,
  },
} as const;

export type MerchantTier = keyof typeof MERCHANT_TIER_LIMITS;
export type PlaceCardTier = keyof typeof PLACE_CARD_TIER_LIMITS;

export async function getMerchantTier(merchantId: number): Promise<MerchantTier> {
  const [merchant] = await db
    .select({ merchantLevel: merchants.merchantLevel, expiresAt: merchants.merchantLevelExpiresAt })
    .from(merchants)
    .where(eq(merchants.id, merchantId));

  if (!merchant) return 'free';

  if (merchant.merchantLevel === 'free') return 'free';

  if (merchant.expiresAt && new Date(merchant.expiresAt) < new Date()) {
    return 'free';
  }

  return (merchant.merchantLevel as MerchantTier) || 'free';
}

export async function getPlaceCardTier(placeId: number): Promise<PlaceCardTier> {
  const [place] = await db
    .select({ placeCardTier: places.placeCardTier, expiresAt: places.placeCardTierExpiresAt })
    .from(places)
    .where(eq(places.id, placeId));

  if (!place) return 'free';

  if (!place.placeCardTier || place.placeCardTier === 'free') return 'free';

  if (place.expiresAt && new Date(place.expiresAt) < new Date()) {
    return 'free';
  }

  return (place.placeCardTier as PlaceCardTier) || 'free';
}

export async function canAddPlaceCard(merchantId: number): Promise<{ allowed: boolean; current: number; limit: number }> {
  const tier = await getMerchantTier(merchantId);
  const limit = MERCHANT_TIER_LIMITS[tier].maxPlaces;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(places)
    .where(and(eq(places.merchantId, merchantId), eq(places.isActive, true)));

  const current = result?.count || 0;

  return { allowed: current < limit, current, limit };
}

export function isRarityAllowed(placeCardTier: PlaceCardTier, rarity: string): boolean {
  const limits = PLACE_CARD_TIER_LIMITS[placeCardTier] || PLACE_CARD_TIER_LIMITS.free;
  return limits.allowedRarities.includes(rarity as any);
}

export async function canAddCoupon(placeId: number): Promise<{ allowed: boolean; current: number; limit: number }> {
  const tier = await getPlaceCardTier(placeId);
  const limits = PLACE_CARD_TIER_LIMITS[tier];

  const result = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM coupons 
    WHERE merchant_place_link_id IN (
      SELECT id FROM merchant_place_links WHERE official_place_id = ${placeId}
    ) AND is_active = true
  `);

  const current = (result.rows[0] as any)?.count || 0;

  return { allowed: current < limits.maxCoupons, current, limit: limits.maxCoupons };
}

export function hasAnalyticsAccess(tier: MerchantTier): boolean {
  return MERCHANT_TIER_LIMITS[tier].analytics;
}

export function getPlaceCardFeatures(tier: PlaceCardTier) {
  return PLACE_CARD_TIER_LIMITS[tier];
}

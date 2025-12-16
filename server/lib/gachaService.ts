import { storage } from '../storage';
import { Place, Coupon } from '../../shared/schema';

export interface GachaResult {
  place: Place;
  drawnCoupon: Coupon | null;
  merchantInfo: string | null;
}

const COUPON_PROBABILITIES: Record<string, number> = {
  SP: 0.02,
  SSR: 0.08,
  SR: 0.15,
  S: 0.23,
  R: 0.32,
};

const drawCoupon = (availableCoupons: Coupon[]): Coupon | null => {
  if (!availableCoupons || availableCoupons.length === 0) {
    return null;
  }

  const rand = Math.random();
  let cumulativeProbability = 0;

  for (const rank of ['SP', 'SSR', 'SR', 'S', 'R']) {
    cumulativeProbability += COUPON_PROBABILITIES[rank];
    if (rand < cumulativeProbability) {
      const winningCoupon = availableCoupons.find(c => c.rarity === rank);
      if (winningCoupon) {
        console.log(`[GachaService] Coupon draw success! Rank: ${rank}`);
        return winningCoupon;
      }
    }
  }

  return null;
};

export const performGachaDraw = async (userId: string, cityId: string, count: number): Promise<GachaResult[]> => {
  console.log(`[GachaService] Starting gacha draw for user ${userId} in city ${cityId} for ${count} items.`);
  
  const randomPlaces = await storage.getRandomPlacesByCity(cityId, count);
  
  const results: GachaResult[] = [];

  for (const place of randomPlaces) {
    let drawnCoupon: Coupon | null = null;
    
    await storage.upsertUserCollectionEntry(userId, place.id);
    
    if (place.merchantId) {
      const availableCoupons = await storage.getActiveCouponsForPlace(place.id);
      
      if (availableCoupons.length > 0) {
        drawnCoupon = drawCoupon(availableCoupons);
        
        if (drawnCoupon) {
          await storage.addUserCoupon(userId, drawnCoupon.id);
        }
      }
    }
    
    results.push({
      place: place,
      drawnCoupon: drawnCoupon,
      merchantInfo: null,
    });
  }
  
  console.log(`[GachaService] Gacha draw finished. Returning ${results.length} results.`);
  return results;
};

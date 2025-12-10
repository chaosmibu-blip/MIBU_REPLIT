import { Itinerary, GachaItem, Coupon } from "@/types";
import { SUB_DISTRICTS, CATEGORIES } from "@/lib/constants";

const generateId = () => Math.random().toString(36).substring(2, 9);

const MOCK_PLACES = [
  "Hidden Cat Cafe", "Old Town Temple", "Neon Night Market", "Sunset Viewpoint", 
  "Retro Arcade Bar", "Secret Ramen Shop", "Vintage Bookstore", "Cloud 9 Observatory",
  "Tiny Jazz Bar", "Mountain Shrine", "Seaside Park", "Antique Market"
];

const MOCK_COUPONS: Partial<Coupon>[] = [
  { title: "Free Drink", description: "Get a free drink with any meal", rarity: "R" },
  { title: "10% Off", description: "10% discount on total bill", rarity: "R" },
  { title: "Free Dessert", description: "Complimentary dessert", rarity: "SR" },
  { title: "VIP Access", description: "Skip the line pass", rarity: "SSR" },
  { title: "Owner's Treat", description: "Secret menu item for free", rarity: "SP" },
];

export async function generateItinerary(
  country: string,
  city: string,
  intensity: number
): Promise<Itinerary> {
  // Simulate AI delay
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const districts = SUB_DISTRICTS[city] || ["Central"];
  const mainDistrict = districts[Math.floor(Math.random() * districts.length)];
  
  // Generate 3-6 items based on intensity
  const itemCount = Math.max(3, Math.min(8, Math.floor(intensity / 2) + 2));
  const items: GachaItem[] = [];

  for (let i = 0; i < itemCount; i++) {
    const hasCoupon = Math.random() > 0.7; // 30% chance
    let coupon: Coupon | undefined;

    if (hasCoupon) {
      const template = MOCK_COUPONS[Math.floor(Math.random() * MOCK_COUPONS.length)];
      coupon = {
        id: generateId(),
        code: `MIBU-${Math.floor(Math.random() * 10000)}`,
        title: template.title!,
        description: template.description!,
        rarity: template.rarity!,
        is_claimed: false,
      } as Coupon;
    }

    const categoryKeys = Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[];
    const categoryKey = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
    const category = CATEGORIES[categoryKey];

    items.push({
      id: generateId(),
      place_name: `${mainDistrict} ${MOCK_PLACES[Math.floor(Math.random() * MOCK_PLACES.length)]}`,
      description: `A wonderful ${category.label} spot in ${mainDistrict}. Highly recommended by locals.`,
      category: category.id as any,
      suggested_time: `${10 + i}:00 - ${11 + i}:30`,
      coordinates: { lat: 0, lng: 0 },
      district: mainDistrict,
      coupon,
    });
  }

  return {
    id: generateId(),
    country,
    city,
    district: mainDistrict,
    intensity,
    created_at: Date.now(),
    items,
  };
}

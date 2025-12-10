export interface GachaItem {
  id: string;
  place_name: string;
  description: string;
  category: "food" | "stay" | "scenery" | "shopping" | "entertainment";
  suggested_time: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  district?: string;
  image_url?: string; // Mock image
  coupon?: Coupon;
}

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string;
  rarity: "R" | "SR" | "SSR" | "SP";
  is_claimed: boolean;
}

export interface Itinerary {
  id: string;
  country: string;
  city: string;
  district: string;
  intensity: number;
  created_at: number;
  items: GachaItem[];
}

export interface UserState {
  collection: Itinerary[];
  coupons: Coupon[];
  isMerchant: boolean;
}

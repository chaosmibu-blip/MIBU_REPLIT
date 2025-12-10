export enum Rarity {
  SP = 'SP',
  SSR = 'SSR',
  SR = 'SR',
  S = 'S',
  R = 'R'
}

export enum Category {
  Food = 'Food',
  Stay = 'Stay',
  Education = 'Education',
  Entertainment = 'Entertainment',
  Scenery = 'Scenery',
  Shopping = 'Shopping',
  Activity = 'Activity'
}

export type Language = 'zh-TW' | 'en' | 'ja';
export type LocalizedContent = string | { [key in Language]?: string };

export type PlanTier = 'free' | 'partner' | 'premium';

export interface SubscriptionConfig {
  id: PlanTier;
  name: string;
  priceDisplay: string;
  allowedRarities: Rarity[];
  maxSlots: number;
  features: string[];
  recurPlanId?: string;
}

export interface User {
  name: string;
  avatar: string;
  email: string;
  isMerchant?: boolean;
}

export interface Merchant {
  id: string;
  name: string;
  email: string;
  claimedPlaceNames: string[];
  subscriptionPlan: PlanTier;
}

export interface CouponData {
  title: LocalizedContent;
  code: string;
  terms: LocalizedContent;
}

export interface CouponConfig {
  id: string;
  title: LocalizedContent;
  code: string;
  terms: LocalizedContent;
  rarity: Rarity;
  total_quantity: number;
  remaining_quantity: number;
  redeemed_count: number;
  is_active: boolean;
  archived?: boolean;
}

export interface GachaItem {
  id: number;
  place_name: LocalizedContent;
  description: LocalizedContent;
  category: Category;
  suggested_time: string;
  duration: string;
  search_query: string;
  rarity: Rarity;
  color_hex: string;
  city?: string;
  country?: string;
  collected_at?: string;
  operating_status?: string;
  is_coupon: boolean;
  coupon_data: CouponData | null;
  store_promo?: LocalizedContent;
  is_promo_active?: boolean;
  merchant_id?: string;
  merchant_coupons?: CouponConfig[];
  remaining_coupons?: number;
  impressionCount?: number;
  redemptionCount?: number;
}

export interface GachaMeta {
  date: string;
  country: string;
  city: string;
  locked_district: LocalizedContent; 
  user_level: number;
}

export interface GachaResponse {
  status: string;
  meta: GachaMeta;
  inventory: GachaItem[];
}

export interface GroundingChunk {
  web?: { uri?: string; title?: string };
  maps?: { uri?: string; title?: string; placeAnswerSources?: { reviewSnippets?: any[] } };
}

export interface LocationData {
  [countryKey: string]: {
    names: { [lang in Language]: string };
    cities: { [cityKey: string]: { [lang in Language]: string } };
  };
}

export type AppView = 'home' | 'result' | 'collection' | 'item_box' | 'merchant_login' | 'merchant_dashboard';

export interface AppState {
  language: Language;
  user: User | null;
  country: string; 
  city: string;    
  level: number;
  loading: boolean;
  error: string | null;
  result: GachaResponse | null;
  groundingSources: GroundingChunk[];
  collection: GachaItem[];
  celebrationCoupons: GachaItem[]; 
  view: AppView;
  lastVisitCollection: string;
  lastVisitItemBox: string;
  merchantDb: Record<string, GachaItem>;
  currentMerchant: Merchant | null;
}
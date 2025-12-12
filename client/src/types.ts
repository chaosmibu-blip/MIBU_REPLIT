
export enum Category {
  Food = 'Food',
  Stay = 'Stay',
  Education = 'Education',
  Entertainment = 'Entertainment',
  Scenery = 'Scenery',
  Shopping = 'Shopping',
  Activity = 'Activity'
}

export type Language = 'zh-TW' | 'en' | 'ja' | 'ko';
export type LocalizedContent = string | { [key in Language]?: string };

export type PlanTier = 'free' | 'partner' | 'premium';

export interface SubscriptionConfig {
  id: PlanTier;
  name: string;
  priceDisplay: string;
  maxSlots: number;
  features: string[];
  recurPlanId?: string;
}

export interface User {
  id?: string;
  name: string;
  avatar: string | null;
  email: string | null;
  provider?: string | null;
  providerId?: string | null;
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
  ai_description?: LocalizedContent;
  category: Category;
  subcategory?: LocalizedContent;
  suggested_time: string;
  duration: string;
  search_query: string;
  color_hex: string;
  city?: string;
  country?: string;
  district?: string;
  collectedAt?: string;
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
  place_id?: string | null;
  verified_name?: string | null;
  verified_address?: string | null;
  google_rating?: number | null;
  google_types?: string[];
  primary_type?: string | null;
  location?: { lat: number; lng: number } | null;
  is_location_verified?: boolean;
  district_center?: { lat: number; lng: number } | null;
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

export type AppView = 'login' | 'mibu_home' | 'gacha_module' | 'planner_module' | 'settings' | 'result' | 'merchant_login' | 'merchant_dashboard' | 'agent_dashboard' | 'admin_dashboard';

export type GachaSubView = 'gacha' | 'collection' | 'itembox';
export type PlannerSubView = 'location' | 'itinerary' | 'chat';
export type SettingsTab = 'mibu' | 'gacha' | 'planner';

export interface AppState {
  language: Language;
  user: User | null;
  country: string; 
  city: string;    
  countryId: number | null;
  regionId: number | null;
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

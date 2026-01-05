/**
 * Place Generator - Constants and Types
 */

import { MibuCategory } from '../categoryMapping';

// ============ 白名單：旅遊相關類別（不含通用類別） ============
export const INCLUDED_TYPES = [
  // 景點類
  'tourist_attraction',
  'amusement_park',
  'aquarium',
  'art_gallery',
  'museum',
  'zoo',
  'park',
  'natural_feature',
  'campground',
  // 餐飲類
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'night_club',
  'meal_takeaway',
  'meal_delivery',
  // 住宿類
  'lodging',
  'hotel',
  'resort_hotel',
  'motel',
  'bed_and_breakfast',
  // 休閒娛樂類
  'spa',
  'movie_theater',
  'bowling_alley',
  'gym',
  'stadium',
  // 購物類
  'shopping_mall',
  'department_store',
  'book_store',
  'clothing_store',
  'jewelry_store',
  'gift_shop',
  'souvenir_store'
];

// ============ 黑名單：非旅遊類別 ============
export const EXCLUDED_PLACE_TYPES = [
  'travel_agency', 'insurance_agency', 'real_estate_agency', 'lawyer', 'accounting', 
  'bank', 'library', 'local_government_office', 'city_hall', 'courthouse', 'post_office',
  'police', 'fire_station', 'hospital', 'doctor', 'dentist', 'pharmacy', 'veterinary_care',
  'school', 'primary_school', 'secondary_school', 'university', 'car_dealer', 'car_rental',
  'car_repair', 'car_wash', 'gas_station', 'parking', 'transit_station', 'bus_station',
  'train_station', 'subway_station', 'taxi_stand', 'atm', 'funeral_home', 'cemetery',
  'church', 'mosque', 'synagogue', 'hindu_temple', 'place_of_worship',
  'supermarket', 'convenience_store', 'laundry', 'locksmith', 'moving_company',
  'plumber', 'electrician', 'roofing_contractor', 'painter', 'storage'
];

export const EXCLUDED_BUSINESS_STATUS = ['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'];

export const GENERIC_NAME_PATTERNS = [
  '探索', '旅行社', '旅行', 'Travel', 'Explore', 'Tour',
  '農會', '公所', '區公所', '鄉公所', '鎮公所', '市公所', '縣政府', '市政府', '衛生所', '戶政事務所',
  '警察局', '派出所', '消防隊', '消防局', '郵局', '稅務局', '地政事務所',
  '診所', '牙醫', '醫院', '藥局', '獸醫', '銀行', '加油站', '停車場', '汽車', '機車行',
  '葬儀', '殯儀館', '靈骨塔', '納骨塔',
  '服務中心', '遊客中心', '超市', '便利商店', '7-11', '全家', '萊爾富', '小北'
];

// 八大種類常量
export const EIGHT_CATEGORIES = ['美食', '住宿', '生態文化教育', '遊程體驗', '娛樂設施', '活動', '景點', '購物'];

// ============ 介面定義 ============
export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  location: { lat: number; lng: number } | null;
  rating: number | null;
  reviewCount: number | null;
  types: string[];
  primaryType: string | null;
  businessStatus: string | null;
}

export interface BatchGenerateResult {
  places: PlaceResult[];
  stats: {
    totalFetched: number;
    afterTypeFilter: number;
    afterNameFilter: number;
    afterDedup: number;
    keywords: string[];
    pagesPerKeyword: number[];
  };
}

export interface PlaceClassification {
  description: string;
  category: string;
  subcategory: string;
}

export interface I18nText {
  en?: string;
  ja?: string;
  ko?: string;
}

export interface PlaceWithClassification {
  name: string;
  nameI18n?: I18nText;
  category: MibuCategory;
  subcategory: string;
  description: string;
  descriptionI18n?: I18nText;
  descriptionSource: 'ai' | 'fallback';
}

// ============ 工具函數 ============
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertCollectionSchema, insertMerchantSchema, insertCouponSchema } from "@shared/schema";
import { z } from "zod";
import { createTripPlannerRoutes } from "../modules/trip-planner/server/routes";

const RECUR_API_URL = "https://api.recur.tw/v1";
const RECUR_PREMIUM_PLAN_ID = "adkwbl9dya0wc6b53parl9yk";
const UNLIMITED_GENERATION_EMAILS = ["s8869420@gmail.com"];
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface PlaceSearchResult {
  name: string;
  formatted_address: string;
  place_id: string;
  geometry?: {
    location: { lat: number; lng: number };
  };
  rating?: number;
  types?: string[];
  business_status?: string;
}

const EXCLUDED_BUSINESS_STATUS = ['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'];
// Exclude non-tourism Google Place types
const EXCLUDED_PLACE_TYPES = [
  'travel_agency', 'insurance_agency', 'real_estate_agency', 'lawyer', 'accounting', 
  'bank', 'library', 'local_government_office', 'city_hall', 'courthouse', 'post_office',
  'police', 'fire_station', 'hospital', 'doctor', 'dentist', 'pharmacy', 'veterinary_care',
  'school', 'primary_school', 'secondary_school', 'university', 'car_dealer', 'car_rental',
  'car_repair', 'car_wash', 'gas_station', 'parking', 'transit_station', 'bus_station',
  'train_station', 'subway_station', 'taxi_stand', 'atm', 'funeral_home', 'cemetery',
  'church', 'mosque', 'synagogue', 'hindu_temple', 'place_of_worship'
];
// Exclude non-tourism places by name patterns (Chinese and English)
const GENERIC_NAME_PATTERNS = [
  // Travel/tour related
  '探索', '旅行社', '旅行', 'Travel', 'Explore', 'Tour',
  // Government/public services
  '農會', '公所', '區公所', '鄉公所', '鎮公所', '市公所', '縣政府', '市政府', '衛生所', '戶政事務所',
  '警察局', '派出所', '消防隊', '消防局', '郵局', '稅務局', '地政事務所',
  // Non-tourism services
  '診所', '牙醫', '醫院', '藥局', '獸醫', '銀行', '加油站', '停車場', '汽車', '機車行',
  '葬儀', '殯儀館', '靈骨塔', '納骨塔',
  // Generic/placeholder names
  '服務中心', '遊客中心'
];

function isPlaceValid(place: any): boolean {
  if (place.business_status && EXCLUDED_BUSINESS_STATUS.includes(place.business_status)) {
    return false;
  }
  
  if (place.types && place.types.some((t: string) => EXCLUDED_PLACE_TYPES.includes(t))) {
    return false;
  }
  
  if (place.name && GENERIC_NAME_PATTERNS.some(pattern => place.name.includes(pattern))) {
    return false;
  }
  
  return true;
}

async function searchPlaceInDistrict(
  query: string,
  district: string,
  city: string,
  country: string
): Promise<PlaceSearchResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not configured");
    return null;
  }

  try {
    const searchQuery = encodeURIComponent(`${query} ${district} ${city}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      for (const place of data.results) {
        if (!isPlaceValid(place)) {
          continue;
        }
        
        return {
          name: place.name,
          formatted_address: place.formatted_address,
          place_id: place.place_id,
          geometry: place.geometry,
          rating: place.rating,
          types: place.types,
          business_status: place.business_status
        };
      }
      return null;
    }
    return null;
  } catch (error) {
    console.error("Google Places API error:", error);
    return null;
  }
}

async function getDistrictBoundary(
  district: string,
  city: string,
  country: string
): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const address = encodeURIComponent(`${district}, ${city}, ${country}`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
    return null;
  } catch (error) {
    console.error("Google Geocoding API error:", error);
    return null;
  }
}

function isWithinRadius(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number },
  radiusKm: number
): boolean {
  const R = 6371;
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance <= radiusKm;
}

async function callGemini(prompt: string): Promise<string> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini API not configured");
  }

  const response = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 8192,
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", errorText);
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);

  // ============ Module Routes ============
  // Trip Planner Module
  app.use('/api/planner', createTripPlannerRoutes());

  // ============ Auth Routes ============
  
  // Get current authenticated user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Check if user has unlimited generation privilege
  app.get('/api/auth/privileges', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const hasUnlimitedGeneration = user?.email && UNLIMITED_GENERATION_EMAILS.includes(user.email);
      res.json({ hasUnlimitedGeneration });
    } catch (error) {
      res.json({ hasUnlimitedGeneration: false });
    }
  });

  // ============ Collection Routes ============
  
  app.get("/api/collections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const items = await storage.getUserCollections(userId);
      res.json({ collections: items });
    } catch (error) {
      console.error("Fetch collections error:", error);
      res.status(500).json({ error: "Failed to fetch collections" });
    }
  });

  // Get merchant promo for a specific place (by placeId or placeName+district+city)
  app.get("/api/place/promo", async (req, res) => {
    try {
      const { placeId, placeName, district, city } = req.query;
      
      let merchantLink = null;
      
      // First try to find by Google Place ID (most accurate)
      if (placeId && typeof placeId === 'string') {
        merchantLink = await storage.getPlaceLinkByGooglePlaceId(placeId);
      }
      
      // Fallback to placeName + district + city
      if (!merchantLink && placeName && district && city) {
        merchantLink = await storage.getPlaceLinkByPlace(
          placeName as string,
          district as string,
          city as string
        );
      }
      
      if (!merchantLink || !merchantLink.isPromoActive) {
        return res.json({ promo: null });
      }
      
      res.json({
        promo: {
          title: merchantLink.promoTitle,
          description: merchantLink.promoDescription,
          imageUrl: merchantLink.promoImageUrl
        }
      });
    } catch (error) {
      console.error("Get place promo error:", error);
      res.status(500).json({ error: "Failed to get place promo" });
    }
  });

  app.post("/api/collections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validated = insertCollectionSchema.parse({ ...req.body, userId });
      const collection = await storage.addToCollection(validated);
      res.json({ collection });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Add collection error:", error);
      res.status(500).json({ error: "Failed to add to collection" });
    }
  });

  // ============ Merchant Routes ============
  
  app.get("/api/merchant", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const merchant = await storage.getMerchantByUserId(userId);
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      res.json({ merchant });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch merchant" });
    }
  });

  app.post("/api/merchant", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validated = insertMerchantSchema.parse({ ...req.body, userId });
      const merchant = await storage.createMerchant(validated);
      res.json({ merchant });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create merchant" });
    }
  });

  app.patch("/api/merchant/:id/plan", isAuthenticated, async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { plan } = req.body;
      
      if (!['free', 'partner', 'premium'].includes(plan)) {
        return res.status(400).json({ error: "Invalid plan" });
      }
      
      const merchant = await storage.updateMerchantPlan(merchantId, plan);
      res.json({ merchant });
    } catch (error) {
      res.status(500).json({ error: "Failed to update plan" });
    }
  });

  // ============ Coupon Routes ============
  
  app.get("/api/coupons/merchant/:merchantId", isAuthenticated, async (req, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const allCoupons = await storage.getMerchantCoupons(merchantId);
      res.json({ coupons: allCoupons });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch coupons" });
    }
  });

  app.post("/api/coupons", isAuthenticated, async (req, res) => {
    try {
      const validated = insertCouponSchema.parse(req.body);
      const coupon = await storage.createCoupon(validated);
      res.json({ coupon });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create coupon" });
    }
  });

  app.patch("/api/coupons/:id", isAuthenticated, async (req, res) => {
    try {
      const couponId = parseInt(req.params.id);
      const coupon = await storage.updateCoupon(couponId, req.body);
      res.json({ coupon });
    } catch (error) {
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });

  // ============ District Data for Random Selection ============
  const DISTRICT_DATA: Record<string, Record<string, string[]>> = {
    taiwan: {
      taipei: ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
      new_taipei: ['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '土城區', '蘆洲區', '汐止區', '樹林區', '鶯歌區', '三峽區', '淡水區', '瑞芳區', '五股區', '泰山區', '林口區', '深坑區', '石碇區', '坪林區', '三芝區', '石門區', '八里區', '平溪區', '雙溪區', '貢寮區', '金山區', '萬里區', '烏來區'],
      taoyuan: ['桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區', '龍潭區', '龜山區', '大園區', '觀音區', '新屋區', '復興區'],
      taichung: ['中區', '東區', '南區', '西區', '北區', '北屯區', '西屯區', '南屯區', '太平區', '大里區', '霧峰區', '烏日區', '豐原區', '后里區', '石岡區', '東勢區', '和平區', '新社區', '潭子區', '大雅區', '神岡區', '大肚區', '沙鹿區', '龍井區', '梧棲區', '清水區', '大甲區', '外埔區', '大安區'],
      tainan: ['中西區', '東區', '南區', '北區', '安平區', '安南區', '永康區', '歸仁區', '新化區', '左鎮區', '玉井區', '楠西區', '南化區', '仁德區', '關廟區', '龍崎區', '官田區', '麻豆區', '佳里區', '西港區', '七股區', '將軍區', '學甲區', '北門區', '新營區', '後壁區', '白河區', '東山區', '六甲區', '下營區', '柳營區', '鹽水區', '善化區', '大內區', '山上區', '新市區', '安定區'],
      kaohsiung: ['楠梓區', '左營區', '鼓山區', '三民區', '鹽埕區', '前金區', '新興區', '苓雅區', '前鎮區', '旗津區', '小港區', '鳳山區', '大寮區', '林園區', '大樹區', '大社區', '仁武區', '鳥松區', '岡山區', '橋頭區', '燕巢區', '田寮區', '阿蓮區', '路竹區', '湖內區', '茄萣區', '永安區', '彌陀區', '梓官區', '旗山區', '美濃區', '六龜區', '甲仙區', '杉林區', '內門區', '茂林區', '桃源區', '那瑪夏區'],
      keelung: ['仁愛區', '信義區', '中正區', '中山區', '安樂區', '暖暖區', '七堵區'],
      hsinchu_city: ['東區', '北區', '香山區'],
      chiayi_city: ['東區', '西區'],
    },
    japan: {
      tokyo: ['千代田區', '中央區', '港區', '新宿區', '文京區', '台東區', '墨田區', '江東區', '品川區', '目黑區', '大田區', '世田谷區', '渋谷區', '中野區', '杉並區', '豐島區', '北區', '荒川區', '板橋區', '練馬區', '足立區', '葛飾區', '江戸川區'],
      osaka: ['北區', '都島區', '福島區', '此花區', '中央區', '西區', '港區', '大正區', '天王寺區', '浪速區', '西淀川區', '淀川區', '東淀川區', '東成區', '生野區', '旭區', '城東區', '鶴見區', '阿倍野區', '住之江區', '住吉區', '東住吉區', '平野區', '西成區'],
      kyoto: ['北區', '上京區', '左京區', '中京區', '東山區', '下京區', '南區', '右京區', '伏見區', '山科區', '西京區'],
      fukuoka: ['東區', '博多區', '中央區', '南區', '城南區', '早良區', '西區'],
    },
    hong_kong: {
      hong_kong: ['中西區', '灣仔區', '東區', '南區', '油尖旺區', '深水埗區', '九龍城區', '黃大仙區', '觀塘區', '葵青區', '荃灣區', '屯門區', '元朗區', '北區', '大埔區', '沙田區', '西貢區', '離島區'],
    }
  };

  function getRandomDistrict(country: string, city: string): string | null {
    const countryData = DISTRICT_DATA[country];
    if (!countryData) return null;
    const districts = countryData[city];
    if (!districts || districts.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * districts.length);
    return districts[randomIndex];
  }

  // ============ Category & Sub-category Data ============
  const CATEGORY_DATA: Record<string, { subCategories: string[]; weight: number; timeSlots: string[] }> = {
    '食': {
      subCategories: ['火鍋', '小吃', '異國料理', '日式料理', '中式料理', '西式料理', '咖啡廳', '甜點', '夜市美食', '素食', '海鮮', '燒烤', '拉麵', '鐵板燒', '牛排', '早午餐', '台式便當', '港式飲茶'],
      weight: 3,
      timeSlots: ['breakfast', 'lunch', 'tea_time', 'dinner', 'late_night']
    },
    '宿': {
      subCategories: ['五星飯店', '商務旅館', '民宿', '青年旅社', '溫泉旅館', '設計旅店', '膠囊旅館', '度假村'],
      weight: 0,
      timeSlots: ['overnight']
    },
    '生態文化教育': {
      subCategories: ['博物館', '美術館', '科學館', '歷史古蹟', '文化中心', '圖書館', '紀念館', '展覽館'],
      weight: 2,
      timeSlots: ['morning', 'afternoon']
    },
    '遊程體驗': {
      subCategories: ['導覽行程', '手作體驗', '烹飪課程', '文化體驗', '農場體驗', '茶道體驗', '攝影之旅', '單車遊'],
      weight: 2,
      timeSlots: ['morning', 'afternoon']
    },
    '娛樂設施': {
      subCategories: ['遊樂園', '電影院', 'KTV', '酒吧', '夜店', '桌遊店', '密室逃脫', '電玩中心'],
      weight: 1,
      timeSlots: ['afternoon', 'evening', 'night']
    },
    '活動': {
      subCategories: ['登山健行', '水上活動', '極限運動', '瑜珈課程', '運動賽事', '音樂會', '市集活動', 'SPA按摩'],
      weight: 2,
      timeSlots: ['morning', 'afternoon', 'evening']
    },
    '景點': {
      subCategories: ['自然風景', '地標建築', '公園綠地', '觀景台', '寺廟宗教', '老街', '海灘', '溫泉'],
      weight: 3,
      timeSlots: ['morning', 'afternoon', 'evening']
    },
    '購物': {
      subCategories: ['百貨公司', '購物中心', '傳統市場', '商店街', '特色小店', '伴手禮店', '二手店', '藥妝店'],
      weight: 1,
      timeSlots: ['afternoon', 'evening']
    }
  };

  const TIME_SLOT_ORDER = ['breakfast', 'morning', 'lunch', 'afternoon', 'tea_time', 'dinner', 'evening', 'night', 'late_night', 'overnight'];

  interface SkeletonItem {
    order: number;
    category: string;
    subCategory: string;
    timeSlot: string;
    suggestedTime: string;
    energyLevel: 'high' | 'medium' | 'low';
  }

  function generateItinerarySkeleton(country: string, city: string, cardCount: number): {
    targetDistrict: string;
    userRequestCount: number;
    generatedCount: number;
    skeleton: SkeletonItem[];
  } {
    const K = Math.min(12, Math.max(5, cardCount));
    
    const lockedDistrict = getRandomDistrict(country, city) || city;
    
    const stayCount = K >= 8 ? 1 : 0;
    let foodMin = 2;
    if (K >= 7 && K <= 8) foodMin = 3;
    if (K >= 9) foodMin = 4;
    
    const skeleton: SkeletonItem[] = [];
    const usedSubCategories = new Set<string>();
    
    function pickSubCategory(category: string): string {
      const subs = CATEGORY_DATA[category].subCategories;
      const available = subs.filter(s => !usedSubCategories.has(`${category}:${s}`));
      if (available.length === 0) {
        return subs[Math.floor(Math.random() * subs.length)];
      }
      const picked = available[Math.floor(Math.random() * available.length)];
      usedSubCategories.add(`${category}:${picked}`);
      return picked;
    }

    const foodTimeSlots = ['breakfast', 'lunch', 'dinner', 'tea_time', 'late_night'];
    let foodSlotIndex = 0;
    for (let i = 0; i < foodMin; i++) {
      skeleton.push({
        order: 0,
        category: '食',
        subCategory: pickSubCategory('食'),
        timeSlot: foodTimeSlots[foodSlotIndex % foodTimeSlots.length],
        suggestedTime: '',
        energyLevel: 'low'
      });
      foodSlotIndex++;
    }

    if (stayCount > 0) {
      skeleton.push({
        order: 0,
        category: '宿',
        subCategory: pickSubCategory('宿'),
        timeSlot: 'overnight',
        suggestedTime: '22:00',
        energyLevel: 'low'
      });
    }

    const remainingSlots = K - skeleton.length;
    const fillableCategories = ['生態文化教育', '遊程體驗', '娛樂設施', '活動', '景點', '購物'];
    const weights = fillableCategories.map(c => CATEGORY_DATA[c].weight);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let lastActivityCount = 0;
    const activityCategories = ['生態文化教育', '遊程體驗', '活動', '景點'];

    for (let i = 0; i < remainingSlots; i++) {
      let selectedCategory: string;
      
      if (lastActivityCount >= 2) {
        const restCategories = ['食', '購物'];
        selectedCategory = restCategories[Math.floor(Math.random() * restCategories.length)];
        lastActivityCount = 0;
      } else {
        const rand = Math.random() * totalWeight;
        let cumulative = 0;
        selectedCategory = fillableCategories[0];
        for (let j = 0; j < fillableCategories.length; j++) {
          cumulative += weights[j];
          if (rand < cumulative) {
            selectedCategory = fillableCategories[j];
            break;
          }
        }
      }

      if (activityCategories.includes(selectedCategory)) {
        lastActivityCount++;
      } else {
        lastActivityCount = 0;
      }

      const validSlots = CATEGORY_DATA[selectedCategory].timeSlots;
      const timeSlot = validSlots[Math.floor(Math.random() * validSlots.length)];

      let energyLevel: 'high' | 'medium' | 'low' = 'medium';
      if (['活動', '遊程體驗'].includes(selectedCategory)) {
        energyLevel = 'high';
      } else if (['食', '購物', '宿'].includes(selectedCategory)) {
        energyLevel = 'low';
      }

      skeleton.push({
        order: 0,
        category: selectedCategory,
        subCategory: pickSubCategory(selectedCategory),
        timeSlot: timeSlot,
        suggestedTime: '',
        energyLevel: energyLevel
      });
    }

    skeleton.sort((a, b) => {
      const aIdx = TIME_SLOT_ORDER.indexOf(a.timeSlot);
      const bIdx = TIME_SLOT_ORDER.indexOf(b.timeSlot);
      return aIdx - bIdx;
    });

    const timeMap: Record<string, string> = {
      'breakfast': '08:00',
      'morning': '10:00',
      'lunch': '12:30',
      'afternoon': '14:30',
      'tea_time': '16:00',
      'dinner': '18:30',
      'evening': '20:00',
      'night': '21:30',
      'late_night': '22:30',
      'overnight': '23:00'
    };

    skeleton.forEach((item, idx) => {
      item.order = idx + 1;
      item.suggestedTime = timeMap[item.timeSlot] || '12:00';
    });

    return {
      targetDistrict: lockedDistrict,
      userRequestCount: cardCount,
      generatedCount: skeleton.length,
      skeleton: skeleton
    };
  }

  // ============ Gemini AI Itinerary Generation ============

  app.post("/api/generate-itinerary", async (req, res) => {
    try {
      const { country, city, level, language, collectedNames } = req.body;
      
      const langMap: Record<string, string> = {
        'zh-TW': '繁體中文',
        'en': 'English',
        'ja': '日本語',
        'ko': '한국어'
      };
      const outputLang = langMap[language] || 'English';
      
      const itemCount = Math.min(12, Math.max(5, Math.floor(level * 1.2)));
      
      const skeletonResult = generateItinerarySkeleton(country, city, itemCount);
      const { targetDistrict, skeleton } = skeletonResult;

      const categoryMap: Record<string, string> = {
        '食': 'Food', '宿': 'Stay', '生態文化教育': 'Education',
        '遊程體驗': 'Activity', '娛樂設施': 'Entertainment',
        '活動': 'Activity', '景點': 'Scenery', '購物': 'Shopping'
      };

      // Check cache for existing places
      const cachedPlaces = await storage.getCachedPlaces(targetDistrict, city, country);
      const cacheMap = new Map(cachedPlaces.map(p => [p.subCategory, p]));
      
      // Separate skeleton items into cached and uncached
      // Track used place names to prevent duplicates within the same pull
      const usedPlaceNamesInPull: Set<string> = new Set(collectedNames || []);
      const cachedItems: any[] = [];
      const uncachedSkeleton: Array<typeof skeleton[0] & { originalIdx: number }> = [];
      
      skeleton.forEach((item, idx) => {
        const cached = cacheMap.get(item.subCategory);
        // Check both collectedNames AND usedPlaceNamesInPull to prevent duplicates
        if (cached && !usedPlaceNamesInPull.has(cached.placeName)) {
          cachedItems.push({
            skeletonIdx: idx,
            cached: cached,
            skeleton: item
          });
          // Mark this place as used so it won't appear again in this pull
          usedPlaceNamesInPull.add(cached.placeName);
        } else {
          uncachedSkeleton.push({ ...item, originalIdx: idx });
        }
      });

      console.log(`Cache hit: ${cachedItems.length}/${skeleton.length} items from cache`);

      let aiGeneratedItems: any[] = [];

      // Only call Gemini if there are uncached items
      if (uncachedSkeleton.length > 0) {
        const skeletonInstructions = uncachedSkeleton.map((item, idx) => 
          `${idx + 1}. [${item.timeSlot}] ${categoryMap[item.category] || item.category} - ${item.subCategory} (${item.suggestedTime}, energy: ${item.energyLevel})`
        ).join('\n');

        const prompt = `You are a professional travel planner AI. Fill in REAL place names for this itinerary skeleton in ${city}, ${country}.

【目標區域 Target District】
All places MUST be in "${targetDistrict}" district (within 5-10km radius).

【行程骨架 Itinerary Skeleton - FOLLOW THIS EXACTLY】
${skeletonInstructions}

【任務說明 Your Task】
For each skeleton slot above, find a REAL, existing place in ${targetDistrict} that matches:
- The category and sub-category specified
- The time slot and energy level
- Must be an actual business/location that exists

【排除清單 Exclusions】
Do NOT include any of these places (already used): ${usedPlaceNamesInPull.size > 0 ? Array.from(usedPlaceNamesInPull).join(', ') : 'none'}

Output language: ${outputLang}
Output ONLY valid JSON array, no markdown, no explanation.

[
${uncachedSkeleton.map((item, idx) => `  {
    "place_name": "REAL place name for ${item.subCategory} in ${targetDistrict}",
    "description": "2-3 sentence description",
    "category": "${categoryMap[item.category] || item.category}",
    "sub_category": "${item.subCategory}",
    "suggested_time": "${item.suggestedTime}",
    "duration": "1-2 hours",
    "time_slot": "${item.timeSlot}",
    "search_query": "place name ${city}",
    "color_hex": "#6366f1",
    "energy_level": "${item.energyLevel}"
  }`).join(',\n')}
]`;

        const responseText = await callGemini(prompt);
        let jsonText = responseText || '';
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        aiGeneratedItems = JSON.parse(jsonText);
      }

      // Merge cached and AI-generated items
      const districtCenter = await getDistrictBoundary(targetDistrict, city, country);
      const finalInventory: any[] = new Array(skeleton.length);

      // Process cached items (no Google API calls needed - data already in cache)
      for (const { skeletonIdx, cached, skeleton: skelItem } of cachedItems) {
        const cachedLocation = cached.locationLat && cached.locationLng 
          ? { lat: parseFloat(cached.locationLat), lng: parseFloat(cached.locationLng) }
          : null;
        
        finalInventory[skeletonIdx] = {
          id: Date.now() + skeletonIdx,
          place_name: cached.placeName,
          description: cached.description,
          category: cached.category,
          sub_category: cached.subCategory,
          suggested_time: skelItem.suggestedTime,
          duration: cached.duration || '1-2 hours',
          time_slot: skelItem.timeSlot,
          search_query: cached.searchQuery,
          color_hex: cached.colorHex || '#6366f1',
          city: city,
          country: country,
          district: targetDistrict,
          energy_level: skelItem.energyLevel,
          is_coupon: false,
          coupon_data: null,
          operating_status: 'OPEN',
          place_id: cached.placeId || null,
          verified_name: cached.verifiedName || cached.placeName,
          verified_address: cached.verifiedAddress || null,
          google_rating: cached.googleRating ? Number(cached.googleRating) : null,
          location: cachedLocation,
          is_location_verified: cached.isLocationVerified === true,
          district_center: districtCenter,
          from_cache: true
        };
      }

      // Process AI-generated items (need Google API verification and cache saving)
      const newCacheEntries: any[] = [];
      
      for (let i = 0; i < uncachedSkeleton.length; i++) {
        const skelItem = uncachedSkeleton[i];
        const aiItem = aiGeneratedItems[i];
        const originalIdx = skelItem.originalIdx;

        const placeResult = await searchPlaceInDistrict(
          aiItem.place_name,
          targetDistrict,
          city,
          country
        );

        let isVerified = false;
        let placeLocation: { lat: number; lng: number } | null = null;

        if (placeResult && placeResult.geometry) {
          placeLocation = placeResult.geometry.location;
          if (districtCenter) {
            isVerified = isWithinRadius(districtCenter, placeLocation, 5);
          } else {
            isVerified = true;
          }
        }

        const inventoryItem = {
          id: Date.now() + originalIdx,
          place_name: aiItem.place_name,
          description: aiItem.description,
          category: aiItem.category,
          sub_category: aiItem.sub_category,
          suggested_time: skelItem.suggestedTime,
          duration: aiItem.duration || '1-2 hours',
          time_slot: skelItem.timeSlot,
          search_query: aiItem.search_query,
          color_hex: aiItem.color_hex || '#6366f1',
          city: city,
          country: country,
          district: targetDistrict,
          energy_level: skelItem.energyLevel,
          is_coupon: false,
          coupon_data: null,
          operating_status: 'OPEN',
          place_id: placeResult?.place_id || null,
          verified_name: placeResult?.name || aiItem.place_name,
          verified_address: placeResult?.formatted_address || null,
          google_rating: placeResult?.rating || null,
          location: placeLocation,
          is_location_verified: isVerified,
          district_center: districtCenter,
          from_cache: false
        };

        finalInventory[originalIdx] = inventoryItem;

        // Prepare cache entry
        newCacheEntries.push({
          subCategory: aiItem.sub_category,
          district: targetDistrict,
          city: city,
          country: country,
          placeName: aiItem.place_name,
          description: aiItem.description,
          category: aiItem.category,
          suggestedTime: skelItem.suggestedTime,
          duration: aiItem.duration || '1-2 hours',
          searchQuery: aiItem.search_query,
          colorHex: aiItem.color_hex || '#6366f1',
          placeId: placeResult?.place_id || null,
          verifiedName: placeResult?.name || null,
          verifiedAddress: placeResult?.formatted_address || null,
          googleRating: placeResult?.rating?.toString() || null,
          locationLat: placeLocation?.lat?.toString() || null,
          locationLng: placeLocation?.lng?.toString() || null,
          isLocationVerified: isVerified
        });
      }

      // Save new entries to cache
      if (newCacheEntries.length > 0) {
        try {
          await storage.savePlacesToCache(newCacheEntries);
          console.log(`Saved ${newCacheEntries.length} new places to cache`);
        } catch (cacheError) {
          console.error('Failed to save to cache:', cacheError);
        }
      }

      const data = {
        status: 'success',
        meta: {
          date: new Date().toISOString().split('T')[0],
          country: country,
          city: city,
          locked_district: targetDistrict,
          user_level: level,
          total_items: skeleton.length,
          verification_enabled: !!GOOGLE_MAPS_API_KEY,
          cache_hits: cachedItems.length,
          ai_generated: uncachedSkeleton.length
        },
        inventory: finalInventory
      };

      res.json({ data, sources: [] });
    } catch (error) {
      console.error("Gemini generation error:", error);
      res.status(500).json({ error: "Failed to generate itinerary" });
    }
  });

  // ============ Recur Payment Routes ============
  
  app.post("/api/checkout/create-session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { customerEmail } = req.body;
      
      const secretKey = process.env.RECUR_SECRET_KEY;
      if (!secretKey) {
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const appUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;

      const response = await fetch(`${RECUR_API_URL}/checkout/sessions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: RECUR_PREMIUM_PLAN_ID,
          mode: "SUBSCRIPTION",
          successUrl: `${appUrl}?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${appUrl}?payment_cancelled=true`,
          customerEmail: customerEmail || undefined,
          metadata: {
            userId: userId,
            plan: "premium"
          }
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Recur API error:", data);
        return res.status(response.status).json({ error: data.error || "Checkout failed" });
      }

      res.json({ url: data.url, sessionId: data.id });
    } catch (error) {
      console.error("Create checkout session error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.get("/api/checkout/session/:sessionId", isAuthenticated, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const secretKey = process.env.RECUR_SECRET_KEY;
      
      if (!secretKey) {
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const response = await fetch(`${RECUR_API_URL}/checkout/sessions/${sessionId}`, {
        headers: {
          "Authorization": `Bearer ${secretKey}`,
        },
      });

      const session = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: session.error });
      }

      res.json({ session });
    } catch (error) {
      console.error("Fetch checkout session error:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // Webhook for Recur payment events
  app.post("/api/webhooks/recur", async (req, res) => {
    try {
      const event = req.body;
      console.log("=== Recur Webhook Received ===");
      console.log("Event Type:", event.type);
      console.log("Event Data:", JSON.stringify(event, null, 2));

      switch (event.type) {
        case "checkout.completed": {
          // 結帳完成 - 啟用訂閱
          const checkout = event.data;
          const userId = checkout.metadata?.userId;
          
          if (userId) {
            const merchant = await storage.getMerchantByUserId(userId);
            if (merchant) {
              await storage.updateMerchantPlan(merchant.id, "premium");
              console.log(`[checkout.completed] Upgraded merchant ${merchant.id} to premium`);
            }
          }
          break;
        }

        case "subscription.created": {
          // 訂閱建立
          const subscription = event.data;
          const userId = subscription.metadata?.userId;
          console.log(`[subscription.created] Subscription ${subscription.id} created for user ${userId}`);
          
          if (userId && subscription.status === "active") {
            const merchant = await storage.getMerchantByUserId(userId);
            if (merchant) {
              await storage.updateMerchantPlan(merchant.id, "premium");
              console.log(`[subscription.created] Activated premium for merchant ${merchant.id}`);
            }
          }
          break;
        }

        case "subscription.updated": {
          // 訂閱更新
          const subscription = event.data;
          const userId = subscription.metadata?.userId;
          console.log(`[subscription.updated] Subscription ${subscription.id} updated, status: ${subscription.status}`);
          
          if (userId) {
            const merchant = await storage.getMerchantByUserId(userId);
            if (merchant) {
              if (subscription.status === "active") {
                await storage.updateMerchantPlan(merchant.id, "premium");
                console.log(`[subscription.updated] Merchant ${merchant.id} plan set to premium`);
              } else if (subscription.status === "canceled" || subscription.status === "expired") {
                await storage.updateMerchantPlan(merchant.id, "free");
                console.log(`[subscription.updated] Merchant ${merchant.id} plan downgraded to free`);
              }
            }
          }
          break;
        }

        case "subscription.canceled": {
          // 訂閱取消
          const subscription = event.data;
          const userId = subscription.metadata?.userId;
          console.log(`[subscription.canceled] Subscription ${subscription.id} canceled for user ${userId}`);
          
          if (userId) {
            const merchant = await storage.getMerchantByUserId(userId);
            if (merchant) {
              await storage.updateMerchantPlan(merchant.id, "free");
              console.log(`[subscription.canceled] Downgraded merchant ${merchant.id} to free`);
            }
          }
          break;
        }

        case "invoice.paid": {
          // 發票付款成功 - 續訂成功
          const invoice = event.data;
          console.log(`[invoice.paid] Invoice ${invoice.id} paid`);
          break;
        }

        case "invoice.payment_failed": {
          // 發票付款失敗
          const invoice = event.data;
          console.log(`[invoice.payment_failed] Invoice ${invoice.id} payment failed`);
          break;
        }

        default:
          console.log(`[webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Endpoint to get the webhook URL (for configuration reference)
  app.get("/api/webhooks/recur/info", (req, res) => {
    const domain = process.env.REPLIT_DEV_DOMAIN || `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    const webhookUrl = `https://${domain}/api/webhooks/recur`;
    res.json({ 
      webhookUrl,
      supportedEvents: [
        "checkout.completed",
        "subscription.created", 
        "subscription.updated",
        "subscription.canceled",
        "invoice.paid",
        "invoice.payment_failed"
      ]
    });
  });

  // ============ Location Hierarchy Routes ============

  app.get("/api/locations/countries", async (req, res) => {
    try {
      const countriesList = await storage.getCountries();
      res.json({ countries: countriesList });
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ error: "Failed to fetch countries" });
    }
  });

  app.get("/api/locations/regions/:countryId", async (req, res) => {
    try {
      const countryId = parseInt(req.params.countryId);
      const regionsList = await storage.getRegionsByCountry(countryId);
      res.json({ regions: regionsList });
    } catch (error) {
      console.error("Error fetching regions:", error);
      res.status(500).json({ error: "Failed to fetch regions" });
    }
  });

  app.get("/api/locations/districts/:regionId", async (req, res) => {
    try {
      const regionId = parseInt(req.params.regionId);
      const districtsList = await storage.getDistrictsByRegion(regionId);
      res.json({ districts: districtsList });
    } catch (error) {
      console.error("Error fetching districts:", error);
      res.status(500).json({ error: "Failed to fetch districts" });
    }
  });

  app.get("/api/locations/districts/country/:countryId", async (req, res) => {
    try {
      const countryId = parseInt(req.params.countryId);
      const districtsList = await storage.getDistrictsByCountry(countryId);
      res.json({ districts: districtsList, count: districtsList.length });
    } catch (error) {
      console.error("Error fetching districts by country:", error);
      res.status(500).json({ error: "Failed to fetch districts" });
    }
  });

  // ============ Category Routes ============

  app.get("/api/categories", async (req, res) => {
    try {
      const categoriesList = await storage.getCategories();
      res.json({ categories: categoriesList });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.get("/api/categories/:categoryId/subcategories", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      const subcategoriesList = await storage.getSubcategoriesByCategory(categoryId);
      res.json({ subcategories: subcategoriesList });
    } catch (error) {
      console.error("Error fetching subcategories:", error);
      res.status(500).json({ error: "Failed to fetch subcategories" });
    }
  });

  // ============ Gacha Pull Route ============

  // Helper function to generate place using Gemini AI
  async function generatePlaceWithAI(
    districtNameZh: string, 
    regionNameZh: string, 
    countryNameZh: string,
    subcategoryNameZh: string,
    categoryNameZh: string,
    excludePlaceNames: string[] = []
  ): Promise<{ placeName: string; description: string } | null> {
    try {
      const exclusionNote = excludePlaceNames.length > 0 
        ? `\n注意：請不要推薦以下已經出現過的地點：${excludePlaceNames.join('、')}` 
        : '';
      
      const prompt = `你是台灣在地旅遊專家。請推薦一個位於「${regionNameZh}${districtNameZh}」的「${subcategoryNameZh}」類型店家或景點。

要求：
1. 必須是真實存在、適合觀光旅遊的店家或景點
2. 必須確實位於 ${regionNameZh}${districtNameZh} 這個行政區內
3. 提供一個有吸引力的介紹（約30-50字），說明為什麼遊客應該造訪
4. 不要推薦一般性的公共設施（如普通的公立圖書館、區公所、戶政事務所、學校等）
5. 優先推薦有特色、有口碑、適合遊客體驗的地點${exclusionNote}

請以 JSON 格式回答：
{
  "placeName": "店家或景點名稱",
  "description": "簡短介紹"
}

只回答 JSON，不要有其他文字。`;

      const responseText = await callGemini(prompt);
      
      // Parse the JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("Failed to parse Gemini response:", responseText);
        return null;
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        placeName: parsed.placeName,
        description: parsed.description
      };
    } catch (error) {
      console.error("Gemini AI generation error:", error);
      return null;
    }
  }

  // Helper function to verify place with Google Places API
  async function verifyPlaceWithGoogle(
    placeName: string,
    districtNameZh: string,
    regionNameZh: string
  ): Promise<{
    verified: boolean;
    placeId?: string;
    verifiedName?: string;
    verifiedAddress?: string;
    rating?: number;
    location?: { lat: number; lng: number };
    googleTypes?: string[];
    primaryType?: string;
  }> {
    if (!GOOGLE_MAPS_API_KEY) {
      return { verified: false };
    }

    try {
      // Search for the specific place name in the district
      const searchText = encodeURIComponent(`${placeName} ${districtNameZh} ${regionNameZh}`);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchText}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        // === HARDCODED: Select from top 10 results with 1/N probability ===
        // Filter to valid results (in correct district, not generic placeholder names)
        const genericPlaceholderPatterns = ['探索', '旅行社', '服務中心', '遊客中心', '資訊站'];
        const validResults = data.results.slice(0, 10).filter((place: any) => {
          const address = place.formatted_address || '';
          const name = place.name || '';
          
          // Must be in correct district
          const isInDistrict = address.includes(regionNameZh) && address.includes(districtNameZh);
          
          // Must not be a generic placeholder name
          const isGenericPlaceholder = genericPlaceholderPatterns.some(pattern => name.includes(pattern));
          
          return isInDistrict && !isGenericPlaceholder;
        });
        
        if (validResults.length === 0) {
          return { verified: false };
        }
        
        // Random 1/N selection from valid results
        const randomIndex = Math.floor(Math.random() * validResults.length);
        const place = validResults[randomIndex];
        const address = place.formatted_address || '';
        
        // Get Google types (first non-generic type as primary)
        const googleTypes = place.types || [];
        const genericTypes = ['point_of_interest', 'establishment', 'premise', 'political', 'locality', 'sublocality'];
        const primaryType = googleTypes.find((t: string) => !genericTypes.includes(t)) || googleTypes[0];
        
        return {
          verified: true,
          placeId: place.place_id,
          verifiedName: place.name,
          verifiedAddress: address,
          rating: place.rating,
          location: place.geometry?.location,
          googleTypes,
          primaryType
        };
      }
      
      return { verified: false };
    } catch (error) {
      console.error("Google Places verification error:", error);
      return { verified: false };
    }
  }

  // Helper function to generate a single place for a subcategory in a specific district
  async function generatePlaceForSubcategory(
    districtNameZh: string,
    regionNameZh: string,
    countryNameZh: string,
    category: any,
    subcategory: any,
    language: string,
    excludePlaceNames: string[] = []
  ): Promise<{
    category: any;
    subcategory: any;
    place: any;
    source: 'cache' | 'ai';
    isVerified: boolean;
  } | null> {
    const subcategoryNameZh = subcategory.nameZh;
    const categoryNameZh = category.nameZh;

    // Check cache first
    const cachedPlace = await storage.getCachedPlace(
      subcategoryNameZh,
      districtNameZh,
      regionNameZh,
      countryNameZh
    );

    // Only use cache if the place is not in the exclusion list
    if (cachedPlace && !excludePlaceNames.includes(cachedPlace.placeName)) {
      return {
        category,
        subcategory,
        place: {
          name: cachedPlace.placeName,
          description: cachedPlace.description,
          address: cachedPlace.verifiedAddress,
          placeId: cachedPlace.placeId,
          rating: cachedPlace.googleRating,
          googleTypes: cachedPlace.googleTypes?.split(',').filter(Boolean) || [],
          primaryType: cachedPlace.primaryType || null,
          location: cachedPlace.locationLat && cachedPlace.locationLng ? {
            lat: parseFloat(cachedPlace.locationLat),
            lng: parseFloat(cachedPlace.locationLng)
          } : null
        },
        source: 'cache',
        isVerified: cachedPlace.isLocationVerified || false
      };
    }

    // Generate with AI and verify
    const MAX_RETRIES = 2;
    let attempts = 0;
    let failedAttempts: string[] = [];

    while (attempts < MAX_RETRIES) {
      attempts++;
      
      // Combine failed attempts with already used places
      const allExclusions = [...excludePlaceNames, ...failedAttempts];
      
      const aiResult = await generatePlaceWithAI(
        districtNameZh,
        regionNameZh,
        countryNameZh,
        subcategoryNameZh,
        categoryNameZh,
        allExclusions
      );

      if (aiResult) {
        const verification = await verifyPlaceWithGoogle(
          aiResult.placeName,
          districtNameZh,
          regionNameZh
        );

        if (verification.verified) {
          // Save to cache
          const cacheEntry = await storage.savePlaceToCache({
            subCategory: subcategoryNameZh,
            district: districtNameZh,
            city: regionNameZh,
            country: countryNameZh,
            placeName: verification.verifiedName || aiResult.placeName,
            description: aiResult.description,
            category: categoryNameZh,
            searchQuery: `${subcategoryNameZh} ${districtNameZh} ${regionNameZh}`,
            placeId: verification.placeId || null,
            verifiedName: verification.verifiedName || null,
            verifiedAddress: verification.verifiedAddress || null,
            googleRating: verification.rating?.toString() || null,
            googleTypes: verification.googleTypes?.join(',') || null,
            primaryType: verification.primaryType || null,
            locationLat: verification.location?.lat?.toString() || null,
            locationLng: verification.location?.lng?.toString() || null,
            isLocationVerified: true
          });

          console.log(`[${categoryNameZh}] Verified: ${aiResult.placeName}`);
          return {
            category,
            subcategory,
            place: {
              name: cacheEntry.placeName,
              description: cacheEntry.description,
              address: cacheEntry.verifiedAddress,
              placeId: cacheEntry.placeId,
              rating: cacheEntry.googleRating,
              googleTypes: cacheEntry.googleTypes?.split(',').filter(Boolean) || [],
              primaryType: cacheEntry.primaryType || null,
              location: cacheEntry.locationLat && cacheEntry.locationLng ? {
                lat: parseFloat(cacheEntry.locationLat),
                lng: parseFloat(cacheEntry.locationLng)
              } : null
            },
            source: 'ai',
            isVerified: true
          };
        } else {
          failedAttempts.push(aiResult.placeName);
        }
      }
    }

    // Return a placeholder if no verified place found
    return {
      category,
      subcategory,
      place: {
        name: `${districtNameZh}${categoryNameZh}探索`,
        description: `探索${regionNameZh}${districtNameZh}的${subcategoryNameZh}特色。`,
        address: null,
        placeId: null,
        rating: null,
        location: null,
        warning: `該區域目前較少此類型店家`
      },
      source: 'ai',
      isVerified: false
    };
  }

  // New endpoint: Generate a complete itinerary using parallel time-slot AI architecture
  app.post("/api/gacha/itinerary", async (req, res) => {
    try {
      const { countryId, regionId, language = 'zh-TW', itemCount = 8 } = req.body;

      if (!countryId) {
        return res.status(400).json({ error: "countryId is required" });
      }

      // Step 1: Random district selection
      let district;
      if (regionId) {
        district = await storage.getRandomDistrictByRegion(regionId);
      } else {
        district = await storage.getRandomDistrictByCountry(countryId);
      }
      if (!district) {
        return res.status(404).json({ error: "No districts found" });
      }

      const districtWithParents = await storage.getDistrictWithParents(district.id);
      if (!districtWithParents) {
        return res.status(500).json({ error: "Failed to get district info" });
      }

      const getLocalizedName = (item: any, lang: string): string => {
        switch (lang) {
          case 'ja': return item.nameJa || item.nameZh || item.nameEn;
          case 'ko': return item.nameKo || item.nameZh || item.nameEn;
          case 'en': return item.nameEn;
          default: return item.nameZh || item.nameEn;
        }
      };

      const districtNameZh = districtWithParents.district.nameZh;
      const regionNameZh = districtWithParents.region.nameZh;
      const countryNameZh = districtWithParents.country.nameZh;

      // Step 2: Get all subcategories with their parent categories
      const allSubcategories = await storage.getAllSubcategoriesWithCategory();
      if (!allSubcategories || allSubcategories.length === 0) {
        return res.status(404).json({ error: "No subcategories found" });
      }

      // Step 3: Define AI worker distribution based on itemCount
      // Each AI has specific responsibilities per time slot
      type AIWorker = 'ai1_morning' | 'ai2_afternoon' | 'ai3_evening' | 'ai4_night';
      
      interface AITask {
        worker: AIWorker;
        tasks: { type: 'breakfast' | 'lunch' | 'dinner' | 'activity' | 'stay'; count: number }[];
      }
      
      const getAIDistribution = (count: number): AITask[] => {
        switch (count) {
          case 5: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 1 }] }, // 早餐 + 1項早上活動
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] }  // 午餐 + 2項下午活動
          ];
          case 6: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] }, // 早餐 + 2項早上活動
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] }  // 午餐 + 2項下午活動
          ];
          case 7: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }] }
          ];
          case 8: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 1 }] }
          ];
          case 9: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] }
          ];
          case 10: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai4_night', tasks: [{ type: 'stay', count: 1 }] }
          ];
          case 11: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai4_night', tasks: [{ type: 'stay', count: 1 }, { type: 'activity', count: 1 }] }
          ];
          case 12: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai3_evening', tasks: [{ type: 'dinner', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai4_night', tasks: [{ type: 'stay', count: 1 }, { type: 'activity', count: 2 }] }
          ];
          default: return [
            { worker: 'ai1_morning', tasks: [{ type: 'breakfast', count: 1 }, { type: 'activity', count: 2 }] },
            { worker: 'ai2_afternoon', tasks: [{ type: 'lunch', count: 1 }, { type: 'activity', count: 2 }] }
          ];
        }
      };

      const aiDistribution = getAIDistribution(itemCount);
      
      console.log(`\n=== Generating itinerary for ${regionNameZh}${districtNameZh} (${itemCount} items, ${aiDistribution.length} AI workers) ===`);
      console.log(`AI Distribution:`, aiDistribution.map(a => `${a.worker}: ${a.tasks.map(t => `${t.type}×${t.count}`).join('+')}`).join(' | '));

      // === HARDCODED PROBABILITY CONSTANTS ===
      const CACHE_USE_PROBABILITY = 0.25; // 25% chance to use cache
      const COLLECTED_REDUCTION_PROBABILITY = 0.45; // 45% reduction for collected items
      
      // Step 4: Select subcategory using 1/8 category probability, then 1/N subcategory probability
      // with time-appropriate filtering to avoid awkward combinations
      const selectSubcategoryForTask = (worker: AIWorker, taskType: string): typeof allSubcategories[0] | null => {
        // Define excluded categories/subcategories per worker to avoid awkward combinations
        const excludedByWorker: Record<AIWorker, { categories: string[]; subcategories: string[] }> = {
          'ai1_morning': { 
            categories: [], 
            subcategories: ['酒吧', 'KTV', '夜市'] // No nightlife in morning
          },
          'ai2_afternoon': { 
            categories: [], 
            subcategories: ['早午餐'] // No breakfast in afternoon
          },
          'ai3_evening': { 
            categories: [], 
            subcategories: ['早午餐', '咖啡廳'] // No breakfast/cafe at dinner
          },
          'ai4_night': { 
            categories: [], 
            subcategories: ['早午餐', '咖啡廳'] // No breakfast at night
          }
        };

        // For specific task types, filter directly
        if (taskType === 'breakfast') {
          // Prefer breakfast-appropriate food: 早午餐, 咖啡廳, 在地早餐
          const breakfastSubcats = allSubcategories.filter(s => 
            s.category.code === 'food' && 
            (s.nameZh.includes('早') || s.nameZh.includes('咖啡') || s.nameZh.includes('甜點'))
          );
          // Fallback to any food if no breakfast-specific found
          const fallback = allSubcategories.filter(s => s.category.code === 'food');
          const options = breakfastSubcats.length > 0 ? breakfastSubcats : fallback;
          return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
        } else if (taskType === 'lunch') {
          // Any food subcategory for lunch, excluding late-night options
          const lunchSubcats = allSubcategories.filter(s => 
            s.category.code === 'food' && 
            !s.nameZh.includes('宵夜') && !s.nameZh.includes('酒')
          );
          const fallback = allSubcategories.filter(s => s.category.code === 'food');
          const options = lunchSubcats.length > 0 ? lunchSubcats : fallback;
          return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
        } else if (taskType === 'dinner') {
          // Any food subcategory for dinner
          const dinnerSubcats = allSubcategories.filter(s => 
            s.category.code === 'food' && !s.nameZh.includes('早')
          );
          const fallback = allSubcategories.filter(s => s.category.code === 'food');
          const options = dinnerSubcats.length > 0 ? dinnerSubcats : fallback;
          return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
        } else if (taskType === 'stay') {
          const staySubcats = allSubcategories.filter(s => s.category.code === 'stay');
          return staySubcats.length > 0 ? staySubcats[Math.floor(Math.random() * staySubcats.length)] : null;
        }
        
        // For 'activity' task type: use 1/8 category probability, then 1/N subcategory probability
        // Step A: Get all 8 categories (excluding food and stay for activities)
        const allCategorySet = new Set<string>();
        allSubcategories.forEach(s => allCategorySet.add(s.category.code));
        const allCategories = Array.from(allCategorySet);
        const activityCategories = allCategories.filter(code => 
          code !== 'food' && code !== 'stay'
        );
        
        if (activityCategories.length === 0) return null;
        
        // Step B: Apply worker-specific exclusions
        const exclusions = excludedByWorker[worker];
        const validCategories = activityCategories.filter(code => !exclusions.categories.includes(code));
        
        if (validCategories.length === 0) return null;
        
        // Step C: Pick random category with 1/N probability (equal chance)
        const selectedCategoryCode = validCategories[Math.floor(Math.random() * validCategories.length)];
        
        // Step D: Get subcategories for this category, excluding awkward ones
        const categorySubcats = allSubcategories.filter(s => 
          s.category.code === selectedCategoryCode &&
          !exclusions.subcategories.includes(s.nameZh) &&
          s.preferredTimeSlot !== 'stay'
        );
        
        if (categorySubcats.length === 0) return null;
        
        // Step E: Pick random subcategory with 1/N probability (equal chance)
        return categorySubcats[Math.floor(Math.random() * categorySubcats.length)];
      };

      const startTime = Date.now();
      let cacheHits = 0;
      let aiGenerated = 0;

      // Helper to build item with merchant promo
      const buildItemWithPromo = async (result: any) => {
        let merchantPromo = null;
        let merchantLink = null;
        
        if (result.place?.place_id) {
          merchantLink = await storage.getPlaceLinkByGooglePlaceId(result.place.place_id);
        }
        if (!merchantLink && result.place?.name) {
          merchantLink = await storage.getPlaceLinkByPlace(result.place.name, districtNameZh, regionNameZh);
        }
        
        if (merchantLink && merchantLink.isPromoActive && merchantLink.promoTitle) {
          merchantPromo = {
            merchantId: merchantLink.merchantId,
            title: merchantLink.promoTitle,
            description: merchantLink.promoDescription,
            imageUrl: merchantLink.promoImageUrl
          };
        }

        return {
          category: {
            id: result.category.id,
            code: result.category.code,
            name: getLocalizedName(result.category, language),
            colorHex: result.category.colorHex
          },
          subcategory: {
            id: result.subcategory.id,
            code: result.subcategory.code,
            name: getLocalizedName(result.subcategory, language)
          },
          place: result.place,
          isVerified: result.isVerified,
          source: result.source,
          is_promo_active: !!merchantPromo,
          store_promo: merchantPromo?.title || null,
          merchant_promo: merchantPromo
        };
      };

      // Step 5: Preload cache for this district
      const cachedPlacesForDistrict = await storage.getCachedPlaces(
        districtNameZh,
        regionNameZh,
        countryNameZh
      );
      const cacheBySubcategory = new Map<string, typeof cachedPlacesForDistrict[0]>();
      for (const cached of cachedPlacesForDistrict) {
        if (!cacheBySubcategory.has(cached.subCategory)) {
          cacheBySubcategory.set(cached.subCategory, cached);
        }
      }

      // Step 6: Get user's collected place names for probability reduction
      const userId = (req as any).user?.id;
      let collectedPlaceNames: Set<string> = new Set();
      if (userId) {
        try {
          const userCollections = await storage.getUserCollections(userId);
          for (const collection of userCollections) {
            if (collection.placeName) {
              collectedPlaceNames.add(collection.placeName);
            }
          }
        } catch (e) {
          console.log("Could not fetch user collections for probability adjustment");
        }
      }
      
      // Step 7: Execute each AI worker in TRUE PARALLEL
      // Each worker handles its assigned tasks (breakfast/lunch/dinner/activity/stay)
      // Tasks within each worker also run in parallel for maximum speed
      const executeAIWorker = async (aiTask: AITask): Promise<any[]> => {
        const usedSubcatIds = new Set<number>();
        
        // Phase 1: Pre-select all subcategories for this worker (synchronous)
        interface TaskItem {
          taskType: string;
          selectedSubcat: typeof allSubcategories[0];
          cached: typeof cachedPlacesForDistrict[0] | null;
          shouldUseCache: boolean;
        }
        const taskItems: TaskItem[] = [];
        
        for (const task of aiTask.tasks) {
          for (let i = 0; i < task.count; i++) {
            let selectedSubcat = selectSubcategoryForTask(aiTask.worker, task.type);
            
            let retries = 0;
            while (selectedSubcat && usedSubcatIds.has(selectedSubcat.id) && retries < 3) {
              selectedSubcat = selectSubcategoryForTask(aiTask.worker, task.type);
              retries++;
            }
            
            if (!selectedSubcat || usedSubcatIds.has(selectedSubcat.id)) continue;
            usedSubcatIds.add(selectedSubcat.id);
            
            const shouldUseCache = Math.random() < CACHE_USE_PROBABILITY;
            const cached = cacheBySubcategory.get(selectedSubcat.nameZh) || null;
            
            taskItems.push({
              taskType: task.type,
              selectedSubcat,
              cached,
              shouldUseCache
            });
          }
        }
        
        console.log(`[${aiTask.worker}] Processing ${taskItems.length} tasks in parallel`);
        
        // Phase 2: Execute all tasks in parallel
        const taskPromises = taskItems.map(async (taskItem) => {
          const { taskType, selectedSubcat, cached, shouldUseCache } = taskItem;
          
          // Try cache first
          if (shouldUseCache && cached && cached.placeName) {
            if (collectedPlaceNames.has(cached.placeName)) {
              if (Math.random() < COLLECTED_REDUCTION_PROBABILITY) {
                console.log(`[${aiTask.worker}] Skipping collected: ${cached.placeName}`);
              } else {
                const item = await buildItemWithPromo({
                  category: selectedSubcat.category,
                  subcategory: selectedSubcat,
                  place: {
                    name: cached.placeName,
                    description: cached.description,
                    place_id: cached.placeId,
                    verified_name: cached.verifiedName,
                    verified_address: cached.verifiedAddress,
                    google_rating: cached.googleRating,
                    lat: cached.locationLat,
                    lng: cached.locationLng,
                    google_types: cached.googleTypes,
                    primary_type: cached.primaryType
                  },
                  isVerified: cached.isLocationVerified,
                  source: 'cache'
                });
                return { ...item, aiWorker: aiTask.worker, taskType };
              }
            } else {
              const item = await buildItemWithPromo({
                category: selectedSubcat.category,
                subcategory: selectedSubcat,
                place: {
                  name: cached.placeName,
                  description: cached.description,
                  place_id: cached.placeId,
                  verified_name: cached.verifiedName,
                  verified_address: cached.verifiedAddress,
                  google_rating: cached.googleRating,
                  lat: cached.locationLat,
                  lng: cached.locationLng,
                  google_types: cached.googleTypes,
                  primary_type: cached.primaryType
                },
                isVerified: cached.isLocationVerified,
                source: 'cache'
              });
              return { ...item, aiWorker: aiTask.worker, taskType };
            }
          }
          
          // Generate with AI (runs in parallel with other tasks)
          const result = await generatePlaceForSubcategory(
            districtNameZh, regionNameZh, countryNameZh,
            selectedSubcat.category, selectedSubcat, language,
            []
          );

          if (result && result.place?.name) {
            // Skip if AI returned "no match found" type response
            const desc = result.place.description || '';
            if (desc.includes('無符合條件') || desc.includes('目前無符合') || desc.includes('沒有符合')) {
              console.log(`[${aiTask.worker}] Skipping no-match result: ${result.place.name}`);
              return null;
            }
            
            if (collectedPlaceNames.has(result.place.name)) {
              if (Math.random() < COLLECTED_REDUCTION_PROBABILITY) {
                console.log(`[${aiTask.worker}] Skipping collected AI: ${result.place.name}`);
                return null;
              }
            }
            
            const item = await buildItemWithPromo(result);
            return { ...item, aiWorker: aiTask.worker, taskType };
          }
          
          return null;
        });
        
        // Wait for all tasks to complete in parallel
        const results = await Promise.all(taskPromises);
        
        // Normalize place names by removing common suffixes/variations
        // Returns original trimmed name if normalization results in empty string
        const normalizePlaceName = (name: string): string => {
          if (!name) return '';
          const trimmed = name.trim();
          const normalized = trimmed
            .replace(/[（(][^）)]*[）)]/g, '') // Remove content in parentheses
            .replace(/旅遊服務園區|生態園區|園區|服務中心|遊客中心|觀光工廠|休閒農場/g, '')
            .replace(/\s+/g, '')
            .trim();
          // Fall back to original if normalization removes everything
          return normalized || trimmed;
        };
        
        // Filter out null results AND deduplicate by Google Place ID (or normalized name as fallback)
        const seenPlaceIds = new Set<string>();
        return results.filter((item): item is NonNullable<typeof item> => {
          if (item === null) return false;
          const placeId = item.place?.place_id || item.place?.placeId;
          const placeName = item.place?.name;
          const normalizedName = normalizePlaceName(placeName || '');
          // Use Place ID as primary dedup key, fall back to normalized name
          const dedupKey = placeId || normalizedName;
          if (!dedupKey || seenPlaceIds.has(dedupKey)) {
            console.log(`[Dedup] Skipping duplicate: ${placeName} (key: ${dedupKey})`);
            return false;
          }
          seenPlaceIds.add(dedupKey);
          return true;
        });
      };

      // Run ALL AI workers in TRUE PARALLEL (not sequential!)
      console.log(`\n=== Starting ${aiDistribution.length} AI workers in PARALLEL ===`);
      const parallelStartTime = Date.now();
      
      const workerPromises = aiDistribution.map(aiTask => {
        const workerStart = Date.now();
        return executeAIWorker(aiTask).then(result => {
          console.log(`[${aiTask.worker}] Completed in ${Date.now() - workerStart}ms (${result.length} items)`);
          return result;
        });
      });
      
      const workerResults = await Promise.all(workerPromises);
      console.log(`=== All workers completed in ${Date.now() - parallelStartTime}ms (parallel execution) ===\n`);

      // Normalize place names by removing common suffixes/variations
      // Returns original trimmed name if normalization results in empty string
      const normalizePlaceName = (name: string): string => {
        if (!name) return '';
        const trimmed = name.trim();
        const normalized = trimmed
          .replace(/[（(][^）)]*[）)]/g, '') // Remove content in parentheses
          .replace(/旅遊服務園區|生態園區|園區|服務中心|遊客中心|觀光工廠|休閒農場/g, '')
          .replace(/\s+/g, '')
          .trim();
        // Fall back to original if normalization removes everything
        return normalized || trimmed;
      };
      
      // Merge results in order: ai1_morning -> ai2_afternoon -> ai3_evening -> ai4_night
      // Use Google Place ID for deduplication to avoid same location with different names
      const items: any[] = [];
      const globalSeenPlaceIds = new Set<string>();
      
      for (const workerItems of workerResults) {
        for (const item of workerItems) {
          const placeId = item.place?.place_id || item.place?.placeId;
          const placeName = item.place?.name;
          const normalizedName = normalizePlaceName(placeName || '');
          const dedupKey = placeId || normalizedName;
          
          if (dedupKey && !globalSeenPlaceIds.has(dedupKey)) {
            globalSeenPlaceIds.add(dedupKey);
            items.push(item);
            if (item.source === 'cache') cacheHits++;
            else aiGenerated++;
          } else {
            console.log(`[Global Dedup] Skipping: ${placeName} (key: ${dedupKey})`);
          }
        }
      }

      // === BACKFILL PHASE: Try to fill missing slots ===
      let shortageWarning: string | null = null;
      const usedSubcatIds = new Set<number>(items.map(i => i.subcategory?.id).filter(Boolean));
      
      if (items.length < itemCount) {
        const missing = itemCount - items.length;
        console.log(`\n=== BACKFILL: Need ${missing} more items ===`);
        
        let backfillAttempts = 0;
        const maxBackfillAttempts = missing * 3;
        
        // Clone and shuffle to avoid mutating original array
        const availableSubcats = allSubcategories
          .filter(s => !usedSubcatIds.has(s.id))
          .slice()
          .sort(() => Math.random() - 0.5);
        
        for (const subcat of availableSubcats) {
          if (items.length >= itemCount || backfillAttempts >= maxBackfillAttempts) break;
          backfillAttempts++;
          
          console.log(`[Backfill] Trying: ${subcat.category?.nameZh} - ${subcat.nameZh}`);
          const result = await generatePlaceForSubcategory(
            districtNameZh, regionNameZh, countryNameZh,
            subcat.category, subcat, language, []
          );
          
          if (result && result.place?.name) {
            // Skip if AI returned "no match found" type response
            const desc = result.place.description || '';
            if (desc.includes('無符合條件') || desc.includes('目前無符合') || desc.includes('沒有符合')) {
              console.log(`[Backfill] Skipping no-match result: ${result.place.name}`);
              continue;
            }
            
            const placeId = result.place.place_id || result.place.placeId;
            const normalizedName = normalizePlaceName(result.place.name);
            const dedupKey = placeId || normalizedName;
            if (!globalSeenPlaceIds.has(dedupKey)) {
              globalSeenPlaceIds.add(dedupKey);
              usedSubcatIds.add(subcat.id);
              const item = await buildItemWithPromo(result);
              items.push({ ...item, aiWorker: 'backfill', taskType: 'backfill' });
              aiGenerated++;
              console.log(`[Backfill] Added: ${result.place.name}`);
            }
          }
        }
      }
      
      // Always set warning when below target
      if (items.length < itemCount) {
        shortageWarning = language === 'zh-TW' 
          ? `此區域的觀光資源有限，僅找到 ${items.length} 個地點`
          : language === 'ja'
          ? `このエリアでは ${items.length} 件のスポットのみ見つかりました`
          : language === 'ko'
          ? `이 지역에서 ${items.length}개의 장소만 찾았습니다`
          : `Only ${items.length} spots found in this area`;
        console.log(`[Shortage] Warning: ${shortageWarning}`);
      }

      const duration = Date.now() - startTime;
      console.log(`Generated ${items.length}/${itemCount} items in ${duration}ms (cache: ${cacheHits}, AI: ${aiGenerated}, workers: ${aiDistribution.length})`);

      // Return the complete itinerary
      res.json({
        success: true,
        itinerary: {
          location: {
            district: {
              id: district.id,
              code: district.code,
              name: getLocalizedName(districtWithParents.district, language),
              nameZh: districtNameZh
            },
            region: {
              id: districtWithParents.region.id,
              code: districtWithParents.region.code,
              name: getLocalizedName(districtWithParents.region, language),
              nameZh: regionNameZh
            },
            country: {
              id: districtWithParents.country.id,
              code: districtWithParents.country.code,
              name: getLocalizedName(districtWithParents.country, language)
            }
          },
          items,
          meta: {
            totalItems: items.length,
            requestedItems: itemCount,
            cacheHits,
            aiGenerated,
            verifiedCount: items.filter(i => i.isVerified).length,
            shortageWarning
          }
        }
      });
    } catch (error) {
      console.error("Itinerary generation error:", error);
      res.status(500).json({ error: "Failed to generate itinerary" });
    }
  });

  // Keep original single pull endpoint for backward compatibility
  app.post("/api/gacha/pull", async (req, res) => {
    try {
      const { countryId, regionId, language = 'zh-TW' } = req.body;

      if (!countryId) {
        return res.status(400).json({ error: "countryId is required" });
      }

      // Step 1: Random district selection
      let district;
      if (regionId) {
        district = await storage.getRandomDistrictByRegion(regionId);
      } else {
        district = await storage.getRandomDistrictByCountry(countryId);
      }
      if (!district) {
        return res.status(404).json({ error: "No districts found" });
      }

      const districtWithParents = await storage.getDistrictWithParents(district.id);
      if (!districtWithParents) {
        return res.status(500).json({ error: "Failed to get district info" });
      }

      // Step 2: Random category and subcategory selection
      const category = await storage.getRandomCategory();
      if (!category) {
        return res.status(404).json({ error: "No categories found" });
      }
      
      const subcategory = await storage.getRandomSubcategoryByCategory(category.id);
      if (!subcategory) {
        return res.status(404).json({ error: "No subcategories found" });
      }

      // Get names for response
      const getLocalizedName = (item: any, lang: string): string => {
        switch (lang) {
          case 'ja': return item.nameJa || item.nameZh || item.nameEn;
          case 'ko': return item.nameKo || item.nameZh || item.nameEn;
          case 'en': return item.nameEn;
          default: return item.nameZh || item.nameEn;
        }
      };

      const districtNameZh = districtWithParents.district.nameZh;
      const regionNameZh = districtWithParents.region.nameZh;
      const countryNameZh = districtWithParents.country.nameZh;

      // Generate place for this subcategory
      const result = await generatePlaceForSubcategory(
        districtNameZh,
        regionNameZh,
        countryNameZh,
        category,
        subcategory,
        language
      );

      if (!result) {
        return res.status(500).json({ error: "Failed to generate place" });
      }

      // Return the gacha result
      res.json({
        success: true,
        pull: {
          location: {
            district: {
              id: district.id,
              code: district.code,
              name: getLocalizedName(districtWithParents.district, language),
              nameZh: districtNameZh
            },
            region: {
              id: districtWithParents.region.id,
              code: districtWithParents.region.code,
              name: getLocalizedName(districtWithParents.region, language),
              nameZh: regionNameZh
            },
            country: {
              id: districtWithParents.country.id,
              code: districtWithParents.country.code,
              name: getLocalizedName(districtWithParents.country, language)
            }
          },
          category: {
            id: result.category.id,
            code: result.category.code,
            name: getLocalizedName(result.category, language),
            colorHex: result.category.colorHex
          },
          subcategory: {
            id: result.subcategory.id,
            code: result.subcategory.code,
            name: getLocalizedName(result.subcategory, language)
          },
          place: result.place,
          meta: {
            source: result.source,
            isVerified: result.isVerified
          }
        }
      });
    } catch (error) {
      console.error("Gacha pull error:", error);
      res.status(500).json({ error: "Failed to perform gacha pull" });
    }
  });

  // ============ Merchant Registration ============
  app.post("/api/merchant/register", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if merchant already exists
      let merchant = await storage.getMerchantByUserId(userId);
      if (merchant) {
        return res.json({ success: true, merchant, isNew: false });
      }

      // Get user info
      const user = await storage.getUser(userId);
      const name = req.body.name || user?.firstName || 'Merchant';
      const email = req.body.email || user?.email || '';

      // Create new merchant
      merchant = await storage.createMerchant({
        userId,
        name,
        email,
        subscriptionPlan: 'free'
      });

      res.json({ success: true, merchant, isNew: true });
    } catch (error) {
      console.error("Merchant registration error:", error);
      res.status(500).json({ error: "Failed to register merchant" });
    }
  });

  app.get("/api/merchant/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.json({ merchant: null });
      }

      res.json({ merchant });
    } catch (error) {
      console.error("Get merchant error:", error);
      res.status(500).json({ error: "Failed to get merchant info" });
    }
  });

  // ============ Merchant Place Claim Routes ============
  app.get("/api/merchant/places/search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { query, district, city } = req.query;
      if (!query || query.length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters" });
      }

      const places = await storage.searchPlacesForClaim(query, district, city);
      res.json({ places });
    } catch (error) {
      console.error("Place search error:", error);
      res.status(500).json({ error: "Failed to search places" });
    }
  });

  app.post("/api/merchant/places/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "You must be a registered merchant to claim places" });
      }

      const { placeName, district, city, country, placeCacheId, googlePlaceId } = req.body;
      if (!placeName || !district || !city || !country) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if place is already claimed - prefer Google Place ID check
      let existingLink = null;
      if (googlePlaceId) {
        existingLink = await storage.getPlaceLinkByGooglePlaceId(googlePlaceId);
      }
      if (!existingLink) {
        existingLink = await storage.getPlaceLinkByPlace(placeName, district, city);
      }
      
      if (existingLink) {
        return res.status(409).json({ error: "This place is already claimed by another merchant" });
      }

      const link = await storage.createMerchantPlaceLink({
        merchantId: merchant.id,
        placeCacheId: placeCacheId || null,
        googlePlaceId: googlePlaceId || null,
        placeName,
        district,
        city,
        country,
        status: 'approved'
      });

      res.json({ success: true, link });
    } catch (error) {
      console.error("Place claim error:", error);
      res.status(500).json({ error: "Failed to claim place" });
    }
  });

  app.get("/api/merchant/places", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant account required" });
      }

      const links = await storage.getMerchantPlaceLinks(merchant.id);
      res.json({ places: links });
    } catch (error) {
      console.error("Get merchant places error:", error);
      res.status(500).json({ error: "Failed to get merchant places" });
    }
  });

  app.put("/api/merchant/places/:linkId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const merchant = await storage.getMerchantByUserId(userId);
      if (!merchant) {
        return res.status(403).json({ error: "Merchant account required" });
      }

      const linkId = parseInt(req.params.linkId);
      const { promoTitle, promoDescription, promoImageUrl, isPromoActive } = req.body;

      const updated = await storage.updateMerchantPlaceLink(linkId, {
        promoTitle,
        promoDescription,
        promoImageUrl,
        isPromoActive
      });

      res.json({ success: true, link: updated });
    } catch (error) {
      console.error("Update merchant place error:", error);
      res.status(500).json({ error: "Failed to update place" });
    }
  });

  // ============ Place Feedback Routes ============
  app.post("/api/feedback/exclude", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { placeName, district, city, placeCacheId } = req.body;
      
      if (!placeName || !district || !city) {
        return res.status(400).json({ 
          error: "Missing required fields: placeName, district, city" 
        });
      }

      const feedback = await storage.incrementPlacePenalty(
        userId,
        placeName,
        district,
        city,
        placeCacheId || undefined
      );

      res.json({
        success: true,
        message: `Place "${placeName}" has been excluded`,
        feedback: {
          id: feedback.id,
          placeName: feedback.placeName,
          penaltyScore: feedback.penaltyScore
        }
      });
    } catch (error) {
      console.error("Feedback exclusion error:", error);
      res.status(500).json({ error: "Failed to exclude place" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

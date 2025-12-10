import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertCollectionSchema, insertMerchantSchema, insertCouponSchema } from "@shared/schema";
import { z } from "zod";

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
      const place = data.results[0];
      return {
        name: place.name,
        formatted_address: place.formatted_address,
        place_id: place.place_id,
        geometry: place.geometry,
        rating: place.rating,
        types: place.types
      };
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

      const skeletonInstructions = skeleton.map((item, idx) => 
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
Do NOT include: ${collectedNames.length > 0 ? collectedNames.join(', ') : 'none'}

【稀有度分配 Rarity】
- SP (5%): Legendary experiences
- SSR (10%): Hidden gems only locals know
- SR (15%): Special places worth visiting
- S (25%): Good quality spots
- R (45%): Nice everyday places

Output language: ${outputLang}
Output ONLY valid JSON, no markdown, no explanation.

{
  "status": "success",
  "meta": {
    "date": "${new Date().toISOString().split('T')[0]}",
    "country": "${country}",
    "city": "${city}",
    "locked_district": "${targetDistrict}",
    "user_level": ${level},
    "total_items": ${skeleton.length}
  },
  "inventory": [
${skeleton.map((item, idx) => `    {
      "id": ${idx + 1},
      "place_name": "REAL place name for ${item.subCategory} in ${targetDistrict}",
      "description": "2-3 sentence description",
      "category": "${categoryMap[item.category] || item.category}",
      "sub_category": "${item.subCategory}",
      "suggested_time": "${item.suggestedTime}",
      "duration": "1-2 hours",
      "time_slot": "${item.timeSlot}",
      "search_query": "place name ${city}",
      "rarity": "R|S|SR|SSR|SP",
      "color_hex": "#6366f1",
      "city": "${city}",
      "country": "${country}",
      "district": "${targetDistrict}",
      "energy_level": "${item.energyLevel}",
      "is_coupon": false,
      "coupon_data": null,
      "operating_status": "OPEN"
    }`).join(',\n')}
  ]
}`;

      const responseText = await callGemini(prompt);

      let jsonText = responseText || '';
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const data = JSON.parse(jsonText);
      
      const districtCenter = await getDistrictBoundary(targetDistrict, city, country);
      
      const verifiedInventory = await Promise.all(
        data.inventory.map(async (item: any, idx: number) => {
          const placeResult = await searchPlaceInDistrict(
            item.place_name,
            targetDistrict,
            city,
            country
          );
          
          let isVerified = false;
          let placeLocation: { lat: number; lng: number } | null = null;
          
          if (placeResult && placeResult.geometry) {
            placeLocation = placeResult.geometry.location;
            if (districtCenter) {
              isVerified = isWithinRadius(districtCenter, placeLocation, 10);
            } else {
              isVerified = true;
            }
          }
          
          return {
            ...item,
            id: Date.now() + idx,
            place_id: placeResult?.place_id || null,
            verified_name: placeResult?.name || item.place_name,
            verified_address: placeResult?.formatted_address || null,
            google_rating: placeResult?.rating || null,
            location: placeLocation,
            is_location_verified: isVerified,
            district_center: districtCenter
          };
        })
      );

      data.inventory = verifiedInventory;
      data.meta.verification_enabled = !!GOOGLE_MAPS_API_KEY;

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

  const httpServer = createServer(app);
  return httpServer;
}

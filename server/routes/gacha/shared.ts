import { storage } from "../../storage";

export const RECUR_API_URL = "https://api.recur.tw/v1";
export const RECUR_PREMIUM_PLAN_ID = "adkwbl9dya0wc6b53parl9yk";
export const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export function isWithinRadius(
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

export const CATEGORY_DATA: Record<string, { subCategories: string[]; weight: number; timeSlots: string[] }> = {
  '食': {
    subCategories: ['在地早餐', '早午餐', '午餐', '晚餐', '宵夜', '咖啡廳', '甜點', '小吃', '火鍋', '燒烤'],
    weight: 3,
    timeSlots: ['breakfast', 'lunch', 'dinner', 'tea_time', 'late_night']
  },
  '宿': {
    subCategories: ['飯店', '民宿', '青年旅館', '露營區', '渡假村', '溫泉旅館', '汽車旅館', '膠囊旅館'],
    weight: 1,
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

export const TIME_SLOT_ORDER = ['breakfast', 'morning', 'lunch', 'afternoon', 'tea_time', 'dinner', 'evening', 'night', 'late_night', 'overnight'];

export interface SkeletonItem {
  order: number;
  category: string;
  subCategory: string;
  timeSlot: string;
  suggestedTime: string;
  energyLevel: 'high' | 'medium' | 'low';
}

export function generateItinerarySkeleton(targetDistrict: string, cardCount: number): {
  targetDistrict: string;
  userRequestCount: number;
  generatedCount: number;
  skeleton: SkeletonItem[];
} {
  const K = Math.min(12, Math.max(5, cardCount));
  
  const lockedDistrict = targetDistrict;
  
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

export async function generatePlaceForSubcategory(
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

  const cachedPlace = await storage.getCachedPlace(
    subcategoryNameZh,
    districtNameZh,
    regionNameZh,
    countryNameZh
  );

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
    source: 'cache',
    isVerified: false
  };
}

export function getLocalizedName(item: any, lang: string): string {
  switch (lang) {
    case 'ja': return item.nameJa || item.nameZh || item.nameEn;
    case 'ko': return item.nameKo || item.nameZh || item.nameEn;
    case 'en': return item.nameEn;
    default: return item.nameZh || item.nameEn;
  }
}

export function getLocalizedDescription(item: any, lang: string): string {
  const i18n = item.i18n || item.descriptionI18n || item.description_i18n;
  const defaultDesc = item.description || '';
  if (!i18n) return defaultDesc;
  switch (lang) {
    case 'ja': return i18n.ja || defaultDesc;
    case 'ko': return i18n.ko || defaultDesc;
    case 'en': return i18n.en || defaultDesc;
    default: return defaultDesc;
  }
}

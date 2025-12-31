/**
 * 時段推斷器 - 根據營業時間或類別推斷地點的最佳時段
 * 用於 V3 扭蛋行程排序
 */

export type TimeSlot = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'flexible';

export interface TimeSlotInfo {
  slot: TimeSlot;
  priority: number;  // 1-6, 1 最早
  label: string;
}

const TIME_SLOT_CONFIG: Record<TimeSlot, TimeSlotInfo> = {
  morning:   { slot: 'morning',   priority: 1, label: '早上 (06:00-11:00)' },
  noon:      { slot: 'noon',      priority: 2, label: '中午 (11:00-14:00)' },
  afternoon: { slot: 'afternoon', priority: 3, label: '下午 (14:00-18:00)' },
  evening:   { slot: 'evening',   priority: 4, label: '晚上 (18:00-22:00)' },
  night:     { slot: 'night',     priority: 5, label: '深夜 (22:00-04:00)' },
  flexible:  { slot: 'flexible',  priority: 3, label: '彈性時段' },
};

const SUBCATEGORY_TIME_SLOTS: Record<string, TimeSlot> = {
  '在地早餐': 'morning',
  '早午餐': 'morning',
  '傳統早點': 'morning',
  '豆漿店': 'morning',
  '早餐店': 'morning',
  
  '宵夜': 'night',
  '深夜食堂': 'night',
  '居酒屋': 'night',
  '酒吧': 'night',
  '燒烤': 'evening',
  '熱炒': 'evening',
  
  '下午茶': 'afternoon',
  '咖啡廳': 'afternoon',
  '甜點': 'afternoon',
  '冰品': 'afternoon',
  '手搖飲': 'afternoon',
  
  'SPA按摩': 'evening',
  '溫泉': 'evening',
  
  '登山步道': 'morning',
  '健行': 'morning',
  '日出': 'morning',
  
  '夜市': 'evening',
  '夜景': 'night',
};

const CATEGORY_DEFAULT_SLOTS: Record<string, TimeSlot> = {
  '美食': 'noon',
  '住宿': 'night',
  '景點': 'flexible',
  '購物': 'afternoon',
  '娛樂設施': 'afternoon',
  '生態文化教育': 'morning',
  '遊程體驗': 'flexible',
};

/**
 * 從營業時間字串解析開始時間（小時）
 * Google Places API 格式: "星期一: 09:00 – 21:00" 或 "Monday: 9:00 AM – 9:00 PM"
 */
function parseOpeningHour(hourString: string): number | null {
  const timePatterns = [
    /(\d{1,2}):(\d{2})/,
    /(\d{1,2})\s*(AM|PM)/i,
  ];
  
  for (const pattern of timePatterns) {
    const match = hourString.match(pattern);
    if (match) {
      let hour = parseInt(match[1]);
      if (match[2] && match[2].toUpperCase() === 'PM' && hour !== 12) {
        hour += 12;
      }
      if (match[2] && match[2].toUpperCase() === 'AM' && hour === 12) {
        hour = 0;
      }
      return hour;
    }
  }
  return null;
}

/**
 * 根據開始營業時間推斷時段
 */
function hourToTimeSlot(hour: number): TimeSlot {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/**
 * 從營業時間 JSONB 推斷最佳時段
 */
function inferFromOpeningHours(openingHours: any): TimeSlot | null {
  if (!openingHours) return null;
  
  try {
    let hoursArray: string[] = [];
    
    if (Array.isArray(openingHours)) {
      hoursArray = openingHours;
    } else if (typeof openingHours === 'object' && openingHours.weekday_text) {
      hoursArray = openingHours.weekday_text;
    } else if (typeof openingHours === 'string') {
      hoursArray = [openingHours];
    }
    
    if (hoursArray.length === 0) return null;
    
    const firstDayHours = hoursArray[0];
    
    if (firstDayHours.includes('24') || firstDayHours.includes('全天')) {
      return 'flexible';
    }
    
    const openHour = parseOpeningHour(firstDayHours);
    if (openHour !== null) {
      return hourToTimeSlot(openHour);
    }
  } catch (e) {
    return null;
  }
  
  return null;
}

/**
 * 主函數：推斷地點的最佳時段
 * 優先級：營業時間 > 子分類 > 類別 > 預設
 */
export function inferTimeSlot(place: {
  category?: string | null;
  subcategory?: string | null;
  openingHours?: any;
}): TimeSlotInfo {
  let slot: TimeSlot = 'flexible';
  
  if (place.openingHours) {
    const inferred = inferFromOpeningHours(place.openingHours);
    if (inferred) {
      slot = inferred;
      return TIME_SLOT_CONFIG[slot];
    }
  }
  
  if (place.subcategory) {
    const subSlot = SUBCATEGORY_TIME_SLOTS[place.subcategory];
    if (subSlot) {
      slot = subSlot;
      return TIME_SLOT_CONFIG[slot];
    }
  }
  
  if (place.category) {
    const catSlot = CATEGORY_DEFAULT_SLOTS[place.category];
    if (catSlot) {
      slot = catSlot;
      return TIME_SLOT_CONFIG[slot];
    }
  }
  
  return TIME_SLOT_CONFIG[slot];
}

/**
 * 根據時段排序地點陣列
 * 住宿強制排最後
 */
export function sortPlacesByTimeSlot<T extends {
  category?: string | null;
  subcategory?: string | null;
  openingHours?: any;
}>(places: T[]): T[] {
  return [...places].sort((a, b) => {
    if (a.category === '住宿' && b.category !== '住宿') return 1;
    if (a.category !== '住宿' && b.category === '住宿') return -1;
    
    const slotA = inferTimeSlot(a);
    const slotB = inferTimeSlot(b);
    
    return slotA.priority - slotB.priority;
  });
}

/**
 * 將地點分組到各時段（用於多天行程規劃）
 */
export function groupPlacesByTimeSlot<T extends {
  category?: string | null;
  subcategory?: string | null;
  openingHours?: any;
}>(places: T[]): Map<TimeSlot, T[]> {
  const groups = new Map<TimeSlot, T[]>();
  
  for (const slot of Object.keys(TIME_SLOT_CONFIG) as TimeSlot[]) {
    groups.set(slot, []);
  }
  
  for (const place of places) {
    if (place.category === '住宿') {
      groups.get('night')!.push(place);
    } else {
      const slotInfo = inferTimeSlot(place);
      groups.get(slotInfo.slot)!.push(place);
    }
  }
  
  return groups;
}

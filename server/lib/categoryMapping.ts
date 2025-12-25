/**
 * Google Places Types → Mibu Category/Subcategory 對照表
 * 用於規則映射，不依賴 AI，100% 成功率
 */

// 八大種類
export const EIGHT_CATEGORIES = ['美食', '住宿', '生態文化教育', '遊程體驗', '娛樂設施', '活動', '景點', '購物'] as const;
export type MibuCategory = typeof EIGHT_CATEGORIES[number];

// Google Type → Category 對照表
export const TYPE_TO_CATEGORY: Record<string, MibuCategory> = {
  // 美食
  'restaurant': '美食',
  'cafe': '美食',
  'bakery': '美食',
  'bar': '美食',
  'food': '美食',
  'meal_delivery': '美食',
  'meal_takeaway': '美食',
  'night_club': '美食',
  'liquor_store': '美食',
  
  // 住宿
  'lodging': '住宿',
  'hotel': '住宿',
  'motel': '住宿',
  'resort_hotel': '住宿',
  'bed_and_breakfast': '住宿',
  'campground': '住宿',
  'rv_park': '住宿',
  'hostel': '住宿',
  'guest_house': '住宿',
  'extended_stay_hotel': '住宿',
  'farm_stay': '住宿',
  
  // 生態文化教育
  'museum': '生態文化教育',
  'art_gallery': '生態文化教育',
  'library': '生態文化教育',
  'university': '生態文化教育',
  'school': '生態文化教育',
  'aquarium': '生態文化教育',
  'zoo': '生態文化教育',
  'botanical_garden': '生態文化教育',
  'planetarium': '生態文化教育',
  'science_museum': '生態文化教育',
  'cultural_center': '生態文化教育',
  'historical_place': '生態文化教育',
  'historical_landmark': '生態文化教育',
  'heritage_museum': '生態文化教育',
  
  // 遊程體驗
  'travel_agency': '遊程體驗',
  'tourist_attraction': '遊程體驗',
  'tour_operator': '遊程體驗',
  'visitor_center': '遊程體驗',
  'farm': '遊程體驗',
  'winery': '遊程體驗',
  'distillery': '遊程體驗',
  'brewery': '遊程體驗',
  
  // 娛樂設施
  'amusement_park': '娛樂設施',
  'bowling_alley': '娛樂設施',
  'movie_theater': '娛樂設施',
  'casino': '娛樂設施',
  'amusement_center': '娛樂設施',
  'video_arcade': '娛樂設施',
  'karaoke': '娛樂設施',
  'escape_room': '娛樂設施',
  'indoor_playground': '娛樂設施',
  'water_park': '娛樂設施',
  'theme_park': '娛樂設施',
  'laser_tag': '娛樂設施',
  'go_kart_track': '娛樂設施',
  'miniature_golf': '娛樂設施',
  
  // 活動
  'spa': '活動',
  'gym': '活動',
  'fitness_center': '活動',
  'yoga_studio': '活動',
  'golf_course': '活動',
  'stadium': '活動',
  'sports_club': '活動',
  'swimming_pool': '活動',
  'ski_resort': '活動',
  'hiking_area': '活動',
  'bicycle_store': '活動',
  'bicycle_rental': '活動',
  'surfing_area': '活動',
  'diving_center': '活動',
  'sports_complex': '活動',
  'tennis_court': '活動',
  'basketball_court': '活動',
  'soccer_field': '活動',
  'horse_riding': '活動',
  'rock_climbing': '活動',
  'rafting': '活動',
  
  // 景點
  'park': '景點',
  'natural_feature': '景點',
  'point_of_interest': '景點',
  'landmark': '景點',
  'place_of_worship': '景點',
  'church': '景點',
  'temple': '景點',
  'mosque': '景點',
  'hindu_temple': '景點',
  'synagogue': '景點',
  'shrine': '景點',
  'cemetery': '景點',
  'city_hall': '景點',
  'courthouse': '景點',
  'embassy': '景點',
  'monument': '景點',
  'observation_deck': '景點',
  'scenic_spot': '景點',
  'beach': '景點',
  'mountain': '景點',
  'waterfall': '景點',
  'hot_spring': '景點',
  'national_park': '景點',
  'state_park': '景點',
  'garden': '景點',
  'plaza': '景點',
  'pier': '景點',
  'marina': '景點',
  'lighthouse': '景點',
  'viewpoint': '景點',
  
  // 購物
  'shopping_mall': '購物',
  'store': '購物',
  'supermarket': '購物',
  'grocery_or_supermarket': '購物',
  'convenience_store': '購物',
  'department_store': '購物',
  'clothing_store': '購物',
  'shoe_store': '購物',
  'jewelry_store': '購物',
  'electronics_store': '購物',
  'furniture_store': '購物',
  'home_goods_store': '購物',
  'book_store': '購物',
  'gift_shop': '購物',
  'florist': '購物',
  'pet_store': '購物',
  'hardware_store': '購物',
  'market': '購物',
  'flea_market': '購物',
  'outlet_store': '購物',
  'souvenir_shop': '購物',
  'art_store': '購物',
  'antique_store': '購物',
};

// Google Type → 中文 Subcategory 對照表
export const TYPE_TO_SUBCATEGORY: Record<string, string> = {
  // 美食
  'restaurant': '餐廳',
  'cafe': '咖啡廳',
  'bakery': '烘焙坊',
  'bar': '酒吧',
  'food': '美食店',
  'meal_delivery': '外送餐廳',
  'meal_takeaway': '外帶餐廳',
  'night_club': '夜店',
  'liquor_store': '酒類專賣',
  
  // 住宿
  'lodging': '旅館',
  'hotel': '飯店',
  'motel': '汽車旅館',
  'resort_hotel': '度假飯店',
  'bed_and_breakfast': '民宿',
  'campground': '露營區',
  'rv_park': '露營車營地',
  'hostel': '青年旅館',
  'guest_house': '招待所',
  'extended_stay_hotel': '長住飯店',
  'farm_stay': '農場住宿',
  
  // 生態文化教育
  'museum': '博物館',
  'art_gallery': '藝廊',
  'library': '圖書館',
  'university': '大學',
  'school': '學校',
  'aquarium': '水族館',
  'zoo': '動物園',
  'botanical_garden': '植物園',
  'planetarium': '天文館',
  'science_museum': '科學博物館',
  'cultural_center': '文化中心',
  'historical_place': '歷史遺址',
  'historical_landmark': '歷史地標',
  'heritage_museum': '文物館',
  
  // 遊程體驗
  'travel_agency': '旅行社',
  'tourist_attraction': '觀光景點',
  'tour_operator': '遊程業者',
  'visitor_center': '遊客中心',
  'farm': '農場',
  'winery': '酒莊',
  'distillery': '蒸餾酒廠',
  'brewery': '啤酒廠',
  
  // 娛樂設施
  'amusement_park': '遊樂園',
  'bowling_alley': '保齡球館',
  'movie_theater': '電影院',
  'casino': '賭場',
  'amusement_center': '遊樂中心',
  'video_arcade': '電玩場',
  'karaoke': 'KTV',
  'escape_room': '密室逃脫',
  'indoor_playground': '室內遊樂場',
  'water_park': '水上樂園',
  'theme_park': '主題樂園',
  'laser_tag': '雷射槍戰',
  'go_kart_track': '卡丁車場',
  'miniature_golf': '迷你高爾夫',
  
  // 活動
  'spa': 'SPA',
  'gym': '健身房',
  'fitness_center': '健身中心',
  'yoga_studio': '瑜伽教室',
  'golf_course': '高爾夫球場',
  'stadium': '體育場',
  'sports_club': '運動俱樂部',
  'swimming_pool': '游泳池',
  'ski_resort': '滑雪場',
  'hiking_area': '健行步道',
  'bicycle_store': '自行車店',
  'bicycle_rental': '自行車租賃',
  'surfing_area': '衝浪區',
  'diving_center': '潛水中心',
  'sports_complex': '運動中心',
  'tennis_court': '網球場',
  'basketball_court': '籃球場',
  'soccer_field': '足球場',
  'horse_riding': '馬術',
  'rock_climbing': '攀岩',
  'rafting': '泛舟',
  
  // 景點
  'park': '公園',
  'natural_feature': '自然景觀',
  'point_of_interest': '景點',
  'landmark': '地標',
  'place_of_worship': '宗教場所',
  'church': '教堂',
  'temple': '寺廟',
  'mosque': '清真寺',
  'hindu_temple': '印度寺廟',
  'synagogue': '猶太教堂',
  'shrine': '神社',
  'cemetery': '墓園',
  'city_hall': '市政廳',
  'courthouse': '法院',
  'embassy': '大使館',
  'monument': '紀念碑',
  'observation_deck': '觀景台',
  'scenic_spot': '風景區',
  'beach': '海灘',
  'mountain': '山岳',
  'waterfall': '瀑布',
  'hot_spring': '溫泉',
  'national_park': '國家公園',
  'state_park': '州立公園',
  'garden': '花園',
  'plaza': '廣場',
  'pier': '碼頭',
  'marina': '遊艇碼頭',
  'lighthouse': '燈塔',
  'viewpoint': '觀景點',
  
  // 購物
  'shopping_mall': '購物中心',
  'store': '商店',
  'supermarket': '超市',
  'grocery_or_supermarket': '超市',
  'convenience_store': '便利商店',
  'department_store': '百貨公司',
  'clothing_store': '服飾店',
  'shoe_store': '鞋店',
  'jewelry_store': '珠寶店',
  'electronics_store': '3C 賣場',
  'furniture_store': '家具店',
  'home_goods_store': '家居用品店',
  'book_store': '書店',
  'gift_shop': '禮品店',
  'florist': '花店',
  'pet_store': '寵物店',
  'hardware_store': '五金行',
  'market': '市場',
  'flea_market': '跳蚤市場',
  'outlet_store': '暢貨中心',
  'souvenir_shop': '紀念品店',
  'souvenir_store': '紀念品店',
  'art_store': '美術用品店',
  'art_supply_store': '美術用品店',
  'stationery_store': '文具店',
  'toy_store': '玩具店',
  'sporting_goods_store': '運動用品店',
  'cosmetics_store': '美妝店',
  'beauty_salon': '美容院',
  'hair_salon': '髮廊',
  'nail_salon': '美甲店',
  'barbershop': '理髮店',
  'antique_store': '古董店',
};

/**
 * 根據 primary_type 和 google_types 判斷 category
 */
export function determineCategory(primaryType: string | null, googleTypes: string[]): MibuCategory {
  // Step 1: 先查 primary_type
  if (primaryType && TYPE_TO_CATEGORY[primaryType]) {
    return TYPE_TO_CATEGORY[primaryType];
  }

  // Step 2: 遍歷 google_types
  for (const type of googleTypes) {
    if (TYPE_TO_CATEGORY[type]) {
      return TYPE_TO_CATEGORY[type];
    }
  }

  // Step 3: 預設為景點
  return '景點';
}

// Category → 預設子分類（當無法映射時使用）
const CATEGORY_DEFAULT_SUBCATEGORY: Record<MibuCategory, string> = {
  '美食': '餐廳',
  '住宿': '旅館',
  '生態文化教育': '教育場所',
  '遊程體驗': '體驗活動',
  '娛樂設施': '娛樂場所',
  '活動': '休閒活動',
  '景點': '觀光景點',
  '購物': '商店',
};

/**
 * 根據 primary_type 和 google_types 判斷 subcategory
 */
export function determineSubcategory(primaryType: string | null, googleTypes: string[]): string {
  // Step 1: 先查 primary_type
  if (primaryType && TYPE_TO_SUBCATEGORY[primaryType]) {
    return TYPE_TO_SUBCATEGORY[primaryType];
  }

  // Step 2: 遍歷 google_types
  for (const type of googleTypes) {
    if (TYPE_TO_SUBCATEGORY[type]) {
      return TYPE_TO_SUBCATEGORY[type];
    }
  }

  // Step 3: 根據 category 返回預設中文子分類
  const category = determineCategory(primaryType, googleTypes);
  return CATEGORY_DEFAULT_SUBCATEGORY[category] || '景點';
}

/**
 * 智能 fallback 模板 - 當 AI 生成描述失敗時使用
 */
export function generateFallbackDescription(
  name: string, 
  category: MibuCategory, 
  subcategory: string, 
  city: string
): string {
  const templates: Record<MibuCategory, string> = {
    '美食': `${city}在地人氣${subcategory}「${name}」，提供道地美味，值得一訪。`,
    '住宿': `位於${city}的${subcategory}「${name}」，提供舒適住宿體驗。`,
    '景點': `${city}必訪景點「${name}」，感受在地自然與人文魅力。`,
    '購物': `${city}特色${subcategory}「${name}」，挖寶好去處。`,
    '娛樂設施': `${city}人氣${subcategory}「${name}」，適合闔家同樂。`,
    '活動': `在${city}體驗「${name}」，創造難忘回憶。`,
    '遊程體驗': `${city}特色體驗「${name}」，深度感受在地文化。`,
    '生態文化教育': `${city}生態教育景點「${name}」，寓教於樂的好選擇。`,
  };
  
  return templates[category] || `歡迎造訪${city}的「${name}」。`;
}

/**
 * 一次性取得 category + subcategory + fallback description
 */
export function classifyPlace(
  name: string,
  city: string,
  primaryType: string | null,
  googleTypes: string[]
): { category: MibuCategory; subcategory: string; fallbackDescription: string } {
  const category = determineCategory(primaryType, googleTypes);
  const subcategory = determineSubcategory(primaryType, googleTypes);
  const fallbackDescription = generateFallbackDescription(name, category, subcategory, city);
  
  return { category, subcategory, fallbackDescription };
}

import { Rarity, Category, LocationData, SubscriptionConfig, PlanTier } from './types';

export const MAX_LEVEL = 12;
export const DEFAULT_LEVEL = 5; 
export const MAX_DAILY_GENERATIONS = 3;

export const RECUR_CONFIG = {
  PUBLISHABLE_KEY: 'pk_live_395cc2a1db55e03a0073d6cf31f4c30bb230124c1b44f2bb5f2b5ee0dd09d46e', 
  PREMIUM_PLAN_ID: 'adkwbl9dya0wc6b53parl9yk' 
};

export const SUBSCRIPTION_PLANS: Record<PlanTier, SubscriptionConfig> = {
  free: {
    id: 'free',
    name: 'Free Starter',
    priceDisplay: '$0 / Month',
    allowedRarities: [Rarity.R],
    maxSlots: 1,
    features: ['發行 R 級優惠券', '同時上架 1 張', '基礎曝光']
  },
  partner: {
    id: 'partner',
    name: 'Partner',
    priceDisplay: '$499 / Month',
    allowedRarities: [Rarity.R, Rarity.S, Rarity.SR],
    maxSlots: 3,
    features: ['解鎖 S/SR 級優惠券', '同時上架 3 張', '每日 1 則跑馬燈']
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceDisplay: '$1,499 / Month',
    allowedRarities: [Rarity.R, Rarity.S, Rarity.SR, Rarity.SSR, Rarity.SP],
    maxSlots: 999,
    recurPlanId: RECUR_CONFIG.PREMIUM_PLAN_ID,
    features: ['解鎖 SSR/SP 大獎', '無限發行額度', '無限跑馬燈', '地圖金框特效']
  }
};

export const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.SP]: '#be185d',
  [Rarity.SSR]: '#b45309',
  [Rarity.SR]: '#7e22ce',
  [Rarity.S]: '#1d4ed8',
  [Rarity.R]: '#334155',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  [Category.Food]: '#ea580c',
  [Category.Stay]: '#0891b2',
  [Category.Education]: '#7c3aed',
  [Category.Entertainment]: '#db2777',
  [Category.Scenery]: '#10b981',
  [Category.Shopping]: '#f59e0b',
  [Category.Activity]: '#84cc16',
};

export const SUB_CATEGORY_TAGS = {
  [Category.Food]: [
    "Michelin/Bib Gourmand (米其林/必比登)", "Hidden Gem Cafe (巷弄咖啡)", "Local Breakfast (在地早餐)", 
    "Traditional Dessert (古早味甜點)", "Late Night Supper/Rechao (宵夜/熱炒)", "Street Food/Snack (銅板美食)",
    "Ramen/Soba (拉麵/蕎麥麵)", "Izakaya/Bar (居酒屋/餐酒館)", "Hot Pot (火鍋)", "Steak/Teppanyaki (牛排/鐵板燒)",
    "Vegetarian (素食/蔬食)", "Seafood Restaurant (海鮮餐廳)", "Theme Restaurant (主題餐廳)"
  ],
  [Category.Stay]: [
    "Design Hotel (設計旅店)", "Hot Spring/Ryokan (溫泉飯店/旅館)", "Luxury Camping/Glamping (豪華露營)", 
    "Historic Homestay (老宅民宿)", "Seaview/Mountain View (海景/山景住宿)", "Backpacker Hostel (青年旅館)", 
    "Business Hotel (商務旅館)", "Luxury 5-Star (五星級飯店)"
  ],
  [Category.Scenery]: [
    "IG Photo Spot (網美打卡點)", "Historical Old Street (懷舊老街)", "Secret Viewpoint (私房景點/秘境)", 
    "Night View (百萬夜景)", "Temple/Shrine (寺廟/神社)", "Waterfront/Pier (水岸/碼頭)", 
    "Seasonal Flower/Nature (賞花/自然生態)", "Architectural Landmark (特色建築)", "Urban Park (城市公園)"
  ],
  [Category.Shopping]: [
    "Select Shop/Boutique (風格選物店)", "Local Souvenir (在地伴手禮)", "Vintage/Second-hand (古著/二手)", 
    "Creative Market (文創市集)", "Drugstore/Cosmetics (藥妝)", "Department Store (百貨公司)", 
    "Outlet Mall (暢貨中心)", "Anime/Gacha Shop (動漫/扭蛋店)", "Traditional Market (傳統市場)"
  ],
  [Category.Education]: [
    "Cultural & Creative Park (文創園區)", "Interactive Museum (互動博物館)", "Art Gallery/Exhibition (美術館/展覽)", 
    "Historical Site/Monument (古蹟遺址)", "Public Library (特色圖書館)", "Science Center (科教館)", 
    "Local Workshop (在地工坊)", "Botanical Garden (植物園)"
  ],
  [Category.Entertainment]: [
    "Claw Machine/Arcade (夾娃娃/遊樂場)", "Karaoke/KTV (KTV/卡拉OK)", "Escape Room (密室逃脫)", 
    "Board Game Cafe (桌遊店)", "Live House/Jazz Bar (音樂展演空間)", "Cinema (電影院)", 
    "Bowling/Batting Cage (保齡球/打擊場)", "Theme Park (主題樂園)"
  ],
  [Category.Activity]: [
    "DIY Workshop (手作體驗-陶藝/金工)", "Massage/Spa/Foot Bath (按摩/足湯)", "Cycling/Biking (自行車/單車)", 
    "Hiking Trail (登山步道)", "Water Sports/SUP (水上活動)", "Farm Experience/Fruit Picking (農場/採果)", 
    "Tea Ceremony/Tasting (品茶/茶道)", "Cooking Class (烹飪教室)", "Kimono/Costume Rental (變裝體驗)"
  ]
};

export const TRANSLATIONS = {
  'zh-TW': {
    dailyLimitReached: '今日額度已達上限',
    dailyLimitReachedDesc: '每日最多生成 3 次行程。請明天再來！',
    paymentSuccess: '付款成功！您已升級為 Premium 商家。'
  },
  'en': {
    dailyLimitReached: 'Daily Limit Reached',
    dailyLimitReachedDesc: 'You can generate up to 3 itineraries per day. Come back tomorrow!',
    paymentSuccess: 'Payment Successful! You are now a Premium Merchant.'
  },
  'ja': {
    dailyLimitReached: '本日の上限に達しました',
    dailyLimitReachedDesc: '1日3回まで生成可能です。また明日お越しください！',
    paymentSuccess: '支払いが完了しました！Premiumプランにアップグレードされました。'
  }
};

export const LOCATION_DATA: LocationData = {
  taiwan: {
    names: { 'zh-TW': '台灣', en: 'Taiwan', ja: '台湾' },
    cities: {
      keelung: { 'zh-TW': '基隆市', en: 'Keelung City', ja: '基隆市' },
      taipei: { 'zh-TW': '台北市', en: 'Taipei City', ja: '台北市' },
      new_taipei: { 'zh-TW': '新北市', en: 'New Taipei City', ja: '新北市' },
      taoyuan: { 'zh-TW': '桃園市', en: 'Taoyuan City', ja: '桃園市' },
      hsinchu_city: { 'zh-TW': '新竹市', en: 'Hsinchu City', ja: '新竹市' },
      hsinchu_county: { 'zh-TW': '新竹縣', en: 'Hsinchu County', ja: '新竹県' },
      miaoli: { 'zh-TW': '苗栗縣', en: 'Miaoli County', ja: '苗栗県' },
      taichung: { 'zh-TW': '台中市', en: 'Taichung City', ja: '台中市' },
      changhua: { 'zh-TW': '彰化縣', en: 'Changhua County', ja: '彰化県' },
      nantou: { 'zh-TW': '南投縣', en: 'Nantou County', ja: '南投県' },
      yunlin: { 'zh-TW': '雲林縣', en: 'Yunlin County', ja: '雲林県' },
      chiayi_city: { 'zh-TW': '嘉義市', en: 'Chiayi City', ja: '嘉義市' },
      chiayi_county: { 'zh-TW': '嘉義縣', en: 'Chiayi County', ja: '嘉義県' },
      tainan: { 'zh-TW': '台南市', en: 'Tainan City', ja: '台南市' },
      kaohsiung: { 'zh-TW': '高雄市', en: 'Kaohsiung City', ja: '高雄市' },
      pingtung: { 'zh-TW': '屏東縣', en: 'Pingtung County', ja: '屏東県' },
      yilan: { 'zh-TW': '宜蘭縣', en: 'Yilan County', ja: '宜蘭県' },
      hualien: { 'zh-TW': '花蓮縣', en: 'Hualien County', ja: '花蓮県' },
      taitung: { 'zh-TW': '台東縣', en: 'Taitung County', ja: '台東県' },
      penghu: { 'zh-TW': '澎湖縣', en: 'Penghu County', ja: '澎湖県' },
      kinmen: { 'zh-TW': '金門縣', en: 'Kinmen County', ja: '金門県' },
      lienchiang: { 'zh-TW': '連江縣 (馬祖)', en: 'Lienchiang County', ja: '連江県' },
    },
  },
  japan: {
    names: { 'zh-TW': '日本', en: 'Japan', ja: '日本' },
    cities: {
      hokkaido: { 'zh-TW': '北海道', en: 'Hokkaido', ja: '北海道' },
      aomori: { 'zh-TW': '青森縣', en: 'Aomori', ja: '青森県' },
      iwate: { 'zh-TW': '岩手縣', en: 'Iwate', ja: '岩手県' },
      miyagi: { 'zh-TW': '宮城縣', en: 'Miyagi', ja: '宮城県' },
      akita: { 'zh-TW': '秋田縣', en: 'Akita', ja: '秋田県' },
      yamagata: { 'zh-TW': '山形縣', en: 'Yamagata', ja: '山形県' },
      fukushima: { 'zh-TW': '福島縣', en: 'Fukushima', ja: '福島県' },
      ibaraki: { 'zh-TW': '茨城縣', en: 'Ibaraki', ja: '茨城県' },
      tochigi: { 'zh-TW': '櫪木縣', en: 'Tochigi', ja: '栃木県' },
      gunma: { 'zh-TW': '群馬縣', en: 'Gunma', ja: '群馬県' },
      saitama: { 'zh-TW': '埼玉縣', en: 'Saitama', ja: '埼玉県' },
      chiba: { 'zh-TW': '千葉縣', en: 'Chiba', ja: '千葉県' },
      tokyo: { 'zh-TW': '東京都', en: 'Tokyo', ja: '東京都' },
      kanagawa: { 'zh-TW': '神奈川縣', en: 'Kanagawa', ja: '神奈川県' },
      niigata: { 'zh-TW': '新潟縣', en: 'Niigata', ja: '新潟県' },
      toyama: { 'zh-TW': '富山縣', en: 'Toyama', ja: '富山県' },
      ishikawa: { 'zh-TW': '石川縣', en: 'Ishikawa', ja: '石川県' },
      fukui: { 'zh-TW': '福井縣', en: 'Fukui', ja: '福井県' },
      yamanashi: { 'zh-TW': '山梨縣', en: 'Yamanashi', ja: '山梨県' },
      nagano: { 'zh-TW': '長野縣', en: 'Nagano', ja: '長野県' },
      gifu: { 'zh-TW': '岐阜縣', en: 'Gifu', ja: '岐阜県' },
      shizuoka: { 'zh-TW': '靜岡縣', en: 'Shizuoka', ja: '静岡県' },
      aichi: { 'zh-TW': '愛知縣', en: 'Aichi', ja: '愛知県' },
      mie: { 'zh-TW': '三重縣', en: 'Mie', ja: '三重県' },
      shiga: { 'zh-TW': '滋賀縣', en: 'Shiga', ja: '滋賀県' },
      kyoto: { 'zh-TW': '京都府', en: 'Kyoto', ja: '京都府' },
      osaka: { 'zh-TW': '大阪府', en: 'Osaka', ja: '大阪府' },
      hyogo: { 'zh-TW': '兵庫縣', en: 'Hyogo', ja: '兵庫県' },
      nara: { 'zh-TW': '奈良縣', en: 'Nara', ja: '奈良県' },
      wakayama: { 'zh-TW': '和歌山縣', en: 'Wakayama', ja: '和歌山県' },
      tottori: { 'zh-TW': '鳥取縣', en: 'Tottori', ja: '鳥取県' },
      shimane: { 'zh-TW': '島根縣', en: 'Shimane', ja: '島根県' },
      okayama: { 'zh-TW': '岡山縣', en: 'Okayama', ja: '岡山県' },
      hiroshima: { 'zh-TW': '廣島縣', en: 'Hiroshima', ja: '広島県' },
      yamaguchi: { 'zh-TW': '山口縣', en: 'Yamaguchi', ja: '山口県' },
      tokushima: { 'zh-TW': '德島縣', en: 'Tokushima', ja: '徳島県' },
      kagawa: { 'zh-TW': '香川縣', en: 'Kagawa', ja: '香川県' },
      ehime: { 'zh-TW': '愛媛縣', en: 'Ehime', ja: '愛媛県' },
      kochi: { 'zh-TW': '高知縣', en: 'Kochi', ja: '高知県' },
      fukuoka: { 'zh-TW': '福岡縣', en: 'Fukuoka', ja: '福岡県' },
      saga: { 'zh-TW': '佐賀縣', en: 'Saga', ja: '佐賀県' },
      nagasaki: { 'zh-TW': '長崎縣', en: 'Nagasaki', ja: '長崎県' },
      kumamoto: { 'zh-TW': '熊本縣', en: 'Kumamoto', ja: '熊本県' },
      oita: { 'zh-TW': '大分縣', en: 'Oita', ja: '大分県' },
      miyazaki: { 'zh-TW': '宮崎縣', en: 'Miyazaki', ja: '宮崎県' },
      kagoshima: { 'zh-TW': '鹿兒島縣', en: 'Kagoshima', ja: '鹿児島県' },
      okinawa: { 'zh-TW': '沖繩縣', en: 'Okinawa', ja: '沖縄県' },
    },
  },
  hong_kong: {
      names: {'zh-TW': '香港', en: 'Hong Kong', ja: '香港'},
      cities: {
          hong_kong: {'zh-TW': '香港', en: 'Hong Kong', ja: '香港'}
      }
  }
};

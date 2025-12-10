import { GachaResponse, GachaItem, Category, Rarity, Language } from "../types";

type MultiLang = Record<Language, string>;

const MOCK_PLACES: Record<Category, { name: MultiLang }[]> = {
  [Category.Food]: [
    { name: { 'zh-TW': '鼎泰豐', en: 'Din Tai Fung', ja: '鼎泰豊', ko: '딘타이펑' } },
    { name: { 'zh-TW': '上引水產', en: 'Addiction Aquatic Development', ja: '上引水産', ko: '상인수산' } },
    { name: { 'zh-TW': '阜杭豆漿', en: 'Fu Hang Dou Jiang', ja: '阜杭豆漿', ko: '부항두장' } },
    { name: { 'zh-TW': '饒河夜市', en: 'Raohe Night Market', ja: '饒河夜市', ko: '라오허 야시장' } },
    { name: { 'zh-TW': '一蘭拉麵', en: 'Ichiran Ramen', ja: '一蘭ラーメン', ko: '이치란 라멘' } },
    { name: { 'zh-TW': '阿宗麵線', en: 'Ay-Chung Flour-Rice Noodle', ja: '阿宗麺線', ko: '아종 면선' } },
    { name: { 'zh-TW': '微熱山丘', en: 'SunnyHills', ja: 'サニーヒルズ', ko: '써니힐즈' } },
    { name: { 'zh-TW': '冰怪', en: 'Ice Monster', ja: 'アイスモンスター', ko: '아이스 몬스터' } },
  ],
  [Category.Stay]: [
    { name: { 'zh-TW': '君悅酒店', en: 'Grand Hyatt', ja: 'グランドハイアット', ko: '그랜드 하얏트' } },
    { name: { 'zh-TW': 'W飯店', en: 'W Hotel', ja: 'Wホテル', ko: 'W호텔' } },
    { name: { 'zh-TW': '文華東方', en: 'Mandarin Oriental', ja: 'マンダリンオリエンタル', ko: '만다린 오리엔탈' } },
    { name: { 'zh-TW': '晶華酒店', en: 'Regent Taipei', ja: 'リージェント台北', ko: '리젠트 타이베이' } },
    { name: { 'zh-TW': '星辰旅館', en: 'Star Hostel', ja: 'スターホステル', ko: '스타 호스텔' } },
    { name: { 'zh-TW': '美寓旅店', en: 'Meander Hostel', ja: 'ミアンダーホステル', ko: '미앤더 호스텔' } },
  ],
  [Category.Scenery]: [
    { name: { 'zh-TW': '台北101觀景台', en: 'Taipei 101 Observatory', ja: '台北101展望台', ko: '타이베이101 전망대' } },
    { name: { 'zh-TW': '象山步道', en: 'Elephant Mountain', ja: '象山', ko: '샹산' } },
    { name: { 'zh-TW': '中正紀念堂', en: 'Chiang Kai-shek Memorial Hall', ja: '中正紀念堂', ko: '중정기념당' } },
    { name: { 'zh-TW': '龍山寺', en: 'Longshan Temple', ja: '龍山寺', ko: '룽산사' } },
    { name: { 'zh-TW': '北投溫泉', en: 'Beitou Hot Spring', ja: '北投温泉', ko: '베이터우 온천' } },
    { name: { 'zh-TW': '淡水漁人碼頭', en: 'Tamsui Fisherman\'s Wharf', ja: '淡水フィッシャーマンズワーフ', ko: '단수이 어인부두' } },
    { name: { 'zh-TW': '貓空纜車', en: 'Maokong Gondola', ja: '猫空ロープウェイ', ko: '마오콩 곤돌라' } },
  ],
  [Category.Shopping]: [
    { name: { 'zh-TW': '西門町商圈', en: 'Ximending Shopping District', ja: '西門町', ko: '시먼딩' } },
    { name: { 'zh-TW': '台北101購物中心', en: 'Taipei 101 Mall', ja: '台北101モール', ko: '타이베이101 몰' } },
    { name: { 'zh-TW': '誠品書店', en: 'Eslite Bookstore', ja: '誠品書店', ko: '청핀서점' } },
    { name: { 'zh-TW': '唐吉軻德', en: 'Don Don Donki', ja: 'ドンキホーテ', ko: '돈키호테' } },
    { name: { 'zh-TW': '三創生活園區', en: 'Syntrend Creative Park', ja: 'シントレンド', ko: '씬트렌드' } },
  ],
  [Category.Entertainment]: [
    { name: { 'zh-TW': '好樂迪KTV', en: 'Party World KTV', ja: 'パーティワールドKTV', ko: '파티월드 KTV' } },
    { name: { 'zh-TW': '威秀影城', en: 'Vieshow Cinemas', ja: 'ヴィーショーシネマズ', ko: '비쇼 시네마' } },
    { name: { 'zh-TW': '密室逃脫', en: 'Escape Logic', ja: '脱出ゲーム', ko: '방탈출' } },
    { name: { 'zh-TW': '台北動物園', en: 'Taipei Zoo', ja: '台北動物園', ko: '타이베이 동물원' } },
    { name: { 'zh-TW': '美麗華摩天輪', en: 'Miramar Ferris Wheel', ja: '美麗華観覧車', ko: '미라마 관람차' } },
  ],
  [Category.Education]: [
    { name: { 'zh-TW': '故宮博物院', en: 'National Palace Museum', ja: '故宮博物院', ko: '고궁박물관' } },
    { name: { 'zh-TW': '台北市立美術館', en: 'Taipei Fine Arts Museum', ja: '台北市立美術館', ko: '타이베이 시립미술관' } },
    { name: { 'zh-TW': '華山1914文創園區', en: 'Huashan 1914 Creative Park', ja: '華山1914文創園区', ko: '화산1914 문창단지' } },
    { name: { 'zh-TW': '松山文創園區', en: 'Songshan Cultural Park', ja: '松山文創園区', ko: '송산 문창단지' } },
  ],
  [Category.Activity]: [
    { name: { 'zh-TW': 'YouBike河濱騎行', en: 'YouBike River Cycling', ja: 'YouBike川沿いサイクリング', ko: 'YouBike 강변 자전거' } },
    { name: { 'zh-TW': '腳底按摩', en: 'Foot Massage', ja: '足つぼマッサージ', ko: '발 마사지' } },
    { name: { 'zh-TW': '茶道體驗', en: 'Tea Ceremony', ja: '茶道体験', ko: '다도 체험' } },
    { name: { 'zh-TW': '鳳梨酥DIY', en: 'Pineapple Cake DIY', ja: 'パイナップルケーキDIY', ko: '펑리수 만들기' } },
  ]
};

const DISTRICTS: Record<Language, string[]> = {
  'zh-TW': ['信義區', '大安區', '中山區', '萬華區'],
  en: ['Xinyi District', 'Da\'an District', 'Zhongshan District', 'Wanhua District'],
  ja: ['信義区', '大安区', '中山区', '萬華区'],
  ko: ['신이구', '다안구', '중산구', '완화구'],
};

const DESCRIPTIONS: Record<Language, (category: string, district: string, level: number) => string> = {
  'zh-TW': (cat, dist, lvl) => `位於${dist}的絕佳${getCategoryName(cat, 'zh-TW')}景點，適合 Lv.${lvl} 的旅人探索。`,
  en: (cat, dist, lvl) => `A wonderful ${cat} spot located in ${dist}. Great for level ${lvl} travelers.`,
  ja: (cat, dist, lvl) => `${dist}にある素晴らしい${getCategoryName(cat, 'ja')}スポット。レベル${lvl}の旅行者におすすめ。`,
  ko: (cat, dist, lvl) => `${dist}에 위치한 훌륭한 ${getCategoryName(cat, 'ko')} 장소. 레벨 ${lvl} 여행자에게 적합합니다.`,
};

const CATEGORY_NAMES: Record<Category, Record<Language, string>> = {
  [Category.Food]: { 'zh-TW': '美食', en: 'Food', ja: '料理', ko: '음식' },
  [Category.Stay]: { 'zh-TW': '住宿', en: 'Stay', ja: '宿泊', ko: '숙박' },
  [Category.Scenery]: { 'zh-TW': '景點', en: 'Scenery', ja: '観光地', ko: '경치' },
  [Category.Shopping]: { 'zh-TW': '購物', en: 'Shopping', ja: 'ショッピング', ko: '쇼핑' },
  [Category.Entertainment]: { 'zh-TW': '娛樂', en: 'Entertainment', ja: 'エンタメ', ko: '엔터테인먼트' },
  [Category.Education]: { 'zh-TW': '文化', en: 'Education', ja: '文化', ko: '문화' },
  [Category.Activity]: { 'zh-TW': '體驗', en: 'Activity', ja: 'アクティビティ', ko: '체험' },
};

const COUPON_DATA: Record<Language, { title: string; terms: string }> = {
  'zh-TW': { title: '免費飲料', terms: '僅限當日使用' },
  en: { title: 'Free Drink', terms: 'Valid today only' },
  ja: { title: 'ドリンク無料', terms: '本日限り有効' },
  ko: { title: '무료 음료', terms: '당일만 유효' },
};

const getCategoryName = (cat: string, lang: Language): string => {
  return CATEGORY_NAMES[cat as Category]?.[lang] || cat;
};

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const generateGachaItinerary = async (
  country: string,
  city: string,
  level: number,
  language: string,
  collectedNames: string[]
): Promise<{ data: GachaResponse; sources: any[] }> => {
  const lang = language as Language;
  
  await new Promise(resolve => setTimeout(resolve, 2500));

  const items: GachaItem[] = [];
  const itemCount = Math.min(8, Math.max(3, Math.floor(level / 1.5)));
  
  const districtIndex = Math.floor(Math.random() * DISTRICTS[lang].length);
  const lockedDistrict: MultiLang = {
    'zh-TW': DISTRICTS['zh-TW'][districtIndex],
    en: DISTRICTS.en[districtIndex],
    ja: DISTRICTS.ja[districtIndex],
    ko: DISTRICTS.ko[districtIndex],
  };

  for (let i = 0; i < itemCount; i++) {
    const categoryKey = getRandomItem(Object.keys(MOCK_PLACES)) as Category;
    const place = getRandomItem(MOCK_PLACES[categoryKey]);
    
    const rand = Math.random();
    let rarity = Rarity.R;
    if (rand > 0.95) rarity = Rarity.SP;
    else if (rand > 0.85) rarity = Rarity.SSR;
    else if (rand > 0.70) rarity = Rarity.SR;
    else if (rand > 0.50) rarity = Rarity.S;

    const placeName: MultiLang = {
      'zh-TW': `${place.name['zh-TW']} (${lockedDistrict['zh-TW']})`,
      en: `${place.name.en} (${lockedDistrict.en})`,
      ja: `${place.name.ja} (${lockedDistrict.ja})`,
      ko: `${place.name.ko} (${lockedDistrict.ko})`,
    };

    const description: MultiLang = {
      'zh-TW': DESCRIPTIONS['zh-TW'](categoryKey, lockedDistrict['zh-TW'], level),
      en: DESCRIPTIONS.en(categoryKey, lockedDistrict.en, level),
      ja: DESCRIPTIONS.ja(categoryKey, lockedDistrict.ja, level),
      ko: DESCRIPTIONS.ko(categoryKey, lockedDistrict.ko, level),
    };

    const hasCoupon = Math.random() > 0.7;
    const couponData = hasCoupon ? {
      title: COUPON_DATA[lang].title,
      code: "FREE-123",
      terms: COUPON_DATA[lang].terms
    } : null;

    items.push({
      id: Date.now() + i,
      place_name: placeName,
      description: description,
      category: categoryKey,
      suggested_time: `${10 + i}:00`,
      duration: "1.5 hours",
      search_query: `${place.name.en} ${city}`,
      rarity: rarity,
      color_hex: "#6366f1",
      city: city,
      country: country,
      is_coupon: Math.random() > 0.7,
      coupon_data: couponData,
      operating_status: "OPEN"
    });
  }

  return {
    data: {
      status: "success",
      meta: {
        date: new Date().toISOString().split('T')[0],
        country,
        city,
        locked_district: lockedDistrict,
        user_level: level
      },
      inventory: items
    },
    sources: []
  };
};

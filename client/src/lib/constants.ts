export const COUNTRIES = [
  { id: "TW", name: "台灣", emoji: "🇹🇼" },
  { id: "JP", name: "日本", emoji: "🇯🇵" },
  { id: "HK", name: "香港", emoji: "🇭🇰" },
] as const;

export const CITIES: Record<string, { id: string; name: string }[]> = {
  TW: [
    { id: "TPE", name: "台北" },
    { id: "KHH", name: "高雄" },
    { id: "TNN", name: "台南" },
    { id: "TCG", name: "台中" },
  ],
  JP: [
    { id: "TYO", name: "東京" },
    { id: "OSA", name: "大阪" },
    { id: "KYO", name: "京都" },
    { id: "FUK", name: "福岡" },
  ],
  HK: [
    { id: "HKG", name: "香港" },
  ],
};

// Sub-districts for "locking" algorithm (Mock Data)
export const SUB_DISTRICTS: Record<string, string[]> = {
  TPE: ["信義區", "大安區", "中山區", "萬華區", "松山區"],
  KHH: ["左營區", "前金區", "鹽埕區", "鼓山區"],
  TNN: ["中西區", "安平區", "東區"],
  TCG: ["西區", "北區", "南屯區"],
  TYO: ["Shinjuku", "Shibuya", "Ginza", "Asakusa", "Akihabara"],
  OSA: ["Umeda", "Namba", "Shinsaibashi"],
  KYO: ["Gion", "Arashiyama", "Fushimi"],
  FUK: ["Hakata", "Tenjin"],
  HKG: ["Central", "Tsim Sha Tsui", "Mong Kok", "Causeway Bay"],
};

export const INTENSITY_LEVELS = [
  { level: 5, label: "休閒 (Chill)", description: "輕鬆慢活，適合放空" },
  { level: 8, label: "標準 (Standard)", description: "充實但不累，經典行程" },
  { level: 12, label: "特種兵 (Hardcore)", description: "極限踩點，絕不浪費一秒" },
];

export const CATEGORIES = {
  FOOD: { id: "food", label: "美食", icon: "Utensils" },
  STAY: { id: "stay", label: "住宿", icon: "Bed" },
  SCENERY: { id: "scenery", label: "景點", icon: "Mountain" },
  SHOPPING: { id: "shopping", label: "購物", icon: "ShoppingBag" },
  ENTERTAINMENT: { id: "entertainment", label: "娛樂", icon: "Ticket" },
} as const;

export const RARITY_COLORS = {
  N: "bg-gray-100 text-gray-600 border-gray-200",
  R: "bg-blue-50 text-blue-600 border-blue-200",
  SR: "bg-purple-50 text-purple-600 border-purple-200",
  SSR: "bg-amber-50 text-amber-600 border-amber-200",
  SP: "bg-rose-50 text-rose-600 border-rose-200 bg-[url('/sparkle.png')]",
};

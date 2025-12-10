import { GachaResponse, GachaItem, Category, Rarity } from "../types";

// Mock Data for Generator
const MOCK_PLACES = {
  [Category.Food]: [
    "Din Tai Fung", "Addiction Aquatic Development", "Fu Hang Dou Jiang", "Raohe Night Market", 
    "Ichiran Ramen", "Ay-Chung Flour-Rice Noodle", "SunnyHills", "Ice Monster"
  ],
  [Category.Stay]: [
    "Grand Hyatt", "W Hotel", "Mandarin Oriental", "Regent Taipei", "Star Hostel", "Meander Hostel"
  ],
  [Category.Scenery]: [
    "Taipei 101 Observatory", "Elephant Mountain", "Chiang Kai-shek Memorial Hall", "Longshan Temple", 
    "Beitou Hot Spring", "Tamsui Fisherman's Wharf", "Maokong Gondola"
  ],
  [Category.Shopping]: [
    "Ximending Shopping District", "Taipei 101 Mall", "Eslite Bookstore", "Don Don Donki", "Syntrend Creative Park"
  ],
  [Category.Entertainment]: [
    "Party World KTV", "Vieshow Cinemas", "Escape Logic", "Taipei Zoo", "Miramar Ferris Wheel"
  ],
  [Category.Education]: [
    "National Palace Museum", "Taipei Fine Arts Museum", "Huashan 1914 Creative Park", "Songshan Cultural Park"
  ],
  [Category.Activity]: [
    "YouBike River Cycling", "Foot Massage", "Tea Ceremony", "Pineapple Cake DIY"
  ]
};

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const generateGachaItinerary = async (
  country: string,
  city: string,
  level: number,
  language: string,
  collectedNames: string[]
): Promise<{ data: GachaResponse; sources: any[] }> => {
  
  // Simulate API Delay
  await new Promise(resolve => setTimeout(resolve, 2500));

  const items: GachaItem[] = [];
  const itemCount = Math.min(8, Math.max(3, Math.floor(level / 1.5)));
  
  const districts = ["Xinyi District", "Da'an District", "Zhongshan District", "Wanhua District"];
  const lockedDistrict = getRandomItem(districts);

  for (let i = 0; i < itemCount; i++) {
    const categoryKey = getRandomItem(Object.keys(MOCK_PLACES)) as Category;
    const placeNameBase = getRandomItem(MOCK_PLACES[categoryKey]);
    
    // Simple Rarity Logic
    const rand = Math.random();
    let rarity = Rarity.R;
    if (rand > 0.95) rarity = Rarity.SP;
    else if (rand > 0.85) rarity = Rarity.SSR;
    else if (rand > 0.70) rarity = Rarity.SR;
    else if (rand > 0.50) rarity = Rarity.S;

    items.push({
      id: Date.now() + i,
      place_name: `${placeNameBase} (${lockedDistrict})`,
      description: `A wonderful ${categoryKey} spot located in ${lockedDistrict}. Great for level ${level} travelers.`,
      category: categoryKey,
      suggested_time: `${10 + i}:00`,
      duration: "1.5 hours",
      search_query: `${placeNameBase} ${city}`,
      rarity: rarity,
      color_hex: "#6366f1",
      city: city,
      country: country,
      is_coupon: Math.random() > 0.7,
      coupon_data: Math.random() > 0.7 ? {
        title: "Free Drink",
        code: "FREE-123",
        terms: "Valid today only"
      } : null,
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

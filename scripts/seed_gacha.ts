import { db } from "../server/db";
import { places, type InsertPlace } from "../shared/schema";
import { eq, and } from "drizzle-orm";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

const TAIWAN_CITIES: Record<string, string[]> = {
  '台北市': ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
  '新北市': ['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '土城區', '蘆洲區', '汐止區', '樹林區', '淡水區', '林口區'],
  '桃園市': ['桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '龜山區', '龍潭區', '大溪區'],
  '台中市': ['中區', '東區', '南區', '西區', '北區', '北屯區', '西屯區', '南屯區', '豐原區', '大里區', '太平區', '烏日區'],
  '台南市': ['中西區', '東區', '南區', '北區', '安平區', '安南區', '永康區', '歸仁區', '新化區', '新營區'],
  '高雄市': ['鹽埕區', '鼓山區', '左營區', '楠梓區', '三民區', '新興區', '前金區', '苓雅區', '前鎮區', '小港區', '鳳山區'],
};

const CATEGORY_CODES = ['FOOD', 'STAY', 'ECO', 'EXP', 'FUN', 'EVENT', 'SPOT', 'SHOP'];

const CATEGORY_PROMPTS: Record<string, string> = {
  FOOD: '熱門餐廳、小吃店、咖啡廳',
  STAY: '特色民宿、精品旅館',
  ECO: '生態園區、文化古蹟、教育場館',
  EXP: '體驗工坊、遊程活動',
  FUN: '遊樂園、娛樂設施',
  EVENT: '定期活動、展覽',
  SPOT: '知名景點、自然風景',
  SHOP: '特色商店、伴手禮店',
};

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY) {
    throw new Error("Gemini API not configured");
  }

  const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function verifyPlaceWithGoogle(placeName: string, district: string, city: string): Promise<{
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  lat: number;
  lng: number;
  photoReference: string | null;
} | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not configured");
    return null;
  }

  try {
    const searchQuery = encodeURIComponent(`${placeName} ${district} ${city}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const place = data.results[0];
      return {
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating || null,
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
        photoReference: place.photos?.[0]?.photo_reference || null,
      };
    }
    return null;
  } catch (error) {
    console.error("Google Places API error:", error);
    return null;
  }
}

async function generatePlacesForDistrict(city: string, district: string, category: string): Promise<string[]> {
  const categoryDesc = CATEGORY_PROMPTS[category] || '熱門地點';
  
  const prompt = `請列出台灣${city}${district}最熱門的${categoryDesc}，每個地點只需列出店名或景點名稱。
回覆格式：每行一個地點名稱，不要編號，不要其他說明。
請列出 3-5 個地點。`;

  try {
    const response = await callGemini(prompt);
    const places = response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.length < 50 && !line.includes('：') && !line.includes(':'));
    
    return places.slice(0, 5);
  } catch (error) {
    console.error(`Failed to generate places for ${city} ${district} ${category}:`, error);
    return [];
  }
}

async function seedGachaPlaces(limitCities?: number, limitDistricts?: number) {
  console.log('🎰 Starting Gacha Places Seed...\n');
  
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  const cities = Object.keys(TAIWAN_CITIES).slice(0, limitCities || Object.keys(TAIWAN_CITIES).length);

  for (const city of cities) {
    const districts = TAIWAN_CITIES[city].slice(0, limitDistricts || TAIWAN_CITIES[city].length);
    
    for (const district of districts) {
      console.log(`\n📍 Processing ${city} ${district}...`);
      
      for (const category of CATEGORY_CODES) {
        console.log(`  📂 Category: ${category}`);
        
        const placeNames = await generatePlacesForDistrict(city, district, category);
        
        for (const placeName of placeNames) {
          const existing = await db.select().from(places).where(
            and(
              eq(places.placeName, placeName),
              eq(places.district, district),
              eq(places.city, city)
            )
          ).limit(1);

          if (existing.length > 0) {
            console.log(`    ⏭️  Skipped: ${placeName} (already exists)`);
            totalSkipped++;
            continue;
          }

          const verified = await verifyPlaceWithGoogle(placeName, district, city);
          
          if (verified) {
            const placeData: InsertPlace = {
              placeName: verified.name,
              country: '台灣',
              city: city,
              district: district,
              address: verified.address,
              locationLat: verified.lat,
              locationLng: verified.lng,
              googlePlaceId: verified.placeId,
              rating: verified.rating,
              photoReference: verified.photoReference,
              category: category,
              description: `${city}${district}熱門${CATEGORY_PROMPTS[category]}`,
            };

            try {
              await db.insert(places).values(placeData).onConflictDoNothing();
              console.log(`    ✅ Inserted: ${verified.name} (⭐${verified.rating || 'N/A'})`);
              totalInserted++;
            } catch (error) {
              console.error(`    ❌ Failed to insert ${placeName}:`, error);
              totalFailed++;
            }
          } else {
            console.log(`    ⚠️  Not verified: ${placeName}`);
            totalFailed++;
          }

          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
  }

  console.log('\n========================================');
  console.log('🎰 Gacha Seed Complete!');
  console.log(`✅ Inserted: ${totalInserted}`);
  console.log(`⏭️  Skipped: ${totalSkipped}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log('========================================\n');
}

const args = process.argv.slice(2);
const limitCities = args.includes('--quick') ? 1 : undefined;
const limitDistricts = args.includes('--quick') ? 2 : undefined;

seedGachaPlaces(limitCities, limitDistricts)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const EXCLUDED_BUSINESS_STATUS = ['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'];
const EXCLUDED_PLACE_TYPES = [
  'travel_agency', 'insurance_agency', 'real_estate_agency', 'lawyer', 'accounting', 
  'bank', 'library', 'local_government_office', 'city_hall', 'courthouse', 'post_office',
  'police', 'fire_station', 'hospital', 'doctor', 'dentist', 'pharmacy', 'veterinary_care',
  'school', 'primary_school', 'secondary_school', 'university', 'car_dealer', 'car_rental',
  'car_repair', 'car_wash', 'gas_station', 'parking', 'transit_station', 'bus_station',
  'train_station', 'subway_station', 'taxi_stand', 'atm', 'funeral_home', 'cemetery',
  'church', 'mosque', 'synagogue', 'hindu_temple', 'place_of_worship'
];
const GENERIC_NAME_PATTERNS = [
  '探索', '旅行社', '旅行', 'Travel', 'Explore', 'Tour',
  '農會', '公所', '區公所', '鄉公所', '鎮公所', '市公所', '縣政府', '市政府', '衛生所', '戶政事務所',
  '警察局', '派出所', '消防隊', '消防局', '郵局', '稅務局', '地政事務所',
  '診所', '牙醫', '醫院', '藥局', '獸醫', '銀行', '加油站', '停車場', '汽車', '機車行',
  '葬儀', '殯儀館', '靈骨塔', '納骨塔',
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

export async function callGemini(prompt: string): Promise<string> {
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

export async function generatePlaceWithAI(
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

export async function verifyPlaceWithGoogle(
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
    const searchText = encodeURIComponent(`${placeName} ${districtNameZh} ${regionNameZh}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchText}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const genericPlaceholderPatterns = ['探索', '旅行社', '服務中心', '遊客中心', '資訊站'];
      const validResults = data.results.slice(0, 10).filter((place: any) => {
        const address = place.formatted_address || '';
        const name = place.name || '';
        
        if (!isPlaceValid(place)) {
          return false;
        }
        
        const isInDistrict = address.includes(regionNameZh) && address.includes(districtNameZh);
        const isGenericPlaceholder = genericPlaceholderPatterns.some(pattern => name.includes(pattern));
        
        return isInDistrict && !isGenericPlaceholder;
      });
      
      if (validResults.length === 0) {
        return { verified: false };
      }
      
      const randomIndex = Math.floor(Math.random() * validResults.length);
      const place = validResults[randomIndex];
      const address = place.formatted_address || '';
      
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

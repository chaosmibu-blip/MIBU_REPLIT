const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

export const CATEGORY_PROMPTS: Record<string, string> = {
  '美食': `你是專業美食評論家，請為以下餐廳/小吃店撰寫吸引人的描述。著重：招牌特色、用餐氛圍、適合場合（約會/家庭/朋友聚餐/獨食）。風格：親切、讓人想去嚐鮮。字數：30-50字。`,
  '住宿': `你是旅宿評論專家，請為以下住宿撰寫吸引人的描述。著重：住宿特色、周邊便利性、適合旅客類型（情侶/家庭/背包客/商務）。風格：溫馨、讓人想預訂。字數：30-50字。`,
  '生態文化教育': `你是文化導覽員，請為以下文化/教育場所撰寫描述。著重：歷史背景、特色展覽、適合對象（親子/學生/文青）。風格：知性、引發好奇心。字數：30-50字。`,
  '遊程體驗': `你是體驗活動策劃師，請為以下體驗活動撰寫描述。著重：活動特色、適合對象、預期收穫。風格：活潑、讓人躍躍欲試。字數：30-50字。`,
  '娛樂設施': `你是娛樂達人，請為以下娛樂場所撰寫描述。著重：娛樂特色、適合對象（朋友/情侶/家庭）、推薦時段。風格：歡樂、讓人想放鬆玩樂。字數：30-50字。`,
  '活動': `你是活動企劃，請為以下活動/展演撰寫描述。著重：活動亮點、氛圍、適合參加者。風格：熱情、讓人想參與。字數：30-50字。`,
  '景點': `你是旅遊作家，請為以下景點撰寫吸引人的描述。著重：最佳觀賞時間、特色亮點、拍照打卡點。風格：詩意、讓人嚮往。字數：30-50字。`,
  '購物': `你是購物達人，請為以下購物地點撰寫描述。著重：商品特色、必買推薦、逛街氛圍。風格：實用、讓人想血拼。字數：30-50字。`,
};

export interface PlaceForDescription {
  id: number;
  placeName: string;
  address?: string | null;
  rating?: number | string | null;
  city: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function generateDescriptionsWithRetry(
  places: PlaceForDescription[],
  category: string,
  maxRetries: number = 2
): Promise<Map<number, string>> {
  const prompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS['景點'];
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callGeminiForDescriptions(places, prompt);
      if (result.size > 0) return result;
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`   重試 ${attempt + 1}/${maxRetries}，等待 ${delay}ms...`);
        await sleep(delay);
      }
    } catch (e: any) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`   錯誤: ${e.message}，重試 ${attempt + 1}/${maxRetries}...`);
        await sleep(delay);
      }
    }
  }
  
  return new Map();
}

async function callGeminiForDescriptions(
  places: PlaceForDescription[],
  categoryPrompt: string
): Promise<Map<number, string>> {
  if (!GEMINI_BASE_URL || !GEMINI_API_KEY || places.length === 0) {
    return new Map();
  }

  const placesInfo = places.map(p => ({
    id: p.id,
    name: p.placeName,
    address: p.address || '',
    city: p.city
  }));

  const prompt = `${categoryPrompt}

地點列表：
${JSON.stringify(placesInfo, null, 2)}

請回傳 JSON Array：[{ "id": 數字, "description": "描述文字" }]
規則：
1. 每個描述必須獨特，不可使用「知名的」「必訪」「特色體驗」「在地人氣」「深度感受」等通用詞
2. 結合地點名稱、地址區域等資訊
3. 描述要具體、有畫面感
4. 禁止加入任何評分數字（如「4.5星」「4.2分」「評分」「星級」）
5. 只回傳 JSON，不要其他文字`;

  const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-3-pro-preview:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 16384 }
    }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  let jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonMatch = [jsonMatch[1]];
  } else {
    jsonMatch = text.match(/\[[\s\S]*?\]/);
  }
  
  if (!jsonMatch) {
    throw new Error('無法解析 JSON 回應');
  }

  const results = JSON.parse(jsonMatch[0]);
  const map = new Map<number, string>();
  for (const r of results) {
    if (r.id && r.description) {
      map.set(r.id, r.description);
    }
  }
  return map;
}

export async function processDescriptionBatch(
  places: PlaceForDescription[],
  category: string,
  batchSize: number = 10,
  onProgress?: (current: number, total: number, success: number) => void
): Promise<{ updated: number; failed: number; failedIds: number[] }> {
  let updated = 0;
  let failed = 0;
  const failedIds: number[] = [];

  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const descriptions = await generateDescriptionsWithRetry(batch, category);

    for (const place of batch) {
      const desc = descriptions.get(place.id);
      if (desc) {
        updated++;
      } else {
        failed++;
        failedIds.push(place.id);
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, places.length), places.length, updated);
    }

    if (i + batchSize < places.length) {
      await sleep(1000);
    }
  }

  return { updated, failed, failedIds };
}

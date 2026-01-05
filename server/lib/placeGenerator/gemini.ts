/**
 * Place Generator - Gemini AI Functions
 */

import { sleep, EIGHT_CATEGORIES, PlaceClassification } from './constants';

// ============ Gemini AI 呼叫（含重試機制） ============
export async function callGemini(prompt: string, retryCount = 0): Promise<string> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini API not configured");
  }

  try {
    const response = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 3000;
        console.log(`[Gemini] 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試...`);
        await sleep(backoffTime);
        return callGemini(prompt, retryCount + 1);
      }
      throw new Error(`429 Rate Limit exceeded after ${MAX_RETRIES} retries`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API failed: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 3000;
      console.log(`[Gemini] 網路錯誤 429，等待 ${backoffTime / 1000} 秒後重試...`);
      await sleep(backoffTime);
      return callGemini(prompt, retryCount + 1);
    }
    throw e;
  }
}

// ============ 批次生成描述（單次 API 呼叫處理多個地點） ============
export async function batchGenerateDescriptions(
  places: { name: string; address: string; types: string[] }[],
  district: string,
  retryCount = 0
): Promise<Map<string, string>> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  if (!baseUrl || !apiKey) {
    return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
  }

  const placesJson = places.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    address: p.address,
    types: p.types?.join(', ') || '景點'
  }));

  const prompt = `你是旅遊文案專家。請為以下 ${places.length} 個景點各寫一段 30-50 字的吸引人描述。

【景點列表】
${JSON.stringify(placesJson, null, 2)}

【要求】
1. 每個描述要突出景點特色，吸引遊客
2. 簡潔有力，不超過 50 字
3. 回傳 JSON Array 格式

【回傳格式】
[
  { "id": 1, "description": "景點描述文字" },
  { "id": 2, "description": "另一個景點描述" }
]

只回傳 JSON Array，不要其他文字。`;

  try {
    const response = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 5000;
        console.log(`[BatchDesc] 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試...`);
        await sleep(backoffTime);
        return batchGenerateDescriptions(places, district, retryCount + 1);
      }
      console.warn('[BatchDesc] Rate limit exceeded, using fallback descriptions');
      return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
    }

    if (!response.ok) {
      console.warn('[BatchDesc] API failed, using fallback descriptions');
      return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as { id: number; description: string }[];
    const resultMap = new Map<string, string>();
    
    for (const item of parsed) {
      const place = places[item.id - 1];
      if (place) {
        resultMap.set(place.name, item.description?.trim() || `探索${district}的特色景點`);
      }
    }
    
    for (const p of places) {
      if (!resultMap.has(p.name)) {
        resultMap.set(p.name, `探索${district}的特色景點`);
      }
    }
    
    return resultMap;
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      console.log(`[BatchDesc] 網路錯誤，等待 ${backoffTime / 1000} 秒後重試...`);
      await sleep(backoffTime);
      return batchGenerateDescriptions(places, district, retryCount + 1);
    }
    console.warn('[BatchDesc] Error, using fallback:', e.message);
    return new Map(places.map(p => [p.name, `探索${district}的特色景點`]));
  }
}

// ============ 批次生成描述 + 分類判斷 ============
export async function batchGenerateWithClassification(
  places: { name: string; address: string; types: string[] }[],
  city: string,
  retryCount = 0
): Promise<Map<string, PlaceClassification>> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  const defaultResult = (name: string) => ({
    description: `探索${city}的特色景點`,
    category: '景點',
    subcategory: 'attraction'
  });
  
  if (!baseUrl || !apiKey) {
    return new Map(places.map(p => [p.name, defaultResult(p.name)]));
  }

  const placesJson = places.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    address: p.address,
    types: p.types?.join(', ') || ''
  }));

  const prompt = `你是旅遊分類專家。請為以下 ${places.length} 個地點：
1. 寫一段 30-50 字的吸引人描述
2. 判斷屬於哪個種類（只能從八大種類選擇）
3. 判斷適合的子分類名稱

【八大種類】
${EIGHT_CATEGORIES.join('、')}

【地點列表】
${JSON.stringify(placesJson, null, 2)}

【回傳格式】
[
  { "id": 1, "description": "描述文字", "category": "美食", "subcategory": "咖啡廳" },
  { "id": 2, "description": "描述文字", "category": "景點", "subcategory": "自然風景" }
]

【要求】
1. category 必須是八大種類之一
2. subcategory 用中文，簡潔 2-6 字（如：咖啡廳、日式料理、溫泉旅館、文化古蹟）
3. 只回傳 JSON Array，不要其他文字`;

  try {
    const response = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 4096,
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 5000;
        console.log(`[BatchClassify] 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試...`);
        await sleep(backoffTime);
        return batchGenerateWithClassification(places, city, retryCount + 1);
      }
      return new Map(places.map(p => [p.name, defaultResult(p.name)]));
    }

    if (!response.ok) {
      return new Map(places.map(p => [p.name, defaultResult(p.name)]));
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Map(places.map(p => [p.name, defaultResult(p.name)]));
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as { 
      id: number; 
      description: string; 
      category: string; 
      subcategory: string 
    }[];
    
    const resultMap = new Map<string, PlaceClassification>();
    
    for (const item of parsed) {
      const place = places[item.id - 1];
      if (place) {
        const validCategory = EIGHT_CATEGORIES.includes(item.category) ? item.category : '景點';
        resultMap.set(place.name, {
          description: item.description?.trim() || `探索${city}的特色景點`,
          category: validCategory,
          subcategory: item.subcategory?.trim() || 'attraction'
        });
      }
    }
    
    for (const p of places) {
      if (!resultMap.has(p.name)) {
        resultMap.set(p.name, defaultResult(p.name));
      }
    }
    
    return resultMap;
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      await sleep(backoffTime);
      return batchGenerateWithClassification(places, city, retryCount + 1);
    }
    return new Map(places.map(p => [p.name, defaultResult(p.name)]));
  }
}

// ============ AI 關鍵字擴散 ============
export async function expandKeywords(
  baseKeyword: string,
  district: string,
  city: string,
  count: number = 8
): Promise<string[]> {
  const prompt = `你是台灣旅遊專家。請根據以下條件，生成 ${count} 組精準的搜尋關鍵字：

地區：${city}${district}
基礎關鍵字：${baseKeyword}

要求：
1. 每個關鍵字都要具體、可搜尋到實際店家或景點
2. 涵蓋不同面向（例如：類型、特色、時段）
3. 不要重複基礎關鍵字
4. 只輸出關鍵字，不要加地區名稱

範例輸入：美食
範例輸出：
小吃
甜點
咖啡廳
海鮮餐廳
夜市美食
早午餐
日式料理
牛排

請直接輸出 ${count} 個關鍵字，每行一個，不要編號：`;

  try {
    const response = await callGemini(prompt);
    const keywords = response
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0 && k.length < 20)
      .slice(0, count);
    
    if (keywords.length === 0) {
      return [baseKeyword];
    }
    
    return keywords;
  } catch (error) {
    console.error('[KeywordExpansion] AI error, using base keyword:', error);
    return [baseKeyword];
  }
}

// ============ AI 專注生成描述（不做分類） ============
export async function batchGenerateDescriptionsOnly(
  places: { name: string; category: string; subcategory: string }[],
  city: string,
  retryCount = 0
): Promise<Map<string, string>> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  if (!baseUrl || !apiKey) {
    console.warn('[DescOnly] AI not configured, will use fallback');
    return new Map();
  }

  const placesJson = places.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory
  }));

  const prompt = `你是旅遊文案專家。請為以下 ${places.length} 個地點各寫一段 30-50 字的吸引人描述。

【地點列表】
${JSON.stringify(placesJson, null, 2)}

【要求】
1. 描述要突出地點特色，吸引遊客前往
2. 簡潔有力，30-50 字
3. 根據 category 和 subcategory 調整語氣
4. 只回傳 JSON Array

【回傳格式】
[
  { "id": 1, "description": "描述文字" },
  { "id": 2, "description": "描述文字" }
]

只回傳 JSON Array，不要其他文字。`;

  try {
    const response = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        }
      }),
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffTime = Math.pow(2, retryCount) * 5000;
        console.log(`[DescOnly] 429 Rate Limit，等待 ${backoffTime / 1000} 秒後重試...`);
        await sleep(backoffTime);
        return batchGenerateDescriptionsOnly(places, city, retryCount + 1);
      }
      console.warn('[DescOnly] Rate limit exceeded, returning empty map');
      return new Map();
    }

    if (!response.ok) {
      console.warn('[DescOnly] API failed:', response.status);
      return new Map();
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[DescOnly] Failed to parse JSON from response');
      return new Map();
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as { id: number; description: string }[];
    const resultMap = new Map<string, string>();
    
    for (const item of parsed) {
      const place = places[item.id - 1];
      if (place && item.description?.trim()) {
        resultMap.set(place.name, item.description.trim());
      }
    }
    
    console.log(`[DescOnly] Generated ${resultMap.size}/${places.length} descriptions via AI`);
    return resultMap;
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      await sleep(backoffTime);
      return batchGenerateDescriptionsOnly(places, city, retryCount + 1);
    }
    console.warn('[DescOnly] Error:', e.message);
    return new Map();
  }
}

// ============ AI 批次生成多語系描述（繁中 + 英 + 日 + 韓） ============
export async function batchGenerateDescriptionsI18n(
  places: { name: string; category: string; subcategory: string }[],
  city: string,
  retryCount = 0
): Promise<Map<string, { zhTw: string; en: string; ja: string; ko: string }>> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const MAX_RETRIES = 3;
  
  if (!baseUrl || !apiKey) {
    console.warn('[DescI18n] AI not configured, will use fallback');
    return new Map();
  }

  const placesJson = places.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory
  }));

  const prompt = `你是多語系旅遊文案專家。請為以下 ${places.length} 個地點各寫 4 種語言版本的描述（繁體中文、English、日本語、한국어）。

【地點列表】
${JSON.stringify(placesJson, null, 2)}

【要求】
1. 每個描述 30-50 字，突出地點特色
2. 各語言版本風格要符合當地文化習慣
3. 只回傳 JSON Array

【回傳格式】
[
  { "id": 1, "zhTw": "繁中描述", "en": "English description", "ja": "日本語説明", "ko": "한국어 설명" },
  { "id": 2, "zhTw": "繁中描述", "en": "English description", "ja": "日本語説明", "ko": "한국어 설명" }
]

只回傳 JSON Array，不要其他文字。`;

  try {
    const response = await fetch(`${baseUrl}/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
      })
    });

    if (response.status === 429 && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      console.log(`[DescI18n] Rate limited, waiting ${backoffTime}ms...`);
      await sleep(backoffTime);
      return batchGenerateDescriptionsI18n(places, city, retryCount + 1);
    }

    if (!response.ok) {
      console.warn('[DescI18n] API failed:', response.status);
      return new Map();
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[DescI18n] Failed to parse JSON from response');
      return new Map();
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as { 
      id: number; 
      zhTw: string; 
      en: string; 
      ja: string; 
      ko: string 
    }[];
    const resultMap = new Map<string, { zhTw: string; en: string; ja: string; ko: string }>();
    
    for (const item of parsed) {
      const place = places[item.id - 1];
      if (place && item.zhTw?.trim()) {
        resultMap.set(place.name, {
          zhTw: item.zhTw.trim(),
          en: item.en?.trim() || '',
          ja: item.ja?.trim() || '',
          ko: item.ko?.trim() || ''
        });
      }
    }
    
    console.log(`[DescI18n] Generated ${resultMap.size}/${places.length} i18n descriptions via AI`);
    return resultMap;
  } catch (e: any) {
    if (e.message?.includes('429') && retryCount < MAX_RETRIES) {
      const backoffTime = Math.pow(2, retryCount) * 5000;
      await sleep(backoffTime);
      return batchGenerateDescriptionsI18n(places, city, retryCount + 1);
    }
    console.warn('[DescI18n] Error:', e.message);
    return new Map();
  }
}

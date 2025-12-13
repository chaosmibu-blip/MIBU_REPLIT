import { storage } from "./storage";

const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

interface DetectedProduct {
  keyword: string;
  startIndex: number;
  endIndex: number;
  klookUrl: string;
}

interface DetectionResult {
  products: DetectedProduct[];
  rawResponse?: string;
}

async function callGeminiForDetection(prompt: string): Promise<string> {
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
        temperature: 0.1,
        maxOutputTokens: 2048,
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

function generateKlookSearchUrl(keyword: string, region?: string): string {
  const encodedKeyword = encodeURIComponent(keyword);
  const baseUrl = 'https://www.klook.com/zh-TW/search/?query=';
  return `${baseUrl}${encodedKeyword}`;
}

export async function detectKlookProducts(
  messageText: string,
  conversationSid: string,
  messageSid: string
): Promise<DetectionResult> {
  if (!messageText || messageText.length < 5) {
    return { products: [] };
  }

  const prompt = `你是一個旅遊商品偵測助手。分析以下聊天訊息，找出可能在 Klook 上購買的旅遊商品或體驗。

Klook 銷售的商品類型包括：
- 景點門票（如：101觀景台、故宮、九份、太魯閣）
- 一日遊行程（如：日月潭一日遊、阿里山一日遊）
- 交通票券（如：高鐵、台鐵、包車）
- 活動體驗（如：潛水、SUP、溯溪、露營）
- 按摩/SPA
- 網卡/WiFi
- 美食體驗（如：吃到飽、米其林餐廳）
- 主題樂園（如：六福村、劍湖山）

聊天訊息：
"${messageText}"

請以 JSON 格式回傳偵測到的商品關鍵字。只回傳 JSON，不要其他文字。
如果沒有偵測到任何商品，回傳空陣列 []。

格式範例：
[
  {"keyword": "日月潭一日遊", "type": "tour"},
  {"keyword": "101觀景台", "type": "ticket"}
]`;

  try {
    const response = await callGeminiForDetection(prompt);
    
    let jsonStr = response.trim();
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const detected = JSON.parse(jsonStr) as Array<{ keyword: string; type: string }>;
    
    if (!Array.isArray(detected) || detected.length === 0) {
      return { products: [], rawResponse: response };
    }

    const products: DetectedProduct[] = [];
    
    for (const item of detected) {
      const keyword = item.keyword;
      const startIndex = messageText.indexOf(keyword);
      
      if (startIndex >= 0) {
        const endIndex = startIndex + keyword.length;
        const klookUrl = generateKlookSearchUrl(keyword);
        
        products.push({
          keyword,
          startIndex,
          endIndex,
          klookUrl
        });

        try {
          await storage.createMessageHighlight({
            conversationSid,
            messageSid,
            productName: keyword,
            productUrl: klookUrl,
            startIndex,
            endIndex
          });
        } catch (err) {
          console.error('Failed to save message highlight:', err);
        }
      }
    }

    return { products, rawResponse: response };
  } catch (error) {
    console.error('Klook detection error:', error);
    return { products: [] };
  }
}

export async function getMessageHighlights(
  conversationSid: string,
  messageSid: string
) {
  return storage.getMessageHighlights(conversationSid, messageSid);
}

export async function getConversationHighlights(conversationSid: string) {
  return storage.getConversationHighlights(conversationSid);
}

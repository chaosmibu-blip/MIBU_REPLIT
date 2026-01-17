import { GoogleGenerativeAI } from "@google/generative-ai";
import { eventStorage } from "../storage";
import type { EventSource } from "@shared/schema";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

interface ParsedEvent {
  title: string;
  description?: string;
  location?: string;
  locationCity?: string;
  startDate?: string;
  endDate?: string;
  sourceUrl?: string;
  externalId?: string;
}

/**
 * 使用 Gemini 解析網頁內容並提取活動資訊
 */
async function parseEventsWithAI(htmlContent: string, sourceUrl: string): Promise<ParsedEvent[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `
你是一個活動資訊提取專家。請從以下網頁內容中提取所有活動資訊。

網頁 URL: ${sourceUrl}

請提取以下欄位（JSON 陣列格式）:
- title: 活動名稱 (必填)
- description: 活動描述
- location: 活動地點（完整地址或地點名稱）
- locationCity: 城市名稱（如：台北市、高雄市）
- startDate: 開始日期 (ISO 8601 格式，如 2024-01-15)
- endDate: 結束日期 (ISO 8601 格式)
- sourceUrl: 活動詳情連結（如果有的話）
- externalId: 唯一識別碼（可以用活動名稱+日期組合）

注意事項:
1. 只提取台灣的活動
2. 只提取有明確日期的活動
3. 如果活動已經過期（結束日期早於今天），請跳過
4. 如果沒有找到任何活動，回傳空陣列 []
5. 日期格式必須是 YYYY-MM-DD

回傳格式範例:
[
  {
    "title": "2024 台北燈節",
    "description": "元宵節燈會活動",
    "location": "台北市中正區中山南路",
    "locationCity": "台北市",
    "startDate": "2024-02-15",
    "endDate": "2024-02-25",
    "sourceUrl": "https://example.com/event/123",
    "externalId": "taipei-lantern-2024"
  }
]

網頁內容:
${htmlContent.substring(0, 30000)}

請只回傳 JSON 陣列，不要加其他文字說明。
`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // 清理 response，移除可能的 markdown 標記
    let cleanedResponse = response
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // 嘗試解析 JSON
    const events = JSON.parse(cleanedResponse) as ParsedEvent[];

    console.log(`[EventCrawler] AI parsed ${events.length} events from ${sourceUrl}`);
    return events;
  } catch (error: any) {
    console.error(`[EventCrawler] AI parsing error:`, error.message);
    return [];
  }
}

/**
 * 抓取網頁內容
 */
async function fetchWebPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MibuBot/1.0; +https://mibu.travel)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(30000), // 30 秒超時
    });

    if (!response.ok) {
      console.error(`[EventCrawler] HTTP error ${response.status} for ${url}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      console.error(`[EventCrawler] Unsupported content type: ${contentType}`);
      return null;
    }

    return await response.text();
  } catch (error: any) {
    console.error(`[EventCrawler] Fetch error for ${url}:`, error.message);
    return null;
  }
}

/**
 * 爬取單一來源
 */
async function crawlSource(source: EventSource): Promise<{
  success: boolean;
  eventsFound: number;
  eventsCreated: number;
  error?: string;
}> {
  console.log(`[EventCrawler] Starting crawl for source: ${source.name} (${source.url})`);

  try {
    // 1. 抓取網頁
    const html = await fetchWebPage(source.url);
    if (!html) {
      await eventStorage.updateCrawlStatus(source.id, "failed", "無法取得網頁內容");
      return { success: false, eventsFound: 0, eventsCreated: 0, error: "無法取得網頁內容" };
    }

    // 2. 使用 AI 解析活動
    const parsedEvents = await parseEventsWithAI(html, source.url);
    if (parsedEvents.length === 0) {
      await eventStorage.updateCrawlStatus(source.id, "success", undefined);
      return { success: true, eventsFound: 0, eventsCreated: 0 };
    }

    // 3. 儲存活動（去重）
    let eventsCreated = 0;
    for (const event of parsedEvents) {
      try {
        // 檢查是否已存在
        const externalId = event.externalId || `${source.id}-${event.title}-${event.startDate}`;
        const existing = await eventStorage.getEventByExternalId(source.id, externalId);

        if (existing) {
          console.log(`[EventCrawler] Event already exists: ${event.title}`);
          continue;
        }

        // 建立新活動
        await eventStorage.createEvent({
          title: event.title,
          description: event.description,
          eventType: source.sourceType === "both" ? "limited" : source.sourceType,
          location: event.location,
          locationCity: event.locationCity,
          startDate: event.startDate ? new Date(event.startDate) : undefined,
          endDate: event.endDate ? new Date(event.endDate) : undefined,
          sourceUrl: event.sourceUrl || source.url,
          sourceId: source.id,
          externalId,
          status: "pending", // 需要審核
          createdByType: "crawler",
        });

        eventsCreated++;
        console.log(`[EventCrawler] Created event: ${event.title}`);
      } catch (eventError: any) {
        console.error(`[EventCrawler] Error creating event "${event.title}":`, eventError.message);
      }
    }

    await eventStorage.updateCrawlStatus(source.id, "success", undefined);
    return {
      success: true,
      eventsFound: parsedEvents.length,
      eventsCreated,
    };
  } catch (error: any) {
    console.error(`[EventCrawler] Error crawling source ${source.name}:`, error.message);
    await eventStorage.updateCrawlStatus(source.id, "failed", error.message);
    return {
      success: false,
      eventsFound: 0,
      eventsCreated: 0,
      error: error.message,
    };
  }
}

/**
 * 爬取所有啟用的來源
 */
export async function crawlAllSources(): Promise<{
  sourcesProcessed: number;
  totalEventsFound: number;
  totalEventsCreated: number;
  errors: string[];
}> {
  console.log("[EventCrawler] Starting daily crawl...");

  const sources = await eventStorage.getActiveEventSources();
  console.log(`[EventCrawler] Found ${sources.length} active sources`);

  let totalEventsFound = 0;
  let totalEventsCreated = 0;
  const errors: string[] = [];

  for (const source of sources) {
    const result = await crawlSource(source);
    totalEventsFound += result.eventsFound;
    totalEventsCreated += result.eventsCreated;

    if (!result.success && result.error) {
      errors.push(`${source.name}: ${result.error}`);
    }

    // 避免過快請求，每個來源間隔 2 秒
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // 標記過期活動
  const expiredCount = await eventStorage.expireOldEvents();
  console.log(`[EventCrawler] Marked ${expiredCount} events as expired`);

  console.log(`[EventCrawler] Daily crawl completed. Found: ${totalEventsFound}, Created: ${totalEventsCreated}`);

  return {
    sourcesProcessed: sources.length,
    totalEventsFound,
    totalEventsCreated,
    errors,
  };
}

/**
 * 手動觸發單一來源爬取（供管理員測試用）
 */
export async function crawlSingleSource(sourceId: number) {
  const source = await eventStorage.getEventSource(sourceId);
  if (!source) {
    throw new Error("來源不存在");
  }

  return await crawlSource(source);
}

export { crawlSource };

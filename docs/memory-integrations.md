# 第三方整合記憶庫 (Third-Party Integrations)

## 模組範圍
所有外部服務的整合：地圖、AI、簡訊、支付等。

---

## 1. Google Places API

### 用途
- **僅限採集腳本使用**：批次採集景點資料
- 取得經緯度、評分、營業時間、Google Types

### 環境變數
```
GOOGLE_MAPS_API_KEY
```

### ⚠️ 費用來源分析（2026-01-01 更新）

| 功能 | 是否產生費用 | 說明 |
|------|-------------|------|
| **採集腳本** | ✅ 是 | 唯一會產生 Google API 費用的地方 |
| **Gacha V3 扭蛋** | ❌ 否 | Database-driven，從 places 表直接抽取 |
| **商家認領** | ❌ 否 | 直接連結 places 表，不呼叫 API |
| **V1/V2 Legacy** | ⚠️ 殘留 | 舊版端點，已不在主流程使用 |

> 📌 **結論**：運營階段 0 Google API 費用，只有手動執行採集腳本時才會產生費用。

### 主要使用（僅採集腳本）
```typescript
// Text Search (New) - 採集腳本使用
POST https://places.googleapis.com/v1/places:searchText
Headers:
  X-Goog-Api-Key: ${GOOGLE_MAPS_API_KEY}
  X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,...

// 目前請求的欄位（batch-parallel-collect.ts）
places.id, places.displayName, places.formattedAddress, places.location,
places.rating, places.types, places.primaryType, places.businessStatus,
places.currentOpeningHours, places.regularOpeningHours, nextPageToken
```

### 使用位置
- `server/scripts/batch-parallel-collect.ts`: **唯一主要費用來源**
- `server/lib/placeGenerator.ts`: 採集函式庫（被腳本呼叫）
- `server/routes.ts`: Legacy 端點（V1/V2，已停用）

### 費用結構

| API | 美金/千次 | 台幣/千次 |
|-----|----------|----------|
| Text Search (New) - Pro | $32 | NT$1,004 |
| + Contact Data（營業時間）| +$3 | +NT$94 |
| Geocoding | $5 | NT$157 |
| Place Details - Basic | $5-10 | NT$157-314 |

### 每次採集費用估算
- 每個城市約 70-210 次 API 呼叫
- 費用約 **NT$70-210/城市**

### 優化建議（未實施）
1. **分段式採集**：先用 Field Mask 只取 ID，本地去重後再取詳情
2. **減少欄位**：移除 `openingHours` 可省 NT$94/千次
3. **減少關鍵字**：10 → 5 個/類別
4. **減少分頁**：3 頁 → 1 頁

---

## 2. Google Gemini AI

### 用途
- 行程生成（V1/V2）
- 景點審核
- 行程順序優化

### 環境變數
```
AI_INTEGRATIONS_GEMINI_API_KEY
AI_INTEGRATIONS_GEMINI_BASE_URL
```

### 主要模型（2026-01-02 更新）

| 模型 | 用途 | 特性 |
|------|------|------|
| `gemini-2.5-flash` | 採集、**V3 扭蛋排序** | 快速、低成本、Replit 支援 |
| `gemini-3-pro-preview` | 審核、描述生成（離線腳本） | 高品質推理 |

> ⚠️ `gemini-3-flash` 在 Replit AI Integrations 尚未支援（2026-01-02 確認）

### 模型配置規範

| 用途 | 模型 | temperature | maxOutputTokens | 備註 |
|------|------|-------------|-----------------|------|
| 採集 | gemini-2.5-flash | 0.7 | 8192 | 離線腳本 |
| **V3 扭蛋排序** | gemini-2.5-flash | 0.1 | 8192 | ⚡ 即時 API |
| **審核** | gemini-3-pro-preview | 0.1 | 16384 | 離線腳本 |
| **描述生成** | gemini-3-pro-preview | 0.3 | 16384 | 離線腳本 |

> ⚠️ **Gemini 3 重要提醒**：Gemini 3 是推理模型，會消耗 1000-4000 tokens 進行「思考」，必須設定足夠的 maxOutputTokens

### V3 扭蛋效能優化（2026-01-02 更新）

| 優化項目 | 優化前 | 優化後 | 改善幅度 |
|---------|--------|--------|----------|
| AI 排序模型 | gemini-3-pro-preview | **gemini-2.5-flash** | - |
| 單一請求回應 | 109 秒 | 1-3 秒 | ⚡ 50x |
| 10 併發請求 | 超時 | 穩定 | ⚡ 穩定 |
| 支撐能力 | <10 DAU | **10,000+ DAU** | ✅ 達標 |

> ⚠️ **注意**：`gemini-3-flash` 在 Replit AI Integrations 尚未支援，改用 `gemini-2.5-flash`
> 
> 📌 **決策**：即時 API 用 `gemini-2.5-flash`、離線腳本維持 `gemini-3-pro-preview`（品質優先）

### 使用方式
```typescript
// Gemini 3 Pro Preview（審核/描述/排序）
const response = await fetch(
  `${baseUrl}/models/gemini-3-pro-preview:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,  // 低 temperature 確保穩定輸出
        maxOutputTokens: 16384  // 足夠空間給思考 + 回應
      }
    })
  }
);

// Gemini 2.5 Flash（採集用）
const response = await fetch(
  `${baseUrl}/models/gemini-2.5-flash:generateContent`,
  // ...同上，但 maxOutputTokens 可較小
);
```

### 配額
- 免費: 15 req/min
- 付費: 360+ req/min

### Batch API vs 免費額度決策（2026-01-01 新增）

| 方案 | 適用場景 | 限制 |
|------|---------|------|
| **Replit 整合（推薦）** | 正式審核流程 | 按量付費、穩定 |
| Google AI Studio 免費 | Prompt 測試、少量驗證 | 15 RPM、不支援 Batch API |
| Batch API（付費） | 百萬筆資料處理 | 需 Cloud billing、結果延遲 24 小時 |

> 📌 **決策結論**：36,000 筆地點審核使用現有架構（每批 500 筆串行），不採用 Batch API。
> - 原因：Batch API 需付費且需重寫腳本，現有架構已優化
> - 免費額度保留用於 Prompt 測試

### Rate Limit 防護（2025-12-25 新增）
```typescript
// placeGenerator.ts 中的 callGemini 已內建重試機制
export async function callGemini(prompt: string, retryCount = 0): Promise<string>
// 429 時執行 Exponential Backoff: 3s → 6s → 12s

// 批次生成描述（單次 API 處理多個地點）
export async function batchGenerateDescriptions(
  places: { name: string; address: string; types: string[] }[],
  district: string
): Promise<Map<string, string>>
// 429 時執行 Exponential Backoff: 5s → 10s → 20s
```

### 採集腳本參數（2026-01-01 更新）
| 腳本 | 參數 | 預設值 | AI 模型 | 說明 |
|------|------|--------|---------|------|
| **deep-review-places.ts** | BATCH_SIZE | 500 | **Gemini 3** | 每批審核筆數（串行） |
| **deep-review-places.ts** | maxOutputTokens | 16384 | **Gemini 3** | AI 回應 token 上限 |
| short-batch-review.ts | BATCH_LIMIT | 1000 | **Gemini 3** | 每輪處理上限 |
| short-batch-review.ts | CHUNK_SIZE | 50 | **Gemini 3** | 每批 AI 審核筆數 |
| short-batch-review.ts | maxOutputTokens | 16384 | **Gemini 3** | AI 回應 token 上限 |
| migrate-with-descriptions.ts | batchSize | 15 | **Gemini 3** | 每批描述生成筆數 |
| migrate-with-descriptions.ts | aiConcurrency | 10 | **Gemini 3** | 並行 AI 請求數 |
| migrate-with-descriptions.ts | maxOutputTokens | 16384 | **Gemini 3** | AI 回應 token 上限 |
| batch-parallel-collect.ts | CONCURRENCY | 10 | Flash | 類別內並行請求數 |
| descriptionGenerator.ts | maxOutputTokens | 16384 | **Gemini 3** | 函式庫描述生成 |

### 並行 vs 串行策略（2026-01-01 新增）

| 任務類型 | 建議策略 | 原因 |
|---------|---------|------|
| **描述生成** | 並行（10併發 × 15筆） | Prompt 短、輸出小、判斷簡單 |
| **審核判斷** | 串行（500筆/次） | Prompt 長、需要思考、容易觸發 Rate Limit |
| **採集關鍵字** | 並行（10併發） | 使用 Flash 模型、快速 |

> ⚠️ **Gemini 3 並行注意事項**：
> - 思考型模型每次請求需 30-60 秒
> - 多個並行請求會累積 Rate Limit 壓力
> - 審核任務建議串行處理，避免 429 錯誤

### 廢棄腳本（2026-01-01）
| 腳本 | 狀態 | 說明 |
|------|------|------|
| generate-descriptions.ts | ⚠️ 廢棄 | 與 migrate-with-descriptions.ts 功能重複，請使用後者 |

### 調用規範
- 所有 Gemini 調用應使用 `placeGenerator.ts` 導出的函數
- 避免各模組自建調用函數，確保 Rate Limit 防護一致

---

## 3. Mapbox

### 用途
- 前端地圖顯示
- 路線規劃
- 地圖樣式

### 環境變數
```
MAPBOX_ACCESS_TOKEN
```

### 前端取得 Token
```typescript
GET /api/config/mapbox
Response: { token: "pk.xxx" }
```

### 使用元件
```typescript
import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = token;
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [121.5, 25.0],
  zoom: 12
});
```

---

## 4. Twilio

### 用途
- SOS 簡訊通知
- 優惠券到期提醒
- 驗證碼（計畫中）

### 環境變數
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

### 發送簡訊
```typescript
import twilio from 'twilio';

const client = twilio(accountSid, authToken);
await client.messages.create({
  body: '【Mibu】您的朋友觸發了 SOS 求助...',
  from: TWILIO_PHONE_NUMBER,
  to: '+886912345678'
});
```

### 配額
- $0.0075/則 (台灣)

---

## 5. Stripe

### 用途
- 訂閱付款
- 商品購買
- 退款處理

### 環境變數
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

### 自動同步
使用 `stripe-replit-sync` 套件自動同步資料

### Webhook 端點
```
POST /api/stripe/webhook/:uuid
```

詳見 `memory-payment-commerce.md`

---

## 6. Apple Sign In

### 用途
- iOS 用戶認證

### 環境變數
```
APPLE_CLIENT_ID
```

### 驗證流程
```typescript
import appleSignIn from 'apple-signin-auth';

const { sub, email } = await appleSignIn.verifyIdToken(
  identityToken,
  { audience: APPLE_CLIENT_ID }
);
```

詳見 `memory-auth.md`

---

## 7. Klook API (計畫中)

### 用途
- 門票/體驗商品
- 聯盟行銷

### 整合方式
- 聯盟連結導購
- 商品資料同步

---

## 整合狀態總覽

| 服務 | 狀態 | 用途 |
|------|------|------|
| Google Places | ✅ 已整合 | 景點驗證 |
| Google Gemini | ✅ 已整合 | AI 生成/審核 |
| Mapbox | ✅ 已整合 | 地圖顯示 |
| Twilio | ✅ 已整合 | SOS 簡訊 |
| Stripe | ✅ 已整合 | 支付 |
| Apple Sign In | ✅ 已整合 | 認證 |
| Google Sign In | 🔄 計畫中 | 認證 |
| Klook | 🔄 計畫中 | 商品 |
| APNs | 🔄 計畫中 | 推播 |

## 錯誤處理原則
1. 第三方 API 失敗不應阻擋主流程
2. 使用 fallback 或 graceful degradation
3. 記錄錯誤但不暴露 API 金鑰
4. 設定合理的 timeout（10-30 秒）

---

## 外部依賴總覽
| 服務 | 用途 | 配置位置 |
|------|------|----------|
| PostgreSQL | 資料庫 | DATABASE_URL |
| Drizzle ORM | 資料存取 | shared/schema.ts |
| Apple Sign In | iOS 認證 | APPLE_CLIENT_ID |
| Google Gemini | AI 生成/審核 | AI_INTEGRATIONS_* |
| Mapbox | 地圖顯示 | /api/config/mapbox |
| Klook | 第三方商品 | klook_products 表 |
| Replit | 部署平台 | 自動配置 |

# 第三方整合記憶庫 (Third-Party Integrations)

## 模組範圍
所有外部服務的整合：地圖、AI、簡訊、支付等。

---

## 1. Google Places API

### 用途
- 景點資料驗證
- 地址 geocoding
- 營業時間、評分取得

### 環境變數
```
GOOGLE_MAPS_API_KEY
```

### 主要使用
```typescript
// Place Details
GET https://maps.googleapis.com/maps/api/place/details/json
?place_id=${placeId}&fields=name,formatted_address,geometry,rating,opening_hours
&key=${GOOGLE_MAPS_API_KEY}

// Place Search
GET https://maps.googleapis.com/maps/api/place/textsearch/json
?query=${placeName}+${city}&key=${GOOGLE_MAPS_API_KEY}
```

### 使用位置
- `server/routes.ts`: AutoDraft 景點驗證
- 地址 → 經緯度轉換

### 配額
- 免費: $200/月 (約 40,000 次請求)
- 超額: $0.017/次

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

### 主要模型
```typescript
// 快速任務
gemini-2.5-flash

// 複雜推理（備用）
gemini-2.5-pro
```

### 使用方式
```typescript
const response = await fetch(
  `${baseUrl}/models/gemini-2.5-flash:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  }
);
```

### 配額
- 免費: 15 req/min
- 付費: 360+ req/min

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

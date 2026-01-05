# Mibu 官網功能設計藍圖
> **版本**: 1.0 | **建立日期**: 2026-01-05 | **狀態**: 待審核

---

## 📋 專案概述

### 現有架構
| 系統 | 技術棧 | 位置 |
|------|--------|------|
| **後端** | Node.js + Express + Drizzle ORM + PostgreSQL | 本專案 (Replit) |
| **App 前端** | Expo + React Native + NativeWind | 另一專案 |
| **官方網站** | 待規劃（建議 Next.js 15） | 另一專案 |

### 功能目標
1. **程式化 SEO** - 讓 Google 爬蟲搜尋「某地 景點/美食/行程」時，能找到 Mibu 官網
2. **商家訂閱制** - 商家在官網購買訂閱，權限即時同步至 App

---

## 🎯 功能一：程式化 SEO

### 1.1 核心概念

將 Gacha V3 的 AI 排序理由，轉換為 **SEO 友善的行程介紹**，生成數千個靜態頁面供 Google 索引。

```
目標關鍵字範例：
- 「台北大安區一日遊」
- 「高雄美食推薦」
- 「宜蘭親子景點」
- 「台中文青行程」
```

### 1.2 資料流程

```
┌─────────────────────────────────────────────────────────────────┐
│  Gacha V3 (後端)                                                │
│  ┌─────────────┐    ┌─────────────────────────┐                │
│  │ AI 排序請求 │ →  │ Gemini 3 Pro Preview    │                │
│  └─────────────┘    │ (修改 prompt)           │                │
│                      │ 輸出: itineraryIntro    │                │
│                      │ + seoKeywords           │                │
│                      └───────────┬─────────────┘                │
│                                  ↓                              │
│                      ┌─────────────────────────┐                │
│                      │ seo_itineraries 表      │                │
│                      │ (新增資料表)            │                │
│                      └───────────┬─────────────┘                │
└──────────────────────────────────┼──────────────────────────────┘
                                   ↓
┌──────────────────────────────────┼──────────────────────────────┐
│  官方網站 (Next.js 15)           │                              │
│                      ┌───────────┴─────────────┐                │
│                      │ SSG/ISR 頁面生成        │                │
│                      │ /itinerary/[slug]       │                │
│                      └───────────┬─────────────┘                │
│                                  ↓                              │
│  ┌─────────────┐   ┌─────────────────────────┐                  │
│  │ sitemap.xml │ + │ Schema.org JSON-LD      │                  │
│  └─────────────┘   └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 新增資料表：`seo_itineraries`

```typescript
// shared/schema.ts 新增

export const seoItineraries = pgTable("seo_itineraries", {
  id: serial("id").primaryKey(),
  
  // 地區關聯
  regionId: integer("region_id").references(() => regions.id),
  districtId: integer("district_id").references(() => districts.id),
  city: text("city").notNull(),           // 冗餘欄位，方便查詢
  district: text("district"),             // 可為 null（城市級別）
  
  // SEO 核心內容
  slug: text("slug").notNull().unique(),  // URL slug: "taipei-daan-one-day-trip"
  title: text("title").notNull(),         // 頁面標題
  metaDescription: text("meta_description"), // Meta Description (160 字內)
  
  // AI 生成內容
  itineraryIntro: text("itinerary_intro").notNull(), // 行程介紹 (800-1500 字)
  seoKeywords: text("seo_keywords").array(),         // ["台北美食", "大安區景點"]
  
  // 關聯景點
  placeIds: integer("place_ids").array(), // 包含的景點 ID 陣列
  placeSummary: jsonb("place_summary"),   // 精簡景點資訊 JSON
  
  // 分類標籤
  category: text("category"),             // 美食/景點/文化/親子
  duration: text("duration"),             // 半日/一日/兩日
  targetAudience: text("target_audience"), // 情侶/家庭/朋友/獨旅
  
  // 狀態管理
  status: text("status").default("draft"),  // draft/published/archived
  publishedAt: timestamp("published_at"),
  
  // 版本與來源
  gachaSessionId: text("gacha_session_id"), // 關聯扭蛋 session
  version: integer("version").default(1),
  
  // 時間戳
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### 1.4 Gemini Prompt 修改

**現有 Prompt（排序用）**
```
請根據以下景點資料，按照推薦優先順序排序，並說明理由...
```

**新增 Prompt（SEO 介紹生成）**
```
你是一位專業的旅遊內容編輯，請根據以下 {city} {district} 的景點資料，撰寫一篇 SEO 友善的行程介紹文章。

【輸出要求】
1. title: 吸引人的標題（30 字內，包含地區名）
2. metaDescription: Google 搜尋描述（160 字內）
3. itineraryIntro: 行程介紹文章（800-1500 字）
   - 第一段：地區特色與行程亮點
   - 第二段：推薦路線與時間安排
   - 第三段：美食推薦與用餐建議
   - 第四段：交通資訊與實用提示
4. seoKeywords: 5-8 個相關關鍵字陣列

【景點資料】
{placesJson}

【輸出格式】JSON
```

### 1.5 官網頁面結構

```
/                           # 首頁
/itinerary                  # 行程列表
/itinerary/[slug]           # 行程詳情頁 (SSG)
/city/[city]                # 城市頁面
/city/[city]/[district]     # 區域頁面

/sitemap.xml                # 動態 Sitemap
/robots.txt                 # 爬蟲規則
```

### 1.6 API 端點

| Method | Endpoint | 說明 | 認證 |
|--------|----------|------|------|
| GET | /api/seo/itineraries | 列出所有已發布行程 | 公開（Service Token） |
| GET | /api/seo/itineraries/:slug | 取得單一行程 | 公開 |
| GET | /api/seo/sitemap | 取得 Sitemap 資料 | 公開 |
| POST | /api/seo/itineraries/generate | 觸發 AI 生成 | Admin Only |
| PATCH | /api/seo/itineraries/:id/publish | 發布行程 | Admin Only |
| POST | /api/seo/revalidate | 觸發 ISR 重新驗證 | Service Token |

### 1.7 資料來源與 ISR 重新驗證

#### 資料來源映射
```typescript
// 從現有資料表取得 regionId 和 districtId
const populateSeoItinerary = async (city: string, district?: string) => {
  // 1. 從 regions 表取得 regionId
  const region = await db.query.regions.findFirst({
    where: eq(regions.nameZh, city)
  });
  
  // 2. 如果有區域，從 districts 表取得 districtId
  let districtRecord = null;
  if (district && region) {
    districtRecord = await db.query.districts.findFirst({
      where: and(
        eq(districts.regionId, region.id),
        eq(districts.nameZh, district)
      )
    });
  }
  
  return {
    regionId: region?.id || null,
    districtId: districtRecord?.id || null,
    city,
    district,
  };
};
```

#### ISR 重新驗證觸發機制

```typescript
// 後端：發布行程後觸發 ISR 重新驗證
// PATCH /api/seo/itineraries/:id/publish
app.patch("/api/seo/itineraries/:id/publish", async (req, res) => {
  const { id } = req.params;
  
  // 1. 更新狀態為 published
  const itinerary = await db.update(seoItineraries)
    .set({ status: 'published', publishedAt: new Date() })
    .where(eq(seoItineraries.id, Number(id)))
    .returning();
  
  // 2. 通知官網進行 ISR 重新驗證
  await triggerISRRevalidation(itinerary[0].slug);
  
  return res.json({ success: true, itinerary: itinerary[0] });
});

// ISR 重新驗證函式
const triggerISRRevalidation = async (slug: string) => {
  const OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL; // https://mibu.tw
  const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;
  
  try {
    // 呼叫 Next.js On-Demand Revalidation API
    await fetch(`${OFFICIAL_SITE_URL}/api/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Revalidate-Secret': REVALIDATE_SECRET,
      },
      body: JSON.stringify({
        paths: [
          `/itinerary/${slug}`,
          '/itinerary',        // 列表頁也需要更新
          '/sitemap.xml',      // Sitemap 也需要更新
        ],
      }),
    });
  } catch (error) {
    console.error('ISR revalidation failed:', error);
  }
};
```

#### 官網 Next.js Revalidation API

```typescript
// app/api/revalidate/route.ts (Next.js 官網)
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Revalidate-Secret');
  
  // 驗證 secret
  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  
  const { paths } = await request.json();
  
  // 重新驗證指定路徑
  for (const path of paths) {
    revalidatePath(path);
  }
  
  return NextResponse.json({ revalidated: true, paths });
}
```

#### ISR 配置

```typescript
// app/itinerary/[slug]/page.tsx
export const revalidate = 3600; // 1 小時自動重新驗證

// 或使用 generateStaticParams 進行 SSG
export async function generateStaticParams() {
  const itineraries = await fetchAllPublishedItineraries();
  return itineraries.map((i) => ({ slug: i.slug }));
}
```

---

## 💳 功能二：商家訂閱制

### 2.1 訂閱方案定義

根據用戶提供的規格：

#### 商家等級（Merchant Tier）
| 等級 | 價格 | 行程卡數量 | 數據分析 | 商品管理 |
|------|------|-----------|---------|---------|
| Free | $0 | 1 | ❌ | ✅ |
| Pro | $299/月 | 5 | ✅ | ✅ |
| Premium | $799/月 | 20 | ✅ | ✅ |

#### 行程卡等級（Place Card Tier）
| 等級 | 價格 | 外框 | 優惠資訊 | 優惠券方案數 | 可選稀有度 | 圖片編輯 |
|------|------|-----|---------|-------------|-----------|---------|
| Free | $0 | ❌ | ❌ | 1 | R | 優惠券背景 |
| Pro | $199/月 | ✅ | ✅ | 5 | SSR/SR/S/R | 優惠券+道具箱 |
| Premium | $399/月 | ✅ + 特效 | ✅ | 10 | SP/SSR/SR/S/R | 優惠券+道具箱 |

### 2.2 資料表修改

#### 修改 `merchants` 表
```typescript
// 新增欄位
merchantTier: text("merchant_tier").default("free"), // free/pro/premium
merchantTierExpiresAt: timestamp("merchant_tier_expires_at"),
stripeCustomerId: text("stripe_customer_id"),
recurCustomerId: text("recur_customer_id"),
```

#### 新增 `merchant_subscriptions` 表
```typescript
export const merchantSubscriptions = pgTable("merchant_subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  
  // 訂閱類型
  subscriptionType: text("subscription_type").notNull(), // merchant_tier / place_card_tier
  tier: text("tier").notNull(),                          // free/pro/premium
  
  // 金流資訊
  provider: text("provider").notNull(),      // stripe / recur
  providerSubscriptionId: text("provider_subscription_id"), // Stripe/Recur subscription ID
  providerCustomerId: text("provider_customer_id"),
  
  // 狀態
  status: text("status").default("active"),  // active/cancelled/past_due/expired
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  
  // 價格
  amount: integer("amount"),                 // 金額（分/角）
  currency: text("currency").default("TWD"),
  
  // 時間戳
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

#### 新增 `merchant_place_subscriptions` 表（行程卡訂閱）
```typescript
export const merchantPlaceSubscriptions = pgTable("merchant_place_subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  placeId: integer("place_id").references(() => places.id).notNull(),
  
  // 等級
  tier: text("tier").default("free"),        // free/pro/premium
  
  // 關聯主訂閱
  subscriptionId: integer("subscription_id").references(() => merchantSubscriptions.id),
  
  // 狀態
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 2.3 金流整合架構

```
┌─────────────────────────────────────────────────────────────────┐
│  官方網站 (Next.js)                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 訂閱購買頁面                                             │   │
│  │ - 偵測用戶國家/IP                                        │   │
│  │ - 台灣 → Recur (PAYUNi)                                  │   │
│  │ - 其他 → Stripe                                          │   │
│  └──────────────────────────┬──────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              ↓
┌─────────────────────────────┼───────────────────────────────────┐
│  金流服務                    │                                   │
│  ┌────────────────┐    ┌────┴────────────┐                      │
│  │ Stripe         │    │ Recur (PAYUNi)  │                      │
│  │ (海外)         │    │ (台灣)          │                      │
│  └───────┬────────┘    └────────┬────────┘                      │
│          │                      │                               │
│          ↓                      ↓                               │
│  ┌───────────────────────────────────────────┐                  │
│  │ Webhook 接收                               │                  │
│  │ POST /api/webhooks/stripe                  │                  │
│  │ POST /api/webhooks/recur                   │                  │
│  └──────────────────────┬────────────────────┘                  │
└─────────────────────────┼───────────────────────────────────────┘
                          ↓
┌─────────────────────────┼───────────────────────────────────────┐
│  後端 (本專案)           │                                       │
│  ┌──────────────────────┴────────────────────┐                  │
│  │ 訂閱狀態更新                               │                  │
│  │ - 更新 merchant_subscriptions              │                  │
│  │ - 更新 merchants.merchantTier              │                  │
│  └──────────────────────┬────────────────────┘                  │
│                         ↓                                       │
│  ┌───────────────────────────────────────────┐                  │
│  │ 權限同步機制                               │                  │
│  │ - Socket.io 即時推送                       │                  │
│  │ - 或 Push Notification                     │                  │
│  └──────────────────────┬────────────────────┘                  │
└─────────────────────────┼───────────────────────────────────────┘
                          ↓
┌─────────────────────────┼───────────────────────────────────────┐
│  Expo App               │                                       │
│  ┌──────────────────────┴────────────────────┐                  │
│  │ 接收權限更新                               │                  │
│  │ - 刷新商家 session                         │                  │
│  │ - 解鎖對應功能                             │                  │
│  └───────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Recur 整合（現有基礎）

根據 `server/routes.ts` 第 2192-2372 行，已有：
- `RECUR_API_URL = "https://api.recur.tw/v1"`
- `POST /api/recur/checkout` - 建立結帳
- `POST /api/webhooks/recur` - Webhook 處理
- `GET /api/webhooks/recur/info` - Webhook 資訊

**需要補完的部分：**
1. 商家訂閱專用 Price ID 設定
2. 訂閱狀態同步邏輯
3. 取消訂閱處理

### 2.5 Stripe 整合（現有基礎）

已有完整 Stripe 整合，需新增：
1. 商家訂閱 Price ID（Stripe Dashboard 建立）
2. 訂閱 Webhook 事件處理
3. 用戶面向的訂閱管理頁面

### 2.6 API 端點

| Method | Endpoint | 說明 | 認證 |
|--------|----------|------|------|
| GET | /api/merchant/subscription | 取得當前訂閱狀態 | Merchant JWT |
| POST | /api/merchant/subscription/checkout | 建立訂閱結帳 | Merchant JWT |
| POST | /api/merchant/subscription/cancel | 取消訂閱 | Merchant JWT |
| POST | /api/merchant/subscription/upgrade | 升級方案 | Merchant JWT |
| POST | /api/webhooks/stripe | Stripe Webhook | Signature |
| POST | /api/webhooks/recur | Recur Webhook | Signature |

### 2.7 權限同步機制

#### 方案 A：Socket.io 即時推送（推薦）
```typescript
// 後端：Webhook 處理完成後
io.to(`merchant:${merchantId}`).emit('subscription:updated', {
  merchantTier: 'pro',
  placeCardTier: 'premium',
  expiresAt: '2026-02-05T00:00:00Z'
});

// App 端：監聽事件
socket.on('subscription:updated', (data) => {
  updateMerchantSession(data);
  refreshUI();
});
```

#### 方案 B：Push Notification + API 刷新
```typescript
// 後端：發送推播
await pushNotification.send(merchantUserId, {
  title: '訂閱已升級',
  body: '您的 Pro 方案已生效',
  data: { action: 'refresh_subscription' }
});

// App 端：收到推播後調用 API
GET /api/merchant/subscription → 更新本地狀態
```

---

## 🔐 安全性設計

### 3.1 認證機制

| 場景 | 認證方式 | 說明 |
|------|---------|------|
| 官網 SEO 頁面 | Service Token | 後端發給官網的靜態 Token |
| 商家登入 | JWT | 與 App 共用認證系統 |
| Webhook | Signature | Stripe/Recur 簽名驗證 |
| Admin API | JWT + Role Check | 需 admin 角色 |

### 3.2 環境變數

```bash
# 現有
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# 需新增
RECUR_SECRET_KEY=sk_...          # Recur 私鑰
RECUR_PUBLISHABLE_KEY=pk_...     # Recur 公鑰
RECUR_WEBHOOK_SECRET=...         # Recur Webhook 簽名
SEO_SERVICE_TOKEN=...            # 官網呼叫後端 API 的 Token

# Stripe 商家訂閱 Price ID
STRIPE_MERCHANT_PRO_PRICE_ID=price_...
STRIPE_MERCHANT_PREMIUM_PRICE_ID=price_...
STRIPE_PLACE_PRO_PRICE_ID=price_...
STRIPE_PLACE_PREMIUM_PRICE_ID=price_...

# Recur 商家訂閱 Product ID
RECUR_MERCHANT_PRO_PRODUCT_ID=prod_...
RECUR_MERCHANT_PREMIUM_PRODUCT_ID=prod_...
RECUR_PLACE_PRO_PRODUCT_ID=prod_...
RECUR_PLACE_PREMIUM_PRODUCT_ID=prod_...
```

---

## 📅 實作步驟

### Phase 1：資料結構與 API（後端）
1. [ ] 新增 `seo_itineraries` 資料表（含 regionId/districtId 關聯）
2. [ ] 新增 `merchant_subscriptions` 資料表
3. [ ] 新增 `merchant_place_subscriptions` 資料表
4. [ ] 修改 `merchants` 表：`subscriptionTier` → `merchantTier`
5. [ ] 實作 SEO API 端點（含 ISR 觸發）
6. [ ] 實作商家訂閱 API 端點
7. [ ] 完善 Stripe/Recur Webhook 處理
8. [ ] 建立權限限制 Helper（`server/lib/merchantPermissions.ts`）

### Phase 2：AI 內容生成（後端）
1. [ ] 修改 Gemini prompt 生成 SEO 內容
2. [ ] 建立批次生成腳本（`server/scripts/generate-seo-itineraries.ts`）
3. [ ] 實作內容審核機制
4. [ ] 實作 ISR 重新驗證觸發函式

### Phase 3：官方網站開發（前端 - Next.js 15）
1. [ ] 建立 Next.js 15 專案（App Router）
2. [ ] 實作 SEO 頁面（SSG/ISR + Schema.org JSON-LD）
3. [ ] 實作 `/api/revalidate` 路由（On-Demand ISR）
4. [ ] 實作商家訂閱購買頁面
5. [ ] 整合 Stripe/Recur 結帳（含國家偵測）
6. [ ] 動態 sitemap.xml 生成

### Phase 4：App 權限同步
1. [ ] 實作 Socket.io 權限推送事件
2. [ ] App 端監聽 `subscription:updated` 事件
3. [ ] 功能權限控制邏輯（商家等級 + 行程卡等級）
4. [ ] 刷新商家 session 機制

---

## ✅ 待用戶確認事項

1. **官網技術選擇**：建議 Next.js 15 App Router，是否同意？
2. **權限同步方式**：建議 Socket.io（已有基礎設施），是否同意？
3. **Recur 帳號**：是否已有 Recur 商家帳號與 API Key？
4. **Stripe Price ID**：需要在 Stripe Dashboard 建立以下訂閱商品：
   - 商家 Pro（$299/月）
   - 商家 Premium（$799/月）
   - 行程卡 Pro（$199/月）
   - 行程卡 Premium（$399/月）
5. **SEO 內容審核**：AI 生成後是否需要人工審核再發布？
6. **官網域名**：預計使用 mibu.tw 或其他域名？

## 🔗 系統串連圖

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              用戶旅程                                         │
└──────────────────────────────────────────────────────────────────────────────┘

【SEO 流程】
Google 搜尋「台北美食」
        ↓
  ┌─────────────────┐
  │ 官網 SEO 頁面    │ ← ISR/SSG 生成
  │ /itinerary/xxx  │
  └────────┬────────┘
           ↓
    下載 Mibu App
           ↓
  ┌─────────────────┐
  │ App 行程扭蛋    │
  └─────────────────┘

【商家訂閱流程】
商家登入官網
        ↓
  ┌─────────────────┐
  │ 官網訂閱頁面    │
  │ /merchant/sub   │
  └────────┬────────┘
           ↓
  ┌─────────────────┐         ┌─────────────────┐
  │ Stripe (海外)   │   或    │ Recur (台灣)    │
  └────────┬────────┘         └────────┬────────┘
           ↓                           ↓
  ┌─────────────────────────────────────────────┐
  │ 後端 Webhook                                 │
  │ POST /api/webhooks/stripe                    │
  │ POST /api/webhooks/recur                     │
  └────────────────────┬────────────────────────┘
                       ↓
  ┌─────────────────────────────────────────────┐
  │ 更新 merchant_subscriptions                  │
  │ 更新 merchants.merchantTier                  │
  └────────────────────┬────────────────────────┘
                       ↓
  ┌─────────────────────────────────────────────┐
  │ Socket.io 推送 subscription:updated          │
  └────────────────────┬────────────────────────┘
                       ↓
  ┌─────────────────────────────────────────────┐
  │ Expo App 刷新商家權限                        │
  │ 解鎖數據分析、更多行程卡、更多優惠券等級     │
  └─────────────────────────────────────────────┘
```

---

## 📝 Changelog

| 日期 | 版本 | 變更內容 |
|------|------|---------|
| 2026-01-05 | 1.0 | 初版設計藍圖 |

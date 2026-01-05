# Mibu 官網功能設計藍圖
> **版本**: 1.0 | **建立日期**: 2026-01-05 | **狀態**: 待審核

---

## 📋 專案概述

### 現有架構
| 系統 | 技術棧 | 位置 | 現況 |
|------|--------|------|------|
| **後端** | Node.js + Express + Drizzle ORM + PostgreSQL | 本專案 (Replit) | 主要開發中 |
| **App 前端** | Expo + React Native + NativeWind | 另一 Replit 專案 | 已開發 |
| **官方網站** | Replit（待確認框架） | 另一 Replit 專案 | **已建立**，目前僅有隱私權政策、使用條款 |

### 功能目標
1. **程式化 SEO** - 讓 Google 爬蟲搜尋「某地 景點/美食/行程」時，能找到 Mibu 官網
2. **商家訂閱制** - 商家在官網購買訂閱，權限即時同步至 App

---

## 🎯 功能一：程式化 SEO

### 1.1 核心概念

**直接沿用現有 `gacha_ai_logs.aiReason`**（AI 排序理由），轉換為 SEO 友善的行程介紹頁面。

- **不需重新生成長文章**，現有 AI 理由已經足夠
- **聚合頁 + 子頁結構**，讓 Google 爬蟲能索引所有內容
- **標題自動帶入七大類關鍵字**

```
目標關鍵字範例：
- 「台南東區一日遊｜美食、景點、購物精選路線」
- 「台中北區一日遊｜美食、景點、購物精選路線」
```

### 1.2 資料來源

現有 `gacha_ai_logs` 表已儲存所需資料：

| 欄位 | 用途 |
|------|------|
| `city` | 城市（如「台南市」） |
| `district` | 區域（如「東區」） |
| `aiReason` | **AI 排序理由** → 直接作為行程介紹 |
| `orderedPlaceIds` | 排序後景點 ID → 顯示景點卡片 |
| `categoryDistribution` | 分類分佈 → 自動生成標題關鍵字 |

**範例 aiReason**：
> 「行程集中於台南東區。早晨先至後甲圓環享用在地虱目魚早餐，接著到鄰近的小東公園散步。下午安排DIY手作體驗...」

### 1.3 資料流程

```
┌─────────────────────────────────────────────────────────────────┐
│  用戶在 App 扭蛋                                                 │
│         ↓                                                       │
│  gacha_ai_logs 儲存（現有流程）                                  │
│  ├── city, district                                             │
│  ├── aiReason（AI 排序理由）                                    │
│  ├── orderedPlaceIds                                            │
│  └── categoryDistribution                                       │
│         ↓                                                       │
│  【新增】同步到 seo_itineraries                                  │
│  ├── 自動生成 title（帶七大類關鍵字）                            │
│  ├── 自動生成 slug                                              │
│  └── 歸類到對應聚合頁                                           │
└─────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────┐
│  官方網站 (Next.js)                                              │
│                                                                  │
│  聚合頁：/itinerary/tainan-east                                  │
│  ├── 標題：台南東區一日遊｜美食、景點、購物精選路線               │
│  └── 多個行程卡片預覽 → 連結到子頁                               │
│                                                                  │
│  子頁：/itinerary/tainan-east/v001                               │
│  ├── AI 介紹（aiReason）                                         │
│  ├── 景點卡片（沿用 App 樣式）                                   │
│  └── 不放商家 CTA（保持純淨）                                    │
│                                                                  │
│  ┌─────────────┐   ┌─────────────────────────┐                  │
│  │ sitemap.xml │ + │ Schema.org JSON-LD      │                  │
│  └─────────────┘   └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.4 頁面結構

| 類型 | URL 範例 | 內容 |
|------|----------|------|
| **聚合頁** | `/itinerary/tainan-east` | 台南東區所有行程總覽 |
| **子頁** | `/itinerary/tainan-east/v001` | 單一行程詳情 |

### 1.5 標題自動生成邏輯

根據 `categoryDistribution` 取前 3 個分類：

```javascript
// 輸入：{ 美食: 3, 景點: 1, 購物: 1 }
// 輸出：「台南東區一日遊｜美食、景點、購物精選路線」

function generateTitle(city, district, categoryDistribution) {
  const topCategories = Object.entries(categoryDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat)
    .join('、');
  
  return `${city}${district}一日遊｜${topCategories}精選路線`;
}
```

### 1.6 Slug 生成規則

| 城市 | 區域 | 聚合頁 slug | 子頁 slug |
|------|------|-------------|-----------|
| 台南市 | 東區 | `tainan-east` | `tainan-east/v001` |
| 台中市 | 北區 | `taichung-north` | `taichung-north/v002` |

### 1.7 商家 SEO 策略

**行程頁保持純淨**，不放商家 CTA（避免用戶誤以為推薦付費商家）。

商家 SEO 靠獨立頁面：

| 頁面 | URL | 目標關鍵字 |
|------|-----|-----------|
| 商家合作頁 | `/for-business` | 旅遊行銷、店家曝光、Mibu 合作 |

行程頁只在 **Footer** 放「我是商家」連結。

### 1.8 同步觸發時機

- **自動觸發**：每次扭蛋完成後
- **自動發布**：不需人工審核
- **條件過濾**：只同步有完整 aiReason 的記錄

### 1.9 `seo_itineraries` 資料表

```typescript
// shared/schema.ts 新增
export const seoItineraries = pgTable("seo_itineraries", {
  id: serial("id").primaryKey(),
  
  // 關聯 gacha_ai_logs
  gachaSessionId: varchar("gacha_session_id", { length: 36 }).notNull(),
  
  // 地區資訊（從 gacha_ai_logs 同步）
  city: text("city").notNull(),
  district: text("district"),
  
  // SEO 內容（自動生成）
  slug: text("slug").notNull(),               // 子頁 slug: "tainan-east/v001"
  parentSlug: text("parent_slug").notNull(),  // 聚合頁 slug: "tainan-east"
  title: text("title").notNull(),             // 自動生成標題
  metaDescription: text("meta_description"),
  
  // 內容（從 gacha_ai_logs.aiReason 同步）
  itineraryIntro: text("itinerary_intro").notNull(),
  
  // 景點資訊
  placeIds: integer("place_ids").array(),
  categoryDistribution: jsonb("category_distribution"),
  
  // 狀態（自動發布）
  status: text("status").default("published"),
  publishedAt: timestamp("published_at").defaultNow(),  // 發布時間（自動設定）
  
  // 時間戳
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### 1.10 官網頁面結構

```
/                                    # 首頁
/itinerary                           # 所有城市列表
/itinerary/[parentSlug]              # 聚合頁：如 /itinerary/tainan-east
/itinerary/[parentSlug]/[version]    # 子頁：如 /itinerary/tainan-east/v001

/for-business                        # 商家合作頁（獨立 SEO）

/sitemap.xml                         # 動態 Sitemap
/robots.txt                          # 爬蟲規則
```

### 1.11 API 端點

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/seo/itineraries | 列出所有已發布行程 |
| GET | /api/seo/itineraries/:parentSlug | 取得聚合頁下所有子頁 |
| GET | /api/seo/itineraries/:parentSlug/:version | 取得單一子頁 |
| GET | /api/seo/sitemap | 取得 Sitemap 資料 |

### 1.12 同步邏輯與 ISR 重新驗證

#### 1.12.1 去重機制（SEO 內容品質控制）

同區域景點重複率 > 70% 時跳過同步，確保每個聚合頁下的子頁內容有差異性。

```typescript
// 計算景點重複率
function calculatePlaceOverlap(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(x => setB.has(x));
  const smaller = Math.min(a.length, b.length);
  return smaller === 0 ? 0 : intersection.length / smaller;
}

// 檢查是否為重複內容
async function isDuplicateContent(
  parentSlug: string, 
  placeIds: number[]
): Promise<boolean> {
  const existing = await db.query.seoItineraries.findMany({
    where: eq(seoItineraries.parentSlug, parentSlug),
  });
  
  for (const item of existing) {
    const overlap = calculatePlaceOverlap(item.placeIds || [], placeIds);
    if (overlap > 0.7) return true; // 70% 以上景點重複，視為重複
  }
  
  return false;
}
```

#### 1.12.2 Slug 併發安全機制

**資料表約束**：
```sql
-- 確保 slug 唯一
CREATE UNIQUE INDEX idx_seo_itineraries_slug ON seo_itineraries(slug);

-- 確保 gachaSessionId 唯一（避免同一扭蛋重複同步）
CREATE UNIQUE INDEX idx_seo_itineraries_session ON seo_itineraries(gacha_session_id);
```

**交易鎖定**：
```typescript
// 使用資料庫交易 + 序列化隔離確保版本號不衝突
async function getNextVersionSafe(parentSlug: string): Promise<number> {
  return await db.transaction(async (tx) => {
    const latest = await tx.query.seoItineraries.findFirst({
      where: eq(seoItineraries.parentSlug, parentSlug),
      orderBy: desc(seoItineraries.createdAt),
    });
    
    // 解析現有版本號
    if (!latest) return 1;
    const match = latest.slug.match(/v(\d+)$/);
    return match ? parseInt(match[1]) + 1 : 1;
  }, { isolationLevel: 'serializable' });
}
```

#### 1.12.3 完整同步流程（含自動 ISR 觸發）

```typescript
// 扭蛋完成後自動同步
async function syncToSeoItineraries(gachaLog: GachaAiLog) {
  // 1. 只同步有 aiReason 的記錄
  if (!gachaLog.aiReason) return;
  
  const parentSlug = generateParentSlug(gachaLog.city, gachaLog.district);
  
  // 2. 去重檢查：同區域景點重複率 > 70% 則跳過
  const isDuplicate = await isDuplicateContent(parentSlug, gachaLog.orderedPlaceIds);
  if (isDuplicate) {
    console.log(`Skipped: ${parentSlug} - duplicate content (>70% overlap)`);
    return;
  }
  
  // 3. 使用交易確保版本號不衝突
  const version = await getNextVersionSafe(parentSlug);
  const slug = `${parentSlug}/v${version.toString().padStart(3, '0')}`;
  
  // 4. 自動生成標題
  const title = generateTitle(
    gachaLog.city, 
    gachaLog.district, 
    gachaLog.categoryDistribution
  );
  
  // 5. 存入 seo_itineraries
  await db.insert(seoItineraries).values({
    gachaSessionId: gachaLog.sessionId,
    city: gachaLog.city,
    district: gachaLog.district,
    slug,
    parentSlug,
    title,
    itineraryIntro: gachaLog.aiReason,
    placeIds: gachaLog.orderedPlaceIds,
    categoryDistribution: gachaLog.categoryDistribution,
    status: 'published',
  });
  
  // 6. 【重要】自動觸發 ISR 重新驗證
  await triggerISRRevalidation(slug, parentSlug);
}

// Slug 生成（城市+區域 → 英文）
function generateParentSlug(city: string, district?: string): string {
  const cityMap: Record<string, string> = {
    '台南市': 'tainan', '台中市': 'taichung', '台北市': 'taipei', ...
  };
  const districtMap: Record<string, string> = {
    '東區': 'east', '北區': 'north', '大安區': 'daan', ...
  };
  
  const citySlug = cityMap[city] || city;
  const districtSlug = district ? districtMap[district] || district : '';
  
  return districtSlug ? `${citySlug}-${districtSlug}` : citySlug;
}
```

#### 1.12.4 ISR 重新驗證函式

```typescript
const triggerISRRevalidation = async (slug: string, parentSlug: string) => {
  const OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL;
  const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;
  
  if (!OFFICIAL_SITE_URL) return; // 開發環境可跳過
  
  try {
    await fetch(`${OFFICIAL_SITE_URL}/api/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Revalidate-Secret': REVALIDATE_SECRET,
      },
      body: JSON.stringify({
        paths: [
          `/itinerary/${slug}`,          // 子頁
          `/itinerary/${parentSlug}`,    // 聚合頁
          '/itinerary',                  // 城市列表頁
          '/sitemap.xml',                // Sitemap
        ],
      }),
    });
  } catch (error) {
    console.error('ISR revalidation failed:', error);
    // 不中斷主流程，ISR 失敗時頁面仍會在 revalidate 時間後自動更新
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

> **重要**：沿用現有 `merchants.merchantLevel` 欄位控制商家等級

#### 修改 `merchants` 表（新增 3 個欄位）
```typescript
// 沿用現有欄位：merchantLevel: varchar("merchant_level", { length: 20 }).default('free')
// 新增欄位：
merchantLevelExpiresAt: timestamp("merchant_level_expires_at"),
stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
recurCustomerId: varchar("recur_customer_id", { length: 255 }),
```

#### 修改 `places` 表（新增 2 個欄位）
```typescript
// 行程卡等級（直接存於 places 表，無需額外表）
placeCardTier: varchar("place_card_tier", { length: 20 }).default('free'),
placeCardTierExpiresAt: timestamp("place_card_tier_expires_at"),
```

#### 新增 `merchant_subscriptions` 表
```typescript
export const merchantSubscriptions = pgTable("merchant_subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  
  // 訂閱類型
  type: varchar("type", { length: 20 }).notNull(), // 'merchant' | 'place'
  tier: varchar("tier", { length: 20 }).notNull(), // 'pro' | 'premium'
  placeId: integer("place_id").references(() => places.id), // null for merchant subscription
  
  // 金流資訊
  provider: varchar("provider", { length: 20 }).notNull(), // 'stripe' | 'recur'
  providerSubscriptionId: varchar("provider_subscription_id", { length: 255 }).notNull(),
  providerCustomerId: varchar("provider_customer_id", { length: 255 }),
  
  // 狀態
  status: varchar("status", { length: 20 }).default("active").notNull(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  scheduledDowngradeTo: varchar("scheduled_downgrade_to", { length: 20 }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  
  // 價格
  amount: integer("amount"),
  currency: varchar("currency", { length: 10 }).default("TWD"),
  lastPaymentIntentId: varchar("last_payment_intent_id", { length: 255 }),
  
  // 時間戳
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 2.3 金流整合架構

**重要：金流由用戶自行選擇，非自動導向**

```
┌─────────────────────────────────────────────────────────────────┐
│  官方網站 (Replit)                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 訂閱購買頁面                                             │   │
│  │                                                          │   │
│  │  選擇付款方式：                                          │   │
│  │  ┌─────────────────┐    ┌─────────────────┐             │   │
│  │  │  💳 信用卡       │    │  🏦 台灣在地    │             │   │
│  │  │  (Stripe)       │    │  (Recur/PAYUNi) │             │   │
│  │  └─────────────────┘    └─────────────────┘             │   │
│  │          ↓                      ↓                        │   │
│  │      用戶自行點選要使用的付款方式                         │   │
│  └──────────────────────────┬──────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              ↓
┌─────────────────────────────┼───────────────────────────────────┐
│  金流服務（用戶選擇）        │                                   │
│  ┌────────────────┐    ┌────┴────────────┐                      │
│  │ Stripe         │    │ Recur (PAYUNi)  │                      │
│  │ (信用卡)       │    │ (台灣在地支付)  │                      │
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
│  │ - 更新 merchants.merchantLevel             │                  │
│  └──────────────────────┬────────────────────┘                  │
│                         ↓                                       │
│  ┌───────────────────────────────────────────┐                  │
│  │ 權限同步機制                               │                  │
│  │ - Socket.io 即時推送                       │                  │
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
  merchantLevel: 'pro',
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

## 🔄 資料庫遷移計畫

### 4.1 現況分析

經程式碼掃描確認 `merchants` 表已有欄位：
- `subscriptionPlan`: text, default 'free' — 舊欄位，保留向下相容
- `merchantLevel`: varchar(20), default 'free' — **沿用此欄位控制商家等級**

### 4.2 需新增的欄位

```sql
-- merchants 表新增欄位（沿用 merchantLevel）
ALTER TABLE merchants ADD COLUMN merchant_level_expires_at TIMESTAMP;
ALTER TABLE merchants ADD COLUMN stripe_customer_id VARCHAR(255);
ALTER TABLE merchants ADD COLUMN recur_customer_id VARCHAR(255);

-- places 表新增欄位（行程卡等級）
ALTER TABLE places ADD COLUMN place_card_tier VARCHAR(20) DEFAULT 'free';
ALTER TABLE places ADD COLUMN place_card_tier_expires_at TIMESTAMP;
```

### 4.3 遷移步驟

| 步驟 | 動作 | 風險 |
|------|------|------|
| 1 | 新增 `seo_itineraries` 表 | 無（新表） |
| 2 | 新增 `merchant_subscriptions` 表 | 無（新表） |
| 3 | `merchants` 表新增 3 個欄位 | 低（純新增，有預設值） |
| 4 | `places` 表新增 2 個欄位 | 低（純新增，有預設值） |
| 5 | 執行 `npm run db:push` | 低（安全同步） |
| 6 | 部署新 API 端點 | 低（新端點不影響現有功能） |
| 7 | 啟用 Webhook 處理 | 中（需測試金流） |

### 4.4 回滾方案

若出現問題：
```sql
-- 回滾：移除新增的欄位
ALTER TABLE merchants DROP COLUMN merchant_level_expires_at;
ALTER TABLE merchants DROP COLUMN stripe_customer_id;
ALTER TABLE merchants DROP COLUMN recur_customer_id;
ALTER TABLE places DROP COLUMN place_card_tier;
ALTER TABLE places DROP COLUMN place_card_tier_expires_at;

-- 回滾：刪除新表
DROP TABLE IF EXISTS merchant_subscriptions;
DROP TABLE IF EXISTS seo_itineraries;
```

---

## 🔁 訂閱生命週期

### 5.1 訂閱狀態流程

```
                    ┌─────────────┐
                    │   建立訂閱   │
                    │  (checkout) │
                    └──────┬──────┘
                           ↓
           ┌───────────────┴───────────────┐
           ↓                               ↓
    ┌─────────────┐                 ┌─────────────┐
    │ 付款成功    │                 │ 付款失敗    │
    │ → active    │                 │ → cancelled │
    └──────┬──────┘                 └─────────────┘
           ↓
    ┌─────────────┐
    │  正常使用   │
    └──────┬──────┘
           │
     ┌─────┼─────┬─────────┬────────────┐
     ↓     ↓     ↓         ↓            ↓
┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐
│ 自動續約│ │ 升級   │ │ 降級   │ │ 取消續約 │ │ 到期   │
│→ active│ │→ active│ │→ active│ │→ canceling│ │→ expired│
└────────┘ └────────┘ └────────┘ └──────────┘ └────────┘
```

### 5.2 狀態定義

| 狀態 | 說明 | 權限 |
|------|------|------|
| `active` | 訂閱有效 | 完整權限 |
| `past_due` | 付款失敗，寬限期 | 完整權限（3 天寬限） |
| `canceling` | 已取消續約，期限內仍有效 | 完整權限至到期日 |
| `expired` | 已到期 | 降為 Free 權限 |
| `cancelled` | 已取消（立即失效） | 降為 Free 權限 |

### 5.3 雙金流 Webhook 事件映射表

> **統一處理**：Stripe 和 Recur 的事件名稱不同，需透過此映射表轉換為統一的訂閱狀態

| Stripe 事件 | Recur 事件 | 統一動作 | 結果狀態 |
|------------|-----------|---------|---------|
| `checkout.session.completed` | `checkout.completed` | 訂閱建立成功 | `active` |
| `invoice.paid` | `payment.success` | 續約成功 | `active` |
| `invoice.payment_failed` | `payment.failed` | 續約失敗 | `past_due` |
| `customer.subscription.updated` | `subscription.updated` | 方案變更 | 依新方案 |
| `customer.subscription.deleted` | `subscription.cancelled` | 訂閱取消 | `cancelled` |
| - | `subscription.expired` | 訂閱到期 | `expired` |

```typescript
// 統一 Webhook 處理入口
type WebhookEvent = {
  provider: 'stripe' | 'recur';
  eventType: string;
  subscriptionId: string;
  data: any;
};

async function handleWebhookEvent(event: WebhookEvent) {
  // 映射到統一動作
  const actionMap: Record<string, Record<string, string>> = {
    stripe: {
      'checkout.session.completed': 'subscription_created',
      'invoice.paid': 'renewal_success',
      'invoice.payment_failed': 'payment_failed',
      'customer.subscription.updated': 'subscription_updated',
      'customer.subscription.deleted': 'subscription_cancelled',
    },
    recur: {
      'checkout.completed': 'subscription_created',
      'payment.success': 'renewal_success',
      'payment.failed': 'payment_failed',
      'subscription.updated': 'subscription_updated',
      'subscription.cancelled': 'subscription_cancelled',
      'subscription.expired': 'subscription_expired',
    },
  };
  
  const action = actionMap[event.provider]?.[event.eventType];
  if (!action) return;
  
  switch (action) {
    case 'subscription_created':
      await handleSubscriptionCreated(event);
      break;
    case 'renewal_success':
      await handleRenewalSuccess(event.subscriptionId, event.provider);
      break;
    case 'payment_failed':
      await handlePaymentFailed(event.subscriptionId, event.provider);
      break;
    case 'subscription_updated':
      await handleSubscriptionUpdated(event);
      break;
    case 'subscription_cancelled':
    case 'subscription_expired':
      await handleSubscriptionEnded(event.subscriptionId, event.provider, action);
      break;
  }
  
  // 所有狀態變更後，通知 App 同步權限
  await notifyAppPermissionChange(event.subscriptionId);
}
```

### 5.4 生命週期事件處理

> **欄位對應**：使用現有 `merchants.merchantLevel` 欄位（非新增 merchantTier）

#### 自動續約成功
```typescript
// Webhook: invoice.paid (Stripe) / payment.success (Recur)
async function handleRenewalSuccess(providerSubscriptionId: string, provider: 'stripe' | 'recur') {
  const subscription = await db.query.merchantSubscriptions.findFirst({
    where: and(
      eq(merchantSubscriptions.providerSubscriptionId, providerSubscriptionId),
      eq(merchantSubscriptions.provider, provider),
    ),
  });
  
  if (!subscription) return;
  
  await db.update(merchantSubscriptions)
    .set({
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
      updatedAt: new Date(),
    })
    .where(eq(merchantSubscriptions.id, subscription.id));
}
```

#### 續約失敗
```typescript
// Webhook: invoice.payment_failed
async function handlePaymentFailed(providerSubscriptionId: string, provider: 'stripe' | 'recur') {
  const subscription = await db.query.merchantSubscriptions.findFirst({
    where: and(
      eq(merchantSubscriptions.providerSubscriptionId, providerSubscriptionId),
      eq(merchantSubscriptions.provider, provider),
    ),
  });
  
  if (!subscription) return;
  
  await db.update(merchantSubscriptions)
    .set({ status: 'past_due', updatedAt: new Date() })
    .where(eq(merchantSubscriptions.id, subscription.id));
  
  // 設定 3 天寬限期
  const graceDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  
  // 發送通知給商家（透過現有通知系統）
  await storage.createNotification({
    userId: subscription.merchantId.toString(), // 需轉換為 user 關聯
    type: 'payment_failed',
    title: '付款失敗',
    body: `您的訂閱付款失敗，請在 ${graceDeadline.toLocaleDateString('zh-TW')} 前更新付款方式`,
  });
}
```

#### 升級方案
```typescript
// API: POST /api/merchant/subscription/upgrade
async function upgradeSubscription(merchantId: number, newLevel: 'pro' | 'premium', provider: 'stripe' | 'recur') {
  // 1. 使用資料庫交易確保原子性
  await db.transaction(async (tx) => {
    // 2. 更新商家等級
    await tx.update(merchants)
      .set({ 
        merchantLevel: newLevel,
        merchantLevelExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(merchants.id, merchantId));
    
    // 3. 更新訂閱記錄
    await tx.update(merchantSubscriptions)
      .set({ 
        tier: newLevel, 
        updatedAt: new Date() 
      })
      .where(eq(merchantSubscriptions.merchantId, merchantId));
  });
  
  // 4. 推送權限更新
  io.to(`merchant:${merchantId}`).emit('subscription:updated', { merchantLevel: newLevel });
}
```

#### 降級方案
```typescript
// 降級在當期結束後生效（避免用戶損失已付費權益）
async function downgradeSubscription(merchantId: number, newLevel: 'free' | 'pro') {
  const subscription = await db.query.merchantSubscriptions.findFirst({
    where: eq(merchantSubscriptions.merchantId, merchantId),
  });
  
  if (!subscription) return;
  
  // 記錄待降級，不立即生效
  await db.update(merchantSubscriptions)
    .set({ 
      scheduledDowngradeTo: newLevel,
      updatedAt: new Date(),
    })
    .where(eq(merchantSubscriptions.id, subscription.id));
  
  // 到期處理排程會檢查此欄位
}
```

#### 到期處理（排程任務）
```typescript
// 每小時執行一次：server/scripts/process-expired-subscriptions.ts
async function processExpiredSubscriptions() {
  const now = new Date();
  const gracePeriodEnd = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 天前
  
  // 1. 處理超過寬限期的 past_due 訂閱
  const pastDueExpired = await db.query.merchantSubscriptions.findMany({
    where: and(
      eq(merchantSubscriptions.status, 'past_due'),
      lt(merchantSubscriptions.updatedAt, gracePeriodEnd),
    ),
  });
  
  for (const sub of pastDueExpired) {
    await db.transaction(async (tx) => {
      await tx.update(merchantSubscriptions)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(merchantSubscriptions.id, sub.id));
      
      await tx.update(merchants)
        .set({ merchantLevel: 'free', merchantLevelExpiresAt: null, updatedAt: now })
        .where(eq(merchants.id, sub.merchantId));
    });
    
    io.to(`merchant:${sub.merchantId}`).emit('subscription:updated', { merchantLevel: 'free' });
  }
  
  // 2. 處理已到期的 active 訂閱
  const activeExpired = await db.query.merchantSubscriptions.findMany({
    where: and(
      eq(merchantSubscriptions.status, 'active'),
      lt(merchantSubscriptions.currentPeriodEnd, now),
    ),
  });
  
  for (const sub of activeExpired) {
    const newLevel = sub.scheduledDowngradeTo || 'free';
    
    await db.transaction(async (tx) => {
      await tx.update(merchantSubscriptions)
        .set({ status: 'expired', scheduledDowngradeTo: null, updatedAt: now })
        .where(eq(merchantSubscriptions.id, sub.id));
      
      await tx.update(merchants)
        .set({ merchantLevel: newLevel, merchantLevelExpiresAt: null, updatedAt: now })
        .where(eq(merchants.id, sub.merchantId));
    });
    
    io.to(`merchant:${sub.merchantId}`).emit('subscription:updated', { merchantLevel: newLevel });
  }
}
```

### 5.4 金流切換處理

商家想從 Stripe 換成 Recur（或反過來）：

```typescript
// 不支援自動切換，用戶須手動操作
// 流程：取消現有訂閱 → 等到期 → 用新金流重新訂閱

// API: POST /api/merchant/subscription/cancel
async function cancelSubscription(merchantId: number, options: { atPeriodEnd: boolean }) {
  const subscription = await db.query.merchantSubscriptions.findFirst({
    where: eq(merchantSubscriptions.merchantId, merchantId),
  });
  
  if (!subscription) throw new Error('No active subscription');
  
  if (options.atPeriodEnd) {
    // 標記為取消中，到期自動失效
    await db.update(merchantSubscriptions)
      .set({ status: 'canceling', updatedAt: new Date() })
      .where(eq(merchantSubscriptions.id, subscription.id));
    
    // 在 Stripe/Recur 設定到期後不續約
    if (subscription.provider === 'stripe') {
      await stripe.subscriptions.update(subscription.providerSubscriptionId, {
        cancel_at_period_end: true,
      });
    }
  } else {
    // 立即取消
    await db.transaction(async (tx) => {
      await tx.update(merchantSubscriptions)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(merchantSubscriptions.id, subscription.id));
      
      await tx.update(merchants)
        .set({ merchantLevel: 'free', merchantLevelExpiresAt: null })
        .where(eq(merchants.id, merchantId));
    });
  }
}
```

### 5.5 退款處理

```typescript
// Admin API: POST /api/admin/subscription/refund
async function refundSubscription(subscriptionId: number, reason: string) {
  const sub = await db.query.merchantSubscriptions.findFirst({
    where: eq(merchantSubscriptions.id, subscriptionId),
  });
  
  if (!sub) throw new Error('Subscription not found');
  
  if (sub.provider === 'stripe' && sub.lastPaymentIntentId) {
    // Stripe 自動退款
    await stripe.refunds.create({
      payment_intent: sub.lastPaymentIntentId,
      reason: 'requested_by_customer',
    });
  } else {
    // Recur 退款需人工處理
    // 記錄退款請求，通知管理員
    console.log(`[REFUND REQUEST] subscriptionId=${subscriptionId}, reason=${reason}`);
  }
  
  // 立即取消權限
  await db.transaction(async (tx) => {
    await tx.update(merchants)
      .set({ merchantLevel: 'free', merchantLevelExpiresAt: null })
      .where(eq(merchants.id, sub.merchantId));
    
    await tx.update(merchantSubscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(merchantSubscriptions.id, subscriptionId));
  });
  
  io.to(`merchant:${sub.merchantId}`).emit('subscription:updated', { merchantLevel: 'free' });
}

---

## 🔗 資料模型統一方案

### 6.1 最終決策

採用**方案 A**：直接在 `places` 表新增欄位，不額外新增 `merchant_place_subscriptions` 表。

| 表名 | 用途 | 狀態 |
|------|------|------|
| `merchants` | 商家資料 + 商家等級（`merchantLevel`） | **現有 + 新增欄位** |
| `merchant_place_links` | 商家認領景點的關聯 | **現有** |
| `places` | 景點資料 + 行程卡等級（`placeCardTier`） | **現有 + 新增欄位** |
| `merchant_subscriptions` | 訂閱交易紀錄 | **新增** |

### 6.2 關係設計

```
merchants (1) ─────────────────────────────────────────────┐
    │                                                      │
    │ merchantLevel (free/pro/premium)                     │
    │ merchantLevelExpiresAt                               │
    │ stripeCustomerId / recurCustomerId                   │
    │                                                      │
    ↓                                                      ↓
merchant_place_links (N)                    merchant_subscriptions (N)
    │ (已認領的景點)                               │ (付款紀錄)
    │                                              │
    ↓                                              │
places (1)                                         │
    │                                              │
    │ merchantId ←─────────────────────────────────┘
    │ placeCardTier (free/pro/premium)
    │ placeCardTierExpiresAt
```

### 6.3 欄位定義

```typescript
// shared/schema.ts - merchants 表新增欄位
merchantLevelExpiresAt: timestamp("merchant_level_expires_at"),
stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
recurCustomerId: varchar("recur_customer_id", { length: 255 }),

// shared/schema.ts - places 表新增欄位
placeCardTier: varchar("place_card_tier", { length: 20 }).default('free'),
placeCardTierExpiresAt: timestamp("place_card_tier_expires_at"),

// shared/schema.ts - merchant_subscriptions 表（新增）
export const merchantSubscriptions = pgTable("merchant_subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'merchant' | 'place'
  tier: varchar("tier", { length: 20 }).notNull(), // 'pro' | 'premium'
  placeId: integer("place_id").references(() => places.id), // null for merchant subscription
  provider: varchar("provider", { length: 20 }).notNull(), // 'stripe' | 'recur'
  providerSubscriptionId: varchar("provider_subscription_id", { length: 255 }).notNull(),
  providerCustomerId: varchar("provider_customer_id", { length: 255 }),
  status: varchar("status", { length: 20 }).default('active').notNull(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  scheduledDowngradeTo: varchar("scheduled_downgrade_to", { length: 20 }),
  lastPaymentIntentId: varchar("last_payment_intent_id", { length: 255 }),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 6.4 優點

- 查詢簡單，不需 JOIN
- 與現有 `merchantId` 欄位邏輯一致
- 減少表數量，降低維護成本

---

## 📝 SEO 內容管理策略

### 7.1 去重邏輯

每個 **區域 + 分類** 組合只產生一篇文章：

```sql
-- 使用 COALESCE 處理 NULL district（避免 NULL 繞過唯一索引）
CREATE UNIQUE INDEX idx_seo_itineraries_unique 
ON seo_itineraries (region_id, COALESCE(district_id, 0), category);
```

```typescript
// 生成前檢查
async function generateSeoItinerary(regionId: number, districtId: number | null, category: string) {
  const existing = await db.query.seoItineraries.findFirst({
    where: and(
      eq(seoItineraries.regionId, regionId),
      districtId ? eq(seoItineraries.districtId, districtId) : isNull(seoItineraries.districtId),
      eq(seoItineraries.category, category),
    ),
  });
  
  if (existing) {
    // 更新現有文章，而非新增
    return updateSeoItinerary(existing.id, newContent);
  }
  
  // 新增文章
  return createSeoItinerary({ regionId, districtId, category, ...newContent });
}
```

### 7.2 版本控制

```typescript
// seo_itineraries 表欄位
version: integer("version").default(1).notNull(),
contentHash: varchar("content_hash", { length: 64 }), // SHA-256 of source data

// 每次更新時遞增版本號
await db.update(seoItineraries)
  .set({ 
    itineraryIntro: newContent,
    version: sql`version + 1`,
    contentHash: crypto.createHash('sha256').update(sourceData).digest('hex'),
    updatedAt: new Date(),
  })
  .where(eq(seoItineraries.id, id));
```

### 7.3 更新觸發條件

| 觸發條件 | 動作 | 實現方式 |
|---------|------|---------|
| 手動觸發（Admin） | 重新生成指定區域的文章 | Admin API |
| 景點資料變更超過 10% | 排程任務自動檢測並重新生成 | 每日排程 |
| 每月定期更新 | 批次重新生成所有文章 | 月初排程 |

#### 10% 資料變更閾值計算

```typescript
// server/scripts/check-seo-regeneration.ts
// 每日 00:00 執行

async function checkAndRegenerateSeoContent() {
  // 1. 取得所有已發布的 SEO 文章
  const seoArticles = await db.query.seoItineraries.findMany({
    where: eq(seoItineraries.status, 'published'),
  });
  
  for (const article of seoArticles) {
    // 2. 計算該區域當前景點資料的 hash
    const currentPlaces = await db.query.places.findMany({
      where: and(
        eq(places.regionId, article.regionId),
        article.districtId 
          ? eq(places.districtId, article.districtId) 
          : sql`1=1`,
        eq(places.category, article.category),
        eq(places.isActive, true),
      ),
      orderBy: asc(places.id), // 確保順序一致
    });
    
    // 3. 計算變更比例
    const currentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(currentPlaces.map(p => p.id)))
      .digest('hex');
    
    if (article.contentHash !== currentHash) {
      // 4. 計算實際變更比例
      const originalPlaceIds = JSON.parse(article.sourcePlaceIds || '[]');
      const currentPlaceIds = currentPlaces.map(p => p.id);
      
      const added = currentPlaceIds.filter(id => !originalPlaceIds.includes(id));
      const removed = originalPlaceIds.filter(id => !currentPlaceIds.includes(id));
      
      const changeRatio = (added.length + removed.length) / Math.max(originalPlaceIds.length, 1);
      
      if (changeRatio >= 0.1) { // 超過 10%
        console.log(`[SEO] Regenerating article ${article.id}: ${changeRatio * 100}% changed`);
        await regenerateSeoItinerary(article.id);
      }
    }
  }
}
```

### 7.4 發布流程

```
AI 生成 → 存入 DB (status=draft) → 人工審核（可選）→ 發布 (status=published) → 觸發 ISR
```

```typescript
// API: POST /api/admin/seo-itineraries/:id/publish
async function publishSeoItinerary(id: number) {
  await db.update(seoItineraries)
    .set({ status: 'published', publishedAt: new Date() })
    .where(eq(seoItineraries.id, id));
  
  // 觸發官網 ISR
  const article = await db.query.seoItineraries.findFirst({
    where: eq(seoItineraries.id, id),
  });
  
  if (article) {
    await triggerIsrRevalidation(article.slug);
  }
}

async function triggerIsrRevalidation(slug: string) {
  const OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL;
  const SEO_SERVICE_TOKEN = process.env.SEO_SERVICE_TOKEN;
  
  await fetch(`${OFFICIAL_SITE_URL}/api/revalidate`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SEO_SERVICE_TOKEN}`,
    },
    body: JSON.stringify({ path: `/itinerary/${slug}` }),
  });
}
```

### 7.5 舊文章處理

| 情境 | 處理方式 | URL 處理 |
|------|---------|---------|
| 內容過時 | 更新 + 保留 URL | 不變（SEO 連續性） |
| 區域停用 | 設為 archived | 301 重導至上級頁面 |
| 重複內容 | 合併至主文章 | 舊 URL 301 重導 |

```typescript
// seo_itineraries.status 欄位值
type SeoStatus = 'draft' | 'published' | 'archived';
```

---

## 📅 實作步驟

### Phase 1：資料結構（後端）
1. [ ] 新增 `seo_itineraries` 資料表
2. [ ] 新增 `merchant_subscriptions` 資料表
3. [ ] `merchants` 表新增 3 個欄位（merchantLevelExpiresAt、stripeCustomerId、recurCustomerId）
4. [ ] `places` 表新增 2 個欄位（placeCardTier、placeCardTierExpiresAt）
5. [ ] 執行 `npm run db:push` 同步資料庫

### Phase 2：訂閱 API（後端）
1. [ ] 實作商家訂閱 API 端點
2. [ ] 完善 Stripe Webhook 處理（訂閱事件）
3. [ ] 完善 Recur Webhook 處理（訂閱事件）
4. [ ] 建立權限限制 Helper（`server/lib/merchantPermissions.ts`）
5. [ ] 實作到期處理排程任務
6. [ ] 實作 Socket.io 權限推送

### Phase 3：SEO API 與內容生成（後端）
1. [ ] 實作 SEO API 端點
2. [ ] 修改 Gemini prompt 生成 SEO 內容
3. [ ] 建立批次生成腳本（`server/scripts/generate-seo-itineraries.ts`）
4. [ ] 實作 ISR 重新驗證觸發函式

### Phase 4：官方網站擴充（前端 - 另一 Replit 專案）
1. [ ] 確認現有框架並規劃擴充方式
2. [ ] 實作 SEO 頁面（SSG/ISR + Schema.org JSON-LD）
3. [ ] 實作商家訂閱購買頁面（用戶自選付款方式）
4. [ ] 整合 Stripe/Recur 結帳
5. [ ] 動態 sitemap.xml 生成
6. [ ] 實作 `/api/revalidate` 路由（On-Demand ISR）

### Phase 5：App 權限同步（Expo 專案）
1. [ ] App 端監聽 `subscription:updated` 事件
2. [ ] 功能權限控制邏輯（商家等級 + 行程卡等級）
3. [ ] 刷新商家 session 機制

---

## ✅ 待用戶確認事項

1. **官網框架**：現有 Replit 官網專案使用什麼框架？需要確認以便規劃擴充方式
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
  │ 官網 SEO 頁面    │ ← SSG/ISR 生成
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
  ┌─────────────────────────────────────────────┐
  │ 官網訂閱頁面 /merchant/subscription          │
  │                                              │
  │  選擇付款方式：                              │
  │  ┌─────────────┐    ┌─────────────┐         │
  │  │ 💳 信用卡   │    │ 🏦 台灣在地 │         │
  │  │  (Stripe)   │    │ (Recur)     │         │
  │  └─────────────┘    └─────────────┘         │
  └────────────────────┬────────────────────────┘
                       ↓
        用戶自行選擇付款方式
                       ↓
  ┌─────────────────┐         ┌─────────────────┐
  │ Stripe          │   或    │ Recur (PAYUNi)  │
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
  │ 更新 merchants.merchantLevel                 │
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
| 2026-01-05 | 1.1 | 修正：金流由用戶自選（非自動導向）、官網為現有 Replit 專案 |
| 2026-01-05 | 1.0 | 初版設計藍圖 |

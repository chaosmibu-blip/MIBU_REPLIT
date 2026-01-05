# 程式化 SEO 藍圖
> **版本**: 1.0 | **建立日期**: 2026-01-05 | **狀態**: 待實作

---

## 📋 專案概述

### 功能目標
讓 Google 爬蟲搜尋「某地 景點/美食/行程」時，能找到 Mibu 官網，自動將扭蛋產生的 AI 行程轉換為 SEO 友善的網頁。

### 技術架構
| 系統 | 技術棧 | 職責 |
|------|--------|------|
| **後端** | Node.js + Express + Drizzle ORM | 同步邏輯、API 端點 |
| **官網** | Next.js 15 + ISR | SEO 頁面渲染 |

---

## ✅ 完成後功能清單

### 對外可見成果

| 功能 | 說明 | 範例 |
|------|------|------|
| **聚合頁** | 每個城市/區域一個總覽頁 | `/itinerary/tainan-east` 顯示「台南東區」所有行程 |
| **子頁** | 每個扭蛋結果一個詳情頁 | `/itinerary/tainan-east/v001` 顯示單一行程 |
| **自動標題** | 根據景點分類自動帶關鍵字 | 「台南東區一日遊｜美食、景點、購物精選路線」 |
| **動態 Sitemap** | Google 可索引所有頁面 | `/sitemap.xml` 自動更新 |
| **ISR 即時更新** | 新行程自動觸發頁面重新生成 | 扭蛋完成 → 官網頁面更新 |

### 自動化流程

```
用戶在 App 扭蛋
       ↓
gacha_ai_logs 儲存（現有流程）
       ↓
【自動】同步到 seo_itineraries
├── 去重檢查（70% 景點重複則跳過）
├── 自動生成 slug、title
└── 自動觸發 ISR 重新驗證
       ↓
官網頁面自動更新
```

---

## 🗂 核心概念

### 資料來源
直接沿用現有 `gacha_ai_logs.aiReason`（AI 排序理由），轉換為 SEO 友善的行程介紹。

| 欄位 | 用途 |
|------|------|
| `city` | 城市（如「台南市」） |
| `district` | 區域（如「東區」） |
| `aiReason` | AI 排序理由 → 直接作為行程介紹 |
| `orderedPlaceIds` | 排序後景點 ID → 顯示景點卡片 |
| `categoryDistribution` | 分類分佈 → 自動生成標題關鍵字 |

### 頁面結構

| 類型 | URL 範例 | 內容 |
|------|----------|------|
| **城市列表** | `/itinerary` | 所有城市總覽 |
| **聚合頁** | `/itinerary/tainan-east` | 台南東區所有行程 |
| **子頁** | `/itinerary/tainan-east/v001` | 單一行程詳情 |

### Slug 生成規則

| 城市 | 區域 | 聚合頁 slug | 子頁 slug |
|------|------|-------------|-----------|
| 台南市 | 東區 | `tainan-east` | `tainan-east/v001` |
| 台中市 | 北區 | `taichung-north` | `taichung-north/v002` |

### 標題自動生成

根據 `categoryDistribution` 取前 3 個分類：
- 輸入：`{ 美食: 3, 景點: 1, 購物: 1 }`
- 輸出：「台南東區一日遊｜美食、景點、購物精選路線」

---

## 🗃 資料表

### `seo_itineraries`（新增）

```typescript
export const seoItineraries = pgTable("seo_itineraries", {
  id: serial("id").primaryKey(),
  gachaSessionId: varchar("gacha_session_id", { length: 36 }).notNull(),
  
  city: text("city").notNull(),
  district: text("district"),
  
  slug: text("slug").notNull(),
  parentSlug: text("parent_slug").notNull(),
  title: text("title").notNull(),
  metaDescription: text("meta_description"),
  
  itineraryIntro: text("itinerary_intro").notNull(),
  placeIds: integer("place_ids").array(),
  categoryDistribution: jsonb("category_distribution"),
  
  status: text("status").default("published"),
  publishedAt: timestamp("published_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### 資料表約束

```sql
CREATE UNIQUE INDEX idx_seo_itineraries_slug ON seo_itineraries(slug);
CREATE UNIQUE INDEX idx_seo_itineraries_session ON seo_itineraries(gacha_session_id);
```

---

## 🔌 API 端點

| Method | Endpoint | 說明 | 認證 |
|--------|----------|------|------|
| GET | `/api/seo/itineraries` | 列出所有已發布行程 | Service Token |
| GET | `/api/seo/itineraries/:parentSlug` | 取得聚合頁下所有子頁 | Service Token |
| GET | `/api/seo/itineraries/:parentSlug/:version` | 取得單一子頁 | Service Token |
| GET | `/api/seo/sitemap` | 取得 Sitemap 資料 | Service Token |

---

## 📁 新增檔案

### 後端

| 檔案 | 說明 |
|------|------|
| `server/seo/sync.ts` | SEO 同步邏輯（去重、版本號、ISR 觸發） |
| `server/seo/routes.ts` | SEO API 端點 |

### 官網 (Next.js)

| 檔案 | 說明 |
|------|------|
| `app/itinerary/page.tsx` | 城市列表頁 |
| `app/itinerary/[parentSlug]/page.tsx` | 聚合頁 |
| `app/itinerary/[parentSlug]/[version]/page.tsx` | 子頁 |
| `app/api/revalidate/route.ts` | ISR 重新驗證 API |
| `app/sitemap.ts` | 動態 Sitemap |

---

## ⚙️ 環境變數

```bash
# 後端新增
OFFICIAL_SITE_URL=https://your-official-site.com
REVALIDATE_SECRET=your-random-secret-32-chars
SEO_SERVICE_TOKEN=your-seo-service-token
```

---

## 🔧 實作步驟

### Step 1：後端 Schema 更新

1. 在 `shared/schema.ts` 新增 `seoItineraries` 資料表
2. 執行 `npm run db:push`
3. 手動執行唯一索引 SQL

### Step 2：後端同步邏輯

1. 建立 `server/seo/sync.ts`（包含去重、版本號、ISR 觸發）
2. 建立 `server/seo/routes.ts`（API 端點）
3. 在 `server/routes.ts` 註冊路由

### Step 3：官網頁面

1. 建立 ISR 頁面結構
2. 建立 revalidate API
3. 建立動態 Sitemap

### Step 4：整合測試

1. 在 App 執行扭蛋
2. 確認 `seo_itineraries` 有新記錄
3. 確認官網頁面已更新

---

## 🔄 同步邏輯說明

### 去重機制

同區域景點重複率 > 70% 時跳過同步，確保每個聚合頁下的子頁內容有差異性。

### ISR 觸發

同步完成後自動呼叫官網的 `/api/revalidate`，觸發以下頁面重新生成：
- 子頁：`/itinerary/{slug}`
- 聚合頁：`/itinerary/{parentSlug}`
- 城市列表：`/itinerary`
- Sitemap：`/sitemap.xml`

### 版本號管理

使用資料庫交易確保版本號不衝突：
- 第一個行程：`v001`
- 第二個行程：`v002`
- 以此類推

---

## 📊 預期 SEO 效果

| 指標 | 預期效果 |
|------|---------|
| **索引頁面數** | 每個城市/區域組合一個聚合頁 + 多個子頁 |
| **目標關鍵字** | 「{城市}{區域}一日遊」「{城市}景點推薦」 |
| **內容更新頻率** | 每次扭蛋自動更新 |
| **頁面載入速度** | ISR 預渲染，首次載入 < 1 秒 |

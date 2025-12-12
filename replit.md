# Mibu 旅行扭蛋

## 專案概述

Mibu 旅行扭蛋是一個結合旅遊規劃與扭蛋遊戲化的漸進式網頁應用程式（PWA）。使用者輸入目的地和行程節奏，AI 會隨機產生經過驗證的在地行程。應用程式有收藏系統，讓使用者可以收集地點，並以地區和分類的折疊選單方式整理。商家後台讓店家可以認領地點並管理優惠活動，搭配訂閱制方案。

## 使用者偏好

偏好的溝通方式：簡單、日常用語。

**修改說明規範 (2025-12-12 新增)**:
每次進行程式碼修改時，必須說明：
1. 修改了什麼 - 具體更動的檔案和程式碼
2. 修改的邏輯說明 - 為什麼要這樣修改
3. 修改後的結果 - 預期的效果和實際運行結果

---

## 資料表對照表（Database Tables）

這是專案中所有資料表的中文說明：

| 英文名稱 | 中文用途 | 說明 |
|---------|---------|------|
| `users` | 使用者 | 儲存登入的使用者帳號資料 |
| `sessions` | 登入狀態 | 記錄使用者的登入連線資訊 |
| `countries` | 國家 | 國家資料（目前只有台灣） |
| `regions` | 縣市 | 台灣的 22 個縣市 |
| `districts` | 鄉鎮區 | 台灣的 139 個鄉鎮區 |
| `categories` | 行程分類 | 8 大分類：食、宿、景點、購物、娛樂、活動、生態文化、遊程體驗 |
| `subcategories` | 子分類 | 各分類下的細項（如：火鍋、咖啡廳、設計旅店等） |
| `place_cache` | 地點快取 | 已經產生過的地點資料，避免重複呼叫 AI |
| `collections` | 收藏紀錄 | 使用者收藏的地點 |
| `place_feedback` | 地點回饋 | 使用者排除不喜歡的地點紀錄 |
| `merchants` | 商家 | 商家帳號資料 |
| `merchant_place_links` | 商家認領 | 商家認領的地點關聯 |
| `coupons` | 優惠券 | 商家發放的優惠券 |
| `trip_plans` | 行程規劃 | 使用者建立的行程計畫 |
| `planners` | 策劃師 | 策劃師帳號資料（專業旅程規劃師）|
| `service_plans` | 服務方案 | 策劃服務的價格和內容（輕旅諮詢、深度規劃、全程陪伴）|
| `service_orders` | 服務訂單 | 使用者購買策劃服務的訂單紀錄 |
| `travel_companions` | 旅伴 | 已加入行程的旅伴紀錄 |
| `companion_invites` | 旅伴邀請 | 邀請旅伴加入聊天室的邀請碼 |

---

## 系統架構

### 前端架構（Frontend Architecture）
前端就是使用者看到的畫面和互動介面。

- **框架 Framework**: React 18 + TypeScript（嚴格模式）
  - React 是一個建立使用者介面的工具
  - TypeScript 是一種程式語言，幫助減少錯誤
- **建置工具 Build Tool**: Vite 5.x
  - 讓程式碼可以在瀏覽器中運行的工具
- **樣式 Styling**: Tailwind CSS
  - 設計畫面外觀的工具，支援手機優先設計
- **狀態管理 State Management**: React Query + React useState
  - 管理資料和畫面狀態的方式
- **UI 元件 UI Components**: shadcn/ui + Radix UI
  - 預先做好的按鈕、選單等介面元件
- **動畫 Animations**: Framer Motion
  - 讓畫面有動態效果的工具

### 後端架構（Backend Architecture）
後端就是處理資料、連接資料庫的伺服器程式。

- **執行環境 Runtime**: Node.js + Express
  - Node.js 是讓 JavaScript 在伺服器執行的環境
  - Express 是處理網路請求的框架
- **程式語言 Language**: TypeScript（ES modules 模式）
- **API 模式 API Pattern**: RESTful，網址以 `/api/` 開頭
- **登入驗證 Authentication**: Replit Auth（OpenID Connect）
  - 使用 Replit 的登入系統
- **角色權限 Role-Based Access Control (2025-12-12 新增)**:
  - 使用者角色：`consumer`（一般用戶）、`merchant`（商家）、`admin`（管理員）
  - API 網址區分：`/api/consumer/*` 給一般用戶，`/api/merchant/*` 給商家

### 資料儲存（Data Storage）
- **資料庫 Database**: PostgreSQL + Drizzle ORM
  - PostgreSQL 是資料庫系統
  - Drizzle ORM 是用程式碼操作資料庫的工具
- **資料結構定義位置 Schema Location**: `shared/schema.ts`
- **同步指令 Migrations**: 用 `npm run db:push` 同步資料庫結構

### 地區階層（Location Hierarchy）(2025-12-10 更新)
- 三層架構：國家 → 縣市 → 鄉鎮區
- 多語言支援：每個表都有 nameEn、nameZh、nameJa、nameKo 欄位
- 台灣資料：1 個國家、22 個縣市、139 個鄉鎮區
- 六都：台北市、新北市、桃園市、台中市、台南市、高雄市
- 省轄市：基隆市、新竹市、嘉義市
- 其他 13 個縣

### 分類系統（Category System）(2025-12-10 新增)
- 兩層架構：分類 → 子分類
- 8 大分類：食、宿、生態文化教育、遊程體驗、娛樂設施、活動、景點、購物
- 每個分類下有多個子分類（例如：食 有 火鍋、咖啡廳、拉麵等）

### 地點快取系統（Place Cache System）(2025-12-10 新增)
- **用途**：減少 AI（Gemini）的使用量，把產生過的地點存起來
- **快取邏輯**：
  1. 產生行程時，先檢查快取有沒有這個子分類的地點
  2. 如果有，而且使用者沒排除過 → 直接用快取資料（不呼叫 AI）
  3. 如果沒有 → 呼叫 Gemini AI，用 Google 地圖驗證，存到快取
- **好處**：同一個地區的重複請求可以重用資料，省 AI 和 Google API 費用

### 模組化架構（Modular Architecture）(2025-12-12 新增)
- **目錄結構**: 
  - `modules/` - 功能模組（trip-planner 行程規劃、travel-gacha 旅行扭蛋、admin 管理）
  - `core/` - 共用的基礎程式碼
- **導航架構 (2025-12-12 更新)**: 雙層嵌套導航
  - **全域導航** (SideNav.tsx): 4 個項目 - 首頁、行程扭蛋、旅程策劃、設定
  - **扭蛋模組子導航** (ModuleNav.tsx): 3 個分頁 - 扭蛋、圖鑑、道具箱
  - **策劃模組子導航**: 3 個分頁 - 定位、行程、聊天
  - 響應式設計：電腦版在右邊，手機版在底部

### 離線存取系統（Offline Access System）(2025-12-12 新增)
- **PWA 架構**：使用 Service Worker + IndexedDB 實現離線功能
- **快取策略**：
  - 靜態資源：Stale-While-Revalidate（先用快取，背景更新）
  - API 回應：Network First（先嘗試網路，失敗用快取）
  - 地圖圖磚：Cache First（優先用快取，減少流量）
- **關鍵檔案**：
  - `client/public/service-worker.js` - Service Worker 邏輯
  - `client/src/lib/offlineStorage.ts` - IndexedDB 操作
  - `client/src/components/OfflineIndicator.tsx` - 離線狀態 UI
- **使用方式**：在行程編輯器中點擊下載按鈕，儲存行程和地圖供離線使用

---

## 最近更動

### 2025-12-12 更動
- 更新子分類資料，共 67 個子分類
- 新增「遊程體驗」分類的子分類：手作體驗、一日遊、導覽遊程
- **地點不足回補機制**：當區域地點不足時，自動嘗試其他子分類/分類，仍不足則顯示提醒
- **離線存取功能 (PWA Offline Access)**：
  - Service Worker：快取靜態資源、API 回應、Mapbox 地圖圖磚
  - IndexedDB：儲存行程資料供離線使用
  - 離線指示器：當網路斷線時顯示「離線模式」提示
  - 地圖離線下載：在行程編輯器中可下載當前區域地圖供離線使用
  - 行程離線儲存：點擊下載按鈕將行程儲存到本地
  - 離線回退：網路失敗時自動從 IndexedDB 讀取已儲存的行程
- **Twilio 聊天系統**：整合 Twilio Conversations API
  - 後端 Token API：`/api/chat/token`
  - 聊天室管理 API：`/api/chat/conversations`
  - 前端 ChatView 元件：在旅程策劃模組的「聊天」分頁
- **旅程策劃服務系統**：
  - 策劃師資料表（planners）和服務方案（service_plans）
  - 訂單系統：購買服務 → 自動配對策劃師 → 建立聊天室
  - 三種方案：輕旅諮詢（$299）、深度規劃（$799）、全程陪伴（$1,499）
  - 雙金流準備：PAYUNi（台灣）+ Stripe（國際）
- **多人旅伴系統**：
  - 購買者可邀請旅伴加入聊天室
  - 邀請連結機制：建立邀請碼 → 分享連結 → 旅伴接受邀請
  - 接受邀請時自動加入 Twilio 聊天室
  - API：`/api/planner/orders/:id/invite`、`/api/planner/invites/:code/accept`

### 2025-12-11 更動
- **Google 類型整合**：在行程卡片上顯示 Google 地點類型標籤
- **商家認領系統**：改用 Google Place ID 進行精確配對
- **地點排除系統**：使用者可以點 X 按鈕排除不喜歡的地點
- **搜尋結果過濾**：過濾掉已關閉的店家和非觀光類型

### 2025-12-10 更動
- **移除稀有度系統**：不再使用 SP/SSR/SR/S/R 等級
- **分類標籤**：卡片改為顯示分類標籤（美食、住宿、景點等）
- **地區分組**：收藏以地區折疊選單方式整理

---

## AI 整合

- **服務商 Provider**: Google Gemini API（gemini-2.5-flash 模型）
- **用途 Purpose**: 產生旅遊行程，並用 Google 搜尋驗證地點
- **設定 Configuration**: 透過環境變數設定 API 金鑰

---

## 扭蛋行程邏輯（Gacha Itinerary Logic）(2025-12-11 更新)

1. **單一地區鎖定**：每次扭蛋隨機選一個鄉鎮區，所有地點都在這個區域內
2. **多分類多樣性**：每次產生多個地點，涵蓋不同分類
3. **避免重複**：每次扭蛋會追蹤已產生的地點，避免重複
4. **AI 描述**：每個地點有 AI 產生的觀光導向描述
5. **地點驗證**：每個地點會驗證是否真的在選定的鄉鎮區內

---

## 外部服務（External Dependencies）

### 第三方服務
- **Replit Auth**: 登入驗證系統
- **Google Gemini API**: AI 產生行程
- **Twilio Conversations API**: 即時聊天系統
  - 支援多人聊天室、已讀回執、跨裝置同步
- **Recur（台灣金流）**: 商家訂閱付款（透過 PAYUNi）
  - 方案：免費版、夥伴版（$499/月）、專業版（$1,499/月）

### 資料庫
- **PostgreSQL**: 主要資料庫，透過 `DATABASE_URL` 環境變數連線

### 需要的環境變數（Environment Variables）
這些是系統運作需要的設定值，在 Replit 的「Secrets」分頁設定：

| 變數名稱 | 用途 |
|---------|------|
| `DATABASE_URL` | 資料庫連線網址 |
| `SESSION_SECRET` | 登入連線加密用的密鑰 |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini API 網址 |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini API 金鑰 |
| `ISSUER_URL` | Replit 登入驗證網址 |
| `REPL_ID` | Replit 環境識別碼 |
| `TWILIO_ACCOUNT_SID` | Twilio 帳號 SID（AC 開頭） |
| `TWILIO_API_KEY_SID` | Twilio API Key SID（SK 開頭） |
| `TWILIO_API_KEY_SECRET` | Twilio API Key 密鑰 |
| `TWILIO_CONVERSATIONS_SERVICE_SID` | Twilio 聊天服務 SID（IS 開頭） |

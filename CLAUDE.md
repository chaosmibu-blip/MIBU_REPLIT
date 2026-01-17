# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 專案定位

> **本專案為 MIBU 後端 API 伺服器**

| 專案 | 技術棧 | 位置 |
|------|--------|------|
| **後端 API** | Node.js + Express + Drizzle ORM | 本專案 |
| Expo App | React Native + NativeWind | 另一專案 |
| 官方網站 | Next.js 15 + Tailwind | 另一專案 |

**MIBU** 是專為自由行旅客打造的旅遊安全與行程規劃平台：
- **行程扭蛋模組**：隨機景點抽取、優惠券獎勵
- **旅程策劃模組**：行程規劃、策劃師諮詢服務

---

## 強制查閱規則

> **執行任何後端任務前，必須先讀取對應記憶庫**

| 動作類型 | 必讀記憶庫 |
|---------|-----------|
| 修改扭蛋邏輯 | `docs/memory-gacha-core.md` |
| 採集/審核/升級景點 | `docs/memory-gacha-collection.md` |
| 修改資料表結構 | `docs/memory-data-schema.md` |
| 新增/修改 API | `docs/memory-api-dictionary.md` |
| 認證相關修改 | `docs/memory-auth.md` |
| 第三方 API 調用 | `docs/memory-integrations.md` |
| 金流/商品邏輯 | `docs/memory-payment-commerce.md` |
| 部署/環境變數 | `docs/memory-deployment.md` |
| 等級/經驗/成就 | `docs/memory-economy-system.md` |
| 募資系統 | `docs/memory-crowdfund.md` |
| 推薦系統 | `docs/memory-referral.md` |
| 用戶貢獻 | `docs/memory-contribution.md` |
| 商家相關 | `docs/memory-merchant.md` |
| 專員服務 | `docs/memory-specialist.md` |
| SOS 緊急求助 | `docs/memory-sos-safety.md` |

---

## API 契約規則

> **後端是契約的唯一制定者，官網和 APP 只能依照契約實作**

### 契約文件結構
```
docs/
├── API_CONTRACT.md           ← 總覽 + 變更日誌
└── contracts/
    ├── COMMON.md             ← 認證、錯誤碼、共用型別
    ├── WEB.md                ← 官網專用 API
    └── APP.md                ← APP 專用 API
```

### 強制規則
| 動作 | 必讀文件 |
|------|----------|
| 改任何 API | `docs/contracts/` 對應的契約文件 |
| 新增 API | **先更新契約，再寫程式碼** |
| Breaking Change | 必須在 `API_CONTRACT.md` 變更日誌註明 |

### 維護原則
1. **後端是唯一真相來源** - 官網/APP 發現不一致，回報後端修正
2. **先契約後程式碼** - 不可先改程式碼再補文件
3. **版本號規則**：
   - 大版本（X.0.0）：Breaking Change
   - 小版本（0.X.0）：新增 API
   - 修訂版（0.0.X）：修正錯誤

---

## 技術棧

| 層級 | 技術 |
|------|------|
| **後端** | Node.js + Express + Drizzle ORM |
| **管理後台** | React 19 + Vite + TypeScript + Tailwind CSS + Radix UI |
| **資料庫** | PostgreSQL (Neon-backed)，82 張表/列舉 |
| **認證** | JWT + Session (Replit Auth)，支援 RBAC |
| **支付** | Stripe + Recur (台灣本地) |
| **AI** | Google Gemini (行程智慧排序、描述生成) |
| **地圖** | Google Places API + Mapbox GL |
| **即時通訊** | Socket.io + Twilio |

### 技術規範
- **server/**：Node.js, Express, Drizzle ORM｜**禁止 React, JSX**
- **client/**：React 19, Tailwind｜允許 HTML

---

## 常用指令

### 開發
```bash
npm run dev          # 啟動開發伺服器
npm run build        # 生產環境打包
npm run start        # 執行生產伺服器
npm run check        # TypeScript 類型檢查
npm run db:push      # 推送 Drizzle schema 到資料庫
```

### 景點採集流程
```bash
# 1. 採集（Google Places API）
npx tsx server/scripts/batch-parallel-collect.ts 城市名 [--mode=generic|local|mixed] [--district=區域名]

# 2. AI 審核（place_cache → 過濾垃圾資料）
npx tsx server/scripts/short-batch-review.ts [數量]

# 3. 升級到正式表（place_cache → places，含 AI 描述生成）
npx tsx server/scripts/migrate-with-descriptions.ts [數量]

# 4. 深度審核（places 表分類修正）
npx tsx server/scripts/deep-review-places.ts [批次大小] [起始ID]

# 5. District 欄位修正
npx tsx server/scripts/review-district.ts [--fix] [--ai]
```

### 維護工具
```bash
npx tsx server/scripts/architecture-check.ts   # 架構健康檢查
npx tsx server/scripts/generate-contract.ts    # 產生 API 契約
npx tsx server/scripts/seed-economy-data.ts    # 初始化經濟系統資料
```

---

## 專案架構

```
server/                   # 後端 API
├── index.ts              # 應用程式入口
├── db.ts                 # 資料庫連線
├── routes/               # 路由層（模組化）
│   ├── index.ts          # 路由註冊中心
│   ├── auth.ts           # 認證路由（OAuth, JWT）
│   ├── account.ts        # 帳號系統（Phase 5）
│   ├── gacha/            # 扭蛋模組
│   │   ├── gacha-main.ts
│   │   ├── gacha-v3.ts   # 最新版本含 AI 排序
│   │   ├── submit-trip.ts
│   │   └── shared.ts
│   ├── admin/            # 管理後台 API（10+ 檔案）
│   ├── merchant/         # 商家模組（已模組化）
│   │   ├── index.ts      # 路由匯總
│   │   ├── profile.ts    # 基本資料、註冊
│   │   ├── coupons.ts    # 優惠券管理
│   │   ├── daily-code.ts # 每日核銷碼
│   │   ├── analytics.ts  # 數據分析
│   │   ├── places.ts     # 景點認領
│   │   ├── products.ts   # 商品管理
│   │   └── subscription.ts # 訂閱、退款
│   ├── specialist.ts     # 專員路由
│   ├── sos.ts            # SOS 安全路由
│   ├── collections.ts    # 收藏路由
│   ├── locations.ts      # 地區路由
│   ├── seo.ts            # SEO 公開路由
│   ├── economy.ts        # 等級/經驗系統
│   ├── crowdfund.ts      # 募資系統
│   ├── referral.ts       # 推薦系統
│   ├── contribution.ts   # 用戶貢獻
│   ├── commerce.ts       # 商品/購物
│   ├── chat.ts           # 即時聊天（Socket.io）
│   ├── inventory.ts      # 用戶背包
│   ├── notifications.ts  # 通知系統
│   ├── ads.ts            # 廣告系統
│   ├── monitoring.ts     # 健康檢查
│   └── webhooks.ts       # Stripe Webhook
├── storage/              # 資料存取層（17 個模組）
│   ├── index.ts          # Storage 匯出中心
│   ├── userStorage.ts
│   ├── accountStorage.ts # 帳號系統
│   ├── placeStorage.ts
│   ├── gachaStorage.ts
│   ├── merchantStorage.ts
│   ├── subscriptionStorage.ts
│   ├── specialistStorage.ts
│   ├── locationStorage.ts
│   ├── sosStorage.ts
│   ├── adminStorage.ts
│   ├── commerceStorage.ts
│   ├── economyStorage.ts   # 等級/經驗
│   ├── crowdfundStorage.ts # 募資
│   ├── referralStorage.ts  # 推薦
│   ├── contributionStorage.ts # 貢獻
│   └── refundStorage.ts
├── lib/                  # 工具函式庫
│   ├── placeGenerator/   # 景點生成引擎 (Gemini)
│   ├── merchantPermissions.ts # 商家權限檢查
│   ├── categoryMapping.ts  # 八大分類對應
│   ├── placeBlacklist.ts   # 景點黑名單
│   ├── timeSlotInferrer.ts # 最佳時段推論
│   ├── addressParser.ts    # 地址解析
│   ├── geofencing.ts       # 地理圍欄
│   └── dataCleanup.ts      # 資料清理
├── services/             # 業務邏輯層
│   ├── configService.ts  # 系統配置快取
│   └── stripe/           # Stripe 支付模組
│       ├── client.ts     # SDK 初始化
│       ├── service.ts    # 業務邏輯
│       ├── storage.ts    # 資料存取
│       ├── routes.ts     # API 路由
│       └── index.ts      # 統一導出
├── middleware/           # Express 中間件
│   ├── queryLogger.ts    # SQL 查詢記錄
│   └── rateLimit.ts      # 速率限制
├── scripts/              # CLI 腳本（15+ 個）
├── replitAuth.ts         # 認證邏輯
└── socketHandler.ts      # Socket.io 設定

client/                   # 管理後台 UI
├── src/
│   ├── App.tsx           # 主應用組件
│   ├── components/       # UI 組件
│   │   ├── ui/           # Radix UI 基礎組件（20+）
│   │   ├── AdminDashboard.tsx
│   │   └── ...
│   ├── pages/            # 頁面組件
│   │   ├── LoginPage.tsx
│   │   └── admin/        # 管理員頁面（14 個）
│   │       ├── AnnouncementsPage.tsx
│   │       ├── BatchGeneratePage.tsx
│   │       ├── ExclusionsPage.tsx
│   │       ├── FinanceReportPage.tsx
│   │       ├── MerchantsManagementPage.tsx
│   │       ├── OperationsDashboardPage.tsx
│   │       ├── PlaceDraftsReviewPage.tsx
│   │       ├── PlacesManagementPage.tsx
│   │       ├── RefundsManagementPage.tsx
│   │       ├── RoleApplicationsPage.tsx
│   │       ├── SubscriptionPlansPage.tsx
│   │       ├── SystemConfigsPage.tsx
│   │       ├── SystemServicesPage.tsx
│   │       └── UsersReviewPage.tsx
│   ├── hooks/            # React Hooks
│   ├── services/         # API 服務層
│   └── lib/              # 工具函式
└── index.html

shared/
├── schema.ts             # Drizzle ORM schema（82 張表/列舉）
└── errors.ts             # 錯誤碼定義

docs/
├── memory-*.md           # 記憶庫文檔（22 個）
├── API_CONTRACT.md       # API 契約總覽
├── API_CONTRACT.json     # 自動生成的 API 契約
├── SYNC_QUEUE.md         # 三端同步清單
├── MEMORY_MAP.md         # 記憶庫映射表
└── contracts/            # 分端契約
    ├── COMMON.md
    ├── WEB.md
    └── APP.md
```

---

## API 路由總覽

| 路由檔案 | API 前綴 | 職責 |
|----------|----------|------|
| `routes/auth.ts` | `/api/auth/*` | Apple/Google Sign In, JWT |
| `routes/account.ts` | `/api/account/*` | 帳號管理、個人設定 |
| `routes/gacha/` | `/api/gacha/*` | 扭蛋抽取（V1/V2/V3）、行程提交 |
| `routes/merchant/` | `/api/merchant/*`, `/api/coupons/*` | 商家管理、優惠券、訂閱 |
| `routes/specialist.ts` | `/api/specialist/*` | 專員服務、訂單 |
| `routes/admin/` | `/api/admin/*` | 後台管理 API（40+ 端點） |
| `routes/sos.ts` | `/api/sos/*` | 緊急求助 |
| `routes/collections.ts` | `/api/collections/*` | 用戶收藏 |
| `routes/locations.ts` | `/api/locations/*` | 地區階層 |
| `routes/seo.ts` | `/api/seo/*` | 官網 SEO 用 |
| `routes/economy.ts` | `/api/user/level/*`, `/api/levels` | 等級、經驗、成就 |
| `routes/crowdfund.ts` | `/api/crowdfund/*` | 募資活動、贊助 |
| `routes/referral.ts` | `/api/referral/*` | 推薦碼、追蹤 |
| `routes/contribution.ts` | `/api/contribution/*` | 景點建議、舉報、投票 |
| `routes/commerce.ts` | `/api/commerce/*` | 商品、訂單 |
| `routes/chat.ts` | `/api/chat/*` | 即時聊天 |
| `routes/inventory.ts` | `/api/inventory/*` | 用戶背包 |
| `routes/notifications.ts` | `/api/notifications/*` | 通知管理 |
| `routes/monitoring.ts` | `/api/health/*`, `/api/metrics` | 健康檢查 |
| `routes/webhooks.ts` | `/api/stripe/*`, `/api/webhooks/*` | Stripe Webhook |

**總端點數**：130+（詳見 `docs/API_CONTRACT.json`）

---

## 存儲層模組

| 模組 | 職責 |
|------|------|
| `userStorage` | 用戶 CRUD、auth_identities |
| `accountStorage` | 帳號設定、偏好 |
| `placeStorage` | places、place_cache、place_drafts |
| `gachaStorage` | collections、gacha_ai_logs、每日額度 |
| `merchantStorage` | 商家、優惠券、認領 |
| `subscriptionStorage` | 訂閱、退款請求 |
| `locationStorage` | countries、regions、districts |
| `specialistStorage` | 專員、服務方案、訂單 |
| `sosStorage` | SOS 事件、警報 |
| `adminStorage` | 系統設定、公告 |
| `commerceStorage` | 商品、購物車、訂單 |
| `economyStorage` | 等級、經驗、成就 |
| `crowdfundStorage` | 募資活動、贊助記錄 |
| `referralStorage` | 推薦碼、推薦關係 |
| `contributionStorage` | 景點建議、舉報、投票 |
| `refundStorage` | 退款請求處理 |

---

## 認證機制

```typescript
// 兩種認證方式並存
// 1. Web (Replit Auth): Session-based, connect.sid cookie
// 2. Mobile (JWT): Bearer token in Authorization header

// 路由中取得用戶 ID：
const userId = req.user?.claims?.sub || req.jwtUser?.userId || 'guest';

// 角色權限（RBAC）：
// - traveler（預設）
// - merchant
// - specialist
// - admin
```

---

## 核心資料表

### 用戶與認證
| 表 | 說明 |
|-----|------|
| `users` | 用戶基本資料 |
| `auth_identities` | 多種登入方式綁定（OAuth） |
| `user_roles` | 用戶角色管理 |
| `sessions` | Session 儲存 |

### 景點與扭蛋
| 表 | 說明 |
|-----|------|
| `places` | 官方景點庫（`isActive` 控制是否出現在扭蛋） |
| `place_cache` | AI 採集暫存區（待審核） |
| `place_drafts` | 草稿景點 |
| `collections` | 用戶圖鑑（關聯 `gachaSessionId`） |
| `gachaAiLogs` | AI 排序決策記錄 |

### 商家與訂閱
| 表 | 說明 |
|-----|------|
| `merchants` | 商家帳號 |
| `merchant_subscriptions` | 訂閱記錄 |
| `coupons` | 優惠券 |
| `refund_requests` | 退款請求 |

### 經濟系統
| 表 | 說明 |
|-----|------|
| `levelDefinitions` | 等級定義 |
| `userLevels` | 用戶等級進度 |
| `userExpTransactions` | 經驗交易記錄 |
| `achievements` | 成就定義 |
| `userAchievements` | 用戶成就 |

### 其他系統
| 表 | 說明 |
|-----|------|
| `referralCodes` | 推薦碼 |
| `crowdfundCampaigns` | 募資活動 |
| `placeSuggestions` | 景點建議 |
| `sosEvents` | SOS 緊急事件 |

---

## Gacha V3 核心邏輯

主要端點：`POST /api/gacha/itinerary/v3`

| 階段 | 邏輯 |
|------|------|
| 限額檢查 | 36 張/天（管理員豁免） |
| 圖鑑去重 | 排除最近 36 張收藏 |
| 結構化選點 | 美食保底 2-3、住宿最多 1 |
| AI 排序 | 三輪 Gemini 驗證 |
| 備援機制 | 不足時擴散到鄰近區域 |

---

## 記憶庫索引

> 位置：`docs/` 目錄（共 22 個記憶庫）

### 核心功能
| 檔案 | 職權 |
|------|------|
| `memory-gacha-core.md` | Gacha 核心邏輯 |
| `memory-gacha-collection.md` | 景點採集/審核流程 |
| `memory-gacha-changelog.md` | Gacha 變更記錄 |
| `memory-travel-gacha.md` | Gacha 業務規則、七大分類 |
| `memory-merchant.md` | 商家認領、優惠券、訂閱權限 |
| `memory-specialist.md` | 策劃師服務、訂單管理 |
| `memory-admin.md` | 後台審核、公告管理 |
| `memory-user-client.md` | 背包、通知、收藏 |
| `memory-trip-planner.md` | 行程規劃、旅伴邀請 |
| `memory-web-official.md` | 官網 SEO API |

### 新系統（Phase 1-6）
| 檔案 | 職權 |
|------|------|
| `memory-economy-system.md` | 等級、經驗、成就（Phase 1） |
| `memory-crowdfund.md` | 募資系統（Phase 2） |
| `memory-referral.md` | 推薦系統（Phase 3） |
| `memory-contribution.md` | 用戶貢獻（Phase 4） |

### 基礎設施
| 檔案 | 職權 |
|------|------|
| `memory-data-schema.md` | 82 張表定義 |
| `memory-api-dictionary.md` | API 端點規範 |
| `memory-auth.md` | JWT/Session/OAuth/RBAC |
| `memory-payment-commerce.md` | Stripe/Recur 整合 |
| `memory-sos-safety.md` | 緊急求助系統 |
| `memory-integrations.md` | 第三方 API |
| `memory-deployment.md` | 環境變數、部署 |
| `memory-i18n.md` | 多語系支援 |

---

## 開發階段記錄

| Phase | 名稱 | 內容 |
|-------|------|------|
| Phase 6 | 商家營業時間 | 商家新增店家營業時間欄位 |
| Phase 5 | 帳號重構 | Account System 重新設計 |
| Phase 4 | 用戶貢獻 | 景點建議、舉報、投票系統 |
| Phase 3 | 推薦系統 | 推薦碼、推薦追蹤 |
| Phase 2 | 募資系統 | 募資活動、贊助管理 |
| Phase 1 | 經濟基礎 | 等級、經驗、成就系統 |

---

## 重要約定

### 八大分類
美食、住宿、景點、購物、娛樂設施、生態文化教育、遊程體驗、其他

### 軟刪除模式
使用 `isActive = false` 而非硬刪除（places, merchants, coupons）

### 腳本穩定性原則
以下腳本**未經用戶同意不得修改**：
- `batch-parallel-collect.ts`
- `short-batch-review.ts`
- `migrate-with-descriptions.ts`
- `deep-review-places.ts`

### 架構模式
- **模組化路由**：每個功能域獨立路由檔案
- **Storage 層**：17 個專責 Storage 模組（單一職責）
- **錯誤處理**：集中於 `shared/errors.ts`
- **反正規化**：為查詢效率，部分欄位重複儲存
- **I18n 支援**：JSONB 欄位支援多語系（en, ja, ko 回退至 zh-TW）
- **AI 決策記錄**：所有 Gemini 呼叫記錄於 gachaAiLogs

---

## 環境變數

| 變數 | 用途 |
|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `JWT_SECRET` | JWT 簽名密鑰 |
| `ADMIN_MIGRATION_KEY` | Admin API 保護 |
| `GEMINI_API_KEY` | Google Gemini AI |
| `STRIPE_SECRET_KEY` | Stripe 支付 |
| `GOOGLE_PLACES_API_KEY` | Google Places API |
| `TWILIO_ACCOUNT_SID` | Twilio 帳號 |
| `TWILIO_AUTH_TOKEN` | Twilio 認證 |
| `MAPBOX_ACCESS_TOKEN` | Mapbox 地圖 |

---

## 開發原則

1. **全程使用中文**溝通
2. **先讀記憶庫再行動**
3. **治本優先**：修正根源而非打補丁
4. **客觀評估**：有問題直接點出
5. 完成後更新**唯一對應**的記憶庫
6. **先契約後程式碼**：API 變更必須先更新契約文件

---

## 三端同步工作流程

> **後端是主要施作者**，官網/APP 只負責 UI/UX，透過同步清單保持一致

### 同步清單位置
`docs/SYNC_QUEUE.md`

### 工作流程

```
後端施作完成
    ↓
判斷是否需要官網/APP 同步
    ↓
如需要 → 記錄到 SYNC_QUEUE.md（狀態：pending）
    ↓
用戶下指令「派發同步任務給官網/APP」
    ↓
後端產出完整同步指令
    ↓
用戶複製指令到官網/APP 執行
    ↓
完成後用戶回報「官網/APP 已完成 XXX」
    ↓
後端標記為 completed
```

### 用戶指令

| 指令 | 作用 |
|------|------|
| 「派發同步任務給官網」 | 產出官網要執行的指令 |
| 「派發同步任務給 APP」 | 產出 APP 要執行的指令 |
| 「官網已完成 XXX」 | 標記任務完成 |
| 「查看同步清單」 | 檢視待處理任務 |

### 記憶庫更新檢查

每次施作完成，後端須確認：
1. **後端**：是否更新了對應的 `docs/memory-*.md`
2. **官網**：是否需要更新官網的 CLAUDE.md
3. **APP**：是否需要更新 APP 的 CLAUDE.md

> 三端記憶庫映射表見 `docs/MEMORY_MAP.md`

---

## 版本記錄

| 版本 | 日期 | 變更 |
|------|------|------|
| v2.0 | 2026-01-17 | 更新至 82 張表、22 個記憶庫、新增 Phase 1-6 系統 |
| v1.0 | — | 初版建立 |

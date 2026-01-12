# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 專案定位

> ⚠️ **本專案為 MIBU 後端 API 伺服器**

| 專案 | 技術棧 | 位置 |
|------|--------|------|
| **後端 API** | Node.js + Express + Drizzle ORM | ✅ 本專案 |
| Expo App | React Native + NativeWind | 另一專案 |
| 官方網站 | Next.js 15 + Tailwind | 另一專案 |

**MIBU** 是專為自由行旅客打造的旅遊安全與行程規劃平台：
- **行程扭蛋模組**：隨機景點抽取、優惠券獎勵
- **旅程策劃模組**：行程規劃、策劃師諮詢服務

---

## ⚡ 強制查閱規則

> **執行任何後端任務前，必須先讀取對應記憶庫**

| 動作類型 | 必讀記憶庫 |
|---------|-----------|
| 採集/審核/升級景點 | `docs/memory-travel-gacha.md` |
| 修改資料表結構 | `docs/memory-data-schema.md` |
| 新增/修改 API | `docs/memory-api-dictionary.md` |
| 認證相關修改 | `docs/memory-auth.md` |
| 第三方 API 調用 | `docs/memory-integrations.md` |
| 金流/商品邏輯 | `docs/memory-payment-commerce.md` |
| 部署/環境變數 | `docs/memory-deployment.md` |

---

## 技術棧

| 層級 | 技術 |
|------|------|
| **後端** | Node.js + Express + Drizzle ORM |
| **管理後台** | React 19 + Vite + TypeScript + Tailwind CSS + Radix UI |
| **資料庫** | PostgreSQL (Neon-backed)，47 張表 |
| **認證** | JWT + Session (Replit Auth) |
| **支付** | Stripe + Recur (台灣本地) |
| **AI** | Google Gemini (行程智慧排序、描述生成) |
| **地圖** | Google Places API |
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
```

---

## 專案架構

```
server/                   # ⭐ 後端 API
├── index.ts              # 應用程式入口
├── routes/               # 路由層（模組化）
│   ├── index.ts          # 路由註冊中心
│   ├── auth.ts           # 認證路由
│   ├── gacha/            # 扭蛋模組 (僅 V3)
│   ├── admin/            # 管理後台 API
│   ├── merchant.ts       # 商家路由
│   ├── specialist.ts     # 專員路由
│   ├── sos.ts            # SOS 安全路由
│   ├── collections.ts    # 收藏路由
│   ├── locations.ts      # 地區路由
│   └── seo.ts            # SEO 公開路由
├── storage/              # 資料存取層
│   ├── index.ts          # Storage 匯出中心
│   ├── userStorage.ts
│   ├── placeStorage.ts
│   ├── gachaStorage.ts
│   ├── merchantStorage.ts
│   ├── subscriptionStorage.ts
│   └── ...
├── lib/                  # 工具函式庫
│   ├── placeGenerator/   # 景點生成引擎 (Gemini)
│   ├── categoryMapping.ts
│   ├── placeBlacklist.ts
│   ├── timeSlotInferrer.ts
│   └── ...
├── services/             # 業務邏輯層
│   └── configService.ts
├── scripts/              # CLI 腳本
└── replitAuth.ts         # 認證邏輯

client/                   # ⭐ 管理後台 UI
├── src/
│   ├── App.tsx           # 主應用組件
│   ├── components/       # UI 組件 (50+)
│   │   ├── ui/           # Radix UI 基礎組件
│   │   ├── AdminDashboard.tsx
│   │   └── ...
│   ├── pages/            # 頁面組件
│   │   └── admin/        # 管理員頁面
│   ├── hooks/            # React Hooks
│   └── services/         # API 服務層
└── index.html

shared/
└── schema.ts             # Drizzle ORM schema (47 張表)

docs/
└── memory-*.md           # 記憶庫文檔 (15 個)
```

---

## API 路由總覽

| 路由檔案 | API 前綴 | 職責 |
|----------|----------|------|
| `routes/auth.ts` | `/api/auth/*` | Apple/Google Sign In, JWT |
| `routes/gacha/` | `/api/gacha/*` | 扭蛋抽取（僅 V3）、Recur 金流 |
| `routes/merchant.ts` | `/api/merchant/*` | 商家管理、訂閱 |
| `routes/specialist.ts` | `/api/specialist/*` | 專員服務 |
| `routes/admin/` | `/api/admin/*` | 後台管理 API |
| `routes/sos.ts` | `/api/sos/*` | 緊急求助 |
| `routes/collections.ts` | `/api/collections/*` | 用戶收藏 |
| `routes/locations.ts` | `/api/locations/*` | 地區階層 |
| `routes/seo.ts` | `/api/seo/*` | 官網 SEO 用 |

---

## 存儲層模組

| 模組 | 職責 |
|------|------|
| `userStorage` | 用戶 CRUD、auth_identities |
| `placeStorage` | places、place_cache、place_drafts |
| `gachaStorage` | collections、gacha_ai_logs、每日額度 |
| `merchantStorage` | 商家、優惠券、認領 |
| `subscriptionStorage` | 訂閱、退款請求 |
| `locationStorage` | countries、regions、districts |
| `specialistStorage` | 專員、服務方案、訂單 |
| `sosStorage` | SOS 事件、警報 |
| `adminStorage` | 系統設定、公告 |

---

## 認證機制

```typescript
// 兩種認證方式並存
// 1. Web (Replit Auth): Session-based, connect.sid cookie
// 2. Mobile (JWT): Bearer token in Authorization header

// 路由中取得用戶 ID：
const userId = req.user?.claims?.sub || req.jwtUser?.userId || 'guest';
```

---

## 核心資料表

| 表 | 說明 |
|-----|------|
| `places` | 官方景點庫（`isActive` 控制是否出現在扭蛋） |
| `place_cache` | AI 採集暫存區（待審核） |
| `collections` | 用戶圖鑑（關聯 `gachaSessionId`） |
| `gacha_ai_logs` | AI 排序決策記錄 |
| `users` | 用戶基本資料 |
| `auth_identities` | 多種登入方式綁定 |
| `merchants` | 商家帳號 |
| `merchant_subscriptions` | 訂閱記錄 |
| `refund_requests` | 退款請求 |

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

> 📁 位置：`docs/` 目錄

### 功能模組
| 檔案 | 職權 |
|------|------|
| `memory-travel-gacha.md` | Gacha 邏輯、採集流程、七大分類 |
| `memory-merchant.md` | 商家認領、優惠券、訂閱權限 |
| `memory-specialist.md` | 策劃師服務、訂單管理 |
| `memory-admin.md` | 後台審核、公告管理 |
| `memory-user-client.md` | 背包、通知、收藏 |
| `memory-trip-planner.md` | 行程規劃、旅伴邀請 |
| `memory-web-official.md` | 官網 SEO API |

### 基礎設施
| 檔案 | 職權 |
|------|------|
| `memory-data-schema.md` | 47 張表定義 |
| `memory-api-dictionary.md` | API 端點規範 |
| `memory-auth.md` | JWT/Session/OAuth |
| `memory-payment-commerce.md` | Stripe/Recur 整合 |
| `memory-sos-safety.md` | 緊急求助系統 |
| `memory-integrations.md` | 第三方 API |
| `memory-deployment.md` | 環境變數、部署 |
| `memory-i18n.md` | 多語系支援 |

---

## 重要約定

### 七大分類
美食、住宿、景點、購物、娛樂設施、生態文化教育、遊程體驗

### 軟刪除模式
使用 `isActive = false` 而非硬刪除（places, merchants, coupons）

### 腳本穩定性原則
以下腳本**未經用戶同意不得修改**：
- `batch-parallel-collect.ts`
- `short-batch-review.ts`
- `migrate-with-descriptions.ts`
- `deep-review-places.ts`

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

---

## 開發原則

1. **全程使用中文**溝通
2. **先讀記憶庫再行動**
3. **治本優先**：修正根源而非打補丁
4. **客觀評估**：有問題直接點出
5. 完成後更新**唯一對應**的記憶庫

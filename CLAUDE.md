# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 專案定位

> **本專案為 MIBU 後端 API 伺服器**

| 專案 | 技術棧 | 位置 |
|------|--------|------|
| **後端 API** | Node.js + Express + Drizzle ORM | 本專案 |
| Expo App | React Native + NativeWind | [GitHub](https://github.com/chaosmibu-blip/Mibu-Replit-APP-) |
| 官方網站 | Next.js 15 + Tailwind | [GitHub](https://github.com/chaosmibu-blip/Mibu-Pages) |

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

> 完整記憶庫索引見 `docs/MEMORY_MAP.md`

---

## API 契約規則

> **後端是契約的唯一制定者，官網和 APP 只能依照契約實作**

### 契約文件結構
```
docs/contracts/
├── COMMON.md   ← 認證、錯誤碼、共用型別
├── WEB.md      ← 官網專用 API
└── APP.md      ← APP 專用 API
```

### 強制規則
| 動作 | 必讀文件 |
|------|----------|
| 改任何 API | `docs/contracts/` 對應的契約文件 |
| 新增 API | **先更新契約，再寫程式碼** |
| Breaking Change | 必須在 `API_CONTRACT.md` 變更日誌註明 |

---

## 技術棧

| 層級 | 技術 |
|------|------|
| **後端** | Node.js + Express + Drizzle ORM |
| **管理後台** | React 19 + Vite + Tailwind + Radix UI |
| **資料庫** | PostgreSQL (Neon)，80 張表 |
| **認證** | JWT + Session，支援 RBAC |
| **支付** | Stripe + Recur |
| **AI** | Google Gemini |
| **地圖** | Google Places API + Mapbox |

### 技術規範
- **server/**：Node.js, Express｜**禁止 React, JSX**
- **client/**：React 19, Tailwind

---

## 常用指令

```bash
# 開發
npm run dev          # 啟動開發伺服器
npm run build        # 生產環境打包
npm run db:push      # 推送 schema 到資料庫

# 景點採集流程
npx tsx server/scripts/batch-parallel-collect.ts 城市名
npx tsx server/scripts/short-batch-review.ts [數量]
npx tsx server/scripts/migrate-with-descriptions.ts [數量]
npx tsx server/scripts/deep-review-places.ts [批次大小]
```

---

## 專案架構

```
server/
├── routes/           # 路由層（模組化）
├── storage/          # 資料存取層（17 個模組）
├── lib/              # 工具函式庫
├── services/         # 業務邏輯層
├── middleware/       # Express 中間件
└── scripts/          # CLI 腳本

client/               # 管理後台 UI
shared/
├── schema.ts         # Drizzle ORM schema
└── errors.ts         # 錯誤碼定義

docs/
├── memory-*.md       # 記憶庫（22 個）
├── contracts/        # API 契約
├── SYNC_QUEUE.md     # 三端同步清單
└── MEMORY_MAP.md     # 記憶庫索引
```

> 詳細架構見對應記憶庫

---

## 重要約定

### 八大分類
美食、住宿、景點、購物、娛樂設施、生態文化教育、遊程體驗、其他

### 軟刪除模式
使用 `isActive = false` 而非硬刪除

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
| `DATABASE_URL` | PostgreSQL 連線 |
| `JWT_SECRET` | JWT 簽名 |
| `GEMINI_API_KEY` | Google Gemini |
| `STRIPE_SECRET_KEY` | Stripe 支付 |
| `GOOGLE_PLACES_API_KEY` | Google Places |

---

## 開發原則

1. **全程使用中文**溝通
2. **先讀記憶庫再行動**
3. **治本優先**：修正根源而非打補丁
4. **客觀評估**：有問題直接點出
5. 完成後更新**唯一對應**的記憶庫
6. **先契約後程式碼**

---

## 三端同步工作流程

> **後端是主要施作者**，官網/APP 只負責 UI/UX

### 同步文件
| 文件 | 用途 |
|------|------|
| `docs/sync-app.md` | 派發給 APP 的指令 |
| `docs/sync-web.md` | 派發給官網的指令 |
| `docs/SYNC_QUEUE.md` | 任務狀態追蹤 |

### 工作流程
```
後端施作完成
    ↓
寫入 sync-app.md / sync-web.md
    ↓
記錄到 SYNC_QUEUE.md（pending）
    ↓
官網/APP 執行後寫入自己的 sync-backend.md
    ↓
後端確認 sync-backend.md 後標記 completed
```

### 用戶指令
| 指令 | 作用 |
|------|------|
| 「派發同步任務給官網」 | 產出官網指令 |
| 「派發同步任務給 APP」 | 產出 APP 指令 |
| 「官網已完成 XXX」 | 標記完成 |

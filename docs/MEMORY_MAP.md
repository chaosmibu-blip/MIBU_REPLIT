# 三端記憶庫映射表

> 本文件定義後端、APP、官網三端記憶庫的對應關係，供 AI 助手快速定位跨端資源。

---

## 業務領域映射

### 扭蛋模組 (Gacha)

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-travel-gacha.md` | API、資料表、業務邏輯、七大分類 |
| APP | `memory-screens.md` → 扭蛋段落 | 扭蛋畫面、抽取流程 |
| APP | `memory-api-client.md` → Gacha API | API 呼叫方式 |
| 官網 | — | （官網不涉及扭蛋功能） |

### 商家模組 (Merchant)

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-merchant.md` | 商家 API、優惠券、訂閱、權限 |
| APP | `memory-screens.md` → 商家段落 | 商家後台畫面 |
| 官網 | `memory-merchant-portal.md` | 官網商家後台 UI |

### 認證模組 (Auth)

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-auth.md` | JWT、OAuth、Session、角色權限 |
| APP | `memory-auth-flow.md` | 登入流程、Token 管理 |
| 官網 | — | （參考後端 memory-auth.md） |

### 用戶模組 (User)

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-user-client.md` | 用戶資料、背包、通知、收藏 |
| APP | `memory-screens.md` → 用戶段落 | 個人頁面、背包 UI |
| APP | `memory-state.md` | 用戶狀態管理 |
| 官網 | — | （官網無用戶功能） |

### 行程規劃模組 (Trip Planner)

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-trip-planner.md` | 行程 API、旅伴邀請 |
| APP | `memory-screens.md` → 行程段落 | 行程規劃畫面 |
| 官網 | `memory-seo-pages.md` → 行程段落 | 行程詳情 SEO 頁面 |

### 專員模組 (Specialist)

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-specialist.md` | 專員 API、服務方案、訂單 |
| APP | `memory-screens.md` → 專員段落 | 專員後台畫面 |
| 官網 | — | （官網無專員功能） |

### SOS 安全模組

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-sos-safety.md` | SOS API、緊急聯絡人 |
| APP | `memory-screens.md` → SOS 段落 | SOS 畫面 |
| 官網 | — | （官網無 SOS 功能） |

### 管理後台 (Admin)

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-admin.md` | 管理 API、審核、公告 |
| APP | `memory-screens.md` → 管理段落 | 管理員畫面 |
| 官網 | — | （官網無管理功能） |

### SEO 公開頁面

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-web-official.md` | SEO API |
| APP | — | （APP 無 SEO 需求） |
| 官網 | `memory-seo-pages.md` | 城市、景點、行程頁面 |

### 支付模組 (Payment)

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-payment-commerce.md` | Stripe、Recur、商品邏輯 |
| APP | `memory-api-client.md` → 支付段落 | 支付 API 呼叫 |
| 官網 | `memory-merchant-portal.md` → 訂閱段落 | 商家訂閱 UI |

---

## 基礎設施映射

### 資料結構

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-data-schema.md` | 57 張表定義 |
| APP | — | （參考後端） |
| 官網 | — | （參考後端） |

### API 契約

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-api-dictionary.md` | API 端點規範 |
| 後端 | `contracts/APP.md` | APP 專用 API 契約 |
| 後端 | `contracts/WEB.md` | 官網專用 API 契約 |
| APP | `memory-api-client.md` | API 呼叫實作 |
| 官網 | — | （參考後端契約） |

### 第三方整合

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-integrations.md` | Google Places、Gemini、Twilio |
| APP | — | （參考後端） |
| 官網 | — | （參考後端） |

### 部署

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-deployment.md` | 環境變數、部署流程 |
| APP | — | （各自部署流程） |
| 官網 | — | （各自部署流程） |

### 多語系

| 端 | 記憶庫 | 內容 |
|----|--------|------|
| 後端 | `memory-i18n.md` | 多語系支援 |
| APP | — | （參考後端） |
| 官網 | — | （參考後端） |

---

## 前端專屬記憶庫

這些記憶庫沒有直接對應的後端記憶庫，是前端專屬的技術文件。

### APP 專屬

| 記憶庫 | 內容 |
|--------|------|
| `memory-components.md` | UI 元件庫 |
| `memory-assets.md` | 圖片、圖標資源 |
| `memory-state.md` | 狀態管理（Context、Store） |

### 官網專屬

| 記憶庫 | 內容 |
|--------|------|
| `memory-components.md` | UI 元件庫 |

---

## 快速查找

### 「我要改 XXX，該看哪些記憶庫？」

| 要改的功能 | 後端 | APP | 官網 |
|------------|------|-----|------|
| 扭蛋抽取 | `memory-travel-gacha.md` | `memory-screens.md`, `memory-api-client.md` | — |
| 商家優惠券 | `memory-merchant.md` | `memory-screens.md` | `memory-merchant-portal.md` |
| 用戶登入 | `memory-auth.md` | `memory-auth-flow.md` | — |
| 背包系統 | `memory-user-client.md` | `memory-screens.md`, `memory-state.md` | — |
| 行程規劃 | `memory-trip-planner.md` | `memory-screens.md` | `memory-seo-pages.md` |
| SOS 緊急 | `memory-sos-safety.md` | `memory-screens.md` | — |
| SEO 頁面 | `memory-web-official.md` | — | `memory-seo-pages.md` |
| 支付訂閱 | `memory-payment-commerce.md` | `memory-api-client.md` | `memory-merchant-portal.md` |

---

## 版本記錄

| 版本 | 日期 | 變更 |
|------|------|------|
| v1.0 | 2026-01-16 | 初版建立 |

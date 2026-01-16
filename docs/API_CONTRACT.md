# MIBU API 契約總覽

## 版本: 2.0.0
## 最後更新: 2026-01-16

---

## 契約文件

| 文件 | 用途 | 適用對象 |
|------|------|----------|
| [COMMON.md](./contracts/COMMON.md) | 認證、錯誤碼、共用型別 | 所有前端 |
| [WEB.md](./contracts/WEB.md) | SEO、商家訂閱 API | 官網 (Mibu-Pages) |
| [APP.md](./contracts/APP.md) | 扭蛋、收藏、庫存 API | APP (React Native) |

---

## 環境

| 環境 | URL |
|------|-----|
| 開發 | https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev |
| 生產 | https://gacha-travel--s8869420.replit.app |

---

## 變更規則

1. **改 API 前，先更新契約** - 不可先改程式碼再補文件
2. **Breaking Change 必須標註** - 在變更日誌註明影響範圍
3. **前端只讀契約** - 官網/APP 不可自行修改契約，發現問題要回報後端
4. **版本號規則**：
   - 大版本（X.0.0）：Breaking Change
   - 小版本（0.X.0）：新增 API
   - 修訂版（0.0.X）：修正錯誤

---

## 前端開發原則

### Backend Agnostic
- 前端只負責 UI 和 API 串接
- 後端邏輯是黑盒子，不要試圖猜測資料庫結構
- 只依賴契約文件定義的 API 和 Type

### Type Consistency
- 嚴格遵守契約中的 TypeScript 定義
- API 回傳與 Type 不符時，**先回報，不要擅自修改 Type**
- Type 不符代表後端改壞了，需後端修正

### 認證方式
| 專案 | 認證方式 |
|------|----------|
| APP | JWT Bearer Token |
| 官網 | JWT Bearer Token |
| 管理後台 | Session Cookie |

---

## 變更日誌

| 日期 | 版本 | 變更內容 | 影響範圍 |
|------|------|----------|----------|
| 2026-01-16 | 2.0.0 | 重組契約結構，拆分為 COMMON/WEB/APP | ALL |
| 2026-01-09 | 1.5.0 | 新增商家訂閱退款 API | WEB |
| 2026-01-06 | 1.4.0 | 新增 SEO trips API | WEB |
| 2026-01-02 | 1.3.0 | 新增 soft-delete/restore places | ADMIN |
| 2025-12-26 | 1.2.0 | 新增 reclassify API | ADMIN |
| 2025-12-17 | 1.0.0 | 初始版本 | ALL |

---

## 快速導航

### 認證相關
- OAuth 登入 → [COMMON.md#oauth-登入](./contracts/COMMON.md#oauth-登入)
- 錯誤碼 → [COMMON.md#錯誤碼](./contracts/COMMON.md#錯誤碼)
- 共用型別 → [COMMON.md#共用型別](./contracts/COMMON.md#共用型別)

### 官網相關
- SEO API → [WEB.md#seo-api](./contracts/WEB.md#seo-api公開無需認證)
- 商家訂閱 → [WEB.md#訂閱管理-api](./contracts/WEB.md#訂閱管理-api需認證)

### APP 相關
- 扭蛋系統 → [APP.md#扭蛋系統](./contracts/APP.md#扭蛋系統)
- 收藏系統 → [APP.md#收藏系統](./contracts/APP.md#收藏系統圖鑑)
- SOS 安全 → [APP.md#sos-安全中心](./contracts/APP.md#sos-安全中心)

---

## 內部參考文件

> 以下文件僅供後端內部使用，前端不應依賴

- `docs/memory-api-dictionary.md` - API 端點詳細說明
- `docs/memory-data-schema.md` - 資料庫 Schema 定義
- `shared/errors.ts` - 錯誤碼源碼

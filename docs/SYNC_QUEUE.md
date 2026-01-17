# 前端同步指令清單 (SYNC_QUEUE)

> **用途**：後端施作完成後，記錄需要官網/APP 同步的任務
> **使用方式**：用戶下指令「派發同步任務給官網」或「派發同步任務給 APP」

---

## 待處理 (Pending)

### [2026-01-17] Phase 1-6 API 實作完成通知

**影響範圍**: APP + WEB

**後端變更摘要**:
Phase 1-6 後端 API 全部實作完成，契約已更新至 v1.2.0，需要前端實作對應功能。

| Phase | 名稱 | API 數量 | 影響端 |
|-------|------|----------|--------|
| 1 | 經濟系統 | 6 個 | APP |
| 2 | 募資系統 | 5 個 | APP + WEB |
| 3 | 推薦系統 | 10 個 | APP |
| 4 | 用戶貢獻 | 12 個 | APP |
| 5 | 帳號系統 | 9 個 | APP |
| 6 | 商家營業時間 | 1 個 | WEB |

**APP 同步指令**:
```
請參照 contracts/APP.md v1.2.0 實作以下功能：

Phase 1 經濟系統：
- GET /api/user/level - 等級資訊頁面
- GET /api/user/experience/history - 經驗值記錄
- GET /api/user/achievements - 成就列表
- POST /api/user/achievements/:id/claim - 領取成就獎勵

Phase 2 募資系統：
- GET /api/crowdfund/campaigns - 募資活動列表
- GET /api/crowdfund/campaigns/:id - 活動詳情
- POST /api/crowdfund/contribute - IAP 贊助
- GET /api/crowdfund/my-contributions - 我的贊助記錄

Phase 3 推薦系統：
- GET /api/referral/my-code - 我的推薦碼
- POST /api/referral/apply - 使用推薦碼
- GET /api/referral/my-referrals - 推薦清單
- POST /api/referral/merchant - 推薦商家
- GET /api/referral/balance - 餘額查詢
- POST /api/referral/withdraw - 申請提現

Phase 4 用戶貢獻：
- POST /api/contribution/report-closed - 回報歇業
- POST /api/contribution/suggest-place - 建議景點
- POST /api/collection/:placeId/blacklist - 黑名單
- GET /api/contribution/pending-votes - 待投票列表
- POST /api/contribution/vote/:placeId - 投票

Phase 5 帳號系統：
- POST /api/auth/link - 綁定新身份
- GET /api/auth/linked-accounts - 已綁定帳號
- DELETE /api/auth/unlink/:provider - 解除綁定
- POST /api/specialist/apply - 申請策劃師
```

**官網同步指令**:
```
請參照 contracts/WEB.md v1.2.0 實作以下功能：

Phase 2 募資系統：
- GET /api/crowdfund/campaigns - 募資活動列表頁
- GET /api/crowdfund/campaigns/:id - 活動詳情頁
- POST /api/crowdfund/checkout - Stripe 結帳流程
- GET /api/crowdfund/my-contributions - 我的贊助（登入後）

Phase 6 商家營業時間：
- POST /api/merchant/places/new - 商家新增店家表單
  - 新增欄位：openingHours, phone, website
  - 參考 Request schema 更新表單
```

**狀態**: ⏳ pending

**需更新的記憶庫**:
- 後端：contracts/APP.md ✅, contracts/WEB.md ✅
- 官網：實作募資頁面、商家新增店家表單
- APP：實作 Phase 1-5 功能頁面

---

### [2026-01-17] 後端 CLAUDE.md v2.0 更新通知

**影響範圍**: WEB + APP（低優先級）

**後端變更摘要**:
- 後端 CLAUDE.md 更新至 v2.0
- 資料表數量：57 → 82 張表/列舉
- 記憶庫數量：15 → 22 個
- 新增 Phase 1-6 開發階段記錄
- 更新路由、Storage 模組清單

**官網同步指令**:
```
確認官網 CLAUDE.md 中引用的後端記憶庫路徑是否正確：
- memory-data-schema.md（現為 82 張表）
- memory-api-dictionary.md
- memory-auth.md
- memory-payment-commerce.md

如有引用後端表數量或記憶庫數量，請更新為最新數據。
```

**APP 同步指令**:
```
確認 APP CLAUDE.md 中引用的後端記憶庫路徑是否正確：
- memory-data-schema.md（現為 82 張表）
- memory-api-dictionary.md
- memory-auth.md
- contracts/APP.md

如有引用後端表數量或記憶庫數量，請更新為最新數據。
```

**狀態**: ⏳ pending（低優先級）

**需更新的記憶庫**:
- 後端：CLAUDE.md ✅ 已完成
- 官網：CLAUDE.md（確認引用）
- APP：CLAUDE.md（確認引用）

---

---

## 已完成 (Completed)

### [2026-01-16] API 契約結構重組 ✅

**完成時間**: 2026-01-16

**影響範圍**: WEB + APP

**後端變更摘要**:
- 新增 `docs/contracts/COMMON.md` - 認證、錯誤碼、共用型別
- 新增 `docs/contracts/WEB.md` - 官網專用 API（SEO、商家訂閱）
- 新增 `docs/contracts/APP.md` - APP 專用 API（扭蛋、收藏、庫存）
- 更新 `docs/API_CONTRACT.md` - 改為索引 + 變更日誌

**同步結果**:
- 後端：`docs/API_CONTRACT.md` ✅
- 官網：CLAUDE.md 已更新契約參照 ✅
- APP：CLAUDE.md 已更新契約參照 ✅

---

## 使用說明

### 用戶指令

| 指令 | 作用 |
|------|------|
| 「派發同步任務給官網」 | 產出官網要執行的完整指令 |
| 「派發同步任務給 APP」 | 產出 APP 要執行的完整指令 |
| 「官網已完成 XXX」 | 將任務標記為 completed |
| 「APP 已完成 XXX」 | 將任務標記為 completed |
| 「查看同步清單」 | 顯示所有 pending 任務 |

### 後端記錄格式

```markdown
### [日期] 任務標題

**影響範圍**: WEB / APP / BOTH

**後端變更摘要**:
- 變更 1
- 變更 2

**官網同步指令**:
（如果影響官網）

**APP 同步指令**:
（如果影響 APP）

**狀態**: ⏳ pending

**需更新的記憶庫**:
- 後端：哪個記憶庫
- 官網：哪個記憶庫
- APP：哪個記憶庫
```

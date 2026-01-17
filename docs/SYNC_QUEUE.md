# 前端同步指令清單 (SYNC_QUEUE)

> **用途**：後端施作完成後，記錄需要官網/APP 同步的任務
> **使用方式**：用戶下指令「派發同步任務給官網」或「派發同步任務給 APP」

---

## 待處理 (Pending)

### [2026-01-17] #005：APP UI 畫面實作 ⏳

**影響範圍**: APP

**背景說明**:
經審計發現，APP 已完成 Types + Services 層，但**缺少對應的 UI 畫面**。

**缺失清單**:

| Phase | 功能 | Types | Services | Screens | 狀態 |
|-------|------|-------|----------|---------|------|
| 1 | 經濟系統 | ✅ economy.ts | ✅ economyApi.ts | ❌ 無 | ⏳ 待實作 |
| 2 | 募資系統 | ✅ crowdfunding.ts | ✅ crowdfundingApi.ts | ❌ 無 | ⏳ 待實作 |
| 3 | 推薦系統 | ✅ referral.ts | ✅ referralApi.ts | ❌ 無 | ⏳ 待實作 |
| 4 | 用戶貢獻 | ✅ contribution.ts | ✅ contributionApi.ts | ❌ 無 | ⏳ 待實作 |
| 5 | 帳號綁定 | - | - | ❌ 無 | ⏳ 待實作 |

**同步指令**: 見 `docs/sync-app.md` #005

**狀態**: ⏳ pending

---

### [2026-01-17] #006：官網商家新增店家頁面 ⏳

**影響範圍**: WEB

**背景說明**:
經審計發現，官網 `app/merchant/places/` 只有 `page.tsx`，**缺少 new 頁面**（商家新增店家表單）。

**缺失清單**:

| 功能 | API 層 | 頁面 | 狀態 |
|------|--------|------|------|
| 商家新增店家 | ✅ src/features/crowdfund/ | ❌ app/merchant/places/new/ | ⏳ 待實作 |

**同步指令**: 見 `docs/sync-web.md` #005

**狀態**: ⏳ pending

---

## 已完成 (Completed)

### [2026-01-17] Phase 1-6 API 實作完成通知 ⚠️ 部分完成

**完成時間**: 2026-01-17

**影響範圍**: APP + WEB

**後端變更摘要**:
Phase 1-6 後端 API 全部實作完成，契約已更新至 v1.2.0。

| Phase | 名稱 | API 數量 | 影響端 |
|-------|------|----------|--------|
| 1 | 經濟系統 | 6 個 | APP |
| 2 | 募資系統 | 5 個 | APP + WEB |
| 3 | 推薦系統 | 10 個 | APP |
| 4 | 用戶貢獻 | 12 個 | APP |
| 5 | 帳號系統 | 9 個 | APP |
| 6 | 商家營業時間 | 1 個 | WEB |

**同步結果（2026-01-17 審計更新）**:
- 後端：contracts/APP.md ✅, contracts/WEB.md ✅
- 官網：
  - 募資頁面 ✅（app/crowdfund/ 完整）
  - 商家新增店家頁面 ❌（缺 app/merchant/places/new/）
- APP：
  - Types 層 ✅（4 個類型檔案）
  - Services 層 ✅（4 個 API 服務檔案）
  - UI 畫面 ❌（缺 5 個 Screens）

---

### [2026-01-17] 後端 CLAUDE.md v2.0 更新通知 ✅

**完成時間**: 2026-01-17

**影響範圍**: WEB + APP

**後端變更摘要**:
- 後端 CLAUDE.md 更新至 v2.0
- 資料表數量：57 → 80 張表/列舉（刪除 userProfiles, merchantProfiles）
- 記憶庫數量：15 → 22 個
- 新增 Phase 1-6 開發階段記錄

**同步結果**:
- 後端：CLAUDE.md ✅
- 官網：CLAUDE.md 已確認 ✅
- APP：CLAUDE.md 已確認 ✅

---

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

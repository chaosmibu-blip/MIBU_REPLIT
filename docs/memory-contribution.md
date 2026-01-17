# 用戶貢獻系統記憶庫 (Contribution System)

## 模組範圍

用戶協助維護景點資料品質：回報歇業、建議景點、排除低品質景點。

---

## 貢獻類型

| 類型 | 說明 | 獎勵 |
|------|------|------|
| 回報歇業 | 回報景點已關閉/搬遷 | 經驗值 |
| 建議景點 | 建議新增景點到系統 | 經驗值 |
| 排除投票 | 標記黑名單 + 參與投票 | 經驗值 |

---

## 回報歇業

### 流程

```
用戶發現景點已歇業
         │
         ▼
點擊「回報歇業」按鈕
         │
         ▼
選擇原因：
├── 已永久關閉
├── 暫時歇業
├── 已搬遷
└── 資訊錯誤
         │
         ▼
可選：補充說明
         │
         ▼
提交回報
         │
         ▼
進入審核流程
```

### 審核流程

```
回報提交
    │
    ▼
AI 預審
├── 檢查是否多人回報同一景點
├── 交叉比對 Google Places API 狀態
└── 判斷可信度
    │
    ├── 高可信度 → 自動通過
    ├── 中可信度 → 社群投票
    └── 低可信度 → 人工審核
    │
    ▼
審核通過 → 景點標記為歇業（軟刪除）
    │
    ▼
用戶獲得經驗值
```

### 獎勵

| 結果 | 經驗值 |
|------|--------|
| 回報通過 | 40 |
| 每日上限 | 90（約 2-3 次）|

---

## 建議景點

### 流程

```
用戶發現好景點不在系統中
         │
         ▼
點擊「建議景點」
         │
         ▼
填寫資訊：
├── 景點名稱（必填）
├── 地址/位置（必填）
├── 分類（必填）
├── 描述（選填）
└── Google Maps 連結（選填）
         │
         ▼
提交建議
         │
         ▼
進入審核流程
```

### 審核流程

```
建議提交
    │
    ▼
AI 預審
├── 檢查是否已存在（去重）
├── 檢查是否符合七大分類
├── 檢查是否為合法商業/景點
└── 判斷品質
    │
    ├── 高品質 → 進入社群投票
    ├── 中品質 → 人工審核
    └── 低品質/垃圾 → 拒絕
    │
    ▼
社群投票（3 票通過 / 3 票否決 / 72hr 超時）
    │
    ├── 通過 → 進入 place_drafts
    ├── 否決 → 拒絕 + 通知用戶
    └── 超時 → 人工審核
    │
    ▼
place_drafts → AI 補充描述 → places
    │
    ▼
用戶獲得經驗值
```

### 獎勵

| 結果 | 經驗值 |
|------|--------|
| 建議採納 | 120 |
| 每日上限 | 240（約 2 次）|

---

## 黑名單排除機制

### 用戶標記

```
用戶抽到不喜歡的景點
         │
         ▼
點擊「加入黑名單」🚫
         │
         ▼
系統記錄：
├── 用戶個人黑名單（該用戶不再抽到）
└── 全域統計（累計多少人標記）
```

### 全域排除規則

| 門檻 | 效果 |
|------|------|
| 50 人/月 標記 | 降低該景點抽取權重 (×0.3) |
| 100 人/月 標記 | 軟刪除（isActive = false）|

### 統計重置

- 每月 1 日重置當月統計
- 已軟刪除的景點不會自動恢復
- 可由 Admin 手動恢復

### 排除投票

用戶可以參與「是否排除某景點」的投票：

```
景點達到 30 人標記
         │
         ▼
進入「待投票」狀態
         │
         ▼
其他用戶可投票：
├── 「應該排除」
└── 「不應排除」
         │
         ▼
72hr 內：
├── 排除票 ≥ 20 → 提前軟刪除
├── 不排除票 ≥ 20 → 取消待投票狀態
└── 未達門檻 → 繼續累計
```

### 獎勵

| 行為 | 經驗值 |
|------|--------|
| 參與排除投票 | 5 |
| 每日上限 | 25（約 5 次）|

---

## 審核機制總覽

### 三層審核

```
      ┌─────────────┐
      │  用戶提交   │
      └──────┬──────┘
             │
             ▼
      ┌─────────────┐
      │  AI 預審    │ ← Gemini 判斷
      │  (Layer 1)  │
      └──────┬──────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
 自動通過  社群投票   人工審核
           (Layer 2) (Layer 3)
             │
             ▼
      ┌─────────────┐
      │  最終結果   │
      └─────────────┘
```

### AI 預審（Layer 1）

| 檢查項目 | 說明 |
|----------|------|
| 重複檢查 | 是否已存在相同景點/回報 |
| 分類檢查 | 是否符合七大分類 |
| 品質檢查 | 是否為垃圾/廣告/不當內容 |
| 可信度 | 綜合判斷通過機率 |

### 社群投票（Layer 2）

| 參數 | 值 |
|------|-----|
| 通過門檻 | 3 票同意 |
| 否決門檻 | 3 票反對 |
| 超時時間 | 72 小時 |
| 投票資格 | Lv.7+ 用戶 |

### 人工審核（Layer 3）

- 僅處理爭議案例
- Admin 後台操作
- 最終決定權

---

## 成就連動

| 成就 | 條件 | 獎勵 |
|------|------|------|
| 品質守護者 | 回報 10 次通過 | 「守護者」徽章 |
| 景點探險家 | 建議 3 景點採納 | 「探險家」頭框 |
| 正義使者 | 參與 50 次排除投票 | 「正義」特效 |

---

## API 設計

### 回報歇業

| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | `/api/contribution/report-closed` | 回報歇業 |
| GET | `/api/contribution/my-reports` | 我的回報記錄 |

### 建議景點

| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | `/api/contribution/suggest-place` | 建議景點 |
| GET | `/api/contribution/my-suggestions` | 我的建議記錄 |

### 黑名單

| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | `/api/collection/:placeId/blacklist` | 加入黑名單 |
| DELETE | `/api/collection/:placeId/blacklist` | 移除黑名單 |
| GET | `/api/collection/blacklist` | 我的黑名單 |

### 排除投票

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/api/contribution/pending-votes` | 待投票景點列表 |
| POST | `/api/contribution/vote/:placeId` | 投票（排除/不排除）|

### 社群投票（建議景點）

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/api/contribution/pending-suggestions` | 待投票建議列表 |
| POST | `/api/contribution/vote-suggestion/:id` | 投票（通過/否決）|

### 管理（Admin）

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/api/admin/contribution/reports` | 回報審核列表 |
| PATCH | `/api/admin/contribution/reports/:id` | 審核回報 |
| GET | `/api/admin/contribution/suggestions` | 建議審核列表 |
| PATCH | `/api/admin/contribution/suggestions/:id` | 審核建議 |
| GET | `/api/admin/contribution/blacklist-stats` | 黑名單統計 |
| POST | `/api/admin/contribution/restore-place/:id` | 恢復軟刪除景點 |

---

## 資料表設計

```typescript
// 歇業回報
placeReports {
  id: serial PK,
  placeId: number FK,
  userId: string FK,
  reason: 'permanently_closed' | 'temporarily_closed' | 'relocated' | 'info_error',
  description: string | null,
  status: 'pending' | 'approved' | 'rejected',
  aiScore: number | null,     // AI 可信度分數
  reviewedBy: string | null,
  reviewedAt: timestamp | null,
  rewardPaid: boolean,
  createdAt: timestamp
}

// 景點建議
placeSuggestions {
  id: serial PK,
  userId: string FK,
  placeName: string,
  address: string,
  city: string,
  country: string,
  category: string,
  description: string | null,
  googleMapsUrl: string | null,
  status: 'pending_ai' | 'pending_vote' | 'pending_review' | 'approved' | 'rejected',
  aiScore: number | null,
  voteApprove: number default 0,
  voteReject: number default 0,
  voteDeadline: timestamp | null,
  reviewedBy: string | null,
  reviewedAt: timestamp | null,
  linkedPlaceId: number | null, // 採納後關聯的 place ID
  rewardPaid: boolean,
  createdAt: timestamp
}

// 建議投票記錄
suggestionVotes {
  id: serial PK,
  suggestionId: number FK,
  userId: string FK,
  vote: 'approve' | 'reject',
  createdAt: timestamp
}
// UNIQUE: (suggestionId, oduserId)

// 用戶黑名單
userPlaceBlacklists {
  id: serial PK,
  userId: string FK,
  placeId: number FK,
  createdAt: timestamp
}
// UNIQUE: (userId, placeId)

// 景點黑名單統計（全域）
placeDislikeStats {
  placeId: number PK,
  monthlyDislikeCount: number default 0,
  totalDislikeCount: number default 0,
  lastResetAt: timestamp,
  status: 'normal' | 'reduced' | 'pending_vote' | 'excluded',
  updatedAt: timestamp
}

// 排除投票記錄
placeExclusionVotes {
  id: serial PK,
  placeId: number FK,
  userId: string FK,
  vote: 'exclude' | 'keep',
  createdAt: timestamp
}
// UNIQUE: (placeId, userId)

// 用戶每日貢獻統計（用於限額）
userDailyContributions {
  id: serial PK,
  userId: string,
  date: date,
  reportCount: number default 0,
  suggestionCount: number default 0,
  voteCount: number default 0,
  createdAt: timestamp
}
// UNIQUE: (userId, date)
```

---

## 抽卡時的權重調整

```typescript
// 在 gacha-v3.ts 中

async function getPlaceWeight(placeId: number, userId: string): Promise<number> {
  // 1. 檢查用戶個人黑名單
  const isBlacklisted = await checkUserBlacklist(userId, placeId);
  if (isBlacklisted) return 0; // 完全排除

  // 2. 檢查全域狀態
  const stats = await getPlaceDislikeStats(placeId);

  if (stats.status === 'excluded') return 0;
  if (stats.status === 'reduced') return 0.3; // 降低 70%

  return 1; // 正常權重
}
```

---

## 與其他模組的關聯

- **經濟系統**: 貢獻通過 → 觸發經驗值
- **成就系統**: 貢獻者成就線
- **扭蛋模組**: 黑名單影響抽取權重
- **景點模組**: 回報 → 軟刪除、建議 → place_drafts

---

## 開發狀態

### 已完成
- [x] 歇業回報資料表（`place_reports`）
- [x] 景點建議資料表（`place_suggestions`）
- [x] 建議投票資料表（`suggestion_votes`）
- [x] 排除投票資料表（`place_exclusion_votes`）
- [x] 每日貢獻統計資料表（`user_daily_contributions`）
- [x] Storage 層（`contributionStorage.ts`）
- [x] API: `POST /api/contribution/report-closed` 回報歇業
- [x] API: `GET /api/contribution/my-reports` 我的回報記錄
- [x] API: `POST /api/contribution/suggest-place` 建議景點
- [x] API: `GET /api/contribution/my-suggestions` 我的建議記錄
- [x] API: `POST /api/collection/:placeId/blacklist` 加入黑名單
- [x] API: `DELETE /api/collection/:placeId/blacklist` 移除黑名單
- [x] API: `GET /api/collection/blacklist` 我的黑名單
- [x] API: `GET /api/contribution/pending-votes` 待投票景點列表
- [x] API: `POST /api/contribution/vote/:placeId` 排除投票
- [x] API: `GET /api/contribution/pending-suggestions` 待投票建議列表
- [x] API: `POST /api/contribution/vote-suggestion/:id` 建議投票
- [x] API: `GET /api/contribution/stats` 我的貢獻統計
- [x] 每日上限檢查
- [x] 經驗獎勵發放（與 economyStorage 整合）

### 待開發
- [ ] AI 預審整合（Gemini 審核）
- [ ] 每月統計重置（定時任務）
- [ ] 抽卡權重調整（在扭蛋模組整合）
- [ ] Admin API: 回報審核
- [ ] Admin API: 建議審核
- [ ] Admin API: 恢復軟刪除景點

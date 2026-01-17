# 🌐 官網同步指令

> 此檔案由後端自動更新，官網 Claude Code 讀取後執行

---

## 最新更新

### 2026-01-17 #003：🚀 Phase 2 & 6 API 實作完成

**變更類型**: 🔴 重大更新（新功能 API）

**背景說明**:
後端已完成 Phase 2 募資系統和 Phase 6 商家營業時間 API，契約已更新至 v1.2.0。官網需要實作對應功能頁面。

**API 契約版本**: `contracts/WEB.md` v1.2.0

---

#### 官網需要做的事

##### Phase 2 募資系統（4 個 API）

| API | 功能 | 頁面建議 |
|-----|------|----------|
| `GET /api/crowdfund/campaigns` | 募資活動列表 | `/crowdfund` 募資首頁 |
| `GET /api/crowdfund/campaigns/:id` | 活動詳情 | `/crowdfund/[id]` 活動詳情頁 |
| `POST /api/crowdfund/checkout` | Stripe 結帳 | 詳情頁「贊助」按鈕，跳轉 Stripe Checkout |
| `GET /api/crowdfund/my-contributions` | 我的贊助（登入後） | 個人頁面「我的贊助記錄」 |

**募資頁面 UI 建議**:

```
/crowdfund 首頁
├── 進行中活動（status: active）- 卡片列表
│   └── 進度條、贊助人數、目標金額
├── 即將開始（status: upcoming）- 預告區
└── 已完成/已上線（status: completed/launched）- 歷史區

/crowdfund/[id] 詳情頁
├── 國家名稱、旗幟圖示
├── 進度資訊（currentAmount / goalAmount）
├── 贊助按鈕 → 呼叫 POST /api/crowdfund/checkout
├── 最近贊助者列表（recentContributors）
└── 贊助排行榜（topContributors）
```

##### Phase 6 商家新增店家（1 個 API 更新）

| API | 功能 | 表單更新 |
|-----|------|----------|
| `POST /api/merchant/places/new` | 商家新增店家 | 新增營業時間欄位 |

**表單新增欄位**:

```typescript
interface CreatePlaceRequest {
  // 既有欄位
  placeName: string;
  address: string;
  city: string;
  district?: string;
  category: string;
  subcategory?: string;
  description?: string;
  locationLat?: number;
  locationLng?: number;

  // 新增欄位（Phase 6）
  openingHours?: {
    weekdayText?: string[];   // ["星期一: 09:00–21:00", ...]
    periods?: any[];          // Google Places API 格式
  };
  phone?: string;
  website?: string;
}
```

**UI 建議**:

```
商家新增店家表單
├── 基本資訊（既有）
│   ├── 店名、地址、城市、區域
│   ├── 分類、子分類
│   └── 描述、座標
└── 新增欄位（Phase 6）
    ├── 營業時間選擇器
    │   └── 週一到週日時間區段
    ├── 電話輸入框
    └── 網站 URL 輸入框
```

---

#### 實作優先順序建議

1. **高優先級**：Phase 6 商家表單更新（影響商家新增流程）
2. **中優先級**：Phase 2 募資首頁、詳情頁
3. **低優先級**：募資登入後功能（我的贊助記錄）

---

#### 驗證方式

1. 商家新增店家表單可填寫營業時間、電話、網站
2. 募資活動列表頁正常顯示
3. Stripe 結帳流程可正常跳轉
4. 錯誤處理符合 `contracts/COMMON.md` 規範

---

#### 完成後

1. Commit + Push
2. 在 `docs/sync-backend.md` 記錄完成狀態（#003）
3. 再次 Commit + Push

---

### 2026-01-17 #004：📝 後端 CLAUDE.md v2.0 更新

**變更類型**: 🟡 文件更新（低優先級）

**背景說明**:
後端 CLAUDE.md 更新至 v2.0，資料表數量、記憶庫數量有變更。

**變更內容**:
- 資料表數量：57 → 82 張表/列舉
- 記憶庫數量：15 → 22 個
- 新增 Phase 1-6 開發階段記錄
- 更新路由、Storage 模組清單

---

#### 官網需要做的事

##### 檢查 CLAUDE.md 引用

如果官網的 CLAUDE.md 有引用後端資料：

```markdown
# 檢查並更新以下數據（如有引用）：
- 後端資料表數量：82 張表/列舉
- 後端記憶庫數量：22 個
- API 契約版本：v1.2.0
```

##### 確認契約參照路徑

```markdown
# 確認以下路徑正確：
- memory-data-schema.md（現為 82 張表）
- memory-api-dictionary.md
- memory-auth.md
- memory-payment-commerce.md
- contracts/WEB.md（v1.2.0）
```

---

#### 完成後

1. 如有更新：Commit + Push
2. 在 `docs/sync-backend.md` 記錄完成狀態（#004）

---

### 2026-01-16 #002：🧹 文件清理 - 歸檔舊文件

**變更類型**: 🟡 文件整理（非 API 變更）

**背景說明**:
後端已完成文件清理，將舊規劃文件移到 `archive/`，並拆分過大的記憶庫。官網也需要檢查並清理不必要的文件。

---

#### 官網需要做的事

##### 1. 檢查根目錄的 .md 文件

掃描以下文件，評估是否需要歸檔：

| 文件 | 判斷標準 | 建議動作 |
|------|----------|----------|
| `ARCHITECTURE_AUDIT_REPORT.md` | 一次性報告 | 移到 `docs/archive/` |
| `BACKEND_UPGRADE_INSTRUCTION.md` | 可能已過時 | 評估後歸檔或保留 |
| `design_guidelines.md` | 設計規範 | 如仍在使用則保留 |

##### 2. 建立 `docs/archive/` 目錄（如果有需要歸檔的文件）

```bash
mkdir -p docs/archive
mv ARCHITECTURE_AUDIT_REPORT.md docs/archive/
```

##### 3. 檢查記憶庫大小

```bash
ls -lh docs/memory-*.md
```

如果有超過 30KB 的記憶庫，考慮拆分。

##### 4. 更新 CLAUDE.md（如果有文件變動）

確保「強制查閱規則」指向正確的記憶庫。

---

#### 驗證方式

1. 一次性報告已移到 `docs/archive/`
2. 記憶庫大小都在合理範圍（<30KB）
3. CLAUDE.md 的強制查閱規則指向正確文件

---

#### 完成後

1. Commit + Push
2. 在 `docs/sync-backend.md` 記錄完成狀態（#002）
3. 再次 Commit + Push

---

### 2026-01-16 #001：🔧 架構升級 - 三端協作規範

**變更類型**: 🔴 架構升級（非 API 變更）

**背景說明**:
後端已建立「三端協作規範」，定義後端/APP/官網的協作框架。官網需要配合建立對應文件。

**協作規範文件位置**:
- 後端：`docs/COLLABORATION.md`
- GitHub：https://github.com/chaosmibu-blip/MIBU_REPLIT/blob/main/docs/COLLABORATION.md

---

#### 官網需要做的事

##### 1. 建立 `docs/` 目錄和 `docs/sync-backend.md`

用途：回報後端同步指令的完成狀態

```markdown
# 🔄 後端同步回報

> 官網完成後端同步指令後，在此記錄狀態

---

## 最新回報

### 2026-01-16 #001

| 項目 | 內容 |
|------|------|
| 來源 | 後端 sync-web.md #001 |
| 收到時間 | YYYY-MM-DD HH:MM |
| 完成時間 | YYYY-MM-DD HH:MM |
| 狀態 | ✅ 完成 / 🔄 進行中 / ❌ 有問題 |

### 完成項目
- [ ] 建立 docs/ 目錄
- [ ] 建立 docs/sync-backend.md
- [ ] 更新 CLAUDE.md 加入「三端協作」段落
- [ ] 建立記憶庫

### 異常回報
（如果有問題，寫在這裡讓後端 AI 知道）

---

## 歷史回報

（舊的回報往下移動）
```

##### 2. 更新 CLAUDE.md

在 CLAUDE.md 開頭的「專案定位」段落之後，加入以下內容：

```markdown
## 三端協作

> - 後端 GitHub: https://github.com/chaosmibu-blip/MIBU_REPLIT
> - APP GitHub: https://github.com/chaosmibu-blip/Mibu-Replit-APP-
> - 官網 GitHub: https://github.com/chaosmibu-blip/Mibu-Pages
> - 協作規範：後端 `docs/COLLABORATION.md`
> - 同步機制：
>   - 讀取：後端 `docs/sync-web.md`
>   - 回報：本專案 `docs/sync-backend.md`
```

##### 3. 建立記憶庫

根據官網現有功能，建議建立以下記憶庫：

| 檔案 | 職權 | 跨端對應 |
|------|------|----------|
| `docs/memory-seo-pages.md` | SEO 公開頁面（城市、景點、行程） | 後端 `memory-web-official.md` |
| `docs/memory-merchant-portal.md` | 商家後台（登入、儀表板、優惠券） | 後端 `memory-merchant.md` |
| `docs/memory-components.md` | 共用元件 | （前端專屬） |

每個記憶庫開頭加入：

```markdown
> **跨端對應**
> - 後端：`docs/memory-xxx.md`（對應的後端記憶庫）
> - APP：（如有對應）
```

##### 4. 補齊 CLAUDE.md 的「強制查閱規則」

```markdown
## 強制查閱規則

| 動作類型 | 必讀記憶庫 |
|---------|-----------|
| 修改 SEO 頁面 | `docs/memory-seo-pages.md` |
| 修改商家後台 | `docs/memory-merchant-portal.md` |
| 修改共用元件 | `docs/memory-components.md` |
| API 相關修改 | 後端 `docs/contracts/WEB.md` |
```

---

#### 驗證方式

1. `docs/` 目錄存在
2. `docs/sync-backend.md` 檔案存在
3. CLAUDE.md 包含「三端協作」和「強制查閱規則」段落
4. 至少有一個記憶庫檔案

---

#### 完成後

1. Commit + Push
2. 在 `docs/sync-backend.md` 記錄完成狀態
3. 再次 Commit + Push

---

## 歷史記錄

(舊的同步指令往下移動)

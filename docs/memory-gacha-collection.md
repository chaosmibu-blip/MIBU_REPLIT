# 景點採集系統記憶庫 (Place Collection Module)

> **跨端對應**
> - APP：`memory-screens.md` → 管理段落（如有）
> - 官網：無

---

## 批次採集系統（取代 AutoDraft）

> ⚠️ **已移除功能**：AutoDraft 自動填充和自動 AI 審查已於 2025-12-25 移除

### 目前採集方式
- 使用管理後台「批次採集地點」頁面手動觸發
- API: `POST /api/admin/places/batch-generate`
- 流程: AI 關鍵字擴散 → Google 搜尋 → **規則映射分類** → AI 批次生成描述 → 存入 place_cache

### 關鍵字擴散系統
- **檔案**：`server/lib/placeGenerator.ts` → `expandKeywords()`
- **功能**：用 Gemini AI 將基礎關鍵字擴散成多個子關鍵字
- **範例**：輸入「火鍋」→ 擴散為「麻辣鍋、涮涮鍋、石頭火鍋、薑母鴨」
- **用途**：增加 Google 搜尋覆蓋率，採集更多相關地點
- **呼叫時機**：管理後台批次採集時自動執行

### 黑名單/白名單過濾機制

#### 1. 前置過濾（Pre-filtering）
- **檔案**：`server/scripts/short-batch-review.ts`
- **時機**：AI 審核前，先排除明顯不適合的地點
- **黑名單關鍵字**（`EXCLUDE_KEYWORDS`）：
```
區公所、市公所、戶政事務所、警察局、派出所、
衛生所、殯儀館、火葬場、納骨塔、墓園、
停車場、加油站、焚化爐、銀行分行、郵局
資材行、水電行、汽車修理、輪胎行、洗衣店、乾洗店、
當舖、禮儀公司、快餐店、包車、租車、計程車行、客運站、
影城、KTV、健身房
```
- **通用名稱黑名單**（`EXACT_EXCLUDE_NAMES`，2025-12-29 新增）：
```
台灣小吃、台灣美食、台灣料理、台灣餐廳、
小吃店、美食店、餐廳、飯店、旅館、民宿
```
- **效果**：減少 AI 審核負擔，提升效率
- **解析失敗處理**（2025-12-29 修正）：AI 回傳無法解析時，該批資料直接刪除（非預設通過）

#### 2. 刪除黑名單 API（2025-12-29 新增）
- **端點**：`GET /api/admin/delete-blacklist-places?key=mibu2024migrate`
- **功能**：查詢並刪除符合黑名單關鍵字的 places 資料
- **保留名單**：蘭城百匯、森本屋（雖含黑名單關鍵字但有特色）
- **參數**：`confirm=yes` 執行刪除，否則僅預覽

#### 3. 類別黑名單
```
殯葬、政府機關、醫療機構、金融服務、教育行政
```

### 分類邏輯（2025-12-25 改版）
1. **Category 判斷**：`determineCategory(primaryType, googleTypes)` - 規則映射，100% 成功
2. **Subcategory 判斷**：`determineSubcategory(primaryType, googleTypes)` - 規則映射
3. **描述生成**：`batchGenerateDescriptionsOnly()` - AI 只生成描述（不做分類）
4. **Fallback 模板**：AI 失敗時用 `generateFallbackDescription()` 智能模板（非通用文字）

### 七大分類與子分類結構（2025-12-30 更新）
- **檔案**：`server/lib/categoryMapping.ts`
- **對照來源**：Google Places API 的 `primaryType` 和 `types[]`
- **重要變更**：移除「活動」類別（時效性強），活動相關 Google Types 已重新映射到其他類別

| Category | Google Types 範例 | Subcategory 範例 |
|----------|------------------|-----------------|
| 美食 | restaurant, cafe, bakery, bar | 在地早餐、火鍋、燒烤、甜點、熱炒、素食 |
| 住宿 | lodging, hotel, hostel, campground | 星級飯店、民宿、露營、青年旅社 |
| 景點 | park, temple, beach, monument | 城市公園、宗教聖地、自然風光、特色建築 |
| 購物 | store, shopping_mall, market | 百貨公司、夜市、特色商店、在地超市 |
| 娛樂設施 | amusement_park, arcade | 主題樂園、遊樂園區 |
| 生態文化教育 | museum, zoo, aquarium, library | 博物館、生態園區、文化中心 |
| 遊程體驗 | tourist_attraction, farm, spa, hiking | 一日遊、DIY體驗、農場體驗、登山步道、SPA按摩 |

> 📌 **活動類別 Types 重新映射**：
> - `spa`, `massage`, `hot_spring` → 遊程體驗
> - `hiking_area`, `fishing_charter` → 遊程體驗
> - `sports_complex`, `swimming_pool` → 娛樂設施
> - `gym`, `karaoke`, `movie_theater`, `bowling_alley` → 黑名單

### place_cache 資料結構
```typescript
{
  category: '美食',           // 七大類之一
  subCategory: '在地早餐',     // 規則映射產生
  googleTypes: 'restaurant,cafe',  // Google 原始類型（保留追溯）
  primaryType: 'restaurant',       // Google 主要類型
  aiReviewed: false,          // 是否已通過 AI 審核
}
```

### 行程卡顯示標籤
- 前端使用 **`category`** 欄位透過 `getCategoryLabel()` 顯示
- 資料庫統一使用中文七大類：美食、住宿、景點、購物、娛樂設施、生態文化教育、遊程體驗（2025-12-30 移除活動類別）

### 核心腳本（6 個）
```bash
# 1. 批次採集（支援關鍵字模式與區域指定）
npx tsx server/scripts/batch-parallel-collect.ts 城市名 [類別] [--mode=generic|local|mixed] [--district=區域名]

# 2. AI 審核（place_cache 表）
npx tsx server/scripts/short-batch-review.ts [數量]

# 3. 升級到正式表（含描述生成）
npx tsx server/scripts/migrate-with-descriptions.ts [數量]

# 4. 補描述（選用，已廢棄）
npx tsx server/scripts/generate-descriptions.ts [城市] [數量]  # ⚠️ 請改用 migrate-with-descriptions.ts

# 5. 深度審核（places 正式表）⭐ 2026-01-01 新增
npx tsx server/scripts/deep-review-places.ts [批次大小] [起始ID]

# 6. District 欄位審查 ⭐ 2026-01-08 新增
npx tsx server/scripts/review-district.ts              # 掃描並顯示問題
npx tsx server/scripts/review-district.ts --fix        # 執行規則修正
npx tsx server/scripts/review-district.ts --fix --ai   # 規則+AI 修正
```

### District 欄位審查腳本（2026-01-08 新增）

#### 用途
審查並修正 `places` 表中不符合標準行政區名稱的 `district` 欄位值。

#### 修正邏輯（優先級由高到低）
1. **已知規則修正**：台→臺、簡→繁 轉換（如 `台東市` → `臺東市`）
2. **正則提取**：從 `address` 欄位中提取有效的行政區名稱
3. **AI 智慧提取**：使用 Gemini AI 從地址中識別行政區

#### 修正效果（2026-01-08 首次執行）
- 修正前無效值：2,427 筆
- 修正後：0 筆
- 修正率：100%

#### 驗證標準
- 所有 `district` 值必須存在於 `districts` 表的 `name_zh` 欄位
- 不接受簡體字、截斷值、地址混入等無效格式

### 深度審核腳本（2026-01-01 新增）

#### 用途
對已入庫的 `places` 表資料進行重新審核，修正分類錯誤、清除漏網之魚。

#### 與採集時審核的差異
| 項目 | short-batch-review.ts | deep-review-places.ts |
|------|----------------------|----------------------|
| 對象 | `place_cache` 表（待審） | `places` 表（正式） |
| 時機 | 採集後、升級前 | 資料入庫後 |
| 目的 | 過濾垃圾資料 | 修正分類 + 清除漏網 |
| AI 模型 | Gemini 3 | Gemini 3 |

#### 審核動作
| 動作 | 說明 |
|------|------|
| `keep` | 保持不變 |
| `fix` | 修正 category/subcategory |
| `delete` | 軟刪除（is_active = false） |

#### 傳送給 AI 的資訊
- place_name（地點名稱）
- category + subcategory（現有分類）
- description（描述）
- address（地址）
- google_types（Google 原始類型）
- opening_hours（營業時間）⭐

#### 使用方式
```bash
# 從頭開始，每批 1000 筆（預設）
npx tsx server/scripts/deep-review-places.ts

# 從 ID=5000 開始
npx tsx server/scripts/deep-review-places.ts 1000 5000
```

#### 配置
| 參數 | 數值 |
|------|------|
| AI 模型 | gemini-3-pro-preview |
| maxOutputTokens | 65536（最大值） |
| temperature | 0.1 |
| 預設批次大小 | 1000 筆 |

#### 費用預估（35,661 筆）
| 項目 | 費用 |
|------|------|
| 輸入 | ~$8 |
| 輸出 | ~$13 |
| **總計** | **~NT$670** |

**區域補強採集範例**：
```bash
# 補強桃園市觀音區
npx tsx server/scripts/batch-parallel-collect.ts 桃園市 --district=觀音區 --mode=mixed
```

### 執行規範
- **Timeout**：3,600,000 毫秒（1 小時）
- **原因**：大量資料審核可能耗時 30+ 分鐘，避免中斷

### 標準統計報告格式
每輪流程完成後，輸出以下報告：

```
📊 [城市] 採集統計報告
├─ 採集：通用 X 筆 + 在地 Y 筆 = 總計 Z 筆
├─ 審核：通過 X 筆 / 失敗 Y 筆 / 前置過濾 Z 筆（通過率 XX%）
├─ 升級：新增 X 筆 / 跳過 Y 筆（重複）
├─ 正式表總數：X 筆
├─ 類別分布：美食 X / 住宿 Y / 景點 Z / ...
└─ 子行政區分布：
   | 區域 | 筆數 |
   |------|------|
   | XX區 | 150 |
   | YY區 | 35 |
```

### 關鍵字模式（2025-12-30 新增）
| 模式 | 說明 | 範例關鍵字 |
|------|------|-----------|
| `generic` | 只生成通用分類關鍵字 | 火鍋、咖啡廳、民宿、夜市 |
| `local` | 只生成在地特色關鍵字 | 台南牛肉湯、安平老街、赤崁擔仔麵 |
| `mixed` | 混合兩種（預設） | 熱炒店、三星蔥料理、漁港海鮮 |

**使用策略**：建議先用 `generic` 採集通用景點，再用 `local` 補充在地特色，避免關鍵字重複。

### 標準採集流程（詳細）

```
第 1 步：批次採集
腳本：batch-parallel-collect.ts
輸入：城市名稱、[可選類別]
輸出：寫入 place_cache 表（ai_reviewed = false）
動作：7 類別各 10 關鍵字，Google Places API 採集

↓

第 2 步：AI 審核
腳本：short-batch-review.ts
輸入：place_cache 中 ai_reviewed = false 的資料
輸出：更新 ai_reviewed = true（通過）或刪除（不通過）
動作：黑名單過濾 + Gemini AI 品質審核

↓

第 3 步：升級到正式表
腳本：migrate-with-descriptions.ts
輸入：place_cache 中 ai_reviewed = true 的資料
輸出：寫入 places 表（正式卡池）+ 刪除 cache 原資料
動作：去重檢查 + 按類別批次生成 AI 描述

↓

第 4 步：補描述（選用）
腳本：generate-descriptions.ts
輸入：places 中 description = null 的資料
輸出：更新 description 欄位
用途：修復遺漏或失敗的描述
```

## 注意事項
- `isActive = false` 的景點不會出現在扭蛋結果
- 原子更新 `pull_count` 防止 Race Condition
- 無 API 快取，每次都重新隨機選取

## ⚠️ 腳本穩定性原則（2026-01-01 新增）
> **未經用戶同意，不得隨意修改以下腳本**

| 腳本 | 用途 | 狀態 |
|------|------|------|
| `batch-parallel-collect.ts` | 批次採集 | 🔒 穩定 |
| `short-batch-review.ts` | AI 審核（place_cache） | 🔒 穩定 |
| `migrate-with-descriptions.ts` | 升級到正式表 | 🔒 穩定 |
| `deep-review-places.ts` | 深度審核（places） | 🔒 穩定 |

**修改前必須**：
1. 向用戶說明修改原因
2. 獲得用戶明確同意
3. 記錄變更到 Changelog

---


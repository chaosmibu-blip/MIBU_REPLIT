# 管理端記憶庫 (Admin Portal Module)

## 模組範圍
系統管理員的後台功能，包含用戶管理、內容審核、數據監控。

## 權限層級
```typescript
type UserRole = 'user' | 'merchant' | 'specialist' | 'admin';

// Admin 驗證
const isAdmin = user?.role === 'admin';

// Super Admin（環境變數）
SUPER_ADMIN_EMAIL=xxx@xxx.com
SUPER_ADMIN_PASSWORD=xxx
```

## 相關資料表
-
### 用戶管理
- `users`: 用戶基本資料
- `user_profiles`: 用戶詳細資料
- `sessions`: 登入 session

### 內容審核
- `place_drafts`: 待審核景點
- `place_applications`: 用戶提交的景點申請
- `place_feedback`: 用戶回報問題

### 系統設定
- `announcements`: 公告
- `ad_placements`: 廣告位
- `coupon_probability_settings`: 優惠券機率

## 主要 API

### 用戶管理
- `GET /api/admin/users` - 列出用戶
- `GET /api/admin/users/:id` - 用戶詳情
- `PATCH /api/admin/users/:id` - 更新用戶（如封禁）
- `POST /api/admin/users/:id/role` - 變更角色

### 景點審核
- `GET /api/admin/places/drafts` - 待審核列表
- `POST /api/admin/places/drafts/:id/approve` - 批准
- `POST /api/admin/places/drafts/:id/reject` - 拒絕
- `GET /api/admin/places/applications` - 用戶申請

### 批次採集（取代 AutoDraft）
- `POST /api/admin/places/batch-preview` - 預覽採集結果
- `POST /api/admin/places/batch-generate` - 執行批次採集
- 手動腳本：`npx tsx server/scripts/short-batch-review.ts`

### 資料同步
- `GET /api/admin/export-places` - 匯出景點（開發→生產同步）
- `POST /api/admin/seed-places` - 匯入景點

### 商家/專員審核
- `GET /api/admin/merchants/pending` - 待審核商家
- `POST /api/admin/merchants/:id/approve` - 批准商家
- `GET /api/admin/specialists/pending` - 待審核專員
- `POST /api/admin/specialists/:id/approve` - 批准專員

### 系統設定
- `GET /api/admin/announcements` - 公告列表
- `POST /api/admin/announcements` - 發布公告
- `GET /api/admin/settings` - 系統設定
- `PATCH /api/admin/settings` - 更新設定

## 資料遷移 API
```typescript
// 開發→生產同步金鑰
ADMIN_MIGRATION_KEY = 'mibu2024migrate';

// 匯出 (開發環境)
GET /api/admin/export-places?key=mibu2024migrate&excludeCities=台北市,高雄市

// 匯入 (生產環境)
POST /api/admin/seed-places
Body: { key: 'mibu2024migrate', data: [...] }
```

## 排程任務
| 任務 | 頻率 | 功能 |
|------|------|------|
| AutoCleanup | 1 小時 | 清理過期 SOS 事件 |
| DataCleanup | 48 小時 | 資料清理（重複、無效） |

> ⚠️ **已移除**：AutoDraft（30秒自動採集）和 AIReview（30秒自動審核）已於 2025-12-25 移除，改為手動批次採集。

## 監控指標
- 每日活躍用戶 (DAU)
- 每日抽卡次數
- 優惠券領取/核銷率
- 景點審核通過率
- API 錯誤率

## 待開發功能
- [ ] 管理員操作日誌
- [ ] 即時監控儀表板
- [ ] 自動化報表
- [ ] A/B 測試系統

---

## 資料庫管理流程（開發 → 正式）

### 架構設計
```
開發環境                           正式環境
┌─────────────────┐               ┌─────────────────┐
│ DATABASE_URL    │               │ PRODUCTION_DB   │
├─────────────────┤               ├─────────────────┤
│ place_cache     │ ──審查後──→   │ places          │ ← App 抽卡唯一來源
│ place_drafts    │ ──審查後──→   │                 │
│ places          │               │                 │
└─────────────────┘               └─────────────────┘
```

### 流程說明（2025-12-26 更新）
```
批次採集（8類別×10關鍵字並行）
    ↓
place_cache（基本資料，無描述）
    ↓
AI 審核（過濾不適合地點）
    ↓
migrate-with-descriptions.ts
  ├── 階段一：匯入 places
  └── 階段二：8 類別並行生成描述（專屬 Prompt）
    ↓
places（高品質描述）
    ↓
同步正式資料庫
```

### 批次採集腳本
| 腳本 | 用途 |
|------|------|
| `batch-parallel-collect.ts` | 採集（8類別 × 10關鍵字並行，支援類別過濾） |
| `short-batch-review.ts` | AI 審核（50筆/批） |
| `migrate-with-descriptions.ts` | 匯入 + 8類別並行生成描述 |
| `promote-to-places.ts` | 快速升級（已含 googleTypes/primaryType 複製） |
| `generate-descriptions.ts` | 修復舊資料通用描述 |
| `fix-google-types.ts` | 從 Google API 補上 google_types 和 primary_type |

### 描述生成共用模組
- **檔案**：`server/lib/descriptionGenerator.ts`
- **功能**：8 類別專屬 Prompt、自動重試（2次）、批次處理
- **批次大小**：10 筆/批，maxOutputTokens: 8192

### 同步指令
```bash
# 設定正式資料庫連線（環境變數）
export PRODUCTION_DATABASE_URL="postgresql://..."

# 匯出開發資料庫 places
psql "$DATABASE_URL" -c "\COPY (SELECT ... FROM places WHERE is_active = true) TO '/tmp/places.csv' WITH CSV HEADER"

# 匯入正式資料庫（跳過重複）
psql "$PRODUCTION_DATABASE_URL" << 'EOF'
CREATE TEMP TABLE temp_places (...);
\COPY temp_places FROM '/tmp/places.csv' WITH CSV HEADER
INSERT INTO places (...) SELECT ... FROM temp_places ON CONFLICT (google_place_id) DO NOTHING;
EOF
```

### 正式環境注意事項
- **不使用 cache/drafts**：正式環境的 `place_cache` 和 `place_drafts` 應保持空白
- **google_place_id 唯一約束**：防止重複景點
- **分類標準化**：所有 `category` 欄位統一使用英文（food/scenery/activity 等）

---

## Changelog

### 2025-12-26 - 描述生成系統優化
- **問題**：批次採集產生通用描述（如「台北市知名的美食」），影響用戶體驗
- **解決方案**：
  1. 建立 8 類別專屬 Prompt（美食、住宿、景點等）
  2. 分離描述生成步驟：採集後 → 審核通過 → 8 類別並行生成描述 → 匯入
  3. 批次大小從 30 降至 10，maxOutputTokens 從 4096 升至 8192
- **新增腳本**：
  - `migrate-with-descriptions.ts`：整合匯入 + 描述生成
  - `generate-descriptions.ts`：修復舊資料通用描述
- **新增共用模組**：`server/lib/descriptionGenerator.ts`
  - 8 類別專屬 Prompt
  - 自動重試機制（2次，指數退避）
  - 批次處理函數
- **舊資料修復**：1,755 筆通用描述全部更新為精細描述（100% 成功率）
- **效能提升**：
  - 8 類別並行 + 10 關鍵字並行採集
  - 單城市採集時間：8-10 分鐘 → 15-20 秒

### 2025-12-26 - 正式資料庫清洗與同步
- **分類標準化**：正式資料庫 527 筆中文分類轉為英文（美食→food, 景點→scenery 等）
- **描述修復**：3 筆空描述使用智能 fallback 模板補上
- **清除暫存**：刪除正式資料庫 place_cache（4,082 筆）與 place_drafts（3,212 筆）
- **資料同步**：開發資料庫 places（2,198 筆）匯入正式資料庫，新增 740 筆（跳過 1,458 筆重複）
- **最終狀態**：正式資料庫 places 共 2,373 筆

### 2025-12-26 - 舊資料分類修復
- **修復範圍**：place_cache（662 筆）、place_drafts（1 筆）、places（4 筆）
- **問題**：舊採集資料 category 錯誤（如 `primary_type=restaurant` 卻分類為「景點」）
- **修復內容**：
  1. 通用描述「探索XX的特色景點」→ 智能 fallback 模板（173 筆）
  2. restaurant/cafe/bakery/bar → 美食（381 筆）
  3. lodging → 住宿（63 筆）
  4. museum → 生態文化教育（1 筆）
  5. category='food'(英文) → 美食（22 筆）
  6. tourist_attraction/store 但名稱含餐廳 → 美食（22 筆）
- **新增腳本**：`server/scripts/reclassify-data.ts` - 批次重新分類
- **行程卡顯示**：前端使用 `category` 欄位（非 sub_category）透過 `getCategoryLabel()` 顯示標籤

### 2025-12-25 - 規則映射分類系統（取代純 AI 分類）
- **新增** `server/lib/categoryMapping.ts`：Google Types → Mibu Category/Subcategory 對照表
- **分類流程改進**：
  1. `determineCategory(primaryType, googleTypes)` → 規則映射 Category
  2. `determineSubcategory(primaryType, googleTypes)` → 規則映射 Subcategory
  3. `batchGenerateDescriptionsOnly()` → AI 只生成描述（專注單一任務）
  4. `generateFallbackDescription()` → 智能 fallback 模板（非通用「探索XX的特色景點」）
  5. `classifyAndDescribePlaces()` → 整合函數
- **新增 API**：`POST /api/admin/places/reclassify` - 重新分類現有 cache/drafts/places 資料
- **優點**：分類穩定、零成本、100% 成功率；AI 失敗時仍有智能 fallback
- 修改檔案：`server/lib/categoryMapping.ts`, `server/lib/placeGenerator.ts`, `server/routes.ts`

### 2025-12-25 - 批次採集 AI 智能分類系統（已被規則映射取代）
- ~~新增 `batchGenerateWithClassification()` 函數~~（保留但不再使用）
- 支援彈性地區選擇：`regionId`（必填）+ `districtId`（可選）+ `categoryId`（可選）
- 八大種類選擇：美食、住宿、生態文化教育、遊程體驗、娛樂設施、活動、景點、購物
- 未選擇種類時 AI 隨機選擇一種並根據種類擴散關鍵字
- 關鍵字組合邏輯：`{種類}-{關鍵字}`（如「美食-咖啡廳」）
- 自動新增子分類：若 AI 判斷的子分類不存在則自動建立
- **修復**：按鈕 disabled 條件從 `!selectedDistrictId` 改為 `!selectedRegionId`，允許城市級別採集
- 修改檔案：`server/routes.ts`, `server/storage.ts`, `server/lib/placeGenerator.ts`, `client/src/pages/admin/BatchGeneratePage.tsx`

### 2025-12-25 - 批次採集真實進度顯示（SSE）
- 後端新增 SSE（Server-Sent Events）串流支援
- 前端使用 ReadableStream 接收真實進度（非模擬）
- 顯示階段：關鍵字擴散 → Google 搜尋 → 過濾去重 → AI 生成描述 → 儲存
- 移除 `simulateProgress()` 模擬邏輯
- 參數：`useSSE: true` 啟用串流模式
- 修改檔案：`server/routes.ts`, `client/src/pages/admin/BatchGeneratePage.tsx`

### 2025-12-25 - 廢除自建廣告管理
- 決定使用 AdMob 官方後台管理廣告
- 刪除 `AdsManagePage.tsx`
- 從 `AdminDashboard` 移除相關入口

# 行程扭蛋模組記憶庫 (Travel Gacha Module)

## 模組範圍
負責隨機生成旅遊行程的核心扭蛋機制，包含景點抽取、批次採集、去重保護。

## API 版本

### Gacha V1 (`POST /api/gacha/itinerary`)
- **狀態**: Legacy，仍可用
- **機制**: place_cache + Gemini AI 填充
- **特點**: 依賴 AI 生成真實店名，較慢

### Gacha V2 (`POST /api/gacha/itinerary/v2`)
- **狀態**: 過渡版本
- **機制**: AI worker 按時段分配
- **特點**: 並行處理，效率較高

### Gacha V3 (`POST /api/gacha/itinerary/v3`) ⭐ 推薦
- **狀態**: Production Ready
- **機制**: Database-driven，從 `places` 表直接抽取
- **特點**: 
  - 無需 AI 調用（僅排序時可選用）
  - 錨點區策略 + 縣市擴散 fallback
  - 去重保護（30 分鐘內不重複）
  - 經緯度最近鄰排序
  - 住宿自動排最後

## V3 核心邏輯

### 請求參數
```typescript
interface GachaV3Request {
  regionId?: number;      // 縣市 ID（優先）
  city?: string;          // 縣市名稱
  district?: string;      // 指定區域（可選）
  itemCount?: number;     // 抽取數量 1-15
  pace?: 'relaxed' | 'moderate' | 'packed';
}
```

### 回應結構
```typescript
interface GachaV3Response {
  success: boolean;
  places: PlaceResult[];
  couponsWon: CouponResult[];
  meta: {
    city: string;
    district: string | null;
    totalPlaces: number;
    anchorDistrict: string;
    dailyPullCount: number;
    remainingQuota: number;
    requestedCount: number;      // 用戶請求張數
    isShortfall: boolean;        // 是否不足
    shortfallMessage: string | null;  // 不足提示訊息
  };
}
```

### 抽取流程
1. **每日限額檢查**: 每人每天最多 36 張卡
2. **錨點區選擇**: 無指定 district 時隨機選一區
3. **結構化選點**:
   - 食: 固定 2-3 個（抽 ≤7 張給 2 個，抽 8+ 張給 3 個）
   - 宿: 最多 1 個（抽 ≥9 張時才有）
   - 其餘按等權重隨機分配（遊、購、行）
4. **去重保護**: 排除最近 3 次抽過的景點（30 分鐘 TTL）
5. **地理距離去重**: 同一輪抽卡中，避免選取距離過近的景點（2025-12-28 新增）
6. **經緯度排序**: 最近鄰居演算法優化動線
7. **AI 調整**: Gemini 微調順序（早餐前、夜店後）
8. **張數不足提示**: 當實際抽出 < 請求張數時，回傳 `isShortfall: true`

### 張數不足處理
當 `totalPlaces < requestedCount` 時：
- `isShortfall: true`
- `shortfallMessage`: 例如「礁溪鄉目前只有 5 個景點，我們正在努力擴充中！」
- 前端應顯示 Toast 或提示告知用戶

## 去重保護機制
```typescript
// 記憶體快取結構
userRecentGachaCache: Map<string, RecentGachaResult[]>
// Key: `${userId}:${city}`
// Value: 最近 3 次抽卡的 placeIds + timestamp

// 30 分鐘過期，景點池不足時自動清除
```

## 地理距離去重（2025-12-28 新增）

### 問題背景
同一輪扭蛋可能抽到多個位於同一園區的景點（如傳統藝術中心 + 臨水劇場 + 宜蘭傳藝園區），造成用戶體驗不佳。

### 解決方案
依類別設定不同的距離閾值，避免選取距離過近的景點：

| 類別 | 閾值（公尺） | 說明 |
|------|------------|------|
| 景點、生態文化教育、遊程體驗 | 200 | 大型園區容易有子景點問題 |
| 美食、購物 | 50 | 夜市/商圈店家密集，保留多樣性 |
| 活動、娛樂設施 | 100 | 適中距離 |
| 住宿 | 0（不去重） | 每輪最多 1 個，無需去重 |

### 實作位置
- **檔案**：`server/routes.ts`
- **函數**：`getGeoDedupeRadiusMeters(category)`、`getDistanceMeters()`
- **邏輯**：`isTooCloseToSelected()` 在 `pickFromCategory()` 內呼叫

### 效果
- 傳藝中心問題：選中「傳統藝術中心」後，200m 內的其他景點自動跳過
- 夜市美食：選中「羅東夜市雞排」後，50m 外的其他攤位仍可被選中

## 相關資料表
- `places`: 官方景點庫（isActive = true 才會出現）
- `user_daily_gacha_stats`: 每日抽卡計數
- `regions`, `districts`: 地區階層

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

### 八大分類與子分類結構
- **檔案**：`server/lib/categoryMapping.ts`
- **對照來源**：Google Places API 的 `primaryType` 和 `types[]`

| Category | Google Types 範例 | Subcategory 範例 |
|----------|------------------|-----------------|
| 美食 | restaurant, cafe, bakery, bar | 在地早餐、火鍋、燒烤、甜點 |
| 住宿 | lodging, hotel, hostel, campground | 星級飯店、民宿、露營、青年旅社 |
| 景點 | park, temple, beach, monument | 城市公園、宗教聖地、自然風光 |
| 購物 | store, shopping_mall, market | 百貨公司、夜市、特色商店 |
| 活動 | spa, gym, hiking_area, golf_course | 登山步道、水上活動、按摩/足湯 |
| 娛樂設施 | amusement_park, movie_theater, karaoke | 主題樂園、電影院、KTV |
| 生態文化教育 | museum, zoo, aquarium, library | 博物館、生態園區、文化中心 |
| 遊程體驗 | tourist_attraction, farm, winery | 一日遊、DIY體驗、農場體驗 |

### place_cache 資料結構
```typescript
{
  category: '美食',           // 八大類之一
  subCategory: '在地早餐',     // 規則映射產生
  googleTypes: 'restaurant,cafe',  // Google 原始類型（保留追溯）
  primaryType: 'restaurant',       // Google 主要類型
  aiReviewed: false,          // 是否已通過 AI 審核
}
```

### 行程卡顯示標籤
- 前端使用 **`category`** 欄位透過 `getCategoryLabel()` 顯示
- 資料庫統一使用中文八大類：美食、住宿、景點、購物、活動、娛樂設施、生態文化教育、遊程體驗

### 核心腳本（4 個）
```bash
# 1. 批次採集
npx tsx server/scripts/batch-parallel-collect.ts 城市名 [類別]

# 2. AI 審核
npx tsx server/scripts/short-batch-review.ts [數量]

# 3. 升級到正式表（含描述生成）
npx tsx server/scripts/migrate-with-descriptions.ts [數量]

# 4. 補描述（選用）
npx tsx server/scripts/generate-descriptions.ts [城市] [數量]
```

### 標準採集流程（詳細）

```
第 1 步：批次採集
腳本：batch-parallel-collect.ts
輸入：城市名稱、[可選類別]
輸出：寫入 place_cache 表（ai_reviewed = false）
動作：8 類別各 10 關鍵字，Google Places API 採集

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

---

## Changelog

### 2025-12-29 - 採集與升級效能優化

#### 採集腳本優化 (`batch-parallel-collect.ts`)
- **去重模式**：從「啟動時載入全部 ID」改為「存入時批次查詢」
  - 好處：啟動時間從 ~5 秒降為 0 秒，記憶體消耗減少
  - 實作：`checkExistingPlaceIds()` 函數，使用 `inArray` 查詢
- **每關鍵字筆數**：20 筆（1 頁）→ **60 筆（3 頁）**
  - 使用 `nextPageToken` 取得多頁結果
  - 每頁間隔 2 秒（Google API 限制）

#### AI 審核優化 (`short-batch-review.ts`)
- **每批數量**：20 → **50 筆**
- **maxOutputTokens**：8192 → **16384**（避免截斷）
- **間隔時間**：1 秒 → **5 秒**

#### 升級腳本優化 (`migrate-with-descriptions.ts`)
- **匯入**：逐筆串行 → **每批 50 筆 INSERT**
- **描述生成**：每批 10 筆 + 1 秒等待 → **每批 15 筆，無等待**
- **描述更新**：逐筆串行 → **每批 20 筆並行 UPDATE**
- **maxOutputTokens**：8192 → **16384**

#### 效能數據
| 操作 | 優化前 | 優化後 |
|------|--------|--------|
| 每類別採集 | ~20 筆 | ~500 筆（10 關鍵字 × 60 筆 × 過濾） |
| 56 筆升級 | ~200 秒 | **93 秒** |
| 主要瓶頸 | DB 操作 | AI 描述生成（每批 ~20 秒） |

### 2025-12-29 - Apple 審核合規：優惠券機率統一
- **問題根源**：程式碼硬編碼的機率 (S: 20%, R: 35%) 與資料庫設定 (S: 23%, R: 32%) 不一致
- **風險**：Apple 審核要求 Loot Box 公佈機率必須與實際掉落率一致，否則會被拒
- **修正**：統一 `RARITY_DROP_RATES` 與 `/api/rarity-config` 返回值
- **正式機率**：SP 2%, SSR 8%, SR 15%, S 23%, R 32%

### 2025-12-29 - 黑名單 API 與營業時間欄位
- **新增 API**：`GET /api/admin/delete-blacklist-places`
  - 查詢並刪除符合黑名單關鍵字的 places 資料
  - 保留名單：蘭城百匯、森本屋
  - 參數 `confirm=yes` 執行刪除，否則僅預覽
- **新增黑名單關鍵字**：資材行、水電行、汽車修理、輪胎行、洗衣店、乾洗店、當舖、禮儀公司、快餐店
- **新增 places 欄位**：
  - `openingHours` (JSONB) - 營業時間
  - `promoTitle` - 推廣標題
  - `promoDescription` - 推廣描述
  - `claimStatus` - 認領狀態（unclaimed/pending/approved/rejected）
- **修改採集腳本**：`batch-parallel-collect.ts` 現在會順便取得營業時間

### 2025-12-28 - 地理距離去重機制
- **解決問題**：同一輪扭蛋抽到多個傳藝中心子景點
- **實作**：依類別設定距離閾值（景點 200m、美食 50m、活動 100m）
- **效果**：五結鄉扭蛋從 4 個傳藝中心景點降至 1 個

### 2025-12-27 - 地址解析器與城市驗證
- **新增 `addressParser.ts`**：從地址字串解析縣市和鄉鎮區
- **修正 `batch-parallel-collect.ts`**：
  - 使用 `parseAddress()` 從地址提取實際鄉鎮區（原本錯誤地將 city 填入 district）
  - 使用 `isAddressInCity()` 過濾不屬於目標城市的結果
- **效果**：district 欄位現在正確顯示「羅東鎮」「礁溪鄉」等，而非整個「宜蘭縣」
- **重要**：解決扭蛋選區時抓到非該區地點的問題

### 2025-12-27 - 腳本清理與資料庫重置
- **刪除 8 個一次性修復腳本**：fix-google-types, regenerate-star-descriptions, reclassify-data, cleanup-places, migrate-cache-to-places, batch-taipei-all-categories, test-batch-generate, test-batch-with-save
- **保留 5 個核心腳本**：batch-parallel-collect, short-batch-review, migrate-with-descriptions, promote-to-places, generate-descriptions
- **清空開發環境資料庫**：place_cache (0)、place_drafts (922)、places (6,378) → 全部歸零
- **修正描述生成規則**：禁止「X.X分」格式（原只禁「X.X星」）
- **目的**：從零建立高品質旅遊資料，避免低品質資料混入

### 2025-12-26 - Category 欄位統一（治本修正）
- 問題：資料庫 category 欄位混用三種格式（英文 food/stay、中文短形 食/宿、中文全形 美食/住宿）
- 修正：統一轉換為 categoryMapping.ts 定義的八大類（美食、住宿、景點、購物、活動、娛樂設施、生態文化教育、遊程體驗）
- 更新 V3 Gacha 選點邏輯使用標準名稱
- 影響：修正住宿無法排到最後的問題

### 2025-12-25 - 解決 429 Rate Limit 錯誤
- 實作分批處理：每批 10-15 個地點，序列執行
- 加入冷卻時間：批次間隔 2-3 秒
- 加入重試機制：Exponential Backoff（3/6/12 秒）
- 批次生成描述：`batchGenerateDescriptions()` 單次 API 處理多個地點
- 修改檔案：`placeGenerator.ts`, `routes.ts`, `short-batch-review.ts`

### 2025-12-25 - 真・批次 AI 審查（模式 B）
- 重構 `server/scripts/short-batch-review.ts`
- 原模式 A：每個地點單獨呼叫 1 次 Gemini API（N 次呼叫）
- 新模式 B：打包最多 20 個地點，1 次呼叫取得所有結果
- API 呼叫次數從 N 次降為 ceil(N/20) 次
- 新增批次採集進度顯示（前端模擬）

### 2025-12-25 - 記憶庫檔案遷移
- 從 `docs/memory/` 遷移至 `docs/` 根目錄
- 確保唯一來源，刪除舊目錄

### 2025-12-25 - 刪除 AutoDraft 和自動 AI 審查
- 刪除 `server/scripts/batch-review-all.ts`
- 刪除 `server/scripts/loop-batch-review.sh`
- 刪除 `POST /api/admin/place-cache/batch-review` API
- 簡化 `placeGenerator.ts` 只保留 `callGemini` 函數
- V1 Gacha 的 `generatePlaceForSubcategory` 改為只用 cache，不再呼叫 AI
- 保留手動腳本：`short-batch-review.ts`、`promote-to-places.ts`

### 2025-12-25 - 升級腳本 & 資料遷移
- 新增 `promote-to-places.ts` 升級腳本
- 將 2,092 筆已審核 place_cache 升級到 places
- 實際新增 499 筆景點（其餘 1,593 筆為重複已清理）
- places 總數從 1,778 → 2,277 筆

### 2025-12-24 - 張數不足提示
- 新增 `requestedCount`、`isShortfall`、`shortfallMessage` 回應欄位
- 當實際抽出張數少於請求張數時，提供友善提示
- 前端可據此顯示 Toast 告知用戶

### 2025-12-24 - 去重保護機制
- 新增 `userRecentGachaCache` 記憶體快取
- 記住最近 3 次抽卡結果，30 分鐘內排除重複
- 景點池不足時自動清除快取

### 2025-12-23 - 資料完整性修復
- 扭蛋查詢強制過濾 `isActive = true`
- 影響函數: `getPlacesByDistrict()`, `getJackpotPlaces()`, `getOfficialPlacesByDistrict()`, `getOfficialPlacesByCity()`, `getPlaceByGoogleId()`
- 每日抽卡計數改為原子更新，修復 Race Condition

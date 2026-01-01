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
  - **AI 智慧排序**（2026-01-01 重構）- Gemini 負責最終行程順序
  - 錨點區策略 + 縣市擴散 fallback
  - **圖鑑去重保護**（2026-01-01 改版）- 最近 36 張不再出現
  - 六大類別等權重隨機分配
  - 美食不超過總數一半、住宿最多 1 個

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

### 抽取流程（2026-01-01 重構）
1. **每日限額檢查**: 每人每天最多 36 張卡
2. **錨點區選擇**: 無指定 district 時隨機選一區
3. **結構化選點**（六大類別等權重）:
   - 美食、景點、購物、娛樂設施、生態文化教育、遊程體驗 + 住宿
   - 各類別等權重隨機分配
   - **限制**：美食 ≤ 總數一半、住宿 ≤ 1 個
4. **圖鑑去重保護**: 查詢用戶圖鑑最近 36 張，完全排除這些地點
5. **經緯度排序**: 最近鄰居演算法優化動線
6. **智慧時段排序**: 根據營業時間/類別推斷最佳時段
7. **AI 智慧排序**（權重最高）: Gemini 負責最終行程順序
   - 傳送完整資訊（名稱、類別、子類別、經緯度、描述、營業時間）
   - AI 可回傳 X:編號 標記不適合的地點
   - 確保美食不連續超過 2 個
8. **張數不足提示**: 當實際抽出 < 請求張數時，回傳 `isShortfall: true`

### 張數不足處理
當 `totalPlaces < requestedCount` 時：
- `isShortfall: true`
- `shortfallMessage`: 例如「礁溪鄉目前只有 5 個景點，我們正在努力擴充中！」
- 前端應顯示 Toast 或提示告知用戶

## 去重保護機制（2026-01-01 改版）

### 新機制：圖鑑去重
從用戶圖鑑（collections 表）讀取最近 36 張已收藏的地點，完全排除這些地點。

```typescript
// 查詢用戶最近 36 張圖鑑的 officialPlaceId
const recentIds = await storage.getRecentCollectionPlaceIds(userId, 36);
const usedIds = new Set<number>(recentIds);
```

### 實作位置
- **Storage 方法**：`getRecentCollectionPlaceIds(userId, limit)`
- **檔案**：`server/storage.ts`

### 安全檢查
若去重後可用景點不足以完成本次抽卡，則清空去重限制重新抽取。

### 舊機制（已移除）
- ~~30 分鐘記憶體快取 `userRecentGachaCache`~~
- ~~地理距離去重 `isTooCloseToSelected`~~

## 智慧時段排序（2025-12-31 新增）

### 問題背景
原本使用 modulo 循環分配時段（breakfast, morning, lunch...），無法反映實際營業時間。早餐店可能被分配到晚上、宵夜被分配到早上。

### 解決方案
根據營業時間或類別/子類別推斷最佳時段，優先級：
1. **營業時間** → 解析 opening_hours 推斷開店時段
2. **子類別** → 早餐店/宵夜/下午茶等有預設時段
3. **類別** → 美食預設中午、住宿預設晚上
4. **預設** → flexible（彈性安排）

### 時段定義
| 時段 | 時間範圍 | Priority | 典型類別 |
|------|---------|----------|---------|
| morning | 06:00-11:00 | 1 | 早餐店、登山步道、博物館 |
| noon | 11:00-14:00 | 2 | 午餐、餐廳 |
| afternoon | 14:00-18:00 | 3 | 咖啡廳、下午茶、購物 |
| evening | 18:00-22:00 | 4 | 晚餐、夜市、SPA |
| night | 22:00-04:00 | 5 | 酒吧、宵夜、住宿 |
| flexible | - | 3 | 景點、體驗活動 |

### 子類別時段映射
```typescript
const SUBCATEGORY_TIME_SLOTS = {
  '在地早餐': 'morning', '早午餐': 'morning', '豆漿店': 'morning',
  '宵夜': 'night', '居酒屋': 'night', '酒吧': 'night',
  '下午茶': 'afternoon', '咖啡廳': 'afternoon', '甜點': 'afternoon',
  '夜市': 'evening', 'SPA按摩': 'evening',
  '登山步道': 'morning', '日出': 'morning'
};
```

### 實作位置
- **檔案**：`server/lib/timeSlotInferrer.ts`
- **核心函數**：
  - `inferTimeSlot(place)` - 推斷單一地點時段
  - `sortPlacesByTimeSlot(places)` - 排序地點陣列
  - `groupPlacesByTimeSlot(places)` - 分組到各時段（多天行程用）

### 效果
- 早餐店自動排早上、宵夜排晚上、住宿排最後
- 無需依賴 AI 調整，速度更快、結果更穩定

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

### 核心腳本（4 個）
```bash
# 1. 批次採集（支援關鍵字模式與區域指定）
npx tsx server/scripts/batch-parallel-collect.ts 城市名 [類別] [--mode=generic|local|mixed] [--district=區域名]

# 2. AI 審核
npx tsx server/scripts/short-batch-review.ts [數量]

# 3. 升級到正式表（含描述生成）
npx tsx server/scripts/migrate-with-descriptions.ts [數量]

# 4. 補描述（選用）
npx tsx server/scripts/generate-descriptions.ts [城市] [數量]
```

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

---

## Changelog

### 2026-01-01 - V3 扭蛋選點與排序重大重構

#### 結構化選點重構
- **移除固定配額**：不再固定「美食 2-3 個、住宿 ≥9 張才有」
- **改為六大類別等權重**：美食、景點、購物、娛樂設施、生態文化教育、遊程體驗 + 住宿
- **新增限制**：
  - 美食不超過總數一半（`maxFoodCount = Math.floor(targetCount / 2)`）
  - 住宿最多 1 個

#### 去重機制改版
- **移除舊機制**：
  - ~~30 分鐘記憶體快取 `userRecentGachaCache`~~
  - ~~地理距離去重 `isTooCloseToSelected`~~
  - ~~`recordGachaResult()` 函數~~
- **新機制**：從用戶圖鑑（collections）讀取最近 36 張，完全排除
- **新增 Storage 方法**：`getRecentCollectionPlaceIds(userId, limit)`

#### AI 智慧排序增強（2026-01-01 二次更新）
- **權重提升**：AI 排序權重最高，負責最終行程順序
- **完整資訊傳遞**：名稱、類別、子類別、經緯度、描述（前 80 字）、營業時間
- **移除硬編碼排序**：住宿排最後、種類穿插等邏輯全部交由 AI 處理
- **新增 AI 排序規則**：
  1. 早餐/早午餐店排早上、午餐排中午、晚餐/夜市排傍晚、宵夜/酒吧排最後
  2. 住宿永遠排最後
  3. 盡量穿插各個種類（夜市美食群、鄰近適合接續的地點例外）
  4. 考慮地理位置減少迂迴
  5. 不適合的地點回傳 X:編號
  6. **同園區去重**：多個地點位於同一園區時，保留代表性最高的主景點，其餘回傳 X
- **要求完整順序**：prompt 強調回傳所有地點編號
- **AI 拒絕機制**：可回傳 `X:編號` 標記不適合的地點
- **補入新地點後重新送 AI**：當 AI 拒絕某些地點並補充新地點後，會再次調用 AI 審核與排序

#### 安全機制
- **Guest 用戶去重**：使用 `guestSessionDedup` Map 快取（30 分鐘 TTL）
- **AI 排序補全**：當 AI 回傳不完整順序時，自動補全遺漏的地點
- **去重安全檢查**：當可用地點少於請求數量時，清空去重限制
- **避免無限循環**：第二次 AI 審核時不再補充被拒絕的地點
- **住宿排序安全網**：即使 AI 沒有正確排序，程式碼也會確保住宿永遠排在最後（100% 保證）

#### 檔案變更
- `server/routes.ts`：V3 扭蛋選點與排序邏輯
- `server/storage.ts`：新增 `getRecentCollectionPlaceIds` 方法
- `docs/memory-travel-gacha.md`：記憶庫更新

---

### 2025-12-30 - 類別架構優化與臺中市採集

#### 類別架構重大變更
- **移除活動類別**：八大類→七大類，移除時效性強的「活動」類別
- **活動 Google Types 重新映射**：
  - `spa`, `massage`, `hot_spring`, `hiking_area` → 遊程體驗
  - `sports_complex`, `swimming_pool` → 娛樂設施
  - `gym`, `karaoke`, `movie_theater`, `bowling_alley` → 黑名單
- **黑名單擴充**：影城、KTV、健身房、保齡球、撞球、網咖、展覽、市集、音樂會、節慶、運動賽事

#### 採集進度
- **臺中市採集完成**：通用 1,933 筆 + 在地 791 筆 = 2,724 筆採集、2,157 筆升級
- **正式表總數**：11,831 筆（遷移活動類別後刪除 95 筆黑名單）
- **已完成縣市**：台北市、宜蘭縣、高雄市、臺南市、臺中市（5/22）

#### 活動類別遷移
- 121 筆 spa/hiking 等遷移到「遊程體驗」
- 9 筆購物相關遷移到「購物」
- 1 筆 massage 遷移到「遊程體驗」
- 95 筆黑名單（gym/yoga/sports）已刪除
- 3 筆其他遷移到「娛樂設施」

#### 子分類擴充
- 美食：15→25 項（新增熱炒、素食、排骨飯、雞肉飯等）
- 景點：移除車站/吊橋，新增特色建築/地標
- 購物：移除書店，新增在地超市
- 娛樂設施：移除 KTV/電影院/保齡球等（併入黑名單）

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
- **間隔時間**：5 秒 → **1 秒**（2025-12-30 調整）

#### 升級腳本優化 (`migrate-with-descriptions.ts`)
- **匯入**：逐筆串行 → **每批 50 筆 INSERT**
- **描述生成**：每批 15 筆，類別內 **10 並行**（2025-12-30 從 3 調整）
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

### 2025-12-31 - 黑名單擴充與清理
- **擴充 EXCLUDE_KEYWORDS**：新增 `電影院`, `電影`, `健身`, `gym`, `瑜珈`, `yoga`
- **清理 places 表**：刪除 217 筆符合擴充黑名單的資料
  - KTV: 55 筆、市集: 50 筆、電影/影城: 49 筆、健身/gym: 21 筆
  - 展覽: 12 筆、保齡球: 9 筆、音樂會: 7 筆、瑜珈/yoga: 6 筆、撞球: 3 筆、網咖: 1 筆

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
- **實作**：依類別設定距離閾值（景點 200m、美食 50m、娛樂設施 100m）
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
- **保留 4 個核心腳本**：batch-parallel-collect, short-batch-review, migrate-with-descriptions, generate-descriptions
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

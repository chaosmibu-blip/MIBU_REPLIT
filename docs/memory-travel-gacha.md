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
5. **經緯度排序**: 最近鄰居演算法優化動線
6. **AI 調整**: Gemini 微調順序（早餐前、夜店後）
7. **張數不足提示**: 當實際抽出 < 請求張數時，回傳 `isShortfall: true`

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
```
- **效果**：減少 AI 審核負擔，提升效率

#### 2. 清理腳本過濾
- **檔案**：`server/scripts/cleanup-places.ts`
- **用途**：清理已存入的不適合資料
- **名稱黑名單**（`NAME_BLACKLIST`）：同上
- **類別黑名單**（`CATEGORY_BLACKLIST`）：
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

### 手動審核腳本（保留）
```bash
# AI 審核（每批 10 筆，含 Rate Limit 防護）
npx tsx server/scripts/short-batch-review.ts [數量]

# 升級到 places 表
npx tsx server/scripts/promote-to-places.ts [數量]
```

## 注意事項
- `isActive = false` 的景點不會出現在扭蛋結果
- 原子更新 `pull_count` 防止 Race Condition
- 無 API 快取，每次都重新隨機選取

---

## Changelog

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

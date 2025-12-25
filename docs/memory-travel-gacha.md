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

### 分類邏輯（2025-12-25 改版）
1. **Category 判斷**：`determineCategory(primaryType, googleTypes)` - 規則映射，100% 成功
2. **Subcategory 判斷**：`determineSubcategory(primaryType, googleTypes)` - 規則映射
3. **描述生成**：`batchGenerateDescriptionsOnly()` - AI 只生成描述（不做分類）
4. **Fallback 模板**：AI 失敗時用 `generateFallbackDescription()` 智能模板（非通用文字）

### 行程卡顯示標籤
- 前端使用 **`category`** 欄位透過 `getCategoryLabel()` 顯示
- 映射：`food` → 美食、`scenery` → 景點、`stay` → 住宿

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

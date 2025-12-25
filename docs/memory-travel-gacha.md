# 行程扭蛋模組記憶庫 (Travel Gacha Module)

## 模組範圍
負責隨機生成旅遊行程的核心扭蛋機制，包含景點抽取、AI 審核、自動草稿生成。

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

## AutoDraft 自動填充
- 排程: 每 30 秒執行
- 功能: 自動從 Google Places API 抓取新景點
- 限制: Gemini 15 req/min (free), 360+ req/min (paid)
- 可並行 3-5 個 instance

## AI 審核系統（短批次模式）

### 審核腳本
- **腳本**: `server/scripts/short-batch-review.ts`
- **用法**: `npx tsx server/scripts/short-batch-review.ts [批次數量]`
- **預設**: 每次 12 筆（符合 60 秒限制）
- **通過率**: 約 80-85%

### 升級腳本
- **腳本**: `server/scripts/promote-to-places.ts`
- **用法**: `npx tsx server/scripts/promote-to-places.ts [批次數量]`
- **預設**: 每次 50 筆
- **功能**: 將已審核通過的 place_cache 升級到 places 表

### 完整流程
```
place_cache (ai_reviewed=null)
    ↓ short-batch-review.ts
    ├─ 通過 → ai_reviewed=true
    └─ 不通過 → 刪除
    ↓ promote-to-places.ts
    ├─ 不重複 → 寫入 places
    └─ 已存在 → 刪除 cache
```

### Replit 60 秒限制
- 背景任務有 ~60 秒執行時間限制
- 超時會被 SIGTERM 終止
- 必須用短批次策略，每次 ≤12 筆

## 注意事項
- `isActive = false` 的景點不會出現在扭蛋結果
- 原子更新 `pull_count` 防止 Race Condition
- 無 API 快取，每次都重新隨機選取

---

## Changelog

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

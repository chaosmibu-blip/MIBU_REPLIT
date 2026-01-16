# 行程扭蛋模組記憶庫 (Travel Gacha Module)

## 模組範圍
負責隨機生成旅遊行程的核心扭蛋機制，包含景點抽取、批次採集、去重保護。

## API 版本

### Gacha V3 (`POST /api/gacha/itinerary/v3`) ⭐ 唯一版本
- **狀態**: Production Ready
- **機制**: Database-driven，從 `places` 表直接抽取
- **特點**:
  - **AI 智慧排序**（2026-01-01 重構）- Gemini 負責最終行程順序
  - 錨點區策略 + 縣市擴散 fallback
  - **圖鑑去重保護**（2026-01-01 改版）- 最近 36 張不再出現
  - 六大類別等權重隨機分配
  - 美食不超過總數一半、住宿最多 1 個

> ⚠️ **V1/V2 已於 2026-01-12 移除**：舊版本程式碼已清理，僅保留 V3

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

### 抽取流程（2026-01-08 v3 修正）

```
┌──────────────────────────────────────────────────────────────┐
│  Phase 1: 前置檢查                                           │
├──────────────────────────────────────────────────────────────┤
│  1. 每日限額檢查: 36張/天（管理員豁免）                       │
│  2. 錨點區選擇: 無指定 district 時隨機選一區                  │
│  3. 查詢錨點區景點: getOfficialPlacesByDistrict (limit 200)  │
│  4. 圖鑑去重載入: 查詢用戶最近 36 筆收藏的 place_id          │
│  5. 去重安全檢查: 若去重後可用 < 需求張數，清空去重限制       │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 2: 結構化選點                                         │
├──────────────────────────────────────────────────────────────┤
│  6. 美食保底: 5-6張=2個, 7-8張=3個, 9+張=3個                 │
│  7. 住宿配額: ≥9張才有，最多 1 個                            │
│  8. 等權重隨機: 六大類別填滿剩餘（美食上限=總數一半）         │
│     類別：美食、景點、購物、娛樂設施、生態文化教育、遊程體驗 │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 3: 三輪 AI 驗證排序（2026-01-11 優化）                 │
├──────────────────────────────────────────────────────────────┤
│  9. 經緯度排序: 最近鄰居演算法，從最北點開始連接最近點        │
│  10. 時段排序: 根據營業時間/類別推斷最佳時段                  │
│  11. 第一輪 AI（gemini-3-flash-preview, 溫度 0.2）:          │
│      - 輸入：名稱、類別、子類別、**座標**、描述、營業時間     │
│      - 輸出：order + reject + reason                         │
│      - 可排除不適合景點（非旅遊點、不適合當輪）               │
│  12. 若第一輪有排除 → 補抽（若需要）→ 第二輪 AI:             │
│      - 【2026-01-11】觸發條件簡化：只要有排除就進入第二輪     │
│      - 重新排序，仍可排除                                    │
│  13. 若第二輪有排除 → 補抽 → 第三輪 AI:                      │
│      - 【重要】只排序，明確告知 AI「不要排除任何地點」        │
│                                                              │
│  輪數記錄邏輯（2026-01-11 簡化）:                            │
│  - 第一輪無排除 → reorderRounds = 1                          │
│  - 第一輪有排除 → reorderRounds = 2                          │
│  - 第二輪有新增排除 → reorderRounds = 3                      │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 4: 兩層備援（AI 排序後執行）🆕 2026-01-08             │
├──────────────────────────────────────────────────────────────┤
│  14. 若 AI 排序後仍不足用戶請求張數:                         │
│      - 第一層: 同區任意類別（仍排除去重）                    │
│      - 第二層: 完全忽略去重                                  │
│  15. 安全網: 確保住宿排在最後                                 │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 5: 後處理                                             │
├──────────────────────────────────────────────────────────────┤
│  14. 優惠券抽取: 有商家認領的景點依 dropRate 抽獎             │
│  15. 儲存收藏: 寫入 collections 表                           │
│  16. AI 日誌: 寫入 gacha_ai_logs 表                          │
│  17. 更新每日計數                                            │
│  18. 回傳結果（含 isShortfall 提示）                         │
└──────────────────────────────────────────────────────────────┘
```

## AI 排序 Prompt 詳解（2026-01-11 補充）

### 使用模型

| 輪次 | 模型 | 用途 |
|------|------|------|
| 第一輪 | `gemini-3-pro-preview` | 排序 + 可排除 |
| 第二輪 | `gemini-2.0-flash` | 排序 + 可排除 |
| 第三輪 | `gemini-2.0-flash` | 只排序，不排除 |

### 輸入資料結構

每個地點傳給 AI 的資訊：
```typescript
{
  idx: 1,                          // 編號（1-based）
  name: "阜杭豆漿",                 // 名稱
  category: "美食",                 // 類別
  subcategory: "在地早餐",          // 子類別
  description: "傳統台式早餐...",   // 描述（前 80 字）
  hours: "05:30-12:30"             // 營業時間
}
```

### 第一輪 & 第二輪 Prompt（可排除）

```
你是一日遊行程排序專家。請根據地點資訊安排最佳順序。

地點列表：
1. 阜杭豆漿｜美食/在地早餐｜傳統台式早餐店，必吃燒餅油條｜營業:05:30-12:30
2. 龍山寺｜景點/宗教聖地｜國定古蹟，香火鼎盛｜營業:06:00-22:00
3. 夜市熱炒｜美食/熱炒｜道地台菜，啤酒配菜｜營業:17:00-01:00
...

排序規則（依優先順序）：
1. 時段邏輯：早餐/咖啡廳→上午景點→午餐→下午活動→晚餐/夜市→宵夜/酒吧→住宿（住宿必須最後）
2. 地理動線：減少迂迴，鄰近地點連續安排
3. 類別穿插：避免連續3個同類（夜市內美食除外）
4. 排除不適合：永久歇業、非旅遊點、同園區重複景點（保留代表性最高者）

【輸出格式】只輸出一行 JSON（不要換行、不要 markdown）：
{"order":[3,1,5,2,4],"reason":"早餐先逛景點","reject":[]}
```

### 第三輪 Prompt（只排序，不排除）

```
你是一日遊行程排序專家。請根據地點資訊安排最佳順序。

地點列表：
（同上格式）

排序規則（依優先順序）：
1. 時段邏輯：早餐/咖啡廳→上午景點→午餐→下午活動→晚餐/夜市→宵夜/酒吧→住宿（住宿必須最後）
2. 地理動線：減少迂迴，鄰近地點連續安排
3. 類別穿插：避免連續3個同類（夜市內美食除外）

【重要】這是最後一輪，請不要排除任何地點，只需排序。

【輸出格式】只輸出一行 JSON（不要換行、不要 markdown）：
{"order":[3,1,5,2,4],"reason":"早餐先逛景點"}
```

### AI 回傳格式

```json
{
  "order": [3, 1, 5, 2, 4],    // 排序後的編號順序
  "reason": "早餐先逛景點",     // 排序理由（存入 gacha_ai_logs.aiReason）
  "reject": [6, 7]             // 被排除的編號（第三輪無此欄位）
}
```

### Generation Config

```typescript
{
  maxOutputTokens: 8192,
  temperature: 0.1    // 低溫度確保穩定輸出
}
```

### 程式碼位置

- **檔案**：`server/routes/gacha/gacha-v2v3.ts`
- **第一輪**：第 645-672 行
- **第二輪**：第 824-848 行
- **第三輪**：第 956-981 行

---

## AI 排序日誌系統（2026-01-03 新增）

### 設計目的
- **可追溯性**: 回溯任何一次扭蛋的 AI 決策過程
- **AI 調優**: 分析排序品質，改進 prompt
- **效能監控**: 追蹤 AI 回應時間
- **除錯利器**: 用戶投訴時可直接查詢該筆記錄

### 資料表結構
每輪扭蛋產生一筆 `gacha_ai_logs` 記錄：
- `sessionId`: UUID 唯一識別碼
- `orderedPlaceIds`: 排序後的地點 ID 陣列
- `rejectedPlaceIds`: 被 AI 拒絕的地點 ID
- `aiReason`: AI 排序理由
- `reorderRounds`: 排序花了幾輪 (1-3)
- `durationMs`: 總花費時間

### 關聯設計
```
gacha_ai_logs (sessionId)
  └── collections (gachaSessionId)
```

### 資料量估算
- 每日 3,000 筆（假設 1,000 活躍用戶 × 3 次/天）
- 每年約 100 萬筆，約 600 MB 儲存空間

### 查詢範例
```sql
-- 查詢特定用戶最近 5 次扭蛋的 AI 排序記錄
SELECT session_id, city, district, ai_reason, duration_ms, created_at
FROM gacha_ai_logs
WHERE user_id = '51153311'
ORDER BY created_at DESC
LIMIT 5;

-- 查詢某次扭蛋的所有收藏
SELECT c.place_name, c.category, g.ai_reason
FROM collections c
JOIN gacha_ai_logs g ON c.gacha_session_id = g.session_id
WHERE g.session_id = 'xxx-xxx-xxx';
```

### 張數不足處理
當 `totalPlaces < requestedCount` 時：
- `isShortfall: true`
- `shortfallMessage`: 例如「礁溪鄉目前只有 5 個景點，我們正在努力擴充中！」
- 前端應顯示 Toast 或提示告知用戶

## 測試帳號豁免機制（2026-01-03 新增）

### 背景
管理員/測試帳號需要頻繁測試扭蛋功能，不應受到每日 36 張的限制。

### 豁免清單
```typescript
// server/routes.ts (Gacha V3 路由)
const GACHA_EXEMPT_EMAILS = ['s8869420@gmail.com'];
```

### 判斷邏輯
```typescript
const userEmail = req.user?.claims?.email || req.jwtUser?.email;
const isExempt = userEmail && GACHA_EXEMPT_EMAILS.includes(userEmail);

if (userId !== 'guest' && !isExempt) {
  // 執行每日限額檢查
}
```

### 注意事項
- 需登入才能取得 email（Session 或 JWT 皆可）
- 豁免帳號的 collections 仍會正常記錄
- 日誌會顯示 `Admin/Test account - daily limit exempted`

## 區域最低門檻機制（2026-01-03 新增）

### 背景
部分子行政區景點數量過少（< 100 筆），若被選為錨點區會導致用戶體驗差。

### 機制
將景點數 < 100 的 district 設為 `is_active = false`，Gacha V3 選擇錨點區時會自動排除。

### 執行記錄（2026-01-03 更新）
- 軟刪除區域數：**54 個**（修正後）
- 保留區域數：約 101 個
- **修復紀錄**：發現 places.city 使用「臺」、regions.name_zh 使用「台」造成 JOIN 失敗，已統一為「台」

### 恢復方式
```sql
-- 恢復所有區域
UPDATE districts SET is_active = true WHERE is_active = false;

-- 恢復特定城市
UPDATE districts d
SET is_active = true
FROM regions r
WHERE d.region_id = r.id AND r.name_zh = '台中市';
```

### 注意事項
- 軟刪除不影響 places 表資料
- App 審核不受影響（純資料策展，非功能變更）
- 日後採集補充後可隨時恢復

---

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


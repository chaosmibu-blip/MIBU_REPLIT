# 扭蛋模組變更日誌 (Gacha Changelog)

> **跨端對應**
> - APP：`memory-api-client.md` → Gacha API 段落
> - 官網：無

---

## Changelog

### 2026-01-12 - 移除 Gacha V1/V2 及舊版行程生成

#### 刪除的檔案與路由
- **刪除 `gacha-core.ts`**：V1 全部路由（`/gacha/pull`、`/gacha/itinerary`、`/gacha/pool/*`、`/gacha/prize-pool`）
- **刪除 V2 路由**：`/gacha/pull/v2`（原在 `gacha-v2v3.ts`）
- **刪除 `/generate-itinerary`**：舊版骨架式行程生成（原在 `gacha-main.ts`）
- **重新命名**：`gacha-v2v3.ts` → `gacha-v3.ts`
- **清理 `shared.ts`**：移除 V1 專用函數（`generateItinerarySkeleton`、`generatePlaceForSubcategory`、`CATEGORY_DATA` 等）
- **清理 `gacha-main.ts`**：只保留 Recur 金流相關路由（checkout、webhook）

#### 保留的功能
- `POST /api/gacha/itinerary/v3` - 主要行程扭蛋 API
- `POST /api/gacha/pull/v3` - 單一景點抽取
- `POST /api/gacha/submit-trip` - 提交行程到官網 SEO
- `POST /api/checkout/create-session` - Recur 結帳
- `GET /api/checkout/session/:sessionId` - 查詢結帳
- `POST /api/webhooks/recur` - Recur webhook

#### 原因
- V3 已穩定運作，V1/V2 及舊版行程生成無人使用
- 減少維護負擔、簡化程式碼結構

---

### 2026-01-01 - 深度審核腳本優化與黑名單共用模組

#### 共用黑名單模組
- **新增檔案**：`server/lib/placeBlacklist.ts`
- **功能**：統一管理所有審核腳本的過濾規則
- **合併來源**：`short-batch-review.ts` + `deep-review-places.ts` 各自的黑名單
- **導出函數**：
  - `shouldPreFilter(placeName)` - 判斷是否應前置過濾
  - `getBlacklistPromptText()` - 取得 AI prompt 用的黑名單描述
  - `EXCLUDE_KEYWORDS` - 黑名單關鍵字陣列
  - `EXACT_EXCLUDE_NAMES` - 完全比對黑名單
  - `PRESERVE_LIST` - 保留名單（蘭城百匯、森本屋）

#### 深度審核 prompt 改版（`deep-review-places.ts`）
- **AI 回傳格式統一**：非旅遊性質回傳 `x`（與 V3 扭蛋的 `X:編號` 格式一致）
- **action 三種值**：`keep`、`x`、`fix`
- **向下相容**：仍支援 `delete` 作為別名
- **新增判斷標準**：
  - 「非旅遊性質」：純粹服務當地居民日常需求的地點
  - 「子分類不夠精確」：如「餐廳」應細分為「火鍋」「燒烤」等
- **輸出新增子分類建議**：審核結束後列出所有新子分類，供加入 `categoryMapping.ts`

#### 腳本更新
| 腳本 | 變更 |
|------|------|
| `short-batch-review.ts` | 改用共用黑名單模組 |
| `deep-review-places.ts` | 改用共用黑名單模組 + prompt 改版 |

---

### 2026-01-01 - AI 排序升級至 Gemini 3 Pro Preview

#### 模型升級
- **模型變更**：`gemini-2.5-flash` → `gemini-3-pro-preview`
- **關鍵參數**：
  - `maxOutputTokens: 8192`（Gemini 3 是推理型模型，思考會消耗大量 token）
  - `temperature: 0.1`（低溫度確保穩定輸出）

#### JSON 格式穩定化
- **Prompt 改版**：要求 AI 只輸出一行 JSON，不要換行或 markdown
- **彈性解析**：先嘗試 `JSON.parse`，失敗則用正則提取 `order` 陣列
- **回應格式**：`{"order":[3,1,5,2,4],"reason":"早餐先逛景點","reject":[]}`

#### 測試結果
- **成功率**：100%（3/3 測試全部成功）
- **排序品質**：AI 正確推斷時段邏輯、地理動線、類別穿插

---

### 2026-01-01 - V3 扭蛋選點與排序重大重構

#### 結構化選點重構（2026-01-01 修正）
- **恢復美食保底機制**：
  - 5-6 張 → 美食保底 2 個
  - 7-8 張 → 美食保底 3 個
  - 9+ 張 → 美食保底 3 個
  - **邊界處理**：保底不超過上限（`minFoodCount = Math.min(minFoodCount, maxFoodCount)`）
- **美食上限**：不超過總數一半（`maxFoodCount = Math.floor(targetCount / 2)`）
- **住宿規則**：≥9 張才有住宿，最多 1 個
- **選點流程**：
  1. 先選取保底美食（固定）
  2. 若 ≥9 張，選取 1 個住宿（固定）
  3. 剩餘額度用六大類別等權重隨機分配
- **六大類別**：美食、景點、購物、娛樂設施、生態文化教育、遊程體驗

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
- **三輪驗證機制**（2026-01-02 新增）：
  - 第一輪：AI 排序並可拒絕不適合地點
  - 第二輪：補充被拒絕地點後重新 AI 驗證
  - 第三輪：若第二輪仍有拒絕，再補充一次並最終驗證（不再無限循環）
- **住宿排序安全網**：即使 AI 沒有正確排序，程式碼也會確保住宿永遠排在最後（100% 保證）
- **AI 理由持久化**（2026-01-02 新增）：最終 AI 排序理由保存到 collections.ai_reason 欄位

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

---

## 待開發功能

### 裝置去重機制（防止同裝置多帳號重刷）
**需求背景**：用戶可能在同一裝置上使用不同帳號登入，繞過圖鑑去重機制重刷優惠券。

**預計上線時機**：優惠券功能上線前

**設計方案**：
```typescript
// 新增資料表
device_gacha_history = {
  id: serial,
  deviceId: varchar,      // 裝置識別碼（App 端生成）
  placeId: integer,       // 抽到的景點
  createdAt: timestamp,   // 抽卡時間
}

// 去重邏輯
const userDedupIds = await storage.getRecentCollectionPlaceIds(userId, 36);
const deviceDedupIds = await storage.getRecentDeviceGachaIds(deviceId, 36);
const allDedupIds = new Set([...userDedupIds, ...deviceDedupIds]);
```

**需要修改**：
1. 新增 `device_gacha_history` 資料表
2. App 端傳送 `deviceId` 參數
3. 後端同時檢查 userId 和 deviceId 去重

---

## 去重機制儲存層級說明

| 儲存層級 | 位置 | 持久性 | 使用情境 |
|---------|------|--------|---------|
| **資料庫** | PostgreSQL | ✅ 永久保存 | 正式用戶圖鑑 |
| **伺服器記憶體** | Node.js Map | ⚠️ 重啟清空 | 訪客去重（30分鐘 TTL） |
| **App 本地** | AsyncStorage | ⚠️ 刪除 App 清空 | 未使用 |

### 訪客去重現況
```typescript
// 伺服器記憶體層級，30 分鐘 TTL
const guestSessionDedup = new Map<string, GuestSessionDedup>();
```
- ⚠️ 伺服器重啟後失效
- ⚠️ 超過 30 分鐘失效
- ⚠️ 換城市不共享

### 2025-12-23 - 資料完整性修復
- 扭蛋查詢強制過濾 `isActive = true`
- 影響函數: `getPlacesByDistrict()`, `getJackpotPlaces()`, `getOfficialPlacesByDistrict()`, `getOfficialPlacesByCity()`, `getPlaceByGoogleId()`
- 每日抽卡計數改為原子更新，修復 Race Condition

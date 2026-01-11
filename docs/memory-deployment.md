# 部署與環境記憶庫 (Deployment & Environment)

## 模組範圍
開發/生產環境設定、環境變數管理、資料同步、部署流程。

---

## 專案結構

### 程式碼目錄
```
├── server/          # Node.js API (Express, TypeScript, Drizzle ORM)
│   ├── routes.ts    # API 端點定義
│   ├── storage.ts   # 資料存取層
│   ├── db.ts        # 資料庫連線
│   └── index.ts     # 伺服器入口
├── client/          # Web Admin (React 18, Vite, Tailwind CSS)
│   └── src/
├── shared/          # 共用型別定義
│   ├── schema.ts    # Drizzle ORM Schema (47 張表)
│   └── errors.ts    # 標準錯誤格式
└── docs/memory/     # 模組記憶庫
```

### 外部專案
- **Expo App**: React Native + NativeWind (獨立 repository)

### 語法防火牆
| 目錄 | 技術棧 | 允許 | 禁止 |
|------|--------|------|------|
| `server/` | Node.js, Express, TypeScript | Drizzle ORM, SQL | React, JSX, Browser APIs |
| `client/` | React 18, Vite, Tailwind | HTML, Browser APIs | Native Components |
| Expo App | React Native, NativeWind | Native Components | HTML (`<div>`, `<img>`) |

---

## 環境區分

### 開發環境 (Development)
```
URL: https://xxx.picard.replit.dev
DB: 開發用 PostgreSQL
用途: 功能開發、測試
```

### 生產環境 (Production)
```
URL: https://gacha-travel--s8869420.replit.app
DB: 生產用 PostgreSQL (獨立)
用途: 正式服務
```

---

## 環境變數清單

### 認證相關
| 變數 | 說明 | 環境 |
|------|------|------|
| `JWT_SECRET` | JWT 簽名金鑰 | shared |
| `APPLE_CLIENT_ID` | Apple Sign In | shared |
| `SESSION_SECRET` | Session 加密 | shared |
| `SUPER_ADMIN_EMAIL` | 超級管理員 | secret |
| `SUPER_ADMIN_PASSWORD` | 超級管理員密碼 | secret |

### 資料庫
| 變數 | 說明 | 環境 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 連線 | auto |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | 連線細節 | auto |

### 第三方服務
| 變數 | 說明 | 環境 |
|------|------|------|
| `GOOGLE_MAPS_API_KEY` | Google Places | shared |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini AI | shared |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini 端點 | shared |
| `MAPBOX_ACCESS_TOKEN` | Mapbox 地圖 | shared |
| `TWILIO_ACCOUNT_SID` | Twilio SMS | shared |
| `TWILIO_AUTH_TOKEN` | Twilio 認證 | secret |
| `TWILIO_PHONE_NUMBER` | Twilio 發送號碼 | shared |

### 支付
| 變數 | 說明 | 環境 |
|------|------|------|
| `STRIPE_SECRET_KEY` | Stripe 私鑰 | secret |
| `STRIPE_WEBHOOK_SECRET` | Webhook 驗證 | secret |

### 系統
| 變數 | 說明 | 環境 |
|------|------|------|
| `NODE_ENV` | 環境標識 | auto |
| `REPLIT_DEV_DOMAIN` | 開發域名 | auto |
| `ADMIN_MIGRATION_KEY` | 資料遷移金鑰 | shared |

---

## 資料同步流程

### 開發 → 生產 同步

#### 1. 匯出開發環境資料
```bash
# 在開發環境執行（需在 Replit shell 中執行）
curl "http://localhost:5000/api/admin/export-places?key=$ADMIN_MIGRATION_KEY" > /tmp/places_export.json

# 確認匯出結果
jq '{count, exportedAt}' /tmp/places_export.json
```

#### 2. 匯入生產環境（分批）
```bash
# ⚠️ 重要：每批最多 100 筆，超過會被拒絕（request entity too large）
PROD_URL="https://gacha-travel--s8869420.replit.app"
KEY="$ADMIN_MIGRATION_KEY"
BATCH_SIZE=100
TOTAL=$(jq '.data | length' /tmp/places_export.json)

i=0
while [ $i -lt $TOTAL ]; do
  END=$((i + BATCH_SIZE))
  [ $END -gt $TOTAL ] && END=$TOTAL
  
  jq --arg key "$KEY" --argjson s $i --argjson e $END \
    '{key: $key, data: .data[$s:$e]}' /tmp/places_export.json > /tmp/b.json
  
  curl -s -X POST "$PROD_URL/api/admin/seed-places" \
    -H "Content-Type: application/json" \
    -d @/tmp/b.json
  
  echo "已處理 $END / $TOTAL"
  i=$((i + BATCH_SIZE))
done
```

#### 3. API 端點規格
```typescript
// 匯出
GET /api/admin/export-places?key={ADMIN_MIGRATION_KEY}
回應: { success, count, exportedAt, data: Place[] }

// 匯入
POST /api/admin/seed-places
Body: { key: string, data: Place[] }
回應: { success, inserted, updated, errors, message }
```

### 同步注意事項
- **批次大小限制**：每批最多 100 筆，正式環境有 body size 限制
- **重複處理**：以 google_place_id 判斷，存在則更新，不存在則新增
- **環境變數**：ADMIN_MIGRATION_KEY 需在 Secrets 中設定
- **最後同步**：2026-01-08，26,338 筆，22 城市

---

## 部署流程

### Replit 部署 (推薦)
```
1. 確認所有變更已 commit
2. 點擊 Deploy → Publish
3. 等待建置完成
4. 驗證生產環境運作
```

### 環境變數更新
```
1. Replit Secrets 面板
2. 更新對應變數
3. 重啟 workflow
```

---

## 資料庫管理

### Schema 同步
```bash
npm run db:push
# 或強制同步
npm run db:push --force
```

### 常用 Drizzle 指令
```bash
# 生成 migration
npm run db:generate

# 執行 migration
npm run db:migrate

# 查看 schema
npm run db:studio
```

### ⚠️ 重要規則
- **禁止修改 ID 欄位類型** (serial ↔ varchar)
- 新增欄位使用 `DEFAULT` 避免 migration 失敗
- 大量資料變更前先備份

---

## 排程任務狀態

| 任務 | 頻率 | 功能 | 狀態 |
|------|------|------|------|
| AutoCleanup | 1 小時 | 清理過期 SOS | ✅ 運行中 |
| DataCleanup | 48 小時 | 資料清理 | ✅ 運行中 |
| Stripe Sync | 啟動時 | Stripe 資料同步 | ✅ 運行中 |

> ⚠️ **已移除**：AutoDraft 和 AIReview 已於 2025-12-25 移除，改為手動腳本執行（見 `memory-travel-gacha.md`）

---

## 監控與日誌

### 日誌位置
```
/tmp/logs/Start_application_xxx.log
/tmp/logs/browser_console_xxx.log
```

### 重要日誌標記
```
[Gacha V3]     - 扭蛋相關
[AutoDraft]    - 自動草稿
[AIReview]     - AI 審核
[JWT]          - 認證相關
[SOS]          - 安全系統
[Stripe]       - 支付相關
```

### 錯誤追蹤
```typescript
// 標準錯誤格式
console.error("[Module] Error description:", error);
```

---

## 健康檢查

### 端點
```
GET /api/health
Response: { status: 'ok', timestamp: Date }
```

### 檢查項目
- Database 連線
- Redis 連線 (如有)
- 第三方 API 狀態

---

## 備份策略

### 資料庫備份
- Replit 自動備份（每日）
- 手動匯出關鍵資料

### 程式碼備份
- Git 版本控制
- Replit Checkpoints

---

## 緊急處理

### 服務異常
```
1. 檢查 workflow 狀態
2. 查看日誌 /tmp/logs/
3. 重啟 workflow
4. 必要時 rollback checkpoint
```

### 資料庫問題
```
1. 確認 DATABASE_URL 正確
2. 檢查連線數限制
3. 使用 db:push --force 同步 schema
```

---

## 效能優化設定

### 資料庫連線池（server/db.ts）
```typescript
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 25,                       // 最大連線數（Neon 優化）
  idleTimeoutMillis: 60000,      // 閒置 60 秒斷開
  connectionTimeoutMillis: 10000, // 連線超時 10 秒
});
```

### 資料庫穩定性機制（2026-01-11 新增）

#### 預熱機制（DB Warmup）
- **功能**：每 4 分鐘 ping 一次資料庫，保持 Neon 連線不休眠
- **原因**：Neon serverless 閒置 5 分鐘後會暫停，導致首次查詢延遲
- **日誌標記**：`[DB Warmup] Ping successful`

#### 重試機制（withRetry）
- **功能**：自動重試失敗的資料庫查詢（最多 2 次，指數退避）
- **捕獲錯誤**：ECONNRESET、57P01/57P03（shutdown）、53300（too many clients）
- **套用範圍**：gachaStorage 的關鍵查詢函數（getOfficialPlacesByCity、getPlacesByDistrict 等）
- **日誌標記**：`[DB Retry] Attempt X failed...`

### Socket 位置追蹤優化（server/socketHandler.ts）
| 設定 | 值 | 說明 |
|------|------|------|
| LOCATION_THROTTLE_MS | 3000 | 同一用戶 3 秒內只處理一次位置更新 |
| BATCH_SYNC_INTERVAL_MS | 30000 | 每 30 秒批次同步位置到 DB |
| Disconnect Flush | ✅ | 斷線時立即 flush 暫存位置 |

### API 速率限制（server/middleware/rateLimit.ts）
| 限制器 | 頻率 | 用途 |
|-------|------|------|
| gachaRateLimiter | 10 req/min | 扭蛋抽卡 API |
| apiRateLimiter | 100 req/min | 一般 API |
| strictRateLimiter | 5 req/min | 敏感操作 |

### 慢查詢監控（server/middleware/queryLogger.ts）
- 記錄超過 **500ms** 的請求
- 套用於 `/api` 全域路由

### 支援規模
目前設定支援 **500~1000 人同時上線**

---

## Changelog

### 2026-01-11 - Neon 資料庫穩定性優化
- 擴充連線池設定（max: 15→25, timeout: 5s→10s）
- 新增 DB 預熱機制（每 4 分鐘 ping 一次）
- 新增 withRetry 重試機制（捕獲 Neon 暫態錯誤）
- 目的：解決「暫無景點」偶發性問題

### 2025-12-26 - 效能優化（500~1000 用戶）
- 新增資料庫連線池設定（max: 15, idle: 30s）
- 新增 Socket 位置追蹤節流（3 秒）+ 批次同步（30 秒）
- 新增 API 速率限制中間件
- 新增慢查詢監控日誌

### 2024-12-24 - 開發→生產資料同步成功
- 新增跨環境同步 API：`/api/admin/export-places` + `/api/admin/seed-places`
- 生產環境從 527 筆增加到 **1,633 筆**景點
- 覆蓋城市從 3 個增加到 **22 個**
- 使用 `ON CONFLICT DO NOTHING` 防止重複插入

---

## Expo Go vs 打包後 App

### 差異比較
| 面向 | Expo Go（開發模式） | 打包後的 App（生產版） |
|------|---------------------|----------------------|
| **連線方式** | 連到開發伺服器，即時載入程式碼 | 程式碼已打包進 App，獨立運作 |
| **API 端點** | 使用開發環境 URL | 使用生產環境 URL |
| **資料庫** | 連開發 DB | 連生產 DB |
| **更新方式** | 開發時自動 Hot Reload | 需重新下載或 OTA 更新 |
| **推播通知** | 使用 Expo Push Token（可能受限） | 使用正式 APNs/FCM 憑證 |
| **效能** | 較慢（需解析 JS Bundle） | 較快（已優化） |

### 注意事項
- Expo Go 無法測試某些原生功能（例如正式的 Apple Pay、特定硬體 API）
- Expo Go 的環境變數與生產版不同，可能導致「開發正常、上架後異常」
- 建議在送審前使用 `eas build` 產出 Preview Build 進行完整測試

---

## App 上架後的更新機制

### 資料更新分類
| 資料類型 | 儲存位置 | 更新方式 | 需要重新上架？ |
|---------|---------|---------|--------------|
| **公告 (announcements)** | 伺服器資料庫 | 後台新增/修改 | ❌ 不需要 |
| **景點資料 (places)** | 伺服器資料庫 | 後台/腳本修改 | ❌ 不需要 |
| **優惠券 (coupons)** | 伺服器資料庫 | 後台設定 | ❌ 不需要 |
| **用戶資料** | 伺服器資料庫 | 即時同步 | ❌ 不需要 |
| **App UI/程式邏輯** | App 內建 | 修改程式碼 | ⚠️ 需要（或用 OTA） |
| **新功能/頁面** | App 內建 | 修改程式碼 | ✅ 需要重新審核 |
| **App 圖示/名稱** | App Store 設定 | 商店後台修改 | ✅ 需要重新審核 |

### 關鍵原則
1. **資料庫內的資料**（公告、景點、優惠券）→ 即時生效，不需重新上架
2. **App 程式碼**（UI、功能邏輯）→ 需要重新打包上架
3. **Expo OTA 更新**（`expo publish` 或 EAS Update）→ 可推送 JS 程式碼更新，無需送審

### OTA 更新限制
- 僅限 JavaScript/TypeScript 程式碼變更
- 無法更新原生模組或 native code
- Apple 要求 OTA 更新不得改變 App 核心功能
- 建議用於 bug 修復、小型 UI 調整

---

## 技術債預防指南

> AI 寫程式容易產生技術債，需要主動預防和定期檢視

### AI 程式碼的常見問題
| 問題類型 | 說明 | 影響 |
|---------|------|------|
| **程式碼重複** | 複製貼上不重構 | 維護困難、Bug 修復遺漏 |
| **缺乏架構判斷** | 只看局部不看全局 | 系統臃腫、難以擴展 |
| **安全漏洞** | 錯誤處理不足、硬編碼密鑰 | 資安風險 |
| **上下文盲區** | 不考慮長期維護性 | 未來重構成本高 |

### Mibu 現有防護機制
| 機制 | 狀態 | 說明 |
|------|------|------|
| **記憶庫系統** | ✅ 有效 | 11 個記憶庫，每個功能有唯一來源 |
| **語法防火牆** | ✅ 有效 | server/client/Expo 嚴格分離 |
| **Schema 集中** | ✅ 有效 | 47 張表定義在 `shared/schema.ts` |
| **Storage 抽象層** | ✅ 有效 | 所有 CRUD 透過 `storage.ts` |
| **強制查閱規則** | ✅ 有效 | 執行任務前必須讀取對應記憶庫 |

### 開發原則
1. **治本優先**：修正根源（資料/設計）而非打補丁
2. **先讀記憶庫**：執行任務前必須查閱對應記憶庫
3. **小步提交**：每完成一個功能就 commit
4. **Architect 審查**：重要修改後呼叫 Architect 審查
5. **不隨意改穩定腳本**：已確認穩定的腳本不輕易修改

### 定期健檢清單
```
□ routes.ts 是否超過 3000 行？ → 拆分成多個路由檔案
□ 是否有重複的程式碼區塊？ → 抽取成獨立函數
□ 新增的 API 是否有記錄在 memory-api-dictionary.md？
□ Schema 變更是否同步到 memory-data-schema.md？
□ 是否有未處理的 LSP 錯誤？
□ 記憶庫內容是否與程式碼同步？
```

### 重構觸發條件
| 指標 | 閾值 | 行動 |
|------|------|------|
| 單一檔案行數 | > 3000 行 | 拆分成多個檔案 |
| 重複程式碼 | > 3 處相似 | 抽取共用函數 |
| API 無文件 | 新增 API | 更新 memory-api-dictionary.md |
| Schema 變更 | 新增/修改欄位 | 更新 memory-data-schema.md |

### 工具使用時機
| 工具 | 用途 | 頻率 |
|------|------|------|
| **Architect 審查** | 檢查架構一致性、程式碼品質 | 每次重要修改後 |
| **LSP 檢查** | 型別錯誤、語法問題 | 即時 |
| **記憶庫更新** | 確保文檔與程式碼同步 | 每次任務完成後 |
| **Checkpoint** | 保存穩定狀態 | 完成功能後 |

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
# 在開發環境執行
curl "https://DEV_URL/api/admin/export-places?key=mibu2024migrate" > places.json
```

#### 2. 匯入生產環境
```bash
# 在生產環境執行
curl -X POST "https://PROD_URL/api/admin/seed-places" \
  -H "Content-Type: application/json" \
  -d @places.json
```

#### 3. API 端點
```typescript
// 匯出 (開發環境)
GET /api/admin/export-places?key=mibu2024migrate&excludeCities=台北市

// 匯入 (生產環境)
POST /api/admin/seed-places
Body: { key: "mibu2024migrate", data: [...] }
```

### 同步注意事項
- 使用 `ON CONFLICT DO NOTHING` 避免重複
- 自動排除目標環境已有的城市
- 遷移金鑰: `mibu2024migrate`

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
  max: 15,                      // 最大連線數（建議 10~20）
  idleTimeoutMillis: 30000,     // 閒置 30 秒斷開
  connectionTimeoutMillis: 5000, // 連線超時 5 秒
});
```

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

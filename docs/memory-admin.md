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

## Changelog

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

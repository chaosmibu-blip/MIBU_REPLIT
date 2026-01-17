# 活動系統記憶庫

> 首頁活動展示與自動爬蟲系統

---

## 概述

首頁有三種活動類型：
1. **公告 (announcement)** - 系統公告，純管理員手動設定
2. **節慶活動 (festival)** - 節日相關活動，支援自動爬蟲
3. **限時活動 (limited)** - 市集、快閃店、觀光活動等，支援自動爬蟲

---

## 資料庫結構

### event_sources（爬蟲來源）

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | serial | 主鍵 |
| name | varchar(100) | 來源名稱 |
| url | text | 爬蟲網址 |
| sourceType | varchar(30) | 'festival', 'limited', 'both' |
| description | text | 來源說明 |
| crawlSelector | text | CSS 選擇器（可選） |
| isActive | boolean | 是否啟用 |
| lastCrawledAt | timestamp | 最後爬取時間 |
| lastCrawlStatus | varchar(20) | 'success', 'failed', 'pending' |
| lastCrawlError | text | 錯誤訊息 |
| createdBy | text | 建立者 |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |

### events（活動）

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | serial | 主鍵 |
| title | varchar(255) | 活動名稱 |
| description | text | 活動描述 |
| eventType | varchar(30) | 'announcement', 'festival', 'limited' |
| location | varchar(255) | 活動地點 |
| locationCity | varchar(50) | 城市 |
| locationDistrict | varchar(50) | 區域 |
| locationLat | double | 緯度 |
| locationLng | double | 經度 |
| startDate | timestamp | 開始日期 |
| endDate | timestamp | 結束日期 |
| imageUrl | text | 活動圖片 |
| sourceUrl | text | 原始連結 |
| sourceId | integer | 爬蟲來源 ID |
| externalId | varchar(100) | 外部 ID（去重用） |
| status | varchar(20) | 'pending', 'approved', 'rejected', 'expired' |
| priority | integer | 排序優先級 |
| isSticky | boolean | 是否置頂 |
| viewCount | integer | 瀏覽次數 |
| createdBy | text | 建立者 |
| createdByType | varchar(20) | 'admin', 'crawler' |
| reviewedBy | text | 審核者 |
| reviewedAt | timestamp | 審核時間 |
| rejectionReason | text | 拒絕原因 |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |

---

## API 端點

### 公開 API（APP/官網使用）

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | /api/events | 取得已審核活動列表 |
| GET | /api/events/:id | 取得活動詳情 |

**查詢參數**：
- `type`: 活動類型 (announcement, festival, limited)
- `city`: 城市篩選
- `limit`: 數量限制 (預設 20)
- `offset`: 分頁偏移

### 管理員 API

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | /api/admin/events | 取得所有活動（含未審核） |
| GET | /api/admin/events/stats | 取得活動統計 |
| GET | /api/admin/events/pending | 取得待審核活動 |
| POST | /api/admin/events | 手動新增活動 |
| PUT | /api/admin/events/:id | 更新活動 |
| POST | /api/admin/events/:id/approve | 審核通過 |
| POST | /api/admin/events/:id/reject | 審核拒絕 |
| DELETE | /api/admin/events/:id | 刪除活動 |

### 爬蟲來源管理

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | /api/admin/events/sources | 取得所有爬蟲來源 |
| POST | /api/admin/events/sources | 新增爬蟲來源 |
| PUT | /api/admin/events/sources/:id | 更新爬蟲來源 |
| DELETE | /api/admin/events/sources/:id | 刪除爬蟲來源 |
| POST | /api/admin/events/crawl | 手動觸發所有來源爬取 |
| POST | /api/admin/events/sources/:id/crawl | 手動觸發單一來源爬取 |

---

## 爬蟲機制

### 爬蟲流程

```
每日凌晨 3:00 AM 自動觸發
         ↓
讀取所有啟用的 event_sources
         ↓
對每個來源：
  1. 抓取網頁 HTML
  2. 使用 Gemini AI 解析活動資訊
  3. 去重檢查（by externalId）
  4. 存入 events 表（status: pending）
         ↓
管理員在後台審核
         ↓
approved → 前台顯示
```

### AI 解析

使用 **Gemini 2.0 Flash** 模型解析網頁內容：
- 提取活動名稱、描述、地點、日期
- 自動識別城市
- 過濾過期活動
- 生成唯一識別碼

### 排程設定

- **執行時間**：每日凌晨 3:00 AM（台灣時間）
- **來源間隔**：每個來源爬取後等待 2 秒
- **超時設定**：每個網頁 30 秒超時

---

## 檔案位置

```
server/
├── storage/eventStorage.ts     # 資料存取層
├── routes/events.ts            # API 路由
├── services/eventCrawler.ts    # 爬蟲服務
└── index.ts                    # 排程設定（第 10 節）

shared/
└── schema.ts                   # eventSources, events 表定義
```

---

## 使用建議

### 新增爬蟲來源

1. 管理後台 → 活動管理 → 爬蟲來源
2. 填入來源名稱、URL、類型
3. 可先用「測試爬取」確認能正確解析
4. 啟用後，每日自動爬取

### 推薦的爬蟲來源

- 交通部觀光署活動訊息
- 各縣市政府觀光旅遊局
- 台灣觀光資訊網
- 地方節慶活動官網

### 審核注意事項

- 確認活動資訊正確
- 確認日期尚未過期
- 可編輯後再審核通過
- 拒絕時填寫原因方便追蹤

---

## 變更日誌

| 日期 | 變更 |
|------|------|
| 2025-01-17 | 建立活動系統，包含爬蟲來源管理、活動管理、自動爬取排程 |

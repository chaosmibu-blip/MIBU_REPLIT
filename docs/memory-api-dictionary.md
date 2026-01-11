# API 記憶庫與字典 (API Dictionary)

## 模組範圍
所有 API 端點的完整清單、請求/回應格式、錯誤代碼。

## 認證方式

### Replit Auth (Web)
```typescript
// Session-based
Cookie: connect.sid=xxx
```

### JWT Token (Mobile)
```typescript
// Header
Authorization: Bearer <jwt_token>

// JWT 結構
{
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;  // 7 天
}
```

### Apple Sign In
```typescript
POST /api/auth/apple
Body: { identityToken: string }
Response: { token: string, user: User }
```

## 錯誤格式
```typescript
// shared/errors.ts
interface ApiError {
  error: string;        // 人類可讀訊息
  code?: string;        // 機器可讀代碼
  details?: any;        // 額外資訊
}

// 常見錯誤代碼
UNAUTHORIZED          // 401 未登入
FORBIDDEN             // 403 無權限
NOT_FOUND             // 404 找不到
VALIDATION_ERROR      // 400 參數錯誤
DAILY_LIMIT_EXCEEDED  // 429 每日限額
REGION_NOT_FOUND      // 400 找不到區域
NO_PLACES_AVAILABLE   // 200 (success=false) 無景點
```

## 端點分類

### 認證 (Auth)
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/auth/user | 取得當前用戶 |
| POST | /api/auth/apple | Apple 登入 |
| POST | /api/auth/logout | 登出 |

### 扭蛋 (Gacha)
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/gacha/itinerary/v3 | 抽取行程 ⭐ |
| POST | /api/gacha/pull/v3 | 抽取單一景點 |
| GET | /api/gacha/quota | 查詢每日剩餘額度 |

#### POST /api/gacha/itinerary/v3 回應欄位
| 欄位 | 類型 | 說明 |
|------|------|------|
| meta.requestedCount | number | 用戶請求張數 |
| meta.totalPlaces | number | 實際抽出張數 |
| meta.isShortfall | boolean | 是否不足 |
| meta.shortfallMessage | string? | 不足提示訊息 |
| meta.dailyPullCount | number | 今日已抽張數 |
| meta.remainingQuota | number | 今日剩餘額度 |

### 背包 (Inventory)
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/inventory | 列出背包物品 |
| POST | /api/inventory/add | 加入物品 |
| DELETE | /api/inventory/:id | 移除物品 |
| GET | /api/inventory/count | 物品數量 |

### 優惠券 (Coupons)
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/coupons/my | 我的優惠券 |
| GET | /api/coupons/merchant/:merchantId | 商家的優惠券列表 |
| POST | /api/coupons | 建立優惠券 |
| PATCH | /api/coupons/:id | 更新優惠券 |
| DELETE | /api/coupons/:id | 刪除優惠券（軟刪除） |
| POST | /api/coupons/redeem | 核銷優惠券 |
| GET | /api/coupons/verify/:code | 驗證優惠券 |
| GET | /api/coupons/region/:regionId/pool | 區域獎池優惠券 |

#### DELETE /api/coupons/:id（2026-01-12 新增）
刪除商家的優惠券（軟刪除：設為 archived + isActive=false）

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (成功):**
```json
{ "success": true, "message": "優惠券已刪除" }
```

**Response (失敗):**
```json
{ "error": "無權限刪除此優惠券", "code": "FORBIDDEN" }
```

### 地區 (Location)
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/countries | 國家列表 |
| GET | /api/regions | 縣市列表 |
| GET | /api/regions/:countryId | 指定國家的縣市 |
| GET | /api/districts/:regionId | 指定縣市的區域 |

### 通知 (Notifications)
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/notifications | 通知列表 |
| POST | /api/notifications/:id/read | 標記已讀 |
| POST | /api/notifications/read-all | 全部已讀 |

### SOS 安全
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/sos/trigger | 觸發 SOS |
| POST | /api/sos/cancel | 取消 SOS |
| GET | /api/sos/status | 查詢狀態 |
| POST | /api/sos/location | 更新位置 |

### 設定 (Config)
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/config/mapbox | Mapbox Token |
| GET | /api/config/app | App 設定 |

### 管理 (Admin)
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/admin/places/batch-generate | 批次採集景點 |
| POST | /api/admin/places/batch-preview | 預覽採集結果 |
| POST | /api/admin/places/reclassify | 重新分類現有資料 ⭐ |
| GET | /api/admin/place-drafts | 待審核列表 |
| POST | /api/admin/place-drafts/:id/approve | 批准景點 |
| DELETE | /api/admin/place-drafts/:id | 刪除草稿 |
| GET | /api/admin/users | 用戶列表 |
| PATCH | /api/admin/users/:id | 更新用戶 |
| GET | /api/admin/export-places | 匯出景點資料 |
| GET | /api/admin/seed-places | 從開發環境匯入景點 |
| DELETE | /api/admin/clear-places | 清空 places 資料（永久刪除） |
| PATCH | /api/admin/soft-delete-places | 軟刪除 places（is_active=false）⭐ |
| PATCH | /api/admin/restore-places | 恢復軟刪除的 places ⭐ |

#### DELETE /api/admin/clear-places（2026-01-02 新增）
清空 places 表的所有資料（保留表結構）

**Query Parameters:**
```
key: string      // 遷移密鑰（必須）
confirm: 'yes'   // 確認執行（不帶此參數只顯示預覽）
```

**使用方式:**
```bash
# 步驟 1：預覽（顯示目前有多少資料）
curl "https://YOUR_URL/api/admin/clear-places?key=mibu2024migrate"

# 步驟 2：確認執行
curl -X DELETE "https://YOUR_URL/api/admin/clear-places?key=mibu2024migrate&confirm=yes"
```

**Response (預覽):**
```json
{
  "warning": "⚠️ 此操作將清空所有 places 資料！",
  "currentData": { "totalPlaces": 1633, "totalCities": 22 },
  "instruction": "如要確認執行，請加上 &confirm=yes 參數"
}
```

**Response (執行):**
```json
{
  "success": true,
  "message": "✅ 已清空所有 places 資料",
  "deleted": { "places": 1633, "collections": 50 }
}
```

#### PATCH /api/admin/soft-delete-places（2026-01-02 新增）
軟刪除 places：將所有 `is_active` 設為 `false`（資料保留，不會出現在扭蛋中）

**使用方式:**
```bash
# 步驟 1：預覽
curl -X PATCH "https://YOUR_URL/api/admin/soft-delete-places?key=mibu2024migrate"

# 步驟 2：確認執行
curl -X PATCH "https://YOUR_URL/api/admin/soft-delete-places?key=mibu2024migrate&confirm=yes"
```

**Response (執行):**
```json
{
  "success": true,
  "message": "✅ 已將所有 places 軟刪除（is_active = false）",
  "affected": 1633,
  "note": "資料仍在資料庫中，可使用 restore-places API 恢復"
}
```

#### PATCH /api/admin/restore-places（2026-01-02 新增）
恢復軟刪除的 places：將所有 `is_active` 設為 `true`

**使用方式:**
```bash
curl -X PATCH "https://YOUR_URL/api/admin/restore-places?key=mibu2024migrate&confirm=yes"
```

#### POST /api/admin/places/reclassify（2025-12-26 新增）
重新分類現有的 cache/drafts/places 資料

**Request Body:**
```typescript
interface ReclassifyRequest {
  target: 'cache' | 'drafts' | 'places' | 'all';  // 預設 'cache'
  limit?: number;  // 預設 100
}
```

**Response:**
```typescript
interface ReclassifyResponse {
  success: boolean;
  message: string;
  updated: number;
  skipped: number;
  errors: number;
  details: Array<{
    id: number;
    name: string;
    oldCategory: string;
    newCategory: string;
    oldSubcategory: string;
    newSubcategory: string;
  }>;
}
```

### SEO 公開 API
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/seo/cities | 城市列表 |
| GET | /api/seo/cities/:slug | 城市詳情（含景點分頁） |
| GET | /api/seo/places | 景點列表（搜尋/篩選） |
| GET | /api/seo/places/by-id/:id | 景點詳情（推薦） |
| GET | /api/seo/trips | 行程列表（App 扭蛋生成） |
| GET | /api/seo/trips/:id | 行程詳情（含景點） |

#### GET /api/seo/trips（2026-01-06 新增）
列出所有已發布的扭蛋行程

**Query Parameters:**
```
city?: string      // 篩選城市
district?: string  // 篩選區域
page?: number      // 分頁（預設 1）
limit?: number     // 每頁筆數（預設 20）
```

**Response:**
```json
{
  "trips": [{
    "id": 123,
    "sessionId": "abc-123",
    "title": "台北市・萬華區 一日遊",
    "city": "台北市",
    "district": "萬華區",
    "description": "探索萬華的古蹟與美食...",
    "imageUrl": "https://...",
    "placeCount": 5,
    "publishedAt": "2026-01-06T12:00:00Z"
  }],
  "pagination": { "page": 1, "limit": 20, "total": 50, "totalPages": 3 }
}
```

#### GET /api/seo/trips/:id
取得單一行程詳情

**Response:**
```json
{
  "trip": { /* 同上 */ },
  "places": [{
    "id": 3406,
    "name": "西門町",
    "slug": "西門町",
    "district": "萬華區",
    "category": "文化",
    "description": "...",
    "imageUrl": "https://...",
    "location": { "lat": 25.0, "lng": 121.5 }
  }]
}
```

### App 專用 API
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/gacha/submit-trip | 提交行程至官網 SEO |

#### POST /api/gacha/submit-trip（2026-01-06 新增）
App 提交扭蛋行程成為官網 SEO 內容

**Request:**
```json
{
  "sessionId": "abc-123",
  "tripImageUrl": "https://storage.replit.dev/..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "行程已成功提交",
  "trip": {
    "sessionId": "abc-123",
    "city": "台北市",
    "tripImageUrl": "https://...",
    "isPublished": true,
    "publishedAt": "2026-01-06T12:00:00Z"
  }
}
```

## 分頁參數
```typescript
// 標準分頁
?page=1&limit=20

// 回應格式
{
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }
}
```

## Rate Limiting
- 一般 API: 100 req/min
- 扭蛋 API: 10 req/min
- 認證 API: 5 req/min

## 版本控制
- 目前版本: v1 (隱含)
- 未來版本: /api/v2/xxx
- 棄用政策: 提前 3 個月通知

---

## 錯誤處理標準
```typescript
// shared/errors.ts
// 標準化錯誤格式: { errorCode, message }

// 常見錯誤碼
UNAUTHORIZED          // 401 - 未登入
FORBIDDEN             // 403 - 無權限
NOT_FOUND             // 404 - 找不到資源
VALIDATION_ERROR      // 400 - 參數錯誤
DAILY_LIMIT_EXCEEDED  // 429 - 每日限額
```

---

## 商家訂閱與退款 API（2026-01-09 新增）

### 取消訂閱
```typescript
POST /api/merchant/subscription/cancel
Headers: { Authorization: Bearer <jwt> }
Body: { subscriptionId: number }

Response (成功):
{
  "success": true,
  "subscription": { "id": 1, "status": "cancelled", ... }
}

Response (失敗):
{ "error": "Subscription not found" }
```

### 檢查退款資格
```typescript
GET /api/merchant/subscription/refund-eligibility?subscriptionId=123
Headers: { Authorization: Bearer <jwt> }

Response:
{
  "subscriptionId": 1,
  "provider": "stripe",
  "tier": "pro",
  "status": "active",
  "createdAt": "2026-01-02T10:00:00Z",
  "daysSinceCreation": 7,
  "refundEligibility": {
    "isEligible": true,
    "reason": "符合 7 天鑑賞期，可申請全額退款",
    "hoursRemaining": 12,
    "daysRemaining": 0
  },
  "cancellationPolicy": {
    "canCancel": true,
    "note": "取消後服務持續至當期結束"
  }
}
```

### 申請退款
```typescript
POST /api/merchant/subscription/refund-request
Headers: { Authorization: Bearer <jwt> }
Body: {
  "subscriptionId": 1,
  "reason": "產品不符合需求，希望申請退款"  // 至少 10 字
}

Response (7天內 + Stripe 自動退款):
{
  "success": true,
  "message": "退款申請已通過，款項將在 5-10 個工作天內退回原付款方式",
  "eligibility": { ... },
  "refundStatus": "approved",
  "refundId": "re_xxx",
  "requestId": 1
}

Response (7天內 + Recur 人工處理):
{
  "success": true,
  "message": "退款申請已提交，Recur 退款需人工處理，客服將於 1-2 個工作天內聯繫您",
  "eligibility": { ... },
  "refundStatus": "pending_manual_review",
  "requestId": 2
}

Response (超過 7 天):
{
  "success": false,
  "message": "已超過 7 天鑑賞期，無法自動退款。如有特殊情況，請聯繫客服。",
  "eligibility": { ... },
  "refundStatus": "not_eligible",
  "contactEmail": "support@mibu-travel.com",
  "requestId": 3
}
```

### 錯誤碼
| 代碼 | HTTP | 說明 |
|------|------|------|
| UNAUTHORIZED | 401 | 未登入 |
| MERCHANT_NOT_FOUND | 404 | 商家不存在 |
| SUBSCRIPTION_NOT_FOUND | 404 | 訂閱不存在 |
| VALIDATION_ERROR | 400 | 退款原因少於 10 字 |

---

## API 端點統計
- 總端點數: 85+
- 認證相關: /api/auth/*
- 扭蛋相關: /api/gacha/*
- 商家相關: /api/merchant/*
- 管理相關: /api/admin/*

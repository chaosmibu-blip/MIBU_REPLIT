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
| POST | /api/coupons/redeem | 核銷優惠券 |
| GET | /api/coupons/verify/:code | 驗證優惠券 |

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

## API 端點統計
- 總端點數: 80+
- 認證相關: /api/auth/*
- 扭蛋相關: /api/gacha/*
- 商家相關: /api/merchants/*
- 管理相關: /api/admin/*

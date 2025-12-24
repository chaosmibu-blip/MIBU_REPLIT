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

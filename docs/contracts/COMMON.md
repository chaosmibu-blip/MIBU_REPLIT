# MIBU API 通用契約 (COMMON)

## 版本: 1.0.0
## 最後更新: 2026-01-16

---

## 環境

| 環境 | URL |
|------|-----|
| 開發 | https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev |
| 生產 | https://gacha-travel--s8869420.replit.app |

---

## 認證

### JWT Token (Mobile)
- 有效期：7 天
- Header：`Authorization: Bearer {token}`
- Payload：`{ userId, email, role, iat, exp }`

### Session (Web)
- Cookie：`connect.sid`
- 用於管理後台

---

## OAuth 登入

### POST /api/auth/mobile
統一 OAuth 端點（支援 Apple/Google）

**Request:**
```typescript
interface MobileAuthRequest {
  provider: 'apple' | 'google';
  idToken?: string;           // Google 用
  identityToken?: string;     // Apple 用
  fullName?: {                // Apple 首次登入
    givenName?: string | null;
    familyName?: string | null;
  } | null;
  email?: string | null;
  user?: string;              // Apple user identifier
  targetPortal?: 'traveler' | 'merchant' | 'specialist' | 'admin';
}
```

**Response (成功):**
```typescript
interface AuthResponse {
  success: true;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isApproved: boolean;
    isSuperAdmin: boolean;
  };
}
```

**Response (失敗):**
```typescript
interface AuthErrorResponse {
  success: false;
  error: string;
  code: string;           // 錯誤碼
  currentRole?: string;   // ROLE_MISMATCH 時
  targetPortal?: string;
}
```

### POST /api/auth/apple
Apple 登入（向後兼容，轉發到 /mobile）

### POST /api/auth/google
Google 登入（向後兼容，轉發到 /mobile）

### GET /api/auth/user
取得當前用戶資訊

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
interface UserResponse {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  isSuperAdmin: boolean;
  accessibleRoles: string[];
  activeRole: string;
  privileges: {
    hasUnlimitedGeneration: boolean;
  };
}
```

### POST /api/auth/switch-role
切換角色（超級管理員用）

**Request:**
```typescript
{ role: 'traveler' | 'merchant' | 'specialist' | 'admin' }
```

**Response:**
```typescript
{
  success: true;
  activeRole: string;
  token: string;  // 新 JWT
  message: string;
}
```

### POST /api/auth/logout
登出

---

## 錯誤碼

### 認證相關 (E1xxx)
| 錯誤碼 | 常數名稱 | 說明 |
|--------|----------|------|
| E1001 | AUTH_REQUIRED | 請先登入 |
| E1002 | AUTH_TOKEN_EXPIRED | 登入已過期 |
| E1003 | AUTH_TOKEN_INVALID | 無效的登入憑證 |
| E1004 | INVALID_CREDENTIALS | 電子郵件或密碼錯誤 |
| E1005 | EMAIL_ALREADY_EXISTS | 此電子郵件已被註冊 |
| E1006 | PENDING_APPROVAL | 帳號審核中 |
| E1007 | ROLE_MISMATCH | 帳號類型不符 |
| E1008 | ROLE_NOT_ACCESSIBLE | 無權限切換角色 |
| E1009 | INVALID_ROLE | 無效的角色 |
| E1010 | ADMIN_REQUIRED | 需要管理員權限 |
| E1011 | FORBIDDEN | 無權限執行此操作 |
| E1012 | SPECIALIST_REQUIRED | 需要專員身份 |
| E1013 | ALREADY_REGISTERED | 已經註冊過 |

### 扭蛋相關 (E2xxx)
| 錯誤碼 | 常數名稱 | 說明 |
|--------|----------|------|
| E2001 | GACHA_NO_CREDITS | 扭蛋次數不足 |
| E2002 | GACHA_RATE_LIMITED | 操作過於頻繁 |
| E2003 | GACHA_GENERATION_FAILED | 行程生成失敗 |

### 地點相關 (E3xxx)
| 錯誤碼 | 常數名稱 | 說明 |
|--------|----------|------|
| E3001 | MISSING_LOCATION_ID | 請提供位置 ID |
| E3002 | NO_DISTRICT_FOUND | 找不到區域 |
| E3003 | REGION_NOT_FOUND | 找不到縣市 |
| E3004 | CITY_REQUIRED | 請選擇城市 |
| E3005 | NO_PLACES_AVAILABLE | 該區域暫無景點 |
| E3006 | COUNTRY_NOT_FOUND | 找不到國家 |

### 商家相關 (E4xxx)
| 錯誤碼 | 常數名稱 | 說明 |
|--------|----------|------|
| E4001 | MERCHANT_REQUIRED | 需要商家帳號 |
| E4002 | MERCHANT_NOT_FOUND | 商家不存在 |
| E4003 | NO_CODE_SET | 尚未設定核銷碼 |
| E4004 | CODE_EXPIRED | 核銷碼已過期 |
| E4005 | INVALID_CODE | 核銷碼錯誤 |
| E4006 | COUPON_NOT_FOUND | 找不到優惠券 |
| E4007 | COUPON_EXPIRED | 優惠券已過期 |
| E4008 | COUPON_ALREADY_USED | 優惠券已使用 |
| E4009 | PLACE_LIMIT_REACHED | 已達景點上限 |
| E4010 | COUPON_LIMIT_REACHED | 已達優惠券上限 |
| E4011 | RARITY_NOT_ALLOWED | 方案不支援此稀有度 |

### 驗證相關 (E5xxx)
| 錯誤碼 | 常數名稱 | 說明 |
|--------|----------|------|
| E5001 | VALIDATION_ERROR | 輸入資料格式錯誤 |
| E5002 | INVALID_PARAMS | 無效的參數 |
| E5003 | MISSING_REQUIRED_FIELD | 缺少必要欄位 |
| E5004 | CONFIG_READONLY | 此設定為唯讀 |
| E5005 | INVITE_EXPIRED | 邀請已過期 |
| E5006 | INVITE_ALREADY_USED | 邀請已被使用 |
| E5007 | ALREADY_CLAIMED | 已被認領 |
| E5008 | ALREADY_ACTIVE | 已有進行中服務 |
| E5009 | ALREADY_PROCESSED | 已處理 |
| E5010 | ALREADY_COMPLETED | 已完成 |

### 資源相關 (E6xxx)
| 錯誤碼 | 常數名稱 | 說明 |
|--------|----------|------|
| E6001 | RESOURCE_NOT_FOUND | 找不到資源 |
| E6002 | USER_NOT_FOUND | 找不到用戶 |
| E6003 | COLLECTION_NOT_FOUND | 找不到圖鑑 |
| E6004 | INVENTORY_ITEM_NOT_FOUND | 找不到道具 |
| E6005 | PLACE_NOT_FOUND | 找不到景點 |
| E6006 | ANNOUNCEMENT_NOT_FOUND | 找不到公告 |
| E6009 | SUBSCRIPTION_NOT_FOUND | 找不到訂閱 |
| E6010 | PLAN_NOT_FOUND | 找不到方案 |

### 支付相關 (E7xxx)
| 錯誤碼 | 常數名稱 | 說明 |
|--------|----------|------|
| E7001 | PAYMENT_FAILED | 付款失敗 |
| E7002 | SUBSCRIPTION_EXPIRED | 訂閱已過期 |
| E7003 | INSUFFICIENT_BALANCE | 餘額不足 |

### 伺服器相關 (E9xxx)
| 錯誤碼 | 常數名稱 | 說明 |
|--------|----------|------|
| E9001 | SERVER_ERROR | 伺服器錯誤 |
| E9002 | INTERNAL_ERROR | 內部錯誤 |
| E9003 | SERVICE_UNAVAILABLE | 服務暫時無法使用 |
| E9004 | RATE_LIMITED | 請求過於頻繁 |

---

## 共用型別

```typescript
// 使用者
interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  role: 'traveler' | 'merchant' | 'specialist' | 'admin';
  isApproved: boolean;
  createdAt: string;
}

// 商家
interface Merchant {
  id: number;
  userId: string;
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  merchantLevel: 'free' | 'pro' | 'premium' | 'partner';
  merchantLevelExpiresAt?: string;
  maxPlaces: number;
  maxCoupons: number;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

// 訂閱
interface Subscription {
  id: number;
  merchantId: number;
  type: 'merchant' | 'place';
  provider: 'stripe' | 'recur';
  tier: 'pro' | 'premium' | 'partner';
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  placeId?: number;
  createdAt: string;
}

// 景點
interface Place {
  id: number;
  placeName: string;
  placeNameI18n?: Record<string, string>;
  country: string;
  city: string;
  district?: string;
  address: string;
  category: string;
  subcategory?: string;
  description?: string;
  rating?: number;
  photoReference?: string;
  locationLat?: number;
  locationLng?: number;
  googlePlaceId?: string;
  isActive: boolean;
}

// 分頁
interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
```

---

## Rate Limiting

| 類型 | 限制 |
|------|------|
| 一般 API | 100 req/min |
| 扭蛋 API | 10 req/min |
| 認證 API | 5 req/min |

---

## 標準回應格式

### 成功
```typescript
interface SuccessResponse<T> {
  success: true;
  data?: T;
  message?: string;
}
```

### 錯誤
```typescript
interface ErrorResponse {
  errorCode: string;  // E1001, E4002...
  message: string;
  details?: any;
}
```

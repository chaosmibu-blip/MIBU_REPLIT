# API 介面契約 (API Contract)

**版本**: v1.0.0  
**最後更新**: 2024-12-17  
**後端 Base URL**: `https://gacha-travel--s8869420.replit.app`

---

## 前端 Agent 專屬指令

> **【Expo Agent 必讀】** 在開發前端時，請嚴格遵守以下規則：

### 1. Backend Agnostic
- 你只負責處理 UI 和 API 串接
- 後端邏輯是黑盒子，不要試圖猜測後端資料庫結構
- 只依賴本文件定義的 API 和 Type

### 2. Type Consistency
- 請嚴格遵守 `types/` 資料夾中的 TypeScript 定義
- 如果 API 回傳的資料跟 Type 不符，**請先報錯，不要擅自修改 Type**
- Type 不符代表後端改壞了，這通常需要後端修正

### 3. Routing
- 本專案使用 **Expo Router**
- 請使用 `router.push()` 而非 `navigation.navigate()`
- 除非是在 Tab 內部切換

### 4. Styling
- 嚴格使用 **NativeWind (Tailwind)**
- 禁止使用 `StyleSheet.create`，除非 Tailwind 無法實現
- 顏色參考 Design System（見下方）

### 5. 禁止事項
- ❌ 參考 Replit 專案中的 `client/` 資料夾
- ❌ 使用 HTML 標籤（`<div>`, `<span>` 等）
- ❌ 依賴 Browser Cookie（必須用 Bearer Token）

---

## Design System

### 顏色定義
```typescript
const colors = {
  primary: '#6366f1',      // Indigo - 主色
  secondary: '#8b5cf6',    // Violet - 次要
  success: '#10b981',      // Emerald - 成功
  warning: '#f59e0b',      // Amber - 警告
  error: '#ef4444',        // Red - 錯誤
  background: '#f9fafb',   // Gray 50 - 背景
  surface: '#ffffff',      // White - 卡片背景
  text: {
    primary: '#1f2937',    // Gray 800
    secondary: '#6b7280',  // Gray 500
    muted: '#9ca3af',      // Gray 400
  },
  border: '#e5e7eb',       // Gray 200
};
```

### 稀有度顏色
```typescript
const rarityColors = {
  SP:  { bg: '#fef3c7', text: '#d97706', border: '#f59e0b' },  // 金色
  SSR: { bg: '#fce7f3', text: '#db2777', border: '#ec4899' },  // 粉紅
  SR:  { bg: '#ede9fe', text: '#7c3aed', border: '#8b5cf6' },  // 紫色
  S:   { bg: '#dbeafe', text: '#2563eb', border: '#3b82f6' },  // 藍色
  R:   { bg: '#f3f4f6', text: '#4b5563', border: '#9ca3af' },  // 灰色
};
```

---

## 統一錯誤格式

所有 API 錯誤回應遵循以下標準格式：

```typescript
interface ApiErrorResponse {
  errorCode: string;   // 錯誤代碼 (如 "E1001")
  message: string;     // 錯誤訊息 (可供 debug 或顯示)
  details?: unknown;   // 額外細節 (可選)
}
```

### 錯誤代碼表 (Error Code Enum)

前端請複製 `shared/errors.ts` 檔案，根據 `errorCode` 顯示對應的多語系文案：

| 代碼 | 名稱 | 說明 |
|------|------|------|
| **認證 (E1xxx)** |
| E1001 | AUTH_REQUIRED | 請先登入 |
| E1002 | AUTH_TOKEN_EXPIRED | 登入已過期 |
| E1003 | AUTH_TOKEN_INVALID | 無效的登入憑證 |
| E1004 | INVALID_CREDENTIALS | 電子郵件或密碼錯誤 |
| E1005 | EMAIL_ALREADY_EXISTS | 此電子郵件已被註冊 |
| E1006 | PENDING_APPROVAL | 帳號審核中 |
| **扭蛋 (E2xxx)** |
| E2001 | GACHA_NO_CREDITS | 扭蛋次數不足 |
| E2002 | GACHA_RATE_LIMITED | 操作過於頻繁 |
| E2003 | GACHA_GENERATION_FAILED | 行程生成失敗 |
| **地點 (E3xxx)** |
| E3001 | MISSING_LOCATION_ID | 請提供 regionId 或 countryId |
| E3002 | NO_DISTRICT_FOUND | 找不到可用的區域 |
| E3003 | REGION_NOT_FOUND | 找不到指定的縣市 |
| E3005 | NO_PLACES_AVAILABLE | 該區域暫無景點資料 |
| **商家 (E4xxx)** |
| E4001 | MERCHANT_REQUIRED | 需要商家帳號 |
| E4002 | MERCHANT_NOT_FOUND | 商家不存在 |
| E4003 | NO_CODE_SET | 商家尚未設定核銷碼 |
| E4004 | CODE_EXPIRED | 核銷碼已過期 |
| E4005 | INVALID_CODE | 核銷碼錯誤 |
| **驗證 (E5xxx)** |
| E5001 | VALIDATION_ERROR | 輸入資料格式錯誤 |
| E5002 | INVALID_PARAMS | 無效的參數 |
| **伺服器 (E9xxx)** |
| E9001 | SERVER_ERROR | 伺服器錯誤 |
| E9004 | RATE_LIMITED | 請求過於頻繁 |

### 前端處理建議

```typescript
// 使用 errorCode 判斷，不要用 message 字串比對
if (error.errorCode === 'E1001' || error.errorCode === 'E1002') {
  // 認證相關錯誤：導向登入頁
  router.push('/login');
} else if (error.errorCode.startsWith('E9')) {
  // 伺服器錯誤：顯示通用錯誤訊息
  showToast('系統忙碌中，請稍後再試');
} else {
  // 其他錯誤：查翻譯檔顯示對應訊息
  showToast(getErrorMessage(error.errorCode));
}
```

---

## 認證方式

所有需要認證的 API 必須在 Header 加上：

```typescript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
}
```

---

## API 端點清單

### 1. 認證 (Auth)

#### POST /api/auth/login
登入並取得 JWT Token

**Request**:
```typescript
{
  email: string;
  password: string;
}
```

**Response**:
```typescript
{
  token: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: 'traveler' | 'merchant' | 'admin';
  };
}
```

#### GET /api/auth/user
取得當前用戶資訊（需認證）

**Response**:
```typescript
{
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'traveler' | 'merchant' | 'admin';
  profileImageUrl: string | null;
}
```

#### DELETE /api/user/account
刪除用戶帳號（iOS App Store 必備功能）

**Headers**:
```
Authorization: Bearer <token>
```

**Response**:
```typescript
{
  status: "ok";
  message: "Account deleted successfully";
  deletedCounts: {
    users: number;
    collections: number;
    userInventory: number;
    userNotifications: number;
    couponRedemptions: number;
    placeFeedback: number;
    cartItems: number;
    userLocations: number;
    sosAlerts: number;
    serviceOrders: number;
    commerceOrders: number;
    // 若為商家還包含：
    merchants?: number;
    merchantCoupons?: number;
    merchantAnalytics?: number;
    coupons?: number;
  };
}
```

**Error Response**:
```typescript
{
  status: "error";
  error: "User not found or already deleted";
}
```

**注意事項**:
- 此操作不可逆，所有用戶資料將被永久刪除
- 若用戶是商家，商家資料也會一併刪除
- 刪除後 session 會自動登出

---

### 2. 扭蛋生成 (Gacha)

#### POST /api/gacha/itinerary/v3
生成 AI 行程（支援訪客模式）

**Request**:
```typescript
{
  regionId?: number;      // 縣市 ID（優先使用）
  countryId?: number;     // 國家 ID（若未提供 regionId）
  city?: string;          // 城市名稱（Legacy，建議用 regionId）
  district?: string;      // 區域名稱（可選）
  itemCount?: number;     // 景點數量 1-15（預設 7）
  pace?: 'relaxed' | 'moderate' | 'packed';  // 行程節奏
  language?: string;      // 語言代碼
}
```

**Response**:
```typescript
{
  success: boolean;
  itinerary: Array<{
    timeSlot: string;     // 'breakfast' | 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'evening'
    place: {
      id: number;
      placeName: string;
      category: string;
      subcategory: string | null;
      description: string | null;
      address: string | null;
      rating: number | null;
      locationLat: number | null;
      locationLng: number | null;
      googlePlaceId: string | null;
    };
    couponWon?: {
      id: number;
      title: string;
      code: string;
      terms: string | null;
    } | null;
  }>;
  couponsWon: Array<{
    couponId: number;
    placeId: number;
    placeName: string;
    title: string;
    code: string;
    terms: string | null;
  }>;
  meta: {
    city: string;
    district: string | null;
    message?: string;           // 若無景點會有提示訊息
    code?: string;              // 錯誤代碼 (如 "NO_PLACES_AVAILABLE")
    sortingMethod?: string;     // "coordinate" | "ai_reordered" - 排序方式
    aiReorderResult?: string;   // "reordered" | "no_change" | "no_numbers" | "error" - AI調整結果
    categoryDistribution?: Record<string, number>;  // 各類別數量分佈
  };
  themeIntro?: string;          // AI 生成的一句話行程主題介紹
}
```

#### POST /api/generate-itinerary
生成 AI 行程（訪客模式）

**說明**: 此端點用於前端扭蛋功能，使用資料庫查詢隨機選擇區域內的地點。

**Request**:
```typescript
{
  regionId?: number;     // 縣市 ID（regionId 或 countryId 至少需一個）
  countryId?: number;    // 國家 ID（若未提供 regionId，則從該國隨機選區）
  level: number;         // 難度等級 1-10
  language: string;      // 語言代碼 ('zh-TW' | 'ja' | 'ko' | 'en')
  collectedNames?: string[];  // 已收藏地點名稱（避免重複）
}
```

**Response**:
```typescript
{
  data: {
    items: Array<{
      name: string;
      nameEn: string;
      category: string;
      subCategory: string;
      rarity: 'SP' | 'SSR' | 'SR' | 'S' | 'R';
      description: string;
      address: string;
      lat: number;
      lng: number;
      rating: number;
      coupon?: {
        id: number;
        title: string;
        code: string;
        discount: string;
      };
    }>;
    totalItems: number;
    targetDistrict: string;  // 抽中的區域名稱
    city: string;            // 縣市名稱
    country: string;         // 國家名稱
    districtId: number;      // 區域 ID
    generatedAt: string;     // ISO 時間戳
  };
  sources: any[];  // Gemini API 來源資訊
}
```

**錯誤回應**:
- `400`: 缺少必要參數或無效 ID
- `404`: 找不到對應的區域/國家
- `429`: Gemini API 配額限制
- `500`: 伺服器錯誤

---

#### GET /api/gacha/pool/:city
取得特定城市的獎池預覽

**Path Parameters**:
- `city` (string): 城市名稱（需 URL encode，如 `台北市` → `%E5%8F%B0%E5%8C%97%E5%B8%82`）

**Response**:
```typescript
{
  success: boolean;
  pool: {
    city: string;
    jackpots: Array<{
      id: number;
      placeName: string;
      category: string;
      subCategory: string;
      rating: string | null;
    }>;
    totalInPool: number;
    jackpotCount: number;
  };
}
```

#### GET /api/gacha/pool
取得獎池資訊（Query 參數版本）

**Query Parameters**:
- `regionId` (number): 縣市 ID
- `city` (string): 城市名稱（二擇一）

**Response**:
```typescript
{
  success: boolean;
  pool: {
    city: string;
    jackpots: Array<{
      id: number;
      placeName: string;
      category: string;
      subCategory: string;
      rating: string | null;
    }>;
    totalInPool: number;
    jackpotCount: number;
  };
}
```

---

### 3. 收藏 (Collection)

#### GET /api/collection/with-promo
取得用戶收藏列表（含優惠狀態）

**Response**:
```typescript
{
  collections: Array<{
    id: number;
    placeName: string;
    country: string;
    city: string;
    district: string | null;
    category: string | null;
    subcategory: string | null;
    description: string | null;
    address: string | null;
    rating: string | null;
    locationLat: string | null;
    locationLng: string | null;
    isCoupon: boolean;
    couponData: any | null;
    collectedAt: string;
    hasPromo: boolean;
    isNew: boolean;
  }>;
  total: number;
  hasPromoItems: boolean;
}
```

#### POST /api/collection/auto-save
自動儲存地點到收藏

**Request**:
```typescript
{
  placeName: string;
  country: string;
  city: string;
  district?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  address?: string;
  rating?: string;
  locationLat?: string;
  locationLng?: string;
}
```

**Response**:
```typescript
{
  success: boolean;
  isNew: boolean;
  collection?: CollectionItem;
}
```

---

### 4. 商家功能 (Merchant)

#### POST /api/merchant/register
商家註冊

**Request**:
```typescript
{
  businessName: string;
  businessType: string;
  contactPhone: string;
  address?: string;
}
```

**Response**:
```typescript
{
  merchant: {
    id: number;
    userId: string;
    businessName: string;
    status: 'pending' | 'approved' | 'rejected';
  };
}
```

#### GET /api/merchant/me
取得當前商家資訊

**Response**:
```typescript
{
  merchant: {
    id: number;
    userId: string;
    businessName: string;
    businessType: string;
    status: 'pending' | 'approved' | 'rejected';
    plan: 'free' | 'pro' | 'premium';
    creditBalance: number;
  } | null;
}
```

#### GET /api/merchant/analytics
取得商家分析數據

**Response**:
```typescript
{
  itineraryCardCount: number;
  couponStats: {
    total: number;
    active: number;
    redeemed: number;
  };
  impressions: number;
  collectionClickCount: number;
}
```

#### GET /api/merchant/coupons
取得商家優惠券列表

**Response**:
```typescript
{
  coupons: Array<{
    id: number;
    title: string;
    code: string;
    terms: string | null;
    rarity: 'SP' | 'SSR' | 'SR' | 'S' | 'R';
    dropRate: number;
    remainingQuantity: number;
    redeemedCount: number;
    isActive: boolean;
  }>;
}
```

#### POST /api/merchant/coupons
建立優惠券

**Request**:
```typescript
{
  placeLinkId: number;
  title: string;
  code: string;
  terms?: string;
  rarity: 'SP' | 'SSR' | 'SR' | 'S' | 'R';
  quantity: number;
}
```

---

### 5. 道具箱 (Inventory/Itembox)

#### GET /api/inventory
取得用戶道具箱

**Response**:
```typescript
{
  items: Array<{
    id: number;
    type: 'coupon' | 'item';
    name: string;
    description: string | null;
    rarity: 'SP' | 'SSR' | 'SR' | 'S' | 'R';
    isRead: boolean;
    isRedeemed: boolean;
    expiresAt: string | null;
    obtainedAt: string;
    couponData?: {
      code: string;
      merchantName: string;
      terms: string;
    };
  }>;
  slotCount: number;
  maxSlots: 30;
}
```

#### POST /api/inventory/:id/redeem
兌換優惠券

**Response**:
```typescript
{
  success: boolean;
  redemptionCode: string;
  expiresAt: string;
}
```

---

### 6. 地理資訊 (Locations)

#### GET /api/locations/countries
取得國家列表

**Response**:
```typescript
{
  countries: Array<{
    id: number;
    name: string;
    code: string;
  }>;
}
```

#### GET /api/locations/regions/:countryId
取得縣市列表

**Response**:
```typescript
{
  regions: Array<{
    id: number;
    name: string;
    countryId: number;
  }>;
}
```

#### GET /api/locations/districts/:regionId
取得鄉鎮區列表

**Response**:
```typescript
{
  districts: Array<{
    id: number;
    name: string;
    regionId: number;
  }>;
}
```

---

### 7. 公告 (Announcements)

#### GET /api/announcements
取得公告列表（公開）

**Query Parameters**:
- `type` (optional): 'announcement' | 'flash_event' | 'holiday_event'

**Response**:
```typescript
{
  announcements: Array<{
    id: number;
    type: 'announcement' | 'flash_event' | 'holiday_event';
    title: string;
    content: string;
    imageUrl: string | null;
    linkUrl: string | null;
    priority: number;
    startDate: string | null;
    endDate: string | null;
  }>;
}
```

---

### 8. 通知 (Notifications)

#### GET /api/notifications
取得未讀通知數量

**Response**:
```typescript
{
  unread: {
    collection: number;
    itembox: number;
    announcement: number;
  };
  total: number;
}
```

#### POST /api/notifications/:type/seen
標記通知為已讀

**Request**:
- `:type` = 'collection' | 'itembox' | 'announcement'

---

### 9. SOS 安全中心

#### GET /api/sos/eligibility
檢查 SOS 資格

**Response**:
```typescript
{
  eligible: boolean;
  reason?: string;
}
```

#### POST /api/sos/trigger
觸發 SOS（透過 webhook，無需認證）

**Query Parameters**:
- `key` (string): SOS 密鑰

**Request**:
```typescript
{
  lat?: number;
  lon?: number;
}
```

#### POST /api/sos/deactivate
關閉 SOS 模式

---

### 10. 廣告 (Ads)

#### GET /api/ads/placements
取得廣告設定

**Query Parameters**:
- `platform` (optional): 'ios' | 'android' | 'all'

**Response**:
```typescript
{
  placements: Array<{
    placementKey: string;  // 'gacha_start' | 'gacha_result' | 'collection_view' | 'item_use'
    adUnitId: string;
    frequency: number;
    isActive: boolean;
  }>;
}
```

---

## TypeScript 類型定義

將以下類型複製到 Expo 專案的 `types/api.ts`：

```typescript
// ============ 基礎類型 ============

export type UserRole = 'traveler' | 'merchant' | 'admin';
export type MerchantStatus = 'pending' | 'approved' | 'rejected';
export type MerchantPlan = 'free' | 'pro' | 'premium';
export type Rarity = 'SP' | 'SSR' | 'SR' | 'S' | 'R';
export type Pace = 'relaxed' | 'balanced' | 'intense';
export type AnnouncementType = 'announcement' | 'flash_event' | 'holiday_event';

// ============ 用戶 ============

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  profileImageUrl: string | null;
}

// ============ 收藏 ============

export interface CollectionItem {
  id: number;
  placeName: string;
  country: string;
  city: string;
  district: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  address: string | null;
  rating: string | null;
  locationLat: string | null;
  locationLng: string | null;
  isCoupon: boolean;
  couponData: CouponData | null;
  collectedAt: string;
  hasPromo?: boolean;
  isNew?: boolean;
}

// ============ 優惠券 ============

export interface CouponData {
  id: number;
  title: string;
  code: string;
  terms: string | null;
  rarity: Rarity;
  merchantName?: string;
}

export interface Coupon {
  id: number;
  title: string;
  code: string;
  terms: string | null;
  rarity: Rarity;
  dropRate: number;
  remainingQuantity: number;
  redeemedCount: number;
  isActive: boolean;
}

// ============ 商家 ============

export interface Merchant {
  id: number;
  userId: string;
  businessName: string;
  businessType: string;
  status: MerchantStatus;
  plan: MerchantPlan;
  creditBalance: number;
}

export interface MerchantAnalytics {
  itineraryCardCount: number;
  couponStats: {
    total: number;
    active: number;
    redeemed: number;
  };
  impressions: number;
  collectionClickCount: number;
}

// ============ 扭蛋 ============

export interface GachaPlace {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  address: string;
  rating: number | null;
  locationLat: string;
  locationLng: string;
  isCoupon: boolean;
  couponData?: CouponData;
}

export interface GachaItineraryResponse {
  itinerary_id: number;
  district: {
    id: number;
    name: string;
    regionName: string;
  };
  places: GachaPlace[];
}

// ============ 道具箱 ============

export interface InventoryItem {
  id: number;
  type: 'coupon' | 'item';
  name: string;
  description: string | null;
  rarity: Rarity;
  isRead: boolean;
  isRedeemed: boolean;
  expiresAt: string | null;
  obtainedAt: string;
  couponData?: {
    code: string;
    merchantName: string;
    terms: string;
  };
}

// ============ 地理 ============

export interface Country {
  id: number;
  name: string;
  code: string;
}

export interface Region {
  id: number;
  name: string;
  countryId: number;
}

export interface District {
  id: number;
  name: string;
  regionId: number;
}

// ============ 公告 ============

export interface Announcement {
  id: number;
  type: AnnouncementType;
  title: string;
  content: string;
  imageUrl: string | null;
  linkUrl: string | null;
  priority: number;
  startDate: string | null;
  endDate: string | null;
}

// ============ 通知 ============

export interface NotificationCounts {
  collection: number;
  itembox: number;
  announcement: number;
}

// ============ 廣告 ============

export type AdPlacement = 'gacha_start' | 'gacha_result' | 'collection_view' | 'item_use' | 'splash' | 'banner';

export interface AdConfig {
  placementKey: AdPlacement;
  adUnitId: string;
  frequency: number;
  isActive: boolean;
}
```

---

## 變更紀錄

| 版本 | 日期 | 變更內容 |
|------|------|----------|
| v1.0.0 | 2024-12-17 | 初版建立 |

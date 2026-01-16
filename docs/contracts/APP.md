# MIBU API APP 契約 (APP)

## 版本: 1.0.0
## 最後更新: 2026-01-16
## 適用專案: MIBU App (React Native + Expo)

---

## 扭蛋系統

### POST /api/gacha/itinerary/v3
生成行程（核心端點）

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
interface GachaRequest {
  city: string;
  district?: string;
  count: number;           // 請求張數（1-10）
  categories?: string[];   // 篩選分類
}
```

**Response:**
```typescript
interface GachaResponse {
  places: GachaPlace[];
  meta: {
    requestedCount: number;    // 用戶請求張數
    totalPlaces: number;       // 實際抽出張數
    isShortfall: boolean;      // 是否不足
    shortfallMessage?: string; // 不足提示訊息
    dailyPullCount: number;    // 今日已抽張數
    remainingQuota: number;    // 今日剩餘額度
  };
  sessionId: string;           // 行程 ID
}

interface GachaPlace {
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
  descriptionI18n?: Record<string, string>;
  rating?: number;
  photoReference?: string;
  openingHours?: any;
  locationLat?: number;
  locationLng?: number;
  googlePlaceId?: string;
  // 扭蛋專屬欄位
  recommendedTimeSlot?: string;
  suggestedDuration?: number;
  coupon?: GachaCoupon;
}

interface GachaCoupon {
  id: number;
  title: string;
  description?: string;
  discountType: 'percentage' | 'fixed' | 'freebie';
  discountValue: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  expiresAt: string;
  merchantName: string;
}
```

---

### POST /api/gacha/pull/v3
抽取單一景點

**Request:**
```typescript
{
  city: string;
  district?: string;
}
```

---

### GET /api/gacha/quota
取得今日剩餘額度

**Response:**
```typescript
{
  dailyLimit: number;       // 每日上限（36）
  usedToday: number;        // 今日已用
  remaining: number;        // 剩餘額度
  isUnlimited: boolean;     // 是否無限（管理員）
}
```

---

### POST /api/gacha/submit-trip
提交行程至官網 SEO

**Request:**
```typescript
{
  sessionId: string;
  tripImageUrl?: string;  // 行程截圖
}
```

**Response:**
```typescript
{
  success: true;
  message: string;
  trip: {
    sessionId: string;
    city: string;
    district?: string;
    tripImageUrl?: string;
    isPublished: boolean;
    publishedAt: string;
  };
}
```

---

## 收藏系統（圖鑑）

### GET /api/collections
取得收藏列表

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
```
page?: number    // 預設 1
limit?: number   // 預設 20
city?: string    // 篩選城市
```

**Response:**
```typescript
interface CollectionsResponse {
  collections: Collection[];
  pagination: Pagination;
}

interface Collection {
  id: number;
  placeId: number;
  place: GachaPlace;
  gachaSessionId?: string;
  collectedAt: string;
  notes?: string;
}
```

---

### POST /api/collections/add
新增收藏

**Request:**
```typescript
{
  placeId: number;
  gachaSessionId?: string;
  notes?: string;
}
```

**Response:**
```typescript
{
  success: true;
  collection: Collection;
}
```

---

### DELETE /api/collections/:id
移除收藏

**Response:**
```typescript
{
  success: true;
  message: string;
}
```

---

### GET /api/collections/stats
收藏統計

**Response:**
```typescript
{
  totalCollected: number;
  byCity: Record<string, number>;
  byCategory: Record<string, number>;
  recentCount: number;  // 最近 7 天
}
```

---

## 背包系統（庫存）

### GET /api/inventory
列出背包物品

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
```
type?: 'coupon' | 'item' | 'all'
page?: number
limit?: number
```

**Response:**
```typescript
interface InventoryResponse {
  items: InventoryItem[];
  pagination: Pagination;
}

interface InventoryItem {
  id: number;
  type: 'coupon' | 'item';
  itemId: number;
  itemData: GachaCoupon | any;
  obtainedAt: string;
  usedAt?: string;
  expiresAt?: string;
  status: 'active' | 'used' | 'expired';
}
```

---

### POST /api/inventory/add
新增物品

**Request:**
```typescript
{
  type: 'coupon' | 'item';
  itemId: number;
  gachaSessionId?: string;
}
```

---

### DELETE /api/inventory/:id
移除物品

---

### GET /api/inventory/count
物品數量統計

**Response:**
```typescript
{
  total: number;
  coupons: number;
  items: number;
  active: number;
  used: number;
  expired: number;
}
```

---

## 優惠券系統

### GET /api/coupons/my
取得我的優惠券

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
interface MyCouponsResponse {
  coupons: UserCoupon[];
  total: number;
}

interface UserCoupon {
  id: number;
  couponId: number;
  coupon: {
    title: string;
    description?: string;
    discountType: string;
    discountValue: number;
    rarity: string;
    merchantName: string;
    merchantId: number;
  };
  obtainedAt: string;
  usedAt?: string;
  expiresAt: string;
  status: 'active' | 'used' | 'expired';
}
```

---

### POST /api/coupons/redeem
核銷優惠券

**Request:**
```typescript
{
  couponId: number;        // 用戶持有的優惠券 ID
  merchantCode: string;    // 商家每日核銷碼
}
```

**Response (成功):**
```typescript
{
  success: true;
  message: string;
  redemption: {
    redeemedAt: string;
    merchantName: string;
  };
}
```

**Response (失敗):**
```typescript
{
  success: false;
  errorCode: 'E4004' | 'E4005' | 'E4007' | 'E4008';
  message: string;
}
```

---

### GET /api/coupons/verify/:code
驗證優惠券（商家用）

---

## SOS 安全中心

### POST /api/sos/trigger
發送緊急求助

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  location: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  message?: string;
  contactIds?: number[];  // 緊急聯絡人
}
```

**Response:**
```typescript
{
  success: true;
  sosId: number;
  message: string;
  notifiedContacts: string[];
}
```

---

### POST /api/sos/cancel
取消 SOS

**Request:**
```typescript
{
  sosId: number;
  reason?: string;
}
```

---

### GET /api/sos/status
查詢 SOS 狀態

**Response:**
```typescript
{
  hasActiveSOS: boolean;
  sos?: {
    id: number;
    status: 'active' | 'resolved' | 'cancelled';
    triggeredAt: string;
    location: { lat: number; lng: number };
  };
}
```

---

### POST /api/sos/location
更新 SOS 位置

**Request:**
```typescript
{
  sosId: number;
  location: {
    lat: number;
    lng: number;
  };
}
```

---

### GET /api/sos/contacts
取得緊急聯絡人

---

### POST /api/sos/contacts
新增緊急聯絡人

---

## 推播通知

### GET /api/notifications
取得通知列表

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
```
page?: number
limit?: number
unreadOnly?: boolean
```

**Response:**
```typescript
interface NotificationsResponse {
  notifications: Notification[];
  pagination: Pagination;
  unreadCount: number;
}

interface Notification {
  id: number;
  type: 'system' | 'coupon' | 'sos' | 'merchant';
  title: string;
  body: string;
  data?: any;
  isRead: boolean;
  createdAt: string;
}
```

---

### PATCH /api/notifications/:id/read
標記已讀

---

### POST /api/notifications/read-all
全部標記已讀

---

### POST /api/notifications/register-token
註冊推播 Token

**Request:**
```typescript
{
  token: string;
  platform: 'ios' | 'android';
}
```

---

## 地區 API

### GET /api/countries
國家列表

**Response:**
```typescript
{
  countries: Country[];
}

interface Country {
  id: number;
  name: string;
  nameI18n?: Record<string, string>;
  code: string;
  placeCount: number;
}
```

---

### GET /api/regions
縣市列表

**Query Parameters:**
```
countryId?: number
```

---

### GET /api/regions/:countryId
指定國家的縣市

---

### GET /api/districts/:regionId
指定縣市的區域

---

## 設定 API

### GET /api/config/app
App 設定

**Response:**
```typescript
{
  minVersion: string;
  currentVersion: string;
  forceUpdate: boolean;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  features: {
    sosEnabled: boolean;
    chatEnabled: boolean;
    merchantEnabled: boolean;
  };
}
```

---

### GET /api/config/mapbox
Mapbox Token

**Response:**
```typescript
{
  accessToken: string;
}
```

---

## 用戶個人資料

### GET /api/profile
取得個人資料

### PATCH /api/profile
更新個人資料

**Request:**
```typescript
{
  firstName?: string;
  lastName?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  birthDate?: string;
  phone?: string;
  dietaryRestrictions?: string[];
  medicalHistory?: string[];
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  preferredLanguage?: string;
}
```

---

## 備註

- 所有 APP API 需要 JWT Token 認證
- 扭蛋每日限額 36 張（管理員無限制）
- 優惠券核銷需要商家每日核銷碼
- SOS 功能會通知緊急聯絡人並記錄位置
- 時間欄位均為 ISO 8601 格式

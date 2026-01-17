# MIBU API 官網契約 (WEB)

## 版本: 1.2.0
## 最後更新: 2026-01-17
## 適用專案: Mibu-Pages (官網)

### 變更日誌
- **1.2.0**: Phase 6 商家新增店家支援營業時間欄位
- **1.1.0**: 新增募資系統 API（Stripe 金流）

---

## SEO API（公開，無需認證）

### GET /api/seo/cities
取得所有城市列表

**Query Parameters:**
```
country?: string  // 篩選國家
```

**Response:**
```typescript
interface CitiesResponse {
  cities: City[];
  total: number;
  message?: string;
}

interface City {
  name: string;
  slug: string;
  country: string;
  placeCount: number;
  tripCount: number;
  imageUrl: string | null;
}
```

---

### GET /api/seo/cities/:slug
取得城市詳情（含景點分頁）

**Path Parameters:**
- `slug`: 城市 slug（如 `taipei`、`台北市`）

**Query Parameters:**
```
page?: number   // 預設 1
limit?: number  // 預設 20，最大 50
```

**Response:**
```typescript
interface CityDetailResponse {
  city: {
    name: string;
    slug: string;
    country: string;
    placeCount: number;
  };
  places: PlaceItem[];
  pagination: Pagination;
  message?: string;
}

interface PlaceItem {
  id: number;
  name: string;
  nameI18n?: Record<string, string>;
  slug: string;
  district?: string;
  address?: string;
  category: string;
  subcategory?: string;
  rating?: number;
  imageUrl: string | null;
  description?: string;
  googlePlaceId?: string;
}
```

---

### GET /api/seo/cities/:slug/related
取得相關城市（同國家）

**Path Parameters:**
- `slug`: 城市 slug

**Query Parameters:**
```
limit?: number  // 預設 6，最大 12
```

**Response:**
```typescript
interface RelatedCitiesResponse {
  city: {
    name: string;
    slug: string;
    country: string;
  };
  relatedCities: City[];
  total: number;
}
```

---

### GET /api/seo/cities/:slug/districts
取得城市內的行政區列表

**Response:**
```typescript
interface DistrictsResponse {
  city: {
    name: string;
    slug: string;
    country: string;
  };
  districts: District[];
  total: number;
  message?: string;
}

interface District {
  name: string;
  slug: string;
  placeCount: number;
  imageUrl: string | null;
}
```

---

### GET /api/seo/districts/:citySlug/:districtSlug
取得行政區詳情（含景點分頁）

**Response:**
```typescript
interface DistrictDetailResponse {
  city: {
    name: string;
    slug: string;
    country: string;
  };
  district: {
    name: string;
    slug: string;
    placeCount: number;
  };
  places: PlaceItem[];
  pagination: Pagination;
  message?: string;
}
```

---

### GET /api/seo/places
景點列表（支援搜尋/篩選）

**Query Parameters:**
```
city?: string      // 篩選城市
category?: string  // 篩選分類
q?: string         // 關鍵字搜尋
page?: number      // 預設 1
limit?: number     // 預設 20，最大 50
```

**Response:**
```typescript
interface PlacesResponse {
  places: PlaceItem[];
  pagination: Pagination;
  message?: string;
}
```

---

### GET /api/seo/places/by-id/:id
取得景點詳情（推薦用此端點）

**Response:**
```typescript
interface PlaceDetailResponse {
  place: {
    id: number;
    name: string;
    nameI18n?: Record<string, string>;
    slug: string;
    country: string;
    city: string;
    district?: string;
    address: string;
    addressI18n?: Record<string, string>;
    category: string;
    subcategory?: string;
    description?: string;
    descriptionI18n?: Record<string, string>;
    rating?: number;
    imageUrl: string | null;
    openingHours?: any;
    location?: {
      lat: number;
      lng: number;
    };
    googlePlaceId?: string;
    googleMapUrl?: string;
  };
  relatedPlaces: PlaceItem[];
}
```

---

### GET /api/seo/places/:slug
取得景點詳情（需提供城市）

**Query Parameters:**
```
city: string  // 必填，城市名稱
```

---

### GET /api/seo/trips
取得行程列表

**Query Parameters:**
```
city?: string      // 篩選城市
district?: string  // 篩選區域
page?: number      // 預設 1
limit?: number     // 預設 20，最大 50
```

**Response:**
```typescript
interface TripsResponse {
  trips: TripItem[];
  pagination: Pagination;
  message?: string;
}

interface TripItem {
  id: number;
  sessionId: string;
  title: string;           // 如 "台北市萬華區 一日遊 #3"
  city: string;
  district?: string;
  description?: string;    // AI 生成的行程說明
  imageUrl?: string;
  placeCount: number;
  categoryDistribution?: Record<string, number>;
  publishedAt: string;
}
```

---

### GET /api/seo/trips/:id
取得行程詳情（含景點）

**Response:**
```typescript
interface TripDetailResponse {
  trip: TripItem;
  places: TripPlace[];
}

interface TripPlace {
  id: number;
  name: string;
  slug: string;
  district?: string;
  category: string;
  subcategory?: string;
  address?: string;
  description?: string;
  rating?: number;
  imageUrl: string | null;
  location?: {
    lat: number;
    lng: number;
  };
}
```

---

### GET /api/seo/trips/:id/related
取得相關行程（同城市/區域）

**Query Parameters:**
```
limit?: number  // 預設 6，最大 12
```

**Response:**
```typescript
interface RelatedTripsResponse {
  trip: {
    id: number;
    city: string;
    district?: string;
  };
  relatedTrips: TripItem[];
  total: number;
}
```

---

## 商家 API（需認證）

### GET /api/merchant
取得當前商家完整資料（含訂閱資訊）

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
interface MerchantResponse {
  id: number;
  userId: string;
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  businessAddress?: string;
  merchantLevel: 'free' | 'pro' | 'premium' | 'partner';
  merchantLevelExpiresAt?: string;
  maxPlaces: number;
  maxCoupons: number;
  creditBalance: number;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  subscription?: Subscription;
  createdAt: string;
}
```

---

### GET /api/merchant/me
取得當前商家基本資料

---

### GET /api/merchant/permissions
取得商家權限與限制

**Response:**
```typescript
interface MerchantPermissions {
  merchantId: number;
  currentTier: 'free' | 'pro' | 'premium' | 'partner';
  limits: {
    maxPlaces: number;
    maxCoupons: number;
    analyticsEnabled: boolean;
    prioritySupport: boolean;
  };
  usage: {
    currentPlaces: number;
    currentCoupons: number;
  };
}
```

---

## 訂閱管理 API（需認證）

### GET /api/merchant/subscription
取得當前訂閱狀態

**Response:**
```typescript
interface SubscriptionResponse {
  hasSubscription: boolean;
  subscription?: {
    id: number;
    type: 'merchant' | 'place';
    tier: 'pro' | 'premium' | 'partner';
    provider: 'stripe' | 'recur';
    status: 'active' | 'cancelled' | 'past_due' | 'trialing';
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelledAt?: string;
  };
}
```

---

### GET /api/merchant/subscription/history
取得訂閱歷史

---

### POST /api/merchant/subscription/checkout
建立結帳工作階段

**Request:**
```typescript
interface CheckoutRequest {
  type: 'merchant' | 'place';
  tier: 'pro' | 'premium' | 'partner';
  provider: 'stripe' | 'recur';
  placeId?: number;        // type='place' 時必填
  successUrl: string;
  cancelUrl: string;
}
```

**Response (Stripe):**
```typescript
interface StripeCheckoutResponse {
  checkoutUrl: string;
}
```

**Response (Recur):**
```typescript
interface RecurCheckoutResponse {
  productId: string;
  publishableKey: string;
  externalCustomerId: string;
}
```

---

### POST /api/merchant/subscription/cancel
取消訂閱

**Request:**
```typescript
{ subscriptionId: number }
```

**Response:**
```typescript
{
  success: true;
  subscription: Subscription;
}
```

---

### POST /api/merchant/subscription/upgrade
升級訂閱

**Request:**
```typescript
{
  subscriptionId: number;
  newTier: 'pro' | 'premium' | 'partner';
}
```

---

### GET /api/merchant/subscription/refund-eligibility
檢查退款資格

**Query Parameters:**
```
subscriptionId: number
```

**Response:**
```typescript
interface RefundEligibilityResponse {
  subscriptionId: number;
  provider: 'stripe' | 'recur';
  tier: string;
  status: string;
  createdAt: string;
  daysSinceCreation: number;
  refundEligibility: {
    isEligible: boolean;
    reason: string;
    hoursRemaining?: number;
    daysRemaining?: number;
  };
  cancellationPolicy: {
    canCancel: boolean;
    note: string;
  };
}
```

---

### POST /api/merchant/subscription/refund-request
申請退款

**Request:**
```typescript
{
  subscriptionId: number;
  reason: string;  // 至少 10 字
}
```

**Response (7天內，Stripe 自動退款):**
```typescript
{
  success: true;
  message: string;
  eligibility: RefundEligibilityResponse;
  refundStatus: 'approved';
  refundId: string;
  requestId: number;
}
```

**Response (7天內，Recur 人工處理):**
```typescript
{
  success: true;
  message: string;
  refundStatus: 'pending_manual_review';
  requestId: number;
}
```

**Response (超過 7 天):**
```typescript
{
  success: false;
  message: string;
  refundStatus: 'not_eligible';
  contactEmail: string;
  requestId: number;
}
```

---

## 商家景點管理 API（需認證）

### POST /api/merchant/places/new
商家新增店家（支援營業時間）

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
interface CreatePlaceRequest {
  placeName: string;
  address: string;
  city: string;
  district?: string;
  category: string;           // 八大分類
  subcategory?: string;
  description?: string;
  openingHours?: {
    weekdayText?: string[];   // ["星期一: 09:00–21:00", ...]
    periods?: any[];          // Google Places API 格式
  };
  phone?: string;
  website?: string;
  locationLat?: number;
  locationLng?: number;
}
```

**Response:**
```typescript
{
  success: true;
  draft: {
    id: number;
    placeName: string;
    status: 'pending';
    openingHours?: object;
    phone?: string;
    website?: string;
    createdAt: string;
  };
  message: string;
}
```

**Note:** 商家新增的店家會進入 place_drafts 待審核，審核通過後才會進入正式 places 表。

---

## 七大分類常數

```typescript
const CATEGORIES = [
  '美食',
  '住宿',
  '景點',
  '購物',
  '娛樂設施',
  '生態文化教育',
  '遊程體驗'
] as const;
```

---

## 募資系統（公開 + 認證混合）

### GET /api/crowdfund/campaigns
取得募資活動列表（公開）

**Query Parameters:**
```
status?: 'upcoming' | 'active' | 'completed' | 'launched'
```

**Response:**
```typescript
interface CampaignsResponse {
  campaigns: CrowdfundCampaign[];
  total: number;
}

interface CrowdfundCampaign {
  id: number;
  countryCode: string;
  countryNameZh: string;
  countryNameEn: string;
  goalAmount: number;
  currentAmount: number;
  contributorCount: number;
  progressPercent: number;
  estimatedPlaces: number;
  status: 'upcoming' | 'active' | 'completed' | 'collecting' | 'launched' | 'failed';
  startDate: string;
  endDate?: string;
  launchedAt?: string;
}
```

---

### GET /api/crowdfund/campaigns/:id
取得募資活動詳情（公開）

**Response:**
```typescript
interface CampaignDetailResponse {
  campaign: CrowdfundCampaign;
  recentContributors: {
    name: string;          // 部分遮蔽
    amount: number;
    createdAt: string;
  }[];
  topContributors: {
    name: string;
    totalAmount: number;
  }[];
}
```

---

### POST /api/crowdfund/checkout
建立募資結帳（Stripe）

**Headers:** `Authorization: Bearer {token}`（可選，未登入可匿名贊助）

**Request:**
```typescript
{
  campaignId: number;
  amount: number;           // NT$
  email?: string;           // 未登入時必填
  name?: string;            // 顯示名稱（選填）
  successUrl: string;
  cancelUrl: string;
}
```

**Response:**
```typescript
{
  checkoutUrl: string;      // Stripe Checkout URL
  sessionId: string;
}
```

---

### POST /api/crowdfund/webhook
Stripe Webhook（內部使用）

**Headers:** `stripe-signature`

**Note:** 此端點由 Stripe 呼叫，處理 `checkout.session.completed` 事件

---

### GET /api/crowdfund/my-contributions
取得我的募資記錄

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
interface MyContributionsResponse {
  contributions: {
    id: number;
    campaign: CrowdfundCampaign;
    amount: number;
    paymentMethod: 'stripe';
    createdAt: string;
  }[];
  summary: {
    totalAmount: number;
    campaignsSupported: number;
  };
}
```

---

## 備註

- SEO API 全部公開，無需認證
- 商家 API 需要 JWT Token
- 募資可匿名贊助（不登入），但無法獲得成就獎勵
- 所有時間欄位為 ISO 8601 格式
- 訂閱服務支援 Stripe 和 Recur 雙軌
- 募資系統官網僅支援 Stripe（APP 使用 IAP）

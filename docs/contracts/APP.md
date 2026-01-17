# MIBU API APP 契約 (APP)

## 版本: 1.2.0
## 最後更新: 2026-01-17
## 適用專案: MIBU App (React Native + Expo)

### 變更日誌
- **1.2.0**: Phase 6 商家營業時間欄位（place_drafts 新增 openingHours, phone, website）
- **1.1.0**: 新增經濟系統、募資、推薦、貢獻、帳號系統 API

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

## 經濟系統（等級/經驗/成就）

### GET /api/user/level
取得用戶等級資訊

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
interface UserLevelResponse {
  level: UserLevel;
  recentExp: ExpTransaction[];   // 最近 10 筆經驗記錄
}

interface ExpTransaction {
  id: number;
  amount: number;
  eventType: string;
  description: string;
  createdAt: string;
}
```

---

### GET /api/user/experience/history
取得經驗值記錄

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
```
page?: number    // 預設 1
limit?: number   // 預設 20
```

**Response:**
```typescript
interface ExpHistoryResponse {
  transactions: ExpTransaction[];
  pagination: Pagination;
  summary: {
    totalEarned: number;
    todayEarned: number;
    dailyLimit: number;
  };
}
```

---

### GET /api/user/achievements
取得成就列表

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
```
category?: 'collector' | 'investor' | 'promoter' | 'business' | 'specialist'
unlockedOnly?: boolean  // 預設 false
```

**Response:**
```typescript
interface AchievementsResponse {
  achievements: Achievement[];
  summary: {
    total: number;
    unlocked: number;
    byCategory: Record<string, { total: number; unlocked: number }>;
  };
}
```

---

### POST /api/user/achievements/:id/claim
領取成就獎勵

**Headers:** `Authorization: Bearer {token}`

**Response (成功):**
```typescript
{
  success: true;
  achievement: Achievement;
  rewards: {
    exp: number;
    title?: string;
    frame?: string;
    badge?: string;
  };
  newLevel?: UserLevel;  // 若升級則返回
}
```

**Response (失敗):**
```typescript
{
  success: false;
  errorCode: 'E10003' | 'E10004';  // 未解鎖 | 已領取
  message: string;
}
```

---

### POST /api/user/specialist/apply
申請成為策劃師

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  introduction: string;     // 自我介紹（至少 50 字）
  expertiseRegions: string[]; // 擅長地區
  languages: string[];      // 可服務語言
}
```

**Response:**
```typescript
{
  success: true;
  message: string;
  applicationId: number;
  status: 'pending';
}
```

---

## 募資系統

### GET /api/crowdfund/campaigns
取得募資活動列表

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
```

---

### GET /api/crowdfund/campaigns/:id
取得募資活動詳情

**Response:**
```typescript
interface CampaignDetailResponse {
  campaign: CrowdfundCampaign;
  myContribution?: {
    totalAmount: number;
    contributionCount: number;
    priorityAccessUsed: boolean;
  };
  recentContributors: {
    userId: string;
    name: string;
    amount: number;
    createdAt: string;
  }[];
}
```

---

### POST /api/crowdfund/contribute
參與募資（IAP 驗證後）

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  campaignId: number;
  amount: number;
  paymentMethod: 'iap_apple' | 'iap_google';
  transactionId: string;
  receiptData: string;       // Base64 encoded receipt
}
```

**Response (成功):**
```typescript
{
  success: true;
  contribution: CrowdfundContribution;
  campaign: CrowdfundCampaign;  // 更新後的進度
  rewards?: {
    exp: number;
    achievement?: Achievement;
  };
}
```

---

### GET /api/crowdfund/my-contributions
取得我的募資記錄

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
interface MyContributionsResponse {
  contributions: CrowdfundContribution[];
  summary: {
    totalAmount: number;
    campaignsSupported: number;
    campaignsLaunched: number;
  };
}
```

---

## 推薦系統

### GET /api/referral/my-code
取得我的推薦碼

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  referralCode: ReferralCode;
  stats: {
    totalReferrals: number;
    activatedReferrals: number;
    pendingRewards: number;
  };
}
```

---

### POST /api/referral/generate-code
生成推薦碼（首次）

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  success: true;
  referralCode: ReferralCode;
}
```

---

### GET /api/referral/validate/:code
驗證推薦碼

**Response:**
```typescript
{
  valid: boolean;
  referrerName?: string;     // 部分遮蔽
  message?: string;
}
```

---

### POST /api/referral/apply
使用推薦碼（註冊時）

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  code: string;
}
```

**Response:**
```typescript
{
  success: true;
  message: string;
  rewards: {
    exp: number;
  };
}
```

---

### GET /api/referral/my-referrals
我推薦的人列表

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  referrals: UserReferral[];
  pagination: Pagination;
}
```

---

### POST /api/referral/merchant
提交商家推薦

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  merchantName: string;
  address: string;
  city: string;
  country: string;
  category: string;           // 七大分類
  contactInfo?: string;
  googlePlaceId?: string;
  notes?: string;
}
```

**Response:**
```typescript
{
  success: true;
  referralId: number;
  status: 'pending';
  message: string;
}
```

---

### GET /api/referral/balance
取得我的餘額

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  balance: UserBalance;
  canWithdraw: boolean;
  minWithdrawAmount: number;
  withdrawFee: number;
}
```

---

### GET /api/referral/transactions
獎勵/提現記錄

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
```
page?: number
limit?: number
type?: 'referral_user' | 'referral_merchant' | 'withdraw'
```

**Response:**
```typescript
{
  transactions: BalanceTransaction[];
  pagination: Pagination;
}
```

---

### POST /api/referral/withdraw
申請提現

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  amount: number;
  bankCode: string;
  bankAccount: string;
  accountName: string;
}
```

**Response (成功):**
```typescript
{
  success: true;
  withdrawal: WithdrawalRequest;
  newBalance: UserBalance;
}
```

**Response (失敗):**
```typescript
{
  success: false;
  errorCode: 'E12005' | 'E12006' | 'E12007';
  message: string;
}
```

---

## 用戶貢獻系統

### POST /api/contribution/report-closed
回報歇業

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  placeId: number;
  reason: 'permanently_closed' | 'temporarily_closed' | 'relocated' | 'info_error';
  description?: string;
}
```

**Response:**
```typescript
{
  success: true;
  report: PlaceReport;
  message: string;
}
```

---

### GET /api/contribution/my-reports
我的回報記錄

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  reports: PlaceReport[];
  pagination: Pagination;
  summary: {
    total: number;
    approved: number;
    pending: number;
  };
}
```

---

### POST /api/contribution/suggest-place
建議景點

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  placeName: string;
  address: string;
  city: string;
  country: string;
  category: string;           // 七大分類
  description?: string;
  googleMapsUrl?: string;
}
```

**Response:**
```typescript
{
  success: true;
  suggestion: PlaceSuggestion;
  message: string;
}
```

---

### GET /api/contribution/my-suggestions
我的建議記錄

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  suggestions: PlaceSuggestion[];
  pagination: Pagination;
}
```

---

### POST /api/collection/:placeId/blacklist
加入黑名單

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  success: true;
  message: string;
  rewards?: {
    exp: number;
  };
}
```

---

### DELETE /api/collection/:placeId/blacklist
移除黑名單

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  success: true;
  message: string;
}
```

---

### GET /api/collection/blacklist
我的黑名單

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  places: {
    id: number;
    placeName: string;
    city: string;
    category: string;
    addedAt: string;
  }[];
  total: number;
}
```

---

### GET /api/contribution/pending-votes
待投票景點列表（排除投票）

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  places: {
    id: number;
    placeName: string;
    city: string;
    monthlyDislikeCount: number;
    voteDeadline: string;
    excludeVotes: number;
    keepVotes: number;
  }[];
}
```

---

### POST /api/contribution/vote/:placeId
投票（排除/不排除）

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  vote: 'exclude' | 'keep';
}
```

**Response:**
```typescript
{
  success: true;
  message: string;
  rewards?: {
    exp: number;
  };
}
```

---

### GET /api/contribution/pending-suggestions
待投票建議列表

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  suggestions: PlaceSuggestion[];
}
```

---

### POST /api/contribution/vote-suggestion/:id
建議景點投票

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  vote: 'approve' | 'reject';
}
```

**Response:**
```typescript
{
  success: true;
  message: string;
  rewards?: {
    exp: number;
  };
}
```

---

## 帳號系統

### POST /api/auth/bind
綁定新身份

**Headers:** `Authorization: Bearer {token}`

**Request:**
```typescript
{
  provider: 'apple' | 'google';
  idToken?: string;           // Google
  identityToken?: string;     // Apple
}
```

**Response:**
```typescript
{
  success: true;
  identity: {
    provider: string;
    email: string;
    linkedAt: string;
  };
  message: string;
}
```

---

### GET /api/auth/identities
取得綁定身份列表

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  identities: {
    id: number;
    provider: 'apple' | 'google';
    email: string;
    isPrimary: boolean;
    linkedAt: string;
  }[];
}
```

---

### DELETE /api/auth/identities/:id
解除綁定

**Headers:** `Authorization: Bearer {token}`

**Response:**
```typescript
{
  success: true;
  message: string;
}
```

**Note:** 不能解除唯一的身份綁定

---

## 備註

- 所有 APP API 需要 JWT Token 認證
- 扭蛋每日限額依等級而定（Lv.1=24, Lv.30=36），管理員無限制
- 優惠券核銷需要商家每日核銷碼
- SOS 功能會通知緊急聯絡人並記錄位置
- 時間欄位均為 ISO 8601 格式
- 投票資格：Lv.7 以上用戶

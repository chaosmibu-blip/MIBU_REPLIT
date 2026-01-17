# 商家端記憶庫 (Merchant Portal Module)

## 模組範圍
商家認領店家、管理優惠券、訂閱方案、數據分析。

## 相關資料表

### merchants (商家帳號)
```typescript
{
  id: number;
  userId: string;           // 關聯 users 表
  businessName: string;
  businessType: string;
  contactEmail: string;
  contactPhone?: string;
  status: 'pending' | 'active' | 'suspended';
  
  // 商家等級訂閱（控制行程卡數量與數據分析）
  merchantTier: 'free' | 'pro' | 'premium';  // 取代舊 subscriptionTier
  merchantTierExpiresAt?: Date;               // 取代舊 subscriptionExpiresAt
  
  // 金流客戶 ID
  stripeCustomerId?: string;
  recurCustomerId?: string;
}
```

> ⚠️ **Migration Note**: 舊欄位 `subscriptionTier` → `merchantTier`、`subscriptionExpiresAt` → `merchantTierExpiresAt`
> 舊值對應：`basic` → `pro`

### merchant_profiles (商家詳細資料)
```typescript
{
  id: number;
  merchantId: number;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  socialLinks?: object;
  businessHours?: object;
}
```

### merchant_place_links (店家認領)
```typescript
{
  id: number;
  merchantId: number;
  placeName: string;        // 認領的店名
  district: string;
  city: string;
  isVerified: boolean;      // 是否已驗證
  isPromoActive: boolean;   // 是否啟用推廣
  promoTitle?: string;
  promoDescription?: string;
  promoImageUrl?: string;
}
```

### merchant_coupons (優惠券模板)
```typescript
{
  id: number;
  merchantPlaceLinkId: number;
  title: string;
  description?: string;
  discountType: 'percentage' | 'fixed' | 'freebie';
  discountValue: number;
  minPurchase?: number;
  maxUsesPerUser: number;
  totalMaxUses?: number;
  validFrom: Date;
  validUntil: Date;
  rarity: 'R' | 'S' | 'SR' | 'SSR' | 'SP';
  isActive: boolean;
}
```

### merchant_analytics (商家數據)
```typescript
{
  id: number;
  merchantId: number;
  date: Date;
  impressions: number;      // 曝光次數
  clicks: number;           // 點擊次數
  couponsClaimed: number;   // 優惠券領取
  couponsRedeemed: number;  // 優惠券核銷
}
```

## 優惠券稀有度機率
```typescript
// coupon_probability_settings 表
SP:  2%   // 最稀有
SSR: 8%
SR:  15%
S:   23%
R:   32%  // 最常見
```

## 主要 API

### 商家管理
- `POST /api/merchants/register` - 商家註冊
- `GET /api/merchants/me` - 取得商家資料
- `PATCH /api/merchants/me` - 更新商家資料
- `GET /api/merchants/me/analytics` - 取得數據

### 店家認領
- `POST /api/merchant/places/claim` - 認領已有景點
- `POST /api/merchant/places/new` - 新增自有景點（待審核）
- `GET /api/merchant/places` - 列出已認領店家
- `PUT /api/merchant/places/:id` - 更新店家資料

### 優惠券管理
- `POST /api/merchants/coupons` - 建立優惠券模板
- `GET /api/merchants/coupons` - 列出優惠券
- `PATCH /api/merchants/coupons/:id` - 更新優惠券
- `DELETE /api/merchants/coupons/:id` - 刪除優惠券

### 優惠券核銷
- `POST /api/coupons/redeem` - 核銷優惠券（掃 QR Code）
- `GET /api/coupons/verify/:code` - 驗證優惠券

## 與扭蛋的整合
- 用戶抽卡時，若景點有商家認領且 `isPromoActive = true`
- 觸發優惠券抽獎（使用 `rollCouponTier()`）
- 中獎優惠券自動加入用戶 Itembox

## 訂閱方案（2026-01-05 更新）

### 商家等級（Merchant Tier）
控制商家整體權限與行程卡數量上限。

| 等級 | 價格 | 行程卡數量 | 數據分析 | 商品管理 |
|------|------|-----------|---------|---------|
| Free | $0 | 1 | ❌ | ✅ |
| Pro | $299/月 | 5 | ✅ | ✅ |
| Premium | $799/月 | 20 | ✅ | ✅ |

### 行程卡等級（Place Card Tier）
控制單一行程卡的展示效果與優惠券功能。

| 等級 | 價格 | 外框 | 優惠資訊 | 優惠券方案數 | 可選稀有度 | 圖片編輯 |
|------|------|-----|---------|-------------|-----------|---------|
| Free | $0 | ❌ | ❌ | 1 | R | 優惠券背景 |
| Pro | $199/月 | ✅ | ✅ | 5 | SSR/SR/S/R | 優惠券+道具箱 |
| Premium | $399/月 | ✅ + 特效 | ✅ | 10 | SP/SSR/SR/S/R | 優惠券+道具箱 |

### 權限對照表

#### 商家功能權限
| 功能 | Free | Pro | Premium |
|------|------|-----|---------|
| 數據分析 - 每日圖鑑卡收錄人數 | ❌ | ✅ | ✅ |
| 數據分析 - 已有圖鑑卡人數 | ❌ | ✅ | ✅ |
| 數據分析 - 圖鑑點擊次數 | ❌ | ✅ | ✅ |
| 數據分析 - 優惠券使用率 | ❌ | ✅ | ✅ |
| 數據分析 - 優惠券總使用次數 | ❌ | ✅ | ✅ |
| 數據分析 - 被查看獎池人數 | ❌ | ✅ | ✅ |
| 行程卡管理 - 最大數量 | 1 | 5 | 20 |
| 商品管理 | ✅ | ✅ | ✅ |

#### 行程卡功能權限
| 功能 | Free | Pro | Premium |
|------|------|-----|---------|
| 行程卡外框 | ❌ | ✅ | ✅ |
| 抽中時載入特效 | ❌ | ❌ | ✅ |
| 編輯優惠資訊 | ❌ | ✅ | ✅ |
| 最大優惠券方案數 | 1 | 5 | 10 |
| 可選優惠券稀有度 | R | SSR/SR/S/R | SP/SSR/SR/S/R |
| 編輯優惠券背景圖片 | ✅ | ✅ | ✅ |
| 編輯道具箱圖片 | ❌ | ✅ | ✅ |

---

## 優惠券稀有度說明

| 稀有度 | 中獎機率 | 獎池顯示 | 中獎特效 | 全域跑馬燈 | 背景圖片 | 道具箱圖片 |
|--------|---------|---------|---------|-----------|---------|-----------|
| R | 32% | ❌ | ❌ | ❌ | ✅ | ❌ |
| S | 23% | ❌ | ❌ | ❌ | ✅ | ✅ |
| SR | 15% | ❌ | ✅ | ❌ | ✅ | ✅ |
| SSR | 8% | ✅ | ✅ | ❌ | ✅ | ✅ |
| SP | 2% | ✅ | ✅（完整動畫）| ✅ | ✅ | ✅ |

---

## 訂閱相關資料表

### merchant_subscriptions（新增）
```typescript
{
  id: number;
  merchantId: number;
  subscriptionType: 'merchant_tier' | 'place_card_tier';
  tier: 'free' | 'pro' | 'premium';
  provider: 'stripe' | 'recur';
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  status: 'active' | 'cancelled' | 'past_due' | 'expired';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  amount?: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### merchant_place_subscriptions（新增）
```typescript
{
  id: number;
  merchantId: number;
  placeId: number;
  tier: 'free' | 'pro' | 'premium';
  subscriptionId?: number;  // 關聯 merchant_subscriptions
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
}
```

### merchants 表新增欄位
```typescript
{
  // 新增欄位
  merchantTier: 'free' | 'pro' | 'premium';
  merchantTierExpiresAt?: Date;
  stripeCustomerId?: string;
  recurCustomerId?: string;
}
```

---

## 訂閱 API

### 訂閱狀態
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/merchant/subscription | 取得當前訂閱狀態 |
| GET | /api/merchant/subscription/history | 訂閱歷史記錄 |

### 訂閱購買
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/merchant/subscription/checkout | 建立訂閱結帳 |
| POST | /api/merchant/subscription/upgrade | 升級方案 |
| POST | /api/merchant/subscription/cancel | 取消訂閱 |

### Webhook
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/webhooks/stripe | Stripe 訂閱事件 |
| POST | /api/webhooks/recur | Recur 訂閱事件 |

---

## 權限同步機制

當 Webhook 收到訂閱更新時：
1. 更新 `merchant_subscriptions` 表
2. 更新 `merchants.merchantTier` 欄位
3. 透過 Socket.io 推送 `subscription:updated` 事件給 App
4. App 刷新商家 session，解鎖對應功能

---

## 權限限制執行邏輯

### 商家等級限制（API/Storage 層）

```typescript
// server/lib/merchantPermissions.ts

// 商家等級對應的行程卡數量上限
const MERCHANT_TIER_LIMITS = {
  free: { maxPlaces: 1, analytics: false },
  pro: { maxPlaces: 5, analytics: true },
  premium: { maxPlaces: 20, analytics: true },
};

// 行程卡等級對應的功能限制
const PLACE_CARD_TIER_LIMITS = {
  free: { 
    maxCoupons: 1, 
    allowedRarities: ['R'],
    hasFrame: false, 
    hasLoadingEffect: false,
    canEditPromo: false,
    canEditItemboxImage: false,
  },
  pro: { 
    maxCoupons: 5, 
    allowedRarities: ['R', 'S', 'SR', 'SSR'],
    hasFrame: true, 
    hasLoadingEffect: false,
    canEditPromo: true,
    canEditItemboxImage: true,
  },
  premium: { 
    maxCoupons: 10, 
    allowedRarities: ['R', 'S', 'SR', 'SSR', 'SP'],
    hasFrame: true, 
    hasLoadingEffect: true,
    canEditPromo: true,
    canEditItemboxImage: true,
  },
};

// 檢查商家是否可以新增行程卡
async function canAddPlaceCard(merchantId: number): Promise<boolean> {
  const merchant = await db.query.merchants.findFirst({ where: eq(merchants.id, merchantId) });
  const tier = merchant?.merchantTier || 'free';
  const limit = MERCHANT_TIER_LIMITS[tier].maxPlaces;
  
  const currentCount = await db.select({ count: sql`count(*)` })
    .from(places)
    .where(eq(places.merchantId, merchantId));
  
  return currentCount[0].count < limit;
}

// 檢查優惠券稀有度是否允許
function isRarityAllowed(placeCardTier: string, rarity: string): boolean {
  const limits = PLACE_CARD_TIER_LIMITS[placeCardTier] || PLACE_CARD_TIER_LIMITS.free;
  return limits.allowedRarities.includes(rarity);
}

// 檢查優惠券數量是否超過上限
async function canAddCoupon(placeId: number): Promise<boolean> {
  const place = await getPlaceWithSubscription(placeId);
  const tier = place.placeCardTier || 'free';
  const limit = PLACE_CARD_TIER_LIMITS[tier].maxCoupons;
  
  const currentCount = await db.select({ count: sql`count(*)` })
    .from(merchantCoupons)
    .where(and(eq(merchantCoupons.placeId, placeId), eq(merchantCoupons.isActive, true)));
  
  return currentCount[0].count < limit;
}
```

### API 層權限檢查範例

```typescript
// POST /api/merchants/places/claim - 認領行程卡
app.post("/api/merchants/places/claim", async (req, res) => {
  const merchantId = req.user.merchantId;
  
  // 檢查是否可以新增行程卡
  if (!(await canAddPlaceCard(merchantId))) {
    return res.status(403).json({ 
      error: "PLACE_LIMIT_EXCEEDED",
      message: "已達行程卡數量上限，請升級方案" 
    });
  }
  
  // ... 執行認領邏輯
});

// POST /api/merchants/coupons - 建立優惠券
app.post("/api/merchants/coupons", async (req, res) => {
  const { placeId, rarity } = req.body;
  const placeCardTier = await getPlaceCardTier(placeId);
  
  // 檢查稀有度是否允許
  if (!isRarityAllowed(placeCardTier, rarity)) {
    return res.status(403).json({
      error: "RARITY_NOT_ALLOWED",
      message: `${placeCardTier} 方案不支援 ${rarity} 稀有度`
    });
  }
  
  // 檢查優惠券數量
  if (!(await canAddCoupon(placeId))) {
    return res.status(403).json({
      error: "COUPON_LIMIT_EXCEEDED",
      message: "已達優惠券方案數量上限，請升級行程卡等級"
    });
  }
  
  // ... 執行建立邏輯
});

// GET /api/merchants/me/analytics - 數據分析
app.get("/api/merchants/me/analytics", async (req, res) => {
  const merchantId = req.user.merchantId;
  const merchant = await getMerchant(merchantId);
  
  // 檢查是否有數據分析權限
  if (!MERCHANT_TIER_LIMITS[merchant.merchantTier].analytics) {
    return res.status(403).json({
      error: "FEATURE_NOT_AVAILABLE",
      message: "數據分析功能需升級至 Pro 或 Premium 方案"
    });
  }
  
  // ... 回傳數據
});
```

### 權限檢查 Helper（簡化版）

```typescript
// 權限檢查 Helper
const checkMerchantPermission = (merchantTier: string, feature: string) => {
  const permissions = {
    free: ['product_management'],
    pro: ['product_management', 'analytics', 'place_card_5'],
    premium: ['product_management', 'analytics', 'place_card_20'],
  };
  return permissions[merchantTier]?.includes(feature);
};

const checkPlaceCardPermission = (tier: string, feature: string) => {
  const permissions = {
    free: ['coupon_bg_edit', 'coupon_rarity_R', 'max_coupon_1'],
    pro: ['coupon_bg_edit', 'itembox_edit', 'promo_edit', 'frame', 
          'coupon_rarity_SSR', 'max_coupon_5'],
    premium: ['coupon_bg_edit', 'itembox_edit', 'promo_edit', 'frame', 
              'loading_effect', 'coupon_rarity_SP', 'max_coupon_10'],
  };
  return permissions[tier]?.includes(feature);
};
```

---

## 待開發功能
- [x] 訂閱方案權限定義 ← 已完成
- [x] 權限檢查 API（canAddPlaceCard, canAddCoupon, isRarityAllowed）← 2026-01-12
- [x] 商家自建景點審核流程（place_drafts）← 2026-01-12
- [ ] Stripe 訂閱整合
- [ ] Recur 訂閱整合
- [ ] 商家儀表板
- [ ] 優惠券使用報表
- [ ] 推播通知管理
- [ ] 權限同步 Socket.io

---

## Changelog

### 2026-01-16 - 商家新增店家：營業時間欄位
- **place_drafts 表新增欄位**：
  - `openingHours: jsonb` - 營業時間（Google Places 格式 `{ weekdayText: string[], periods: any[] }`）
  - `phone: varchar(50)` - 聯絡電話
  - `website: text` - 官方網站
- **API 更新**：`POST /api/merchant/places/new` 支援新增營業時間欄位

### 2026-01-12 - 權限檢查實作與商家自建景點
- **權限檢查實作**：`server/lib/merchantPermissions.ts`
  - `canAddPlaceCard()` - 檢查商家可否新增景點
  - `canAddCoupon()` - 檢查景點可否新增優惠券
  - `isRarityAllowed()` - 檢查稀有度是否允許
- **新增錯誤碼**：`PLACE_LIMIT_REACHED` (E4009)、`COUPON_LIMIT_REACHED` (E4010)、`RARITY_NOT_ALLOWED` (E4011)
- **商家自建景點**：`POST /api/merchant/places/new` 建立 `place_drafts` 待審核記錄
- **Storage 擴展**：`locationStorage` 新增 `getCategoryByCode`、`getCategoryByNameZh`、`getSubcategoryByNameZh`

### 2026-01-05 - 訂閱方案權限重新定義
- **商家等級（Merchant Tier）**：Free/Pro/Premium，控制行程卡數量與數據分析
- **行程卡等級（Place Card Tier）**：Free/Pro/Premium，控制單卡展示效果與優惠券
- **新增資料表**：`merchant_subscriptions`、`merchant_place_subscriptions`
- **merchants 表新增欄位**：`merchantTier`、`merchantTierExpiresAt`、`stripeCustomerId`、`recurCustomerId`
- **權限同步機制**：透過 Socket.io 即時推送至 App

### 2025-12-29 - 商家認領欄位優化
- **places 表新增欄位**：
  - `promoTitle` - 推廣標題（商家認領後設定）
  - `promoDescription` - 推廣描述
  - `claimStatus` - 認領狀態（unclaimed/pending/approved/rejected）
- **架構優化**：直接使用 `places.merchantId` 綁定，簡化認領流程
- **設計理念**：商家認領時直接更新 places 表，優惠券透過 merchantId 關聯

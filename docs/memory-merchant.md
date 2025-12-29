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
  subscriptionTier: 'free' | 'basic' | 'premium';
  subscriptionExpiresAt?: Date;
}
```

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
- `POST /api/merchants/places/claim` - 認領店家
- `GET /api/merchants/places` - 列出已認領店家
- `PATCH /api/merchants/places/:id` - 更新店家資料
- `DELETE /api/merchants/places/:id` - 取消認領

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

## 訂閱方案
| 方案 | 價格 | 功能 |
|------|------|------|
| Free | $0 | 1 店家、5 優惠券 |
| Basic | $299/月 | 3 店家、20 優惠券、基礎數據 |
| Premium | $799/月 | 無限店家、無限優惠券、完整數據 |

## 待開發功能
- [ ] Stripe 訂閱整合
- [ ] 商家儀表板
- [ ] 優惠券使用報表
- [ ] 推播通知管理

---

## Changelog

### 2025-12-29 - 商家認領欄位優化
- **places 表新增欄位**：
  - `promoTitle` - 推廣標題（商家認領後設定）
  - `promoDescription` - 推廣描述
  - `claimStatus` - 認領狀態（unclaimed/pending/approved/rejected）
- **架構優化**：直接使用 `places.merchantId` 綁定，簡化認領流程
- **設計理念**：商家認領時直接更新 places 表，優惠券透過 merchantId 關聯

# 金流與商品記憶庫 (Payment & Commerce Module)

## 模組範圍
支付整合、訂閱管理、購物車、訂單處理、第三方商品。

## 支付服務

### 雙軌金流系統

支援 **Stripe**（國際支付）和 **Recur**（台灣本地支付）雙提供商。

### Stripe 整合
```typescript
// 環境變數
STRIPE_SECRET_KEY      // Stripe 私鑰
STRIPE_WEBHOOK_SECRET  // Webhook 簽名驗證

// 自動同步資料表 (stripe-replit-sync)
stripe_products        // 商品
stripe_prices          // 價格
stripe_customers       // 客戶
stripe_subscriptions   // 訂閱
stripe_invoices        // 發票
stripe_charges         // 收費
stripe_payment_intents // 支付意圖
```

### Recur 整合（2026-01-05 新增）
```typescript
// 環境變數
RECUR_PUBLISHABLE_KEY  // Recur 前端 Key
RECUR_MERCHANT_PRO_PRODUCT_ID     // 商家 Pro 產品
RECUR_MERCHANT_PREMIUM_PRODUCT_ID // 商家 Premium 產品
RECUR_PLACE_PRO_PRODUCT_ID        // 行程卡 Pro 產品
RECUR_PLACE_PREMIUM_PRODUCT_ID    // 行程卡 Premium 產品

// 已配置的產品 ID（硬編碼備援）
fpbnn9ah9090j7hxx5wcv7f4  // 招財貓計畫/月 (Pro, NT$123)
adkwbl9dya0wc6b53parl9yk  // 招財貓計畫/年 (Premium, NT$6,000)

// externalCustomerId 格式（用於 webhook 商家識別）
mibu_m{merchantId}_{type}_{tier}         // 商家訂閱
mibu_m{merchantId}_{type}_{tier}_p{placeId}  // 行程卡訂閱
```

### 統一 Webhook 處理
```typescript
POST /api/webhooks/stripe   // Stripe 簽名驗證
POST /api/webhooks/recur    // Recur webhook

// 事件正規化後統一處理
NormalizedSubscriptionEvent {
  type: 'subscription.created' | 'subscription.updated' | ...
  subscriptionId: string;
  merchantId: number;
  tier: 'free' | 'pro' | 'premium' | 'partner';
  subscriptionType: 'merchant' | 'place';
  placeId?: number;
  currentPeriodEnd?: Date;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  provider: 'stripe' | 'recur';
}
```

## 相關資料表

### transactions (交易記錄)
```typescript
{
  id: number;
  userId: string;
  type: 'purchase' | 'subscription' | 'refund';
  amount: number;
  currency: string;          // TWD, USD
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  stripePaymentIntentId?: string;
  metadata?: object;
  createdAt: Date;
  completedAt?: Date;
}
```

### cart_items (購物車)
```typescript
{
  id: number;
  userId: string;
  itemType: 'service_plan' | 'klook_product' | 'place_product';
  itemId: number;
  quantity: number;
  priceSnapshot: number;     // 加入時的價格
  addedAt: Date;
}
```

### commerce_orders (訂單)
```typescript
{
  id: number;
  userId: string;
  orderNumber: string;       // 訂單編號 e.g. ORD-20241224-001
  status: 'pending' | 'paid' | 'processing' | 'completed' | 'cancelled';
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  shippingInfo?: object;
  stripeSessionId?: string;
  paidAt?: Date;
  createdAt: Date;
}
```

### klook_products (Klook 商品)
```typescript
{
  id: number;
  klookProductId: string;    // Klook 原始 ID
  name: string;
  description?: string;
  price: number;
  currency: string;
  category: string;          // 門票、體驗、交通
  imageUrl?: string;
  affiliateUrl: string;      // 聯盟連結
  regionId?: number;         // 關聯區域
  isActive: boolean;
}
```

### place_products (景點商品)
```typescript
{
  id: number;
  placeId: number;           // 關聯 places
  merchantId?: number;       // 商家提供
  name: string;
  description?: string;
  price: number;
  type: 'ticket' | 'voucher' | 'package';
  stock?: number;
  isActive: boolean;
}
```

## 主要 API

### 購物車
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/cart | 取得購物車 |
| POST | /api/cart/add | 加入商品 |
| PATCH | /api/cart/:id | 更新數量 |
| DELETE | /api/cart/:id | 移除商品 |
| DELETE | /api/cart/clear | 清空購物車 |

### 結帳
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/checkout/create-session | 建立 Stripe 結帳 |
| GET | /api/checkout/success | 結帳成功回調 |
| GET | /api/checkout/cancel | 結帳取消回調 |

### 訂單
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/orders | 我的訂單 |
| GET | /api/orders/:id | 訂單詳情 |
| POST | /api/orders/:id/cancel | 取消訂單 |

### 訂閱 (商家/專員)
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/subscriptions/create | 建立訂閱 |
| GET | /api/subscriptions/me | 我的訂閱 |
| POST | /api/subscriptions/cancel | 取消訂閱 |
| POST | /api/subscriptions/upgrade | 升級方案 |

### Klook 商品
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/klook/products | 商品列表 |
| GET | /api/klook/products/:id | 商品詳情 |
| GET | /api/klook/products/region/:regionId | 區域商品 |

## 金流入口分布（iOS 合規）

| 平台 | 金流類型 | 說明 |
|------|---------|------|
| **官方網站** | 商家訂閱 | Stripe + Recur 雙軌，iOS 跨平台服務規定可用 |
| **App** | 策劃師服務 | 旅客線上購買策劃師服務 |

> ⚠️ 商家訂閱按鈕**僅存在於官方網站**，App 中不提供商家訂閱入口。

## 訂閱方案

### 商家訂閱（官網限定）
| 方案 | 價格 | 功能 |
|------|------|------|
| Free | $0 | 1 店家、5 優惠券 |
| Pro | $299/月 | 3 店家、20 優惠券 |
| Premium | $799/月 | 無限店家、無限優惠券 |

### 專員訂閱
| 方案 | 價格 | 功能 |
|------|------|------|
| Starter | $0 | 基礎功能 |
| Pro | $499/月 | 優先曝光、進階分析 |

## Stripe 結帳流程
```
1. 用戶點擊「結帳」
2. POST /api/checkout/create-session
   - 建立 Stripe Checkout Session
   - 回傳 sessionUrl
3. 前端 redirect 到 Stripe 付款頁
4. 用戶完成付款
5. Stripe 發送 Webhook
6. 後端處理 checkout.session.completed
   - 更新 commerce_orders.status = 'paid'
   - 清空購物車
   - 發送確認通知
7. 用戶被 redirect 回 /checkout/success
```

## 退款處理
```typescript
// 退款 API (Admin Only)
POST /api/admin/refund
Body: {
  orderId: number,
  amount?: number,    // 部分退款
  reason: string
}

// Stripe 退款後 Webhook
charge.refunded → 更新 transactions.status = 'refunded'
```

## 分潤機制 (計畫中)
```typescript
// 專員服務分潤
平台抽成: 15%
專員所得: 85%

// Klook 聯盟分潤
依 Klook 聯盟計畫規則
```

## 安全注意事項
- Stripe 金鑰只存 server 端
- Webhook 需驗證簽名
- 價格以 priceSnapshot 為準（防止改價攻擊）
- 訂單狀態只能由 Webhook 更新

## 待開發功能
- [ ] Apple Pay / Google Pay
- [ ] 優惠碼系統
- [ ] 分期付款
- [ ] 電子發票
- [ ] 退款自動化

# 商家訂閱金流藍圖
> **版本**: 1.0 | **建立日期**: 2026-01-05 | **狀態**: 待實作

---

## 📋 專案概述

### 功能目標
商家在官網購買訂閱，權限即時同步至 Expo App，支援雙軌金流（Stripe 海外 + Recur 台灣）。

### 技術架構
| 系統 | 技術棧 | 職責 |
|------|--------|------|
| **後端** | Node.js + Express + Drizzle ORM | 訂閱管理、Webhook 處理 |
| **官網** | Next.js 15 | 購買頁面、結帳流程 |
| **App** | Expo + React Native | 接收權限更新、功能解鎖 |

---

## ✅ 完成後功能清單

### 商家可見功能

| 功能 | 說明 |
|------|------|
| **訂閱購買頁** | 官網 `/for-business/pricing` 顯示方案比較與購買按鈕 |
| **付款方式選擇** | 信用卡 (Stripe) 或台灣在地支付 (Recur) |
| **即時權限同步** | 付款成功後 App 立即解鎖對應功能 |
| **訂閱管理** | 查看當前方案、升降級、取消續約 |
| **自動續約** | 每月自動扣款，續約失敗有 3 天寬限期 |

### 雙軌訂閱設計

#### 商家等級（Merchant Level）
控制可擁有的行程卡數量：

| 等級 | 價格 | 行程卡數量 | 數據分析 | 商品管理 |
|------|------|-----------|---------|---------|
| Free | $0 | 1 | ❌ | ✅ |
| Pro | $299/月 | 5 | ✅ | ✅ |
| Premium | $799/月 | 20 | ✅ | ✅ |

#### 行程卡等級（Place Card Tier）
控制單張行程卡的功能：

| 等級 | 價格 | 外框 | 優惠資訊 | 優惠券方案數 | 可選稀有度 |
|------|------|-----|---------|-------------|-----------|
| Free | $0 | ❌ | ❌ | 1 | R |
| Pro | $199/月 | ✅ | ✅ | 5 | SSR/SR/S/R |
| Premium | $399/月 | ✅ + 特效 | ✅ | 10 | SP/SSR/SR/S/R |

### 權限同步流程

```
商家在官網選擇方案
       ↓
選擇付款方式（Stripe 或 Recur）
       ↓
跳轉至金流結帳頁面
       ↓
付款成功
       ↓
Webhook 通知後端
       ↓
後端更新 merchants.merchantLevel
       ↓
Socket.io 即時推送至 App
       ↓
App 刷新商家 session，解鎖功能
```

---

## 🔄 訂閱生命週期

### 狀態流程圖

```
                ┌─────────────┐
                │   建立訂閱   │
                │  (checkout) │
                └──────┬──────┘
                       ↓
       ┌───────────────┴───────────────┐
       ↓                               ↓
┌─────────────┐                 ┌─────────────┐
│ 付款成功    │                 │ 付款失敗    │
│ → active    │                 │ → cancelled │
└──────┬──────┘                 └─────────────┘
       ↓
┌─────────────┐
│  正常使用   │
└──────┬──────┘
       │
 ┌─────┼─────┬─────────┬────────────┐
 ↓     ↓     ↓         ↓            ↓
┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐
│ 自動續約│ │ 升級   │ │ 降級   │ │ 取消續約 │ │ 到期   │
│→ active│ │→ active│ │→ active│ │→ canceling│ │→ expired│
└────────┘ └────────┘ └────────┘ └──────────┘ └────────┘
```

### 狀態定義

| 狀態 | 說明 | 權限 |
|------|------|------|
| `active` | 訂閱有效 | 完整權限 |
| `past_due` | 付款失敗，寬限期 | 完整權限（3 天寬限） |
| `canceling` | 已取消續約，期限內仍有效 | 完整權限至到期日 |
| `expired` | 已到期 | 降為 Free 權限 |
| `cancelled` | 已取消（立即失效） | 降為 Free 權限 |

---

## 💳 金流整合

### 雙軌設計

| 金流 | 適用場景 | 支援方式 |
|------|---------|---------|
| **Stripe** | 海外用戶、信用卡 | Visa/Master/JCB/AMEX |
| **Recur (PAYUNi)** | 台灣用戶 | 信用卡、ATM、超商 |

### Webhook 事件映射

| Stripe 事件 | Recur 事件 | 統一處理動作 |
|------------|-----------|-------------|
| `checkout.session.completed` | `checkout.completed` | 建立訂閱 |
| `invoice.paid` | `payment.success` | 續約成功 |
| `invoice.payment_failed` | `payment.failed` | 進入寬限期 |
| `customer.subscription.deleted` | `subscription.cancelled` | 取消訂閱 |

---

## 🗃 資料表

### `merchants` 表（修改）

```typescript
// 現有欄位（沿用）
merchantLevel: varchar("merchant_level", { length: 20 }).default('free'),

// 新增欄位
merchantLevelExpiresAt: timestamp("merchant_level_expires_at"),
stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
recurCustomerId: varchar("recur_customer_id", { length: 255 }),
```

### `places` 表（修改）

```typescript
// 新增欄位
placeCardTier: varchar("place_card_tier", { length: 20 }).default('free'),
placeCardTierExpiresAt: timestamp("place_card_tier_expires_at"),
```

### `merchant_subscriptions` 表（新增）

```typescript
export const merchantSubscriptions = pgTable("merchant_subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  
  type: varchar("type", { length: 20 }).notNull(), // 'merchant' | 'place'
  tier: varchar("tier", { length: 20 }).notNull(), // 'pro' | 'premium'
  placeId: integer("place_id").references(() => places.id),
  
  provider: varchar("provider", { length: 20 }).notNull(), // 'stripe' | 'recur'
  providerSubscriptionId: varchar("provider_subscription_id", { length: 255 }).notNull(),
  providerCustomerId: varchar("provider_customer_id", { length: 255 }),
  
  status: varchar("status", { length: 20 }).default("active").notNull(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  scheduledDowngradeTo: varchar("scheduled_downgrade_to", { length: 20 }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  
  amount: integer("amount"),
  currency: varchar("currency", { length: 10 }).default("TWD"),
  lastPaymentIntentId: varchar("last_payment_intent_id", { length: 255 }),
  
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 資料表約束

```sql
CREATE UNIQUE INDEX idx_merchant_subscriptions_provider 
ON merchant_subscriptions(provider, provider_subscription_id);
```

---

## 🔌 API 端點

### 商家訂閱 API

| Method | Endpoint | 說明 | 認證 |
|--------|----------|------|------|
| GET | `/api/merchant/subscription` | 取得當前訂閱狀態 | Merchant JWT |
| POST | `/api/merchant/subscription/checkout` | 建立訂閱結帳 | Merchant JWT |
| POST | `/api/merchant/subscription/cancel` | 取消訂閱 | Merchant JWT |
| POST | `/api/merchant/subscription/upgrade` | 升級方案 | Merchant JWT |

### Webhook API

| Method | Endpoint | 說明 | 認證 |
|--------|----------|------|------|
| POST | `/api/webhooks/stripe` | Stripe Webhook | Signature |
| POST | `/api/webhooks/recur` | Recur Webhook | Signature |

---

## 📁 新增檔案

### 後端

| 檔案 | 說明 |
|------|------|
| `server/webhooks/unified.ts` | 統一 Webhook 處理（Stripe/Recur 映射） |
| `server/merchant/subscription.ts` | 訂閱管理邏輯 |

### 官網 (Next.js)

| 檔案 | 說明 |
|------|------|
| `app/for-business/page.tsx` | 商家合作頁 |
| `app/for-business/pricing/page.tsx` | 方案比較與購買頁 |
| `app/for-business/checkout/page.tsx` | 結帳頁面 |

### App (Expo)

| 檔案 | 說明 |
|------|------|
| 修改 `hooks/useSocket.ts` | 添加 `subscription:updated` 監聽 |
| 修改 `stores/merchantStore.ts` | 添加權限更新邏輯 |

---

## ⚙️ 環境變數

```bash
# Stripe（現有）
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe 商家訂閱 Price ID（需在 Stripe Dashboard 建立）
STRIPE_MERCHANT_PRO_PRICE_ID=price_...
STRIPE_MERCHANT_PREMIUM_PRICE_ID=price_...
STRIPE_PLACE_PRO_PRICE_ID=price_...
STRIPE_PLACE_PREMIUM_PRICE_ID=price_...

# Recur（需申請）
RECUR_SECRET_KEY=sk_...
RECUR_PUBLISHABLE_KEY=pk_...
RECUR_WEBHOOK_SECRET=...

# Recur 商家訂閱 Product ID（需在 Recur 建立）
RECUR_MERCHANT_PRO_PRODUCT_ID=prod_...
RECUR_MERCHANT_PREMIUM_PRODUCT_ID=prod_...
RECUR_PLACE_PRO_PRODUCT_ID=prod_...
RECUR_PLACE_PREMIUM_PRODUCT_ID=prod_...
```

---

## 🔧 實作步驟

### Step 1：後端 Schema 更新

1. 修改 `shared/schema.ts`：
   - `merchants` 表新增 3 個欄位
   - `places` 表新增 2 個欄位
   - 新增 `merchant_subscriptions` 表
2. 執行 `npm run db:push`
3. 手動執行唯一索引 SQL

### Step 2：後端 Webhook 處理

1. 建立 `server/webhooks/unified.ts`
2. 修改 `server/socketHandler.ts` 添加 `setSocketIO` 調用
3. 添加商家房間 join handler

### Step 3：後端訂閱 API

1. 建立 `server/merchant/subscription.ts`
2. 在 `server/routes.ts` 註冊路由

### Step 4：官網購買頁面

1. 建立方案比較頁
2. 整合 Stripe/Recur 結帳
3. 建立結帳成功/失敗頁面

### Step 5：App 權限同步

1. 修改 Socket.io 連接，添加 `join:merchant` 事件
2. 監聽 `subscription:updated` 事件
3. 更新本地商家狀態

### Step 6：整合測試

1. 在官網購買訂閱
2. 確認 Webhook 正確處理
3. 確認 App 即時收到權限更新

---

## 📡 權限同步機制

### Socket.io 即時推送

```typescript
// 後端：Webhook 處理完成後
io.to(`merchant:${merchantId}`).emit('subscription:updated', {
  merchantId: merchant.id,
  merchantLevel: 'pro',
  merchantLevelExpiresAt: '2026-02-05T00:00:00Z',
});

// App 端：監聯事件
socket.on('subscription:updated', (data) => {
  updateMerchantSession(data);
  refreshUI();
});
```

### Socket.io 事件格式

```typescript
interface SubscriptionUpdatedEvent {
  merchantId: number;
  merchantLevel: 'free' | 'pro' | 'premium';
  merchantLevelExpiresAt: string | null;
}
```

---

## 🔐 安全性設計

### 認證機制

| 場景 | 認證方式 | 說明 |
|------|---------|------|
| 商家登入 | JWT | 與 App 共用認證系統 |
| Webhook | Signature | Stripe/Recur 簽名驗證 |
| Admin API | JWT + Role Check | 需 admin 角色 |

### Webhook 驗證

```typescript
// Stripe
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);

// Recur
const sig = req.headers['x-recur-signature'];
const isValid = verifyRecurSignature(req.rawBody, sig, webhookSecret);
```

---

## 🔄 回滾方案

若出現問題：

```sql
-- 回滾：移除新增的欄位
ALTER TABLE merchants DROP COLUMN merchant_level_expires_at;
ALTER TABLE merchants DROP COLUMN stripe_customer_id;
ALTER TABLE merchants DROP COLUMN recur_customer_id;
ALTER TABLE places DROP COLUMN place_card_tier;
ALTER TABLE places DROP COLUMN place_card_tier_expires_at;

-- 回滾：刪除新表
DROP TABLE IF EXISTS merchant_subscriptions;
```

---

## 📊 預期商業效果

| 指標 | 預期效果 |
|------|---------|
| **轉換率** | 免費商家 → Pro 訂閱 |
| **ARPU** | 提升每商家平均收入 |
| **留存率** | 訂閱商家更願意持續使用 |
| **營運效率** | 自動續約減少人工處理 |

# 商家訂閱金流記憶庫 (官網專用)

## 模組範圍
商家在官方網站購買訂閱方案的完整金流流程。

> ⚠️ 商家訂閱功能**僅存在於官方網站**，App 中不提供（iOS 合規）。

---

## 支付雙軌系統

| 提供商 | 用途 | 支付方式 |
|--------|------|---------|
| **Stripe** | 國際支付 | Visa, Mastercard, AMEX |
| **Recur** | 台灣本地 | 信用卡、ATM 轉帳 |

---

## 頁面結構

```
app/
├── pricing/page.tsx                    // 訂閱方案頁
├── merchant/
│   └── subscription/
│       ├── page.tsx                    // 訂閱管理頁
│       ├── success/page.tsx            // 付款成功頁
│       └── cancel/page.tsx             // 付款取消頁
components/
├── pricing/
│   ├── PricingCard.tsx                 // 方案卡片
│   ├── PaymentMethodSelector.tsx       // 支付方式選擇彈窗
│   └── CheckoutButton.tsx              // 結帳按鈕
```

---

## 訂閱方案

| 方案 | Stripe 價格 | Recur 價格 | 功能 |
|------|------------|------------|------|
| Free | $0 | $0 | 1 間店家、5 張優惠券 |
| Pro | NT$299/月 | NT$123/月 | 3 間店家、20 張優惠券、進階報表 |
| Premium | NT$799/月 | NT$6,000/年 | 無限店家、無限優惠券、專屬客服 |

---

## API 端點

### 1. 取得當前訂閱狀態
```typescript
GET /api/merchant/subscription

Response: {
  currentLevel: 'free' | 'pro' | 'premium' | 'partner';
  subscription: {
    id: number;
    tier: string;
    status: 'active' | 'cancelled' | 'past_due' | 'trialing';
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
}
```

### 2. 建立結帳 Session
```typescript
POST /api/merchant/subscription/checkout

Body: {
  type: 'merchant' | 'place';
  tier: 'pro' | 'premium';
  placeId?: number;              // type='place' 時必填
  provider: 'stripe' | 'recur';
  successUrl?: string;
  cancelUrl?: string;
}

// Stripe 回應
Response (Stripe): {
  url: string;       // Stripe Checkout URL
  sessionId: string;
}

// Recur 回應
Response (Recur): {
  provider: 'recur';
  productId: string;
  publishableKey: string;
  customerEmail: string;
  externalCustomerId: string;
  successUrl: string;
  cancelUrl: string;
}
```

### 3. 取消訂閱
```typescript
POST /api/merchant/subscription/cancel

Body: {
  subscriptionId: number;
}

Response: {
  success: boolean;
  message: string;
  cancelAtPeriodEnd: boolean;
}
```

### 4. 訂閱歷史
```typescript
GET /api/merchant/subscription/history

Response: {
  subscriptions: Array<{
    id: number;
    tier: string;
    status: string;
    createdAt: string;
    cancelledAt?: string;
  }>;
}
```

---

## TypeScript Interface

```typescript
// types/subscription.ts

export type SubscriptionTier = 'free' | 'pro' | 'premium' | 'partner';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing';
export type PaymentProvider = 'stripe' | 'recur';

export interface MerchantSubscription {
  id: number;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionCheckoutRequest {
  type: 'merchant' | 'place';
  tier: 'pro' | 'premium';
  placeId?: number;
  provider: PaymentProvider;
  successUrl?: string;
  cancelUrl?: string;
}

export interface StripeCheckoutResponse {
  url: string;
  sessionId: string;
}

export interface RecurCheckoutResponse {
  provider: 'recur';
  productId: string;
  publishableKey: string;
  customerEmail: string;
  externalCustomerId: string;
  successUrl: string;
  cancelUrl: string;
}

// Socket 事件
export interface SubscriptionUpdatedEvent {
  merchantId: number;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  type: 'merchant' | 'place';
  placeId?: number;
  expiresAt?: string;
}
```

---

## UI 元件實作

### 1. 訂閱方案頁
```tsx
// app/pricing/page.tsx
export default function PricingPage() {
  const [selectedTier, setSelectedTier] = useState<'pro' | 'premium' | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-5xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-center">商家訂閱方案</h1>
        <p className="text-gray-600 text-center mt-4">
          選擇適合您的方案，提升曝光、吸引更多旅客
        </p>

        <div className="grid md:grid-cols-3 gap-8 mt-12">
          <PricingCard
            title="Free"
            price={0}
            period="永久免費"
            features={['1 間店家', '5 張優惠券', '基礎數據報表']}
            buttonText="目前方案"
            disabled
          />

          <PricingCard
            title="Pro"
            price={299}
            period="/月"
            features={['3 間店家', '20 張優惠券', '進階數據報表', '優先曝光']}
            buttonText="升級 Pro"
            highlighted
            onSelect={() => {
              setSelectedTier('pro');
              setShowPaymentModal(true);
            }}
          />

          <PricingCard
            title="Premium"
            price={799}
            period="/月"
            features={['無限店家', '無限優惠券', '完整數據報表', '最高優先曝光', '專屬客服']}
            buttonText="升級 Premium"
            onSelect={() => {
              setSelectedTier('premium');
              setShowPaymentModal(true);
            }}
          />
        </div>
      </div>

      <PaymentMethodSelector
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        tier={selectedTier!}
        onConfirm={(provider) => handleCheckout(selectedTier!, provider)}
      />
    </div>
  );
}
```

### 2. 方案卡片
```tsx
// components/pricing/PricingCard.tsx
interface PricingCardProps {
  title: string;
  price: number;
  period: string;
  features: string[];
  buttonText: string;
  highlighted?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export function PricingCard({ 
  title, price, period, features, buttonText, highlighted, disabled, onSelect 
}: PricingCardProps) {
  return (
    <div className={`
      rounded-2xl p-8 
      ${highlighted 
        ? 'bg-primary text-white ring-4 ring-primary/30 scale-105' 
        : 'bg-white shadow-lg'
      }
    `}>
      <h3 className="text-2xl font-bold">{title}</h3>
      
      <div className="mt-4">
        <span className="text-4xl font-bold">NT${price}</span>
        <span className={highlighted ? 'text-white/80' : 'text-gray-500'}>
          {period}
        </span>
      </div>

      <ul className="mt-6 space-y-3">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2">
            <CheckIcon className={`w-5 h-5 ${highlighted ? 'text-white' : 'text-green-500'}`} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        disabled={disabled}
        className={`
          w-full mt-8 py-3 rounded-xl font-semibold transition
          ${highlighted 
            ? 'bg-white text-primary hover:bg-gray-100' 
            : 'bg-primary text-white hover:bg-primary/90'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {buttonText}
      </button>
    </div>
  );
}
```

### 3. 支付方式選擇彈窗
```tsx
// components/pricing/PaymentMethodSelector.tsx
interface PaymentMethodSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  tier: 'pro' | 'premium';
  onConfirm: (provider: 'stripe' | 'recur') => void;
}

export function PaymentMethodSelector({ isOpen, onClose, tier, onConfirm }: PaymentMethodSelectorProps) {
  const [provider, setProvider] = useState<'stripe' | 'recur'>('recur');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>選擇付款方式</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recur 選項 - 台灣用戶優先 */}
          <label className={`
            flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition
            ${provider === 'recur' ? 'border-primary bg-primary/5' : 'border-gray-200'}
          `}>
            <input
              type="radio"
              name="provider"
              checked={provider === 'recur'}
              onChange={() => setProvider('recur')}
              className="w-5 h-5 text-primary"
            />
            <div className="flex-1">
              <div className="font-semibold">台灣本地支付</div>
              <div className="text-sm text-gray-500">信用卡、ATM 轉帳</div>
            </div>
          </label>

          {/* Stripe 選項 */}
          <label className={`
            flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition
            ${provider === 'stripe' ? 'border-primary bg-primary/5' : 'border-gray-200'}
          `}>
            <input
              type="radio"
              name="provider"
              checked={provider === 'stripe'}
              onChange={() => setProvider('stripe')}
              className="w-5 h-5 text-primary"
            />
            <div className="flex-1">
              <div className="font-semibold">國際信用卡</div>
              <div className="text-sm text-gray-500">Visa, Mastercard, AMEX</div>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => onConfirm(provider)}>前往付款</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. 結帳邏輯 Hook
```tsx
// hooks/useCheckout.ts
export function useCheckout() {
  const [loading, setLoading] = useState(false);

  const checkout = async (
    tier: 'pro' | 'premium', 
    provider: 'stripe' | 'recur',
    type: 'merchant' | 'place' = 'merchant',
    placeId?: number
  ) => {
    setLoading(true);
    try {
      const res = await fetch('/api/merchant/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, tier, provider, placeId }),
      });
      
      if (!res.ok) throw new Error('Checkout failed');
      
      const data = await res.json();

      if (provider === 'stripe') {
        // Stripe: 直接跳轉到 Checkout 頁面
        window.location.href = data.url;
      } else {
        // Recur: 使用 SDK
        const recur = (window as any).RecurCheckout.init({ 
          publishableKey: data.publishableKey 
        });
        await recur.redirectToCheckout({
          productId: data.productId,
          externalCustomerId: data.externalCustomerId,
          successUrl: data.successUrl,
          cancelUrl: data.cancelUrl,
        });
      }
    } catch (error) {
      toast.error('結帳失敗，請稍後再試');
      console.error('Checkout error:', error);
    } finally {
      setLoading(false);
    }
  };

  return { checkout, loading };
}
```

### 5. 付款成功頁
```tsx
// app/merchant/subscription/success/page.tsx
export default function SubscriptionSuccessPage() {
  const searchParams = useSearchParams();
  const tier = searchParams.get('tier');
  const provider = searchParams.get('provider');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircleIcon className="w-10 h-10 text-green-600" />
        </div>
        
        <h1 className="text-2xl font-bold mt-6">訂閱成功！</h1>
        <p className="text-gray-600 mt-2">
          您已成功升級至 {tier?.toUpperCase()} 方案
        </p>

        <div className="bg-gray-50 rounded-xl p-4 mt-6">
          <p className="text-sm text-gray-500">新權限已立即生效</p>
          <ul className="text-left mt-3 space-y-2">
            <li className="flex items-center gap-2 text-sm">
              <CheckIcon className="w-4 h-4 text-green-500" />
              更多店家名額
            </li>
            <li className="flex items-center gap-2 text-sm">
              <CheckIcon className="w-4 h-4 text-green-500" />
              更多優惠券額度
            </li>
            <li className="flex items-center gap-2 text-sm">
              <CheckIcon className="w-4 h-4 text-green-500" />
              進階數據報表
            </li>
          </ul>
        </div>

        <Link 
          href="/merchant/dashboard" 
          className="inline-block mt-6 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition"
        >
          前往商家後台
        </Link>
      </div>
    </div>
  );
}
```

### 6. 訂閱管理頁
```tsx
// app/merchant/subscription/page.tsx
export default function SubscriptionManagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['merchant-subscription'],
    queryFn: () => fetch('/api/merchant/subscription').then(r => r.json()),
  });

  const handleCancel = async () => {
    if (!confirm('確定要取消訂閱嗎？取消後將在當期結束時失效。')) return;
    
    await fetch('/api/merchant/subscription/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId: data.subscription.id }),
    });
    
    toast.success('訂閱將在當期結束後取消');
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold">訂閱管理</h1>

      {/* 當前方案 */}
      <div className="mt-6 bg-white rounded-2xl shadow p-6">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-sm text-gray-500">目前方案</span>
            <h2 className="text-xl font-bold mt-1">
              {data?.currentLevel?.toUpperCase() || 'FREE'}
            </h2>
          </div>
          <span className={`
            px-3 py-1 rounded-full text-sm font-medium
            ${data?.subscription?.status === 'active' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-gray-100 text-gray-800'
            }
          `}>
            {data?.subscription?.status === 'active' ? '使用中' : '已過期'}
          </span>
        </div>

        {data?.subscription?.currentPeriodEnd && (
          <p className="text-sm text-gray-500 mt-4">
            下次扣款日：{format(new Date(data.subscription.currentPeriodEnd), 'yyyy/MM/dd')}
          </p>
        )}

        {data?.subscription?.cancelAtPeriodEnd && (
          <p className="text-sm text-orange-600 mt-2">
            ⚠️ 訂閱將於 {format(new Date(data.subscription.currentPeriodEnd), 'yyyy/MM/dd')} 結束
          </p>
        )}

        <div className="flex gap-4 mt-6">
          <Link 
            href="/pricing" 
            className="flex-1 py-2 text-center border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            變更方案
          </Link>
          {data?.subscription && !data.subscription.cancelAtPeriodEnd && (
            <button 
              onClick={handleCancel}
              className="flex-1 py-2 text-center text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
            >
              取消訂閱
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Recur SDK 使用方式

### 載入 SDK
```html
<!-- 方法 1: CDN (推薦) -->
<script src="https://unpkg.com/recur-tw@0.11.0/dist/recur.umd.js"></script>
```

### 初始化與結帳
```typescript
// 初始化
const recur = window.RecurCheckout.init({ 
  publishableKey: 'pk_test_xxx' 
});

// 跳轉結帳
await recur.redirectToCheckout({
  productId: 'fpbnn9ah9090j7hxx5wcv7f4',
  externalCustomerId: 'mibu_m123_merchant_pro',  // 重要！
  successUrl: '/merchant/subscription/success?provider=recur&tier=pro',
  cancelUrl: '/merchant/subscription/cancel',
});
```

---

## Socket 事件

```typescript
// 監聽訂閱狀態即時更新
socket.on('subscription:updated', (data: SubscriptionUpdatedEvent) => {
  // 更新本地狀態、刷新頁面或顯示通知
  queryClient.invalidateQueries(['merchant-subscription']);
  
  if (data.status === 'active') {
    toast.success(`訂閱已升級至 ${data.tier.toUpperCase()}`);
  }
});
```

---

## 錯誤處理

| 錯誤碼 | 說明 | 前端處理 |
|--------|------|---------|
| 400 | 參數錯誤 | 顯示具體錯誤訊息 |
| 401 | 未登入 | 導向商家登入頁 |
| 404 | 商家/訂閱不存在 | 導向註冊流程 |
| 409 | 已有相同訂閱 | 提示「您已擁有此方案」 |
| 500 | 伺服器錯誤 | 顯示「系統繁忙，請稍後再試」 |

---

## 待開發功能
- [ ] 行程卡訂閱（Place Card Tier）
- [ ] 訂閱發票下載
- [ ] 自動續訂設定
- [ ] 方案降級流程
- [ ] 優惠碼系統

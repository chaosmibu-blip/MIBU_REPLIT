# 官網商家流程實作指令

> **日期**：2026-01-06 | **原則**：官網僅處理登入 + 訂閱購買，其他功能在 App

---

## 一、功能範圍

| 功能 | 官網 | App |
|------|:----:|:---:|
| 商家註冊 | ❌ | ✅ |
| 商家登入 | ✅ | ✅ |
| 購買/升級訂閱 | ✅ | ❌ |
| 查看訂閱等級 | ✅（唯讀） | ✅ |
| 管理店家/優惠券 | ❌ | ✅ |
| 數據報表 | ❌ | ✅ |

**官網商家區域只有 3 個頁面**：
1. `/merchant/login` - 登入頁
2. `/for-business/pricing` - 訂閱方案頁（公開）
3. `/merchant/subscription` - 我的訂閱（需登入，唯讀）

---

## 二、購買流程

```
定價頁面 /for-business/pricing
          ↓
    點擊「購買方案」
          ↓
    ┌─ 已登入？
    │    ├─ 否 → 跳轉 /merchant/login?redirect=/merchant/subscribe?plan=pro
    │    │         ↓
    │    │     Google/Apple OAuth
    │    │         ↓
    │    │     後端驗證帳號
    │    │         ├─ 帳號不存在 → 顯示「請下載 App 註冊商家帳號」+ 下載按鈕
    │    │         ├─ 帳號存在但不是商家 → 顯示「此帳號不是商家帳號」
    │    │         └─ 商家帳號 → 登入成功 → 自動跳轉回購買頁
    │    │
    │    └─ 是 → 直接進入結帳流程
    │              ↓
    │         Stripe/Recur 結帳
    │              ↓
    │         完成支付
    │              ↓
    │         跳轉 /merchant/subscription（顯示新等級）
    └─────────────────────────────────────────────
```

---

## 三、環境設定

### 1. 安裝依賴
```bash
npm install @react-oauth/google react-apple-signin-auth @tanstack/react-query
```

### 2. 環境變數 `.env.local`
```env
NEXT_PUBLIC_API_URL=https://mibu-app-mibu.replit.app
NEXT_PUBLIC_GOOGLE_CLIENT_ID=你的Google客戶端ID
NEXT_PUBLIC_APPLE_CLIENT_ID=你的Apple客戶端ID
```

---

## 四、檔案結構

```
app/
├── providers.tsx
├── for-business/
│   └── pricing/
│       └── page.tsx              # 定價頁（公開）
└── merchant/
    ├── login/
    │   └── page.tsx              # 登入頁
    ├── subscribe/
    │   └── page.tsx              # 結帳頁（需登入）
    └── subscription/
        └── page.tsx              # 我的訂閱（需登入，唯讀）

components/
├── auth/
│   ├── SocialLoginButtons.tsx
│   └── AuthGuard.tsx             # 登入保護
└── pricing/
    ├── PricingCard.tsx
    └── PricingSkeleton.tsx

hooks/
├── useAuth.ts                    # 認證狀態
└── useSubscriptionPlans.ts
```

---

## 五、核心元件

### `hooks/useAuth.ts` - 認證狀態管理
```typescript
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoggedIn: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isLoggedIn: false,
      login: (token, user) => set({ token, user, isLoggedIn: true }),
      logout: () => set({ token: null, user: null, isLoggedIn: false }),
    }),
    { name: 'merchant-auth' }
  )
);
```

### `components/auth/AuthGuard.tsx` - 登入保護
```tsx
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoggedIn) {
      // 保存當前頁面，登入後跳回
      router.push(`/merchant/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoggedIn, pathname, router]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">正在跳轉到登入頁...</div>
      </div>
    );
  }

  return <>{children}</>;
}
```

### `components/auth/SocialLoginButtons.tsx` - 社群登入按鈕
```tsx
'use client';

import { GoogleLogin } from '@react-oauth/google';
import AppleSignin from 'react-apple-signin-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function SocialLoginButtons() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 登入成功後跳轉的目標頁面
  const redirectTo = searchParams.get('redirect') || '/merchant/subscription';

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: credentialResponse.credential,
          targetPortal: 'merchant',
        }),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        // 帳號不存在或不是商家
        if (data.code === 'OAUTH_NEW_USER_TRAVELER_ONLY') {
          setError('此帳號尚未註冊為商家，請先下載 Mibu App 完成商家註冊');
        } else if (data.code === 'ROLE_MISMATCH') {
          setError('此帳號不是商家帳號，無法在此登入');
        } else {
          setError(data.error || '登入失敗');
        }
        return;
      }
      
      // 登入成功
      login(data.token, data.user);
      router.push(redirectTo);
    } catch (err) {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSuccess = async (response: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/auth/apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityToken: response.authorization.id_token,
          user: response.user?.email,
          fullName: response.user,
          targetPortal: 'merchant',
        }),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        if (data.code === 'OAUTH_NEW_USER_TRAVELER_ONLY') {
          setError('此帳號尚未註冊為商家，請先下載 Mibu App 完成商家註冊');
        } else if (data.code === 'ROLE_MISMATCH') {
          setError('此帳號不是商家帳號，無法在此登入');
        } else {
          setError(data.error || '登入失敗');
        }
        return;
      }
      
      login(data.token, data.user);
      router.push(redirectTo);
    } catch (err) {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="social-login-buttons">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" data-testid="login-error">
          <p className="text-red-600 text-sm">{error}</p>
          {error.includes('下載') && (
            <div className="mt-3 flex gap-2">
              <a
                href="https://apps.apple.com/app/mibu"
                className="text-xs bg-black text-white px-3 py-1.5 rounded"
              >
                App Store
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.mibu"
                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded"
              >
                Google Play
              </a>
            </div>
          )}
        </div>
      )}
      
      <div className="w-full" data-testid="google-login-wrapper">
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() => setError('Google 登入失敗')}
          text="signin_with"
          shape="rectangular"
          width="100%"
          locale="zh_TW"
        />
      </div>
      
      <AppleSignin
        authOptions={{
          clientId: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID!,
          scope: 'email name',
          redirectURI: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/apple/callback`,
          usePopup: true,
        }}
        onSuccess={handleAppleSuccess}
        onError={() => setError('Apple 登入失敗')}
        render={(props) => (
          <button
            {...props}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 px-4 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
            data-testid="apple-login-button"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            使用 Apple 登入
          </button>
        )}
      />
      
      {loading && (
        <div className="text-center text-gray-500 text-sm">登入中...</div>
      )}
    </div>
  );
}
```

---

## 六、頁面實作

### `/merchant/login/page.tsx` - 登入頁
```tsx
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';

export const metadata = {
  title: '商家登入 | Mibu',
  description: '登入 Mibu 商家帳號，購買或查看您的訂閱方案',
};

export default function MerchantLoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900" data-testid="login-title">
            商家登入
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            登入後可購買或查看訂閱方案
          </p>
        </div>
        
        <SocialLoginButtons />
        
        <div className="mt-8 pt-6 border-t text-center">
          <p className="text-sm text-gray-500">還沒有商家帳號？</p>
          <p className="text-sm text-gray-600 mt-1">
            請下載 <span className="font-semibold text-primary">Mibu App</span> 完成商家註冊
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <a
              href="https://apps.apple.com/app/mibu"
              className="inline-flex items-center px-4 py-2 bg-black text-white rounded-lg text-sm"
              data-testid="download-ios"
            >
              App Store
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.mibu"
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg text-sm"
              data-testid="download-android"
            >
              Google Play
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
```

### `/for-business/pricing/page.tsx` - 定價頁（公開）
```tsx
'use client';

import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { PricingCard } from '@/components/pricing/PricingCard';
import { PricingSkeleton } from '@/components/pricing/PricingSkeleton';

export default function PricingPage() {
  const { data: plans, isLoading, error, refetch } = useSubscriptionPlans();
  const { isLoggedIn } = useAuth();
  const router = useRouter();

  const handleSelectPlan = (tier: string) => {
    if (tier === 'free') {
      // 免費方案不需購買
      if (isLoggedIn) {
        router.push('/merchant/subscription');
      } else {
        router.push('/merchant/login');
      }
      return;
    }

    // 付費方案
    if (isLoggedIn) {
      // 已登入 → 直接進入結帳
      router.push(`/merchant/subscribe?plan=${tier}`);
    } else {
      // 未登入 → 先登入，登入後跳回結帳頁
      router.push(`/merchant/login?redirect=${encodeURIComponent(`/merchant/subscribe?plan=${tier}`)}`);
    }
  };

  return (
    <main className="py-16 px-4 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900" data-testid="pricing-title">
            選擇適合您的方案
          </h1>
          <p className="mt-3 text-gray-600">
            從免費開始，隨時升級解鎖更多功能
          </p>
        </div>
        
        {isLoading && <PricingSkeleton />}
        
        {error && (
          <div className="text-center py-12" data-testid="pricing-error">
            <p className="text-red-500 mb-4">載入方案時發生錯誤</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-primary text-white rounded-lg"
            >
              重試
            </button>
          </div>
        )}
        
        {plans && plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {plans.map((plan) => (
              <PricingCard
                key={plan.tier}
                plan={plan}
                onSelect={() => handleSelectPlan(plan.tier)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

### `/merchant/subscription/page.tsx` - 我的訂閱（唯讀）
```tsx
'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function SubscriptionContent() {
  const { token, user, logout } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['merchant-subscription'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/merchant`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const merchant = data?.merchant;
  const tierLabels: Record<string, string> = {
    free: '免費方案',
    pro: '專業方案',
    premium: '旗艦方案',
    partner: '合作夥伴',
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">我的訂閱</h1>
              <p className="text-gray-500 mt-1">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              登出
            </button>
          </div>

          {isLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ) : merchant ? (
            <div className="space-y-6">
              <div className="p-6 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl">
                <p className="text-sm text-gray-600">目前方案</p>
                <p className="text-2xl font-bold text-primary mt-1">
                  {tierLabels[merchant.merchantLevel] || merchant.merchantLevel}
                </p>
                {merchant.merchantLevelExpiresAt && (
                  <p className="text-sm text-gray-500 mt-2">
                    到期日：{new Date(merchant.merchantLevelExpiresAt).toLocaleDateString('zh-TW')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">可管理店家數</p>
                  <p className="text-xl font-bold">{merchant.maxPlaces || '無限制'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">可發放優惠券數</p>
                  <p className="text-xl font-bold">{merchant.maxCoupons || '無限制'}</p>
                </div>
              </div>

              {merchant.merchantLevel === 'free' && (
                <Link
                  href="/for-business/pricing"
                  className="block w-full text-center bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary-dark transition"
                >
                  升級方案
                </Link>
              )}

              <div className="pt-6 border-t text-center text-sm text-gray-500">
                <p>如需管理店家或優惠券，請使用 Mibu App</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              找不到商家資料
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SubscriptionPage() {
  return (
    <AuthGuard>
      <SubscriptionContent />
    </AuthGuard>
  );
}
```

---

## 七、API 規格

### 1. 取得訂閱方案（公開）
```
GET /api/subscription-plans
```

### 2. Google 登入
```
POST /api/auth/google
Body: { idToken, targetPortal: 'merchant' }

成功: { success: true, token, user }
失敗: { success: false, code: 'OAUTH_NEW_USER_TRAVELER_ONLY' | 'ROLE_MISMATCH', error }
```

### 3. 取得商家資料（需登入）
```
GET /api/merchant
Header: Authorization: Bearer {token}

回應: { merchant: { merchantLevel, merchantLevelExpiresAt, maxPlaces, maxCoupons, ... } }
```

---

## 八、測試清單

### 登入流程
- [ ] 未登入點擊「購買 Pro」→ 跳轉登入頁，redirect 參數正確
- [ ] 登入成功 → 自動跳回結帳頁
- [ ] 帳號不存在 → 顯示「請下載 App 註冊」+ 下載按鈕
- [ ] 帳號非商家 → 顯示「此帳號不是商家帳號」

### 訂閱頁面
- [ ] 已登入商家 → 顯示目前方案等級
- [ ] 免費方案 → 顯示「升級方案」按鈕
- [ ] 付費方案 → 顯示到期日
- [ ] 登出按鈕正常運作

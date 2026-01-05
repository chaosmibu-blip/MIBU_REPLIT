# API 串接記憶庫 (官網)

## API 基礎設定

### 環境變數
```env
NEXT_PUBLIC_API_URL=https://gacha-travel--s8869420.replit.app
```

### API Client
```typescript
// lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

export async function apiClient<T>(
  endpoint: string, 
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;
  
  let url = `${API_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }
  
  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(response.status, error.message || 'Request failed');
  }
  
  return response.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
```

---

## 商家訂閱 API

### 取得訂閱狀態
```typescript
// lib/api/subscription.ts
export async function getSubscription() {
  return apiClient<{
    currentLevel: 'free' | 'pro' | 'premium' | 'partner';
    subscription: {
      id: number;
      tier: string;
      status: string;
      currentPeriodEnd: string;
      cancelAtPeriodEnd: boolean;
    } | null;
  }>('/api/merchant/subscription');
}
```

### 建立結帳 Session
```typescript
export interface CheckoutRequest {
  type: 'merchant' | 'place';
  tier: 'pro' | 'premium';
  placeId?: number;
  provider: 'stripe' | 'recur';
  successUrl?: string;
  cancelUrl?: string;
}

export async function createCheckout(data: CheckoutRequest) {
  return apiClient<
    | { url: string; sessionId: string }
    | {
        provider: 'recur';
        productId: string;
        publishableKey: string;
        customerEmail: string;
        externalCustomerId: string;
        successUrl: string;
        cancelUrl: string;
      }
  >('/api/merchant/subscription/checkout', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
```

### 取消訂閱
```typescript
export async function cancelSubscription(subscriptionId: number) {
  return apiClient<{
    success: boolean;
    message: string;
    cancelAtPeriodEnd: boolean;
  }>('/api/merchant/subscription/cancel', {
    method: 'POST',
    body: JSON.stringify({ subscriptionId }),
  });
}
```

### 訂閱歷史
```typescript
export async function getSubscriptionHistory() {
  return apiClient<{
    subscriptions: Array<{
      id: number;
      tier: string;
      status: string;
      createdAt: string;
      cancelledAt?: string;
    }>;
  }>('/api/merchant/subscription/history');
}
```

---

## SEO 頁面 API

### 城市列表
```typescript
// lib/api/seo.ts
export async function getCities() {
  return apiClient<{
    cities: Array<{
      id: number;
      slug: string;
      name: string;
      nameEn: string;
      placeCount: number;
      coverImage: string;
    }>;
  }>('/api/seo/cities');
}
```

### 城市詳情
```typescript
export async function getCity(slug: string) {
  return apiClient<{
    city: {
      id: number;
      slug: string;
      name: string;
      description: string;
      coverImage: string;
      latitude: number;
      longitude: number;
    };
    places: Array<{
      id: number;
      slug: string;
      name: string;
      category: string;
      rating: number;
      coverImage: string;
    }>;
  }>(`/api/seo/cities/${slug}`);
}
```

### 景點詳情
```typescript
export async function getPlace(slug: string) {
  return apiClient<{
    place: {
      id: number;
      slug: string;
      name: string;
      description: string;
      category: string;
      address: string;
      latitude: number;
      longitude: number;
      rating: number;
      reviewCount: number;
      images: string[];
      openingHours?: string;
      website?: string;
      phone?: string;
    };
    relatedPlaces: Array<{
      id: number;
      slug: string;
      name: string;
      coverImage: string;
    }>;
  }>(`/api/seo/places/${slug}`);
}
```

---

## 認證 API

### 商家登入
```typescript
// lib/api/auth.ts
export async function merchantLogin(data: {
  email: string;
  password: string;
}) {
  return apiClient<{
    token: string;
    merchant: {
      id: number;
      name: string;
      email: string;
      level: string;
    };
  }>('/api/merchant/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
```

### 驗證 Session
```typescript
export async function verifySession() {
  return apiClient<{
    authenticated: boolean;
    merchant?: {
      id: number;
      name: string;
      email: string;
      level: string;
    };
  }>('/api/merchant/verify');
}
```

---

## React Query Hooks

### 訂閱狀態 Hook
```typescript
// hooks/useSubscription.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/subscription';

export function useSubscription() {
  return useQuery({
    queryKey: ['merchant-subscription'],
    queryFn: api.getSubscription,
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.cancelSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries(['merchant-subscription']);
    },
  });
}
```

### SEO 資料 Hook
```typescript
// hooks/useSeo.ts
export function useCity(slug: string) {
  return useQuery({
    queryKey: ['city', slug],
    queryFn: () => api.getCity(slug),
  });
}

export function usePlace(slug: string) {
  return useQuery({
    queryKey: ['place', slug],
    queryFn: () => api.getPlace(slug),
  });
}
```

---

## 錯誤處理

### 全域錯誤處理
```tsx
// components/ErrorBoundary.tsx
export function ErrorBoundary({ error, reset }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">發生錯誤</h1>
        <p className="text-gray-600 mt-2">{error.message}</p>
        <button 
          onClick={reset}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-lg"
        >
          重試
        </button>
      </div>
    </div>
  );
}
```

### API 錯誤碼對應
| 狀態碼 | 說明 | 處理方式 |
|--------|------|---------|
| 400 | 參數錯誤 | 顯示具體錯誤訊息 |
| 401 | 未授權 | 導向登入頁 |
| 403 | 權限不足 | 顯示「權限不足」 |
| 404 | 資源不存在 | 顯示 404 頁面 |
| 500 | 伺服器錯誤 | 顯示「系統繁忙」 |

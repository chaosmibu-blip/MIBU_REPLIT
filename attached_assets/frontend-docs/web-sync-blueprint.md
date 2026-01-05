# 官方網站與後端同步藍圖

## 概述

本文件定義官方網站（Next.js）與後端（Replit Node.js）的完整同步機制，確保前後端能正確連接並保持一致。

---

## 後端 API 基礎資訊

### 環境配置

| 環境 | API Base URL |
|------|-------------|
| 開發 | `https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev` |
| 生產 | `https://gacha-travel--s8869420.replit.app` |

### Next.js 環境變數設定
```env
# .env.local (開發)
NEXT_PUBLIC_API_URL=https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev

# .env.production (生產)
NEXT_PUBLIC_API_URL=https://gacha-travel--s8869420.replit.app
```

---

## API Client 設定

### 基礎封裝
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
    credentials: 'include',  // 重要：攜帶 Cookie
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

## 跨域 (CORS) 設定

### 後端已配置的 CORS
後端在 `server/index.ts` 已配置允許官網域名：

```typescript
// 後端 CORS 設定（已完成）
app.use(cors({
  origin: [
    'https://mibu.tw',
    'https://www.mibu.tw',
    'http://localhost:3000',  // Next.js 開發
  ],
  credentials: true,  // 允許 Cookie
}));
```

### 前端需確保
- 所有 API 請求加上 `credentials: 'include'`
- 不要手動設置 `Authorization` header（使用 Cookie）

---

## 認證機制

### Cookie-based JWT

| 項目 | 值 |
|------|-----|
| Cookie 名稱 | `auth_token` |
| 類型 | HttpOnly, Secure |
| 有效期 | 7 天 |
| SameSite | Lax |

### 認證流程
```
1. POST /api/merchant/login → 後端設定 Cookie
2. 後續請求自動帶 Cookie → 後端驗證 JWT
3. GET /api/merchant/verify → 檢查登入狀態
4. POST /api/merchant/logout → 清除 Cookie
```

---

## 核心 API 端點清單

### 認證相關

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/merchant/login` | 商家登入 |
| POST | `/api/merchant/logout` | 商家登出 |
| GET | `/api/merchant/verify` | 驗證登入狀態 |

### 商家訂閱

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/merchant/subscription` | 取得當前訂閱狀態 |
| POST | `/api/merchant/subscription/checkout` | 建立結帳 Session |
| POST | `/api/merchant/subscription/cancel` | 取消訂閱 |
| GET | `/api/merchant/subscription/history` | 訂閱歷史 |

### SEO 頁面資料

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/seo/cities` | 城市列表 |
| GET | `/api/seo/cities/:slug` | 城市詳情 + 景點 |
| GET | `/api/seo/places/:slug` | 景點詳情 |

---

## 商家訂閱結帳流程

### 1. 前端呼叫結帳 API
```typescript
// hooks/useCheckout.ts
export function useCheckout() {
  const checkout = async (
    tier: 'pro' | 'premium', 
    provider: 'stripe' | 'recur'
  ) => {
    const res = await apiClient<CheckoutResponse>(
      '/api/merchant/subscription/checkout',
      {
        method: 'POST',
        body: JSON.stringify({ 
          type: 'merchant', 
          tier, 
          provider 
        }),
      }
    );

    if (provider === 'stripe') {
      // Stripe: 直接跳轉
      window.location.href = res.url;
    } else {
      // Recur: 使用 SDK
      const recur = (window as any).RecurCheckout.init({ 
        publishableKey: res.publishableKey 
      });
      await recur.redirectToCheckout({
        productId: res.productId,
        externalCustomerId: res.externalCustomerId,
        successUrl: res.successUrl,
        cancelUrl: res.cancelUrl,
      });
    }
  };

  return { checkout };
}
```

### 2. 後端回應格式

**Stripe 回應**
```json
{
  "url": "https://checkout.stripe.com/pay/cs_xxx",
  "sessionId": "cs_xxx"
}
```

**Recur 回應**
```json
{
  "provider": "recur",
  "productId": "fpbnn9ah9090j7hxx5wcv7f4",
  "publishableKey": "pk_test_xxx",
  "customerEmail": "merchant@example.com",
  "externalCustomerId": "mibu_m123_merchant_pro",
  "successUrl": "https://mibu.tw/merchant/subscription/success?provider=recur&tier=pro",
  "cancelUrl": "https://mibu.tw/merchant/subscription/cancel"
}
```

### 3. 成功/取消頁面
```
/merchant/subscription/success?provider=stripe&tier=pro
/merchant/subscription/success?provider=recur&tier=pro
/merchant/subscription/cancel
```

---

## Recur SDK 整合

### 載入 SDK
```html
<!-- app/layout.tsx 或 _document.tsx -->
<Script 
  src="https://unpkg.com/recur-tw@0.11.0/dist/recur.umd.js"
  strategy="beforeInteractive"
/>
```

### Recur 產品 ID 對照

| 產品 | Product ID | 價格 |
|------|-----------|------|
| 招財貓計畫/月 (Pro) | `fpbnn9ah9090j7hxx5wcv7f4` | NT$123/月 |
| 招財貓計畫/年 (Premium) | `adkwbl9dya0wc6b53parl9yk` | NT$6,000/年 |

### externalCustomerId 格式
```
mibu_m{merchantId}_{type}_{tier}

範例：
- mibu_m123_merchant_pro
- mibu_m456_merchant_premium
- mibu_m789_place_pro_p1001  (行程卡訂閱，含 placeId)
```

---

## Socket.io 即時通訊

### 連接設定
```typescript
// lib/socket.ts
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}
```

### 訂閱更新事件
```typescript
// 監聽訂閱狀態更新
socket.on('subscription:updated', (data) => {
  // data: { merchantId, tier, status, type, placeId?, expiresAt? }
  
  // 更新本地狀態
  queryClient.invalidateQueries(['merchant-subscription']);
  
  // 顯示通知
  if (data.status === 'active') {
    toast.success(`訂閱已升級至 ${data.tier.toUpperCase()}`);
  }
});

// 商家房間（自動加入）
socket.emit('join:merchant', { merchantId });
```

---

## 錯誤處理規範

### API 錯誤碼

| 狀態碼 | 說明 | 前端處理 |
|--------|------|---------|
| 400 | 參數錯誤 | 顯示 `error.message` |
| 401 | 未登入/Token 過期 | 導向 `/merchant/login` |
| 403 | 權限不足 | 顯示「權限不足」 |
| 404 | 資源不存在 | 顯示 404 頁面 |
| 409 | 衝突（如已有訂閱） | 顯示具體提示 |
| 500 | 伺服器錯誤 | 顯示「系統繁忙，請稍後再試」 |

### 全域錯誤處理
```typescript
// lib/api/client.ts
export async function apiClient<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  // ...
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    
    // 401 自動導向登入
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/merchant/login';
    }
    
    throw new ApiError(response.status, error.message || 'Request failed');
  }
  
  return response.json();
}
```

---

## TypeScript 類型定義

### 統一使用的類型
```typescript
// types/subscription.ts
export type SubscriptionTier = 'free' | 'pro' | 'premium' | 'partner';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing';
export type PaymentProvider = 'stripe' | 'recur';
export type SubscriptionType = 'merchant' | 'place';

export interface MerchantSubscription {
  id: number;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface CheckoutRequest {
  type: SubscriptionType;
  tier: 'pro' | 'premium';
  placeId?: number;
  provider: PaymentProvider;
  successUrl?: string;
  cancelUrl?: string;
}

// types/merchant.ts
export interface Merchant {
  id: number;
  name: string;
  email: string;
  level: SubscriptionTier;
  avatarUrl?: string;
}
```

---

## SSR/API Route 注意事項

### Server Component 呼叫 API
```typescript
// app/city/[slug]/page.tsx
async function getCityData(slug: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/seo/cities/${slug}`,
    { next: { revalidate: 3600 } }  // ISR: 每小時更新
  );
  
  if (!res.ok) return null;
  return res.json();
}

export default async function CityPage({ params }) {
  const data = await getCityData(params.slug);
  if (!data) notFound();
  
  return <CityContent data={data} />;
}
```

### API Route Proxy（可選）
如需隱藏後端 URL，可在 Next.js 中建立 API Route：

```typescript
// app/api/merchant/subscription/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const res = await fetch(
    `${process.env.API_URL}/api/merchant/subscription`,
    {
      headers: {
        Cookie: request.headers.get('cookie') || '',
      },
    }
  );
  
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

---

## 同步檢查清單

### 部署前確認

- [ ] `NEXT_PUBLIC_API_URL` 環境變數已設定
- [ ] CORS 允許官網域名
- [ ] Cookie SameSite 設定正確
- [ ] Recur SDK 已載入
- [ ] Socket.io 連接正常
- [ ] 錯誤處理覆蓋所有 API
- [ ] TypeScript 類型與後端一致

### 測試流程

1. **認證流程**
   - 登入 → 驗證 Cookie 設定
   - 重新整理 → 驗證保持登入
   - 登出 → 驗證 Cookie 清除

2. **訂閱流程**
   - 選擇方案 → 選擇支付方式 → 完成付款
   - 驗證 Webhook 觸發 → Socket 推送
   - 訂閱狀態即時更新

3. **SEO 頁面**
   - 城市/景點頁面正確渲染
   - Meta tags 正確設定
   - 結構化資料驗證

---

## 常見問題排查

### CORS 錯誤
```
Access to fetch has been blocked by CORS policy
```
**解法**：確認後端 CORS origin 包含前端域名，且 `credentials: true`

### Cookie 無法設定
```
Set-Cookie header ignored
```
**解法**：
1. 確認 `SameSite=None; Secure` 用於跨域
2. 或使用同子域名（api.mibu.tw ↔ mibu.tw）

### Socket 連接失敗
```
WebSocket connection failed
```
**解法**：
1. 確認後端支援 WebSocket
2. 加上 `transports: ['websocket', 'polling']` fallback

---

## 版本同步

| 項目 | 版本 | 更新日期 |
|------|------|---------|
| 後端 API | v1.0 | 2026-01-05 |
| 本同步藍圖 | v1.0 | 2026-01-05 |
| Recur SDK | 0.11.0 | - |
| Socket.io | 4.x | - |

---

## 聯絡窗口

後端 API 問題請聯繫：**後端首席架構師（Replit 專案）**

更新 API 時，後端會發送「🌐 給官網的同步指令」，包含：
- Endpoint 變更
- TypeScript Interface
- cURL 範例
- UI 實作建議

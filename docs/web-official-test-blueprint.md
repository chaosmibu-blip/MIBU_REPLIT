# 官網測試修復藍圖 v1.0

> **日期**：2026-01-06 | **狀態**：後端已完成，待官網前端配合

---

## 摘要

| 問題 | 後端狀態 | 前端狀態 |
|------|---------|---------|
| 1. 城市/景點頁面缺失 | ✅ SEO API 已建立 | ⏳ 待實作 |
| 2. 訂閱方案導航錯誤 | - | ⏳ 待修正連結 |
| 3. 訂閱方案未顯示 | ✅ API 正常運作 | ⏳ 改用 API |
| 4. Google/Apple 登入 | ✅ 已支援商家 | ⏳ 待實作 |
| 5. 行程 SEO 頁面 | ✅ **新增** App 行程 API | ⏳ 待實作 |

### 後端測試結果 (2026-01-06)

```bash
# 城市 API ✅
GET /api/seo/cities → 22 城市
GET /api/seo/cities/台北市 → 2504 景點

# 景點 API ✅ 
# 方法 1: 使用 ID（推薦，最可靠）
GET /api/seo/places/by-id/3406 → 西門町詳情（推薦）

# 方法 2: 使用 slug（⚠️ 舊版，不推薦）
# GET /api/seo/places/西門町?city=台北市
# 限制：每城市最多搜尋 500 筆，高流量城市可能 404

# 訂閱方案 API ✅
GET /api/subscription-plans → 3 個方案（公開存取）

# 行程 API ✅（新增 2026-01-06）
GET /api/seo/trips → App 生成的已發布行程列表
GET /api/seo/trips/:id → 行程詳情（含景點列表）
```

**建議**：官網前端優先使用 `/api/seo/places/by-id/:id` 端點，可避免中文 slug 編碼問題。

### ⚠️ 已知限制與解決方案

| 端點 | 限制 | 狀態 | 解決方案 |
|------|------|------|---------|
| `/api/seo/cities/:slug` | 特殊標點城市名可能無法匹配 | 台灣城市正常 | 未來擴展需修復 |
| `/api/seo/places/:slug` | 每城市最多搜尋 500 筆 | **不推薦使用** | 改用 by-id 端點 |
| `/api/seo/places/by-id/:id` | 無 | ✅ **推薦使用** | 100% 可靠 |

### 前端實作契約

| 功能 | 使用端點 | 備註 |
|------|---------|------|
| 城市列表 | `GET /api/seo/cities` | 支援 country 篩選 |
| 城市詳情 | `GET /api/seo/cities/:slug?page=1&limit=50` | **必須處理分頁** |
| 景點詳情 | `GET /api/seo/places/by-id/:id` | **推薦** |
| 景點列表 | `GET /api/seo/places?city=xxx` | 搜尋/篩選用 |
| 行程列表 | `GET /api/seo/trips?city=xxx` | 支援 city/district 篩選 |
| 行程詳情 | `GET /api/seo/trips/:id` | 含完整景點陣列 |

**關鍵原則**：
1. 景點詳情頁 → **必須使用 `/api/seo/places/by-id/:id`**
2. URL slug 僅用於友善顯示，不可作為資料來源
3. SSG 生成時需遍歷分頁獲取所有景點 ID

---

## 問題 1：城市及景點頁面

### 後端完成項目 ✅

**新增 SEO API**：`server/routes/seo.ts`

| 端點 | 說明 | 狀態 |
|------|------|------|
| `GET /api/seo/cities` | 城市列表 | ✅ 22 城市 |
| `GET /api/seo/cities/:slug` | 城市詳情 + 景點（分頁） | ✅ |
| `GET /api/seo/places/by-id/:id` | 景點詳情（推薦） | ✅ **主要端點** |
| `GET /api/seo/places` | 景點列表 (搜尋/篩選) | ✅ 35,044 景點 |
| `GET /api/seo/places/:slug` | 景點詳情（舊版） | ⚠️ 有限制 |
| `GET /api/seo/trips` | 行程列表（App 生成） | ✅ **新增** |
| `GET /api/seo/trips/:id` | 行程詳情 | ✅ **新增** |

### 官網前端待辦

#### 1. 建立頁面

| 頁面 | 路由 | 呼叫 API | 備註 |
|------|------|---------|------|
| 城市列表 | `/explore` | `GET /api/seo/cities` | |
| 城市詳情 | `/city/[slug]` | `GET /api/seo/cities/:slug?page=N&limit=50` | 必須分頁 |
| 景點詳情 | `/place/[id]` | `GET /api/seo/places/by-id/:id` | **使用 ID 路由** |
| 行程列表 | `/trips` | `GET /api/seo/trips` | **新增** App 生成行程 |
| 行程詳情 | `/trip/[id]` | `GET /api/seo/trips/:id` | **新增** |

#### 2. API 回應格式

**城市列表**
```typescript
interface CitiesResponse {
  cities: Array<{
    name: string;
    slug: string;
    country: string;
    placeCount: number;
    imageUrl: string | null;
  }>;
  total: number;
  message?: string; // 無資料時顯示
}
```

**城市詳情**
```typescript
interface CityDetailResponse {
  city: {
    name: string;
    slug: string;
    country: string;
    placeCount: number;
  };
  places: Array<{
    id: number;
    name: string;
    slug: string;
    district: string;
    category: string;
    rating: number | null;
    imageUrl: string | null;
    description: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  message?: string;
}
```

**景點詳情**
```typescript
interface PlaceDetailResponse {
  place: {
    id: number;
    name: string;
    nameI18n: object | null;
    slug: string;
    country: string;
    city: string;
    district: string;
    address: string | null;
    category: string;
    subcategory: string | null;
    description: string | null;
    rating: number | null;
    imageUrl: string | null;
    openingHours: object | null;
    location: { lat: number; lng: number } | null;
    googlePlaceId: string | null;
    googleMapUrl: string | null;
  };
  relatedPlaces: Array<{
    id: number;
    name: string;
    slug: string;
    district: string;
    category: string;
    rating: number | null;
    imageUrl: string | null;
  }>;
}
```

**行程列表**（新增 2026-01-06）
```typescript
interface TripsListResponse {
  trips: Array<{
    id: number;
    sessionId: string;
    title: string;           // 例：「台北市・萬華區 一日遊」
    city: string;
    district: string | null;
    description: string | null;  // AI 生成的行程簡介
    imageUrl: string | null;     // App 截圖
    placeCount: number;
    categoryDistribution: object | null;
    publishedAt: string;
  }>;
  pagination: { page, limit, total, totalPages, hasNext, hasPrev };
  message?: string;
}
```

**行程詳情**
```typescript
interface TripDetailResponse {
  trip: {
    id: number;
    sessionId: string;
    title: string;
    city: string;
    district: string | null;
    description: string | null;
    imageUrl: string | null;
    placeCount: number;
    categoryDistribution: object | null;
    publishedAt: string;
  };
  places: Array<{
    id: number;
    name: string;
    slug: string;
    district: string;
    category: string;
    subcategory: string | null;
    address: string | null;
    description: string | null;
    rating: number | null;
    imageUrl: string | null;
    location: { lat: number; lng: number } | null;
  }>;
}
```

#### 行程頁面欄位對應

| JSON 欄位 | 顯示位置 | 空值處理 |
|----------|---------|---------|
| `trip.title` | 頁面標題 `<h1>` | 必有值 |
| `trip.description` | 行程簡介區塊 | 空值顯示「探索這趟精彩旅程」 |
| `trip.imageUrl` | 主視覺圖（Hero） | 空值顯示預設行程圖 |
| `trip.city` | 麵包屑導航 | 必有值 |
| `trip.district` | 副標題 | 空值不顯示 |
| `places[].name` | 景點卡片標題 | 必有值 |
| `places[].imageUrl` | 景點卡片圖片 | 空值顯示預設景點圖 |
| `places[].category` | 景點類型標籤 | 必有值 |

#### 3. 景點頁面實作（推薦方式）

```tsx
// /place/[id]/page.tsx - 使用 ID 路由（推薦）

// 輔助函數：獲取城市所有景點（處理分頁）
async function getAllPlacesForCity(citySlug: string): Promise<{ id: number }[]> {
  const allPlaces: { id: number }[] = [];
  let page = 1;
  let hasNext = true;
  
  while (hasNext) {
    const res = await fetch(
      `${API_URL}/api/seo/cities/${citySlug}?page=${page}&limit=50`
    );
    const data = await res.json();
    allPlaces.push(...data.places.map((p: any) => ({ id: p.id })));
    hasNext = data.pagination.hasNext;
    page++;
  }
  return allPlaces;
}

export async function generateStaticParams() {
  const citiesRes = await fetch(`${API_URL}/api/seo/cities`);
  const { cities } = await citiesRes.json();
  const params: { id: string }[] = [];
  
  for (const city of cities) {
    const places = await getAllPlacesForCity(city.slug);
    places.forEach((place) => {
      params.push({ id: String(place.id) });
    });
  }
  return params;
}

export default async function PlacePage({ params }: { params: { id: string } }) {
  const res = await fetch(`${API_URL}/api/seo/places/by-id/${params.id}`);
  const { place, relatedPlaces } = await res.json();
  
  return <PlaceDetail place={place} related={relatedPlaces} />;
}
```

**URL 友善化**：使用 Next.js 的 rewrites 將 `/place/西門町-3406` 重寫為 `/place/3406`（slug 僅用於 SEO 顯示）

#### 4. 空狀態處理

```tsx
{cities.length === 0 && (
  <EmptyState 
    title="目前還沒有城市資料"
    description="我們正在努力收集更多旅遊資訊，敬請期待"
    action={<DownloadButton />}
  />
)}
```

#### 5. 頁面底部 CTA

每個 SEO 頁面底部需加入下載 App 引導：

```tsx
<section className="py-16 bg-gradient-to-r from-primary to-primary-dark">
  <h2>在 Mibu App 探索更多精彩行程</h2>
  <DownloadButton />
</section>
```

---

## 問題 2：訂閱方案導航錯誤

### 官網前端待辦

修正所有「查看訂閱方案」連結，統一指向 `/for-business/pricing`

#### 檢查清單

- [ ] `Header.tsx` / `Navigation.tsx` - 導航選單
- [ ] `/(home)/page.tsx` - 首頁商家區塊 CTA
- [ ] `/for-business/page.tsx` - 商家合作頁 CTA
- [ ] `/merchant/dashboard` - 升級按鈕
- [ ] 其他含有「訂閱方案」連結的頁面

#### 統一連結

```tsx
// Before
<Link href="/merchant/pricing">查看訂閱方案</Link>
<Link href="/pricing">訂閱方案</Link>

// After
<Link href="/for-business/pricing">查看訂閱方案</Link>
```

---

## 問題 3：訂閱方案未顯示

### 後端確認 ✅

API 端點：`GET /api/subscription-plans`
- 狀態：**公開存取（無需認證）**
- 回傳格式：`{ plans: SubscriptionPlan[] }`

測試成功（3 個方案）：
```bash
curl https://[開發環境URL]/api/subscription-plans
# 回傳：{"plans":[{"tier":"free"...},{"tier":"pro"...},{"tier":"premium"...}]}
```

### 官網前端待辦

#### 1. 建立 Hook

```typescript
// hooks/useSubscriptionPlans.ts
import { useQuery } from '@tanstack/react-query';

export interface SubscriptionPlan {
  tier: string;
  name: string;
  nameEn: string;
  priceMonthly: number;
  priceYearly: number | null;
  pricePeriodLabel: string;
  features: string[];
  buttonText: string;
  highlighted: boolean;
  highlightLabel: string | null;
  maxPlaces: number;
  maxCoupons: number;
  hasAdvancedAnalytics: boolean;
  hasPriorityExposure: boolean;
  hasDedicatedSupport: boolean;
}

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/subscription-plans`);
      if (!res.ok) throw new Error('Failed to fetch plans');
      const data = await res.json();
      return data.plans as SubscriptionPlan[];
    },
    staleTime: 5 * 60 * 1000, // 5 分鐘快取
  });
}
```

#### 2. 修改定價頁面

```tsx
// /for-business/pricing/page.tsx
'use client';

import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';

export default function PricingPage() {
  const { data: plans, isLoading, error } = useSubscriptionPlans();
  
  if (isLoading) return <PricingSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!plans?.length) return <EmptyState message="方案準備中" />;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {plans.map(plan => (
        <PricingCard key={plan.tier} plan={plan} />
      ))}
    </div>
  );
}
```

#### 3. 移除靜態資料

刪除所有硬編碼的方案資料，改用 API 動態載入。

---

## 問題 4：商家 Google/Apple 登入

### 後端完成項目 ✅

**修改邏輯**：`server/routes/auth.ts`

| 情境 | 行為 |
|------|------|
| 新用戶 + traveler | ✅ 允許 OAuth 註冊 |
| 新用戶 + merchant/specialist | ❌ 需用 Email 先註冊 |
| 已存在商家 + merchant 入口 | ✅ 允許 OAuth 登入 |
| 商家帳號 + traveler 入口 | ❌ ROLE_MISMATCH |

**API 請求格式**：
```typescript
// POST /api/auth/google 或 /api/auth/apple
{
  idToken: string;           // OAuth ID Token
  targetPortal: 'merchant';  // 指定商家入口
  user?: { ... };            // Google 專用
}
```

**回應格式**：
```typescript
// 成功
{
  success: true,
  token: string,  // JWT Token
  user: {
    id: string,
    email: string,
    name: string,
    role: 'merchant',
    isApproved: boolean,
    isSuperAdmin: boolean,
  }
}

// 錯誤 - 非商家帳號
{
  success: false,
  error: '您的帳號角色為 traveler，無法從 merchant 入口登入',
  code: 'ROLE_MISMATCH',
  currentRole: 'traveler',
  targetPortal: 'merchant',
}

// 錯誤 - 新用戶
{
  success: false,
  error: '請下載 Mibu App 註冊商家帳號，註冊後即可使用 Google 登入',
  code: 'OAUTH_NEW_USER_TRAVELER_ONLY',
}
```

### 官網前端待辦

#### 1. 安裝依賴

```bash
npm install @react-oauth/google react-apple-signin-auth
```

#### 2. 設定 Google OAuth Provider

```tsx
// app/providers.tsx
import { GoogleOAuthProvider } from '@react-oauth/google';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
      {children}
    </GoogleOAuthProvider>
  );
}
```

#### 3. 建立登入按鈕

```tsx
// components/auth/SocialLoginButtons.tsx
'use client';

import { GoogleLogin } from '@react-oauth/google';
import AppleSignin from 'react-apple-signin-auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SocialLoginButtons() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          idToken: credentialResponse.credential,
          targetPortal: 'merchant',
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (data.code === 'ROLE_MISMATCH') {
          setError('此帳號不是商家帳號');
        } else if (data.code === 'OAUTH_NEW_USER_TRAVELER_ONLY') {
          setError('請下載 App 註冊商家帳號');
        } else {
          setError(data.error || '登入失敗');
        }
        return;
      }
      
      router.push('/merchant/dashboard');
    } catch (err) {
      setError('登入失敗，請稍後再試');
    }
  };

  const handleAppleSuccess = async (response: any) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          identityToken: response.authorization.id_token,
          user: response.user?.email,
          fullName: response.user,
          targetPortal: 'merchant',
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (data.code === 'ROLE_MISMATCH') {
          setError('此帳號不是商家帳號');
        } else {
          setError(data.error || '登入失敗');
        }
        return;
      }
      
      router.push('/merchant/dashboard');
    } catch (err) {
      setError('登入失敗，請稍後再試');
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-red-500 text-sm text-center">{error}</div>
      )}
      
      <GoogleLogin
        onSuccess={handleGoogleSuccess}
        onError={() => setError('Google 登入失敗')}
        text="signin_with"
        shape="rectangular"
        width="100%"
      />
      
      <AppleSignin
        authOptions={{
          clientId: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID!,
          scope: 'email name',
          redirectURI: `${window.location.origin}/api/auth/apple/callback`,
          usePopup: true,
        }}
        onSuccess={handleAppleSuccess}
        onError={() => setError('Apple 登入失敗')}
        render={(props) => (
          <button
            {...props}
            className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg"
          >
            <AppleIcon />
            使用 Apple 登入
          </button>
        )}
      />
    </div>
  );
}
```

#### 4. 更新登入頁面

```tsx
// /merchant/login/page.tsx
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';
import { EmailLoginForm } from '@/components/auth/EmailLoginForm';
import { DownloadButton } from '@/components/DownloadButton';

export default function MerchantLoginPage() {
  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold text-center mb-8">商家登入</h1>
      
      <SocialLoginButtons />
      
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-2 text-gray-500">或使用 Email</span>
        </div>
      </div>
      
      <EmailLoginForm />
      
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>還沒有商家帳號？</p>
        <p className="mt-1">請下載 App 完成註冊</p>
        <div className="mt-4">
          <DownloadButton size="sm" />
        </div>
      </div>
    </div>
  );
}
```

#### 5. 環境變數

```env
NEXT_PUBLIC_API_URL=https://[後端開發環境URL]
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx
NEXT_PUBLIC_APPLE_CLIENT_ID=xxx
```

---

## 測試檢查清單

### 後端測試 ✅

```bash
# 訂閱方案 API
curl https://[DEV_URL]/api/subscription-plans
# 預期：回傳 3 個方案

# SEO 城市 API
curl https://[DEV_URL]/api/seo/cities
# 預期：回傳 22 個城市

# SEO 景點 API
curl https://[DEV_URL]/api/seo/places?limit=5
# 預期：回傳 5 個景點 + 分頁資訊
```

### 官網前端測試（待完成）

- [ ] `/explore` 頁面顯示城市列表
- [ ] `/city/台北市` 頁面顯示城市景點（需處理分頁）
- [ ] `/place/3406` 頁面顯示西門町詳情（使用 ID 路由）
- [ ] `/for-business/pricing` 頁面顯示 3 個訂閱方案
- [ ] 所有「訂閱方案」連結指向正確頁面
- [ ] Google 登入：已註冊商家可登入
- [ ] Apple 登入：已註冊商家可登入
- [ ] 錯誤處理：非商家帳號顯示提示訊息

---

## 問題 5：行程 SEO 頁面（新增 2026-01-06）

### 自動發布機制

扭蛋完成後，後端自動執行以下邏輯（App 無需額外操作）：

1. **去重檢查**：比對 `orderedPlaceIds`，若與已發布行程完全相同則不發布
2. **自動標記**：通過去重則設定 `isPublished = true`、`publishedAt = now()`
3. **標題生成**：格式為 `{城市}{區域} 一日遊 #N`（N 為該區域的序號）

**發布條件**：
- 景點數量 ≥ 3
- 非重複行程（景點組合不同即視為不同行程）
- 僅限登入用戶（guest 不發布）

### 官網 SEO 頁面

| 頁面 | 路由 | API | 說明 |
|------|------|-----|------|
| 行程列表 | `/trips` | `GET /api/seo/trips` | 所有已發布行程 |
| 城市行程 | `/city/[slug]/trips` | `GET /api/seo/trips?city=xxx` | 特定城市的行程 |
| 行程詳情 | `/trip/[id]` | `GET /api/seo/trips/:id` | 單一行程詳情 |

---

## 部署後驗證

1. 確認環境變數已設定
2. 確認 OAuth Client ID 正確
3. 確認 API URL 指向正確環境
4. 測試完整登入流程
5. 測試 SEO 頁面 SSR/ISR 正常
6. 測試行程 API 正常運作

---

## 📱 官網前端 API 完整規格

> 每個 API 包含：Endpoint、TypeScript Interface、cURL 範例

### 1. 城市列表

**Endpoint**
```
GET /api/seo/cities
Query: ?country=台灣 (選填)
```

**TypeScript Interface**
```typescript
interface CitiesResponse {
  cities: Array<{
    name: string;
    slug: string;
    country: string;
    placeCount: number;
    imageUrl: string | null;
  }>;
  total: number;
  message?: string;
}
```

**cURL 範例**
```bash
curl "https://[API_URL]/api/seo/cities"
curl "https://[API_URL]/api/seo/cities?country=台灣"
```

---

### 2. 城市詳情（含景點分頁）

**Endpoint**
```
GET /api/seo/cities/:slug
Query: ?page=1&limit=50 (選填，預設 page=1, limit=20)
```

---

### 2.1 城市行政區列表（程式化 SEO）

**Endpoint**
```
GET /api/seo/cities/:slug/districts
```

**TypeScript Interface**
```typescript
interface CityDistrictsResponse {
  city: {
    name: string;
    slug: string;
    country: string;
  };
  districts: Array<{
    name: string;
    slug: string;
    placeCount: number;
    imageUrl: string | null;
  }>;
  total: number;
  message?: string;
}
```

**cURL 範例**
```bash
curl "https://[API_URL]/api/seo/cities/台北市/districts"
```

---

### 2.2 行政區詳情（程式化 SEO）

**Endpoint**
```
GET /api/seo/districts/:citySlug/:districtSlug
Query: ?page=1&limit=20 (選填)
```

**TypeScript Interface**
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
  places: Array<{
    id: number;
    name: string;
    slug: string;
    category: string;
    subcategory: string | null;
    rating: number | null;
    imageUrl: string | null;
    description: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  message?: string;
}
```

**cURL 範例**
```bash
curl "https://[API_URL]/api/seo/districts/台北市/萬華區"
curl "https://[API_URL]/api/seo/districts/台北市/大安區?page=2&limit=50"
```

**TypeScript Interface**
```typescript
interface CityDetailResponse {
  city: {
    name: string;
    slug: string;
    country: string;
    placeCount: number;
  };
  places: Array<{
    id: number;
    name: string;
    slug: string;
    district: string;
    category: string;
    rating: number | null;
    imageUrl: string | null;
    description: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  message?: string;
}
```

**cURL 範例**
```bash
curl "https://[API_URL]/api/seo/cities/台北市"
curl "https://[API_URL]/api/seo/cities/台北市?page=2&limit=50"
```

---

### 3. 景點詳情（推薦使用）

**Endpoint**
```
GET /api/seo/places/by-id/:id
```

**TypeScript Interface**
```typescript
interface PlaceDetailResponse {
  place: {
    id: number;
    name: string;
    nameI18n: object | null;
    slug: string;
    country: string;
    city: string;
    district: string;
    address: string | null;
    category: string;
    subcategory: string | null;
    description: string | null;
    rating: number | null;
    imageUrl: string | null;
    openingHours: object | null;
    location: { lat: number; lng: number } | null;
    googlePlaceId: string | null;
    googleMapUrl: string | null;
  };
  relatedPlaces: Array<{
    id: number;
    name: string;
    slug: string;
    district: string;
    category: string;
    rating: number | null;
    imageUrl: string | null;
  }>;
}
```

**cURL 範例**
```bash
curl "https://[API_URL]/api/seo/places/by-id/3406"
```

---

### 4. 景點列表（搜尋/篩選）

**Endpoint**
```
GET /api/seo/places
Query: ?city=台北市&category=美食&q=咖啡&page=1&limit=20 (皆選填)
```

**TypeScript Interface**
```typescript
interface PlacesListResponse {
  places: Array<{
    id: number;
    name: string;
    slug: string;
    city: string;
    district: string;
    category: string;
    subcategory: string | null;
    rating: number | null;
    imageUrl: string | null;
    description: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  message?: string;
}
```

**cURL 範例**
```bash
curl "https://[API_URL]/api/seo/places?city=台北市&limit=10"
curl "https://[API_URL]/api/seo/places?category=美食&q=咖啡"
```

---

### 5. 行程列表

**Endpoint**
```
GET /api/seo/trips
Query: ?city=台北市&district=萬華區&page=1&limit=20 (皆選填)
```

**TypeScript Interface**
```typescript
interface TripsListResponse {
  trips: Array<{
    id: number;
    sessionId: string;
    title: string;              // 格式: "台北市萬華區 一日遊 #1"
    city: string;
    district: string | null;
    description: string | null; // AI 生成的行程簡介
    imageUrl: string | null;
    placeCount: number;         // 最多 5
    categoryDistribution: object | null;
    publishedAt: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  message?: string;
}
```

**cURL 範例**
```bash
curl "https://[API_URL]/api/seo/trips"
curl "https://[API_URL]/api/seo/trips?city=台北市"
curl "https://[API_URL]/api/seo/trips?city=台北市&district=萬華區"
```

---

### 6. 行程詳情

**Endpoint**
```
GET /api/seo/trips/:id
```

**TypeScript Interface**
```typescript
interface TripDetailResponse {
  trip: {
    id: number;
    sessionId: string;
    title: string;
    city: string;
    district: string | null;
    description: string | null;
    imageUrl: string | null;
    placeCount: number;
    categoryDistribution: object | null;
    publishedAt: string;
  };
  places: Array<{
    id: number;
    name: string;
    slug: string;
    district: string;
    category: string;
    subcategory: string | null;
    address: string | null;
    description: string | null;
    rating: number | null;
    imageUrl: string | null;
    location: { lat: number; lng: number } | null;
  }>;
}
```

**cURL 範例**
```bash
curl "https://[API_URL]/api/seo/trips/1"
```

---

### 7. 訂閱方案

**Endpoint**
```
GET /api/subscription-plans
（公開存取，無需認證）
```

**TypeScript Interface**
```typescript
interface SubscriptionPlansResponse {
  plans: Array<{
    tier: string;
    name: string;
    nameEn: string;
    priceMonthly: number;
    priceYearly: number | null;
    pricePeriodLabel: string;
    features: string[];
    buttonText: string;
    highlighted: boolean;
    highlightLabel: string | null;
    maxPlaces: number;
    maxCoupons: number;
    hasAdvancedAnalytics: boolean;
    hasPriorityExposure: boolean;
    hasDedicatedSupport: boolean;
  }>;
}
```

**cURL 範例**
```bash
curl "https://[API_URL]/api/subscription-plans"
```

---

### 8. Google 登入（商家）

**Endpoint**
```
POST /api/auth/google
Content-Type: application/json
```

**TypeScript Interface**
```typescript
// 請求
interface GoogleLoginRequest {
  idToken: string;           // Google OAuth ID Token
  targetPortal: 'merchant';  // 指定商家入口
  user?: {                   // Google 專用
    email: string;
    name: string;
    picture?: string;
  };
}

// 成功回應
interface AuthSuccessResponse {
  success: true;
  token: string;  // JWT Token
  user: {
    id: string;
    email: string;
    name: string;
    role: 'merchant';
    isApproved: boolean;
    isSuperAdmin: boolean;
  };
}

// 錯誤回應
interface AuthErrorResponse {
  success: false;
  error: string;
  code: 'ROLE_MISMATCH' | 'OAUTH_NEW_USER_TRAVELER_ONLY';
  currentRole?: string;
  targetPortal?: string;
}
```

**cURL 範例**
```bash
curl -X POST "https://[API_URL]/api/auth/google" \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6...",
    "targetPortal": "merchant"
  }'
```

---

### 9. Apple 登入（商家）

**Endpoint**
```
POST /api/auth/apple
Content-Type: application/json
```

**TypeScript Interface**
```typescript
// 請求
interface AppleLoginRequest {
  identityToken: string;     // Apple ID Token
  targetPortal: 'merchant';  // 指定商家入口
  user?: string;             // Email（首次登入時提供）
  fullName?: {
    givenName?: string;
    familyName?: string;
  };
}

// 回應格式同 Google 登入
```

**cURL 範例**
```bash
curl -X POST "https://[API_URL]/api/auth/apple" \
  -H "Content-Type: application/json" \
  -d '{
    "identityToken": "eyJraWQiOiJXNldjT...",
    "targetPortal": "merchant"
  }'
```

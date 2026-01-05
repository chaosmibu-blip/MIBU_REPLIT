# Mibu 官方網站完整開發藍圖

> **版本**: 2.0 | **建立日期**: 2026-01-05 | **狀態**: 實作中

---

## 📋 目錄

1. [專案概述](#專案概述)
2. [技術棧規範](#技術棧規範)
3. [官網 replit.md 範本](#官網-replitmd-範本)
4. [記憶庫清單](#記憶庫清單)
5. [指令集](#指令集)
6. [頁面結構與路由](#頁面結構與路由)
7. [UI/UX 設計規範](#uiux-設計規範)
8. [API 整合指南](#api-整合指南)
9. [金流整合](#金流整合)
10. [SEO 規範](#seo-規範)
11. [部署流程](#部署流程)

---

## 專案概述

### 官網定位
Mibu 官方網站是面向商家的 B2B 平台，主要功能：
- 商家訂閱購買（Pro/Premium 方案）
- 程式化 SEO 頁面（城市/景點）
- 商家登入與管理後台
- 品牌行銷與下載引導

### 核心頁面

| 頁面 | 路由 | 目的 |
|------|------|------|
| 首頁 | `/` | 品牌介紹、App 下載引導 |
| 商家合作 | `/for-business` | 商家服務介紹 |
| 訂閱方案 | `/for-business/pricing` | 方案比較與購買 |
| 商家登入 | `/merchant/login` | Email + 密碼登入 |
| 商家後台 | `/merchant/dashboard` | 訂閱管理、數據概覽 |
| 城市列表 | `/explore` | SEO：所有城市 |
| 城市詳情 | `/city/[slug]` | SEO：城市景點列表 |
| 景點詳情 | `/place/[slug]` | SEO：單一景點資訊 |

---

## 技術棧規範

### 必用框架

| 類別 | 技術 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 15.x |
| 樣式 | Tailwind CSS | 3.x |
| UI 元件 | shadcn/ui | 最新 |
| 狀態管理 | TanStack Query | 5.x |
| 表單 | React Hook Form + Zod | 最新 |
| 圖示 | Lucide React | 最新 |
| 動畫 | Framer Motion | 最新 |

### 禁止事項

- 禁止使用 HTML 原生標籤做樣式（使用 Tailwind）
- 禁止 inline style（除非動態計算）
- 禁止在 Client Component 使用 `async/await`（用 useQuery）
- 禁止硬編碼後端 URL（使用環境變數）

---

## 官網 replit.md 範本

請將以下內容貼入官網專案的 `replit.md`：

```markdown
# Mibu 官方網站

## 專案簡介
Mibu 官方網站是面向商家的 B2B 平台，提供訂閱購買、商家登入、SEO 頁面等功能。

## 角色定義
你是**前端工程師**，負責實作官網功能，接受後端首席架構師的技術指揮。

### 技術棧
- Next.js 15 (App Router)
- Tailwind CSS 3.x
- shadcn/ui
- TanStack Query 5.x
- React Hook Form + Zod

## 原則
1. 全程使用中文溝通
2. 遵循後端提供的 API 契約
3. 所有頁面需響應式（手機優先）
4. SEO 頁面使用 SSR/SSG

## 後端 API
| 環境 | URL |
|------|-----|
| 開發 | `https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev` |
| 生產 | `https://gacha-travel--s8869420.replit.app` |

## 記憶庫索引

| 檔案 | 職權範圍 |
|------|---------|
| memory-web-pages.md | 頁面結構、路由定義 |
| memory-web-components.md | 共用元件庫 |
| memory-web-api.md | API 整合、hook 定義 |
| memory-web-auth.md | 認證機制（Cookie JWT） |
| memory-web-payment.md | 金流整合（Stripe/Recur） |
| memory-web-seo.md | SEO 頁面、Meta 設定 |

## 環境變數

\`\`\`env
NEXT_PUBLIC_API_URL=後端 API URL
NEXT_PUBLIC_RECUR_PUBLISHABLE_KEY=Recur 公開金鑰
\`\`\`

## 輸出協議
完成功能後輸出：
- 路由/檔案變更
- 元件 Props 定義
- API 依賴
```

---

## 記憶庫清單

官網需建立以下記憶庫（存放於 `docs/` 目錄）：

### 1. memory-web-pages.md
```markdown
# 官網頁面結構

## 路由定義

| 路由 | 檔案 | 說明 | 認證 |
|------|------|------|------|
| `/` | `app/page.tsx` | 首頁 | 無 |
| `/for-business` | `app/for-business/page.tsx` | 商家合作頁 | 無 |
| `/for-business/pricing` | `app/for-business/pricing/page.tsx` | 訂閱方案頁 | 無 |
| `/merchant/login` | `app/merchant/login/page.tsx` | 商家登入 | 無 |
| `/merchant/dashboard` | `app/merchant/dashboard/page.tsx` | 商家後台 | 需登入 |
| `/explore` | `app/explore/page.tsx` | 城市列表 | 無 |
| `/city/[slug]` | `app/city/[slug]/page.tsx` | 城市詳情 | 無 |
| `/place/[slug]` | `app/place/[slug]/page.tsx` | 景點詳情 | 無 |

## 頁面狀態
- [ ] 首頁
- [ ] 商家合作頁
- [ ] 訂閱方案頁
- [ ] 商家登入
- [ ] 商家後台
- [ ] 城市列表
- [ ] 城市詳情
- [ ] 景點詳情
```

### 2. memory-web-components.md
```markdown
# 官網元件庫

## 共用元件

| 元件 | 位置 | 說明 |
|------|------|------|
| Header | `components/layout/Header.tsx` | 網站頭部導航 |
| Footer | `components/layout/Footer.tsx` | 網站底部 |
| Container | `components/layout/Container.tsx` | 內容容器 |
| Button | `components/ui/button.tsx` | shadcn/ui 按鈕 |
| Card | `components/ui/card.tsx` | shadcn/ui 卡片 |

## 業務元件

| 元件 | 位置 | 說明 |
|------|------|------|
| PricingCard | `components/pricing/PricingCard.tsx` | 訂閱方案卡片 |
| PaymentMethodSelector | `components/payment/PaymentMethodSelector.tsx` | 金流選擇器 |
| LoginForm | `components/auth/LoginForm.tsx` | 登入表單 |
| SubscriptionStatus | `components/merchant/SubscriptionStatus.tsx` | 訂閱狀態顯示 |
| CityCard | `components/seo/CityCard.tsx` | 城市卡片 |
| PlaceCard | `components/seo/PlaceCard.tsx` | 景點卡片 |
```

### 3. memory-web-api.md
```markdown
# API 整合規範

## API Client 設定

\`\`\`typescript
// lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(\`\${API_URL}\${endpoint}\`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(res.status, error.message || 'Request failed');
  }

  return res.json();
}
\`\`\`

## 自訂 Hooks

| Hook | 用途 |
|------|------|
| useAuth | 認證狀態管理 |
| useMerchant | 商家資料 |
| useSubscription | 訂閱狀態 |
| useSubscriptionPlans | 訂閱方案列表 |
| useCities | 城市列表 |
| useCity | 單一城市詳情 |
| usePlace | 單一景點詳情 |
```

### 4. memory-web-auth.md
```markdown
# 認證機制

## Cookie-based JWT

| 項目 | 值 |
|------|-----|
| Cookie 名稱 | auth_token |
| 類型 | HttpOnly, Secure |
| 有效期 | 7 天 |
| SameSite | Lax |

## 認證流程

1. POST /api/merchant/login → 後端設定 Cookie
2. 後續請求自動帶 Cookie → 後端驗證 JWT
3. GET /api/merchant/verify → 檢查登入狀態
4. POST /api/merchant/logout → 清除 Cookie

## 保護路由

\`\`\`typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const authToken = request.cookies.get('auth_token');
  
  if (request.nextUrl.pathname.startsWith('/merchant/dashboard')) {
    if (!authToken) {
      return NextResponse.redirect(new URL('/merchant/login', request.url));
    }
  }
}
\`\`\`
```

### 5. memory-web-payment.md
```markdown
# 金流整合

## 雙軌金流

| 金流 | 適用場景 | 整合方式 |
|------|---------|---------|
| Stripe | 海外用戶 | Checkout Session 跳轉 |
| Recur | 台灣用戶 | SDK + redirectToCheckout |

## Recur SDK 載入

\`\`\`html
<Script 
  src="https://unpkg.com/recur-tw@0.11.0/dist/recur.umd.js"
  strategy="beforeInteractive"
/>
\`\`\`

## 結帳流程

1. 用戶選擇方案 + 金流
2. POST /api/merchant/subscription/checkout
3. Stripe → 跳轉 Checkout 頁面
4. Recur → 使用 SDK redirectToCheckout
5. 成功 → /merchant/subscription/success
6. 取消 → /merchant/subscription/cancel
```

### 6. memory-web-seo.md
```markdown
# SEO 頁面規範

## 頁面類型

| 頁面 | 渲染方式 | 更新頻率 |
|------|---------|---------|
| 城市列表 | SSG + ISR | 每日 |
| 城市詳情 | SSG + ISR | 每小時 |
| 景點詳情 | SSG + ISR | 每小時 |

## Meta Tags

\`\`\`typescript
// 城市頁面
export async function generateMetadata({ params }): Promise<Metadata> {
  const city = await getCityData(params.slug);
  return {
    title: \`\${city.name} 必去景點推薦 | Mibu\`,
    description: \`探索 \${city.name} 最熱門的景點...\`,
    openGraph: {
      title: \`\${city.name} 必去景點推薦\`,
      description: \`...\`,
      images: [city.coverImage],
    },
  };
}
\`\`\`

## 結構化資料

使用 JSON-LD 標記：
- 城市頁：Place + ItemList
- 景點頁：TouristAttraction
```

---

## 指令集

### 專案初始化

```bash
# 1. 建立 Next.js 專案
npx create-next-app@latest mibu-web --typescript --tailwind --eslint --app --src-dir

# 2. 安裝依賴
npm install @tanstack/react-query react-hook-form zod @hookform/resolvers lucide-react framer-motion

# 3. 安裝 shadcn/ui
npx shadcn@latest init

# 4. 安裝常用元件
npx shadcn@latest add button card input label toast tabs accordion dialog
```

### 環境變數設定

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev
NEXT_PUBLIC_RECUR_PUBLISHABLE_KEY=pk_test_xxx
```

### 開發指令

```bash
npm run dev      # 開發模式
npm run build    # 建構
npm run start    # 啟動生產版
npm run lint     # ESLint 檢查
```

---

## 頁面結構與路由

### 目錄結構

```
app/
├── layout.tsx              # 根 Layout（Header + Footer）
├── page.tsx                # 首頁
├── for-business/
│   ├── page.tsx            # 商家合作頁
│   └── pricing/
│       └── page.tsx        # 訂閱方案頁
├── merchant/
│   ├── login/
│   │   └── page.tsx        # 商家登入
│   ├── dashboard/
│   │   └── page.tsx        # 商家後台
│   └── subscription/
│       ├── success/
│       │   └── page.tsx    # 付款成功
│       └── cancel/
│           └── page.tsx    # 付款取消
├── explore/
│   └── page.tsx            # 城市列表
├── city/
│   └── [slug]/
│       └── page.tsx        # 城市詳情
└── place/
    └── [slug]/
        └── page.tsx        # 景點詳情
```

---

## UI/UX 設計規範

### 色彩系統

```css
/* 主色調 */
--primary: #6366F1;       /* Indigo 500 */
--primary-dark: #4F46E5;  /* Indigo 600 */

/* 輔助色 */
--success: #10B981;       /* Green 500 */
--warning: #F59E0B;       /* Amber 500 */
--error: #EF4444;         /* Red 500 */

/* 中性色 */
--background: #FFFFFF;
--foreground: #0F172A;    /* Slate 900 */
--muted: #64748B;         /* Slate 500 */
--border: #E2E8F0;        /* Slate 200 */
```

### 響應式斷點

| 斷點 | 寬度 | 用途 |
|------|------|------|
| sm | 640px | 手機橫向 |
| md | 768px | 平板 |
| lg | 1024px | 筆電 |
| xl | 1280px | 桌機 |

### 頁面佈局規範

#### 訂閱方案頁

```tsx
// 響應式網格
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {plans.map((plan) => (
    <PricingCard key={plan.tier} plan={plan} />
  ))}
</div>
```

- 手機 (<768px)：單欄堆疊，推薦方案置頂
- 平板/桌機 (≥768px)：三欄並排

#### 登入頁

```tsx
// 雙欄分割
<div className="min-h-screen flex">
  {/* 品牌區：手機隱藏 */}
  <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center">
    <BrandIllustration />
  </div>
  
  {/* 表單區 */}
  <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
    <LoginForm className="w-full max-w-md" />
  </div>
</div>
```

- 手機：全寬表單，Logo 上方
- 桌機：左側品牌區 + 右側登入表單

#### 商家後台

```tsx
// Sidebar + Content
<div className="flex min-h-screen">
  {/* Sidebar：手機為底部導航或漢堡選單 */}
  <aside className="hidden md:block w-64 border-r">
    <DashboardNav />
  </aside>
  
  {/* 主內容區 */}
  <main className="flex-1 p-6">
    {children}
  </main>
  
  {/* 手機底部導航 */}
  <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-white">
    <MobileNav />
  </nav>
</div>
```

### 元件設計規範

#### PricingCard

```tsx
interface PricingCardProps {
  plan: SubscriptionPlan;
  isCurrentPlan?: boolean;
  onSelect?: () => void;
}

// 樣式要點
// - 推薦方案: ring-2 ring-primary + 標籤
// - 價格突出顯示 (text-4xl font-bold)
// - 功能列表使用 check icon
// - CTA 按鈕固定在底部
```

#### 訂閱狀態卡片

```tsx
// 狀態顏色映射
const statusColors = {
  active: 'bg-green-100 text-green-800',
  past_due: 'bg-yellow-100 text-yellow-800',
  canceling: 'bg-orange-100 text-orange-800',
  expired: 'bg-red-100 text-red-800',
};
```

---

## API 整合指南

### 核心 API 端點

#### 公開 API

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/subscription-plans` | 訂閱方案列表 |
| GET | `/api/seo/cities` | 城市列表 |
| GET | `/api/seo/cities/:slug` | 城市詳情 |
| GET | `/api/seo/places/:slug` | 景點詳情 |

#### 認證 API

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/merchant/login` | 商家登入 |
| POST | `/api/merchant/logout` | 商家登出 |
| GET | `/api/merchant/verify` | 驗證登入狀態 |

#### 訂閱 API（需登入）

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/merchant/subscription` | 當前訂閱狀態 |
| POST | `/api/merchant/subscription/checkout` | 建立結帳 Session |
| POST | `/api/merchant/subscription/cancel` | 取消訂閱 |

### TypeScript 類型

```typescript
// types/subscription.ts
export type SubscriptionTier = 'free' | 'pro' | 'premium' | 'partner';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing';
export type PaymentProvider = 'stripe' | 'recur';

export interface SubscriptionPlan {
  tier: SubscriptionTier;
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

// types/merchant.ts
export interface Merchant {
  id: number;
  name: string;
  email: string;
  level: SubscriptionTier;
  avatarUrl?: string;
}

export interface MerchantSubscription {
  id: number;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}
```

---

## 金流整合

### Stripe 流程

```typescript
async function handleStripeCheckout(tier: 'pro' | 'premium') {
  const res = await apiClient<{ url: string }>(
    '/api/merchant/subscription/checkout',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'merchant',
        tier,
        provider: 'stripe',
      }),
    }
  );
  
  // 跳轉至 Stripe Checkout
  window.location.href = res.url;
}
```

### Recur 流程

```typescript
async function handleRecurCheckout(tier: 'pro' | 'premium') {
  const res = await apiClient<{
    productId: string;
    publishableKey: string;
    customerEmail: string;
    externalCustomerId: string;
    successUrl: string;
    cancelUrl: string;
  }>(
    '/api/merchant/subscription/checkout',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'merchant',
        tier,
        provider: 'recur',
      }),
    }
  );
  
  // 使用 Recur SDK
  const recur = (window as any).RecurCheckout.init({
    publishableKey: res.publishableKey,
  });
  
  await recur.redirectToCheckout({
    productId: res.productId,
    externalCustomerId: res.externalCustomerId,
    customerEmail: res.customerEmail,
    successUrl: res.successUrl,
    cancelUrl: res.cancelUrl,
  });
}
```

---

## SEO 規範

### Meta Tags 範本

```typescript
// app/city/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const city = await getCityData(params.slug);
  
  if (!city) {
    return { title: '找不到城市 | Mibu' };
  }
  
  return {
    title: `${city.name} 必去景點推薦 | Mibu`,
    description: `探索 ${city.name} 最熱門的 ${city.placesCount} 個景點，包含美食、購物、景點等分類。`,
    keywords: `${city.name}, 旅遊, 景點, 推薦`,
    openGraph: {
      type: 'website',
      title: `${city.name} 必去景點推薦 | Mibu`,
      description: `探索 ${city.name} 最熱門的景點...`,
      images: [
        {
          url: city.coverImage,
          width: 1200,
          height: 630,
          alt: city.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${city.name} 必去景點推薦`,
      description: `探索 ${city.name} 最熱門的景點...`,
      images: [city.coverImage],
    },
  };
}
```

### 結構化資料

```typescript
// 城市頁面 JSON-LD
const cityJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: `${city.name} 熱門景點`,
  itemListElement: places.map((place, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': 'TouristAttraction',
      name: place.name,
      description: place.description,
      image: place.coverImage,
      address: {
        '@type': 'PostalAddress',
        addressLocality: city.name,
      },
    },
  })),
};
```

### ISR 設定

```typescript
// 城市頁面：每小時重新驗證
export const revalidate = 3600;

// 景點頁面：每小時重新驗證
export const revalidate = 3600;

// 靜態路徑生成
export async function generateStaticParams() {
  const cities = await getCities();
  return cities.map((city) => ({ slug: city.slug }));
}
```

---

## 部署流程

### Replit 部署

1. 設定環境變數
2. 執行 `npm run build`
3. 點擊 Deploy 按鈕
4. 等待部署完成

### 環境變數設定

| 變數 | 開發值 | 生產值 |
|------|--------|--------|
| `NEXT_PUBLIC_API_URL` | 開發後端 URL | 生產後端 URL |
| `NEXT_PUBLIC_RECUR_PUBLISHABLE_KEY` | pk_test_xxx | pk_live_xxx |

### 部署前檢查清單

- [ ] 環境變數已設定正確
- [ ] CORS 已允許官網域名
- [ ] Meta Tags 已設定
- [ ] 結構化資料已驗證
- [ ] 響應式設計已測試
- [ ] 金流流程已測試

---

## 版本紀錄

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| 2.0 | 2026-01-05 | 完整重構藍圖，新增記憶庫、指令集、UI/UX 規範 |
| 1.2 | 2026-01-05 | 新增響應式設計規範 |
| 1.1 | 2026-01-05 | 新增動態訂閱方案 API |
| 1.0 | 2026-01-04 | 初版同步藍圖 |

---

## 聯絡窗口

後端 API 問題請聯繫：**後端首席架構師（Replit 後端專案）**

更新 API 時，後端會發送「🌐 給官網的同步指令」，包含：
- Endpoint 變更
- TypeScript Interface
- cURL 範例
- UI 實作建議

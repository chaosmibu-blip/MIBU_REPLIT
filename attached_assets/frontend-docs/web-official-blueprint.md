# Mibu 官方網站完整開發藍圖

> **版本**: 2.2 | **更新日期**: 2026-01-06 | **狀態**: 實作中

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

### 官網雙受眾定位（2026-01-06 更新）

Mibu 官方網站同時服務兩類用戶：

| 用戶 | 目標 | 實現方式 |
|------|------|---------|
| **一般旅客** | Google 搜尋「景點」「行程」時找到 Mibu → 下載 App | 程式化 SEO 頁面 |
| **商家** | 購買訂閱（iOS 規定跨平台訂閱必須在官網完成） | 商家登入 + 訂閱購買 |

### 核心頁面

#### 面向一般旅客（SEO）

| 頁面 | 路由 | 目的 | API |
|------|------|------|-----|
| 首頁 | `/` | 品牌介紹、App 下載引導 | 無 |
| 城市列表 | `/explore` | SEO：所有城市 | `GET /api/seo/cities` |
| 城市詳情 | `/city/[slug]` | SEO：城市景點列表 | `GET /api/seo/cities/:slug` |
| 景點詳情 | `/place/[slug]` | SEO：單一景點資訊 | `GET /api/seo/places/:slug` |

#### 面向商家

| 頁面 | 路由 | 目的 | API |
|------|------|------|-----|
| 商家合作 | `/for-business` | 商家服務介紹 | 無 |
| 訂閱方案 | `/for-business/pricing` | 方案比較與購買 | `GET /api/subscription-plans` |
| 商家登入 | `/merchant/login` | Email + 密碼登入 | `POST /api/auth/login` |
| 商家後台 | `/merchant/dashboard` | 查看訂閱狀態與權限（唯讀） | `GET /api/merchant/subscription` |

> ⚠️ **重要**：商家註冊、店家認領、優惠券管理、數據報表等功能**僅在 App 中提供**。官網商家後台僅供查看訂閱狀態。

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
Mibu 官方網站同時服務兩類用戶：
- **一般旅客**：透過程式化 SEO 頁面，讓 Google 搜尋「景點」「行程」時能找到 Mibu，引導下載 App
- **商家**：購買訂閱方案（iOS 規定跨平台訂閱必須在官網完成）

## 角色定義
你是**前端工程師**，負責實作官網功能，接受後端首席架構師的技術指揮。

## 技術棧
- Next.js 15 (App Router)
- Tailwind CSS 3.x
- shadcn/ui
- TanStack Query 5.x
- React Hook Form + Zod

## 後端 API
| 環境 | URL |
|------|-----|
| 開發 | `https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev` |
| 生產 | `https://gacha-travel--s8869420.replit.app` |

## 頁面結構

### 面向一般旅客（SEO）
| 路由 | 說明 | API |
|------|------|-----|
| `/` | 首頁 + 下載按鈕 | 無 |
| `/explore` | 城市列表 | `GET /api/seo/cities` |
| `/city/[slug]` | 城市詳情 | `GET /api/seo/cities/:slug` |
| `/place/[slug]` | 景點詳情 | `GET /api/seo/places/:slug` |

### 面向商家
| 路由 | 說明 | API |
|------|------|-----|
| `/for-business` | 商家合作介紹 | 無 |
| `/for-business/pricing` | 訂閱方案 | `GET /api/subscription-plans` |
| `/merchant/login` | 商家登入 | `POST /api/auth/login` |
| `/merchant/dashboard` | 訂閱狀態 | `GET /api/merchant/subscription` |

## 商家功能範圍（官網限定）

| 功能 | 說明 |
|------|------|
| 登入 | Email + 密碼，無帳號引導下載 App |
| 訂閱購買 | Stripe/Recur 雙軌金流 |
| 查看訂閱 | 顯示方案、狀態、到期日（唯讀）|

> ⚠️ 商家註冊、店家認領、數據報表等功能僅在 App 中提供

## 下載按鈕規格
- **Android**：Toast 顯示「敬請期待」
- **iOS**：跳轉 App Store（待上架後補上連結）

## 記憶庫索引

| 檔案 | 職權範圍 |
|------|---------|
| memory-web-pages.md | 頁面結構、路由定義 |
| memory-web-auth.md | 商家登入、JWT Cookie |
| memory-web-payment.md | 訂閱購買（Stripe/Recur）|
| memory-web-seo.md | SEO 頁面、Meta、結構化資料 |

## 環境變數

\`\`\`env
NEXT_PUBLIC_API_URL=後端 API URL
NEXT_PUBLIC_RECUR_PUBLISHABLE_KEY=Recur 公開金鑰
\`\`\`

## 原則
1. 全程使用中文溝通
2. 遵循後端提供的 API 契約
3. 所有頁面需響應式（手機優先）
4. SEO 頁面使用 SSG + ISR
5. 商家頁面需認證保護
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
# 認證機制（2026-01-06 更新）

## 統一身份認證架構

後端使用 `auth_identities` 表支援一個用戶多種登入方式。

### auth_identities 表結構

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | serial | 主鍵 |
| userId | varchar | 關聯 users.id |
| provider | varchar(20) | 'google' \| 'apple' \| 'email' \| 'replit' |
| providerUserId | varchar(255) | OAuth sub 或 email |
| email | varchar | OAuth 回傳的 email |
| emailVerified | boolean | 郵箱是否已驗證 |
| createdAt | timestamp | 建立時間 |

### 唯一約束
- `(provider, providerUserId)` 組合唯一，確保每個外部帳號只能連結到一個用戶

## 雙軌認證策略

| 用戶類型 | 登入方式 | API | 使用場景 |
|---------|---------|-----|---------|
| 旅客 | Google OAuth | POST /api/auth/google | App、官網 |
| 旅客 | Apple OAuth | POST /api/auth/apple | App、官網 |
| 商家 | Email + 密碼 | POST /api/auth/login | 官網 |
| 專員 | Email + 密碼 | POST /api/auth/login | 官網 |

## JWT Token 規範

### 雙軌傳輸支援

後端同時支援兩種 JWT 傳輸方式，前端可根據場景選擇：

| 方式 | 適用場景 | 說明 |
|------|---------|------|
| **HttpOnly Cookie** | 官網（Next.js）| 後端設定 `auth_token` Cookie，前端免處理 |
| **Bearer Token** | App（Expo）| 前端儲存 token，每次請求附加 Header |

### 官網推薦方式：Cookie（自動）

\`\`\`typescript
// 登入後，後端自動設定 HttpOnly Cookie
// 後續請求自動帶入，前端無需額外處理
const res = await fetch('/api/auth/login', {
  method: 'POST',
  credentials: 'include',  // 重要：確保 Cookie 會被發送
  body: JSON.stringify({ email, password, target_role: 'merchant' })
});
\`\`\`

### App 方式：Bearer Token

\`\`\`typescript
// 登入回應會包含 token
const { token } = await login(email, password);
await AsyncStorage.setItem('auth_token', token);

// 後續請求需手動附加 Header
fetch('/api/xxx', {
  headers: { 'Authorization': \`Bearer \${token}\` }
});
\`\`\`

### Token 規範

| 項目 | 值 |
|------|-----|
| Cookie 名稱 | auth_token |
| Cookie 屬性 | HttpOnly, Secure, SameSite=Lax |
| 有效期 | 7 天 |
| Payload | { userId, email, role, activeRole }

## 認證流程

### 商家登入流程
\`\`\`
1. 用戶填寫 email + password
2. POST /api/auth/login { email, password, target_role: 'merchant' }
3. 後端驗證 → 回傳 { token, user }
4. 前端儲存 token → 跳轉至 /merchant/dashboard
\`\`\`

### Google OAuth 流程（官網）
\`\`\`
1. 用戶點擊「Google 登入」
2. Google SDK 取得 idToken
3. POST /api/auth/google { idToken, targetPortal: 'traveler' }
4. 後端驗證 idToken → 寫入 auth_identities → 回傳 { token, user }
5. 前端儲存 token → 跳轉至首頁
\`\`\`

### Apple OAuth 流程（官網）
\`\`\`
1. 用戶點擊「Apple 登入」
2. Apple SDK 取得 identityToken + user info
3. POST /api/auth/apple { identityToken, user, fullName, email }
4. 後端驗證 token → 寫入 auth_identities → 回傳 { token, user }
5. 前端儲存 token → 跳轉至首頁
\`\`\`

## 保護路由

\`\`\`typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value 
    || request.headers.get('authorization')?.replace('Bearer ', '');
  
  const protectedPaths = ['/merchant/dashboard', '/specialist'];
  const isProtected = protectedPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  );
  
  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/merchant/login', request.url));
  }
}

export const config = {
  matcher: ['/merchant/:path*', '/specialist/:path*'],
};
\`\`\`

## 帳號連結功能（待實作）

允許用戶將多個登入方式連結到同一帳號：

\`\`\`typescript
// 連結新的登入方式
POST /api/auth/link-identity
{ provider: 'google', idToken: 'xxx' }

// 取得已連結的登入方式
GET /api/auth/identities
→ { identities: [{ provider, email, createdAt }] }

// 解除連結
DELETE /api/auth/identities/:provider
\`\`\`

## 錯誤處理

| 錯誤碼 | 說明 | 處理方式 |
|--------|------|---------|
| INVALID_CREDENTIALS | 帳密錯誤 | 顯示錯誤訊息 |
| PENDING_APPROVAL | 審核中 | 顯示等待審核提示 |
| ROLE_MISMATCH | 角色不符 | 引導至正確入口 |
| IDENTITY_ALREADY_LINKED | 帳號已被連結 | 顯示衝突提示 |
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

---

### 認證 API（2026-01-06 更新）

#### 統一身份認證架構

後端採用 `auth_identities` 表支援一個用戶多種登入方式：

```typescript
// 支援的登入 Provider
type AuthProvider = 'google' | 'apple' | 'email' | 'replit' | 'guest';

// auth_identities 表結構
interface AuthIdentity {
  id: number;
  userId: string;
  provider: AuthProvider;
  providerUserId: string;  // OAuth sub 或 email
  email?: string;
  emailVerified: boolean;
  createdAt: Date;
}
```

#### 雙軌認證策略

| 用戶類型 | 登入方式 | 使用場景 |
|---------|---------|---------|
| 旅客 | Google/Apple OAuth | App 登入、官網旅客登入 |
| 商家 | Email + 密碼 | 官網商家登入（需審核） |
| 專員 | Email + 密碼 | 官網專員登入（需審核） |

#### 商家登入 API

```typescript
POST /api/auth/login
Content-Type: application/json

// Request
{
  "email": "merchant@example.com",
  "password": "password123",
  "target_role": "merchant"  // 指定登入角色
}

// Response - 成功
{
  "user": {
    "id": "email_xxx",
    "email": "merchant@example.com",
    "firstName": "店長",
    "lastName": null,
    "role": "merchant",
    "isApproved": true
  },
  "token": "JWT_TOKEN"
}

// Response - 審核中
{
  "error": "帳號審核中，請等待管理員核准",
  "code": "PENDING_APPROVAL",
  "isApproved": false
}

// Response - 角色不符
{
  "error": "您的帳號角色為 traveler，無法從 merchant 入口登入",
  "code": "ROLE_MISMATCH",
  "currentRole": "traveler",
  "targetRole": "merchant"
}
```

#### Google OAuth 登入（旅客用）

```typescript
POST /api/auth/google
Content-Type: application/json

// Request
{
  "idToken": "GOOGLE_ID_TOKEN",  // 由 Google Sign-In SDK 取得
  "targetPortal": "traveler"     // 目前只支援 traveler
}

// Response
{
  "success": true,
  "token": "JWT_TOKEN",
  "user": {
    "id": "google_12345678",
    "email": "user@gmail.com",
    "name": "John Doe",
    "role": "traveler",
    "isApproved": true,
    "isSuperAdmin": false
  }
}
```

⚠️ **重要**：後端會使用 `google-auth-library` 驗證 ID token 的真實性，從 Google 驗證後的 payload 提取用戶資訊。

#### Apple OAuth 登入（旅客用）

```typescript
POST /api/auth/apple
Content-Type: application/json

// Request
{
  "identityToken": "APPLE_IDENTITY_TOKEN",
  "user": "apple_user_id",
  "fullName": { "givenName": "John", "familyName": "Doe" },
  "email": "user@privaterelay.appleid.com",
  "targetPortal": "traveler"
}

// Response
{
  "success": true,
  "token": "JWT_TOKEN",
  "user": {
    "id": "apple_xxx",
    "email": "user@privaterelay.appleid.com",
    "name": "John Doe",
    "role": "traveler",
    "isApproved": true,
    "isSuperAdmin": false
  }
}
```

#### 帳號連結 API（待實作）

```typescript
POST /api/auth/link-identity
Authorization: Bearer JWT_TOKEN
Content-Type: application/json

// Request - 連結新的登入方式
{
  "provider": "google",
  "idToken": "GOOGLE_ID_TOKEN"
}

// Response - 成功
{
  "success": true,
  "message": "已成功連結 Google 帳號",
  "identities": [
    { "provider": "apple", "email": "user@appleid.com" },
    { "provider": "google", "email": "user@gmail.com" }
  ]
}

// Response - 帳號已被其他用戶使用
{
  "success": false,
  "error": "此 Google 帳號已被其他用戶連結",
  "code": "IDENTITY_ALREADY_LINKED"
}
```

#### 取得用戶已連結的登入方式

```typescript
GET /api/auth/identities
Authorization: Bearer JWT_TOKEN

// Response
{
  "identities": [
    { "provider": "apple", "email": "user@appleid.com", "createdAt": "2026-01-06" },
    { "provider": "google", "email": "user@gmail.com", "createdAt": "2026-01-06" }
  ]
}
```

#### 其他認證端點

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/auth/user` | 取得當前登入用戶 |
| POST | `/api/auth/logout` | 登出 |
| POST | `/api/auth/register` | 註冊（Email + 密碼） |
| POST | `/api/auth/register/merchant` | 商家註冊 |
| POST | `/api/auth/register/specialist` | 專員註冊 |

---

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

## SEO API（2026-01-06 新增）

> ⚠️ **待後端實作**：以下 API 需要後端首席架構師建立

### GET /api/seo/cities

取得有景點的城市列表（公開、無需認證）

```typescript
GET /api/seo/cities
Query: ?country=taiwan&limit=50

// Response
{
  "cities": [
    {
      "slug": "taipei",
      "name": "台北",
      "nameEn": "Taipei",
      "country": "taiwan",
      "coverImage": "https://...",
      "placesCount": 245,
      "categories": ["美食", "景點", "購物"]
    }
  ],
  "total": 22
}
```

### GET /api/seo/cities/:slug

取得城市詳情 + 景點列表（公開、無需認證）

```typescript
GET /api/seo/cities/taipei
Query: ?category=美食&page=1&limit=20

// Response
{
  "city": {
    "slug": "taipei",
    "name": "台北",
    "nameEn": "Taipei",
    "country": "taiwan",
    "coverImage": "https://...",
    "description": "台北是台灣的首都...",
    "placesCount": 245
  },
  "places": [
    {
      "slug": "din-tai-fung-xinyi",
      "name": "鼎泰豐（信義店）",
      "nameEn": "Din Tai Fung Xinyi",
      "category": "美食",
      "subcategory": "餐廳",
      "coverImage": "https://...",
      "rating": 4.8,
      "reviewCount": 12500,
      "shortDescription": "世界知名的小籠包餐廳..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 245,
    "totalPages": 13
  },
  "categories": [
    { "name": "美食", "count": 120 },
    { "name": "景點", "count": 80 },
    { "name": "購物", "count": 45 }
  ]
}
```

### GET /api/seo/places/:slug

取得單一景點詳情（公開、無需認證）

```typescript
GET /api/seo/places/din-tai-fung-xinyi

// Response
{
  "place": {
    "slug": "din-tai-fung-xinyi",
    "name": "鼎泰豐（信義店）",
    "nameEn": "Din Tai Fung Xinyi",
    "city": "taipei",
    "cityName": "台北",
    "district": "信義區",
    "category": "美食",
    "subcategory": "餐廳",
    "coverImage": "https://...",
    "images": ["https://...", "https://..."],
    "description": "鼎泰豐是享譽國際的小籠包...",
    "rating": 4.8,
    "reviewCount": 12500,
    "address": "台北市信義區...",
    "phone": "+886-2-xxxx-xxxx",
    "website": "https://...",
    "openingHours": {
      "monday": "10:00-21:00",
      "tuesday": "10:00-21:00"
    },
    "coordinates": {
      "lat": 25.0330,
      "lng": 121.5654
    },
    "tags": ["米其林", "排隊名店", "觀光客必訪"]
  },
  "relatedPlaces": [
    { "slug": "...", "name": "...", "coverImage": "..." }
  ]
}
```

---

## 下載按鈕元件規格（2026-01-06 新增）

### DownloadButton 元件

**依賴**：
- `sonner` - Toast 通知
- `lucide-react` - Apple / Play Store 圖示
- `cn` helper - 來自 `@/lib/utils`（shadcn/ui 預設提供）

```typescript
// components/common/DownloadButton.tsx
'use client';

import { toast } from 'sonner';
import { Apple, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DownloadButtonProps {
  platform: 'ios' | 'android';
  className?: string;
}

const IOS_APP_STORE_URL = ''; // 待上架後補上

export function DownloadButton({ platform, className }: DownloadButtonProps) {
  const handleClick = () => {
    if (platform === 'android') {
      toast('敬請期待', {
        description: 'Android 版本即將推出，敬請期待！',
      });
      return;
    }
    
    if (platform === 'ios') {
      if (IOS_APP_STORE_URL) {
        window.open(IOS_APP_STORE_URL, '_blank');
      } else {
        toast('即將上架', {
          description: 'iOS 版本審核中，即將上架 App Store！',
        });
      }
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 px-6 py-3 rounded-lg font-medium',
        platform === 'ios' 
          ? 'bg-black text-white hover:bg-gray-800' 
          : 'bg-green-600 text-white hover:bg-green-700',
        className
      )}
    >
      {platform === 'ios' ? (
        <>
          <Apple className="w-5 h-5" />
          <span>App Store</span>
        </>
      ) : (
        <>
          <Play className="w-5 h-5" />
          <span>Google Play</span>
        </>
      )}
    </button>
  );
}
```

### 使用方式

```tsx
// 在 SEO 頁面中使用
<div className="flex gap-4">
  <DownloadButton platform="ios" />
  <DownloadButton platform="android" />
</div>
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

---

## 官網完整實作指令集（2026-01-06 新增）

### Phase 1：專案初始化（Day 1）

```bash
# 1. 建立 Next.js 專案
npx create-next-app@latest mibu-web --typescript --tailwind --eslint --app --src-dir

# 2. 安裝依賴
cd mibu-web
npm install @tanstack/react-query react-hook-form zod @hookform/resolvers lucide-react framer-motion sonner

# 3. 安裝 shadcn/ui
npx shadcn@latest init

# 4. 安裝常用元件
npx shadcn@latest add button card input label toast tabs dialog separator badge
```

### Phase 2：基礎架構（Day 1-2）

#### 2.1 設定環境變數

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev
NEXT_PUBLIC_RECUR_PUBLISHABLE_KEY=pk_test_xxx
```

#### 2.2 建立 API Client

```typescript
// lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(res.status, error.error || 'Request failed', error.code);
  }

  return res.json();
}
```

#### 2.3 建立目錄結構

```
src/
├── app/
│   ├── layout.tsx              # 根 Layout
│   ├── page.tsx                # 首頁
│   ├── explore/
│   │   └── page.tsx            # 城市列表（SEO）
│   ├── city/
│   │   └── [slug]/
│   │       └── page.tsx        # 城市詳情（SEO）
│   ├── place/
│   │   └── [slug]/
│   │       └── page.tsx        # 景點詳情（SEO）
│   ├── for-business/
│   │   ├── page.tsx            # 商家合作介紹
│   │   └── pricing/
│   │       └── page.tsx        # 訂閱方案頁
│   ├── merchant/
│   │   ├── login/
│   │   │   └── page.tsx        # 商家登入
│   │   ├── dashboard/
│   │   │   └── page.tsx        # 商家後台（訂閱狀態）
│   │   └── subscription/
│   │       ├── success/
│   │       │   └── page.tsx    # 付款成功
│   │       └── cancel/
│   │           └── page.tsx    # 付款取消
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── common/
│   │   └── DownloadButton.tsx
│   ├── seo/
│   │   ├── CityCard.tsx
│   │   └── PlaceCard.tsx
│   ├── pricing/
│   │   └── PricingCard.tsx
│   └── merchant/
│       ├── LoginForm.tsx
│       └── SubscriptionStatus.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useCities.ts
│   ├── useCity.ts
│   ├── usePlace.ts
│   └── useSubscription.ts
├── lib/
│   └── api/
│       └── client.ts
└── types/
    ├── auth.ts
    ├── seo.ts
    └── subscription.ts
```

### Phase 3：頁面實作優先順序

| 優先級 | 頁面 | 說明 | 依賴 API |
|--------|------|------|----------|
| 1 | `/` | 首頁 + 下載按鈕 | 無 |
| 2 | `/for-business/pricing` | 訂閱方案 | `GET /api/subscription-plans` |
| 3 | `/merchant/login` | 商家登入 | `POST /api/auth/login` |
| 4 | `/merchant/dashboard` | 訂閱狀態 | `GET /api/merchant/subscription` |
| 5 | `/explore` | 城市列表 | `GET /api/seo/cities` ⚠️ 待建 |
| 6 | `/city/[slug]` | 城市詳情 | `GET /api/seo/cities/:slug` ⚠️ 待建 |
| 7 | `/place/[slug]` | 景點詳情 | `GET /api/seo/places/:slug` ⚠️ 待建 |

### Phase 4：各頁面實作要點

#### 4.1 首頁 `/`

```tsx
// app/page.tsx
import { DownloadButton } from '@/components/common/DownloadButton';

export default function HomePage() {
  return (
    <main>
      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-white">
        <div className="text-center max-w-2xl px-4">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            探索世界，從 Mibu 開始
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            行程扭蛋、在地嚮導、安全旅行，一個 App 搞定
          </p>
          <div className="flex justify-center gap-4">
            <DownloadButton platform="ios" />
            <DownloadButton platform="android" />
          </div>
        </div>
      </section>
      
      {/* 商家 CTA */}
      <section className="py-16 bg-slate-900 text-white text-center">
        <h2 className="text-2xl font-bold mb-4">您是商家嗎？</h2>
        <p className="mb-6">加入 Mibu，讓更多旅客發現您的店家</p>
        <Link href="/for-business" className="btn-primary">
          了解商家合作
        </Link>
      </section>
    </main>
  );
}
```

#### 4.2 商家登入 `/merchant/login`

```tsx
// app/merchant/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { DownloadButton } from '@/components/common/DownloadButton';

export default function MerchantLoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const formData = new FormData(e.currentTarget);
    
    try {
      const res = await apiClient<{ token: string; user: any }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password'),
          target_role: 'merchant',
        }),
      });
      
      // Cookie 由後端設定，直接跳轉
      router.push('/merchant/dashboard');
    } catch (err: any) {
      if (err.code === 'PENDING_APPROVAL') {
        setError('帳號審核中，請等待管理員核准');
      } else if (err.code === 'ROLE_MISMATCH') {
        setError('此帳號不是商家帳號，請使用 App 登入');
      } else {
        setError(err.message || '登入失敗');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* 左側品牌區（桌機顯示） */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center">
        <div className="text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Mibu 商家平台</h2>
          <p>管理訂閱，查看權限</p>
        </div>
      </div>
      
      {/* 右側登入表單 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6">商家登入</h1>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded mb-4">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">電子郵件</label>
              <input
                type="email"
                name="email"
                required
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">密碼</label>
              <input
                type="password"
                name="password"
                required
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-2 rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? '登入中...' : '登入'}
            </button>
          </form>
          
          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p className="mb-4">還沒有商家帳號？</p>
            <p className="mb-2">請下載 App 完成商家註冊</p>
            <div className="flex justify-center gap-2">
              <DownloadButton platform="ios" className="text-xs px-3 py-1" />
              <DownloadButton platform="android" className="text-xs px-3 py-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### 4.3 商家後台 `/merchant/dashboard`

```tsx
// app/merchant/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';

interface Subscription {
  tier: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export default function MerchantDashboardPage() {
  const router = useRouter();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient<{ subscription: Subscription }>('/api/merchant/subscription')
      .then((res) => setSubscription(res.subscription))
      .catch(() => router.push('/merchant/login'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8">載入中...</div>;
  }

  const tierLabels: Record<string, string> = {
    free: '免費方案',
    pro: 'Pro 專業版',
    premium: 'Premium 旗艦版',
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    active: { label: '有效', color: 'bg-green-100 text-green-800' },
    past_due: { label: '付款逾期', color: 'bg-yellow-100 text-yellow-800' },
    cancelled: { label: '已取消', color: 'bg-red-100 text-red-800' },
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-8">商家後台</h1>
      
      {/* 訂閱狀態卡片 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">訂閱狀態</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">當前方案</p>
            <p className="text-xl font-bold">{tierLabels[subscription?.tier || 'free']}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">狀態</p>
            <span className={`inline-block px-2 py-1 rounded text-sm ${statusLabels[subscription?.status || 'active'].color}`}>
              {statusLabels[subscription?.status || 'active'].label}
            </span>
          </div>
          {subscription?.currentPeriodEnd && (
            <div>
              <p className="text-sm text-muted-foreground">到期日</p>
              <p>{new Date(subscription.currentPeriodEnd).toLocaleDateString('zh-TW')}</p>
            </div>
          )}
        </div>
        
        {subscription?.tier === 'free' && (
          <div className="mt-6">
            <Link href="/for-business/pricing" className="btn-primary">
              升級方案
            </Link>
          </div>
        )}
      </div>
      
      {/* 功能說明 */}
      <div className="mt-8 text-center text-muted-foreground">
        <p>商家認領、數據報表等功能請使用 App</p>
        <div className="flex justify-center gap-4 mt-4">
          <DownloadButton platform="ios" />
          <DownloadButton platform="android" />
        </div>
      </div>
    </div>
  );
}
```

### Phase 5：SEO 頁面實作（待後端 API）

> ⚠️ 以下頁面需等待後端建立 SEO API 後才能實作

#### 5.1 城市列表 `/explore`

```tsx
// app/explore/page.tsx
import { apiClient } from '@/lib/api/client';
import { CityCard } from '@/components/seo/CityCard';

export const revalidate = 3600; // ISR: 每小時重新驗證

export default async function ExplorePage() {
  const { cities } = await apiClient<{ cities: City[] }>('/api/seo/cities');
  
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">探索城市</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cities.map((city) => (
          <CityCard key={city.slug} city={city} />
        ))}
      </div>
      
      {/* 下載 CTA */}
      <div className="mt-16 text-center bg-slate-100 rounded-lg p-8">
        <h2 className="text-xl font-bold mb-4">想要更多精彩行程？</h2>
        <p className="text-muted-foreground mb-6">下載 Mibu App，讓 AI 幫你規劃完美旅程</p>
        <div className="flex justify-center gap-4">
          <DownloadButton platform="ios" />
          <DownloadButton platform="android" />
        </div>
      </div>
    </main>
  );
}
```

---

## 商家功能範圍說明（2026-01-06 更新）

### 官網商家功能（精簡版）

| 功能 | 說明 | 備註 |
|------|------|------|
| 登入 | Email + 密碼登入 | 無帳號 → 引導下載 App 註冊 |
| 訂閱購買 | 選擇方案 → Stripe/Recur 付款 | Pro / Premium |
| 查看訂閱 | 顯示當前方案、狀態、到期日 | 唯讀 |
| 取消訂閱 | 取消自動續訂 | 期限內仍可使用 |

### 僅在 App 中提供的功能

| 功能 | 說明 |
|------|------|
| 商家註冊 | 填寫商家資訊、等待審核 |
| 店家認領 | 搜尋並認領自己的店家 |
| 優惠券管理 | 建立、編輯、查看核銷 |
| 數據報表 | 曝光次數、點擊率、收藏數 |
| 核銷碼設定 | 每日核銷碼生成與驗證 |

---

## 版本紀錄

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| 2.2 | 2026-01-06 | 新增 SEO API 規格、下載按鈕元件、完整實作指令集、簡化商家功能範圍 |
| 2.1 | 2026-01-06 | 新增統一身份認證架構（Google/Apple OAuth、auth_identities 表、帳號連結 API 規格） |
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

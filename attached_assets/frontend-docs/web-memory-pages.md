# 頁面結構記憶庫 (官網)

## 頁面清單

### 公開頁面（無需登入）

| 路由 | 頁面 | 渲染策略 | 說明 |
|------|------|---------|------|
| `/` | 首頁 | SSG | 品牌落地頁 |
| `/features` | 功能介紹 | SSG | 產品功能說明 |
| `/pricing` | 訂閱方案 | SSG | 商家訂閱價格表 ⭐ |
| `/about` | 關於我們 | SSG | 公司介紹 |
| `/contact` | 聯絡我們 | SSG | 聯絡表單 |
| `/privacy` | 隱私政策 | SSG | 法律文件 |
| `/terms` | 服務條款 | SSG | 法律文件 |

### SEO 程式化頁面

| 路由 | 頁面 | 渲染策略 | 說明 |
|------|------|---------|------|
| `/city/[slug]` | 城市頁 | ISR (1hr) | 動態生成城市旅遊指南 |
| `/place/[slug]` | 景點頁 | ISR (1hr) | 動態生成景點詳情 |
| `/category/[slug]` | 分類頁 | ISR (1hr) | 景點分類列表 |

### 商家專區（需登入）

| 路由 | 頁面 | 渲染策略 | 說明 |
|------|------|---------|------|
| `/merchant/login` | 商家登入 | SSR | 登入/註冊 |
| `/merchant/dashboard` | 商家後台 | SSR | 數據總覽 |
| `/merchant/subscription` | 訂閱管理 | SSR | 查看/管理訂閱 ⭐ |
| `/merchant/subscription/success` | 付款成功 | SSR | 訂閱成功回調 ⭐ |
| `/merchant/subscription/cancel` | 付款取消 | SSR | 訂閱取消回調 |
| `/merchant/places` | 我的店家 | SSR | 店家列表 |
| `/merchant/coupons` | 優惠券管理 | SSR | 優惠券 CRUD |
| `/merchant/analytics` | 數據報表 | SSR | 流量/轉換分析 |

---

## 渲染策略

### SSG (Static Site Generation)
```tsx
// 完全靜態，建構時生成
export default function Page() {
  return <div>...</div>;
}
```

### ISR (Incremental Static Regeneration)
```tsx
// 每小時重新驗證
export const revalidate = 3600;

export default async function CityPage({ params }) {
  const city = await fetchCity(params.slug);
  return <div>...</div>;
}
```

### SSR (Server Side Rendering)
```tsx
// 每次請求都在伺服器渲染
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/merchant/login');
  return <div>...</div>;
}
```

---

## 導航結構

### 公開導航 (Header)
```tsx
const publicNav = [
  { label: '功能', href: '/features' },
  { label: '方案', href: '/pricing' },
  { label: '關於', href: '/about' },
  { label: '商家登入', href: '/merchant/login', variant: 'outline' },
];
```

### 商家後台側邊欄
```tsx
const merchantNav = [
  { label: '總覽', href: '/merchant/dashboard', icon: HomeIcon },
  { label: '我的店家', href: '/merchant/places', icon: StoreIcon },
  { label: '優惠券', href: '/merchant/coupons', icon: TicketIcon },
  { label: '數據報表', href: '/merchant/analytics', icon: ChartIcon },
  { label: '訂閱管理', href: '/merchant/subscription', icon: CreditCardIcon },
];
```

---

## Layout 結構

```
app/
├── layout.tsx                    // 根 Layout（含全域樣式、字體）
├── (public)/
│   ├── layout.tsx                // 公開頁面 Layout（Header + Footer）
│   ├── page.tsx                  // 首頁
│   ├── features/page.tsx
│   ├── pricing/page.tsx
│   └── about/page.tsx
├── (seo)/
│   ├── layout.tsx                // SEO 頁面 Layout
│   ├── city/[slug]/page.tsx
│   └── place/[slug]/page.tsx
└── merchant/
    ├── layout.tsx                // 商家後台 Layout（Sidebar）
    ├── login/page.tsx
    ├── dashboard/page.tsx
    └── subscription/
        ├── page.tsx
        ├── success/page.tsx
        └── cancel/page.tsx
```

---

## 中介軟體 (Middleware)

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 商家專區需要登入
  if (pathname.startsWith('/merchant') && !pathname.includes('/login')) {
    const token = request.cookies.get('auth_token');
    if (!token) {
      return NextResponse.redirect(new URL('/merchant/login', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/merchant/:path*'],
};
```

# 官方網站記憶庫 (Web Official Module)

## 模組範圍
Mibu 官方網站前端，負責 SEO 內容展示、商家訂閱購買、品牌行銷。

---

## 技術棧

| 項目 | 選擇 | 說明 |
|------|------|------|
| 框架 | Next.js 15 (App Router) | SSG/ISR 支援 SEO |
| 樣式 | Tailwind CSS | 與 App 風格一致 |
| 狀態管理 | React Query | API 快取 |
| 金流 | Stripe + Recur SDK | 海外+台灣 |
| 部署 | Vercel 或 Replit | 待定 |

---

## 頁面結構

### 公開頁面（SEO）
```
/                           # 首頁
/about                      # 關於 Mibu
/features                   # 功能介紹
/pricing                    # 價格方案

# 程式化 SEO 頁面
/itinerary                  # 行程列表（分頁）
/itinerary/[slug]           # 行程詳情（SSG）
/city/[city]                # 城市頁面
/city/[city]/[district]     # 區域頁面

# SEO 資源
/sitemap.xml                # 動態 Sitemap
/robots.txt                 # 爬蟲規則
```

### 商家專區
```
/merchant/login             # 商家登入
/merchant/register          # 商家註冊
/merchant/dashboard         # 儀表板
/merchant/subscription      # 訂閱管理
/merchant/checkout          # 訂閱購買
/merchant/checkout/success  # 購買成功
/merchant/checkout/cancel   # 購買取消
```

---

## 與後端 API 整合

### 認證方式

| 場景 | 認證 | Header |
|------|------|--------|
| SEO 頁面 | Service Token | `X-Service-Token: {token}` |
| 商家操作 | JWT | `Authorization: Bearer {jwt}` |

### SEO API

```typescript
// 取得行程列表
GET /api/seo/itineraries
Query: { page, limit, city, category }
Response: {
  itineraries: SeoItinerary[];
  pagination: { page, limit, total };
}

// 取得單一行程
GET /api/seo/itineraries/:slug
Response: SeoItinerary

// 取得 Sitemap 資料
GET /api/seo/sitemap
Response: { urls: SitemapUrl[] }
```

### 商家訂閱 API

```typescript
// 取得當前訂閱
GET /api/merchant/subscription
Response: {
  merchantTier: 'free' | 'pro' | 'premium';
  merchantTierExpiresAt: string | null;
  placeSubscriptions: PlaceSubscription[];
}

// 建立訂閱結帳
POST /api/merchant/subscription/checkout
Body: {
  type: 'merchant_tier' | 'place_card_tier';
  tier: 'pro' | 'premium';
  placeId?: number;  // 行程卡訂閱時需要
  provider?: 'stripe' | 'recur';  // 自動偵測或指定
}
Response: {
  checkoutUrl: string;  // Stripe/Recur 結帳頁面
  sessionId: string;
}

// 取消訂閱
POST /api/merchant/subscription/cancel
Body: { subscriptionId: number }
Response: { success: true }
```

---

## 金流整合

### 國家偵測邏輯
```typescript
// 根據 IP 或用戶設定判斷
const getPaymentProvider = (country: string) => {
  if (country === 'TW') return 'recur';
  return 'stripe';
};
```

### Stripe 整合
```typescript
// 使用 @stripe/stripe-js
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// 跳轉結帳
const stripe = await stripePromise;
await stripe.redirectToCheckout({ sessionId });
```

### Recur 整合
```html
<!-- CDN 引入 -->
<script src="https://unpkg.com/recur-tw@0.7.5/dist/recur.umd.js"></script>

<!-- 或使用 Web Component -->
<recur-checkout
  publishable-key="pk_xxx"
  product-id="prod_xxx"
  success-url="https://mibu.tw/merchant/checkout/success"
  cancel-url="https://mibu.tw/merchant/checkout/cancel"
  button-text="訂閱方案"
/>
```

---

## SEO 優化

### Meta Tags
```tsx
// app/itinerary/[slug]/page.tsx
export async function generateMetadata({ params }) {
  const itinerary = await fetchItinerary(params.slug);
  return {
    title: itinerary.title,
    description: itinerary.metaDescription,
    keywords: itinerary.seoKeywords,
    openGraph: {
      title: itinerary.title,
      description: itinerary.metaDescription,
      type: 'article',
    },
  };
}
```

### Schema.org JSON-LD
```tsx
// 行程頁面結構化資料
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TouristTrip',
  name: itinerary.title,
  description: itinerary.metaDescription,
  touristType: itinerary.targetAudience,
  itinerary: {
    '@type': 'ItemList',
    itemListElement: places.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'TouristAttraction',
        name: p.name,
        address: p.address,
      },
    })),
  },
};
```

### Sitemap 生成
```typescript
// app/sitemap.ts
export default async function sitemap() {
  const itineraries = await fetchAllItineraries();
  
  return [
    { url: 'https://mibu.tw', lastModified: new Date() },
    ...itineraries.map(i => ({
      url: `https://mibu.tw/itinerary/${i.slug}`,
      lastModified: i.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    })),
  ];
}
```

---

## 設計規範

### 品牌色彩
```css
:root {
  --primary: #FF6B6B;      /* Mibu 主色 */
  --secondary: #4ECDC4;    /* 輔助色 */
  --accent: #FFE66D;       /* 強調色 */
  --dark: #2C3E50;         /* 深色文字 */
  --light: #F8F9FA;        /* 淺色背景 */
}
```

### 響應式斷點
```css
/* Tailwind 預設 */
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

---

## 環境變數

```bash
# 後端 API
NEXT_PUBLIC_API_URL=https://mibu-backend.replit.app
SEO_SERVICE_TOKEN=xxx

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_xxx

# Recur
NEXT_PUBLIC_RECUR_PUBLISHABLE_KEY=pk_xxx

# Analytics
NEXT_PUBLIC_GA_ID=G-xxx

# 網站
NEXT_PUBLIC_SITE_URL=https://mibu.tw
```

---

## 待開發功能

- [ ] Next.js 15 專案建置
- [ ] SEO 行程頁面（SSG）
- [ ] 商家登入/註冊
- [ ] 訂閱購買流程
- [ ] Stripe 結帳整合
- [ ] Recur 結帳整合
- [ ] 動態 Sitemap
- [ ] Google Analytics

---

## Changelog

| 日期 | 變更內容 |
|------|---------|
| 2026-01-05 | 初版記憶庫建立 |

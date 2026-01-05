# SEO 策略記憶庫 (官網)

## SEO 目標
- 程式化生成城市/景點頁面吸引自然流量
- 確保所有公開頁面可被搜尋引擎索引
- 優化 Core Web Vitals 指標

---

## Meta Tags 規範

### 基礎 Meta
```tsx
// app/layout.tsx
export const metadata: Metadata = {
  title: {
    default: 'Mibu - 自由行旅遊安全平台',
    template: '%s | Mibu',
  },
  description: '專為自由行旅客打造的旅遊 App，行程扭蛋、在地策劃師，讓旅程更精彩',
  keywords: ['自由行', '旅遊', '行程規劃', '旅遊安全', '在地嚮導'],
  authors: [{ name: 'Mibu' }],
  openGraph: {
    type: 'website',
    locale: 'zh_TW',
    siteName: 'Mibu',
  },
  twitter: {
    card: 'summary_large_image',
  },
};
```

### 動態頁面 Meta
```tsx
// app/city/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const city = await fetchCity(params.slug);
  
  return {
    title: `${city.name}旅遊指南 - 必去景點、美食推薦`,
    description: `探索${city.name}最熱門的旅遊景點、在地美食、住宿推薦。Mibu 為您精選${city.placeCount}個景點。`,
    openGraph: {
      title: `${city.name}旅遊指南`,
      description: `探索${city.name}最熱門的旅遊景點`,
      images: [city.coverImage],
    },
  };
}
```

---

## 結構化資料 (JSON-LD)

### 組織資訊
```tsx
// components/seo/OrganizationSchema.tsx
export function OrganizationSchema() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Mibu',
          url: 'https://mibu.tw',
          logo: 'https://mibu.tw/logo.png',
          sameAs: [
            'https://facebook.com/mibu',
            'https://instagram.com/mibu',
          ],
        }),
      }}
    />
  );
}
```

### 景點資訊
```tsx
// components/seo/PlaceSchema.tsx
export function PlaceSchema({ place }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'TouristAttraction',
          name: place.name,
          description: place.description,
          image: place.images,
          address: {
            '@type': 'PostalAddress',
            addressLocality: place.city,
            addressCountry: 'TW',
          },
          geo: {
            '@type': 'GeoCoordinates',
            latitude: place.latitude,
            longitude: place.longitude,
          },
          aggregateRating: place.rating ? {
            '@type': 'AggregateRating',
            ratingValue: place.rating,
            reviewCount: place.reviewCount,
          } : undefined,
        }),
      }}
    />
  );
}
```

### 文章/指南
```tsx
// components/seo/ArticleSchema.tsx
export function ArticleSchema({ article }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: article.title,
          description: article.excerpt,
          image: article.coverImage,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt,
          author: {
            '@type': 'Organization',
            name: 'Mibu',
          },
        }),
      }}
    />
  );
}
```

---

## Sitemap

### 靜態 Sitemap
```typescript
// app/sitemap.ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://mibu.tw';
  
  // 靜態頁面
  const staticPages = [
    { url: baseUrl, lastModified: new Date(), priority: 1 },
    { url: `${baseUrl}/features`, lastModified: new Date(), priority: 0.8 },
    { url: `${baseUrl}/pricing`, lastModified: new Date(), priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: new Date(), priority: 0.5 },
  ];
  
  // 動態城市頁
  const cities = await fetchAllCities();
  const cityPages = cities.map(city => ({
    url: `${baseUrl}/city/${city.slug}`,
    lastModified: city.updatedAt,
    priority: 0.7,
  }));
  
  // 動態景點頁
  const places = await fetchAllPlaces();
  const placePages = places.map(place => ({
    url: `${baseUrl}/place/${place.slug}`,
    lastModified: place.updatedAt,
    priority: 0.6,
  }));
  
  return [...staticPages, ...cityPages, ...placePages];
}
```

---

## Robots.txt

```typescript
// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/merchant/', '/api/'],
    },
    sitemap: 'https://mibu.tw/sitemap.xml',
  };
}
```

---

## 圖片優化

```tsx
// 使用 Next.js Image 組件
import Image from 'next/image';

<Image
  src={place.coverImage}
  alt={`${place.name} 景點照片`}
  width={800}
  height={600}
  priority={isAboveFold}
  placeholder="blur"
  blurDataURL={place.blurHash}
/>
```

---

## Core Web Vitals 優化

### LCP (Largest Contentful Paint)
- 首屏圖片使用 `priority` 屬性
- 字體使用 `next/font` 預載

### FID (First Input Delay)
- 延遲載入非關鍵 JS
- 使用 `dynamic` import

### CLS (Cumulative Layout Shift)
- 圖片設定固定寬高
- 預留載入骨架空間

```tsx
// 骨架屏範例
function PlaceCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-gray-200 h-48 rounded-lg" />
      <div className="mt-4 h-4 bg-gray-200 rounded w-3/4" />
      <div className="mt-2 h-4 bg-gray-200 rounded w-1/2" />
    </div>
  );
}
```

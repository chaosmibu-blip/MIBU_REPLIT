# 官方網站記憶庫 (Web Official Module)

## 模組範圍
Mibu 官方網站前端，負責 SEO 內容展示、商家訂閱購買、品牌行銷。

## ⚡ 施工文檔（2026-01-06 整合版）

> **唯一文檔**：`docs/官網前端施工手冊.md`
> 
> 包含：SEO 頁面 + 商家功能 + API 規格 + 完整程式碼 + 測試清單

---

## 技術棧

| 項目 | 選擇 | 說明 |
|------|------|------|
| 框架 | Next.js 15 (App Router) | SSR/SSG 支援 |
| 樣式 | Tailwind CSS 3.x | 響應式設計 |
| UI 元件 | shadcn/ui | 可客製化元件庫 |
| 狀態管理 | TanStack Query 5.x | API 快取 |
| 表單 | React Hook Form + Zod | 驗證 |
| 金流 | Stripe + Recur SDK | 雙軌金流 |
| 部署 | Replit | 已建立專案 |

---

## 頁面結構

### 公開頁面

| 路由 | 說明 | 渲染方式 |
|------|------|---------|
| `/` | 首頁 | SSG |
| `/for-business` | 商家合作頁 | SSG |
| `/for-business/pricing` | 訂閱方案頁 | SSG + ISR |
| `/explore` | 城市列表 | SSG + ISR |
| `/city/[slug]` | 城市詳情 | SSG + ISR |
| `/place/[id]` | 景點詳情 | SSG + ISR |
| `/trips` | 行程列表 | SSG + ISR |
| `/trip/[id]` | 行程詳情 | SSG + ISR |

### 商家專區（需登入）

| 路由 | 說明 |
|------|------|
| `/merchant/login` | 商家登入 |
| `/merchant/dashboard` | 商家後台 |
| `/merchant/subscription/success` | 購買成功 |
| `/merchant/subscription/cancel` | 購買取消 |

---

## 官網記憶庫索引

官網需建立以下記憶庫（存放於官網專案 `docs/` 目錄）：

| 檔案 | 職權範圍 |
|------|---------|
| `memory-web-pages.md` | 頁面結構、路由定義 |
| `memory-web-components.md` | 共用元件庫 |
| `memory-web-api.md` | API 整合、hook 定義 |
| `memory-web-auth.md` | 認證機制（Cookie JWT） |
| `memory-web-payment.md` | 金流整合（Stripe/Recur） |
| `memory-web-seo.md` | SEO 頁面、Meta 設定 |

---

## 與後端 API 整合

### 後端 URL

| 環境 | URL |
|------|-----|
| 開發 | `https://591965a7-25f6-479c-b527-3890b1193c21-00-1m08cwv9a4rev.picard.replit.dev` |
| 生產 | `https://gacha-travel--s8869420.replit.app` |

### 認證方式

| 項目 | 值 |
|------|-----|
| Cookie 名稱 | `auth_token` |
| 類型 | HttpOnly, Secure |
| 有效期 | 7 天 |
| SameSite | Lax |

### 核心 API 端點

#### 公開 API

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/subscription-plans` | 訂閱方案列表（動態） |
| GET | `/api/seo/cities` | 城市列表 |
| GET | `/api/seo/cities/:slug` | 城市詳情 |
| GET | `/api/seo/places/by-id/:id` | 景點詳情（推薦，使用 ID） |
| GET | `/api/seo/places/:slug?city=xxx` | 景點詳情（使用 slug） |
| GET | `/api/seo/places?city=xxx` | 景點列表（搜尋/篩選） |

#### OAuth 登入 API（2026-01-06 更新）

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/auth/google` | Google 登入（已註冊商家可用） |
| POST | `/api/auth/apple` | Apple 登入（已註冊商家可用） |

**OAuth 請求格式**：
```json
{
  "idToken": "xxx",
  "targetPortal": "merchant"
}
```

**限制**：新商家/專員必須先用 Email 註冊，之後可用 OAuth 登入。

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

---

## 金流整合

### 雙軌金流

| 金流 | 適用場景 | 整合方式 |
|------|---------|---------|
| Stripe | 海外用戶 | Checkout Session 跳轉 |
| Recur | 台灣用戶 | SDK + redirectToCheckout |

### Recur SDK 載入

```html
<Script 
  src="https://unpkg.com/recur-tw@0.11.0/dist/recur.umd.js"
  strategy="beforeInteractive"
/>
```

### 結帳流程

1. 用戶選擇方案 + 金流
2. POST /api/merchant/subscription/checkout
3. Stripe → 跳轉 Checkout 頁面
4. Recur → 使用 SDK redirectToCheckout
5. 成功 → /merchant/subscription/success
6. 取消 → /merchant/subscription/cancel

---

## UI/UX 設計規範

### 響應式斷點

| 斷點 | 寬度 | 用途 |
|------|------|------|
| sm | 640px | 手機橫向 |
| md | 768px | 平板 |
| lg | 1024px | 筆電 |
| xl | 1280px | 桌機 |

### 頁面佈局

#### 訂閱方案頁

- 手機 (<768px)：單欄堆疊，推薦方案置頂
- 平板/桌機 (≥768px)：三欄並排

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {plans.map((plan) => (
    <PricingCard key={plan.tier} plan={plan} />
  ))}
</div>
```

#### 登入頁

- 手機：全寬表單，Logo 上方
- 桌機：左側品牌區 + 右側登入表單

```tsx
<div className="min-h-screen flex">
  <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center">
    <BrandIllustration />
  </div>
  <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
    <LoginForm className="w-full max-w-md" />
  </div>
</div>
```

#### 商家後台

- 手機：底部導航或漢堡選單
- 桌機：左側 Sidebar + 右側內容

---

## SEO 規範

### Meta Tags 範本

```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  const city = await getCityData(params.slug);
  return {
    title: `${city.name} 必去景點推薦 | Mibu`,
    description: `探索 ${city.name} 最熱門的景點...`,
    openGraph: {
      title: `${city.name} 必去景點推薦 | Mibu`,
      description: `...`,
      images: [city.coverImage],
    },
  };
}
```

### ISR 設定

```typescript
export const revalidate = 3600; // 每小時重新驗證
```

---

## 環境變數

```bash
# 後端 API
NEXT_PUBLIC_API_URL=後端 URL

# Recur
NEXT_PUBLIC_RECUR_PUBLISHABLE_KEY=pk_xxx

# 網站
NEXT_PUBLIC_SITE_URL=https://mibu.tw
```

---

## 開發指令

```bash
# 專案初始化
npx create-next-app@latest mibu-web --typescript --tailwind --eslint --app --src-dir
npm install @tanstack/react-query react-hook-form zod @hookform/resolvers lucide-react framer-motion
npx shadcn@latest init
npx shadcn@latest add button card input label toast tabs accordion dialog

# 開發
npm run dev

# 建構
npm run build
```

---

## 待開發功能

- [ ] Next.js 15 專案建置
- [ ] 首頁設計
- [ ] 訂閱方案頁（動態載入）
- [ ] 商家登入/後台
- [ ] Stripe 結帳整合
- [ ] Recur 結帳整合
- [ ] SEO 城市/景點頁面
- [ ] 動態 Sitemap

---

## 📱 給前端的同步指令（2026-01-09 更新）

### 新增：退款與取消訂閱功能

商家登入後的訂閱管理頁面需新增以下功能：

#### 1. 退款資格檢查 API

```typescript
// hooks/useRefundEligibility.ts
import { useQuery } from '@tanstack/react-query';

interface RefundEligibility {
  subscriptionId: number;
  provider: 'stripe' | 'recur';
  tier: string;
  status: string;
  createdAt: string;
  daysSinceCreation: number;
  refundEligibility: {
    isEligible: boolean;
    reason: string;
    hoursRemaining: number;
    daysRemaining: number;
  };
  cancellationPolicy: {
    canCancel: boolean;
    note: string;
  };
}

export function useRefundEligibility(subscriptionId: number) {
  return useQuery<RefundEligibility>({
    queryKey: ['refund-eligibility', subscriptionId],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/merchant/subscription/refund-eligibility?subscriptionId=${subscriptionId}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to check eligibility');
      return res.json();
    },
    enabled: !!subscriptionId,
  });
}
```

#### 2. 申請退款 API

```typescript
// hooks/useRefundRequest.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface RefundRequestInput {
  subscriptionId: number;
  reason: string; // 至少 10 字
}

interface RefundResponse {
  success: boolean;
  message: string;
  refundStatus: 'approved' | 'pending_manual_review' | 'not_eligible' | 'error';
  refundId?: string;
  requestId?: number;
  eligibility: any;
  contactEmail?: string;
}

export function useRefundRequest() {
  const queryClient = useQueryClient();
  
  return useMutation<RefundResponse, Error, RefundRequestInput>({
    mutationFn: async (data) => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/merchant/subscription/refund-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['refund-eligibility'] });
    },
  });
}
```

#### 3. UI 建議放置位置

```
/merchant/dashboard
  └── 訂閱管理區塊
       ├── 目前方案資訊
       ├── 付款歷史
       └── 📌 訂閱設定（新增）
            ├── [取消訂閱] 按鈕
            └── [申請退款] 按鈕（7天內顯示）
```

#### 4. 退款申請 UI 元件

```tsx
// components/RefundRequestDialog.tsx
function RefundRequestDialog({ subscriptionId }: { subscriptionId: number }) {
  const { data: eligibility } = useRefundEligibility(subscriptionId);
  const refundMutation = useRefundRequest();
  const [reason, setReason] = useState('');
  
  if (!eligibility) return null;
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!eligibility.refundEligibility.isEligible}>
          申請退款
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>申請退款</DialogTitle>
        </DialogHeader>
        
        {eligibility.refundEligibility.isEligible ? (
          <>
            <p className="text-sm text-green-600">
              ✓ {eligibility.refundEligibility.reason}
              （剩餘 {eligibility.refundEligibility.hoursRemaining} 小時）
            </p>
            <Textarea
              placeholder="請說明退款原因（至少 10 字）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={10}
            />
            <Button 
              onClick={() => refundMutation.mutate({ subscriptionId, reason })}
              disabled={reason.length < 10 || refundMutation.isPending}
            >
              {refundMutation.isPending ? '處理中...' : '確認申請退款'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            {eligibility.refundEligibility.reason}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

#### 5. cURL 測試範例

```bash
# 檢查退款資格
curl -X GET "https://api.mibu-travel.com/api/merchant/subscription/refund-eligibility?subscriptionId=1" \
  -H "Cookie: connect.sid=xxx"

# 申請退款
curl -X POST "https://api.mibu-travel.com/api/merchant/subscription/refund-request" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=xxx" \
  -d '{"subscriptionId": 1, "reason": "產品不符合需求，希望申請退款"}'
```

---

## Changelog

| 日期 | 變更內容 |
|------|---------|
| 2026-01-09 | 新增：退款與取消訂閱 API 前端同步指令 |
| 2026-01-05 | 重構：整合完整開發藍圖，新增記憶庫索引、UI/UX 規範、指令集 |
| 2026-01-05 | 修正：金流為用戶自選（非自動導向） |
| 2026-01-05 | 初版記憶庫建立 |

# 專員端記憶庫 (Specialist Portal Module)

## 模組範圍
旅遊規劃專員的服務管理、訂單處理、客戶溝通。

## 相關資料表

### specialists (專員帳號)
```typescript
{
  id: number;
  userId: string;           // 關聯 users 表
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  specialties: string[];    // 專長領域
  languages: string[];      // 服務語言
  status: 'pending' | 'active' | 'suspended';
  rating?: number;          // 平均評分
  totalOrders: number;
  isVerified: boolean;
}
```

### service_plans (服務方案)
```typescript
{
  id: number;
  specialistId: number;
  title: string;
  description?: string;
  priceType: 'fixed' | 'hourly' | 'per_day';
  price: number;
  currency: string;
  deliveryDays: number;     // 交付天數
  maxRevisions: number;     // 修改次數
  isActive: boolean;
}
```

### service_orders (服務訂單)
```typescript
{
  id: number;
  servicePlanId: number;
  customerId: string;       // 客戶 userId
  specialistId: number;
  status: 'pending' | 'accepted' | 'in_progress' | 'delivered' | 'completed' | 'cancelled';
  requirements?: string;    // 客戶需求
  deliverables?: string;    // 交付內容
  price: number;
  paidAt?: Date;
  completedAt?: Date;
}
```

### service_relations (專員關係)
```typescript
{
  id: number;
  specialistId: number;
  relationType: 'region' | 'category';
  relationId: number;       // region.id 或 category.id
}
// 用於標記專員服務的區域或類別專長
```

### planners (規劃師擴展)
```typescript
{
  id: number;
  specialistId: number;
  certifications?: string[];
  portfolioUrls?: string[];
  responseTime: number;     // 平均回覆時間（分鐘）
}
```

## 主要 API

### 專員管理
- `POST /api/specialists/register` - 專員申請
- `GET /api/specialists/me` - 取得專員資料
- `PATCH /api/specialists/me` - 更新專員資料
- `GET /api/specialists/:id` - 公開專員頁面

### 服務方案
- `POST /api/specialists/plans` - 建立服務方案
- `GET /api/specialists/plans` - 列出服務方案
- `PATCH /api/specialists/plans/:id` - 更新方案
- `DELETE /api/specialists/plans/:id` - 刪除方案

### 訂單管理
- `GET /api/specialists/orders` - 列出訂單
- `PATCH /api/specialists/orders/:id/accept` - 接受訂單
- `PATCH /api/specialists/orders/:id/deliver` - 交付訂單
- `POST /api/specialists/orders/:id/message` - 發送訊息

### 客戶端
- `GET /api/services/search` - 搜尋服務
- `GET /api/services/:planId` - 服務詳情
- `POST /api/services/:planId/order` - 下單
- `POST /api/orders/:id/review` - 評價

## 與行程的整合
- 專員可直接編輯客戶的 trip_plan
- 交付物可關聯到 trip_plan_id
- 支援即時協作編輯

## 專員等級
| 等級 | 條件 | 權益 |
|------|------|------|
| 新手 | 新註冊 | 基礎功能 |
| 認證 | 完成 10 單 + 4.5 評分 | 認證標章、優先曝光 |
| 專家 | 完成 50 單 + 4.8 評分 | 首頁推薦、專屬客服 |

## 待開發功能
- [ ] 即時聊天系統
- [ ] 視訊諮詢
- [ ] 專員排程日曆
- [ ] 自動分潤系統

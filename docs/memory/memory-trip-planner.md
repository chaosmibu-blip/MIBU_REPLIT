# 旅程策劃記憶庫 (Trip Planner Module)

## 模組範圍
管理用戶的多日行程規劃，包含行程建立、天數管理、活動安排、同伴邀請。

## 相關資料表

### trip_plans (行程計畫)
```typescript
{
  id: number;
  userId: string;
  title: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status: 'draft' | 'planning' | 'confirmed' | 'completed';
  isPublic: boolean;
  coverImageUrl?: string;
}
```

### trip_days (行程天數)
```typescript
{
  id: number;
  tripPlanId: number;
  dayNumber: number;
  date?: Date;
  title?: string;
  notes?: string;
}
```

### trip_activities (行程活動)
```typescript
{
  id: number;
  tripDayId: number;
  placeId?: number;
  orderIndex: number;
  startTime?: string;
  endTime?: string;
  notes?: string;
  type: 'place' | 'transport' | 'custom';
}
```

### travel_companions (旅伴)
```typescript
{
  id: number;
  tripPlanId: number;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: Date;
}
```

### companion_invites (旅伴邀請)
```typescript
{
  id: number;
  tripPlanId: number;
  inviterId: string;
  inviteeEmail?: string;
  inviteCode: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: Date;
}
```

## 主要 API

### 行程 CRUD
- `POST /api/trip-plans` - 建立行程
- `GET /api/trip-plans` - 列出用戶行程
- `GET /api/trip-plans/:id` - 取得行程詳情
- `PATCH /api/trip-plans/:id` - 更新行程
- `DELETE /api/trip-plans/:id` - 刪除行程

### 天數管理
- `POST /api/trip-plans/:id/days` - 新增天數
- `PATCH /api/trip-days/:dayId` - 更新天數
- `DELETE /api/trip-days/:dayId` - 刪除天數

### 活動管理
- `POST /api/trip-days/:dayId/activities` - 新增活動
- `PATCH /api/trip-activities/:activityId` - 更新活動
- `DELETE /api/trip-activities/:activityId` - 刪除活動
- `POST /api/trip-days/:dayId/reorder` - 重新排序

### 旅伴功能
- `POST /api/trip-plans/:id/invite` - 發送邀請
- `POST /api/trip-plans/join/:inviteCode` - 接受邀請
- `GET /api/trip-plans/:id/companions` - 列出旅伴
- `DELETE /api/trip-plans/:id/companions/:odUserId` - 移除旅伴

## 與扭蛋的整合
- 用戶抽到的景點可加入行程
- 從 Itembox 拖曳景點到行程
- 支援一鍵將整個扭蛋結果轉為行程

## 服務購買
- `trip_service_purchases`: 購買額外服務（如專員規劃）
- 關聯到 `service_plans` 和 `specialists`

## 待開發功能
- [ ] 行程分享連結
- [ ] 行程複製
- [ ] AI 行程建議
- [ ] 行程導出 PDF

# 用戶端記憶庫 (User Client Module)

## 模組範圍
旅客 App 的核心功能：認證、個人資料、背包系統、通知、收藏。

## 認證方式

### Apple Sign In (主要)
```typescript
POST /api/auth/apple
Body: { identityToken: string }
Response: { 
  token: string,      // JWT (7 天有效)
  user: User,
  isNewUser: boolean 
}
```

### Google Sign In (計畫中)
```typescript
POST /api/auth/google
Body: { idToken: string }
```

### JWT Token 結構
```typescript
{
  userId: string;
  email: string;
  role: 'user' | 'merchant' | 'specialist' | 'admin';
  iat: number;
  exp: number;  // 7 天
}

// 使用方式
Authorization: Bearer <jwt_token>
```

## 相關資料表

### users (用戶基本資料)
```typescript
{
  id: string;           // Apple/Google userId
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  profileImageUrl?: string;
  createdAt: Date;
  lastLoginAt: Date;
}
```

### user_profiles (用戶詳細資料)
```typescript
{
  id: number;
  userId: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  preferredLanguage: string;
  travelStyle?: string;      // 'adventurer' | 'relaxer' | 'foodie'
  notificationEnabled: boolean;
}
```

### user_inventory (背包系統)
```typescript
{
  id: number;
  userId: string;
  itemType: 'place' | 'coupon';
  itemId: number;           // placeId 或 couponId
  addedAt: Date;
  expiresAt?: Date;         // 優惠券過期時間
  isUsed: boolean;
}

// 容量限制：30 格
```

### user_notifications (通知)
```typescript
{
  id: number;
  userId: string;
  type: 'system' | 'coupon' | 'trip' | 'sos';
  title: string;
  body: string;
  data?: object;
  isRead: boolean;
  createdAt: Date;
}
```

### user_locations (即時位置)
```typescript
{
  id: number;
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  updatedAt: Date;
}
// 用於 SOS 和旅伴追蹤
```

### user_daily_gacha_stats (每日抽卡統計)
```typescript
{
  id: number;
  userId: string;
  date: string;        // YYYY-MM-DD
  pullCount: number;   // 當日已抽次數
}
// 每日上限：36 次
```

## 主要 API

### 認證
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/auth/user | 取得當前用戶 |
| POST | /api/auth/apple | Apple 登入 |
| POST | /api/auth/logout | 登出 |

### 個人資料
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/users/me | 我的資料 |
| PATCH | /api/users/me | 更新資料 |
| POST | /api/users/me/avatar | 上傳頭像 |

### 背包 (Itembox)
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/inventory | 列出背包物品 |
| POST | /api/inventory/add | 加入物品 |
| DELETE | /api/inventory/:id | 移除物品 |
| GET | /api/inventory/count | 物品數量 (用於判斷是否滿) |

### 通知
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/notifications | 通知列表 |
| POST | /api/notifications/:id/read | 標記已讀 |
| POST | /api/notifications/read-all | 全部已讀 |
| GET | /api/notifications/unread-count | 未讀數量 |

### 收藏
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/collections | 我的收藏夾 |
| POST | /api/collections | 建立收藏夾 |
| POST | /api/collections/:id/items | 加入收藏 |
| DELETE | /api/collections/:id/items/:itemId | 移除收藏 |

### 每日額度
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/gacha/quota | 查詢剩餘抽卡額度 |

## 背包系統規則

### 容量
- 最大 30 格
- 景點和優惠券共用空間

### 物品來源
- 扭蛋抽取的景點
- 抽中的優惠券
- 手動加入的景點

### 優惠券過期
- 優惠券有 `expiresAt`
- 過期自動標記為不可用
- 不會自動刪除（保留記錄）

## 每日抽卡限制
```typescript
DAILY_PULL_LIMIT = 36;

// 檢查流程
1. 取得 user_daily_gacha_stats (userId, 今日)
2. 若 pullCount >= 36，拒絕請求
3. 若 pullCount + requestedCount > 36，提示剩餘額度
4. 抽卡成功後，原子更新 pullCount
```

## 用戶等級系統 (計畫中)
| 等級 | 經驗值 | 權益 |
|------|--------|------|
| Lv.1 | 0 | 每日 36 抽 |
| Lv.2 | 500 | 背包 +5 格 |
| Lv.3 | 1500 | 解鎖隱藏景點 |
| Lv.4 | 3000 | 每日 +6 抽 |
| Lv.5 | 5000 | VIP 標章 |

## 與其他模組的關聯
- **扭蛋**: 抽到的景點/優惠券進入背包
- **行程**: 從背包拖曳景點到行程
- **SOS**: 即時位置用於緊急定位
- **商家**: 優惠券核銷

## 待開發功能
- [ ] Google Sign In
- [ ] 用戶等級系統
- [ ] 成就系統
- [ ] 社交功能（追蹤、分享）
- [ ] 推播通知 (APNs)

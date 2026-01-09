# 資料架構記憶庫 (Data Schema)

## 模組範圍
所有資料表的結構、關聯、約束。

## 資料庫資訊
- **類型**: PostgreSQL (Neon-backed)
- **ORM**: Drizzle ORM
- **Schema 定義**: `shared/schema.ts`
- **遷移指令**: `npm run db:push`

## 表格分類 (47 張)

### 1. 地區階層 (Location Hierarchy)
```
countries (國家)
  └── regions (縣市)
       └── districts (鄉鎮區)
```

### 2. 類別階層 (Category Hierarchy)
```
categories (七大類別: 美食、住宿、景點、購物、娛樂設施、生態文化教育、遊程體驗)
  └── subcategories (子類別)
```

### 3. 用戶系統 (User System)
```
users ─┬── user_profiles
       ├── sessions
       ├── user_locations (即時位置)
       ├── user_notifications
       ├── user_inventory (背包)
       └── user_daily_gacha_stats (每日抽卡計數)
```

### 4. 商家系統 (Merchant System)
```
merchants ─┬── merchant_profiles
           ├── merchant_place_links ── merchant_coupons
           ├── merchant_analytics
           ├── merchant_subscriptions ── refund_requests 🆕 2026-01-09
           └── transactions

coupons (用戶持有的優惠券)
  └── coupon_redemptions (核銷記錄)

coupon_rarity_configs
coupon_probability_settings
```

#### refund_requests 表欄位說明（2026-01-09 新增）
```typescript
{
  id: serial PRIMARY KEY;
  subscriptionId: integer REFERENCES merchant_subscriptions(id);
  merchantId: integer REFERENCES merchants(id);
  
  reason: text NOT NULL;           // 用戶提供的退款原因
  status: varchar(20);             // pending | approved | rejected | manual_review | processed
  
  daysSinceSubscription: integer;  // 申請時距訂閱多少天
  isWithin7Days: boolean;          // 是否在 7 天鑑賞期內
  
  provider: varchar(20);           // stripe | recur
  stripeRefundId: varchar(255);    // Stripe 退款 ID
  stripeChargeId: varchar(255);    // 被退款的 charge ID
  refundAmount: integer;           // 退款金額（分為單位）
  refundCurrency: varchar(10);     // TWD
  
  processedBy: varchar(255);       // 處理人員
  processedAt: timestamp;          // 處理時間
  adminNotes: text;                // 客服備註
  
  createdAt: timestamp;
  updatedAt: timestamp;
}

// 索引
IDX_refund_requests_subscription (subscriptionId)
IDX_refund_requests_merchant (merchantId)
IDX_refund_requests_status (status)
IDX_refund_requests_created (createdAt)
```

### 5. 專員系統 (Specialist System)
```
specialists ─┬── service_relations
             ├── service_plans ── service_orders
             └── planners (擴展資料)
```

### 6. 景點資料 (Place Data)
```
places (官方景點庫) ⭐
place_cache (AI 生成快取)
place_drafts (待審核草稿)
place_applications (用戶申請)
place_feedback (問題回報)
```

### 7. 收藏系統 (Collection System)
```
gacha_ai_logs (AI 排序日誌，每輪扭蛋一筆) 🆕 2026-01-03
  └── collections (收藏夾/圖鑑，每景點一筆)
       └── collection_read_status
```

#### gacha_ai_logs 表欄位說明（2026-01-03 新增）
```typescript
{
  id: serial PRIMARY KEY;
  sessionId: varchar(36) NOT NULL;        // 本輪扭蛋唯一識別碼
  userId: varchar REFERENCES users(id);
  city: text NOT NULL;
  district: text;                          // 錨定區域
  requestedCount: integer NOT NULL;
  
  orderedPlaceIds: integer[];              // 排序後的 place IDs
  rejectedPlaceIds: integer[];             // 被 AI 拒絕的 place IDs
  aiReason: text;                          // AI 排序理由
  
  aiModel: text;                           // 使用的模型 (gemini-2.5-flash)
  reorderRounds: integer;                  // 排序花了幾輪 (1-3)
  durationMs: integer;                     // 總花費時間（毫秒）
  
  categoryDistribution: jsonb;             // { 美食: 4, 景點: 2, ... }
  isShortfall: boolean DEFAULT false;
  
  createdAt: timestamp;
}

// 索引
IDX_gacha_ai_logs_user (userId)
IDX_gacha_ai_logs_session (sessionId)
IDX_gacha_ai_logs_created (createdAt)
```

#### collections 表欄位說明
```typescript
{
  id: serial PRIMARY KEY;
  userId: varchar REFERENCES users(id);
  officialPlaceId: integer REFERENCES places(id);
  gachaSessionId: varchar(36);   // 🆕 2026-01-03 關聯 gacha_ai_logs
  placeName: text NOT NULL;
  country: text NOT NULL;
  city: text NOT NULL;
  district: text;
  category: text;
  subcategory: text;
  description: text;
  address: text;
  placeId: text;           // Google Place ID
  rating: text;
  locationLat: text;
  locationLng: text;
  googleTypes: text;
  isCoupon: boolean DEFAULT false;
  couponData: jsonb;       // { title, code, terms }
  wonCouponId: integer REFERENCES coupons(id);
  aiReason: text;          // AI 排序理由（冗餘，可透過 gachaSessionId 查詢）
  collectedAt: timestamp;
}

// 索引
IDX_collections_user_place (userId, placeName, district)
IDX_collections_official_place (officialPlaceId)
IDX_collections_gacha_session (gachaSessionId)   // 🆕 2026-01-03
```

### 8. 行程規劃 (Trip Planning)
```
trip_plans ─┬── trip_days ── trip_activities
            ├── trip_service_purchases
            ├── travel_companions
            └── companion_invites
```

### 9. 交易系統 (Transaction System)
```
transactions
cart_items
commerce_orders
klook_products
place_products
```

### 10. SOS 安全系統
```
sos_events
  └── sos_alerts
```

### 11. 其他
```
announcements (公告)
ad_placements (廣告位)
chat_invites (聊天邀請)
message_highlights (訊息重點)
```

## 關鍵欄位說明

### places 表
```typescript
{
  id: serial PRIMARY KEY;
  placeName: text NOT NULL;
  city: text NOT NULL;
  district: text;
  category: text;           // 七大類：美食、住宿、景點、購物、娛樂設施、生態文化教育、遊程體驗
  subcategory: text;
  googlePlaceId: text UNIQUE;
  googleRating: numeric;
  locationLat: numeric;
  locationLng: numeric;
  address: text;
  isActive: boolean DEFAULT true;  // 🔑 控制是否出現在扭蛋
  source: text;             // official, ai, user
  createdAt: timestamp;
}

// 索引
IDX_places_city_district
IDX_places_category
IDX_places_is_active
IDX_places_google_id UNIQUE
```

### user_daily_gacha_stats 表
```typescript
{
  id: serial PRIMARY KEY;
  userId: text NOT NULL;
  date: text NOT NULL;      // YYYY-MM-DD
  pullCount: integer DEFAULT 0;
}

// 唯一約束
UQ_user_daily_gacha_user_date (userId, date)

// 原子更新
INSERT ... ON CONFLICT (userId, date) 
DO UPDATE SET pullCount = pullCount + :count
```

### users 表
```typescript
{
  id: text PRIMARY KEY;     // Replit Auth 或 Apple userId
  email: text;
  firstName: text;
  lastName: text;
  role: text DEFAULT 'user';  // user, merchant, specialist, admin
  profileImageUrl: text;
  createdAt: timestamp;
  lastLoginAt: timestamp;
}
```

## 資料完整性規則

### 外鍵約束
- 大部分使用 `ON DELETE CASCADE`
- 用戶相關表使用 `ON DELETE SET NULL`

### 軟刪除
- 使用 `isActive = false` 而非實際刪除
- 適用於: places, merchants, coupons

### 時間戳
- `createdAt`: 自動設定
- `updatedAt`: 手動更新（部分表）
- 時區: UTC

## 遷移注意事項
⚠️ **禁止修改 ID 欄位類型** (serial ↔ varchar)
- 會產生破壞性 ALTER TABLE
- 使用 `npm run db:push --force` 同步

## 資料量統計 (2025-12-30)
- places: 14,612 筆（已完成 6 縣市：台北市、宜蘭縣、高雄市、臺南市、臺中市、新北市）
- users: ~500 筆
- regions: 22 個縣市

---

## Changelog

### 2024-12-23 - 資料完整性修復
1. **places.isActive 欄位新增**
   - 新增 `is_active` boolean 欄位 (預設 `true`)
   - 用途：標記無效地點不出現在扭蛋結果
   - 新增索引 `IDX_places_is_active`

2. **user_daily_gacha_stats 原子更新**
   - 新增唯一約束 `UQ_user_daily_gacha_user_date` on (user_id, date)
   - 改用 `INSERT ... ON CONFLICT DO UPDATE SET pull_count = pull_count + :count`
   - 修復 Race Condition 漏洞

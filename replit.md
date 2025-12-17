# Mibu 旅行扭蛋

## Overview
Mibu 旅行扭dan is a Progressive Web Application (PWA) that gamifies travel planning. Users input a destination and pace, and an AI generates verified local itineraries. The app includes a collection system for saving locations, organized by region and category. A merchant backend allows businesses to claim locations, manage offers, and utilize subscription plans. The project aims to combine innovative travel planning with a gamified experience, offering market potential for personalized and engaging travel.

## User Preferences
偏好的溝通方式：簡單、日常用語。

### 程式碼修改規範
每次進行程式碼修改時，必須說明：
1. 修改了什麼 - 具體更動的檔案和程式碼
2. 修改的邏輯說明 - 為什麼要這樣修改
3. 修改後的結果 - 預期的效果和實際運行結果

### 關聯性檢查規範
在執行任何資料庫操作或程式碼修改前，必須：
1. **自動發想關聯性問題** - 主動思考這個操作會影響哪些相關的表格、函數、或功能
2. **檢查外鍵關係** - 查詢相關表格是否有外鍵參照
3. **確認連動影響** - 如果有潛在的連動影響，先詢問使用者再執行
4. **避免破壞性操作** - 刪除、修改資料前，先確認不會影響其他功能

### 前後端分離同步規範
這是一個前後端分離專案，有外部的 Expo App 前端：
1. **完成後端工作後** - 必須檢查是否需要同步更新外部前端
2. **如有 API 變更** - 產生「前端同步指令」並記錄到本文件的「前端同步指令記錄」章節
3. **內建 Web 前端用途** - 僅供管理後台、商戶後台、開發測試使用，非消費者端

## System Architecture

### UI/UX Decisions
- **Styling**: Tailwind CSS for mobile-first design.
- **UI Components**: shadcn/ui + Radix UI for pre-built interface elements.
- **Animations**: Framer Motion for dynamic visual effects.
- **Navigation**: Dual-layered nested navigation (global SideNav and module-specific ModuleNav) with responsive design for desktop and mobile.

### Technical Implementations
- **Frontend**: React 18 + TypeScript with Vite 5.x.
- **Backend**: Node.js + Express with TypeScript (ES modules).
- **API Pattern**: RESTful APIs, prefixed with `/api/`.
- **State Management**: React Query + React useState.
- **Authentication**: Replit Auth (OpenID Connect) for login verification; JWT Token issued by backend for API authentication.
- **Role-Based Access Control (RBAC)**: `consumer`, `merchant`, `admin` roles with API differentiation (`/api/consumer/*`, `/api/merchant/*`).
- **Data Storage**: PostgreSQL with Drizzle ORM. Schema defined in `shared/schema.ts`.
- **Modular Architecture**: Organized into `modules/` (e.g., trip-planner, travel-gacha, admin) and `core/` for shared code.
- **PWA Features**: Offline access via Service Worker + IndexedDB with caching strategies (Stale-While-Revalidate, Network First, Cache First) and offline itinerary saving.
- **Real-time Communication**: Multiplayer Companion System and Twilio Chat System integration for real-time chat. Socket.IO for real-time location tracking.
- **AI Integration**: AI-generated itineraries using Gemini API, with a Place Cache System to reduce API calls.
- **Location & Category Systems**: Three-tiered location hierarchy (Country → Region → District) and two-tiered category system, both with multi-language support.
- **Gacha Itinerary Logic**: Random district selection, diverse location categories, duplicate avoidance, AI-generated descriptions, and location validation.
- **Trip Planning Service**: Manages planners, service plans, orders, auto-matching, and chat room creation.
- **Announcement & Event System**: Supports `announcement`, `flash_event`, `holiday_event` types with auto-deletion for temporary events.
- **Coupon Redemption System**: User-facing coupon redemption with merchant-provided codes and a 3-minute validity window.
- **AdMob Integration**: Support for AdMob advertisements across multiple platforms and configurable display frequencies.
- **Itembox System**: Manages user-obtained coupons and items, with read/redeem functionalities.
- **Collection Optimization**: Automatic saving of generated itinerary places to user collection, with indicators for new items and merchant promotions.

### Feature Specifications
- **Mibu Backend Responsibilities**: User authentication/authorization, AI itinerary generation, location data management, collection/feedback systems, merchant system, trip planning services, real-time chat, payment processing (Stripe), AdMob integration, Itembox, and coupon redemption.
- **Frontend/Backend Collaboration**: Backend provides "Frontend Sync Instructions" for API and data structure changes.
    - **Backend Base URL**: `https://gacha-travel--s8869420.replit.app`

## External Dependencies

### Third-Party Services
- **Replit Auth**: Login and authentication.
- **Google Gemini API**: AI-powered itinerary generation.
- **Twilio Conversations API**: Real-time chat system.
- **Recur (via PAYUNi)**: Payment gateway for merchant subscriptions.
- **Socket.IO**: Real-time bidirectional event-based communication.
- **AdMob**: Mobile advertising platform.

### Databases
- **PostgreSQL**: Primary database for all project data.

### Environment Variables
- `DATABASE_URL`
- `SESSION_SECRET`
- `AI_INTEGRATIONS_GEMINI_BASE_URL`
- `AI_INTEGRATIONS_GEMINI_API_KEY`
- `ISSUER_URL`
- `REPL_ID`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_API_KEY_SID`
- `TWILIO_API_KEY_SECRET`
- `TWILIO_CONVERSATIONS_SERVICE_SID`

## 前端同步指令記錄

### 2024-12-17: 道具箱系統升級 + 優惠券機率系統

#### 用戶需求
1. 30格遊戲風格道具箱 (grid-based inventory)
2. 5階優惠券機率系統 (SP 2%, SSR 8%, SR 15%, S 23%, R 32%)
3. 過期優惠券變灰但不刪除
4. 軟刪除道具功能 (需前端確認)
5. 行程生成時自動檢查商家認領並抽取優惠券

#### API 變更

**道具箱 API (更新)**
```
GET /api/inventory
Response: {
  items: UserInventoryItem[],
  slotCount: number,      // 目前使用格數
  maxSlots: number,       // 最大格數 (30)
  isFull: boolean         // 是否已滿
}

UserInventoryItem 新增欄位:
- slotIndex: number       // 格子索引 (0-29)
- tier: string           // 優惠券等級 (SP/SSR/SR/S/R)
- status: string         // 'active' | 'expired' | 'redeemed' | 'deleted'
- isExpired: boolean     // 是否過期 (自動計算)
- isDeleted: boolean     // 是否已刪除
```

**刪除道具 API (新增)**
```
DELETE /api/inventory/:id
Response: { success: true, message: "Item deleted" }
// 注意: 前端需在呼叫前顯示確認對話框
```

**取得單一道具詳情 API (新增)**
```
GET /api/inventory/:id
Response: { item: UserInventoryItem }
```

**道具箱設定 API (新增)**
```
GET /api/inventory/config
Response: { maxSlots: 30 }
```

**機率設定 API (公開)**
```
GET /api/rarity-config
Response: {
  config: {
    spRate: 2, ssrRate: 8, srRate: 15, sRate: 23, rRate: 32
  }
}
```

**優惠券核銷 API (更新)**
```
POST /api/inventory/:id/redeem
Body: { redemptionCode: string }
Response: 
- 成功: { success: true, expiresAt: Date, redemptionId: number }
- 過期: { error: "此優惠券已過期", isExpired: true } (400)
- 已使用: { error: "此優惠券已使用", isRedeemed: true } (400)
```

**行程生成 API (更新)**
```
POST /api/generate-itinerary
Response.data 新增:
- coupons_won: { tier, placeName, couponName }[]  // 抽到的優惠券列表
- meta.coupons_won: number                        // 抽到優惠券數量

inventory 項目新增:
- merchant_promo: {
    merchantId: number,
    isPromoActive: boolean,
    promoTitle: string?,
    promoDescription: string?,
    promoImageUrl: string?
  }
- is_coupon: boolean       // 是否抽到優惠券
- coupon_data: {
    inventoryId: number,
    tier: string,
    name: string,
    description: string,
    validUntil: string,
    slotIndex: number
  }
```

#### 前端修改建議

1. **道具箱頁面 (ItemBox)**
   - 改為 6x5 grid 佈局 (30格)
   - 顯示 slotCount/maxSlots 狀態
   - 過期物品變灰 + "已過期" 標籤
   - 刪除按鈕 + 確認對話框
   - 按稀有度顯示不同邊框/特效

2. **行程結果頁面**
   - 顯示 coupons_won 慶祝動畫
   - 商家認領地點顯示優惠資訊 overlay
   - 新獲得優惠券的卡片閃爍效果

3. **核銷頁面**
   - 過期優惠券顯示灰色且無法核銷
   - 核銷失敗時根據 isExpired/isRedeemed 顯示不同錯誤訊息

#### 稀有度視覺設計建議
```
SP  - 金色邊框 + 閃爍特效 + 彩虹光暈
SSR - 紫色邊框 + 發光效果
SR  - 藍色邊框
S   - 綠色邊框
R   - 灰色邊框
```

#### 程式碼範例

```typescript
// 道具箱 Grid 組件
const InventoryGrid: React.FC = () => {
  const { data } = useQuery(['inventory'], () => 
    fetch('/api/inventory').then(r => r.json())
  );
  
  const slots = Array(30).fill(null);
  data?.items.forEach(item => {
    slots[item.slotIndex] = item;
  });
  
  return (
    <div className="grid grid-cols-6 gap-2">
      {slots.map((item, idx) => (
        <InventorySlot 
          key={idx} 
          item={item} 
          isEmpty={!item}
          isExpired={item?.isExpired}
          tier={item?.tier}
        />
      ))}
    </div>
  );
};

// 稀有度邊框樣式
const tierBorderStyles = {
  SP: 'border-yellow-400 animate-pulse shadow-yellow-400/50',
  SSR: 'border-purple-500 shadow-purple-500/30',
  SR: 'border-blue-500',
  S: 'border-green-500',
  R: 'border-gray-400'
};
```
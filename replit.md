# Mibu 旅行扭蛋

## Overview
Mibu 旅行扭蛋 is a Progressive Web Application (PWA) that gamifies travel planning. Users input a destination and pace, and an AI generates verified local itineraries. The app includes a collection system for saving locations, organized by region and category. A merchant backend allows businesses to claim locations, manage offers, and utilize subscription plans. The project aims to combine innovative travel planning with a gamified experience, offering market potential for personalized and engaging travel.

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
- **Authentication**: Replit Auth (OpenID Connect) for login verification.
- **Role-Based Access Control (RBAC)**: `consumer`, `merchant`, `admin` roles with API differentiation (`/api/consumer/*`, `/api/merchant/*`).
- **Data Storage**: PostgreSQL with Drizzle ORM. Schema defined in `shared/schema.ts`.
- **Location Hierarchy**: Three-tiered structure (Country → Region → District) with multi-language support (nameEn, nameZh, nameJa, nameKo).
- **Category System**: Two-tiered structure (Category → Subcategory) with 8 main categories.
- **Place Cache System**: Caches AI-generated locations to reduce Gemini API calls. Checks cache first, then calls Gemini if not found or excluded by user, validating with Google Maps.
- **Modular Architecture**: Organized into `modules/` (e.g., trip-planner, travel-gacha, admin) and `core/` for shared code.
- **Offline Access (PWA)**: Utilizes Service Worker + IndexedDB.
    - **Caching Strategies**: Stale-While-Revalidate for static resources, Network First for API responses, Cache First for map tiles.
    - **Offline Features**: Offline indicator, map tile downloads for offline use, itinerary saving to local storage.
- **Multiplayer Companion System**: Allows inviting companions to chat rooms via invitation links.
- **Twilio Chat System**: Integration with Twilio Conversations API for real-time chat.
- **Trip Planning Service System**: Manages planners, service plans (Light Consultation, In-depth Planning, Full Accompaniment), and orders, including auto-matching planners and chat room creation.
- **Gacha Itinerary Logic**:
    1. Randomly selects a district for all locations in an itinerary.
    2. Generates multiple locations covering different categories.
    3. Avoids duplicate locations across gacha pulls.
    4. Provides AI-generated tourist-oriented descriptions.
    5. Validates location existence within the chosen district.
- **Frontend/Backend Collaboration**: Backend provides "Frontend Sync Instructions" after updates, including API changes, data structure changes, and required frontend modifications with API call examples and return data formats.
    - **Backend Base URL**: `https://gacha-travel--s8869420.replit.app`
    - **Authentication**: JWT Token issued by backend after Replit OAuth login, used in `Authorization: Bearer {token}` header.

### Feature Specifications
- **Mibu Backend Responsibilities**: User authentication/authorization, AI itinerary generation, location data management, collection/feedback systems, merchant system, trip planning services, real-time chat, payment processing (Stripe).
- **Announcement & Event System** (2025-12-17):
    - Three types: `announcement` (permanent), `flash_event` (auto-delete), `holiday_event` (auto-delete)
    - Admin API endpoints: GET/POST/PATCH/DELETE `/api/admin/announcements`
    - Public API: GET `/api/announcements` (active only)
    - Auto-deletion scheduler runs hourly for expired flash/holiday events
    - Authorization uses `hasAdminAccess` helper checking JWT activeRole + super admin email

## External Dependencies

### Third-Party Services
- **Replit Auth**: Login and authentication.
- **Google Gemini API**: AI-powered itinerary generation.
- **Twilio Conversations API**: Real-time chat system.
- **Recur (via PAYUNi)**: Payment gateway for merchant subscriptions.

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

---

## 前後端分離協作規範 (2025-12-15 新增)

### 專案架構
這是一個前後端分離的專案：
- **後端**（本專案）：Mibu 旅行扭蛋 - Node.js + Express + PostgreSQL
- **前端**：Mibu Expo App - React Native + Expo
- **後端正式網址**：`https://gacha-travel--s8869420.replit.app`

### 技術長模式（CTO Mode）
當後端 Agent 完成功能更新有牽動到前端時，必須產生「前端同步指令」，讓使用者可以直接貼給前端 Agent。

#### 指令格式模板
每次後端更新完成後，產生以下格式的指令：

```
=== 前端同步指令 ===

【後端更新摘要】
{簡述這次後端做了什麼更動}

【API 變更】
- 新增 API：{方法} {路徑} - {用途}
- 修改 API：{方法} {路徑} - {變更內容}
- 移除 API：{方法} {路徑}

【資料結構變更】
{如果有新增或修改資料欄位，列出來}

【前端需要的改動】
1. {具體描述前端需要做什麼}
2. {...}

【API 呼叫範例】
// {API 名稱}
const response = await fetch('https://gacha-travel--s8869420.replit.app/api/{路徑}', {
  method: '{方法}',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` // 如需登入驗證
  },
  body: JSON.stringify({...}) // 如需傳送資料
});
const data = await response.json();

【回傳資料格式】
{
  // TypeScript 型別定義
}

=== 指令結束 ===
```

### API 基礎網址
前端應使用以下基礎網址連接後端：
- 開發環境：使用環境變數 `EXPO_PUBLIC_API_URL`
- 正式環境：`https://gacha-travel--s8869420.replit.app`

### 認證方式
前端使用 JWT Token 進行認證：
1. 使用者透過 Replit OAuth 登入後端
2. 後端發放 JWT Token
3. 前端在每次請求的 Header 加入 `Authorization: Bearer {token}`

---

## 前端同步指令記錄

### 2025-12-15：即時位置追蹤功能

```
=== 前端同步指令 ===

【後端更新摘要】
新增 Socket.IO 即時位置追蹤功能，旅客可透過 WebSocket 即時上報位置，後端會自動轉發給對應的專員。

【API 變更】
- 現有 API：POST /api/location/update - HTTP 位置更新（保留，用於非即時場景）
- 現有 API：GET /api/location/me - 取得我的位置
- 新增 Socket.IO 事件：location_update - 即時位置串流（取代頻繁 HTTP 請求）
- 新增 Socket.IO 事件：traveler_location - 專員接收旅客位置
- 新增 Socket.IO 事件：specialist_subscribe - 專員訂閱旅客位置

【Socket.IO 連線設定】
- 後端 URL：wss://gacha-travel--s8869420.replit.app
- 傳輸方式：['websocket', 'polling']
- 認證：handshake.auth.token = JWT Token

【前端需要的改動 - 旅客端】
1. 安裝 socket.io-client：`expo install socket.io-client`
2. 安裝 expo-location：`expo install expo-location`
3. 建立 Socket 連線並發送位置更新：

// 連線範例
import { io } from 'socket.io-client';
import * as Location from 'expo-location';

const socket = io('https://gacha-travel--s8869420.replit.app', {
  auth: { token: jwtToken },
  transports: ['websocket', 'polling'],
});

// 請求定位權限
const { status } = await Location.requestForegroundPermissionsAsync();

// 即時位置追蹤（每 5 秒或移動 10 公尺）
Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 10,
  },
  (location) => {
    socket.emit('location_update', {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      timestamp: Date.now(),
    });
  }
);

// 監聽確認
socket.on('location_ack', (data) => {
  console.log('位置已更新', data);
});

【前端需要的改動 - 專員端】
1. 連線後發送訂閱請求
2. 監聯旅客位置更新

// 訂閱旅客
socket.emit('specialist_subscribe', {});

// 接收旅客位置
socket.on('traveler_location', (data) => {
  // data: { travelerId, serviceId, lat, lng, timestamp }
  updateMarkerPosition(data.travelerId, data.lat, data.lng);
});

// 接收目前服務中的旅客列表
socket.on('active_travelers', (data) => {
  // data: { count, travelers: [{ serviceId, travelerId, region, createdAt }] }
});

【回傳資料格式】
// location_ack
{ success: boolean; timestamp: number; serviceActive: boolean }

// traveler_location
{ travelerId: string; serviceId: number; lat: number; lng: number; timestamp: number }

// active_travelers
{ count: number; travelers: Array<{ serviceId: number; travelerId: string; region: string; createdAt: Date }> }

=== 指令結束 ===
```

### 2025-12-15：現有定位 HTTP API

```
=== 前端同步指令 ===

【後端更新摘要】
現有的 HTTP 定位 API，適用於非即時場景（如初次定位、定期備份）

【API 變更】
- POST /api/location/update - 更新用戶位置
- GET /api/location/me - 取得我的位置

【API 呼叫範例】
// 更新位置
const response = await fetch('https://gacha-travel--s8869420.replit.app/api/location/update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    lat: 25.033,
    lon: 121.565,
    isSharingEnabled: true,  // 可選
    targets: [  // 可選，用於 geofencing
      { id: 1, name: '目的地', lat: 25.04, lon: 121.57, radiusMeters: 100 }
    ]
  })
});

// 回傳格式
{
  status: "ok",
  arrived: boolean,       // 是否抵達 geofence 目標
  target: object | null,  // 最近的目標
  distanceMeters: number | null,
  location: { id, userId, lat, lon, isSharingEnabled, ... },
  message: string
}

// 取得我的位置
const response = await fetch('https://gacha-travel--s8869420.replit.app/api/location/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});
// 回傳格式：UserLocation | null

=== 指令結束 ===
```

### 2025-12-15：全域排除功能

```

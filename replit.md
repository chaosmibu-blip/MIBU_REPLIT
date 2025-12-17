# Mibu 旅行扭蛋

## Overview
Mibu 旅行扭蛋 is a Progressive Web Application (PWA) designed to gamify travel planning. It allows users to input a destination and preferred pace, then uses AI to generate verified local itineraries. Key features include a collection system for saving locations, organized by region and category, and a merchant backend for businesses to claim locations, manage offers, and utilize subscription plans. The project aims to innovate travel planning through gamification, offering personalized and engaging experiences with significant market potential.

## User Preferences
偏好的溝通方式：簡單、日常用語。

## Agent 開發守則

### 1. 雙重人格與檔案隔離
| 情境 | 正確做法 | 禁止事項 |
|------|----------|----------|
| 修改 `server/` | 專注 API 與 DB | - |
| 修改 `client/` | 這是 Web Admin（React + Tailwind） | - |
| 提供 Expo App 程式碼 | 使用 React Native 原生組件 (`<View>`, `<Text>`, `<FlatList>`) | ❌ 參考 `client/` 資料夾、❌ 使用 HTML 標籤 |

### 2. API 變更同步 (Sync Protocol)
任何後端 API 修改，必須：
1. 更新 `docs/API_CONTRACT.md` 契約文件
2. 在回覆最後附上 **「📱 Expo 前端同步指令」**，包含：
   - 更新後的 TypeScript Interface
   - API 呼叫範例（含 headers 和 body）

> **重要文件**: `docs/API_CONTRACT.md` 是前後端 Agent 共同遵守的 API 契約

### 3. 依賴鎖定
- 除非用戶明確允許，**禁止**修改 `package.json` 或安裝新套件
- 若需要新套件，先詢問用戶是否允許

---

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
11. **完成後端工作後** - 必須檢查是否需要同步更新外部前端
12. **如有 API 變更** - 直接在對話中輸出「前端同步指令」（用 code block 方便複製貼上）
13. **內建 Web 前端用途** - 僅供管理後台、商戶後台、開發測試使用，非消費者端
14. **同步指令格式** - 包含：用戶需求、API 變更、資料結構、前端修改建議、程式碼範例

## Project Structure

### 此 Replit 專案包含
| 項目 | 路徑 | 說明 |
|------|------|------|
| 後端 API | `server/` | Express.js API 伺服器，提供所有業務邏輯（含商家系統 API，供外部 Expo App 使用） |
| Web 管理後台 | `client/` | React + Vite 網頁，僅供管理員後台使用 |
| 共享類型 | `shared/` | 前後端共用的 TypeScript 類型和 Schema |
| 模組系統 | `modules/` | 功能模組（旅程策畫、行程扭蛋、管理後台） |

### 外部專案（不在此 Replit 中）
| 項目 | 說明 |
|------|------|
| **Expo App (手機 App)** | 消費者/商家使用的前端 App，是獨立的外部專案 |

### 重要提醒
- `client/` 中的 Web 前端 **不是** 給一般用戶使用的介面
- 一般用戶、商家使用的介面在 **外部 Expo App**
- 修改用戶/商家相關的 UI 需在 **外部 Expo App** 進行
- 此 Replit 的 `client/` 僅用於：管理後台、開發測試

## System Architecture

### UI/UX Decisions
- **Styling**: Tailwind CSS for mobile-first design.
- **UI Components**: shadcn/ui + Radix UI for pre-built interface elements.
- **Animations**: Framer Motion for dynamic visual effects.
- **Navigation**: Dual-layered nested navigation (global SideNav and module-specific ModuleNav) with responsive design.

### Technical Implementations
- **Frontend**: React 18 + TypeScript with Vite 5.x.
- **Backend**: Node.js + Express with TypeScript (ES modules).
- **API Pattern**: RESTful APIs, prefixed with `/api/`.
- **State Management**: React Query + React useState.
- **Authentication**: Replit Auth (OpenID Connect) for login; JWT Token for API authentication.
- **Role-Based Access Control (RBAC)**: `consumer`, `merchant`, `admin` roles with API differentiation.
- **Data Storage**: PostgreSQL with Drizzle ORM.
- **Modular Architecture**: Code organized into `modules/` and `core/`.
- **PWA Features**: Offline access via Service Worker + IndexedDB with caching strategies and offline itinerary saving.
- **Real-time Communication**: Multiplayer Companion System, Twilio Chat, and Socket.IO for real-time location tracking.
- **AI Integration**: AI-generated itineraries using Gemini API, with a Place Cache System featuring automated quality review (AI Review Scheduler for drafts, batch cache review for existing records).
- **Location & Category Systems**: Three-tiered location hierarchy and two-tiered category system, both multi-language.
- **Gacha Itinerary Logic**: Random district selection, diverse categories, duplicate avoidance, AI descriptions, and location validation.
- **Trip Planning Service**: Manages planners, service plans, orders, auto-matching, and chat room creation.
- **Announcement & Event System**: Supports `announcement`, `flash_event`, `holiday_event` types with auto-deletion.
- **Coupon Redemption System**: User-facing coupon redemption with merchant codes and time limits.
- **AdMob Integration**: Support for AdMob across platforms with configurable frequencies.
- **Itembox System**: Manages user-obtained coupons and items with read/redeem functionalities, including a 30-slot grid inventory and 5-tier coupon rarity system (SP 2%, SSR 8%, SR 15%, S 23%, R 32%).
- **Collection Optimization**: Automatic saving of generated itinerary places to user collection, with new item and promotion indicators.
- **User Settings**: Profile management (basic info, dietary restrictions, medical history, emergency contacts), language switching, logout.
- **SOS Safety Center**: Emergency alert system (long-press, volume key sequence, shake gesture) accessible after purchasing travel services.
- **Merchant System**: Features merchant registration and approval workflow, analytics dashboard (itinerary card count, coupon statistics), coupon template CRUD with 5-tier rarity, and itinerary card leveling (free/pro/premium).

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
# Mibu 旅行扭蛋

## Overview

Mibu Travel Gacha is a Progressive Web App (PWA) that combines travel planning with gamified gacha mechanics. Users input a destination and travel pace, and the AI generates verified local itineraries. It features a collection system for saving locations, organized by region and category. A merchant backend allows businesses to claim locations, manage promotions, and subscribe to plans. The project aims to provide an engaging and efficient way to discover travel destinations.

## User Preferences

偏好的溝通方式：簡單、日常用語。

每次進行程式碼修改時，必須說明：
1. 修改了什麼 - 具體更動的檔案和程式碼
2. 修改的邏輯說明 - 為什麼要這樣修改
3. 修改後的結果 - 預期的效果和實際運行結果

## System Architecture

### Frontend Architecture
- **Framework**: React 18 + TypeScript (strict mode)
- **Build Tool**: Vite 5.x
- **Styling**: Tailwind CSS (mobile-first design)
- **State Management**: React Query + React useState
- **UI Components**: shadcn/ui + Radix UI
- **Animations**: Framer Motion

### Backend Architecture
- **Runtime**: Node.js + Express
- **Language**: TypeScript (ES modules)
- **API Pattern**: RESTful (prefixed with `/api/`)
- **Authentication**: Replit Auth (OpenID Connect)
- **Role-Based Access Control**: `consumer`, `merchant`, `admin` roles with segregated API endpoints (`/api/consumer/*`, `/api/merchant/*`).

### Data Storage
- **Database**: PostgreSQL + Prisma ORM
- **Schema Location**: `prisma/schema.prisma`
- **Migrations**: `npm run db:push`

### Location Hierarchy
- Three-tier structure: Country → Region → District.
- Multi-language support for names (En, Zh, Ja, Ko).
- Data for Taiwan: 1 country, 22 regions, 139 districts.

### Category System
- Two-tier structure: Category → Subcategory.
- 8 main categories (Food, Stay, Eco-Culture, Experience, Fun, Event, Spot, Shop) with multiple subcategories each.

### Place Cache System
- **Purpose**: Reduce AI (Gemini) usage by caching generated and verified places.
- **Logic**: Checks cache before calling AI. If a relevant, uncached place is needed, Gemini AI is called, verified with Google Maps, and then cached.

### Modular Architecture
- **Directory Structure**: `modules/` for features (e.g., `trip-planner`, `travel-gacha`), `core/` for shared code.
- **Navigation**: Dual-layer nested navigation (global SideNav and module-specific ModuleNav) with responsive design.

### Offline Access System (PWA)
- **Technology**: Service Worker + IndexedDB.
- **Caching Strategy**:
    - Static resources: Stale-While-Revalidate.
    - API responses: Network First.
    - Map tiles: Cache First.
- **Features**: Offline indicator, map download for offline use, itinerary saving for offline access.

### AI Integration
- **Provider**: Google Gemini API (gemini-2.5-flash model).
- **Purpose**: Generate travel itineraries and verify locations using Google Search.

### Gacha Itinerary Logic
- **Single Region Lock**: Itineraries are generated within a single randomly selected district.
- **Multi-Category Diversity**: Each gacha draw includes places from various categories.
- **Repetition Avoidance**: Tracks previously generated places to prevent duplicates.
- **AI Description**: Each place includes an AI-generated, tourism-oriented description.
- **Location Validation**: Verifies places are within the selected district.

### Feature Specifications
- **Eight Major Category System**: Implemented with 8 main categories and 49 subcategories.
- **Merchant Claim API**: Allows merchants to claim locations, with conflict detection and dispute submission for existing claims.
- **Location Shortage Refill Mechanism**: Automatically attempts other subcategories/categories if a region has insufficient places.
- **Twilio Chat System**: Integration with Twilio Conversations API for real-time chat.
- **Travel Planner Service**: Accounts for planners, service plans, order system for purchasing services, automatic planner matching, and chat room creation.
- **Multiplayer Travel Companion System**: Users can invite companions via invite links to join chat rooms.

## External Dependencies

### Third-Party Services
- **Replit Auth**: For user authentication.
- **Google Gemini API**: For AI-powered itinerary generation.
- **Twilio Conversations API**: For real-time chat functionality.
- **Recur (PAYUNi)**: For recurring payment processing for merchant subscriptions.

### Database
- **PostgreSQL**: Primary database.

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
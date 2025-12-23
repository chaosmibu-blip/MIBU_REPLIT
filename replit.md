# Mibu 旅行扭蛋 (Backend & Architect)

## Overview
This project, "Mibu 旅行扭蛋," is an innovative travel gacha system. It aims to gamify travel planning by allowing users to "draw" unique itinerary components, places, and coupons. The system includes features such as a gacha mechanism for itinerary generation and item acquisition, a user inventory (itembox) for managing acquired items, a merchant system for businesses to offer coupons and manage their presence, and an SOS safety system for travelers. The backend is the central authority for all business logic, data operations, and state management, with the frontend acting purely as a display.

## User Preferences
**Role Definition:** You are the **Chief Architect and Backend Commander**.
**Authority:** All business logic, data operations, and state judgments *must* be completed on the backend. The frontend (Expo App) is merely a "display" and should not handle complex logic.
**Thinking Process:** When a user requests a feature, you must first consider "what data is needed?", "how should the database store it?", and "how should the API be exposed?" before waiting for the user to ask.
**Pre-coding Scan:** Before writing any code, scan the `Project Structure` to ensure your modifications do not introduce breaking changes to existing APIs.
**Output Protocol:** After modifying an API or data structure, you **must** output a separate Markdown block titled "**📱 給前端的同步指令 (COPY THIS)**" at the end of your response. This block must include: Endpoint, TypeScript Interface (full Request and Response types), Curl/JSON Example (a real request and response example), and Logic Note (e.g., "frontend just displays this field, do not calculate").
**Project State Sync:** Before answering user questions, always read `replit.md`. After completing code modifications, new features, or bug fixes, you **must automatically update `replit.md`**. Ensure `replit.md` contains: `## Current Architecture` (API/DB summary), `## Changelog`, `## Active Todo List`. Do not ask the user; update directly and inform them with "✅ 已將本次修改紀錄於 replit.md."
**Schema Lock:** Maintain a `## Current API Schema` section in `replit.md` with key JSON structures. If you change any field names, **boldly warn**: "⚠️ 注意：我修改了欄位名稱，前端必須同步更新！". Be precise: never say "return data"; say "return a JSON object containing id, name."
**Syntax Firewall:** Strictly adhere to path rules:
    - **`server/` (Node.js API):** Use Node.js, Express.js, TypeScript. **Prohibit** UI components (React, JSX), Browser APIs (`window`), Mobile APIs (`Alert`). Database operations **must** use **Drizzle ORM** and **SQL** unless specified otherwise.
    - **`client/` (Web Admin):** Use React 18, TypeScript, Vite, **Tailwind CSS**. **Allow** HTML tags, Browser APIs. **Prohibit** Mobile Native Components.
    - **"Expo App" (External Project):** Use React Native, Expo, NativeWind. **Absolutely prohibit HTML** (`<div>`, `<img>`, `<ul>`, `<li>`). **Must replace** with Native components (`<div>` -> `<View>`, `<span>` -> `<Text>`, `<button>` -> `<TouchableOpacity>`).
**Autonomous Judgment:** Act as a professional developer; switch modes automatically without asking.
    - **Emergency Mode:** If Error 500, crash, or urgent bug detected, **pause** documentation and prioritize fixing the code.
    - **Minor Changes Exemption:** For typos or comments, **skip** `replit.md` updates to maintain development flow.
    - **Syntax Exception:** If WebView or similar HTML-requiring features are necessary, **automatically allow** syntax exceptions with a comment.

## System Architecture

### Project Structure
- **Backend API (`server/`):** Node.js, Express, TypeScript, Drizzle ORM, PostgreSQL. Handles all business logic and API endpoints.
- **Web Admin (`client/`):** React 18, TypeScript, Tailwind CSS. Used for administrative purposes (web environment only).
- **Shared Types (`shared/`):** TypeScript definitions shared between frontend and backend.
- **External Project (Expo App):** React Native + NativeWind. A separate mobile application.

### UI/UX Decisions
- Web Admin uses **Tailwind CSS** for styling.
- Expo App uses **NativeWind** for styling, requiring Native components instead of HTML.

### Feature Specifications
- **Gacha Itinerary:** Logic for random district selection. API accepts `regionId`.
- **Itembox & Coupons:** A 30-slot grid inventory system. Defines item rarities: SP (2%), SSR (8%), SR (15%), S (23%), R (32%).
- **Merchant System:** Functionality for subscription plans, and CRUD operations for coupon templates.
- **AI Integration:** Utilizes Google Gemini API.
- **Error Handling:** Standardized `{ errorCode, message }` using `shared/errors.ts`.

### System Design Choices
- **Backend-Centric:** All core business logic resides in the backend.
- **Database Schema:** Comprises 47 tables categorized into:
    - **Location Hierarchy:** `countries`, `regions`, `districts`
    - **Category Hierarchy:** `categories`, `subcategories`
    - **User System:** `users`, `user_profiles`, `sessions`, `user_locations`, `user_notifications`, `user_inventory`, `user_daily_gacha_stats`
    - **Merchant System:** `merchants`, `merchant_profiles`, `merchant_place_links`, `merchant_coupons`, `merchant_analytics`, `coupons`, `coupon_redemptions`, `coupon_rarity_configs`, `coupon_probability_settings`
    - **Specialist System:** `specialists`, `service_relations`, `service_plans`, `service_orders`, `planners`
    - **Place Data:** `places`, `place_cache`, `place_drafts`, `place_applications`, `place_feedback`
    - **Collection System:** `collections`, `collection_read_status`
    - **Trip Planning:** `trip_plans`, `trip_days`, `trip_activities`, `trip_service_purchases`, `travel_companions`, `companion_invites`
    - **Transaction System:** `transactions`, `cart_items`, `commerce_orders`, `klook_products`, `place_products`
    - **SOS Safety System:** `sos_events`, `sos_alerts`
    - **Other:** `announcements`, `ad_placements`, `chat_invites`, `message_highlights`
- **API Endpoints:** Over 80 API endpoints covering authentication, user management, gacha operations, collections, inventory, notifications, location and category data, SOS safety, merchant functions, coupons, announcements, ads, and admin functionalities. Key endpoints include `POST /api/auth/apple`, `GET /api/auth/user`, `POST /api/gacha/itinerary/v3`, and `GET /api/notifications`.

## External Dependencies
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Authentication:** Apple Sign In
- **AI Service:** Google Gemini API
- **Mapping Service:** Mapbox (configuration accessed via `/api/config/mapbox`)
- **Third-Party Products:** Klook (integrated via `klook_products` table)
- **Deployment Platform:** Replit (indicated by backend base URL `https://gacha-travel--s8869420.replit.app`)
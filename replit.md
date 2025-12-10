# Mibu Travel Gacha

## Overview

Mibu Travel Gacha is a Progressive Web App (PWA) that combines travel planning with gacha-style gamification. Users input a destination and intensity level, and AI generates randomized, verified local itineraries. The app features a collection system where users can gather places organized by district and category with accordion-style menus. A merchant dashboard allows businesses to claim locations and manage promotional offers with subscription-based tiers.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript in strict mode
- **Build Tool**: Vite 5.x with custom plugins for meta images and Replit integration
- **Styling**: Tailwind CSS with custom theme configuration (glassmorphism, mobile-first design)
- **State Management**: React Query for server state, React useState for local state
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Animations**: Framer Motion for transitions and celebratory effects

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful endpoints under `/api/` prefix
- **Authentication**: Replit Auth with OpenID Connect, session-based with PostgreSQL session store

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` - contains users, collections, merchants, coupons, placeCache, sessions, and location/category hierarchy tables
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization

### Location Hierarchy (Updated 2025-12-10)
- **Tables**: countries → regions (縣市) → districts (鄉鎮區) (three-level hierarchy)
- **Multilingual**: Each table has nameEn, nameZh, nameJa, nameKo columns for localization
- **Taiwan Data**: 1 country, 22 cities/counties (直轄市/縣市), 139 districts (鄉鎮區)
- **Cities/Counties**: 6 special municipalities (台北市, 新北市, 桃園市, 台中市, 台南市, 高雄市), 3 provincial cities (基隆市, 新竹市, 嘉義市), 13 counties
- **Foreign Keys**: regions.countryId → countries.id, districts.regionId → regions.id

### Category System (Added 2025-12-10)
- **Tables**: categories → subcategories (two-level hierarchy)
- **8 Categories**: 食/宿/生態文化教育/遊程體驗/娛樂設施/活動/景點/購物
- **Subcategories**: Each category has multiple subcategories (e.g., 食 has 便當, 小吃, 咖啡廳, etc.)
- **Multilingual**: Each table has nameEn, nameZh for localization

### Place Cache System (Added 2025-12-10)
- **Purpose**: Reduce AI (Gemini) consumption by caching previously generated place data
- **Cache Key**: (subCategory, district, city, country) - stores one place per sub-category per district
- **Cached Data**: place_name, description, category, Google verification data (place_id, verified_name, verified_address, google_rating, location coordinates, is_location_verified)
- **Cache Hit Logic**: 
  1. When generating itinerary, check cache for each skeleton item's subCategory
  2. If cached AND not in user's collectedNames exclusion list → use cached data (skip AI)
  3. If not cached → call Gemini AI, verify with Google Maps, save to cache
- **Benefits**: Subsequent requests for same district reuse cached places, reducing AI and Google API calls
- **Response Meta**: Includes `cache_hits` and `ai_generated` counts for monitoring

### Recent Changes (2025-12-10)
- **Removed Rarity System**: SP/SSR/SR/S/R grades have been completely removed from the system
- **Category Labels**: Cards now display category type labels (Food, Stay, Scenery, Shopping, Entertainment, Activity, Education) instead of rarity badges
- **District-Based Organization**: Collection items are grouped by district with accordion-style collapsible menus
- **Dual View Modes**: Collection view supports toggling between district grouping and category grouping
- **Field Naming**: Frontend consistently uses `collectedAt` (camelCase) to match Drizzle API responses

### AI Integration
- **Provider**: Google Gemini API (gemini-2.5-flash model)
- **Purpose**: Generate travel itineraries with location verification using Google Search grounding
- **Configuration**: API credentials via environment variables (`AI_INTEGRATIONS_GEMINI_*`)

### Gacha Pull Logic (Updated 2025-12-10)
- **Probability Distribution**: Uniform random selection at each level
  1. **District Selection**: 1/N probability (N = total active districts in country, e.g., 61 for Taiwan)
  2. **Category Selection**: 1/8 probability (8 fixed categories)
  3. **Subcategory Selection**: 1/Y probability (Y = subcategories in selected category)
- **Implementation**: PostgreSQL `ORDER BY RANDOM() LIMIT 1` ensures true uniform distribution
- **Search Query**: Uses `{district.nameZh} {subcategory.nameZh}` for Google Places API
- **Result Data**: Includes place name, district, region, country, category, and verification status
- **No Rarity System**: Categories use color coding instead of SP/SSR/SR grades

### Key Design Patterns
- **Shared Schema**: Types and schemas in `shared/` directory are used by both frontend and backend
- **Path Aliases**: `@/` for client source, `@shared/` for shared code, `@assets/` for attached assets
- **API Proxy**: Frontend calls `/api/*` endpoints, backend handles AI and payment integrations
- **PWA Support**: Service worker caching, manifest.json, mobile-optimized viewport settings

## External Dependencies

### Third-Party Services
- **Replit Auth**: OpenID Connect authentication via `@replit/vite-plugin-*` packages
- **Google Gemini API**: AI-powered itinerary generation with location verification
- **Recur (Taiwan Payment Gateway)**: Subscription payments for merchant tiers via PAYUNi
  - SDK: `recur-tw@0.7.5` loaded via CDN
  - Plans: Free, Partner ($499/mo), Premium ($1,499/mo)

### Database
- **PostgreSQL**: Required, connection via `DATABASE_URL` environment variable
- **Session Storage**: `connect-pg-simple` for Express sessions

### Required Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption
- `AI_INTEGRATIONS_GEMINI_BASE_URL`: Gemini API base URL
- `AI_INTEGRATIONS_GEMINI_API_KEY`: Gemini API key
- `ISSUER_URL`: Replit OIDC issuer (defaults to `https://replit.com/oidc`)
- `REPL_ID`: Replit environment identifier
# Mibu Travel Gacha

## Overview

Mibu Travel Gacha is a Progressive Web App (PWA) that combines travel planning with gacha-style gamification. Users input a destination and intensity level, and AI generates randomized, verified local itineraries. The app features a collection system where users can gather places and earn virtual coupons with varying rarities. A merchant dashboard allows businesses to claim locations and manage promotional offers with subscription-based tiers.

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
- **Schema Location**: `shared/schema.ts` - contains users, collections, merchants, coupons, and sessions tables
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization

### AI Integration
- **Provider**: Google Gemini API (gemini-2.5-flash model)
- **Purpose**: Generate travel itineraries with location verification using Google Search grounding
- **Configuration**: API credentials via environment variables (`AI_INTEGRATIONS_GEMINI_*`)

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
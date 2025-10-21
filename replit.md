# KDP Optimizer AI

## Overview

KDP Optimizer AI is a productivity application designed to automate the optimization of book metadata for Amazon Kindle Direct Publishing (KDP). The application analyzes manuscript content using AI and generates market-specific metadata including titles, descriptions, keywords, categories, and pricing recommendations across multiple Amazon marketplaces (US, Spain, Germany, France, Italy, UK, Brazil).

The tool follows a multi-step workflow: manuscript upload → configuration → AI analysis → results display. It processes book manuscripts to extract themes and entities, researches optimal keywords for each target market, and generates SEO-optimized metadata ready to copy directly into the KDP dashboard.

**Language:** Application interface is in Spanish (neutral Latin American Spanish) for accessibility to Spanish-speaking authors.

**KDP Optimization:** Implements best practices based on Amazon's A9 algorithm, focusing on conversion optimization, long-tail keywords, and compliance with KDP content guidelines.

## User Preferences

Preferred communication style: Simple, everyday language in Spanish.

## System Architecture

### Frontend Architecture

**Technology Stack:** React with TypeScript, using Vite as the build tool.

**UI Framework:** Shadcn/ui component library built on Radix UI primitives with Tailwind CSS for styling. The design follows productivity application principles inspired by Linear and Notion, emphasizing functional clarity and information hierarchy.

**State Management:** 
- React Query (@tanstack/react-query) for server state management
- Local component state with React hooks for UI state
- No global state management library (Redux/Zustand) - keeping state close to components

**Routing:** Wouter for client-side routing (lightweight alternative to React Router)

**Theme System:** Custom theme provider supporting light/dark modes with CSS custom properties. Color palette uses HSL values for flexibility.

**Form Handling:** React Hook Form with Zod schema validation for type-safe form data

**Key Design Decisions:**
- Multi-step wizard interface (Upload → Configure → Analyze → Results) with progress indicator
- Server-Sent Events (SSE) for real-time progress updates during long-running AI operations
- EventSource lifecycle management with useRef and cleanup in useEffect to prevent memory leaks
- Copy-to-clipboard functionality throughout for easy metadata export
- Responsive design with mobile breakpoint at 768px
- Library page for viewing saved manuscripts and optimization history
- Re-optimization workflow using existing manuscriptId to maintain history linkage

### Backend Architecture

**Runtime:** Node.js with Express.js framework

**Language:** TypeScript with ES modules

**API Pattern:** RESTful endpoints with Server-Sent Events for progress streaming

**Core Services:**
- **Metadata Generator Service:** Orchestrates the AI-powered optimization workflow
- **Progress Emitter Service:** Manages SSE connections for real-time progress updates to clients
- **Storage Service:** PostgreSQL database implementation (DbStorage class) for persistent storage of manuscripts and optimization results

**Development/Production Split:** Vite middleware in development for HMR; static file serving in production

**Key Architectural Decisions:**
- **Asynchronous Processing:** POST to `/api/optimize` returns session ID immediately, then processes in background
- **Progress Streaming:** Separate GET endpoint `/api/optimize/progress/:sessionId` for SSE connection
- **Session Management:** Map-based session tracking with connection polling to ensure SSE setup before processing starts
- **Error Handling:** Centralized error middleware with proper HTTP status codes

**API Structure:**
```
POST /api/optimize - Initiates optimization, returns sessionId
GET /api/optimize/progress/:sessionId - SSE endpoint for progress updates
GET /api/manuscripts - Returns list of all saved manuscripts with metadata
GET /api/manuscripts/:id - Returns specific manuscript by ID
GET /api/manuscripts/:id/optimizations - Returns optimization history for a manuscript
POST /api/manuscripts/:id/reoptimize - Re-optimizes existing manuscript for selected markets
```

### Data Storage

**Current Implementation:** PostgreSQL database with Drizzle ORM (DbStorage class)

**Schema:** Drizzle ORM schema defined in `shared/schema.ts`

**Database Configuration:** Drizzle Kit configured to use PostgreSQL dialect with push migrations

**Data Models:**
- **Manuscripts Table:** Stores saved manuscripts with originalTitle, author, genre, targetAudience, language, wordCount, manuscriptText, createdAt
- **Optimizations Table:** Stores optimization results with foreign key relationship to manuscripts. Fields include manuscriptId, sessionId, targetMarkets, seedKeywords, marketMetadata (JSONB with titles, descriptions, keywords, pricing per market), validationWarnings, createdAt
- **Progress Tracking:** In-memory session-based tracking with stages: uploading, analyzing, researching, generating, complete

**Key Database Features:**
- Foreign key constraint: optimizations.manuscriptId → manuscripts.id with CASCADE delete
- Serial ID for manuscripts, varchar UUID for optimizations (using gen_random_uuid())
- JSONB column for flexible market-specific metadata storage
- Text arrays for targetMarkets and seedKeywords
- Manuscript text stored as TEXT supporting large documents (up to 1GB)

**Pricing Rules (Exact KDP Specifications):**
- USD (Amazon.com): 70% royalty for $2.99-$9.99 (recommended: $4.99)
- GBP (Amazon.co.uk): 70% royalty for £1.77-£9.99 (recommended: £3.99)
- EUR (Amazon.de/.fr/.es/.it): 70% royalty for €2.69-€9.99 (recommended: €4.99)
- BRL (Amazon.com.br): 70% royalty for R$5.99-R$24.99 (recommended: R$9.99)
- All prices end in .99 for psychological pricing
- Delivery costs calculated as fileSize × $0.15/MB (deducted from 70% earnings only)

**Design Decision Rationale:** PostgreSQL provides persistent storage allowing users to save manuscripts and track optimization history over time. The IStorage interface abstraction enabled seamless transition from MemStorage to DbStorage. Drizzle ORM provides type-safe database queries and schema migrations via push commands.

### External Dependencies

**AI Services:**
- **OpenAI API:** GPT-4o-mini model for manuscript analysis and metadata generation
  - Manuscript analysis: Extracts long-tail keywords (3-5 word phrases), character archetypes, and specific themes optimized for Amazon A9 algorithm
  - Metadata generation: Creates conversion-focused metadata with main keyword at START of subtitle, 200-character title+subtitle limit, persuasive HTML descriptions with supported tags only
  - Keyword optimization: Uses "bag of words" model, generates 40-50 market-native keywords without repeating title/subtitle words, includes synonyms and variants
  - All prompts emphasize native language generation (not translation) and conversion/sales optimization over traditional SEO
  - Uses JSON mode for structured responses
  - Configuration via environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

**KDP Validation System:**
- **Automatic Compliance:** Validates all generated metadata against Amazon KDP rules
  - Title + Subtitle: Maximum 200 characters combined with intelligent truncation
  - Keywords Backend: 7 fields, 249 bytes each (uses TextEncoder for accurate byte counting)
  - Prohibited Terms: Detects and warns about terms like "bestseller", "free", "new", "#1" (case-insensitive with symbol handling)
  - HTML Sanitization: Removes unsupported tags from descriptions, preserves text content
  - UI Indicators: Color-coded counters (green ✓, yellow ℹ, red ⚠) for character/byte limits
- **Implementation:** Validation utilities in `server/utils/kdp-validator.ts`, integrated into metadata generation pipeline

**Database:**
- **Neon Database:** Serverless PostgreSQL (actively used for data persistence)
  - Connection via `@neondatabase/serverless` driver using HTTP client (`neon` function)
  - HTTP-based connection instead of WebSocket for reliability in Replit environment
  - Connection string in `DATABASE_URL` environment variable
  - Drizzle ORM layer for type-safe queries and schema management using `drizzle-orm/neon-http`
  - Migration strategy: `npm run db:push --force` for schema synchronization

**Third-Party UI Libraries:**
- **Radix UI:** Complete set of accessible UI primitives (accordion, dialog, dropdown, etc.)
- **Embla Carousel:** Carousel/slider functionality
- **React Dropzone:** File upload with drag-and-drop
- **Lucide React:** Icon library
- **date-fns:** Date formatting utilities

**Development Tools:**
- **Replit Plugins:** Development banner, cartographer navigation, runtime error overlay
- **esbuild:** Production server bundling
- **tsx:** TypeScript execution in development

**Font Services:**
- **Google Fonts:** Inter (primary UI font), JetBrains Mono (monospace for code display)

**Key Integration Points:**
- OpenAI API calls are centralized in `server/ai/openai-client.ts`
- File reading uses browser File API on client side
- Session-based processing allows long-running AI operations without blocking
- Environment variable configuration for all external service credentials
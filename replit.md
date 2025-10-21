# KDP Optimizer AI

## Overview

KDP Optimizer AI is a productivity application designed to automate the optimization of book metadata for Amazon Kindle Direct Publishing (KDP). The application analyzes manuscript content using AI and generates market-specific metadata including titles, descriptions, keywords, categories, and pricing recommendations across multiple Amazon marketplaces (US, Spain, Germany, France, Italy, UK, Brazil).

The tool follows a multi-step workflow: manuscript upload → configuration → AI analysis → results display. It processes book manuscripts to extract themes and entities, researches optimal keywords for each target market, and generates SEO-optimized metadata ready to copy directly into the KDP dashboard.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- Copy-to-clipboard functionality throughout for easy metadata export
- Responsive design with mobile breakpoint at 768px

### Backend Architecture

**Runtime:** Node.js with Express.js framework

**Language:** TypeScript with ES modules

**API Pattern:** RESTful endpoints with Server-Sent Events for progress streaming

**Core Services:**
- **Metadata Generator Service:** Orchestrates the AI-powered optimization workflow
- **Progress Emitter Service:** Manages SSE connections for real-time progress updates to clients
- **Storage Service:** In-memory storage implementation (MemStorage class) for optimization results

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
```

### Data Storage

**Current Implementation:** In-memory storage using Map data structure (MemStorage class)

**Schema:** Drizzle ORM configured for PostgreSQL with schema defined in `shared/schema.ts`

**Database Configuration:** Drizzle Kit configured to use PostgreSQL dialect with migrations in `./migrations` directory

**Data Models:**
- Optimization requests with manuscript text, title, language, target markets, genre, target audience
- Optimization results including market-specific metadata, keywords, pricing, categories
- Progress tracking with stages: uploading, analyzing, researching, generating, complete

**Design Decision Rationale:** Memory storage allows rapid prototyping and testing. The IStorage interface provides abstraction, making it straightforward to swap in PostgreSQL implementation when persistence is needed. Drizzle ORM already configured but not yet connected - infrastructure is ready for database integration.

### External Dependencies

**AI Services:**
- **OpenAI API:** GPT-4o-mini model for manuscript analysis and metadata generation
  - Manuscript analysis: Extracts seed keywords, themes, and named entities
  - Metadata generation: Creates optimized titles, descriptions, and keywords per market
  - Uses JSON mode for structured responses
  - Configuration via environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

**Database:**
- **Neon Database:** Serverless PostgreSQL (configured but not yet actively used)
  - Connection via `@neondatabase/serverless` driver
  - Connection string in `DATABASE_URL` environment variable
  - Drizzle ORM layer ready for integration

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
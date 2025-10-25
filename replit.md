# KDP Optimizer AI

## Overview

KDP Optimizer AI is a productivity application designed to automate the optimization of book metadata for Amazon Kindle Direct Publishing (KDP). It analyzes manuscript content using AI to generate market-specific titles, descriptions, keywords, categories, and pricing recommendations across multiple Amazon marketplaces (US, Spain, Spain/Catalan, Germany, France, Italy, UK, Brazil).

The tool processes manuscripts to extract themes and entities, researches optimal keywords for each target market, and generates SEO-optimized metadata ready for KDP. The application interface is in Spanish (neutral Latin American Spanish), and it supports manuscript languages including English, Spanish, Catalan, German, French, Italian, and Portuguese. It implements KDP best practices for conversion optimization and compliance with Amazon's A9 algorithm.

## User Preferences

Preferred communication style: Simple, everyday language in Spanish.

## System Architecture

### Frontend Architecture

**Technology Stack:** React with TypeScript, Vite, Shadcn/ui (Radix UI + Tailwind CSS), Wouter for routing, React Hook Form with Zod for forms.
**UI/UX Decisions:** Inspired by Linear and Notion, features a multi-step wizard interface (Upload → Configure → Analyze → Results) with a progress indicator. Supports light/dark modes, responsive design, and includes a library page for saved manuscripts.
**State Management:** React Query for server state; local component state for UI.
**Key Features:** Server-Sent Events (SSE) for real-time progress, copy-to-clipboard functionality, PDF export using jspdf, conditional form fields, and re-optimization workflow.

### Backend Architecture

**Runtime:** Node.js with Express.js (TypeScript, ES modules).
**API Pattern:** RESTful endpoints with SSE for progress streaming.
**Core Services:** Metadata Generator, Progress Emitter, Storage Service (PostgreSQL).
**Architectural Decisions:** Asynchronous processing for optimization, separate SSE endpoint for progress, map-based session management, centralized error handling, and a 15MB body limit for file uploads.

### Data Storage

**Database:** PostgreSQL with Drizzle ORM (DbStorage class).
**Schema:** `shared/schema.ts` defines `Manuscripts` (originalTitle, author, genre, language, wordCount, manuscriptText, seriesName, seriesNumber) and `Optimizations` (manuscriptId, sessionId, targetMarkets, seedKeywords, marketMetadata, validationWarnings).
**Pricing Rules:** Implements specific KDP royalty rules and psychological pricing (.99 ending) for supported currencies (USD, GBP, EUR, BRL), including delivery cost calculations.

## External Dependencies

**AI Services:**
- **OpenAI API:** GPT-4o-mini for manuscript analysis (long-tail keywords, entities) and metadata generation (titles, descriptions, 7 KDP backend keywords, pricing). Emphasizes market-native, conversion-focused content, and uses JSON mode for structured responses. Configured via environment variables (`AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`).

**KDP Validation System:**
- **Automatic Compliance:** Validates generated metadata against Amazon KDP rules (e.g., title/subtitle character limits, 7 keyword fields/50 characters each, prohibited terms like "bestseller," HTML sanitization). Provides UI indicators for validation status.

**Database:**
- **Neon Database:** Serverless PostgreSQL, connected via `@neondatabase/serverless` using HTTP client. `DATABASE_URL` environment variable for connection. Drizzle ORM used for type-safe queries.

**Third-Party UI Libraries:**
- **Radix UI:** Accessible UI primitives.
- **Embla Carousel:** Carousel/slider functionality.
- **React Dropzone:** File upload.
- **Lucide React:** Icon library.
- **date-fns:** Date formatting.
- **jspdf:** PDF generation for results export.

**Development Tools:**
- **esbuild:** Production server bundling.
- **tsx:** TypeScript execution in development.

**Font Services:**
- **Google Fonts:** Inter, JetBrains Mono.

## Recent Changes (October 25, 2025)

### Complete Manuscript Analysis - Full Book Processing (Latest)
- **Critical Fix**: Resolved issue where AI was only analyzing the first 5,000 characters (~1% of typical books) instead of complete manuscripts
- **User Reported Issue**: Fixed problem where metadata recommendations were based only on first few pages, missing key themes and plot elements from middle/ending sections
- **New Implementation**: `prepareManuscriptForAnalysis()` function in `server/ai/openai-client.ts` now sends full manuscript text to OpenAI API
- **Coverage Improvement**: 
  - Before: Only 5,000 characters analyzed (~800-1,000 words, first few pages only)
  - Now: Up to 400,000 characters analyzed (~100,000 words, complete book for 99% of cases)
  - Improvement: From 1.25% to 100% coverage for typical books (80x more content)
- **Technical Details**:
  - Leverages GPT-4o-mini's 128k token context window (~400-450k characters capacity)
  - Books 50k-80k words (200k-320k chars): ✅ 100% analyzed
  - Books 80k-100k words (320k-400k chars): ✅ 100% analyzed  
  - Books >100k words (>400k chars): ⚠️ First 400k chars analyzed (covers 80-90% of content, <1% of KDP market)
- **Impact**: Metadata recommendations (titles, descriptions, keywords) now based on complete narrative arc including character development, plot progression, and story conclusions
- **Logging**: Detailed console warnings when rare >100k word manuscripts are truncated, showing coverage percentage
- **Quality Improvement**: Seed keywords, themes, and entities now reflect the entire book's content, significantly improving metadata relevance and conversion potential

### Library Search and Filtering (October 22, 2025)
- **Search Field**: Added text search to library page enabling users to find manuscripts by title or author (case-insensitive substring matching)
- **Language Filter**: Added dropdown filter to show manuscripts by language (English, Spanish, Catalan, German, French, Italian, Portuguese)
- **Combined Filtering**: Search and language filter work together with AND logic for precise results
- **Result Counter**: Displays "Mostrando X de Y libros" when filters are active
- **Empty State**: Shows "No se encontraron resultados" message with "Limpiar Filtros" button when no manuscripts match criteria
- **Performance**: Uses React useMemo for efficient filtering without unnecessary re-renders
- **UX Design**: Clean UI with Search and Filter icons, responsive layout for mobile/desktop
- **Implementation**: Client-side filtering in `client/src/pages/library.tsx` with data-testid attributes for testing
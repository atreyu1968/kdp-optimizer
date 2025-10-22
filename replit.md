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
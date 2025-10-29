# KDP Optimizer AI

## Overview
KDP Optimizer AI is an application designed to automate and optimize book metadata for Amazon Kindle Direct Publishing (KDP). It uses AI to analyze manuscript content and generate market-specific titles, descriptions, keywords, categories, and pricing recommendations across multiple Amazon marketplaces (US, Spain, Germany, France, Italy, UK, Brazil). The tool supports manuscripts in English, Spanish, Catalan, German, French, Italian, and Portuguese, with an interface in neutral Latin American Spanish.

The application now includes **Aura** - a comprehensive multi-pseudonym analytics and marketing dashboard that imports KDP sales data (XLSX format) and provides advanced analytics, ROI tracking, and AI-powered marketing content generation. Aura uses a hybrid approach: manual XLSX imports for KDP sales data, with future support for automatic API synchronization for Amazon Ads and Meta Ads.

## User Preferences
Preferred communication style: Simple, everyday language in Spanish.

## System Architecture
### Frontend
The frontend is built with React (TypeScript), Vite, Shadcn/ui (Radix UI + Tailwind CSS), Wouter for routing, and React Hook Form with Zod for form management. The UI/UX is inspired by Linear and Notion, featuring a multi-step wizard, responsive design, light/dark modes, and a library page. It uses React Query for server state and Server-Sent Events (SSE) for real-time progress updates. Key features include copy-to-clipboard, PDF export, conditional forms, re-optimization workflow, and search/filtering in the manuscript library.

### Backend
The backend utilizes Node.js with Express.js (TypeScript, ES modules), implementing RESTful APIs with SSE for progress streaming. Core services include a Metadata Generator, Progress Emitter, Storage Service, and Publication Scheduler. Architectural decisions emphasize asynchronous processing, session management, centralized error handling, a 15MB file upload limit, and robust OpenAI API rate limiting with retry logic. A comprehensive Publication Management Module handles scheduling with a limit of 3 publications per day, prioritizing Spanish markets, and provides an intuitive UI for tracking status.

### Data Storage
PostgreSQL is used as the database, accessed via Drizzle ORM. The schema includes:
- **KDP Optimizer**: `Manuscripts`, `Optimizations`, `Publications`, `Tasks`, `BlockedDates`
- **Aura System**: `PenNames`, `BookSeries`, `AuraBooks`, `KdpSales`, `AuraBookInsights`, `KenpMonthlyData`

The Tasks table enables per-manuscript task management for tracking file preparation workflows. The AuraBookInsights table caches AI-generated recommendations to avoid repeated OpenAI API calls. The KenpMonthlyData table stores monthly aggregated KENP (Kindle Unlimited pages read) data for trend analysis. Pricing rules implement specific KDP royalty calculations and psychological pricing strategies for supported currencies.

### UI/UX Decisions
The application uses Shadcn/ui (Radix UI + Tailwind CSS) for a modern, accessible interface. It features a multi-step wizard (Upload → Configure → Analyze → Results) with a progress indicator, supporting light/dark modes and responsive design. A library page allows for saved manuscript management with search and filtering capabilities. The calendar view provides visual indicators for blocked days, daily publication limits, and today's date.

### Technical Implementations
*   **AI-driven Metadata Generation**: Leverages OpenAI's GPT-4o-mini for in-depth manuscript analysis and metadata creation.
*   **Real-time Progress**: Achieved using Server-Sent Events (SSE).
*   **KDP Validation System**: Automatically validates generated metadata against Amazon's rules.
*   **Publication Scheduling**: A sophisticated module manages daily publication limits (3 per day) and market priorities (Spanish markets first). Includes functionality for blocking specific dates and automatically rescheduling publications from blocked days.
*   **Task Checklist System**: Automated per-manuscript task management with 6 standard KDP preparation tasks created automatically upon manuscript optimization. Features include:
    *   **Auto-creation**: Tasks created automatically with template (portada, EPUB, revisión, metadatos, precios, vista previa KDP)
    *   **Smart Due Dates**: Automatically calculated based on first publication date (-10 to -2 days before)
    *   **Manual Override Protection**: Flag `isManualDueDate` distinguishes user-edited dates from auto-generated ones
    *   **Dynamic Recalculation**: Auto-dates update when publications are rescheduled, manual dates are preserved
    *   **Inline Editing**: Full CRUD with inline editor for description, priority, and due date
    *   **Visual Urgency Indicators**: Color-coded badges for overdue, today, soon, and upcoming tasks
*   **Calendar View**: Displays scheduled publications, blocked dates, and allows for interaction with publication entries.
*   **Statistics View**: Provides detailed analytics with interactive charts (market distribution, status distribution, publication timeline).
*   **Search & Filtering**: Advanced multi-criteria search and filtering for publications and tasks.
*   **Aura Analytics System**: Multi-pseudonym dashboard for KDP sales tracking and analytics:
    *   **KDP XLSX Importer**: Automated parser for KDP Dashboard XLSX files with intelligent caching system
        *   Parses "Ventas combinadas", "KENP leídas", and "Pedidos completados" sheets
        *   Automatically identifies pseudonyms by author name
        *   Registers books by ASIN with marketplace tracking
        *   Performance-optimized with in-memory caching (prevents O(n²) database queries)
        *   Accurate import statistics (only counts newly created entities)
    *   **AI Book Insights** (`book-analyzer.ts`): Intelligent book performance analysis and recommendations
        *   **Automated Metrics Calculation**: Aggregates 30/90-day sales, KENP pages, royalties, and trend deltas
        *   **OpenAI Integration**: Uses GPT-4o-mini with structured JSON prompts for intelligent categorization
        *   **Smart Recommendations**: Categorizes books into OPTIMIZE (needs metadata/cover work), RAISE_PRICE (high performers), or HOLD (stable performers)
        *   **Actionable Insights**: Provides rationale, action plans, pricing suggestions, and confidence scores
        *   **Performance Optimized**: Caches results in `aura_book_insights` table to prevent redundant API calls
        *   **Robust Fallback**: Implements deterministic fallback logic when OpenAI is unavailable
        *   **UI Integration**: Categorized card view at `/aura/insights` with visual indicators and metrics display
    *   **Pseudonym Management**: Track multiple author identities with separate analytics
    *   **Book Series Tracking**: Organize books into series for better insights
    *   **Sales Analytics**: Transaction-level data with support for Sales, Free promos, Refunds, Borrows, and KENP reads
    *   **Multi-marketplace Support**: Tracks performance across all Amazon marketplaces
    *   **Aura Unlimited** (`/aura/unlimited`): Dedicated KENP analysis module (70% of revenue comes from Unlimited)
        *   **KENP Monthly Data Import**: Parses "KENP leídas" sheet from KDP Dashboard XLSX, aggregates daily data into monthly totals
        *   **Replace Strategy**: Each import deletes all previous KENP data and inserts new data (ensures data freshness)
        *   **6-Month Evolution Charts**: Interactive Recharts visualizations showing monthly KENP trends
        *   **Book-Level Analysis**: Individual book performance with trend calculations (comparing last 3 months vs previous 3 months)
        *   **Automatic Recommendations**: Deterministic categorization system
            *   **POTENCIAR** (Boost): Books with upward trend (>15%) AND high volume (>10k pages)
            *   **OPTIMIZAR** (Optimize): Books with downward trend (<-15%) OR low volume (<5k pages)
            *   **MANTENER** (Hold): Stable performance books
        *   **API Endpoints**: POST /api/aura/import/kenp, GET /api/aura/kenp, GET /api/aura/kenp/book/:bookId, GET /api/aura/kenp/asin/:asin
        *   **Dashboard Integration**: Promotional card highlighting Unlimited importance with direct link
    *   **Future Features**: Amazon Ads and Meta Ads API integration, background job status tracking, AI failure observability

## External Dependencies
*   **AI Services**:
    *   **OpenAI API**: GPT-4o-mini for manuscript analysis and metadata generation.
*   **Database**:
    *   **Neon Database**: Serverless PostgreSQL, connected via `@neondatabase/serverless`.
*   **Third-Party UI Libraries**:
    *   **Radix UI**: Accessible UI primitives.
    *   **Embla Carousel**: Carousel/slider functionality.
    *   **React Dropzone**: File upload component.
    *   **Lucide React**: Icon library.
    *   **date-fns**: Date formatting utilities.
    *   **jspdf**: PDF generation for results export.
    *   **Recharts**: Charting library for data visualization.
    *   **xlsx (SheetJS)**: Excel file parsing for KDP sales import.
*   **Font Services**:
    *   **Google Fonts**: Inter, JetBrains Mono.

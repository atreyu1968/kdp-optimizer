# KDP Optimizer AI

## Overview
KDP Optimizer AI automates and optimizes book metadata for Amazon Kindle Direct Publishing (KDP) across multiple international marketplaces. It uses AI to analyze manuscript content and generate market-specific titles, descriptions, keywords, categories, and pricing recommendations. The application supports manuscripts in English, Spanish, Catalan, German, French, Italian, and Portuguese, with an interface in neutral Latin American Spanish.

A key component, **Aura**, provides a multi-pseudonym analytics and marketing dashboard. Aura imports KDP sales data to offer advanced analytics, ROI tracking, and AI-powered marketing content generation, with future plans for automatic API synchronization with Amazon Ads and Meta Ads.

## User Preferences
Preferred communication style: Simple, everyday language in Spanish.

## System Architecture
### Frontend
The frontend uses React (TypeScript), Vite, Shadcn/ui (Radix UI + Tailwind CSS), Wouter for routing, and React Hook Form with Zod. It features a multi-step wizard, responsive design, light/dark modes, and a library page. React Query manages server state, and Server-Sent Events (SSE) provide real-time progress updates.

### Backend
The backend is built with Node.js and Express.js (TypeScript, ES modules), offering RESTful APIs with SSE for real-time progress. It includes services for Metadata Generation, Progress Emitter, Storage, and Publication Scheduling. Key architectural decisions include asynchronous processing, session management, centralized error handling, and robust OpenAI API rate limiting with retry logic. A Publication Management Module handles scheduling with daily limits and market prioritization.

### Data Storage
PostgreSQL, accessed via Drizzle ORM, is used for data storage. The schema supports both KDP Optimizer functionalities (Manuscripts, Optimizations, Publications, Tasks, BlockedDates) and the Aura System (PenNames, BookSeries, AuraBooks, KdpSales, AuraBookInsights, KenpMonthlyData, AuraBookEvents). The Tasks table enables per-manuscript workflow tracking, while `AuraBookInsights` and `KenpMonthlyData` cache AI-generated recommendations and aggregated KENP data, respectively. `AuraBookEvents` tracks promotional activities.

### UI/UX Decisions
The application utilizes Shadcn/ui for a modern, accessible interface, incorporating a multi-step wizard with a progress indicator, light/dark modes, and responsive design. A library page facilitates saved manuscript management with search and filtering. Calendar and statistics views provide visual data and analytics.

### Technical Implementations
*   **AI-driven Metadata Generation**: Leverages OpenAI's GPT-4o-mini for in-depth manuscript analysis and metadata creation.
*   **Real-time Progress**: Achieved using Server-Sent Events (SSE).
*   **KDP Validation System**: Validates generated metadata against Amazon's rules.
*   **Publication Scheduling**: Manages daily publication limits (3 per day) and market priorities, with functionality for blocking dates and rescheduling.
*   **Task Checklist System**: Automated per-manuscript task management with dynamic due dates, inline editing, and visual urgency indicators.
*   **Aura Analytics System**:
    *   **KDP XLSX Importer**: Parses KDP Dashboard XLSX files across all sheets (Ventas combinadas, KENP leídas, Pedidos gratuitos), identifies pseudonyms, and registers books with marketplace tracking. Automatically detects book types from KDP's "Tipo de regalía" field using multiple detection methods:
        - Descriptive types: "Estándar" → ebook, "Promoción gratuita" → ebook, "Kindle Countdown Deals" → ebook, "KENP leídas" → ebook, "Estándar - Tapa blanda" → paperback, "Estándar - Tapa dura" → hardcover
        - Royalty percentages: "70%", "35%" → ebook (Kindle royalty rates), "60%" → paperback (print book royalty)
        - For sheets without explicit royalty type fields (KENP leídas, Pedidos gratuitos), the importer assigns appropriate values to ensure correct ebook detection
        - Books without sufficient data remain as "unknown" until evidence is available, then auto-update on subsequent imports
        - Filters printed books from KENP analyses
    *   **AI Book Insights**: Uses GPT-4o-mini for intelligent book performance analysis, categorizing books for optimization, pricing, or hold strategies, and caching results.
    *   **Aura Dashboard**: Centralized analytics dashboard displaying monthly aggregated data from KENP and sales imports. Features include:
        - Key metrics: Total pseudonyms (consolidated), unique books (deduplicated by ASIN), total KENP pages, and total royalties in EUR
        - Monthly trends: Income, KENP pages, and units sold visualizations
        - Sales breakdown by book format (ebook, paperback, hardcover)
        - Top 5 performing books by KENP and sales
        - Multi-currency support with automatic EUR conversion
        - Deduplication logic for books across multiple marketplaces
    *   **Aura Unlimited (KENP Analysis)**: Imports and aggregates monthly KENP data for trend analysis, providing book-level insights and recommendations (Boost, Optimize Metadata, Increase Promotion, Hold). Automatically fills missing months with 0 values to accurately detect declining trends.
    *   **Aura Ventas (Sales Analysis)**: Processes combined sales data, discriminating by book type and currency, and offering recommendations based on sales performance (Raise Price, Optimize, Increase Promotion, Hold). Currency-segregated metrics prevent mixing royalties across USD/EUR/GBP. Integrated import button for convenience.
    *   **Aura Seudónimos**: Provides consolidated pseudonym management with grouped books, key metrics, and direct navigation to detailed analytics. Implements ASIN-based deduplication with metadata merging (unique marketplaces, longest subtitle, earliest publish date) to prevent duplicate book listings.
    *   **Book Events System**: Tracks promotional activities and optimizations to correlate with performance changes.
    *   **Calendar Integration**: Imported KDP books can be added to the publications calendar system. When a book is added, a "dummy" manuscript is created with status "published", and publication records are generated for each marketplace. Books already in the calendar are indicated with a "Ver en Calendario" button.

## External Dependencies
*   **AI Services**: OpenAI API (GPT-4o-mini).
*   **Database**: Neon Database (PostgreSQL).
*   **Third-Party UI Libraries**: Radix UI, Embla Carousel, React Dropzone, Lucide React, date-fns, jspdf, Recharts, xlsx (SheetJS).
*   **Font Services**: Google Fonts (Inter, JetBrains Mono).
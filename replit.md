# KDP Optimizer AI

## Overview
KDP Optimizer AI automates and optimizes book metadata for Amazon Kindle Direct Publishing (KDP) across multiple international marketplaces. It uses AI to analyze manuscript content and generate market-specific titles, descriptions, keywords, categories, and pricing recommendations. The application supports manuscripts in English, Spanish, Catalan, German, French, Italian, and Portuguese, with an interface in neutral Latin American Spanish.

A key component, **Aura**, provides a multi-pseudonym analytics and marketing dashboard. Aura imports KDP sales data to offer advanced analytics, ROI tracking, and AI-powered marketing content generation, with future plans for automatic API synchronization with Amazon Ads and Meta Ads.

## User Preferences
Preferred communication style: Simple, everyday language in Spanish.

## System Architecture
### Frontend
The frontend uses React (TypeScript), Vite, Shadcn/ui (Radix UI + Tailwind CSS), Wouter for routing, and React Hook Form with Zod. It features a multi-step wizard, responsive design, light/dark modes, and a library page. React Query manages server state with `staleTime: Infinity` and `refetchOnWindowFocus: false`, requiring explicit refetch calls after data mutations. Server-Sent Events (SSE) provide real-time progress updates.

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
*   **Data Refresh System**: React Query configuration with `staleTime: Infinity` requires explicit `refetch()` calls after mutations. Import dialogs use dual callbacks: `onImportComplete` triggers `Promise.all([refetchKenp(), refetchBooks(), refetchPenNames()])` to force immediate data reload, while `onClose` handles dialog dismissal.
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
    *   **Aura Unlimited (KENP Analysis)**: Imports and aggregates monthly KENP data for trend analysis, providing book-level insights and recommendations (Boost, Optimize Metadata, Increase Promotion, Hold). Automatically fills missing months with 0 values to accurately detect declining trends. Import dialog with dual callbacks: `onImportComplete` triggers explicit refetch of queries, `onClose` handles dialog dismissal.
        - **KENP-Specific Importer**: Uses dedicated `AuraKenpImport` component with endpoint `/api/aura/import/kenp` (replaces all previous KENP data on each import, processes only "KENP leídas" sheet)
    *   **Aura Ventas (Sales Analysis)**: Processes combined sales data, discriminating by book type and currency, and offering recommendations based on sales performance (Raise Price, Optimize, Increase Promotion, Hold). Currency-segregated metrics prevent mixing royalties across USD/EUR/GBP. Integrated import button with explicit data refresh after import completion.
    *   **Aura Seudónimos**: Provides consolidated pseudonym management with grouped books, key metrics, and direct navigation to detailed analytics. Implements ASIN-based deduplication with metadata merging (unique marketplaces, longest subtitle, earliest publish date) to prevent duplicate book listings.
        - **Pen Name Consolidation System**: Detects and merges duplicate pen names that differ only in case or accidental variations. Features include:
            - Automatic duplicate detection using case-insensitive grouping
            - "Consolidar Duplicados" button shows count of duplicates detected
            - Dialog displays all duplicate groups with their IDs and associated book counts
            - Merges all data to the oldest ID (lowest ID number) and deletes duplicates
            - Reassigns 5 types of related data: books, series, sales records, KENP data, and sales monthly data
            - Sequential operations (Neon HTTP driver limitation - no transaction support)
            - Success toast shows detailed statistics: duplicates removed, books/series/sales/KENP/sales data reassigned
            - KDP importer now uses case-insensitive lookup to prevent future duplicates
    *   **Book Events System**: Tracks promotional activities and optimizations to correlate with performance changes. Uses `z.coerce.date()` in `insertBookEventSchema` to accept date strings from HTML input type="date" and convert them automatically to Date objects for PostgreSQL timestamp storage.
    *   **Calendar Integration**: Imported KDP books can be added to the publications calendar system. When a book is added, a "dummy" manuscript is created with status "published", and publication records are generated for each marketplace. Books already in the calendar are indicated with a "Ver en Calendario" button.
    *   **Search and Filter Capabilities**: All Aura management pages (Books, Series, Pen Names) feature comprehensive search and filtering:
        - **Books Page**: Search by title/ASIN, filter by pen name and series (including "Sin serie" option). All filters work in combination with AND logic.
        - **Series Page**: Search by series name, filter by pen name. Combined filtering with automatic pagination adjustment.
        - **Pen Names Page**: Instant search by pen name with case-insensitive matching.
        - All filters use `useMemo` for efficient data filtering, reset pagination to page 1 when changed, and display appropriate empty states when no results match.

## External Dependencies
*   **AI Services**: OpenAI API (GPT-4o-mini).
*   **Database**: Neon Database (PostgreSQL).
*   **Third-Party UI Libraries**: Radix UI, Embla Carousel, React Dropzone, Lucide React, date-fns, jspdf, Recharts, xlsx (SheetJS).
*   **Font Services**: Google Fonts (Inter, JetBrains Mono).

## Recent Bug Fixes (October 2025)
*   **apiRequest Parameter Order**: Fixed incorrect parameter order in multiple locations. The `apiRequest` function signature is `(method, url, data)` but was being called as `(url, method, data)` in event creation, pseudonym CRUD operations, and other API calls. Corrected in:
    - `client/src/pages/aura-pen-names.tsx`: Event creation, pseudonym create/update/delete
    - `client/src/pages/aura-unlimited.tsx`: Event creation
*   **Event Date Validation**: Fixed date format incompatibility in book events. HTML `<input type="date">` returns strings in "YYYY-MM-DD" format, but the schema expected Date objects. Added `z.coerce.date()` to `insertBookEventSchema` in `shared/schema.ts` to automatically convert date strings to Date objects for PostgreSQL timestamp fields.
*   **SelectItem Empty Value Bug**: Fixed crash when editing books caused by Shadcn/Radix UI's prohibition of empty string values in `<SelectItem>`. The "Sin serie" option used `value=""` which caused runtime errors. Changed to `value="none"` with special handling in `onValueChange` to convert "none" to `null` for database storage. This fix ensures:
    - Book edit dialogs open correctly without crashes
    - Series selection properly handles null values (no series assigned)
    - Round-trip data integrity: null → "Sin serie" display → null on save
    - Affected files: `client/src/pages/aura-books.tsx` (both create and edit forms)
*   **Consolidation Toast Values**: Fixed "undefined" values in consolidation success toast. The `apiRequest` function returns a `Response` object, not parsed JSON. Added `.json()` call in mutation: `const res = await apiRequest(...); return await res.json();` to properly parse the response and display numeric statistics in the toast message.
*   **Consolidation UI Refresh**: Fixed UI not updating after successful consolidation. With `staleTime: Infinity` in React Query config, `invalidateQueries()` only marks data as stale without refetching. Added explicit `refetch()` calls: `await Promise.all([refetchPenNames(), refetchBooks()])` in mutation `onSuccess` to force immediate data reload, ensuring the consolidation dialog and counter update correctly after merging duplicates.
*   **CRUD Operations UI Refresh (Books & Series)**: Applied the same `refetch()` pattern to all CRUD operations in `aura-books.tsx` and `aura-series.tsx`. After create/edit/delete operations, the UI now updates immediately by calling explicit `refetch()` functions (`refetchBooks()`, `refetchSeries()`) after `invalidateQueries()`. This ensures that with `staleTime: Infinity`, users see changes instantly without needing to refresh the page. Affected operations: create book, edit book, delete book, create series, edit series, delete series.
*   **Aura Unlimited Trend Analysis Improvements** (October 2025): Simplified and enhanced trend analysis:
    - **Simplified Calculation**: Changed from comparing 3-month averages to simple month-over-month comparison (último mes completo vs mes anterior). This is more intuitive and reflects recent performance better.
    - **Percentage Capping**: Limited trend percentages to ±999% to avoid confusingly large numbers when comparing periods with very low baseline values
    - **Irregular Pattern Detection**: Automatically detects atypical spikes (>500% change) that indicate promotional activity rather than organic growth
    - **Improved Recommendations**: When irregular patterns are detected, recommendations prioritize overall volume over percentage trends, with specific guidance like "Bajo volumen con patrón irregular (probablemente pico promocional)"
    - **Visual Indicators**: Books with irregular patterns display "Patrón irregular" label and use orange color coding instead of green/red to indicate the analysis should be interpreted differently
    - This solves confusion when a book shows +2132% trend but has "Bajo volumen" recommendation - the percentage was calculated from a very low baseline period, and the system now explains this clearly
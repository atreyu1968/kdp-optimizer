# KDP Optimizer AI

## Overview
KDP Optimizer AI automates and optimizes book metadata for Amazon Kindle Direct Publishing (KDP) across multiple international marketplaces. It uses AI to analyze manuscript content and generate market-specific titles, descriptions, keywords, categories, and pricing recommendations. The application supports manuscripts in English, Spanish, Catalan, German, French, Italian, and Portuguese, with an interface in neutral Latin American Spanish.

A key component, **Aura**, provides a multi-pseudonym analytics and marketing dashboard. Aura imports KDP sales data to offer advanced analytics, ROI tracking, and AI-powered marketing content generation.

## User Preferences
Preferred communication style: Simple, everyday language in Spanish.

## System Architecture
### Frontend
The frontend uses React (TypeScript), Vite, Shadcn/ui (Radix UI + Tailwind CSS), Wouter for routing, and React Hook Form with Zod. It features a multi-step wizard, responsive design, light/dark modes, and a library page. React Query manages server state, requiring explicit refetch calls after data mutations. Server-Sent Events (SSE) provide real-time progress updates.

### Backend
The backend is built with Node.js and Express.js (TypeScript, ES modules), offering RESTful APIs with SSE for real-time progress. It includes services for Metadata Generation, Progress Emitter, Storage, and Publication Scheduling. Key architectural decisions include asynchronous processing, session management, centralized error handling, and robust OpenAI API rate limiting with retry logic. A Publication Management Module handles scheduling with daily limits and market prioritization.

### Data Storage
PostgreSQL, accessed via Drizzle ORM, is used for data storage. The schema supports both KDP Optimizer functionalities (Manuscripts, Optimizations, Publications, Tasks, BlockedDates) and the Aura System (PenNames, BookSeries, AuraBooks, KdpSales, AuraBookInsights, KenpMonthlyData, AuraBookEvents).

### UI/UX Decisions
The application utilizes Shadcn/ui for a modern, accessible interface, incorporating a multi-step wizard, light/dark modes, and responsive design. A library page facilitates saved manuscript management with search and filtering. Calendar and statistics views provide visual data and analytics.

### Technical Implementations
*   **AI-driven Metadata Generation**: Leverages OpenAI's GPT-4o-mini for in-depth manuscript analysis and metadata creation.
*   **Real-time Progress**: Achieved using Server-Sent Events (SSE).
*   **KDP Validation System**: Validates generated metadata against Amazon's rules.
*   **Publication Scheduling**: Manages daily publication limits and market priorities.
*   **Task Checklist System**: Automated per-manuscript task management with dynamic due dates and urgency indicators.
*   **Aura Analytics System**: Imports and processes KDP sales and KENP data, offering multi-pseudonym analytics, AI-powered book insights (Boost, Optimize Metadata, Increase Promotion, Hold), and trend analysis. It includes a robust KDP XLSX importer, a pen name consolidation system, and a book events system for tracking promotional activities.
*   **Organic Marketing Kit**: The system includes an **Organic Marketing Kit** providing AI-generated strategies and content such as TikTok Hooks, Instagram post ideas, Pinterest descriptions, hashtags, lead magnet ideas, review CTAs, and free promotion strategies, based on manuscript analysis (literary tropes, audience insights, emotional hooks). It also implements a 4-type keyword strategy and synopsis as copywriting.
*   **SEO for Book Landing Pages**: Automatic generation of SEO metadata for each market including: SEO Title (50-60 chars), SEO Description (150-160 chars), SEO Keywords (8-12), and Open Graph tags for social sharing. Displayed in results panel with character count validation and copy buttons.
*   **Search and Filter Capabilities**: Comprehensive search and filtering are available across all Aura management pages (Books, Series, Pen Names).

## External Dependencies
*   **AI Services**: OpenAI API (GPT-4o-mini).
*   **Database**: Neon Database (PostgreSQL).
*   **Third-Party UI Libraries**: Radix UI, Embla Carousel, React Dropzone, Lucide React, date-fns, jspdf, Recharts, xlsx (SheetJS).
*   **Font Services**: Google Fonts (Inter, JetBrains Mono).
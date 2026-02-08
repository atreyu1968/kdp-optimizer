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
The backend is built with Node.js and Express.js (TypeScript, ES modules), offering RESTful APIs with SSE for real-time progress. It includes services for Metadata Generation, Progress Emitter, Storage, and Publication Scheduling. Key architectural decisions include asynchronous processing, session management, centralized error handling, and robust DeepSeek API rate limiting with retry logic. A Publication Management Module handles scheduling with daily limits and market prioritization.

### Data Storage
Replit's built-in PostgreSQL database, accessed via Drizzle ORM with the `pg` driver (`drizzle-orm/node-postgres`), is used for data storage. The schema supports both KDP Optimizer functionalities (Manuscripts, Optimizations, Publications, Tasks, BlockedDates) and the Aura System (PenNames, BookSeries, AuraBooks, KdpSales, AuraBookInsights, KenpMonthlyData, AuraBookEvents).

### UI/UX Decisions
The application utilizes Shadcn/ui for a modern, accessible interface, incorporating a multi-step wizard, light/dark modes, and responsive design. A library page facilitates saved manuscript management with search and filtering. Calendar and statistics views provide visual data and analytics.

### Technical Implementations
*   **AI-driven Metadata Generation**: Leverages DeepSeek API (`deepseek-chat` model) for in-depth manuscript analysis and metadata creation. Uses the OpenAI-compatible SDK with DeepSeek's base URL (`https://api.deepseek.com`). Configuration: `DEEPSEEK_API_KEY` environment variable.
*   **Real-time Progress**: Achieved using Server-Sent Events (SSE).
*   **KDP Validation System**: Validates generated metadata against Amazon's rules.
*   **Publication Scheduling**: Manages daily publication limits and market priorities.
*   **Task Checklist System**: Automated per-manuscript task management with dynamic due dates and urgency indicators.
*   **Aura Analytics System**: Imports and processes KDP sales and KENP data, offering multi-pseudonym analytics, AI-powered book insights (Boost, Optimize Metadata, Increase Promotion, Hold), and trend analysis. It includes a robust KDP XLSX importer, a pen name consolidation system, and a book events system for tracking promotional activities.
*   **Organic Marketing Kit**: The system includes an **Organic Marketing Kit** providing AI-generated strategies and content such as TikTok Hooks, Instagram post ideas, Pinterest descriptions, hashtags, lead magnet ideas, review CTAs, and free promotion strategies, based on manuscript analysis (literary tropes, audience insights, emotional hooks). It also implements a 4-type keyword strategy and synopsis as copywriting.
*   **4-Type Keyword Strategy Display**: Backend keywords now display their strategic type (GÉNERO, PÚBLICO, TROPOS, AMBIENTACIÓN/SOLUCIÓN, EMOCIÓN, SINÓNIMOS, COMPARABLES) with color-coded badges and tooltips showing good/bad examples. The display adapts for fiction vs. non-fiction books.
*   **Niche Categories for Author Central**: The marketing kit now suggests 5 additional low-competition Amazon categories with competitiveness indicators (baja/media/alta), reasons for each suggestion, and instructions on how to request them via KDP Support or Author Central.
*   **Facebook Groups Content**: AI-generated post ideas for reader-focused Facebook groups, designed for organic community participation rather than obvious self-promotion.
*   **30-Day Marketing Plan**: A complete personalized calendar following the "Reto de 30 Días" strategy with weekly phases: Week 1 (Foundation), Week 2 (Content Creation), Week 3 (Community Building), Week 4 (Promotion Campaign). Each day includes a specific 15-30 minute task.
*   **SEO for Book Landing Pages**: Automatic generation of SEO metadata for each market including: SEO Title (50-60 chars), SEO Description (150-160 chars), SEO Keywords (8-12), and Open Graph tags for social sharing. Displayed in results panel with character count validation and copy buttons.
*   **Search and Filter Capabilities**: Comprehensive search and filtering are available across all Aura management pages (Books, Series, Pen Names).
*   **Parallel Chapter Processing (AudiobookForge)**: Audiobook synthesis now processes 3 chapters simultaneously using batch-based parallelism. This significantly reduces total processing time for multi-chapter books. Configuration: `PARALLEL_CHAPTER_LIMIT=3`, `STUCK_JOB_TIMEOUT=60min`. The system uses resilient error handling - failed chapters don't block other chapters, and progress is reported in real-time.
*   **Multi-Credential Google Cloud TTS**: Secure management system for multiple Google Cloud service account credentials. Credentials are encrypted using AES-256-GCM with a master key (`GOOGLE_TTS_MASTER_KEY` - 64 hex chars). Features: credential CRUD with validation via Google API, cached TextToSpeechClient instances per credential ID, voice listing per credential, and project-level credential selection. UI accessible via Settings tab in AudiobookForge.
*   **EPUB3 Parser with SSML Support**: Dedicated EPUB3 parser (`server/services/epub-parser.ts`) that extracts content from EPUB files while preserving SSML annotations. Supports: ssml:ph (phoneme pronunciation), ssml:alphabet (IPA, x-sampa), and PLS (Pronunciation Lexicon Specification) files. SSML annotations are stored in the database and used directly by Polly/Google TTS synthesizers for accurate pronunciation of proper nouns, neologisms, and heteronyms.
*   **Sala de Contenido Social (Social Content Room)**: Feature that generates platform-specific social media posts for book promotion across Instagram, Facebook, Twitter/X, Pinterest, TikTok, and LinkedIn. Uses Marketing Kit data when available, with graceful fallback to generic content. Supports cover image uploads (10MB limit, JPEG/PNG/WebP), drag-and-drop interface, copy-to-clipboard functionality, and optimal posting times. Access via `/social-content-room/:manuscriptId` or through Library page. Security: Path traversal protection in cover deletion, file cleanup on errors.
*   **Qwen 3 TTS Integration**: AudiobookForge now supports Qwen 3 TTS from Alibaba Cloud DashScope as a third TTS provider alongside Amazon Polly and Google Cloud TTS. Features: 49 voices, 10 languages (English, Spanish, German, French, Italian, Portuguese, Chinese, Japanese, Korean, Russian), chunked synthesis for long texts, parallel chapter processing, and ACX-compliant audio mastering. Configuration: `DASHSCOPE_API_KEY` (API key from Alibaba Cloud Model Studio), optional `DASHSCOPE_REGION` (intl or cn, defaults to intl). API endpoints: `/api/audiobooks/qwen-status`, `/api/audiobooks/qwen-voices`, `/api/audiobooks/projects/:id/synthesize-qwen`.
*   **Reeditor**: AI-powered text reduction tool for novels. Accepts .txt/.docx uploads, custom user guidelines, and target word count. Uses DeepSeek (`deepseek-chat`) to reduce text while preserving author voice and key plot points. Processes in ~15k character chunks to avoid token limits. Access via `/reeditor`. API endpoints: `/api/reeditor/analyze`, `/api/reeditor/reduce`.
*   **Password Protection**: Optional password gate for the entire application. When `APP_PASSWORD` environment variable is set, all API endpoints (except `/api/auth/*`) require authentication via an HTTP-only cookie token. The frontend shows a login page before granting access. Auth endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/check`. Tokens are stored in-memory (server restart requires re-login). If `APP_PASSWORD` is not set, the app runs without password protection.

## External Dependencies
*   **AI Services**: DeepSeek API (`deepseek-chat` model, OpenAI-compatible SDK).
*   **Database**: Replit built-in PostgreSQL (pg driver via `drizzle-orm/node-postgres`).
*   **Third-Party UI Libraries**: Radix UI, Embla Carousel, React Dropzone, Lucide React, date-fns, jspdf, Recharts, xlsx (SheetJS).
*   **Font Services**: Google Fonts (Inter, JetBrains Mono).
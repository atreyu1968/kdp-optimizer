# KDP Optimizer AI

## Overview

KDP Optimizer AI is a productivity application designed to automate the optimization of book metadata for Amazon Kindle Direct Publishing (KDP). It analyzes manuscript content using AI to generate market-specific titles, descriptions, keywords, categories, and pricing recommendations across multiple Amazon marketplaces (US, Spain, Spain/Catalan, Germany, France, Italy, UK, Brazil). The tool processes manuscripts to extract themes and entities, researches optimal keywords for each target market, and generates SEO-optimized metadata ready for KDP. The application interface is in Spanish (neutral Latin American Spanish), and it supports manuscript languages including English, Spanish, Catalan, German, French, Italian, and Portuguese. It implements KDP best practices for conversion optimization and compliance with Amazon's A9 algorithm.

The project's ambition is to streamline the KDP publishing process, enhance discoverability, and improve sales for authors by leveraging AI-driven insights for metadata generation and strategic publication scheduling.

## User Preferences

Preferred communication style: Simple, everyday language in Spanish.

## System Architecture

### Frontend Architecture

**Technology Stack:** React with TypeScript, Vite, Shadcn/ui (Radix UI + Tailwind CSS), Wouter for routing, React Hook Form with Zod for forms.
**UI/UX Decisions:** Inspired by Linear and Notion, features a multi-step wizard interface (Upload → Configure → Analyze → Results) with a progress indicator. Supports light/dark modes, responsive design, and includes a library page for saved manuscripts.
**State Management:** React Query for server state; local component state for UI.
**Key Features:** Server-Sent Events (SSE) for real-time progress, copy-to-clipboard functionality, PDF export using jspdf, conditional form fields, re-optimization workflow, and library search/filtering.

### Backend Architecture

**Runtime:** Node.js with Express.js (TypeScript, ES modules).
**API Pattern:** RESTful endpoints with SSE for progress streaming.
**Core Services:** Metadata Generator, Progress Emitter, Storage Service (PostgreSQL), Publication Scheduler.
**Architectural Decisions:** Asynchronous processing for optimization, separate SSE endpoint for progress, map-based session management, centralized error handling, and a 15MB body limit for file uploads. Includes robust OpenAI API rate limiting protection with retry logic and call spacing, and strategic manuscript sampling for token optimization on large inputs.
**Publication Management Module:** Introduces a comprehensive system for managing KDP publications, including automatic scheduling with a limit of 3 publications per day, priority for Spanish markets (amazon.es, amazon.es-ca), and an intuitive UI for tracking publication status across different markets.

### Data Storage

**Database:** PostgreSQL with Drizzle ORM (DbStorage class).
**Schema:** Defines `Manuscripts` (originalTitle, author, genre, language, wordCount, manuscriptText, seriesName, seriesNumber), `Optimizations` (manuscriptId, sessionId, targetMarkets, seedKeywords, marketMetadata, validationWarnings), and `Publications` (manuscriptId, market, status, scheduledDate, publishedDate, kdpUrl, notes).
**Pricing Rules:** Implements specific KDP royalty rules and psychological pricing (.99 ending) for supported currencies (USD, GBP, EUR, BRL), including delivery cost calculations.

## External Dependencies

**AI Services:**
- **OpenAI API:** GPT-4o-mini for manuscript analysis (long-tail keywords, entities) and metadata generation (titles, descriptions, 7 KDP backend keywords, pricing). Uses JSON mode for structured responses and is configured via environment variables.

**KDP Validation System:**
- **Automatic Compliance:** Validates generated metadata against Amazon KDP rules (e.g., title/subtitle character limits, 7 keyword fields/50 characters each, prohibited terms, HTML sanitization).

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

## Recent Changes (October 27, 2025)

### Edición y Eliminación de Publicaciones (Latest)
- **Nueva Funcionalidad**: Usuarios ahora pueden editar y borrar publicaciones KDP directamente desde la interfaz
- **Menú Contextual de Acciones**:
  - Añadido ícono de 3 puntos (⋮) en cada tarjeta de mercado
  - Menú dropdown con opciones según estado de publicación
  - Opciones para publicaciones programadas: Marcar como publicado, Reprogramar fecha, Eliminar
  - Opciones para publicaciones publicadas: Ver en KDP (si tiene URL), Eliminar
- **Diálogo de Reprogramación** (`ReschedulePublicationDialog`):
  - Permite cambiar fecha de publicaciones programadas
  - Calendar component con locale español
  - Validación: fecha debe ser hoy o posterior
  - Actualización automática via API POST `/api/publications/:id/reschedule`
- **Diálogo de Eliminación** (`DeletePublicationDialog`):
  - Confirmación obligatoria antes de eliminar
  - Warning box con información detallada
  - Estilo destructive para prevenir clicks accidentales
  - DELETE `/api/publications/:id`
- **Invalidación de Cache**: Ambas acciones invalidan automáticamente cache de React Query
- **UX Mejorada**: Menú compacto que mantiene UI limpia, opciones destructivas visualmente diferenciadas
- **Archivos Modificados/Creados**:
  - `client/src/components/reschedule-publication-dialog.tsx` (nuevo)
  - `client/src/components/delete-publication-dialog.tsx` (nuevo)
  - `client/src/pages/publications.tsx` (menú dropdown integrado)

### KDP Publication Management Module (October 27, 2025)
- **New Feature**: Módulo completo de gestión de publicaciones en Amazon KDP con control de límites diarios y prioridad español
- **Base de Datos**:
  - Nueva tabla `publications` con campos: manuscriptId, market, status (pending/scheduled/published), scheduledDate, publishedDate, kdpUrl, notes
  - Foreign key relationship con manuscripts
  - Timestamps automáticos (createdAt, updatedAt)
- **Backend - Servicio de Programación** (`server/services/publication-scheduler.ts`):
  - **Límite automático**: Máximo 3 publicaciones por día respetado automáticamente
  - **Prioridad español**: Orden fijo de mercados con amazon.es primero, seguido de amazon.es-ca
  - **Programación inteligente**: Algoritmo que encuentra próxima fecha disponible recursivamente
  - `generatePublicationSchedule()`: Genera calendario completo para manuscrito
  - `getNextAvailableDate()`: Busca hasta 365 días adelante
  - `reschedulePublication()`: Reprograma con validación de límites
  - `markPublicationAsPublished()`: Marca como publicada con fecha actual
  - `getPublicationStats()`: Estadísticas por estado y mercado
- **Backend - API Endpoints** (`server/routes.ts`):
  - GET `/api/publications` - Todas las publicaciones
  - GET `/api/publications/manuscript/:id` - Publicaciones por manuscrito
  - POST `/api/publications/schedule` - Generar programación automática
  - POST `/api/publications` - Crear publicación manual
  - PUT `/api/publications/:id` - Actualizar publicación
  - POST `/api/publications/:id/reschedule` - Reprogramar fecha
  - POST `/api/publications/:id/publish` - Marcar como publicada (incluye kdpUrl opcional)
  - DELETE `/api/publications/:id` - Eliminar publicación
  - GET `/api/publications/stats` - Estadísticas globales
- **Frontend - Página de Publicaciones** (`client/src/pages/publications.tsx`):
  - **3 tabs**: Por Manuscrito (completo), Calendario (placeholder), Estadísticas (placeholder)
  - **Dashboard de métricas**: Cards con totales (publicados, programados, pendientes)
  - **Vista por manuscrito**:
    - Grid de 8 mercados Amazon con flags, estado visual, fechas
    - Badges de color por estado: Verde (publicado), Azul (programado), Gris (pendiente)
    - Botón "Programar X mercados" para pendientes
    - Menú contextual con acciones por mercado
  - **Diálogo de Programación** (`SchedulePublicationsDialog`):
    - Preview de mercados ordenados por prioridad
    - Badge "Prioridad español" en amazon.es
    - Input de fecha de inicio personalizable
    - Validación y confirmación
  - **Diálogo Marcar Publicada** (`MarkPublishedDialog`):
    - Input opcional de KDP URL
    - Marca con fecha actual automática
    - Actualización inmediata de estado
  - **Navegación**: Botón "Publicaciones" añadido en header con icono calendario
- **Flujo de Usuario**:
  1. Usuario sube manuscrito y genera metadata
  2. Navega a "Publicaciones"
  3. Ve manuscrito con mercados sin programar
  4. Click "Programar 8 mercados" → Diálogo con preview
  5. Selecciona fecha inicio → Sistema programa respetando 3/día
  6. Mercados cambian a "Programado" con fechas asignadas
  7. Al publicar en KDP real → Click menú (⋮) → "Marcar como publicado"
  8. Opcionalmente pega URL de KDP → Confirma
  9. Estado cambia a "Publicado" + opciones en menú
  10. Para editar fecha: menú (⋮) → "Reprogramar fecha"
  11. Para eliminar: menú (⋮) → "Eliminar publicación"
- **Características Completas**:
  - ✅ Programación automática con límite 3/día
  - ✅ Prioridad español (ES → ES-CA → otros)
  - ✅ UI intuitiva con estados visuales
  - ✅ Tracking por manuscrito y mercado
  - ✅ Modificación manual de estados
  - ✅ Reprogramar fechas de publicación
  - ✅ Eliminar publicaciones con confirmación
  - ✅ Enlaces directos a KDP
  - ✅ Estadísticas básicas
  - ✅ Cache invalidation automática
  - ✅ Data-testids para testing E2E
- **Mejoras Futuras Identificadas**:
  - Timezone-aware dates (UTC storage + user locale rendering)
  - Database constraints (UNIQUE manuscriptId+market)
  - Transacciones para prevenir race conditions
  - Optimizar búsqueda de fechas con COUNT() SQL
  - Vista de calendario mensual interactiva
  - Estadísticas detalladas por periodo
  - Drag & drop para reprogramar
  - Bulk actions
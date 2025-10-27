# KDP Optimizer AI

## Overview
KDP Optimizer AI is an application designed to automate and optimize book metadata for Amazon Kindle Direct Publishing (KDP). It uses AI to analyze manuscript content and generate market-specific titles, descriptions, keywords, categories, and pricing recommendations across multiple Amazon marketplaces (US, Spain, Germany, France, Italy, UK, Brazil). The tool supports manuscripts in English, Spanish, Catalan, German, French, Italian, and Portuguese, with an interface in neutral Latin American Spanish. Its core purpose is to enhance discoverability and improve sales for authors by providing AI-driven insights and streamlining the KDP publishing process.

## User Preferences
Preferred communication style: Simple, everyday language in Spanish.

## System Architecture
### Frontend
The frontend is built with React (TypeScript), Vite, Shadcn/ui (Radix UI + Tailwind CSS), Wouter for routing, and React Hook Form with Zod for form management. The UI/UX is inspired by Linear and Notion, featuring a multi-step wizard, responsive design, light/dark modes, and a library page. It uses React Query for server state and Server-Sent Events (SSE) for real-time progress updates. Key features include copy-to-clipboard, PDF export, conditional forms, re-optimization workflow, and search/filtering in the manuscript library.

### Backend
The backend utilizes Node.js with Express.js (TypeScript, ES modules), implementing RESTful APIs with SSE for progress streaming. Core services include a Metadata Generator, Progress Emitter, Storage Service, and Publication Scheduler. Architectural decisions emphasize asynchronous processing, session management, centralized error handling, a 15MB file upload limit, and robust OpenAI API rate limiting with retry logic. A comprehensive Publication Management Module handles scheduling with a limit of 3 publications per day, prioritizing Spanish markets, and provides an intuitive UI for tracking status.

### Data Storage
PostgreSQL is used as the database, accessed via Drizzle ORM. The schema includes `Manuscripts`, `Optimizations`, `Publications`, and `Tasks` tables. The Tasks table enables per-manuscript task management for tracking file preparation workflows. Pricing rules implement specific KDP royalty calculations and psychological pricing strategies for supported currencies.

### UI/UX Decisions
The application uses Shadcn/ui (Radix UI + Tailwind CSS) for a modern, accessible interface. It features a multi-step wizard (Upload → Configure → Analyze → Results) with a progress indicator, supporting light/dark modes and responsive design. A library page allows for saved manuscript management with search and filtering capabilities.

### Technical Implementations
*   **AI-driven Metadata Generation**: Leverages OpenAI's GPT-4o-mini for in-depth manuscript analysis and metadata creation.
*   **Real-time Progress**: Achieved using Server-Sent Events (SSE).
*   **KDP Validation System**: Automatically validates generated metadata against Amazon's rules.
*   **Publication Scheduling**: A sophisticated module manages daily publication limits (3 per day) and market priorities (Spanish markets first).
*   **Search & Filtering**: Advanced multi-criteria search and filtering for publications, including text search, status filters (published, scheduled, unpublished), and market filters. Includes robust handling for null/undefined fields and a clear UI for results and filter clearing.

## External Dependencies
*   **AI Services**:
    *   **OpenAI API**: GPT-4o-mini for manuscript analysis and metadata generation.
*   **Database**:
    *   **Neon Database**: Serverless PostgreSQL, connected via `@neondatabase/serverless`. Drizzle ORM is used for type-safe queries.
*   **Third-Party UI Libraries**:
    *   **Radix UI**: Accessible UI primitives.
    *   **Embla Carousel**: Carousel/slider functionality.
    *   **React Dropzone**: File upload component.
    *   **Lucide React**: Icon library.
    *   **date-fns**: Date formatting utilities.
    *   **jspdf**: PDF generation for results export.
*   **Font Services**:
    *   **Google Fonts**: Inter, JetBrains Mono.
## Recent Changes (October 27, 2025)

### Sistema de Checklist de Tareas (Latest)
**Nueva Funcionalidad**: Sistema completo de gestión de tareas pendientes por manuscrito para trackear preparación de archivos multi-idioma

#### Tabla Tasks en Base de Datos
- **Schema**: id (serial), manuscriptId (FK), description (text), priority (1=Alta, 2=Media, 3=Baja), completed (0/1), createdAt, updatedAt
- **Migración**: Ejecutada exitosamente con `npm run db:push`
- **Storage Interface**: 6 métodos CRUD (getAllTasks, getTasksByManuscript, createTask, updateTask, toggleTaskCompleted, deleteTask)

#### Endpoints API REST
- **GET** `/api/tasks/manuscript/:id` - Obtener tareas de un manuscrito (ordenadas por prioridad)
- **POST** `/api/tasks` - Crear nueva tarea (validación con Zod schema)
- **PUT** `/api/tasks/:id` - Actualizar tarea
- **POST** `/api/tasks/:id/toggle` - Toggle estado completado (automático)
- **DELETE** `/api/tasks/:id` - Eliminar tarea

#### Componente TaskChecklist UI
- **Props**: manuscriptId, manuscriptTitle
- **Funcionalidades**:
  - Añadir tareas con descripción y prioridad (Alta/Media/Baja)
  - Marcar/desmarcar como completadas con checkbox (sin disabled para UX fluida)
  - Eliminar tareas mediante menú desplegable
  - Ordenamiento: tareas incompletas primero, luego por prioridad
  - Estilo tachado para tareas completadas
  - Contador "X de Y completadas"
- **React Query**: Invalidación automática de cache tras mutaciones (create/toggle/delete)
- **Data-testids**: Completos para todos los elementos interactivos (17+ testids)

#### Integración en Publicaciones
- **Ubicación**: Pestaña "Por Manuscrito" en `/publications`, debajo del grid de mercados
- **Scope**: Un checklist independiente por cada manuscrito
- **UX**: Card integrada con título, descripción, botón "Añadir"
- **Testing E2E**: ✅ Completado - Crear, toggle, eliminar tareas funcionando correctamente

**Archivos**: `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `client/src/components/task-checklist.tsx`, `client/src/pages/publications.tsx`
**Mejoras futuras**: Drag & drop para reordenar prioridades, edición inline de descripción, filtros por prioridad, exportar checklist a PDF

### Vista de Calendario y Estadísticas
**Nueva Funcionalidad**: Vistas completas de Calendario mensual y Estadísticas detalladas con gráficos interactivos

#### Vista de Calendario Mensual
- **Navegación**: Botones anterior/siguiente + botón "Hoy" para navegar entre meses
- **Grid**: 7 columnas (Lun-Dom), muestra días del mes + adyacentes, min-height 100px por celda
- **Publicaciones por día**: Muestra hasta 3 publicaciones (flag + título truncado), indicador "+X más"
- **Indicadores visuales**: Día actual (border azul), límite 3/día (badge rojo), días fuera del mes (atenuado)
- **Lógica**: Usa `isSameDay()` para agrupar publicaciones por fecha
- **Estado**: `currentMonth` (Date), data-testids completos

#### Vista de Estadísticas (5 secciones con Recharts)
1. **Distribución por Mercado** (BarChart): 8 mercados, barras apiladas (publicadas/programadas), tooltip customizado, 400px
2. **Distribución por Estado** (PieChart): 3 segmentos con porcentajes, filtra valores 0, tooltip, 300px
3. **Timeline de Publicaciones** (AreaChart): 19 meses (12 atrás + 6 adelante), gradientes verde/azul, curva suavizada, 350px
4. **Métricas Adicionales**: 7 métricas calculadas (cobertura, publicación, próximas 7 días)
5. **Mercados Principales**: Top 5 ranking con barras de progreso

#### Implementación Técnica
- **Imports**: Recharts (BarChart, PieChart, AreaChart, Line), date-fns (startOfMonth, isSameDay, addMonths), lucide-react (ChevronLeft/Right, MapPin, BarChart3)
- **Variables CSS**: `--chart-1/2/3` (verde/azul/gris) en index.css light/dark mode
- **Fix crítico**: Cambio de `parseISO()` a `new Date()` para manejo robusto de fechas (evita Invalid Date)
- **Testing E2E**: ✅ Completado - Navegación, visualización, gráficos, tooltips, responsive

**Archivos**: `client/src/pages/publications.tsx`
**Mejoras futuras**: Memoización, click en días del calendario, exportar gráficos, filtros adicionales, vista anual

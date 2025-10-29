import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { optimizationRequestSchema, insertPublicationSchema, insertTaskSchema, insertPenNameSchema, insertBookSeriesSchema, insertAuraBookSchema, insertBookEventSchema } from "@shared/schema";
import { generateOptimizationResult } from "./services/metadata-generator";
import { ProgressEmitter } from "./services/progress-emitter";
import { z } from "zod";
import {
  generatePublicationSchedule,
  reschedulePublication,
  getPublicationStats,
  markPublicationAsPublished,
} from "./services/publication-scheduler";
import { createDefaultTasks, updateTaskDueDates } from "./services/default-tasks";
import { importKdpXlsx, importKenpMonthlyData, processSalesMonthlyData } from "./services/kdp-importer";
import { analyzeAllBooks, getEnrichedInsights } from "./services/book-analyzer";
import multer from "multer";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

export async function registerRoutes(app: Express): Promise<Server> {
  const progressEmitters = new Map<string, ProgressEmitter>();
  
  // Configurar multer para upload de archivos XLSX
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `kdp-${uniqueSuffix}.xlsx`);
      }
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.mimetype === 'application/vnd.ms-excel') {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten archivos Excel (.xlsx)'));
      }
    },
    limits: {
      fileSize: 15 * 1024 * 1024 // 15MB límite
    }
  });

  app.get("/api/optimize/progress/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    
    // Obtener el emitter que fue creado proactivamente en el POST endpoint
    let emitter = progressEmitters.get(sessionId);
    if (!emitter) {
      // Fallback: crear uno nuevo si no existe (no debería suceder en flujo normal)
      emitter = new ProgressEmitter();
      progressEmitters.set(sessionId, emitter);
    }

    emitter.setResponse(res);
  });

  app.post("/api/optimize", async (req, res) => {
    const sessionId = `session-${Date.now()}`;
    
    // Crear emitter proactivamente para asegurar que siempre podemos emitir errores
    let emitter = new ProgressEmitter();
    progressEmitters.set(sessionId, emitter);
    
    res.json({ sessionId });

    setImmediate(async () => {
      try {
        let attempts = 0;
        // Aumentado a 15 segundos (150 intentos × 100ms) para conexiones lentas en producción
        while (attempts < 150 && !emitter.hasConnection()) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (!emitter.hasConnection()) {
          console.error(`[SSE] No se pudo establecer conexión SSE para sesión ${sessionId} después de 15 segundos. Cliente debe manejar timeout.`);
          progressEmitters.delete(sessionId);
          // No intentamos emitir error porque no hay response conectada.
          // El EventSource del cliente debe detectar que no puede conectar y disparar onerror.
          return;
        }
        
        console.log(`[SSE] Conexión establecida para sesión ${sessionId}, iniciando optimización...`);

        const validation = optimizationRequestSchema.safeParse(req.body);

        if (!validation.success) {
          emitter.emit("error", "Invalid request data: " + validation.error.errors.map(e => e.message).join(", "), 0);
          emitter.complete(null);
          progressEmitters.delete(sessionId);
          return;
        }

        const result = await generateOptimizationResult(
          validation.data,
          (stage, message, progress, currentMarket) => {
            emitter.emit(stage, message, progress, currentMarket);
          }
        );

        const wordCount = validation.data.manuscriptText.split(/\s+/).length;
        const manuscriptData = {
          originalTitle: validation.data.originalTitle,
          author: validation.data.author,
          genre: validation.data.genre,
          targetAudience: validation.data.targetAudience,
          language: validation.data.language,
          manuscriptText: validation.data.manuscriptText,
          wordCount: wordCount,
          seriesName: validation.data.seriesName,
          seriesNumber: validation.data.seriesNumber,
        };

        const { manuscript } = await storage.saveOptimizationWithManuscript(
          manuscriptData,
          result.id,
          validation.data.targetMarkets,
          result.seedKeywords,
          result.marketResults
        );

        // Crear tareas predeterminadas para el nuevo manuscrito
        const defaultTasks = createDefaultTasks(manuscript.id);
        for (const taskData of defaultTasks) {
          await storage.createTask(taskData);
        }

        setTimeout(() => {
          emitter.complete(result);
          progressEmitters.delete(sessionId);
        }, 500);
      } catch (error) {
        console.error("Optimization error:", error);
        const emitter = progressEmitters.get(sessionId);
        if (emitter) {
          emitter.emit("error", error instanceof Error ? error.message : "Unknown error", 0);
          emitter.complete(null);
          progressEmitters.delete(sessionId);
        }
      }
    });
  });

  app.get("/api/manuscripts", async (req, res) => {
    try {
      const manuscripts = await storage.getAllManuscripts();
      res.json(manuscripts);
    } catch (error) {
      console.error("Error fetching manuscripts:", error);
      res.status(500).json({ error: "Failed to fetch manuscripts" });
    }
  });

  app.get("/api/manuscripts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid manuscript ID" });
        return;
      }

      const manuscript = await storage.getManuscript(id);
      if (!manuscript) {
        res.status(404).json({ error: "Manuscript not found" });
        return;
      }

      res.json(manuscript);
    } catch (error) {
      console.error("Error fetching manuscript:", error);
      res.status(500).json({ error: "Failed to fetch manuscript" });
    }
  });

  app.get("/api/manuscripts/:id/optimizations", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid manuscript ID" });
        return;
      }

      const optimizations = await storage.getOptimizationsByManuscriptId(id);
      res.json(optimizations);
    } catch (error) {
      console.error("Error fetching optimizations:", error);
      res.status(500).json({ error: "Failed to fetch optimizations" });
    }
  });

  app.post("/api/manuscripts/:id/reoptimize", async (req, res) => {
    const sessionId = `session-${Date.now()}`;
    
    // Crear emitter proactivamente para asegurar que siempre podemos emitir errores
    let emitter = new ProgressEmitter();
    progressEmitters.set(sessionId, emitter);
    
    res.json({ sessionId });

    setImmediate(async () => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          console.error("Invalid manuscript ID");
          return;
        }

        let attempts = 0;
        // Aumentado a 15 segundos (150 intentos × 100ms) para conexiones lentas en producción
        while (attempts < 150 && !emitter.hasConnection()) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (!emitter.hasConnection()) {
          console.error(`[SSE] No se pudo establecer conexión SSE para re-optimización ${sessionId} después de 15 segundos. Cliente debe manejar timeout.`);
          progressEmitters.delete(sessionId);
          // No intentamos emitir error porque no hay response conectada.
          // El EventSource del cliente debe detectar que no puede conectar y disparar onerror.
          return;
        }
        
        console.log(`[SSE] Conexión establecida para re-optimización ${sessionId}, iniciando...`);

        const manuscript = await storage.getManuscript(id);
        if (!manuscript) {
          emitter.emit("error", "Manuscript not found", 0);
          emitter.complete(null);
          progressEmitters.delete(sessionId);
          return;
        }

        const { targetMarkets, language } = req.body;
        if (!targetMarkets || !Array.isArray(targetMarkets) || targetMarkets.length === 0) {
          emitter.emit("error", "Target markets are required", 0);
          emitter.complete(null);
          progressEmitters.delete(sessionId);
          return;
        }

        const optimizationRequest = {
          manuscriptText: manuscript.manuscriptText,
          originalTitle: manuscript.originalTitle,
          author: manuscript.author,
          language: language || manuscript.language || "es",
          targetMarkets,
          genre: manuscript.genre,
          targetAudience: manuscript.targetAudience || undefined,
          seriesName: manuscript.seriesName || undefined,
          seriesNumber: manuscript.seriesNumber || undefined,
        };

        const result = await generateOptimizationResult(
          optimizationRequest,
          (stage, message, progress, currentMarket) => {
            emitter.emit(stage, message, progress, currentMarket);
          }
        );

        await storage.saveOptimizationWithManuscript(
          {
            originalTitle: manuscript.originalTitle,
            author: manuscript.author,
            genre: manuscript.genre,
            targetAudience: manuscript.targetAudience,
            language: manuscript.language,
            manuscriptText: manuscript.manuscriptText,
            wordCount: manuscript.wordCount,
            seriesName: manuscript.seriesName,
            seriesNumber: manuscript.seriesNumber,
          },
          result.id,
          targetMarkets,
          result.seedKeywords,
          result.marketResults,
          id
        );

        // Si el manuscrito no tiene tareas, crear las predeterminadas
        const existingTasks = await storage.getTasksByManuscript(id);
        if (existingTasks.length === 0) {
          const defaultTasks = createDefaultTasks(id);
          for (const taskData of defaultTasks) {
            await storage.createTask(taskData);
          }
        }

        setTimeout(() => {
          emitter.complete(result);
          progressEmitters.delete(sessionId);
        }, 500);
      } catch (error) {
        console.error("Reoptimization error:", error);
        const emitter = progressEmitters.get(sessionId);
        if (emitter) {
          emitter.emit("error", error instanceof Error ? error.message : "Unknown error", 0);
          emitter.complete(null);
          progressEmitters.delete(sessionId);
        }
      }
    });
  });

  // ============ PUBLICATION ENDPOINTS ============
  
  // Obtener todas las publicaciones
  app.get("/api/publications", async (req, res) => {
    try {
      const publications = await storage.getAllPublications();
      res.json(publications);
    } catch (error) {
      console.error("Error fetching publications:", error);
      res.status(500).json({ error: "Failed to fetch publications" });
    }
  });

  // Obtener publicaciones de un manuscrito específico
  app.get("/api/publications/manuscript/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid manuscript ID" });
        return;
      }

      const publications = await storage.getPublicationsByManuscript(id);
      res.json(publications);
    } catch (error) {
      console.error("Error fetching manuscript publications:", error);
      res.status(500).json({ error: "Failed to fetch manuscript publications" });
    }
  });

  // Generar programación automática para un manuscrito
  app.post("/api/publications/schedule", async (req, res) => {
    try {
      const { manuscriptId, markets, startDate } = req.body;

      if (!manuscriptId || !markets || !Array.isArray(markets)) {
        res.status(400).json({ error: "manuscriptId and markets are required" });
        return;
      }

      const start = startDate ? new Date(startDate) : undefined;
      const publications = await generatePublicationSchedule(manuscriptId, markets, start);

      // Actualizar las fechas límite de las tareas basándose en la primera publicación
      if (publications.length > 0) {
        const firstPublication = publications[0];
        if (firstPublication.scheduledDate) {
          await updateTaskDueDates(manuscriptId, new Date(firstPublication.scheduledDate));
        }
      }

      res.json({ 
        success: true, 
        count: publications.length,
        publications 
      });
    } catch (error) {
      console.error("Error generating schedule:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate schedule" });
    }
  });

  // Crear una publicación manualmente
  app.post("/api/publications", async (req, res) => {
    try {
      const validation = insertPublicationSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({ 
          error: "Invalid publication data",
          details: validation.error.errors
        });
        return;
      }

      const publication = await storage.createPublication(validation.data);
      res.json(publication);
    } catch (error) {
      console.error("Error creating publication:", error);
      res.status(500).json({ error: "Failed to create publication" });
    }
  });

  // Actualizar una publicación
  app.put("/api/publications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid publication ID" });
        return;
      }

      const publication = await storage.updatePublication(id, req.body);
      res.json(publication);
    } catch (error) {
      console.error("Error updating publication:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update publication" });
    }
  });

  // Reprogramar una publicación
  app.post("/api/publications/:id/reschedule", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid publication ID" });
        return;
      }

      const { newDate } = req.body;
      if (!newDate) {
        res.status(400).json({ error: "newDate is required" });
        return;
      }

      const publication = await reschedulePublication(id, new Date(newDate));
      res.json(publication);
    } catch (error) {
      console.error("Error rescheduling publication:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to reschedule publication" });
    }
  });

  // Marcar como publicada
  app.post("/api/publications/:id/publish", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid publication ID" });
        return;
      }

      const { kdpUrl } = req.body;
      const publication = await markPublicationAsPublished(id, kdpUrl);
      res.json(publication);
    } catch (error) {
      console.error("Error marking publication as published:", error);
      res.status(500).json({ error: "Failed to mark publication as published" });
    }
  });

  // Eliminar una publicación
  app.delete("/api/publications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid publication ID" });
        return;
      }

      await storage.deletePublication(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting publication:", error);
      res.status(500).json({ error: "Failed to delete publication" });
    }
  });

  // Obtener estadísticas de publicaciones
  app.get("/api/publications/stats", async (req, res) => {
    try {
      const stats = await getPublicationStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching publication stats:", error);
      res.status(500).json({ error: "Failed to fetch publication stats" });
    }
  });

  // ============ TASK ENDPOINTS ============

  // Obtener todas las tareas con información del manuscrito
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getAllTasksWithManuscriptInfo();
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Obtener tareas de un manuscrito específico
  app.get("/api/tasks/manuscript/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid manuscript ID" });
        return;
      }

      const tasks = await storage.getTasksByManuscript(id);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks for manuscript:", error);
      res.status(500).json({ error: "Failed to fetch tasks for manuscript" });
    }
  });

  // Crear una tarea
  app.post("/api/tasks", async (req, res) => {
    try {
      const validation = insertTaskSchema.safeParse(req.body);
      
      if (!validation.success) {
        res.status(400).json({ error: "Invalid task data", details: validation.error.errors });
        return;
      }

      const task = await storage.createTask(validation.data);
      res.json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  // Actualizar una tarea
  app.put("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid task ID" });
        return;
      }

      // Si se actualiza la fecha límite, marcarla como manual y convertir a Date
      const updates = { ...req.body };
      if (updates.dueDate !== undefined) {
        // Convertir string ISO a objeto Date si es necesario
        if (typeof updates.dueDate === 'string') {
          updates.dueDate = new Date(updates.dueDate);
        }
        updates.isManualDueDate = 1;
      }

      const task = await storage.updateTask(id, updates);
      res.json(task);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Marcar/desmarcar tarea como completada
  app.post("/api/tasks/:id/toggle", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid task ID" });
        return;
      }

      const task = await storage.toggleTaskCompleted(id);
      res.json(task);
    } catch (error) {
      console.error("Error toggling task:", error);
      res.status(500).json({ error: "Failed to toggle task" });
    }
  });

  // Eliminar una tarea
  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid task ID" });
        return;
      }

      await storage.deleteTask(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // ========== BLOCKED DATES ENDPOINTS ==========

  // Obtener todos los días bloqueados
  app.get("/api/blocked-dates", async (req, res) => {
    try {
      const blockedDates = await storage.getAllBlockedDates();
      res.json(blockedDates);
    } catch (error) {
      console.error("Error fetching blocked dates:", error);
      res.status(500).json({ error: "Failed to fetch blocked dates" });
    }
  });

  // Obtener días bloqueados en un rango de fechas
  app.get("/api/blocked-dates/range", async (req, res) => {
    try {
      const { start, end } = req.query;
      if (!start || !end) {
        res.status(400).json({ error: "Start and end dates are required" });
        return;
      }

      const startDate = new Date(start as string);
      const endDate = new Date(end as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({ error: "Invalid date format" });
        return;
      }

      const blockedDates = await storage.getBlockedDatesByRange(startDate, endDate);
      res.json(blockedDates);
    } catch (error) {
      console.error("Error fetching blocked dates by range:", error);
      res.status(500).json({ error: "Failed to fetch blocked dates" });
    }
  });

  // Crear un día bloqueado (y reasignar publicaciones automáticamente)
  app.post("/api/blocked-dates", async (req, res) => {
    try {
      const { date, reason } = req.body;
      if (!date) {
        res.status(400).json({ error: "Date is required" });
        return;
      }

      const blockedDate = new Date(date);
      if (isNaN(blockedDate.getTime())) {
        res.status(400).json({ error: "Invalid date format" });
        return;
      }

      // Crear el día bloqueado
      const created = await storage.createBlockedDate({ 
        date: blockedDate, 
        reason: reason || null 
      });

      // Reasignar publicaciones automáticamente
      const rescheduled = await storage.reschedulePublicationsFromBlockedDate(blockedDate);

      res.json({ 
        blockedDate: created, 
        rescheduledPublications: rescheduled,
        rescheduledCount: rescheduled.length
      });
    } catch (error) {
      console.error("Error creating blocked date:", error);
      res.status(500).json({ error: "Failed to create blocked date" });
    }
  });

  // Eliminar un día bloqueado
  app.delete("/api/blocked-dates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid blocked date ID" });
        return;
      }

      await storage.deleteBlockedDate(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting blocked date:", error);
      res.status(500).json({ error: "Failed to delete blocked date" });
    }
  });

  // ============ AURA ENDPOINTS ============

  // ========== PEN NAMES (SEUDÓNIMOS) ==========

  // Obtener todos los seudónimos
  app.get("/api/aura/pen-names", async (req, res) => {
    try {
      const penNames = await storage.getAllPenNames();
      res.json(penNames);
    } catch (error) {
      console.error("Error fetching pen names:", error);
      res.status(500).json({ error: "Failed to fetch pen names" });
    }
  });

  // Obtener un seudónimo por ID
  app.get("/api/aura/pen-names/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid pen name ID" });
        return;
      }

      const penName = await storage.getPenName(id);
      if (!penName) {
        res.status(404).json({ error: "Pen name not found" });
        return;
      }

      res.json(penName);
    } catch (error) {
      console.error("Error fetching pen name:", error);
      res.status(500).json({ error: "Failed to fetch pen name" });
    }
  });

  // Crear un nuevo seudónimo
  app.post("/api/aura/pen-names", async (req, res) => {
    try {
      const validation = insertPenNameSchema.safeParse(req.body);
      
      if (!validation.success) {
        res.status(400).json({ 
          error: "Invalid pen name data",
          details: validation.error.errors
        });
        return;
      }

      const penName = await storage.createPenName(validation.data);
      res.json(penName);
    } catch (error) {
      console.error("Error creating pen name:", error);
      res.status(500).json({ error: "Failed to create pen name" });
    }
  });

  // Actualizar un seudónimo
  app.put("/api/aura/pen-names/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid pen name ID" });
        return;
      }

      const penName = await storage.updatePenName(id, req.body);
      res.json(penName);
    } catch (error) {
      console.error("Error updating pen name:", error);
      res.status(500).json({ error: "Failed to update pen name" });
    }
  });

  // Eliminar un seudónimo
  app.delete("/api/aura/pen-names/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid pen name ID" });
        return;
      }

      await storage.deletePenName(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting pen name:", error);
      
      // Enviar mensaje de error más específico si está disponible
      const errorMessage = error instanceof Error ? error.message : "Failed to delete pen name";
      res.status(400).json({ error: errorMessage });
    }
  });

  // ========== SERIES ==========

  // Obtener todas las series
  app.get("/api/aura/series", async (req, res) => {
    try {
      const series = await storage.getAllBookSeries();
      res.json(series);
    } catch (error) {
      console.error("Error fetching series:", error);
      res.status(500).json({ error: "Failed to fetch series" });
    }
  });

  // Crear una nueva serie
  app.post("/api/aura/series", async (req, res) => {
    try {
      const validation = insertBookSeriesSchema.safeParse(req.body);
      
      if (!validation.success) {
        res.status(400).json({ 
          error: "Invalid series data",
          details: validation.error.errors
        });
        return;
      }

      const series = await storage.createBookSeries(validation.data);
      res.json(series);
    } catch (error) {
      console.error("Error creating series:", error);
      res.status(500).json({ error: "Failed to create series" });
    }
  });

  // Actualizar una serie
  app.put("/api/aura/series/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid series ID" });
        return;
      }

      const series = await storage.updateBookSeries(id, req.body);
      res.json(series);
    } catch (error) {
      console.error("Error updating series:", error);
      res.status(500).json({ error: "Failed to update series" });
    }
  });

  // Eliminar una serie
  app.delete("/api/aura/series/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid series ID" });
        return;
      }

      await storage.deleteBookSeries(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting series:", error);
      res.status(500).json({ error: "Failed to delete series" });
    }
  });

  // ========== AURA BOOKS ==========

  // Obtener todos los libros
  app.get("/api/aura/books", async (req, res) => {
    try {
      const books = await storage.getAllAuraBooks();
      res.json(books);
    } catch (error) {
      console.error("Error fetching aura books:", error);
      res.status(500).json({ error: "Failed to fetch aura books" });
    }
  });

  // Obtener un libro por ID
  app.get("/api/aura/books/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }

      const book = await storage.getAuraBook(id);
      if (!book) {
        res.status(404).json({ error: "Book not found" });
        return;
      }

      res.json(book);
    } catch (error) {
      console.error("Error fetching aura book:", error);
      res.status(500).json({ error: "Failed to fetch aura book" });
    }
  });

  // Crear un nuevo libro
  app.post("/api/aura/books", async (req, res) => {
    try {
      const validation = insertAuraBookSchema.safeParse(req.body);
      
      if (!validation.success) {
        res.status(400).json({ 
          error: "Invalid book data",
          details: validation.error.errors
        });
        return;
      }

      const book = await storage.createAuraBook(validation.data);
      res.json(book);
    } catch (error) {
      console.error("Error creating aura book:", error);
      res.status(500).json({ error: "Failed to create aura book" });
    }
  });

  // Actualizar un libro
  app.put("/api/aura/books/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }

      const book = await storage.updateAuraBook(id, req.body);
      res.json(book);
    } catch (error) {
      console.error("Error updating aura book:", error);
      res.status(500).json({ error: "Failed to update aura book" });
    }
  });

  // Eliminar un libro
  app.delete("/api/aura/books/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }

      await storage.deleteAuraBook(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting aura book:", error);
      res.status(500).json({ error: "Failed to delete aura book" });
    }
  });

  // ========== KDP SALES & IMPORT ==========

  // Importar archivo XLSX de KDP
  app.post("/api/aura/import/kdp", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      console.log(`[KDP Import] Procesando archivo: ${req.file.filename}`);
      
      const stats = await importKdpXlsx(req.file.path);
      
      // Procesar ventas mensuales (discriminando por tipo de libro)
      console.log(`[KDP Import] Procesando datos de ventas mensuales...`);
      const salesStats = await processSalesMonthlyData(stats.importBatchId || 'unknown');
      
      res.json({
        success: true,
        message: "Importación completada exitosamente",
        stats: {
          ...stats,
          salesMonthlyRecords: salesStats.monthlyRecordsCreated,
        }
      });
    } catch (error) {
      console.error("Error importing KDP file:", error);
      res.status(500).json({ 
        error: "Failed to import KDP file",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Obtener datos de ventas mensuales (para Aura Ventas)
  app.get("/api/aura/sales", async (req, res) => {
    try {
      const salesData = await storage.getAllSalesMonthlyData();
      res.json(salesData);
    } catch (error) {
      console.error("Error fetching sales monthly data:", error);
      res.status(500).json({ error: "Failed to fetch sales monthly data" });
    }
  });

  // Obtener ventas por libro
  app.get("/api/aura/sales/book/:bookId", async (req, res) => {
    try {
      const bookId = parseInt(req.params.bookId);
      if (isNaN(bookId)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }

      const sales = await storage.getKdpSalesByBook(bookId);
      res.json(sales);
    } catch (error) {
      console.error("Error fetching sales by book:", error);
      res.status(500).json({ error: "Failed to fetch sales by book" });
    }
  });

  // Obtener ventas por seudónimo
  app.get("/api/aura/sales/pen-name/:penNameId", async (req, res) => {
    try {
      const penNameId = parseInt(req.params.penNameId);
      if (isNaN(penNameId)) {
        res.status(400).json({ error: "Invalid pen name ID" });
        return;
      }

      const sales = await storage.getKdpSalesByPenName(penNameId);
      res.json(sales);
    } catch (error) {
      console.error("Error fetching sales by pen name:", error);
      res.status(500).json({ error: "Failed to fetch sales by pen name" });
    }
  });

  // ========== AURA UNLIMITED - KENP MONTHLY DATA ==========

  // Importar archivo XLSX de KENP (Aura Unlimited)
  app.post("/api/aura/import/kenp", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      console.log(`[KENP Import] Procesando archivo: ${req.file.filename}`);
      
      const stats = await importKenpMonthlyData(req.file.path);
      
      res.json({
        success: true,
        message: "Importación KENP completada exitosamente. Datos anteriores reemplazados.",
        stats
      });
    } catch (error) {
      console.error("Error importing KENP file:", error);
      res.status(500).json({ 
        error: "Failed to import KENP file",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Obtener todos los datos KENP mensuales
  app.get("/api/aura/kenp", async (req, res) => {
    try {
      const kenpData = await storage.getAllKenpMonthlyData();
      res.json(kenpData);
    } catch (error) {
      console.error("Error fetching KENP data:", error);
      res.status(500).json({ error: "Failed to fetch KENP data" });
    }
  });

  // Obtener datos KENP por libro
  app.get("/api/aura/kenp/book/:bookId", async (req, res) => {
    try {
      const bookId = parseInt(req.params.bookId);
      if (isNaN(bookId)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }

      const kenpData = await storage.getKenpMonthlyDataByBook(bookId);
      res.json(kenpData);
    } catch (error) {
      console.error("Error fetching KENP data by book:", error);
      res.status(500).json({ error: "Failed to fetch KENP data by book" });
    }
  });

  // Obtener datos KENP por ASIN
  app.get("/api/aura/kenp/asin/:asin", async (req, res) => {
    try {
      const asin = req.params.asin;
      const kenpData = await storage.getKenpMonthlyDataByAsin(asin);
      res.json(kenpData);
    } catch (error) {
      console.error("Error fetching KENP data by ASIN:", error);
      res.status(500).json({ error: "Failed to fetch KENP data by ASIN" });
    }
  });

  // ========== AURA VENTAS (SALES MONTHLY DATA) ==========

  // Obtener todos los datos de ventas mensuales
  app.get("/api/aura/sales", async (req, res) => {
    try {
      const salesData = await storage.getAllSalesMonthlyData();
      res.json(salesData);
    } catch (error) {
      console.error("Error fetching sales data:", error);
      res.status(500).json({ error: "Failed to fetch sales data" });
    }
  });

  // Obtener datos de ventas por libro
  app.get("/api/aura/sales/book/:bookId", async (req, res) => {
    try {
      const bookId = parseInt(req.params.bookId);
      if (isNaN(bookId)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }

      const salesData = await storage.getSalesMonthlyDataByBook(bookId);
      res.json(salesData);
    } catch (error) {
      console.error("Error fetching sales data by book:", error);
      res.status(500).json({ error: "Failed to fetch sales data by book" });
    }
  });

  // Obtener datos de ventas por ASIN
  app.get("/api/aura/sales/asin/:asin", async (req, res) => {
    try {
      const asin = req.params.asin;
      const salesData = await storage.getSalesMonthlyDataByAsin(asin);
      res.json(salesData);
    } catch (error) {
      console.error("Error fetching sales data by ASIN:", error);
      res.status(500).json({ error: "Failed to fetch sales data by ASIN" });
    }
  });

  // ========== BOOK EVENTS (PROMOCIONES, OPTIMIZACIONES) ==========

  // Obtener todos los eventos
  app.get("/api/aura/events", async (req, res) => {
    try {
      const events = await storage.getAllBookEvents();
      res.json(events);
    } catch (error) {
      console.error("Error fetching book events:", error);
      res.status(500).json({ error: "Failed to fetch book events" });
    }
  });

  // Obtener eventos por libro
  app.get("/api/aura/events/book/:bookId", async (req, res) => {
    try {
      const bookId = parseInt(req.params.bookId);
      if (isNaN(bookId)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }

      const events = await storage.getBookEventsByBook(bookId);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events by book:", error);
      res.status(500).json({ error: "Failed to fetch events by book" });
    }
  });

  // Obtener eventos por ASIN
  app.get("/api/aura/events/asin/:asin", async (req, res) => {
    try {
      const asin = req.params.asin;
      const events = await storage.getBookEventsByAsin(asin);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events by ASIN:", error);
      res.status(500).json({ error: "Failed to fetch events by ASIN" });
    }
  });

  // Crear nuevo evento
  app.post("/api/aura/events", async (req, res) => {
    try {
      const eventData = insertBookEventSchema.parse(req.body);
      const event = await storage.createBookEvent(eventData);
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid event data", details: error.errors });
        return;
      }
      console.error("Error creating book event:", error);
      res.status(500).json({ error: "Failed to create book event" });
    }
  });

  // Actualizar evento
  app.put("/api/aura/events/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid event ID" });
        return;
      }

      const eventData = insertBookEventSchema.partial().parse(req.body);
      const event = await storage.updateBookEvent(id, eventData);
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid event data", details: error.errors });
        return;
      }
      console.error("Error updating book event:", error);
      res.status(500).json({ error: "Failed to update book event" });
    }
  });

  // Eliminar evento
  app.delete("/api/aura/events/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid event ID" });
        return;
      }

      await storage.deleteBookEvent(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting book event:", error);
      res.status(500).json({ error: "Failed to delete book event" });
    }
  });

  // ========== BOOK INSIGHTS (AI ANALYSIS) ==========

  // Obtener todos los insights con información enriquecida
  app.get("/api/aura/insights", async (req, res) => {
    try {
      const insights = await getEnrichedInsights();
      res.json(insights);
    } catch (error) {
      console.error("Error fetching insights:", error);
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  // Analizar todos los libros (puede tardar)
  app.post("/api/aura/analyze-books", async (req, res) => {
    try {
      // Ejecutar análisis en segundo plano
      analyzeAllBooks().catch(err => {
        console.error("Error during book analysis:", err);
      });

      res.json({ 
        success: true, 
        message: "Análisis iniciado. Los resultados se mostrarán en breve." 
      });
    } catch (error) {
      console.error("Error starting book analysis:", error);
      res.status(500).json({ error: "Failed to start book analysis" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

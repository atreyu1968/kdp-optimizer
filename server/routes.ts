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
import { parseWordDocument } from "./services/word-parser";
import { synthesizeProject, getAvailableVoices, validateAwsCredentials, recoverPendingJobs } from "./services/polly-synthesizer";
import multer from "multer";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";

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

  // Multer para Word documents (AudiobookForge)
  const uploadWord = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const ext = file.originalname.split('.').pop() || 'docx';
        cb(null, `manuscript-${uniqueSuffix}.${ext}`);
      }
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.mimetype === 'application/msword') {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten archivos Word (.doc, .docx)'));
      }
    },
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB límite para manuscritos largos
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
          result.marketResults,
          undefined, // existingManuscriptId
          result.marketingKit,
          result.landingPageContent,
          result.analysis
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
          id, // existingManuscriptId
          result.marketingKit,
          result.landingPageContent,
          result.analysis
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

  // Consolidar seudónimos duplicados
  app.post("/api/aura/pen-names/consolidate", async (req, res) => {
    try {
      const { name } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: "El nombre del seudónimo es requerido" });
        return;
      }

      const stats = await storage.consolidatePenNames(name.trim());
      res.json(stats);
    } catch (error) {
      console.error("Error consolidating pen names:", error);
      
      const errorMessage = error instanceof Error ? error.message : "Failed to consolidate pen names";
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

  // Agregar libro de Aura al calendario de publicaciones
  app.post("/api/aura/books/:id/add-to-calendar", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }

      const result = await storage.addAuraBookToCalendar(id);
      res.json(result);
    } catch (error) {
      console.error("Error adding book to calendar:", error);
      res.status(500).json({ 
        error: "Failed to add book to calendar",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Verificar si libro está en calendario
  app.get("/api/aura/books/:id/in-calendar", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }

      const manuscriptId = await storage.checkIfAuraBookInCalendar(id);
      res.json({ 
        inCalendar: manuscriptId !== null,
        manuscriptId 
      });
    } catch (error) {
      console.error("Error checking if book in calendar:", error);
      res.status(500).json({ error: "Failed to check calendar status" });
    }
  });

  // Agregar TODOS los libros de Aura al calendario
  app.post("/api/aura/books/add-all-to-calendar", async (req, res) => {
    try {
      console.log("[Add All to Calendar] Iniciando importación masiva...");
      
      const result = await storage.addAllAuraBooksToCalendar();
      
      console.log(`[Add All to Calendar] Completado: ${result.added} agregados, ${result.skipped} omitidos, ${result.errors.length} errores`);
      
      res.json({
        success: true,
        added: result.added,
        skipped: result.skipped,
        errors: result.errors,
        message: `Se agregaron ${result.added} libros al calendario. ${result.skipped} ya estaban en el calendario.`
      });
    } catch (error) {
      console.error("Error adding all books to calendar:", error);
      res.status(500).json({ 
        error: "Failed to add all books to calendar",
        message: error instanceof Error ? error.message : "Unknown error"
      });
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

  // ============ AUDIOBOOKFORGE ENDPOINTS ============

  // Obtener todos los proyectos de audiolibro
  app.get("/api/audiobooks/projects", async (req, res) => {
    try {
      const projects = await storage.getAllAudiobookProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching audiobook projects:", error);
      res.status(500).json({ error: "Failed to fetch audiobook projects" });
    }
  });

  // Obtener un proyecto específico
  app.get("/api/audiobooks/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      const project = await storage.getAudiobookProject(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      res.json(project);
    } catch (error) {
      console.error("Error fetching audiobook project:", error);
      res.status(500).json({ error: "Failed to fetch audiobook project" });
    }
  });

  // Crear un nuevo proyecto de audiolibro
  app.post("/api/audiobooks/projects", async (req, res) => {
    try {
      const project = await storage.createAudiobookProject(req.body);
      res.json(project);
    } catch (error) {
      console.error("Error creating audiobook project:", error);
      res.status(500).json({ error: "Failed to create audiobook project" });
    }
  });

  // Actualizar un proyecto
  app.put("/api/audiobooks/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      const project = await storage.updateAudiobookProject(id, req.body);
      res.json(project);
    } catch (error) {
      console.error("Error updating audiobook project:", error);
      res.status(500).json({ error: "Failed to update audiobook project" });
    }
  });

  // Eliminar un proyecto
  app.delete("/api/audiobooks/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      await storage.deleteAudiobookProject(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting audiobook project:", error);
      res.status(500).json({ error: "Failed to delete audiobook project" });
    }
  });

  // Obtener capítulos de un proyecto
  app.get("/api/audiobooks/projects/:id/chapters", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      const chapters = await storage.getChaptersByProject(id);
      res.json(chapters);
    } catch (error) {
      console.error("Error fetching chapters:", error);
      res.status(500).json({ error: "Failed to fetch chapters" });
    }
  });

  // Verificar estado de credenciales AWS
  app.get("/api/audiobooks/settings/status", async (req, res) => {
    try {
      const hasAccessKeyId = !!process.env.AWS_ACCESS_KEY_ID;
      const hasSecretAccessKey = !!process.env.AWS_SECRET_ACCESS_KEY;
      const hasRegion = !!process.env.AWS_REGION;
      const hasBucketName = !!process.env.S3_BUCKET_NAME;
      const allConfigured = hasAccessKeyId && hasSecretAccessKey && hasRegion && hasBucketName;

      res.json({
        hasAccessKeyId,
        hasSecretAccessKey,
        hasRegion,
        hasBucketName,
        allConfigured,
      });
    } catch (error) {
      console.error("Error checking AWS status:", error);
      res.status(500).json({ error: "Failed to check AWS status" });
    }
  });

  // Upload documento Word y crear proyecto con capítulos
  app.post("/api/audiobooks/upload", uploadWord.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No se recibió ningún archivo" });
        return;
      }

      const { voiceId, voiceLocale, engine, author, speechRate, title } = req.body;

      // Leer el archivo y parsearlo
      const fileBuffer = readFileSync(req.file.path);
      const parsed = await parseWordDocument(fileBuffer, req.file.originalname);

      // Crear el proyecto con status "ready" para que esté listo para sintetizar
      // Usar título del formulario, o el del documento, o el nombre del archivo
      const project = await storage.createAudiobookProject({
        title: title || parsed.title,
        author: author || null,
        sourceFileName: req.file.originalname,
        voiceId: voiceId || "Lucia",
        voiceLocale: voiceLocale || "es-ES",
        engine: engine || "neural",
        speechRate: speechRate || "90%", // ACX default: 90% for better comprehension
        status: "ready",
        totalChapters: parsed.chapters.length,
        completedChapters: 0,
        errorMessage: null,
      });

      // Crear los capítulos
      for (const chapter of parsed.chapters) {
        await storage.createAudiobookChapter({
          projectId: project.id,
          sequenceNumber: chapter.sequenceNumber,
          title: chapter.title,
          contentText: chapter.contentText,
          contentSsml: null,
          characterCount: chapter.characterCount,
          estimatedDurationSeconds: chapter.estimatedDurationSeconds,
        });
      }

      // Limpiar archivo temporal
      try {
        unlinkSync(req.file.path);
      } catch (e) {
        console.warn("[AudiobookForge] Could not delete temp file:", e);
      }

      // Obtener capítulos creados
      const chapters = await storage.getChaptersByProject(project.id);

      res.json({
        project,
        chapters,
        summary: {
          totalChapters: parsed.chapters.length,
          totalCharacters: parsed.totalCharacters,
          estimatedDurationMinutes: Math.round(parsed.totalEstimatedDuration / 60),
        },
      });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to upload document" 
      });
    }
  });

  // Pausar síntesis de un proyecto
  app.post("/api/audiobooks/projects/:id/pause", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      const project = await storage.getAudiobookProject(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      await storage.updateAudiobookProject(id, { status: "paused" });
      res.json({ success: true, message: "Síntesis pausada" });
    } catch (error) {
      console.error("Error pausing synthesis:", error);
      res.status(500).json({ error: "Failed to pause synthesis" });
    }
  });

  // Reanudar síntesis de un proyecto
  app.post("/api/audiobooks/projects/:id/resume", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      const project = await storage.getAudiobookProject(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      // Reanudar síntesis
      await storage.updateAudiobookProject(id, { status: "synthesizing" });
      
      synthesizeProject(id, (completed, total, currentChapter) => {
        console.log(`[Synthesis Resume] Project ${id}: ${completed}/${total} - ${currentChapter}`);
      }).catch(err => {
        console.error(`[Synthesis Resume] Project ${id} failed:`, err);
      });

      res.json({ success: true, message: "Síntesis reanudada" });
    } catch (error) {
      console.error("Error resuming synthesis:", error);
      res.status(500).json({ error: "Failed to resume synthesis" });
    }
  });

  // Re-sintetizar un capítulo individual
  app.post("/api/audiobooks/chapters/:chapterId/resynthesize", async (req, res) => {
    try {
      const chapterId = parseInt(req.params.chapterId);
      if (isNaN(chapterId)) {
        res.status(400).json({ error: "Invalid chapter ID" });
        return;
      }

      // Buscar el capítulo por ID directamente
      const chapter = await storage.getChapterById(chapterId);
      if (!chapter) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }

      const project = await storage.getAudiobookProject(chapter.projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      // Marcar el job existente como pendiente (si existe)
      const jobs = await storage.getSynthesisJobsByProject(project.id);
      const existingJob = jobs.find(j => j.chapterId === chapterId);
      if (existingJob) {
        await storage.updateSynthesisJob(existingJob.id, { 
          status: "synthesizing",
          finalAudioUrl: null,
          errorMessage: null,
        });
      }

      // Importar y ejecutar síntesis del capítulo
      const { synthesizeChapter } = await import("./services/polly-synthesizer");
      
      // Ejecutar en segundo plano
      synthesizeChapter(
        chapter.id,
        project.id,
        chapter.contentText,
        project.voiceId,
        project.engine,
        project.speechRate || "90%",
        chapter.title
      ).catch(err => {
        console.error(`[Resynthesize] Chapter ${chapterId} failed:`, err);
      });

      res.json({ success: true, message: "Re-síntesis iniciada" });
    } catch (error) {
      console.error("Error resynthesizing chapter:", error);
      res.status(500).json({ error: "Failed to resynthesize chapter" });
    }
  });

  // Masterizar un capítulo individual (para capítulos completed sin masterizar)
  app.post("/api/audiobooks/jobs/:jobId/master", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        res.status(400).json({ error: "Invalid job ID" });
        return;
      }

      const job = await storage.getSynthesisJobById(jobId);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      if (job.status !== "completed") {
        res.status(400).json({ error: "Solo se pueden masterizar capítulos con estado 'completed'" });
        return;
      }

      if (!job.s3OutputUri && !job.finalAudioUrl) {
        res.status(400).json({ error: "El capítulo no tiene audio para masterizar" });
        return;
      }

      let audioUrl = job.s3OutputUri || job.finalAudioUrl;
      
      // Si es una URI de S3, convertir a URL presignada
      if (audioUrl && audioUrl.startsWith("s3://")) {
        const { getAudioDownloadUrl } = await import("./services/polly-synthesizer");
        audioUrl = await getAudioDownloadUrl(audioUrl, 3600);
      }
      
      // Obtener datos del capítulo para el nombre de archivo
      const chapter = await storage.getChapterById(job.chapterId);
      const project = await storage.getAudiobookProject(job.projectId);
      
      // Marcar como procesando
      await storage.updateSynthesisJob(jobId, { status: "mastering" });

      // Ejecutar masterización en segundo plano
      (async () => {
        try {
          const { masterAudioFromUrl } = await import("./services/audio-mastering");
          const { uploadToS3 } = await import("./services/polly-synthesizer");
          const path = await import("path");
          const os = await import("os");
          const fs = await import("fs");

          const masteringDir = path.join(os.tmpdir(), "audiobook-mastered");
          if (!fs.existsSync(masteringDir)) {
            fs.mkdirSync(masteringDir, { recursive: true });
          }

          const sanitizeFilename = (str: string) => str
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "_")
            .slice(0, 50);

          const safeFilename = chapter?.title ? sanitizeFilename(chapter.title) : `chapter_${job.chapterId}`;
          const masteredPath = path.join(masteringDir, `${safeFilename}.mp3`);

          const masteringOptions = {
            targetLoudness: -20,
            targetPeak: -3,
            targetLRA: 11,
            silenceStart: 1000,
            silenceEnd: 3000,
            sampleRate: 44100,
            bitrate: "192k",
          };

          const masteringResult = await masterAudioFromUrl(audioUrl!, masteredPath, masteringOptions);

          if (!masteringResult.success) {
            console.error(`[Mastering] Failed for job ${jobId}:`, masteringResult.error);
            await storage.updateSynthesisJob(jobId, {
              status: "completed",
              errorMessage: `Mastering failed: ${masteringResult.error}`,
            });
            return;
          }

          // Subir archivo masterizado a S3
          const s3Key = `audiobooks/mastered/project_${job.projectId}/${safeFilename}.mp3`;
          const masteredUrl = await uploadToS3(masteredPath, s3Key);

          if (!masteredUrl) {
            await storage.updateSynthesisJob(jobId, {
              status: "completed",
              errorMessage: "Failed to upload mastered audio to S3",
            });
            return;
          }

          // Actualizar job con URL masterizada
          await storage.updateSynthesisJob(jobId, {
            status: "mastered",
            finalAudioUrl: masteredUrl,
            errorMessage: null,
            completedAt: new Date(),
          });

          console.log(`[Mastering] Success for job ${jobId}: ${masteredUrl}`);

          // Limpiar archivo temporal
          try { fs.unlinkSync(masteredPath); } catch {}

        } catch (err) {
          console.error(`[Mastering] Error for job ${jobId}:`, err);
          await storage.updateSynthesisJob(jobId, {
            status: "completed",
            errorMessage: `Mastering error: ${err instanceof Error ? err.message : "Unknown"}`,
          });
        }
      })();

      res.json({ success: true, message: "Masterización iniciada" });
    } catch (error) {
      console.error("Error mastering job:", error);
      res.status(500).json({ error: "Failed to master audio" });
    }
  });

  // Descargar todos los archivos en ZIP
  app.get("/api/audiobooks/projects/:id/download-zip", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      const project = await storage.getAudiobookProject(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const jobs = await storage.getSynthesisJobsByProject(id);
      const chapters = await storage.getChaptersByProject(id);
      const completedJobs = jobs.filter(j => j.finalAudioUrl);

      if (completedJobs.length === 0) {
        res.status(400).json({ error: "No completed audio files" });
        return;
      }

      const archiver = (await import("archiver")).default;
      const https = await import("https");
      const http = await import("http");

      // Sanitize filename
      const sanitize = (str: string) => str
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 60);

      const zipFilename = `${sanitize(project.title)}_audiobook.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);

      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.pipe(res);

      // Add each audio file to the archive
      let index = 1;
      for (const job of completedJobs) {
        const chapter = chapters.find(c => c.id === job.chapterId);
        const filename = chapter 
          ? `${String(index).padStart(2, "0")}_${sanitize(chapter.title)}.mp3`
          : `${String(index).padStart(2, "0")}_capitulo.mp3`;

        const audioUrl = job.finalAudioUrl!;
        const protocol = audioUrl.startsWith("https") ? https : http;

        // Stream each file into the archive
        await new Promise<void>((resolve, reject) => {
          protocol.get(audioUrl, (audioRes) => {
            if (audioRes.statusCode === 200) {
              archive.append(audioRes, { name: filename });
              audioRes.on("end", resolve);
              audioRes.on("error", reject);
            } else {
              reject(new Error(`Failed to fetch ${filename}`));
            }
          }).on("error", reject);
        });

        index++;
      }

      await archive.finalize();

    } catch (error) {
      console.error("Error creating ZIP:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create ZIP" });
      }
    }
  });

  // Iniciar síntesis de un proyecto
  app.post("/api/audiobooks/projects/:id/synthesize", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      // Verificar que el proyecto existe
      const project = await storage.getAudiobookProject(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      // Iniciar síntesis en segundo plano
      synthesizeProject(id, (completed, total, currentChapter) => {
        console.log(`[Synthesis] Project ${id}: ${completed}/${total} - ${currentChapter}`);
      }).catch(err => {
        console.error(`[Synthesis] Project ${id} failed:`, err);
      });

      res.json({ 
        success: true, 
        message: "Síntesis iniciada. El proceso puede tardar varios minutos." 
      });
    } catch (error) {
      console.error("Error starting synthesis:", error);
      res.status(500).json({ error: "Failed to start synthesis" });
    }
  });

  // Obtener voces disponibles
  app.get("/api/audiobooks/voices", async (req, res) => {
    try {
      const { languageCode } = req.query;
      const voices = await getAvailableVoices(languageCode as any);
      res.json(voices);
    } catch (error) {
      console.error("Error fetching voices:", error);
      res.status(500).json({ error: "Failed to fetch voices" });
    }
  });

  // Validar credenciales AWS
  app.get("/api/audiobooks/validate-credentials", async (req, res) => {
    try {
      const result = await validateAwsCredentials();
      res.json(result);
    } catch (error) {
      console.error("Error validating credentials:", error);
      res.status(500).json({ valid: false, error: "Failed to validate credentials" });
    }
  });

  // Descargar audio de un capítulo con nombre correcto
  app.get("/api/audiobooks/jobs/:jobId/download", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        res.status(400).json({ error: "Invalid job ID" });
        return;
      }

      // Buscar el job
      const projects = await storage.getAllAudiobookProjects();
      let foundJob = null;
      let foundChapter = null;

      for (const project of projects) {
        const jobs = await storage.getSynthesisJobsByProject(project.id);
        const job = jobs.find(j => j.id === jobId);
        if (job) {
          foundJob = job;
          const chapters = await storage.getChaptersByProject(project.id);
          foundChapter = chapters.find(c => c.id === job.chapterId);
          break;
        }
      }

      if (!foundJob || !foundJob.finalAudioUrl) {
        res.status(404).json({ error: "Audio not found" });
        return;
      }

      // Generar nombre de archivo basado en el título del capítulo
      const sanitize = (str: string) => str
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 60);
      
      const filename = foundChapter 
        ? `${sanitize(foundChapter.title)}.mp3`
        : `capitulo_${foundJob.chapterId}.mp3`;

      // Descargar el archivo de S3 y reenviarlo al cliente
      const https = await import("https");
      const http = await import("http");
      
      let audioUrl = foundJob.finalAudioUrl;
      
      // Si es un S3 URI, convertirlo a URL firmada
      if (audioUrl.startsWith("s3://")) {
        const { getAudioDownloadUrl } = await import("./services/polly-synthesizer");
        audioUrl = await getAudioDownloadUrl(audioUrl, 3600);
      }
      
      const protocol = audioUrl.startsWith("https") ? https : http;
      
      protocol.get(audioUrl, (audioRes) => {
        if (audioRes.statusCode !== 200) {
          res.status(500).json({ error: "Failed to fetch audio" });
          return;
        }

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        
        if (audioRes.headers["content-length"]) {
          res.setHeader("Content-Length", audioRes.headers["content-length"]);
        }

        audioRes.pipe(res);
      }).on("error", (err) => {
        console.error("Error downloading audio:", err);
        res.status(500).json({ error: "Failed to download audio" });
      });

    } catch (error) {
      console.error("Error in audio download:", error);
      res.status(500).json({ error: "Failed to download audio" });
    }
  });

  // Obtener jobs de síntesis de un proyecto
  app.get("/api/audiobooks/projects/:id/jobs", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      const jobs = await storage.getSynthesisJobsByProject(id);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching synthesis jobs:", error);
      res.status(500).json({ error: "Failed to fetch synthesis jobs" });
    }
  });

  // Recuperar jobs de síntesis pendientes (para reanudar después de reinicio)
  app.post("/api/audiobooks/recover", async (req, res) => {
    try {
      console.log("[Recovery] Starting recovery of pending synthesis jobs...");
      const result = await recoverPendingJobs();
      console.log(`[Recovery] Done: ${result.recovered} recovered, ${result.failed} failed, ${result.pending} pending`);
      res.json({ 
        success: true, 
        ...result,
        message: `Recuperación completada: ${result.recovered} jobs recuperados, ${result.failed} fallidos, ${result.pending} pendientes`
      });
    } catch (error) {
      console.error("Error recovering jobs:", error);
      res.status(500).json({ error: "Failed to recover pending jobs" });
    }
  });

  // Ejecutar recuperación automática al iniciar el servidor
  setTimeout(async () => {
    try {
      console.log("[Recovery] Auto-recovery check on startup...");
      const result = await recoverPendingJobs();
      if (result.recovered > 0 || result.pending > 0) {
        console.log(`[Recovery] Startup recovery: ${result.recovered} recovered, ${result.failed} failed, ${result.pending} pending`);
      }
    } catch (error) {
      console.error("[Recovery] Auto-recovery failed:", error);
    }
  }, 5000); // Esperar 5 segundos después de iniciar

  // Verificar jobs atascados cada 5 minutos (10 minutos de timeout)
  const STUCK_JOB_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos
  const STUCK_JOB_TIMEOUT_MINUTES = 10; // Considerar atascado después de 10 minutos

  setInterval(async () => {
    try {
      const stuckCount = await storage.markStuckJobsAsFailed(STUCK_JOB_TIMEOUT_MINUTES);
      if (stuckCount > 0) {
        console.log(`[Recovery] Marked ${stuckCount} stuck jobs as failed`);
      }
    } catch (error) {
      console.error("[Recovery] Error checking for stuck jobs:", error);
    }
  }, STUCK_JOB_CHECK_INTERVAL);

  const httpServer = createServer(app);

  return httpServer;
}

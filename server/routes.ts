import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { optimizationRequestSchema, insertPublicationSchema, insertTaskSchema } from "@shared/schema";
import { generateOptimizationResult } from "./services/metadata-generator";
import { ProgressEmitter } from "./services/progress-emitter";
import {
  generatePublicationSchedule,
  reschedulePublication,
  getPublicationStats,
  markPublicationAsPublished,
} from "./services/publication-scheduler";

export async function registerRoutes(app: Express): Promise<Server> {
  const progressEmitters = new Map<string, ProgressEmitter>();

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

        await storage.saveOptimizationWithManuscript(
          manuscriptData,
          result.id,
          validation.data.targetMarkets,
          result.seedKeywords,
          result.marketResults
        );

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

  // Obtener todas las tareas
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
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

      const task = await storage.updateTask(id, req.body);
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

  const httpServer = createServer(app);

  return httpServer;
}

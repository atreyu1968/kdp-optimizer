import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { optimizationRequestSchema } from "@shared/schema";
import { generateOptimizationResult } from "./services/metadata-generator";
import { ProgressEmitter } from "./services/progress-emitter";

export async function registerRoutes(app: Express): Promise<Server> {
  const progressEmitters = new Map<string, ProgressEmitter>();

  app.get("/api/optimize/progress/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    
    let emitter = progressEmitters.get(sessionId);
    if (!emitter) {
      emitter = new ProgressEmitter();
      progressEmitters.set(sessionId, emitter);
    }

    emitter.setResponse(res);
  });

  app.post("/api/optimize", async (req, res) => {
    const sessionId = `session-${Date.now()}`;
    
    res.json({ sessionId });

    setImmediate(async () => {
      try {
        let attempts = 0;
        while (attempts < 50 && !progressEmitters.get(sessionId)?.hasConnection()) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        const emitter = progressEmitters.get(sessionId);
        if (!emitter || !emitter.hasConnection()) {
          console.error("No emitter connection for session:", sessionId);
          return;
        }

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
          author: validation.data.targetAudience || "Unknown",
          genre: validation.data.genre,
          manuscriptText: validation.data.manuscriptText,
          wordCount: wordCount,
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
    
    res.json({ sessionId });

    setImmediate(async () => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          console.error("Invalid manuscript ID");
          return;
        }

        let attempts = 0;
        while (attempts < 50 && !progressEmitters.get(sessionId)?.hasConnection()) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        const emitter = progressEmitters.get(sessionId);
        if (!emitter || !emitter.hasConnection()) {
          console.error("No emitter connection for session:", sessionId);
          return;
        }

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
          language: language || "es",
          targetMarkets,
          genre: manuscript.genre,
          targetAudience: manuscript.author,
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
            manuscriptText: manuscript.manuscriptText,
            wordCount: manuscript.wordCount,
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

  const httpServer = createServer(app);

  return httpServer;
}

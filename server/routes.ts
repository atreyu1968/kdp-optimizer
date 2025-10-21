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

  const httpServer = createServer(app);

  return httpServer;
}

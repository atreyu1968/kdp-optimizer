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
import { parseEpubDocument, applyPLSLexicon } from "./services/epub-parser";
import { synthesizeProject, getAvailableVoices, validateAwsCredentials, recoverPendingJobs } from "./services/polly-synthesizer";
import { getGoogleVoices, isGoogleTTSConfigured, synthesizeProjectWithGoogle } from "./services/google-tts-synthesizer";
import { getQwenVoices, isQwenTTSConfigured, synthesizeChapterWithQwen, processProjectWithQwen } from "./services/qwen-tts-synthesizer";
import * as googleCredentialsManager from "./services/google-credentials-manager";
import type { IVooxMetadata } from "@shared/schema";
import multer from "multer";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";

// Tipos para posts de redes sociales
interface SocialPost {
  platform: string;
  icon: string;
  color: string;
  posts: {
    type: string;
    content: string;
    hashtags: string[];
    mediaRequirements: string;
    bestTime: string;
    characterLimit?: number;
  }[];
}

// Generador de posts para redes sociales
function generateSocialPosts(
  marketingKit: any, 
  bookTitle: string, 
  author: string, 
  coverUrl: string | null
): SocialPost[] {
  // Asegurar que todos los campos sean arrays
  const ensureArray = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
    // Si es un objeto con subcampos (como hashtags con general/specific), combinar todos
    if (val && typeof val === 'object') {
      const combined: string[] = [];
      Object.values(val).forEach((v: any) => {
        if (Array.isArray(v)) combined.push(...v);
        else if (typeof v === 'string') combined.push(v);
      });
      return combined;
    }
    return [];
  };
  
  const hashtags = ensureArray(marketingKit.hashtags);
  const tiktokHooks = ensureArray(marketingKit.tiktokHooks);
  const instagramIdeas = ensureArray(marketingKit.instagramIdeas);
  const pinterestDescriptions = ensureArray(marketingKit.pinterestDescriptions);
  const freePromoStrategies = ensureArray(marketingKit.freePromoStrategies);
  const reviewCTAs = ensureArray(marketingKit.reviewCTAs);
  const leadMagnetIdeas = ensureArray(marketingKit.leadMagnetIdeas);
  const facebookGroupPosts = ensureArray(marketingKit.facebookGroupPosts);

  // Instagram Posts
  const instagramPosts = [
    {
      type: "Carrusel Informativo",
      content: instagramIdeas[0] || `Descubre "${bookTitle}" de ${author}. Una historia que no podrás soltar.`,
      hashtags: hashtags.slice(0, 30),
      mediaRequirements: "Imagen cuadrada 1080x1080px o carrusel (hasta 10 imágenes)",
      bestTime: "11:00 AM - 1:00 PM o 7:00 PM - 9:00 PM"
    },
    {
      type: "Story con Enlace",
      content: `¡Nueva lectura! "${bookTitle}" ya disponible. Desliza para descubrir más.`,
      hashtags: hashtags.slice(0, 10),
      mediaRequirements: "Imagen vertical 1080x1920px",
      bestTime: "9:00 AM o 8:00 PM"
    },
    {
      type: "Reel Teaser",
      content: tiktokHooks[0] || `¿Buscas tu próxima obsesión literaria? "${bookTitle}" te espera.`,
      hashtags: hashtags.slice(0, 20),
      mediaRequirements: "Video vertical 1080x1920px (15-60 segundos)",
      bestTime: "12:00 PM o 6:00 PM"
    }
  ];

  // Facebook Posts
  const facebookPosts = [
    {
      type: "Post de Lanzamiento",
      content: `¡Estoy emocionado/a de compartir mi nuevo libro!\n\n"${bookTitle}"\n\n${instagramIdeas[1] || "Una historia que te atrapará desde la primera página."}\n\n¿Te gustaría saber más? Déjame un comentario.`,
      hashtags: hashtags.slice(0, 5),
      mediaRequirements: "Imagen horizontal 1200x630px",
      bestTime: "1:00 PM - 4:00 PM"
    },
    {
      type: "Grupo de Lectores",
      content: facebookGroupPosts[0] || `Hola, comunidad lectora. Acabo de terminar "${bookTitle}" y tengo muchas ganas de hablar sobre ello. ¿Alguien más lo ha leído?`,
      hashtags: [],
      mediaRequirements: "Imagen de portada opcional",
      bestTime: "9:00 AM o 7:00 PM"
    }
  ];

  // Twitter/X Posts
  const twitterPosts = [
    {
      type: "Anuncio",
      content: `¡"${bookTitle}" ya disponible! ${tiktokHooks[1] || "Una lectura que no olvidarás."}`,
      hashtags: hashtags.slice(0, 3),
      mediaRequirements: "Imagen 1200x675px",
      bestTime: "9:00 AM o 5:00 PM",
      characterLimit: 280
    },
    {
      type: "Hilo (Thread)",
      content: `Sobre "${bookTitle}":\n\n1/ ¿Por qué escribí esta historia?\n2/ Los personajes que más me costó crear\n3/ El mensaje que quiero transmitir\n\n¿Quieres saber más? Sigue leyendo...`,
      hashtags: hashtags.slice(0, 2),
      mediaRequirements: "Imagen para primer tweet",
      bestTime: "12:00 PM",
      characterLimit: 280
    }
  ];

  // Pinterest Posts
  const pinterestPosts = [
    {
      type: "Pin de Portada",
      content: pinterestDescriptions[0] || `"${bookTitle}" de ${author}. Descubre esta fascinante historia.`,
      hashtags: hashtags.slice(0, 20),
      mediaRequirements: "Imagen vertical 1000x1500px (ratio 2:3)",
      bestTime: "8:00 PM - 11:00 PM"
    },
    {
      type: "Pin de Cita",
      content: `"${reviewCTAs[0] || "Una historia que cambiará tu perspectiva."}" - ${bookTitle}`,
      hashtags: hashtags.slice(0, 15),
      mediaRequirements: "Imagen vertical con texto overlay",
      bestTime: "2:00 PM - 4:00 PM"
    }
  ];

  // TikTok Posts
  const tiktokPosts = tiktokHooks.slice(0, 3).map((hook: string, i: number) => ({
    type: i === 0 ? "BookTok Reveal" : i === 1 ? "Behind the Scenes" : "Reading Vlog",
    content: hook,
    hashtags: ["#BookTok", "#LibrosRecomendados", "#NuevoLibro", ...hashtags.slice(0, 5)],
    mediaRequirements: "Video vertical 1080x1920px (15-60 segundos)",
    bestTime: "7:00 PM - 9:00 PM"
  }));

  // LinkedIn Posts
  const linkedinPosts = [
    {
      type: "Anuncio Profesional",
      content: `Me complace anunciar el lanzamiento de mi nuevo libro: "${bookTitle}".\n\nEste proyecto representa meses de investigación, escritura y pasión por contar historias que importan.\n\n${leadMagnetIdeas[0] || "¿Te gustaría conocer más sobre el proceso creativo?"}\n\n#NuevoLibro #Autor #Escritura`,
      hashtags: ["#NuevoLibro", "#Autor", "#Escritura"],
      mediaRequirements: "Imagen profesional 1200x627px",
      bestTime: "8:00 AM - 10:00 AM (martes a jueves)"
    }
  ];

  return [
    {
      platform: "Instagram",
      icon: "instagram",
      color: "#E4405F",
      posts: instagramPosts
    },
    {
      platform: "Facebook",
      icon: "facebook",
      color: "#1877F2",
      posts: facebookPosts
    },
    {
      platform: "Twitter/X",
      icon: "twitter",
      color: "#1DA1F2",
      posts: twitterPosts
    },
    {
      platform: "Pinterest",
      icon: "pinterest",
      color: "#BD081C",
      posts: pinterestPosts
    },
    {
      platform: "TikTok",
      icon: "tiktok",
      color: "#000000",
      posts: tiktokPosts.length > 0 ? tiktokPosts : [{
        type: "BookTok Reveal",
        content: `¿Buscas tu próxima obsesión literaria? "${bookTitle}" te espera.`,
        hashtags: ["#BookTok", "#LibrosRecomendados", "#NuevoLibro"],
        mediaRequirements: "Video vertical 1080x1920px",
        bestTime: "7:00 PM - 9:00 PM"
      }]
    },
    {
      platform: "LinkedIn",
      icon: "linkedin",
      color: "#0A66C2",
      posts: linkedinPosts
    }
  ];
}

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
      // Check file extension first (more reliable than MIME type)
      const filename = file.originalname.toLowerCase();
      if (filename.endsWith('.docx') || filename.endsWith('.doc') || 
          filename.endsWith('.epub') || filename.endsWith('.txt')) {
        cb(null, true);
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                 file.mimetype === 'application/msword' ||
                 file.mimetype === 'application/zip' ||  // .docx is technically a zip file
                 file.mimetype === 'text/plain' ||
                 file.mimetype === 'application/octet-stream') {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten archivos Word (.doc, .docx), EPUB (.epub) o texto (.txt)'));
      }
    },
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB límite para manuscritos largos
    }
  });

  // Multer para portadas de libros (Sala de Contenido Social)
  const coversDir = join(process.cwd(), 'uploads', 'covers');
  if (!existsSync(coversDir)) {
    mkdirSync(coversDir, { recursive: true });
  }

  const uploadCover = multer({
    storage: multer.diskStorage({
      destination: coversDir,
      filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const ext = file.originalname.split('.').pop() || 'jpg';
        cb(null, `cover-${uniqueSuffix}.${ext}`);
      }
    }),
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten imágenes (JPG, PNG, WebP, GIF)'));
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB límite para portadas
    }
  });

  // Endpoint de diagnóstico para verificar conexión de base de datos
  app.get("/api/health/db", async (req, res) => {
    try {
      const dbUrl = process.env.DATABASE_URL || "NOT_SET";
      const dbType = dbUrl.includes("localhost") || dbUrl.includes("replit") ? "replit-pg" : "external";
      
      // Intentar una consulta simple
      const manuscripts = await storage.getAllManuscripts();
      const optimizations = await storage.getAllOptimizations();
      
      res.json({
        status: "connected",
        dbType,
        counts: {
          manuscripts: manuscripts.length,
          optimizations: optimizations.length
        },
        env: process.env.NODE_ENV || "not_set"
      });
    } catch (error) {
      console.error("[Health Check] Database error:", error);
      res.status(500).json({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        dbConfigured: !!process.env.DATABASE_URL,
        env: process.env.NODE_ENV || "not_set"
      });
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
    try {
      console.log("[/api/optimize] Recibida petición de optimización");
      
      if (!process.env.DEEPSEEK_API_KEY) {
        console.error("[/api/optimize] ERROR: DEEPSEEK_API_KEY no está configurada");
        res.status(500).json({ error: "El servicio de IA no está configurado correctamente. Contacta al administrador." });
        return;
      }
      
      const sessionId = `session-${Date.now()}`;
      console.log("[/api/optimize] Creando sesión:", sessionId);
      
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
    } catch (error) {
      console.error("[/api/optimize] Error creating session:", error);
      res.status(500).json({ error: "Failed to create optimization session" });
    }
  });

  app.get("/api/manuscripts", async (req, res) => {
    try {
      console.log("[/api/manuscripts] Fetching all manuscripts...");
      const manuscripts = await storage.getAllManuscripts();
      console.log(`[/api/manuscripts] Found ${manuscripts.length} manuscripts`);
      
      // Excluir manuscriptText para reducir tamaño de respuesta (puede ser muy grande)
      const lightManuscripts = manuscripts.map(m => ({
        id: m.id,
        originalTitle: m.originalTitle,
        author: m.author,
        genre: m.genre,
        targetAudience: m.targetAudience,
        language: m.language,
        wordCount: m.wordCount,
        seriesName: m.seriesName,
        seriesNumber: m.seriesNumber,
        coverImageUrl: m.coverImageUrl,
        createdAt: m.createdAt
      }));
      
      res.json(lightManuscripts);
    } catch (error) {
      console.error("[/api/manuscripts] Error fetching manuscripts:", error instanceof Error ? error.message : error);
      console.error("[/api/manuscripts] Stack:", error instanceof Error ? error.stack : "No stack");
      res.status(500).json({ 
        error: "Failed to fetch manuscripts",
        details: process.env.NODE_ENV === "production" ? (error instanceof Error ? error.message : "Unknown error") : undefined
      });
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

  // ============================================================================
  // SALA DE CONTENIDO SOCIAL - Upload de portadas y generación de posts
  // ============================================================================

  // Subir portada de libro
  app.post("/api/manuscripts/:id/cover", uploadCover.single("cover"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        // Limpiar archivo si hay error de validación
        if (req.file) {
          try { unlinkSync(req.file.path); } catch {}
        }
        res.status(400).json({ error: "ID de manuscrito inválido" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "No se recibió ninguna imagen" });
        return;
      }

      const manuscript = await storage.getManuscript(id);
      if (!manuscript) {
        // Limpiar archivo si el manuscrito no existe
        try { unlinkSync(req.file.path); } catch {}
        res.status(404).json({ error: "Manuscrito no encontrado" });
        return;
      }

      // Eliminar portada anterior si existe (solo si está en el directorio de covers)
      if (manuscript.coverImageUrl && manuscript.coverImageUrl.startsWith('/uploads/covers/')) {
        const filename = manuscript.coverImageUrl.split('/').pop();
        if (filename && !filename.includes('..')) {
          const oldPath = join(coversDir, filename);
          try { unlinkSync(oldPath); } catch {}
        }
      }

      // Guardar URL relativa de la portada
      const coverUrl = `/uploads/covers/${req.file.filename}`;
      await storage.updateManuscript(id, { coverImageUrl: coverUrl } as any);

      res.json({ 
        success: true, 
        coverImageUrl: coverUrl,
        message: "Portada subida correctamente"
      });
    } catch (error) {
      console.error("Error uploading cover:", error);
      // Limpiar archivo en caso de error
      if (req.file) {
        try { unlinkSync(req.file.path); } catch {}
      }
      res.status(500).json({ error: "Error al subir la portada" });
    }
  });

  // Generar posts para redes sociales basados en el Marketing Kit
  app.get("/api/manuscripts/:id/social-posts", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "ID de manuscrito inválido" });
        return;
      }

      const manuscript = await storage.getManuscript(id);
      if (!manuscript) {
        res.status(404).json({ error: "Manuscrito no encontrado" });
        return;
      }

      // Obtener optimizaciones con marketing kit (ordenadas por fecha descendente)
      const optimizations = await storage.getOptimizationsByManuscriptId(id);
      const sortedOptimizations = [...optimizations].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const latestOptimization = sortedOptimizations[0];

      // Usar marketing kit si existe, o generar posts básicos
      const marketingKit = latestOptimization?.marketingKit || {};
      const bookTitle = manuscript.originalTitle;
      const author = manuscript.author;
      const coverUrl = manuscript.coverImageUrl;
      const hasMarketingKit = !!latestOptimization?.marketingKit;

      // Generar posts para cada plataforma
      const socialPosts = generateSocialPosts(marketingKit, bookTitle, author, coverUrl);

      res.json({
        manuscript: {
          id: manuscript.id,
          title: bookTitle,
          author: author,
          genre: manuscript.genre,
          coverImageUrl: coverUrl
        },
        hasMarketingKit,
        posts: socialPosts
      });
    } catch (error) {
      console.error("Error generating social posts:", error);
      res.status(500).json({ error: "Error al generar posts sociales" });
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
        console.error("[Upload] No file received in request");
        res.status(400).json({ error: "No se recibió ningún archivo" });
        return;
      }

      console.log(`[Upload] Starting upload: ${req.file.originalname} (${req.file.size} bytes)`);

      const { voiceId, voiceLocale, engine, author, speechRate, title, ttsProvider, googleCredentialId } = req.body;

      // Validar campos requeridos
      if (!title || !author || !voiceId) {
        console.error("[Upload] Missing required fields:", { title, author, voiceId });
        res.status(400).json({ error: "Campos requeridos: título, autor, voz" });
        return;
      }

      // Leer el archivo y parsearlo
      console.log(`[Upload] Reading and parsing document: ${req.file.originalname}`);
      const fileBuffer = readFileSync(req.file.path);
      const isEpub = req.file.originalname.toLowerCase().endsWith('.epub');
      
      let parsedTitle = "";
      let parsedAuthor = "";
      let chapters: Array<{
        sequenceNumber: number;
        title: string;
        contentText: string;
        contentSsml: string | null;
        characterCount: number;
        estimatedDurationSeconds: number;
      }> = [];
      let totalCharacters = 0;
      let totalEstimatedDuration = 0;
      let hasSSMLAnnotations = false;
      
      if (isEpub) {
        // Parse EPUB3 with SSML support
        console.log("[Upload] Detected EPUB file, using EPUB parser with SSML support");
        const epubParsed = await parseEpubDocument(fileBuffer, req.file.originalname);
        parsedTitle = epubParsed.title;
        parsedAuthor = epubParsed.author;
        totalCharacters = epubParsed.totalCharacters;
        totalEstimatedDuration = epubParsed.totalEstimatedDuration;
        hasSSMLAnnotations = epubParsed.hasSSMLAnnotations;
        
        // Convert EPUB chapters with SSML support
        for (const ch of epubParsed.chapters) {
          let contentSsml: string | null = null;
          
          if (ch.ssmlAnnotations.length > 0) {
            // Chapter has inline SSML annotations
            contentSsml = ch.contentWithSSML;
          } else if (epubParsed.plsLexicons.length > 0) {
            // Apply PLS lexicons to generate SSML
            contentSsml = applyPLSLexicon(ch.contentText, epubParsed.plsLexicons);
          }
          
          chapters.push({
            sequenceNumber: ch.sequenceNumber,
            title: ch.title,
            contentText: ch.contentText,
            contentSsml,
            characterCount: ch.characterCount,
            estimatedDurationSeconds: ch.estimatedDurationSeconds,
          });
        }
        
        if (hasSSMLAnnotations) {
          console.log(`[Upload] EPUB has SSML annotations - ${epubParsed.chapters.reduce((sum, ch) => sum + ch.ssmlAnnotations.length, 0)} inline phonemes, ${epubParsed.plsLexicons.length} PLS lexicons`);
        }
      } else {
        // Parse Word/TXT documents (existing logic)
        const parsed = await parseWordDocument(fileBuffer, req.file.originalname);
        parsedTitle = parsed.title;
        totalCharacters = parsed.totalCharacters;
        totalEstimatedDuration = parsed.totalEstimatedDuration;
        
        for (const ch of parsed.chapters) {
          chapters.push({
            sequenceNumber: ch.sequenceNumber,
            title: ch.title,
            contentText: ch.contentText,
            contentSsml: null,
            characterCount: ch.characterCount,
            estimatedDurationSeconds: ch.estimatedDurationSeconds,
          });
        }
      }
      
      console.log(`[Upload] Document parsed: ${chapters.length} chapters, ${totalCharacters} characters`);

      // Crear el proyecto con status "ready" para que esté listo para sintetizar
      console.log("[Upload] Creating audiobook project");
      const project = await storage.createAudiobookProject({
        title: title || parsedTitle,
        author: author || parsedAuthor || null,
        sourceFileName: req.file.originalname,
        ttsProvider: ttsProvider || "polly",
        googleCredentialId: googleCredentialId ? parseInt(googleCredentialId) : null,
        voiceId: voiceId || "Lucia",
        voiceLocale: voiceLocale || "es-ES",
        engine: engine || "generative",
        speechRate: speechRate || "75%", // Óptimo para audiolibros: más natural y pausado
        status: "ready",
        totalChapters: chapters.length,
        completedChapters: 0,
        errorMessage: null,
      });
      console.log(`[Upload] Project created: ID ${project.id}`);

      // Crear los capítulos
      console.log(`[Upload] Creating ${chapters.length} chapters`);
      for (const chapter of chapters) {
        await storage.createAudiobookChapter({
          projectId: project.id,
          sequenceNumber: chapter.sequenceNumber,
          title: chapter.title,
          contentText: chapter.contentText,
          contentSsml: chapter.contentSsml,
          characterCount: chapter.characterCount,
          estimatedDurationSeconds: chapter.estimatedDurationSeconds,
        });
      }
      console.log("[Upload] All chapters created" + (hasSSMLAnnotations ? " with SSML annotations" : ""));

      // Limpiar archivo temporal
      try {
        unlinkSync(req.file.path);
        console.log("[Upload] Temporary file deleted");
      } catch (e) {
        console.warn("[Upload] Could not delete temp file:", e);
      }

      // Obtener capítulos creados
      const savedChapters = await storage.getChaptersByProject(project.id);

      console.log(`[Upload] Upload complete: Project ${project.id} with ${savedChapters.length} chapters`);
      res.json({
        project,
        chapters: savedChapters,
        summary: {
          totalChapters: chapters.length,
          totalCharacters,
          estimatedDurationMinutes: Math.round(totalEstimatedDuration / 60),
          hasSSMLAnnotations,
        },
      });
    } catch (error) {
      console.error("[Upload] Error uploading document:", error);
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
      // Verificar credenciales AWS antes de empezar
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        console.error("[Resume] ERROR: Credenciales AWS no configuradas");
        res.status(500).json({ error: "Las credenciales de AWS no están configuradas. Configúralas en la pestaña Secrets." });
        return;
      }

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
      // Verificar credenciales AWS antes de empezar
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        console.error("[Resynthesize] ERROR: Credenciales AWS no configuradas");
        res.status(500).json({ error: "Las credenciales de AWS no están configuradas. Configúralas en la pestaña Secrets." });
        return;
      }

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
      
      res.json({ success: true, message: "Re-síntesis iniciada" });

      // Ejecutar en segundo plano con mejor error handling
      setImmediate(async () => {
        try {
          await synthesizeChapter(
            chapter.id,
            project.id,
            chapter.contentText,
            project.voiceId,
            project.engine,
            project.speechRate || "90%",
            chapter.title,
            1,
            1
          );
          console.log(`[Resynthesize] Chapter ${chapterId} completed`);
        } catch (err) {
          console.error(`[Resynthesize] Chapter ${chapterId} failed:`, err instanceof Error ? err.message : err);
        }
      });
    } catch (error) {
      console.error("Error resynthesizing chapter:", error);
      res.status(500).json({ error: "Failed to resynthesize chapter" });
    }
  });

  // Masterizar un capítulo individual (para capítulos completed sin masterizar)
  app.post("/api/audiobooks/jobs/:jobId/master", async (req, res) => {
    try {
      // Verificar credenciales AWS antes de empezar
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        console.error("[Master] ERROR: Credenciales AWS no configuradas");
        res.status(500).json({ error: "Las credenciales de AWS no están configuradas. Configúralas en la pestaña Secrets." });
        return;
      }

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

          // Actualizar contador de capítulos masterizados
          await storage.updateMasteredChaptersCount(job.projectId);

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
      
      // Get only the latest mastered job for each chapter (avoid duplicates)
      const latestJobsByChapter = new Map<number, typeof jobs[0]>();
      for (const job of jobs) {
        if (job.finalAudioUrl && job.status === "mastered") {
          const existing = latestJobsByChapter.get(job.chapterId);
          if (!existing || (job.createdAt && existing.createdAt && job.createdAt > existing.createdAt)) {
            latestJobsByChapter.set(job.chapterId, job);
          }
        }
      }
      
      // Sort chapters by sequenceNumber and get their corresponding jobs
      const sortedChapters = [...chapters].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      const orderedJobs: { job: typeof jobs[0]; chapter: typeof chapters[0] }[] = [];
      
      for (const chapter of sortedChapters) {
        const job = latestJobsByChapter.get(chapter.id);
        if (job) {
          orderedJobs.push({ job, chapter });
        }
      }

      if (orderedJobs.length === 0) {
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

      // Import getAudioDownloadUrl for regenerating fresh URLs
      const { getAudioDownloadUrl } = await import("./services/polly-synthesizer");

      // Add each audio file to the archive in chapter order
      let index = 1;
      for (const { job, chapter } of orderedJobs) {
        const filename = `${String(index).padStart(2, "0")}_${sanitize(chapter.title)}.mp3`;

        // Regenerate fresh URL - stored URLs may be expired
        let audioUrl = job.finalAudioUrl!;
        if (job.s3OutputUri) {
          audioUrl = await getAudioDownloadUrl(job.s3OutputUri, 3600);
        } else if (audioUrl.startsWith("s3://")) {
          audioUrl = await getAudioDownloadUrl(audioUrl, 3600);
        }
        
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

  // Iniciar síntesis de un proyecto (soporta Polly, Google y Qwen TTS)
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

      const ttsProvider = project.ttsProvider || "polly";

      // Verificar credenciales según proveedor
      if (ttsProvider === "polly") {
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
          console.error("[Synthesis] ERROR: Credenciales AWS no configuradas");
          res.status(500).json({ error: "Las credenciales de AWS no están configuradas. Configúralas en la pestaña Secrets." });
          return;
        }
      } else if (ttsProvider === "google") {
        if (!isGoogleTTSConfigured()) {
          res.status(500).json({ error: "Google Cloud TTS no está configurado." });
          return;
        }
      } else if (ttsProvider === "qwen") {
        if (!isQwenTTSConfigured()) {
          res.status(500).json({ error: "Qwen TTS no está configurado. Configura DASHSCOPE_API_KEY en Secrets." });
          return;
        }
      }

      res.json({ 
        success: true, 
        message: `Síntesis iniciada con ${ttsProvider === "polly" ? "Amazon Polly" : ttsProvider === "google" ? "Google Cloud TTS" : "Qwen TTS"}. El proceso puede tardar varios minutos.` 
      });

      // Iniciar síntesis en segundo plano según proveedor
      setImmediate(async () => {
        try {
          console.log(`[Synthesis] Starting project ${id} with ${ttsProvider}...`);
          
          if (ttsProvider === "qwen") {
            const { processProjectWithQwen } = await import("./services/qwen-tts-synthesizer");
            await processProjectWithQwen(id, project.voiceId, project.speechRate || "medium", (completed, total, currentChapter) => {
              console.log(`[Synthesis Qwen] Project ${id}: ${completed}/${total} - ${currentChapter}`);
            });
          } else if (ttsProvider === "google") {
            await synthesizeProjectWithGoogle(id, (completed, total, currentChapter) => {
              console.log(`[Synthesis Google] Project ${id}: ${completed}/${total} - ${currentChapter}`);
            });
          } else {
            await synthesizeProject(id, (completed, total, currentChapter) => {
              console.log(`[Synthesis Polly] Project ${id}: ${completed}/${total} - ${currentChapter}`);
            });
          }
          
          console.log(`[Synthesis] Completed project ${id}`);
        } catch (synthesisError) {
          console.error(`[Synthesis] Error in project ${id}:`, synthesisError instanceof Error ? synthesisError.message : synthesisError);
          try {
            await storage.updateAudiobookProject(id, {
              status: "failed",
              errorMessage: synthesisError instanceof Error ? synthesisError.message : "Unknown synthesis error"
            });
          } catch (updateErr) {
            console.error(`[Synthesis] Could not update error status:`, updateErr);
          }
        }
      });
    } catch (error) {
      console.error("Error starting synthesis:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to start synthesis" });
      }
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

  // Obtener voces de Google Cloud TTS (Neural2, WaveNet, Journey)
  app.get("/api/audiobooks/google-voices", async (req, res) => {
    try {
      if (!isGoogleTTSConfigured()) {
        res.json({ configured: false, voices: [] });
        return;
      }
      const { languageCode } = req.query;
      const voices = await getGoogleVoices(languageCode as string | undefined);
      res.json({ configured: true, voices });
    } catch (error) {
      console.error("Error fetching Google voices:", error);
      res.status(500).json({ configured: false, error: "Failed to fetch Google voices" });
    }
  });

  // Verificar si Google Cloud TTS está configurado
  app.get("/api/audiobooks/google-status", async (req, res) => {
    try {
      res.json({ configured: isGoogleTTSConfigured() });
    } catch (error) {
      res.json({ configured: false });
    }
  });

  // ============================================================================
  // QWEN 3 TTS API ENDPOINTS
  // ============================================================================

  // Obtener voces disponibles de Qwen TTS
  app.get("/api/audiobooks/qwen-voices", async (req, res) => {
    try {
      if (!isQwenTTSConfigured()) {
        res.json({ configured: false, voices: [] });
        return;
      }
      const { languageCode } = req.query;
      const voices = await getQwenVoices(languageCode as string | undefined);
      res.json({ configured: true, voices });
    } catch (error) {
      console.error("Error fetching Qwen voices:", error);
      res.status(500).json({ configured: false, error: "Failed to fetch Qwen voices" });
    }
  });

  // Verificar si Qwen TTS está configurado
  app.get("/api/audiobooks/qwen-status", async (req, res) => {
    try {
      res.json({ configured: isQwenTTSConfigured() });
    } catch (error) {
      res.json({ configured: false });
    }
  });

  // Iniciar síntesis con Qwen TTS para un proyecto
  app.post("/api/audiobooks/projects/:id/synthesize-qwen", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      if (!isQwenTTSConfigured()) {
        res.status(400).json({ error: "Qwen TTS not configured. Please set DASHSCOPE_API_KEY." });
        return;
      }

      const { voiceId, speechRate } = req.body;
      
      if (!voiceId) {
        res.status(400).json({ error: "Voice ID is required" });
        return;
      }

      const project = await storage.getAudiobookProject(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      // Update project status
      await storage.updateAudiobookProject(projectId, { status: "synthesizing" });

      // Start synthesis in background
      res.json({ message: "Synthesis started with Qwen TTS", projectId, voiceId });

      // Process all chapters
      try {
        const result = await processProjectWithQwen(
          projectId,
          voiceId,
          speechRate || "medium",
          (completed, total, chapterTitle) => {
            console.log(`[Qwen TTS] Progress: ${completed}/${total} - ${chapterTitle}`);
          }
        );

        // Update project status based on results
        if (result.failed === 0) {
          await storage.updateAudiobookProject(projectId, { status: "completed" });
        } else if (result.succeeded > 0) {
          await storage.updateAudiobookProject(projectId, { status: "completed" });
        } else {
          await storage.updateAudiobookProject(projectId, { status: "failed" });
        }

        console.log(`[Qwen TTS] Project ${projectId} completed: ${result.succeeded} succeeded, ${result.failed} failed`);
      } catch (error) {
        console.error(`[Qwen TTS] Project ${projectId} failed:`, error);
        await storage.updateAudiobookProject(projectId, { status: "failed" });
      }

    } catch (error) {
      console.error("Error starting Qwen synthesis:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to start Qwen synthesis" });
      }
    }
  });

  // ============================================================================
  // GOOGLE TTS CREDENTIALS MANAGEMENT API
  // ============================================================================

  // Verificar si la clave maestra de cifrado está configurada
  app.get("/api/audiobooks/google-credentials/status", async (req, res) => {
    try {
      res.json({ 
        masterKeyConfigured: googleCredentialsManager.isMasterKeyConfigured(),
        generatedKey: !googleCredentialsManager.isMasterKeyConfigured() ? googleCredentialsManager.generateMasterKey() : undefined
      });
    } catch (error) {
      res.status(500).json({ error: "Error checking credentials status" });
    }
  });

  // Listar todas las credenciales de Google TTS (sin datos sensibles)
  app.get("/api/audiobooks/google-credentials", async (req, res) => {
    try {
      if (!googleCredentialsManager.isMasterKeyConfigured()) {
        res.status(400).json({ error: "GOOGLE_TTS_MASTER_KEY not configured" });
        return;
      }
      const credentials = await googleCredentialsManager.listCredentials();
      res.json(credentials);
    } catch (error) {
      console.error("Error listing Google credentials:", error);
      res.status(500).json({ error: "Failed to list credentials" });
    }
  });

  // Obtener una credencial específica (sin datos sensibles)
  app.get("/api/audiobooks/google-credentials/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid credential ID" });
        return;
      }
      const credential = await googleCredentialsManager.getCredential(id);
      if (!credential) {
        res.status(404).json({ error: "Credential not found" });
        return;
      }
      res.json(credential);
    } catch (error) {
      console.error("Error getting Google credential:", error);
      res.status(500).json({ error: "Failed to get credential" });
    }
  });

  // Crear una nueva credencial de Google TTS
  app.post("/api/audiobooks/google-credentials", async (req, res) => {
    try {
      if (!googleCredentialsManager.isMasterKeyConfigured()) {
        res.status(400).json({ error: "GOOGLE_TTS_MASTER_KEY not configured" });
        return;
      }

      const { label, jsonPayload } = req.body;
      
      if (!label || typeof label !== "string") {
        res.status(400).json({ error: "Label is required" });
        return;
      }
      
      if (!jsonPayload || typeof jsonPayload !== "string") {
        res.status(400).json({ error: "JSON credentials payload is required" });
        return;
      }

      const credential = await googleCredentialsManager.createCredential(label, jsonPayload);
      
      // Return without sensitive data
      const { encryptedPayload, iv, authTag, ...safeCredential } = credential as any;
      res.json(safeCredential);
    } catch (error) {
      console.error("Error creating Google credential:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create credential" });
    }
  });

  // Actualizar etiqueta de una credencial
  app.patch("/api/audiobooks/google-credentials/:id/label", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid credential ID" });
        return;
      }

      const { label } = req.body;
      if (!label || typeof label !== "string") {
        res.status(400).json({ error: "Label is required" });
        return;
      }

      await googleCredentialsManager.updateCredentialLabel(id, label);
      const credential = await googleCredentialsManager.getCredential(id);
      res.json(credential);
    } catch (error) {
      console.error("Error updating Google credential:", error);
      res.status(500).json({ error: "Failed to update credential" });
    }
  });

  // Actualizar JSON de una credencial
  app.put("/api/audiobooks/google-credentials/:id/payload", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid credential ID" });
        return;
      }

      const { jsonPayload } = req.body;
      if (!jsonPayload || typeof jsonPayload !== "string") {
        res.status(400).json({ error: "JSON credentials payload is required" });
        return;
      }

      await googleCredentialsManager.updateCredentialPayload(id, jsonPayload);
      const credential = await googleCredentialsManager.getCredential(id);
      res.json(credential);
    } catch (error) {
      console.error("Error updating Google credential payload:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update credential" });
    }
  });

  // Validar una credencial
  app.post("/api/audiobooks/google-credentials/:id/validate", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid credential ID" });
        return;
      }

      const result = await googleCredentialsManager.validateCredential(id);
      res.json(result);
    } catch (error) {
      console.error("Error validating Google credential:", error);
      res.status(500).json({ error: "Failed to validate credential" });
    }
  });

  // Eliminar una credencial
  app.delete("/api/audiobooks/google-credentials/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid credential ID" });
        return;
      }

      await googleCredentialsManager.deleteCredential(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting Google credential:", error);
      res.status(500).json({ error: "Failed to delete credential" });
    }
  });

  // Listar voces usando una credencial específica
  app.get("/api/audiobooks/google-credentials/:id/voices", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid credential ID" });
        return;
      }

      const { languageCode } = req.query;
      const voices = await googleCredentialsManager.listVoicesWithCredential(id, languageCode as string | undefined);
      res.json(voices);
    } catch (error) {
      console.error("Error listing voices with credential:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list voices" });
    }
  });

  // Iniciar síntesis con Google Cloud TTS
  app.post("/api/audiobooks/projects/:id/synthesize-google", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      if (!isGoogleTTSConfigured()) {
        res.status(400).json({ error: "Google Cloud TTS not configured" });
        return;
      }

      const project = await storage.getAudiobookProject(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      if (project.status === "synthesizing" || project.status === "mastering") {
        res.status(400).json({ error: "Project is already being processed" });
        return;
      }

      res.json({ message: "Synthesis with Google TTS started", projectId: id });

      setImmediate(async () => {
        try {
          console.log(`[Google TTS] Starting project ${id}...`);
          await synthesizeProjectWithGoogle(id, (completed, total, currentChapter) => {
            console.log(`[Google TTS] Project ${id}: ${completed}/${total} - ${currentChapter}`);
          });
          console.log(`[Google TTS] Completed project ${id}`);
        } catch (synthesisError) {
          console.error(`[Google TTS] Error in project ${id}:`, synthesisError instanceof Error ? synthesisError.message : synthesisError);
          try {
            await storage.updateAudiobookProject(id, {
              status: "failed",
              errorMessage: synthesisError instanceof Error ? synthesisError.message : "Unknown synthesis error"
            });
          } catch (updateErr) {
            console.error(`[Google TTS] Could not update error status:`, updateErr);
          }
        }
      });
    } catch (error) {
      console.error("Error starting Google synthesis:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to start Google synthesis" });
      }
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
      
      // Siempre regenerar URL fresca si tenemos el s3OutputUri
      // Las URLs pre-firmadas expiran después de 1 hora
      if (foundJob.s3OutputUri) {
        const { getAudioDownloadUrl } = await import("./services/polly-synthesizer");
        audioUrl = await getAudioDownloadUrl(foundJob.s3OutputUri, 3600);
      } else if (audioUrl.startsWith("s3://")) {
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

  // Verificar jobs atascados cada 15 minutos (60 minutos de timeout para síntesis paralela + mastering)
  const STUCK_JOB_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutos
  const STUCK_JOB_TIMEOUT_MINUTES = 60; // Aumentado a 60 min - margen amplio para síntesis paralela

  setInterval(async () => {
    try {
      const stuckCount = await storage.markStuckJobsAsFailed(STUCK_JOB_TIMEOUT_MINUTES);
      if (stuckCount > 0) {
        console.log(`[Recovery] Marked ${stuckCount} stuck jobs as failed (timeout: ${STUCK_JOB_TIMEOUT_MINUTES}min)`);
      }
    } catch (error) {
      console.error("[Recovery] Error checking for stuck jobs:", error);
    }
  }, STUCK_JOB_CHECK_INTERVAL);

  // ============================================================================
  // iVoox Metadata Generation
  // ============================================================================

  // Generate iVoox metadata for an audiobook project
  app.post("/api/audiobooks/projects/:id/ivoox-metadata", async (req, res) => {
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

      const chapters = await storage.getChaptersByProject(id);
      if (chapters.length === 0) {
        res.status(400).json({ error: "Project has no chapters" });
        return;
      }

      // Get manuscript text from chapters
      const manuscriptText = chapters.map(c => c.contentText).join("\n\n");
      const { genre = "Ficción", language = "es-ES" } = req.body;

      const { generateIVooxMetadataForProject, generateChaptersMetadata, generateIVooxPublishingGuide } = await import("./services/ivoox-metadata-generator");

      // Generate iVoox metadata using AI
      const metadata = await generateIVooxMetadataForProject(
        project.title,
        project.author,
        manuscriptText,
        genre,
        language
      );

      // Generate chapter-specific metadata
      const chaptersMetadata = generateChaptersMetadata(
        chapters.map(c => ({ title: c.title, sequenceNumber: c.sequenceNumber })),
        project.title,
        metadata
      );

      // Generate publishing guide
      const publishingGuide = generateIVooxPublishingGuide(metadata, chapters.length);
      console.log("[iVoox] Publishing guide length:", publishingGuide?.length || 0);

      res.json({
        success: true,
        projectId: id,
        projectTitle: project.title,
        metadata,
        chapters: chaptersMetadata,
        publishingGuide,
      });
    } catch (error) {
      console.error("Error generating iVoox metadata:", error);
      res.status(500).json({ error: "Failed to generate iVoox metadata" });
    }
  });

  // ============================================
  // REEDITOR - Text Reduction API
  // ============================================
  
  /**
   * POST /api/reeditor/reduce
   * Reduce text following custom guidelines
   */
  app.post("/api/reeditor/reduce", async (req, res) => {
    try {
      const { text, targetWordCount, guidelines, language = "es" } = req.body;

      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      if (!targetWordCount || typeof targetWordCount !== "number" || targetWordCount < 100) {
        res.status(400).json({ error: "Target word count must be at least 100" });
        return;
      }

      if (!guidelines || typeof guidelines !== "string" || guidelines.trim().length < 10) {
        res.status(400).json({ error: "Please provide reduction guidelines (at least 10 characters)" });
        return;
      }

      const originalWordCount = text.split(/\s+/).filter(Boolean).length;
      
      if (targetWordCount >= originalWordCount) {
        res.status(400).json({ 
          error: `Target word count (${targetWordCount}) must be less than original (${originalWordCount})` 
        });
        return;
      }

      console.log(`[Reeditor] Starting text reduction: ${originalWordCount} -> ${targetWordCount} words`);

      const { reduceTextWithGuidelines } = await import("./ai/openai-client");
      
      const reducedText = await reduceTextWithGuidelines(
        text,
        targetWordCount,
        guidelines,
        language
      );

      const finalWordCount = reducedText.split(/\s+/).filter(Boolean).length;

      res.json({
        success: true,
        originalWordCount,
        targetWordCount,
        finalWordCount,
        reductionPercentage: Math.round((1 - finalWordCount / originalWordCount) * 100),
        reducedText,
      });
    } catch (error) {
      console.error("[Reeditor] Error reducing text:", error);
      res.status(500).json({ 
        error: "Failed to reduce text",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * POST /api/reeditor/analyze
   * Analyze text to get word count and estimate processing time
   */
  app.post("/api/reeditor/analyze", async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const charCount = text.length;
      const paragraphCount = text.split(/\n\n+/).filter(Boolean).length;
      
      // Estimate processing time based on word count
      // ~3750 words per chunk, ~15 seconds per chunk
      const estimatedChunks = Math.ceil(charCount / 15000);
      const estimatedMinutes = Math.ceil((estimatedChunks * 15) / 60);

      res.json({
        wordCount,
        charCount,
        paragraphCount,
        estimatedChunks,
        estimatedMinutes,
      });
    } catch (error) {
      console.error("[Reeditor] Error analyzing text:", error);
      res.status(500).json({ error: "Failed to analyze text" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

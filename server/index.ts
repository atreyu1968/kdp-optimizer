import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { execSync } from "child_process";
import path from "path";

// Verify critical dependencies on startup
function checkDependencies() {
  console.log('[Startup] Checking critical dependencies...');
  
  // Check ffmpeg
  try {
    const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8', timeout: 5000 }).split('\n')[0];
    console.log('[Startup] ffmpeg:', ffmpegVersion);
  } catch (error) {
    console.error('[Startup] WARNING: ffmpeg not found! Audio mastering will fail.');
  }
  
  // Check ffprobe
  try {
    const ffprobeVersion = execSync('ffprobe -version', { encoding: 'utf8', timeout: 5000 }).split('\n')[0];
    console.log('[Startup] ffprobe:', ffprobeVersion);
  } catch (error) {
    console.error('[Startup] WARNING: ffprobe not found! Audio analysis will fail.');
  }
  
  // Check environment
  console.log('[Startup] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Startup] Database:', process.env.DATABASE_URL ? 'configured' : 'MISSING');
}

checkDependencies();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Aumentar timeout para uploads y processing de documentos largos
app.use((req, res, next) => {
  req.setTimeout(5 * 60 * 1000); // 5 minutos
  res.setTimeout(5 * 60 * 1000); // 5 minutos
  next();
});

// Servir archivos estáticos (portadas de libros, etc.)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error('[Error Handler]', message);

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });
  
  // Global error handlers to prevent crashes
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection]', reason, promise);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error);
    // Don't exit - keep the server running
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();

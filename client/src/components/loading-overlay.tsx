import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { UploadProgress } from "@shared/schema";

interface LoadingOverlayProps {
  progress: UploadProgress;
}

const stageMessages = {
  uploading: "Subiendo y procesando tu manuscrito...",
  analyzing: "Analizando manuscrito con IA...",
  researching: "Investigando palabras clave y categorías...",
  generating: "Generando metadatos optimizados...",
  complete: "¡Optimización completa!",
};

export function LoadingOverlay({ progress }: LoadingOverlayProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      data-testid="loading-overlay"
    >
      <div className="w-full max-w-md mx-4">
        <div className="bg-card border border-card-border rounded-xl shadow-xl p-8 space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold text-foreground">
                {stageMessages[progress.stage]}
                {progress.stage !== "complete" && dots}
              </h3>
              {progress.message && (
                <p className="text-sm text-muted-foreground">
                  {progress.message}
                </p>
              )}
              {progress.currentMarket && (
                <p className="text-sm font-medium text-primary">
                  Procesando {progress.currentMarket}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progreso</span>
              <span>{Math.round(progress.progress)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress.progress}%` }}
                data-testid="progress-bar"
              />
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Esto puede tomar unos momentos. Por favor no cierres esta ventana.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

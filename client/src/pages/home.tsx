import { useState, useRef, useEffect } from "react";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ConfigurationForm } from "@/components/configuration-form";
import { LoadingOverlay } from "@/components/loading-overlay";
import { ResultsPanel } from "@/components/results-panel";
import { ProgressIndicator } from "@/components/progress-indicator";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import type { OptimizationResult, UploadProgress } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [manuscriptText, setManuscriptText] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const handleFileAccepted = (file: File, content: string) => {
    setUploadedFile(file);
    setManuscriptText(content);
    const words = content.trim().split(/\s+/).length;
    setWordCount(words);
    setCurrentStep(2);
  };

  const handleConfigSubmit = async (configData: any) => {
    setCurrentStep(3);
    
    // Limpiar cualquier optimización en curso antes de iniciar una nueva
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    try {
      const response = await apiRequest("POST", "/api/optimize", {
        ...configData,
        manuscriptText,
      });
      const { sessionId } = await response.json();
      
      const eventSource = new EventSource(`/api/optimize/progress/${sessionId}`);
      eventSourceRef.current = eventSource;
      
      // Función para resetear el timeout watchdog - se reinicia con cada evento
      const resetWatchdog = () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        timeoutRef.current = setTimeout(() => {
          eventSource.close();
          eventSourceRef.current = null;
          timeoutRef.current = null;
          setProgress(null);
          setCurrentStep(2);
          toast({
            variant: "destructive",
            title: "Tiempo de espera agotado",
            description: "La optimización se detuvo inesperadamente. Por favor, intenta de nuevo o verifica tu conexión a internet.",
          });
        }, 20000);
      };
      
      // Iniciar watchdog
      resetWatchdog();
      
      eventSource.onmessage = (event) => {
        // Reiniciar watchdog con cada mensaje para detectar si deja de enviar eventos
        resetWatchdog();
        try {
          const progressData = JSON.parse(event.data);
          if (progressData.stage === "error") {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            setProgress(null);
            setCurrentStep(2);
            toast({
              variant: "destructive",
              title: "Error al optimizar",
              description: progressData.message || "Ocurrió un error inesperado. Por favor, intenta de nuevo.",
            });
            eventSource.close();
            eventSourceRef.current = null;
            return;
          }
          setProgress(progressData as UploadProgress);
        } catch (e) {
          console.error("Failed to parse progress data:", e);
        }
      };

      eventSource.addEventListener("complete", (event) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        try {
          const result = JSON.parse((event as MessageEvent).data);
          setResult(result);
          setCurrentStep(4);
          setProgress(null);
        } catch (e) {
          console.error("Failed to parse result:", e);
        } finally {
          eventSource.close();
          eventSourceRef.current = null;
        }
      });

      eventSource.onerror = (error) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        console.error("EventSource error:", error);
        eventSource.close();
        eventSourceRef.current = null;
        setProgress(null);
        setCurrentStep(2);
        toast({
          variant: "destructive",
          title: "Error de conexión",
          description: "Se perdió la conexión con el servidor. Por favor, verifica tu conexión a internet e intenta de nuevo.",
        });
      };
    } catch (error) {
      console.error("Optimization failed:", error);
      setProgress(null);
      setCurrentStep(2);
      toast({
        variant: "destructive",
        title: "Error al iniciar optimización",
        description: error instanceof Error ? error.message : "No se pudo iniciar la optimización. Por favor, intenta de nuevo.",
      });
    }
  };

  const handleStartNew = () => {
    setCurrentStep(1);
    setUploadedFile(null);
    setManuscriptText("");
    setWordCount(0);
    setResult(null);
    setProgress(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {progress && <LoadingOverlay progress={progress} />}

      <AppHeader />

      <main className="container mx-auto px-4 py-12">
        {currentStep < 4 && (
          <div className="mb-12">
            <ProgressIndicator currentStep={currentStep} />
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-3xl font-bold text-foreground">
                Optimiza tu Libro para Amazon KDP
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Sube tu manuscrito y deja que la IA genere metadatos optimizados para
                múltiples mercados de Amazon. Obtén títulos, descripciones, palabras clave y
                recomendaciones de precios en minutos.
              </p>
            </div>

            <FileUploadZone
              onFileAccepted={handleFileAccepted}
              acceptedFile={uploadedFile}
              wordCount={wordCount}
            />

            <div className="max-w-2xl mx-auto">
              <div className="grid sm:grid-cols-3 gap-6 text-center">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Potenciado por IA</h3>
                  <p className="text-sm text-muted-foreground">
                    Análisis avanzado usando modelos GPT
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-chart-2/10 flex items-center justify-center mx-auto">
                    <svg
                      className="h-6 w-6 text-chart-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-foreground">Multi-Mercado</h3>
                  <p className="text-sm text-muted-foreground">
                    Optimiza para 7 mercados de Amazon
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-chart-3/10 flex items-center justify-center mx-auto">
                    <svg
                      className="h-6 w-6 text-chart-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-foreground">Resultados Rápidos</h3>
                  <p className="text-sm text-muted-foreground">
                    Análisis completo en minutos
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-3xl font-bold text-foreground">
                Configura tu Optimización
              </h2>
              <p className="text-lg text-muted-foreground">
                Cuéntanos sobre tu libro y selecciona tus mercados objetivo
              </p>
            </div>

            <ConfigurationForm
              onSubmit={handleConfigSubmit}
            />

            <div className="flex justify-center">
              <Button
                variant="ghost"
                onClick={() => setCurrentStep(1)}
                data-testid="button-back"
              >
                ← Volver a Cargar
              </Button>
            </div>
          </div>
        )}

        {currentStep === 4 && result && (
          <div className="space-y-8">
            <ResultsPanel result={result} />

            <div className="flex justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={handleStartNew}
                data-testid="button-start-new"
              >
                Optimizar Otro Libro
              </Button>
            </div>
          </div>
        )}
      </main>

      <AppFooter />
    </div>
  );
}

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  FileText, 
  Upload, 
  Scissors, 
  Download, 
  AlertCircle, 
  CheckCircle2,
  BookOpen,
  Target,
  ClipboardList,
  Loader2,
  ArrowRight,
  RotateCcw
} from "lucide-react";

interface TextAnalysis {
  wordCount: number;
  charCount: number;
  paragraphCount: number;
  estimatedChunks: number;
  estimatedMinutes: number;
}

interface ReductionResult {
  success: boolean;
  originalWordCount: number;
  targetWordCount: number;
  finalWordCount: number;
  reductionPercentage: number;
  reducedText: string;
}

export default function Reeditor() {
  const { toast } = useToast();
  const [step, setStep] = useState<"upload" | "configure" | "processing" | "result">("upload");
  const [originalText, setOriginalText] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<TextAnalysis | null>(null);
  const [targetWordCount, setTargetWordCount] = useState<number>(0);
  const [guidelines, setGuidelines] = useState("");
  const [result, setResult] = useState<ReductionResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const reductionMutation = useMutation({
    mutationFn: async (data: { text: string; targetWordCount: number; guidelines: string }) => {
      const response = await apiRequest("POST", "/api/reeditor/reduce", data);
      return await response.json() as ReductionResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("result");
      toast({
        title: "Reducción completada",
        description: `Texto reducido de ${data.originalWordCount.toLocaleString()} a ${data.finalWordCount.toLocaleString()} palabras (${data.reductionPercentage}%)`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error en la reducción",
        description: error.message || "No se pudo procesar el texto",
      });
      setStep("configure");
    },
  });

  const handleFileAccepted = useCallback(async (file: File, content: string) => {
    setOriginalText(content);
    setFileName(file.name);
    setIsAnalyzing(true);

    try {
      const response = await apiRequest("POST", "/api/reeditor/analyze", { text: content });
      const analysisData = await response.json() as TextAnalysis;
      setAnalysis(analysisData);
      setTargetWordCount(Math.round(analysisData.wordCount * 0.6));
      setStep("configure");
    } catch {
      toast({
        variant: "destructive",
        title: "Error al analizar",
        description: "No se pudo analizar el texto",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [toast]);

  const handleStartReduction = () => {
    if (!guidelines.trim() || guidelines.length < 10) {
      toast({
        variant: "destructive",
        title: "Pautas requeridas",
        description: "Por favor, escribe las pautas de reducción (mínimo 10 caracteres)",
      });
      return;
    }

    if (targetWordCount >= (analysis?.wordCount || 0)) {
      toast({
        variant: "destructive",
        title: "Objetivo inválido",
        description: "El objetivo debe ser menor que el conteo actual de palabras",
      });
      return;
    }

    setStep("processing");
    reductionMutation.mutate({
      text: originalText,
      targetWordCount,
      guidelines,
    });
  };

  const handleDownload = () => {
    if (!result?.reducedText) return;

    const blob = new Blob([result.reducedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.[^.]+$/, "") + "_reducido.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep("upload");
    setOriginalText("");
    setFileName("");
    setAnalysis(null);
    setTargetWordCount(0);
    setGuidelines("");
    setResult(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-2">
            <Scissors className="w-8 h-8 text-primary" />
            Reeditor
          </h1>
          <p className="text-muted-foreground">
            Reduce tu novela siguiendo tus propias pautas de edición
          </p>
        </div>

        {step === "upload" && (
          <FileUploadSection
            onFileAccepted={handleFileAccepted}
            isAnalyzing={isAnalyzing}
          />
        )}

        {step === "configure" && analysis && (
          <ConfigurationSection
            fileName={fileName}
            analysis={analysis}
            targetWordCount={targetWordCount}
            setTargetWordCount={setTargetWordCount}
            guidelines={guidelines}
            setGuidelines={setGuidelines}
            onStartReduction={handleStartReduction}
            onBack={handleReset}
          />
        )}

        {step === "processing" && analysis && (
          <ProcessingSection
            analysis={analysis}
            targetWordCount={targetWordCount}
          />
        )}

        {step === "result" && result && (
          <ResultSection
            result={result}
            onDownload={handleDownload}
            onReset={handleReset}
          />
        )}
      </main>

      <AppFooter />
    </div>
  );
}

function FileUploadSection({ 
  onFileAccepted, 
  isAnalyzing 
}: { 
  onFileAccepted: (file: File, content: string) => void;
  isAnalyzing: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);
      const file = acceptedFiles[0];
      if (!file) return;

      const MAX_FILE_SIZE = 20 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        setError(`El archivo es demasiado grande. Máximo 20 MB.`);
        return;
      }

      setIsReading(true);

      try {
        let content = "";
        if (file.name.endsWith(".txt")) {
          content = await file.text();
        } else if (file.name.endsWith(".docx")) {
          const mammoth = await import("mammoth");
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          content = result.value;
        } else {
          setError("Formato no soportado. Usa .txt o .docx");
          setIsReading(false);
          return;
        }

        if (content.length < 1000) {
          setError("El texto debe tener al menos 1000 caracteres");
          setIsReading(false);
          return;
        }

        onFileAccepted(file, content);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al leer el archivo");
      } finally {
        setIsReading(false);
      }
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: isReading || isAnalyzing,
    accept: {
      "text/plain": [".txt"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Subir Novela
        </CardTitle>
        <CardDescription>
          Arrastra tu archivo o haz clic para seleccionar (.txt o .docx)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={`
            cursor-pointer transition-all duration-300
            border-2 border-dashed rounded-lg p-12 text-center
            ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary hover:bg-primary/5"}
            ${isReading || isAnalyzing ? "pointer-events-none opacity-50" : ""}
          `}
          data-testid="file-upload-reeditor"
        >
          <input {...getInputProps()} data-testid="file-input-reeditor" />
          
          {isReading || isAnalyzing ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="text-muted-foreground">
                {isReading ? "Leyendo archivo..." : "Analizando texto..."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <FileText className="w-12 h-12 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {isDragActive ? "Suelta el archivo aquí" : "Arrastra tu novela aquí"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  o haz clic para seleccionar
                </p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigurationSection({
  fileName,
  analysis,
  targetWordCount,
  setTargetWordCount,
  guidelines,
  setGuidelines,
  onStartReduction,
  onBack,
}: {
  fileName: string;
  analysis: TextAnalysis;
  targetWordCount: number;
  setTargetWordCount: (value: number) => void;
  guidelines: string;
  setGuidelines: (value: string) => void;
  onStartReduction: () => void;
  onBack: () => void;
}) {
  const reductionPercentage = Math.round((1 - targetWordCount / analysis.wordCount) * 100);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Análisis del Texto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {analysis.wordCount.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Palabras</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">
                {analysis.charCount.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Caracteres</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">
                {analysis.paragraphCount.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Párrafos</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">
                ~{analysis.estimatedMinutes}
              </div>
              <div className="text-sm text-muted-foreground">Min. estimados</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="w-4 h-4" />
            {fileName}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Objetivo de Reducción
          </CardTitle>
          <CardDescription>
            ¿Cuántas palabras quieres en el resultado final?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="targetWords">Palabras objetivo</Label>
              <Input
                id="targetWords"
                type="number"
                value={targetWordCount}
                onChange={(e) => setTargetWordCount(parseInt(e.target.value) || 0)}
                min={1000}
                max={analysis.wordCount - 1}
                data-testid="input-target-words"
              />
            </div>
            <div className="text-center">
              <Badge variant={reductionPercentage > 50 ? "destructive" : "secondary"}>
                -{reductionPercentage}%
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sugerencias:</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTargetWordCount(Math.round(analysis.wordCount * 0.8))}
              data-testid="button-20-percent"
            >
              -20%
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTargetWordCount(Math.round(analysis.wordCount * 0.7))}
              data-testid="button-30-percent"
            >
              -30%
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTargetWordCount(Math.round(analysis.wordCount * 0.6))}
              data-testid="button-40-percent"
            >
              -40%
            </Button>
          </div>

          <Progress 
            value={100 - reductionPercentage} 
            className="h-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{analysis.wordCount.toLocaleString()} original</span>
            <span>{targetWordCount.toLocaleString()} objetivo</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Pautas de Reducción
          </CardTitle>
          <CardDescription>
            Escribe las instrucciones específicas para reducir tu novela
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={`Ejemplo de pautas:
- Eliminar descripciones excesivas de paisajes
- Condensar diálogos repetitivos manteniendo la esencia
- Reducir escenas de transición innecesarias
- Simplificar párrafos de introspección muy largos
- Mantener intactas las escenas de acción principales
- Conservar el desarrollo de los personajes principales`}
            value={guidelines}
            onChange={(e) => setGuidelines(e.target.value)}
            className="min-h-[200px]"
            data-testid="textarea-guidelines"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Cuanto más específicas sean las pautas, mejor será el resultado.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-between gap-4">
        <Button
          variant="outline"
          onClick={onBack}
          data-testid="button-back"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <Button
          onClick={onStartReduction}
          disabled={!guidelines.trim() || targetWordCount >= analysis.wordCount}
          data-testid="button-start-reduction"
        >
          Iniciar Reducción
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function ProcessingSection({
  analysis,
  targetWordCount,
}: {
  analysis: TextAnalysis;
  targetWordCount: number;
}) {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
            <Scissors className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-2">Reduciendo tu novela...</h2>
            <p className="text-muted-foreground">
              Procesando {analysis.estimatedChunks} secciones de texto
            </p>
          </div>

          <div className="w-full max-w-md space-y-2">
            <Progress value={undefined} className="h-2" />
            <p className="text-sm text-muted-foreground">
              Tiempo estimado: ~{analysis.estimatedMinutes} minutos
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            {analysis.wordCount.toLocaleString()} palabras → {targetWordCount.toLocaleString()} palabras
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultSection({
  result,
  onDownload,
  onReset,
}: {
  result: ReductionResult;
  onDownload: () => void;
  onReset: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-chart-2">
            <CheckCircle2 className="w-5 h-5" />
            Reducción Completada
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-xl font-bold">
                {result.originalWordCount.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Original</div>
            </div>
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <div className="text-xl font-bold text-primary">
                {result.finalWordCount.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Final</div>
            </div>
            <div className="text-center p-4 bg-chart-2/10 rounded-lg">
              <div className="text-xl font-bold text-chart-2">
                -{result.reductionPercentage}%
              </div>
              <div className="text-sm text-muted-foreground">Reducción</div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex items-center gap-4 justify-center">
            <Button onClick={onDownload} data-testid="button-download">
              <Download className="w-4 h-4 mr-2" />
              Descargar Texto Reducido
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowPreview(!showPreview)}
              data-testid="button-preview"
            >
              {showPreview ? "Ocultar Vista Previa" : "Ver Vista Previa"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showPreview && (
        <Card>
          <CardHeader>
            <CardTitle>Vista Previa</CardTitle>
            <CardDescription>
              Primeros 3000 caracteres del texto reducido
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 p-4 rounded-lg max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono">
                {result.reducedText.substring(0, 3000)}
                {result.reducedText.length > 3000 && "\n\n[...]"}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center">
        <Button variant="outline" onClick={onReset} data-testid="button-new-reduction">
          <RotateCcw className="w-4 h-4 mr-2" />
          Nueva Reducción
        </Button>
      </div>
    </div>
  );
}

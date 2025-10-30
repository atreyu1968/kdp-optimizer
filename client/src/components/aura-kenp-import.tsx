import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KenpImportStats {
  monthlyRecordsCreated: number;
  penNamesProcessed: number;
  errors: string[];
}

interface KenpImportResult {
  success: boolean;
  message: string;
  stats: KenpImportStats;
}

interface AuraKenpImportProps {
  onImportComplete?: () => void;
  onClose?: () => void;
}

export function AuraKenpImport({ onImportComplete, onClose }: AuraKenpImportProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<KenpImportResult | null>(null);
  const { toast } = useToast();

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    
    // Validar extensión
    if (!file.name.endsWith('.xlsx')) {
      toast({
        title: "Error",
        description: "Solo se permiten archivos Excel (.xlsx)",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simular progreso
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const res = await fetch('/api/aura/import/kenp', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Error ${res.status}: ${errorText}`);
      }

      const response: KenpImportResult = await res.json();

      clearInterval(progressInterval);
      setUploadProgress(100);
      setResult(response);

      toast({
        title: "Importación KENP exitosa",
        description: `${response.stats.monthlyRecordsCreated} registros mensuales importados`,
      });

      if (onImportComplete) {
        onImportComplete();
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      toast({
        title: "Error al importar KENP",
        description: errorMessage,
        variant: "destructive",
      });
      setResult({
        success: false,
        message: errorMessage,
        stats: {
          monthlyRecordsCreated: 0,
          penNamesProcessed: 0,
          errors: [errorMessage],
        },
      });
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Importar Datos KENP de KDP</CardTitle>
          <CardDescription>
            Sube el archivo XLSX descargado desde KDP Dashboard (solo hoja "KENP leídas")
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Importante:</strong> Esta importación reemplazará todos los datos KENP anteriores con los nuevos datos del archivo.
            </AlertDescription>
          </Alert>

          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
              transition-colors duration-200
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
              ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover-elevate'}
            `}
            data-testid="dropzone-kenp-import"
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
              {uploading ? (
                <FileSpreadsheet className="w-12 h-12 text-primary animate-pulse" />
              ) : (
                <Upload className="w-12 h-12 text-muted-foreground" />
              )}
              
              <div>
                <p className="text-lg font-medium">
                  {uploading ? 'Importando KENP...' : isDragActive ? 'Suelta el archivo aquí' : 'Arrastra tu archivo XLSX aquí'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {!uploading && 'o haz clic para seleccionar'}
                </p>
              </div>

              {!uploading && (
                <Button variant="outline" size="sm" data-testid="button-select-kenp-file">
                  Seleccionar Archivo KENP
                </Button>
              )}
            </div>
          </div>

          {uploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="w-full" data-testid="progress-kenp-import" />
              <p className="text-sm text-center text-muted-foreground">
                {uploadProgress < 100 ? 'Subiendo y procesando KENP...' : 'Finalizando...'}
              </p>
            </div>
          )}

          {result && (
            <Alert variant={result.success ? "default" : "destructive"} data-testid="alert-kenp-import-result">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {result.message}
              </AlertDescription>
            </Alert>
          )}

          {result?.success && result.stats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resultados de la Importación KENP</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Registros Mensuales</p>
                    <p className="text-2xl font-bold" data-testid="stat-kenp-records">
                      {result.stats.monthlyRecordsCreated}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Seudónimos Procesados</p>
                    <p className="text-2xl font-bold" data-testid="stat-kenp-pen-names">
                      {result.stats.penNamesProcessed}
                    </p>
                  </div>
                </div>

                {result.stats.errors.length > 0 && (
                  <Alert variant="default">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium mb-1">
                        {result.stats.errors.length} advertencia(s):
                      </p>
                      <ul className="text-sm space-y-1">
                        {result.stats.errors.slice(0, 3).map((error, i) => (
                          <li key={i} className="text-muted-foreground">• {error}</li>
                        ))}
                        {result.stats.errors.length > 3 && (
                          <li className="text-muted-foreground">
                            ... y {result.stats.errors.length - 3} más
                          </li>
                        )}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {onClose && (
                  <Button 
                    onClick={onClose} 
                    className="w-full"
                    data-testid="button-close-kenp-import"
                  >
                    Cerrar
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cómo Descargar Datos KENP de KDP</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. Ingresa a <a href="https://kdp.amazon.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">KDP Dashboard</a></li>
            <li>2. Ve a "Informes" → "Informes de ventas y regalías"</li>
            <li>3. Selecciona el rango de fechas que deseas importar (se recomienda todo el período disponible)</li>
            <li>4. Haz clic en "Descargar" y selecciona formato XLSX</li>
            <li>5. Sube el archivo descargado aquí</li>
            <li className="text-yellow-600 dark:text-yellow-500">⚠️ <strong>Nota:</strong> Esta importación reemplazará todos tus datos KENP anteriores</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

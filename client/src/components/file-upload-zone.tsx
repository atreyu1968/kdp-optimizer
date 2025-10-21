import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FileUploadZoneProps {
  onFileAccepted: (file: File, content: string) => void;
  acceptedFile: File | null;
  wordCount: number;
}

export function FileUploadZone({
  onFileAccepted,
  acceptedFile,
  wordCount,
}: FileUploadZoneProps) {
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);
      const file = acceptedFiles[0];
      if (!file) return;

      setIsReading(true);

      try {
        const content = await readFileContent(file);
        if (content.length < 100) {
          setError("Manuscript must be at least 100 characters long");
          setIsReading(false);
          return;
        }
        onFileAccepted(file, content);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to read file"
        );
      } finally {
        setIsReading(false);
      }
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".txt"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
    },
    maxFiles: 1,
    disabled: isReading,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card
        {...getRootProps()}
        className={`
          relative cursor-pointer transition-all duration-300
          border-2 border-dashed p-12
          ${
            isDragActive
              ? "border-primary bg-primary/5"
              : acceptedFile
              ? "border-chart-2 bg-chart-2/5"
              : "border-muted-foreground/25 hover:border-primary hover:bg-primary/5"
          }
          ${isReading ? "pointer-events-none opacity-50" : ""}
        `}
        data-testid="file-upload-zone"
      >
        <input {...getInputProps()} data-testid="file-input" />

        <div className="flex flex-col items-center justify-center space-y-6">
          {acceptedFile ? (
            <>
              <CheckCircle2 className="h-20 w-20 text-chart-2" />
              <div className="text-center space-y-2">
                <p className="text-xl font-semibold text-foreground">
                  File Uploaded Successfully
                </p>
                <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{acceptedFile.name}</span>
                  </div>
                  <span>{formatFileSize(acceptedFile.size)}</span>
                  <span className="font-medium text-foreground">
                    {wordCount.toLocaleString()} words
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                data-testid="button-change-file"
              >
                Change File
              </Button>
            </>
          ) : (
            <>
              <Upload className="h-20 w-20 text-muted-foreground" />
              <div className="text-center space-y-2">
                <p className="text-xl font-semibold text-foreground">
                  {isDragActive
                    ? "Drop your manuscript here"
                    : "Upload Your Manuscript"}
                </p>
                <p className="text-sm text-muted-foreground max-w-md">
                  Drag and drop your manuscript file here, or click to browse.
                  Supports .txt and .docx files.
                </p>
              </div>
              <Button variant="outline" size="lg" data-testid="button-browse">
                Browse Files
              </Button>
            </>
          )}
        </div>

        {isReading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Reading file...
              </p>
            </div>
          </div>
        )}
      </Card>

      {error && (
        <div
          className="mt-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3"
          data-testid="error-message"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

async function readFileContent(file: File): Promise<string> {
  if (file.name.endsWith(".txt")) {
    return await file.text();
  }

  if (file.name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  throw new Error("Unsupported file type");
}

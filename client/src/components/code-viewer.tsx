import { useState } from "react";
import { Card } from "@/components/ui/card";
import { CopyButton } from "./copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CodeViewerProps {
  htmlCode: string;
  title?: string;
}

export function CodeViewer({ htmlCode, title = "Descripción HTML" }: CodeViewerProps) {
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");

  const highlightHTML = (code: string) => {
    return code
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(
        /(&lt;\/?)([\w]+)([^&]*?)(&gt;)/g,
        '<span class="text-chart-1">$1$2</span><span class="text-chart-3">$3</span><span class="text-chart-1">$4</span>'
      );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium uppercase tracking-wide text-foreground">
          {title}
        </h4>
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "code" | "preview")}>
            <TabsList className="h-8">
              <TabsTrigger value="code" className="text-xs" data-testid="tab-code">
                Código
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs" data-testid="tab-preview">
                Vista Previa
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <CopyButton text={htmlCode} label="Copiar HTML" />
        </div>
      </div>

      <Card className="p-6">
        {viewMode === "code" ? (
          <pre className="text-sm font-mono overflow-x-auto whitespace-pre-wrap break-words">
            <code
              dangerouslySetInnerHTML={{ __html: highlightHTML(htmlCode) }}
              data-testid="code-content"
            />
          </pre>
        ) : (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: htmlCode }}
            data-testid="preview-content"
          />
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Máximo 4000 caracteres. Copia y pega directamente en KDP.
      </p>
    </div>
  );
}

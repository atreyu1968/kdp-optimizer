import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import type { KeywordField } from "@shared/schema";
import { CheckCircle2, Info, AlertTriangle } from "lucide-react";

interface KeywordFieldsProps {
  fields: KeywordField[];
}

export function KeywordFields({ fields }: KeywordFieldsProps) {
  const getCharCountColor = (charCount: number) => {
    if (charCount === 0) return "text-muted-foreground";
    if (charCount > 50) return "text-destructive";
    if (charCount > 45) return "text-yellow-600 dark:text-yellow-500";
    return "text-chart-2";
  };

  const getCharCountIcon = (charCount: number) => {
    if (charCount === 0) return null;
    if (charCount > 50) return <AlertTriangle className="h-3 w-3" />;
    if (charCount > 45) return <Info className="h-3 w-3" />;
    return <CheckCircle2 className="h-3 w-3" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium uppercase tracking-wide text-foreground">
          Palabras Clave Backend (7 Campos)
        </h4>
        <CopyButton
          text={fields.map((f) => f.keywords).join("\n")}
          label="Copiar Todas"
        />
      </div>

      <div className="grid gap-3">
        {fields.map((field, index) => (
          <Card
            key={index}
            className="p-4"
            data-testid={`keyword-field-${index + 1}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">
                    Campo {index + 1}
                  </Badge>
                  <span
                    className={`text-xs font-medium flex items-center gap-1 ${getCharCountColor(
                      field.charCount
                    )}`}
                    data-testid={`char-count-${index + 1}`}
                  >
                    {getCharCountIcon(field.charCount)}
                    {field.charCount}/50 caracteres
                  </span>
                </div>
                <p className="text-sm text-foreground break-words">
                  {field.keywords}
                </p>
              </div>
              <CopyButton text={field.keywords} label="" size="icon" variant="ghost" />
            </div>
          </Card>
        ))}
      </div>

      <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
        <p className="text-xs font-medium text-foreground">
          💡 Guías de Palabras Clave KDP:
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
          <li>Cada campo máximo 50 caracteres</li>
          <li>Separa palabras clave con comas</li>
          <li>Sin nombres de autores, ASINs o términos con marca registrada</li>
          <li>Mezcla de palabras clave de cola larga y corta</li>
        </ul>
      </div>
    </div>
  );
}

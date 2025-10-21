import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import type { KeywordField } from "@shared/schema";
import { CheckCircle2, Info, AlertTriangle } from "lucide-react";

interface KeywordFieldsProps {
  fields: KeywordField[];
}

export function KeywordFields({ fields }: KeywordFieldsProps) {
  const getByteCountColor = (byteCount: number) => {
    if (byteCount === 0) return "text-muted-foreground";
    if (byteCount > 249) return "text-destructive";
    if (byteCount > 230) return "text-yellow-600 dark:text-yellow-500";
    return "text-chart-2";
  };

  const getByteCountIcon = (byteCount: number) => {
    if (byteCount === 0) return null;
    if (byteCount > 249) return <AlertTriangle className="h-3 w-3" />;
    if (byteCount > 230) return <Info className="h-3 w-3" />;
    return <CheckCircle2 className="h-3 w-3" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium uppercase tracking-wide text-foreground">
          Backend Keywords (7 Fields)
        </h4>
        <CopyButton
          text={fields.map((f) => f.keywords).join("\n")}
          label="Copy All"
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
                    Field {index + 1}
                  </Badge>
                  <span
                    className={`text-xs font-medium flex items-center gap-1 ${getByteCountColor(
                      field.byteCount
                    )}`}
                    data-testid={`byte-count-${index + 1}`}
                  >
                    {getByteCountIcon(field.byteCount)}
                    {field.byteCount}/249 bytes
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
          💡 KDP Keyword Guidelines:
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
          <li>Each field maximum 249 bytes</li>
          <li>Separate keywords with spaces (not commas)</li>
          <li>No author names, ASINs, or trademarked terms</li>
          <li>Mix of long-tail and short-tail keywords</li>
        </ul>
      </div>
    </div>
  );
}

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { KeywordField } from "@shared/schema";
import { CheckCircle2, Info, AlertTriangle, HelpCircle } from "lucide-react";

interface KeywordFieldsProps {
  fields: KeywordField[];
  isFiction?: boolean;
}

// Estrategia de 4 tipos de palabras clave según guía de marketing KDP
const KEYWORD_TYPES = [
  {
    type: "GÉNERO",
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
    description: "Subgénero específico del libro",
    example: "Fantasía urbana con brujas y romance",
    badExample: "Fantasía",
  },
  {
    type: "PÚBLICO",
    color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
    description: "Identidad del lector objetivo",
    example: "Libros para mujeres emprendedoras de 35+",
    badExample: "Para mujeres",
  },
  {
    type: "TROPOS",
    color: "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/30",
    description: "Tropos literarios que buscan los lectores",
    example: "Enemies to lovers slow burn",
    badExample: "Romance",
  },
  {
    type: "AMBIENTACIÓN",
    typeFiction: "AMBIENTACIÓN",
    typeNonFiction: "SOLUCIÓN",
    color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    description: "Escenario y atmósfera del libro",
    descriptionNonFiction: "Problema específico que resuelve",
    example: "Victorian London gaslight mystery",
    exampleNonFiction: "Recetas bajas en carbohidratos para principiantes",
    badExample: "Histórico",
    badExampleNonFiction: "Dieta",
  },
  {
    type: "EMOCIÓN",
    color: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
    description: "Beneficio emocional que ofrece",
    example: "Feel-good heartwarming uplifting",
    badExample: "Bueno",
  },
  {
    type: "SINÓNIMOS",
    color: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30",
    description: "Variaciones y términos relacionados",
    example: "Thriller, suspense, intriga, misterio",
    badExample: "Libro",
  },
  {
    type: "COMPARABLES",
    color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
    description: "Libros o estilos similares que buscan lectores",
    example: "Fans de Stephen King, similar a IT",
    badExample: "Terror",
  },
];

export function KeywordFields({ fields, isFiction = true }: KeywordFieldsProps) {
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

  const getKeywordType = (index: number) => {
    const kwType = KEYWORD_TYPES[index];
    if (!kwType) return { type: `Campo ${index + 1}`, color: "bg-muted", description: "", example: "", badExample: "" };
    
    // Handle the AMBIENTACIÓN/SOLUCIÓN special case
    if (index === 3) {
      return {
        type: isFiction ? kwType.typeFiction : kwType.typeNonFiction,
        color: kwType.color,
        description: isFiction ? kwType.description : kwType.descriptionNonFiction,
        example: isFiction ? kwType.example : kwType.exampleNonFiction,
        badExample: isFiction ? kwType.badExample : kwType.badExampleNonFiction,
      };
    }
    
    return kwType;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium uppercase tracking-wide text-foreground">
            Palabras Clave Backend (7 Campos)
          </h4>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="text-xs">
                Estrategia de 4 tipos de palabras clave de cola larga para maximizar
                visibilidad en Amazon. Cada campo está optimizado para un tipo
                diferente de búsqueda.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <CopyButton
          text={fields.map((f) => f.keywords).join("\n")}
          label="Copiar Todas"
        />
      </div>

      <div className="grid gap-3">
        {fields.map((field, index) => {
          const kwType = getKeywordType(index);
          return (
            <Card
              key={index}
              className="p-4"
              data-testid={`keyword-field-${index + 1}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge 
                      variant="outline" 
                      className={`text-xs border ${kwType.color}`}
                    >
                      {kwType.type}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground cursor-help">
                          <HelpCircle className="h-3 w-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-medium">{kwType.description}</p>
                          <div className="flex items-center gap-1 text-chart-2">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>"{kwType.example}"</span>
                          </div>
                          <div className="flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Evita: "{kwType.badExample}"</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    <span
                      className={`text-xs font-medium flex items-center gap-1 ${getCharCountColor(
                        field.charCount
                      )}`}
                      data-testid={`char-count-${index + 1}`}
                    >
                      {getCharCountIcon(field.charCount)}
                      {field.charCount}/50
                    </span>
                  </div>
                  <p className="text-sm text-foreground break-words">
                    {field.keywords}
                  </p>
                </div>
                <CopyButton text={field.keywords} label="" size="icon" variant="ghost" />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
        <p className="text-xs font-medium text-foreground">
          Estrategia de 4 Tipos de Palabras Clave:
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
              GÉNERO
            </Badge>
            <span className="text-muted-foreground">Subgénero específico</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30">
              PÚBLICO
            </Badge>
            <span className="text-muted-foreground">Identidad del lector</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/30">
              TROPOS
            </Badge>
            <span className="text-muted-foreground">Tropos literarios</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
              {isFiction ? "AMBIENTACIÓN" : "SOLUCIÓN"}
            </Badge>
            <span className="text-muted-foreground">{isFiction ? "Escenario" : "Problema resuelto"}</span>
          </div>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc mt-2">
          <li>Cada campo máximo 50 caracteres</li>
          <li>Usa frases de cola larga, no palabras sueltas</li>
          <li>Sin nombres de autores, ASINs o términos con marca registrada</li>
        </ul>
      </div>
    </div>
  );
}

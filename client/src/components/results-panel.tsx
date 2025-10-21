import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import { CodeViewer } from "./code-viewer";
import { KeywordFields } from "./keyword-fields";
import { PricingTable } from "./pricing-table";
import { Separator } from "@/components/ui/separator";
import { amazonMarkets, type OptimizationResult } from "@shared/schema";
import { Download, Sparkles, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ResultsPanelProps {
  result: OptimizationResult;
}

export function ResultsPanel({ result }: ResultsPanelProps) {
  const [selectedMarket, setSelectedMarket] = useState(
    result.marketResults[0]?.market || ""
  );

  const selectedResult = result.marketResults.find(
    (r) => r.market === selectedMarket
  );

  if (!selectedResult) return null;

  const market = amazonMarkets[selectedResult.market as keyof typeof amazonMarkets];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-primary/10 via-chart-2/10 to-primary/10 border border-primary/20 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">
                ¡Optimización Completa!
              </h2>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">
                  {result.manuscriptWordCount.toLocaleString()}
                </span>{" "}
                palabras analizadas
              </span>
              <span>•</span>
              <span>
                <span className="font-medium text-foreground">
                  {result.marketResults.length}
                </span>{" "}
                mercados optimizados
              </span>
              <span>•</span>
              <span>
                <span className="font-medium text-foreground">
                  {result.seedKeywords.length}
                </span>{" "}
                palabras clave semilla encontradas
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" data-testid="button-download">
            <Download className="h-4 w-4 mr-2" />
            Exportar Resultados
          </Button>
        </div>
      </div>

      <Tabs value={selectedMarket} onValueChange={setSelectedMarket}>
        <div className="overflow-x-auto pb-2">
          <TabsList className="inline-flex h-auto p-1 bg-muted rounded-lg">
            {result.marketResults.map((marketResult) => {
              const m =
                amazonMarkets[marketResult.market as keyof typeof amazonMarkets];
              return (
                <TabsTrigger
                  key={marketResult.market}
                  value={marketResult.market}
                  className="data-[state=active]:bg-background px-4 py-2"
                  data-testid={`tab-${marketResult.market}`}
                >
                  <span className="text-xl mr-2">{m.flag}</span>
                  <span className="text-sm font-medium">{m.name}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {result.marketResults.map((marketResult) => (
          <TabsContent
            key={marketResult.market}
            value={marketResult.market}
            className="space-y-8 mt-6"
          >
            <Card className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">
                    Título y Subtítulo
                  </h3>
                  <CopyButton
                    text={`${marketResult.title}: ${marketResult.subtitle}`}
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Título
                    </label>
                    <p
                      className="text-base font-medium text-foreground mt-1"
                      data-testid="metadata-title"
                    >
                      {marketResult.title}
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Subtítulo
                    </label>
                    <p
                      className="text-base text-foreground mt-1"
                      data-testid="metadata-subtitle"
                    >
                      {marketResult.subtitle}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={
                        marketResult.title.length + marketResult.subtitle.length <= 180
                          ? "border-chart-2 text-chart-2"
                          : marketResult.title.length + marketResult.subtitle.length <= 200
                          ? "border-yellow-500 text-yellow-600 dark:text-yellow-500"
                          : "border-destructive text-destructive"
                      }
                      data-testid="character-count"
                    >
                      {marketResult.title.length + marketResult.subtitle.length <= 180 && (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      {marketResult.title.length + marketResult.subtitle.length > 180 &&
                        marketResult.title.length + marketResult.subtitle.length <= 200 && (
                        <Info className="h-3 w-3 mr-1" />
                      )}
                      {marketResult.title.length + marketResult.subtitle.length > 200 && (
                        <AlertTriangle className="h-3 w-3 mr-1" />
                      )}
                      {marketResult.title.length + marketResult.subtitle.length}/200
                      caracteres
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {marketResult.title.length + marketResult.subtitle.length <= 180
                        ? "¡Excelente! Dentro del límite"
                        : marketResult.title.length + marketResult.subtitle.length <= 200
                        ? "Cerca del límite"
                        : "Excede el límite de KDP"}
                    </span>
                  </div>
                </div>
              </div>

              {marketResult.validationWarnings && marketResult.validationWarnings.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium uppercase tracking-wide text-foreground flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                      Advertencias de Validación KDP
                    </h4>
                    <div className="space-y-2">
                      {marketResult.validationWarnings.map((warning, index) => (
                        <Alert
                          key={index}
                          variant={warning.severity === "error" ? "destructive" : "default"}
                          className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20"
                          data-testid={`warning-${index}`}
                        >
                          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                          <AlertTitle className="text-sm font-medium text-foreground">
                            {warning.type === "title_length" && "Longitud del Título"}
                            {warning.type === "keyword_bytes" && "Tamaño de Palabra Clave"}
                            {warning.type === "prohibited_terms" && "Términos Prohibidos"}
                            {warning.type === "html_tags" && "Etiquetas HTML"}
                          </AlertTitle>
                          <AlertDescription className="text-xs text-muted-foreground">
                            {warning.message}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <CodeViewer htmlCode={marketResult.description} />

              <Separator />

              <KeywordFields fields={marketResult.keywordFields} />

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium uppercase tracking-wide text-foreground">
                    Categorías Recomendadas
                  </h4>
                  <CopyButton
                    text={marketResult.categories.join("\n")}
                    label="Copiar"
                  />
                </div>
                <div className="space-y-2">
                  {marketResult.categories.map((category, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                      data-testid={`category-${index + 1}`}
                    >
                      <Badge
                        variant={index === 0 ? "default" : "secondary"}
                        className="shrink-0"
                      >
                        {index === 0 ? "Principal" : `Nicho ${index}`}
                      </Badge>
                      <span className="text-sm text-foreground">{category}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <PricingTable
                recommendedPrice={marketResult.recommendedPrice}
                currency={marketResult.currency}
                royaltyOption={marketResult.royaltyOption}
                estimatedEarnings={marketResult.estimatedEarnings}
                marketName={market.name}
              />
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card className="p-6 bg-muted/30">
        <div className="flex items-start gap-3">
          <div className="text-muted-foreground mt-0.5">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-foreground">
              Privacidad y Seguridad
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tu manuscrito se procesa de forma segura y no se almacena en nuestros
              servidores. Todo el procesamiento de IA ocurre en tiempo real y tus datos
              se eliminan inmediatamente después de la optimización.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

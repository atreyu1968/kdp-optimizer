import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingOverlay } from "@/components/loading-overlay";
import { ResultsPanel } from "@/components/results-panel";
import { CopyButton } from "@/components/copy-button";
import { CodeViewer } from "@/components/code-viewer";
import { KeywordFields } from "@/components/keyword-fields";
import { FlagIcon } from "@/components/flag-icon";
import { MarketingKitPanel } from "@/components/marketing-kit-panel";
import { LandingPagePanel } from "@/components/landing-page-panel";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { amazonMarkets, type Manuscript, type Optimization, type UploadProgress, type OptimizationResult, type MarketMetadata, type MarketingKit, type LandingPageContent } from "@shared/schema";
import { BookOpen, RefreshCw, History, Calendar, FileText, Sparkles, Search, Filter } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const availableLanguages = [
  { value: "all", label: "Todos los idiomas" },
  { value: "en", label: "Inglés" },
  { value: "es", label: "Español" },
  { value: "ca", label: "Catalán" },
  { value: "de", label: "Alemán" },
  { value: "fr", label: "Francés" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Portugués" },
];

export default function Library() {
  const { data: manuscripts, isLoading } = useQuery<Manuscript[]>({
    queryKey: ["/api/manuscripts"],
  });
  const { toast } = useToast();
  const [selectedManuscript, setSelectedManuscript] = useState<number | null>(null);
  const [reoptimizeDialogOpen, setReoptimizeDialogOpen] = useState(false);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [viewingOptimization, setViewingOptimization] = useState<Optimization | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  const eventSourceRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const manuscriptOptimizations = useQuery<Record<number, Optimization[]>>({
    queryKey: ["/api/manuscripts", "optimizations", manuscripts?.map(m => m.id).join(",")],
    queryFn: async () => {
      if (!manuscripts || manuscripts.length === 0) return {};
      
      const optimizationsMap: Record<number, Optimization[]> = {};
      await Promise.all(
        manuscripts.map(async (manuscript) => {
          const response = await fetch(`/api/manuscripts/${manuscript.id}/optimizations`);
          if (response.ok) {
            const opts = await response.json();
            optimizationsMap[manuscript.id] = opts;
          }
        })
      );
      return optimizationsMap;
    },
    enabled: !!manuscripts && manuscripts.length > 0,
  });

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

  const handleReoptimizeClick = (manuscriptId: number) => {
    setSelectedManuscript(manuscriptId);
    setSelectedMarkets([]);
    setReoptimizeDialogOpen(true);
  };

  const handleMarketToggle = (market: string) => {
    setSelectedMarkets((prev) =>
      prev.includes(market)
        ? prev.filter((m) => m !== market)
        : [...prev, market]
    );
  };

  const handleReoptimize = async () => {
    if (!selectedManuscript || selectedMarkets.length === 0) {
      toast({
        title: "Error",
        description: "Por favor selecciona al menos un mercado",
        variant: "destructive",
      });
      return;
    }

    setReoptimizeDialogOpen(false);

    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const response = await apiRequest("POST", `/api/manuscripts/${selectedManuscript}/reoptimize`, {
        targetMarkets: selectedMarkets,
        language: "es",
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
          toast({
            variant: "destructive",
            title: "Tiempo de espera agotado",
            description: "La re-optimización se detuvo inesperadamente. Por favor, intenta de nuevo o verifica tu conexión a internet.",
          });
        }, 180000); // 3 minutos entre eventos SSE para manuscritos largos
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
            toast({
              title: "Error",
              description: progressData.message,
              variant: "destructive",
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
          setProgress(null);
          queryClient.invalidateQueries({ queryKey: ["/api/manuscripts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/manuscripts", "optimizations"] });
          toast({
            title: "¡Optimización completa!",
            description: `Tu manuscrito ha sido re-optimizado para ${selectedMarkets.length} mercado(s)`,
          });
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
        toast({
          variant: "destructive",
          title: "Error de conexión",
          description: "Se perdió la conexión con el servidor durante la re-optimización. Por favor, verifica tu conexión a internet e intenta de nuevo.",
        });
      };
    } catch (error) {
      console.error("Reoptimization failed:", error);
      setProgress(null);
      toast({
        variant: "destructive",
        title: "Error al iniciar re-optimización",
        description: error instanceof Error ? error.message : "No se pudo iniciar la re-optimización. Por favor, intenta de nuevo.",
      });
    }
  };

  const getOptimizationCount = (manuscriptId: number) => {
    return manuscriptOptimizations.data?.[manuscriptId]?.length || 0;
  };

  const getLastOptimizationDate = (manuscriptId: number) => {
    const opts = manuscriptOptimizations.data?.[manuscriptId];
    if (!opts || opts.length === 0) return null;
    return new Date(opts[0].createdAt);
  };

  const handleBackToLibrary = () => {
    setResult(null);
    setSelectedManuscript(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    queryClient.invalidateQueries({ queryKey: ["/api/manuscripts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/manuscripts", "optimizations"] });
  };

  const filteredManuscripts = useMemo(() => {
    if (!manuscripts) return [];
    
    return manuscripts.filter((manuscript) => {
      const matchesSearch = searchQuery.trim() === "" || 
        manuscript.originalTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        manuscript.author.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesLanguage = selectedLanguage === "all" || 
        manuscript.language === selectedLanguage;
      
      return matchesSearch && matchesLanguage;
    });
  }, [manuscripts, searchQuery, selectedLanguage]);

  if (result) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto px-4 py-12">
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={handleBackToLibrary}
              data-testid="button-back-to-library"
            >
              ← Volver a Mi Biblioteca
            </Button>
          </div>
          <ResultsPanel result={result} />
        </main>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {progress && <LoadingOverlay progress={progress} />}
      <AppHeader />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Mi Biblioteca de Libros</h1>
                <p className="text-muted-foreground">
                  Gestiona tus manuscritos y optimizaciones
                </p>
              </div>
            </div>
          </div>

          {!isLoading && manuscripts && manuscripts.length > 0 && (
            <Card className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Buscar por título o autor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
                <div className="sm:w-48">
                  <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                    <SelectTrigger data-testid="select-language-filter">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {availableLanguages.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value} data-testid={`option-language-${lang.value}`}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(searchQuery || selectedLanguage !== "all") && (
                <div className="mt-3 text-sm text-muted-foreground">
                  Mostrando {filteredManuscripts.length} de {manuscripts.length} libro{manuscripts.length !== 1 ? "s" : ""}
                </div>
              )}
            </Card>
          )}

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                      <Skeleton className="h-10 w-32" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : !manuscripts || manuscripts.length === 0 ? (
            <Card className="p-12">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                    <BookOpen className="h-10 w-10 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-foreground">
                    No hay libros guardados aún
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Comienza optimizando tu primer manuscrito para verlo aparecer aquí
                  </p>
                </div>
                <Button
                  variant="default"
                  asChild
                >
                  <Link href="/" data-testid="button-start-optimizing">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Optimizar mi Primer Libro
                  </Link>
                </Button>
              </div>
            </Card>
          ) : filteredManuscripts.length === 0 ? (
            <Card className="p-12">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                    <Search className="h-10 w-10 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-foreground">
                    No se encontraron resultados
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    No hay libros que coincidan con tu búsqueda. Intenta con otros términos o ajusta los filtros.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedLanguage("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  Limpiar Filtros
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredManuscripts.map((manuscript) => {
                const optimizationCount = getOptimizationCount(manuscript.id);
                const lastOptimization = getLastOptimizationDate(manuscript.id);

                return (
                  <Card key={manuscript.id} className="overflow-hidden" data-testid={`manuscript-card-${manuscript.id}`}>
                    <div className="p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div>
                            <h3 className="text-xl font-semibold text-foreground mb-1" data-testid={`manuscript-title-${manuscript.id}`}>
                              {manuscript.originalTitle}
                            </h3>
                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <FileText className="h-3.5 w-3.5" />
                                {manuscript.author}
                              </span>
                              <span>•</span>
                              <span>{manuscript.genre}</span>
                              <span>•</span>
                              <span>{manuscript.wordCount.toLocaleString()} palabras</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="gap-1">
                              <Calendar className="h-3 w-3" />
                              Creado: {format(new Date(manuscript.createdAt), "d 'de' MMMM, yyyy", { locale: es })}
                            </Badge>
                            <Badge variant="secondary" data-testid={`optimization-count-${manuscript.id}`}>
                              {optimizationCount} optimización{optimizationCount !== 1 ? "es" : ""} realizada{optimizationCount !== 1 ? "s" : ""}
                            </Badge>
                            {lastOptimization && (
                              <Badge variant="outline" className="gap-1">
                                Última: {format(lastOptimization, "d 'de' MMM", { locale: es })}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReoptimizeClick(manuscript.id)}
                            data-testid={`button-reoptimize-${manuscript.id}`}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Re-optimizar
                          </Button>
                        </div>
                      </div>

                      {optimizationCount > 0 && (
                        <>
                          <Separator />
                          <Accordion type="single" collapsible>
                            <AccordionItem value="history" className="border-none">
                              <AccordionTrigger 
                                className="hover:no-underline py-2"
                                data-testid={`button-view-history-${manuscript.id}`}
                              >
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <History className="h-4 w-4" />
                                  Ver Historial de Optimizaciones
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                {manuscriptOptimizations.isLoading ? (
                                  <div className="space-y-2 pt-2">
                                    <Skeleton className="h-16 w-full" />
                                    <Skeleton className="h-16 w-full" />
                                  </div>
                                ) : (
                                  <div className="space-y-3 pt-2">
                                    {manuscriptOptimizations.data?.[manuscript.id]?.map((optimization, index) => (
                                      <div
                                        key={optimization.id}
                                        className="bg-muted/30 rounded-lg p-4 space-y-2"
                                        data-testid={`optimization-${manuscript.id}-${index}`}
                                      >
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="flex-1 space-y-2">
                                            <div className="flex items-center gap-2">
                                              <Badge variant={index === 0 ? "default" : "secondary"}>
                                                {index === 0 ? "Más reciente" : `Optimización ${optimizationCount - index}`}
                                              </Badge>
                                              <span className="text-sm text-muted-foreground">
                                                {format(new Date(optimization.createdAt), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
                                              </span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                              {optimization.targetMarkets.map((market) => {
                                                const marketInfo = amazonMarkets[market as keyof typeof amazonMarkets];
                                                return marketInfo ? (
                                                  <Badge key={market} variant="outline" className="text-xs flex items-center gap-1.5">
                                                    <FlagIcon countryCode={marketInfo.countryCode} size="sm" />
                                                    {marketInfo.name}
                                                  </Badge>
                                                ) : null;
                                              })}
                                            </div>
                                            {optimization.seedKeywords && optimization.seedKeywords.length > 0 && (
                                              <div className="text-xs text-muted-foreground">
                                                {optimization.seedKeywords.length} palabras clave identificadas
                                              </div>
                                            )}
                                          </div>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setViewingOptimization(optimization)}
                                            data-testid={`button-view-optimization-${manuscript.id}-${index}`}
                                          >
                                            Ver Detalles
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={reoptimizeDialogOpen} onOpenChange={setReoptimizeDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-reoptimize">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Re-optimizar Manuscrito
            </DialogTitle>
            <DialogDescription>
              Selecciona los mercados para los que deseas generar nuevos metadatos optimizados
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">Mercados Objetivo</h4>
              <div className="space-y-2">
                {Object.entries(amazonMarkets).map(([key, market]) => (
                  <div
                    key={key}
                    className="flex items-center space-x-3 p-3 rounded-lg hover-elevate"
                    data-testid={`checkbox-market-${key}`}
                  >
                    <Checkbox
                      id={key}
                      checked={selectedMarkets.includes(key)}
                      onCheckedChange={() => handleMarketToggle(key)}
                    />
                    <label
                      htmlFor={key}
                      className="flex items-center gap-2 text-sm font-medium cursor-pointer flex-1"
                    >
                      <FlagIcon countryCode={market.countryCode} size="md" />
                      <span className="text-foreground">{market.name}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {selectedMarkets.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  {selectedMarkets.length} mercado{selectedMarkets.length !== 1 ? "s" : ""} seleccionado{selectedMarkets.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => setReoptimizeDialogOpen(false)}
              data-testid="button-cancel-reoptimize"
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleReoptimize}
              disabled={selectedMarkets.length === 0}
              data-testid="button-confirm-reoptimize"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-optimizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingOptimization} onOpenChange={(open) => !open && setViewingOptimization(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" data-testid="dialog-optimization-details">
          {viewingOptimization && (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-2xl">
                  <History className="h-6 w-6 text-primary" />
                  Detalles de Optimización
                </DialogTitle>
                <DialogDescription className="text-base flex flex-wrap gap-4">
                  <span className="text-foreground font-medium">
                    {format(new Date(viewingOptimization.createdAt), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
                  </span>
                  <span>•</span>
                  <span>{viewingOptimization.targetMarkets.length} mercado{viewingOptimization.targetMarkets.length !== 1 ? "s" : ""}</span>
                  <span>•</span>
                  <span>{viewingOptimization.seedKeywords.length} palabras clave</span>
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue={viewingOptimization.targetMarkets[0]} className="w-full">
                <div className="overflow-x-auto pb-2">
                  <TabsList className="inline-flex h-auto p-1 bg-muted rounded-lg">
                    {viewingOptimization.targetMarkets.map((market) => {
                      const m = amazonMarkets[market as keyof typeof amazonMarkets];
                      return m ? (
                        <TabsTrigger
                          key={market}
                          value={market}
                          className="data-[state=active]:bg-background px-4 py-2 flex items-center gap-2"
                          data-testid={`tab-${market}`}
                        >
                          <FlagIcon countryCode={m.countryCode} size="md" />
                          <span className="text-sm font-medium">{m.name}</span>
                        </TabsTrigger>
                      ) : null;
                    })}
                  </TabsList>
                </div>

                {((viewingOptimization.marketResults as any) as MarketMetadata[]).map((marketResult) => (
                  <TabsContent
                    key={marketResult.market}
                    value={marketResult.market}
                    className="space-y-6 mt-6"
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
                            <p className="text-base font-medium text-foreground mt-1">
                              {marketResult.title}
                            </p>
                          </div>

                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Subtítulo
                            </label>
                            <p className="text-base text-foreground mt-1">
                              {marketResult.subtitle}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant={
                              (marketResult.title.length + marketResult.subtitle.length + 2) <= 200
                                ? "outline"
                                : "destructive"
                            }>
                              {marketResult.title.length + marketResult.subtitle.length + 2} / 200 caracteres
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-foreground">
                            Descripción del Libro
                          </h3>
                          <CopyButton text={marketResult.description} />
                        </div>

                        <CodeViewer htmlCode={marketResult.description} />
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-foreground">
                            Palabras Clave (Backend)
                          </h3>
                        </div>

                        <KeywordFields fields={marketResult.keywordFields} />
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-foreground">
                          Precio Recomendado
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Card className="p-4 bg-muted/30">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                Precio
                              </p>
                              <p className="text-2xl font-bold text-primary">
                                {marketResult.currency === "USD" && "$"}
                                {marketResult.currency === "EUR" && "€"}
                                {marketResult.currency === "GBP" && "£"}
                                {marketResult.currency === "BRL" && "R$"}
                                {marketResult.recommendedPrice.toFixed(2)}
                              </p>
                            </div>
                          </Card>

                          <Card className="p-4 bg-muted/30">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                Regalía
                              </p>
                              <p className="text-2xl font-bold text-foreground">
                                {marketResult.royaltyOption}
                              </p>
                            </div>
                          </Card>

                          <Card className="p-4 bg-muted/30">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                Ganancia por Venta
                              </p>
                              <p className="text-2xl font-bold text-chart-2">
                                {marketResult.currency === "USD" && "$"}
                                {marketResult.currency === "EUR" && "€"}
                                {marketResult.currency === "GBP" && "£"}
                                {marketResult.currency === "BRL" && "R$"}
                                {marketResult.estimatedEarnings.toFixed(2)}
                              </p>
                            </div>
                          </Card>
                        </div>
                      </div>

                      <Separator />

                      {/* Categorías */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-foreground">
                            Categorías
                          </h3>
                          <CopyButton text={marketResult.categories.join("\n")} />
                        </div>
                        <div className="space-y-2">
                          {marketResult.categories.map((category, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-2">
                                <Badge variant={idx === 0 ? "default" : "secondary"} className="text-xs">
                                  {idx === 0 ? "Principal" : `Nicho ${idx}`}
                                </Badge>
                                <span className="text-sm text-foreground">{category}</span>
                              </div>
                              <CopyButton text={category} label="" size="icon" variant="ghost" />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* SEO */}
                      {marketResult.seo && (
                        <>
                          <Separator />
                          <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-foreground">
                              SEO para Landing Page
                            </h3>
                            <div className="space-y-3">
                              <div className="p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Título SEO
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={marketResult.seo.seoTitle.length <= 60 ? "outline" : "destructive"} className="text-xs">
                                      {marketResult.seo.seoTitle.length}/60
                                    </Badge>
                                    <CopyButton text={marketResult.seo.seoTitle} label="" size="icon" variant="ghost" />
                                  </div>
                                </div>
                                <p className="text-sm text-foreground">{marketResult.seo.seoTitle}</p>
                              </div>

                              <div className="p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Meta Descripción
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={marketResult.seo.seoDescription.length <= 160 ? "outline" : "destructive"} className="text-xs">
                                      {marketResult.seo.seoDescription.length}/160
                                    </Badge>
                                    <CopyButton text={marketResult.seo.seoDescription} label="" size="icon" variant="ghost" />
                                  </div>
                                </div>
                                <p className="text-sm text-foreground">{marketResult.seo.seoDescription}</p>
                              </div>

                              <div className="p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Keywords SEO
                                  </label>
                                  <CopyButton text={marketResult.seo.seoKeywords.join(", ")} label="" size="icon" variant="ghost" />
                                </div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {marketResult.seo.seoKeywords.map((kw, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </Card>
                  </TabsContent>
                ))}
              </Tabs>

              {/* Marketing Kit */}
              {viewingOptimization.marketingKit && (
                <MarketingKitPanel marketingKit={viewingOptimization.marketingKit as MarketingKit} />
              )}

              {/* Landing Page Content */}
              {viewingOptimization.landingPageContent && (
                <LandingPagePanel 
                  landingPageContent={viewingOptimization.landingPageContent as LandingPageContent} 
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AppFooter />
    </div>
  );
}

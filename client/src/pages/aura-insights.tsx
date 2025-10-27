import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  TrendingUp,
  Pause,
  Sparkles,
  RefreshCw,
  DollarSign,
  Calendar,
  ShoppingCart,
  BookOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface EnrichedInsight {
  id: number;
  bookId: number;
  recommendation: "OPTIMIZE" | "HOLD" | "RAISE_PRICE";
  rationale: string;
  actions: string[];
  priceSuggestion: string | null;
  confidence: number;
  analyzedAt: string;
  status: string;
  book: {
    id: number;
    asin: string;
    title: string;
    subtitle: string | null;
    price: string;
    marketplaces: string[];
  } | null;
  penName: string;
  metrics: {
    totalSales30d: number;
    totalRoyalties30d: number;
    totalKenpPages30d: number;
    salesTrend: number;
    royaltiesTrend: number;
    daysPublished: number;
    avgPrice: number;
  };
}

export default function AuraInsights() {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { data: insights, isLoading, refetch } = useQuery<EnrichedInsight[]>({
    queryKey: ['/api/aura/insights'],
  });

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      await apiRequest('POST', '/api/aura/analyze-books');
      
      toast({
        title: "Análisis iniciado",
        description: "La IA está analizando tus libros. Actualiza la página en unos momentos para ver los resultados.",
      });

      // Refrescar después de 10 segundos
      setTimeout(() => {
        refetch();
        setIsAnalyzing(false);
      }, 10000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo iniciar el análisis",
        variant: "destructive",
      });
      setIsAnalyzing(false);
    }
  };

  const getCategoryConfig = (category: string) => {
    switch (category) {
      case "OPTIMIZE":
        return {
          icon: AlertCircle,
          label: "Optimizar",
          bgColor: "bg-orange-50 dark:bg-orange-950/20",
          borderColor: "border-orange-200 dark:border-orange-800",
          badgeVariant: "destructive" as const,
          textColor: "text-orange-700 dark:text-orange-400",
        };
      case "RAISE_PRICE":
        return {
          icon: TrendingUp,
          label: "Subir Precio",
          bgColor: "bg-green-50 dark:bg-green-950/20",
          borderColor: "border-green-200 dark:border-green-800",
          badgeVariant: "default" as const,
          textColor: "text-green-700 dark:text-green-400",
        };
      case "HOLD":
        return {
          icon: Pause,
          label: "Mantener",
          bgColor: "bg-blue-50 dark:bg-blue-950/20",
          borderColor: "border-blue-200 dark:border-blue-800",
          badgeVariant: "secondary" as const,
          textColor: "text-blue-700 dark:text-blue-400",
        };
      default:
        return {
          icon: Sparkles,
          label: "Sin categoría",
          bgColor: "bg-card",
          borderColor: "border-border",
          badgeVariant: "outline" as const,
          textColor: "text-foreground",
        };
    }
  };

  const categorizeInsights = () => {
    if (!insights) return { OPTIMIZE: [], RAISE_PRICE: [], HOLD: [] };
    
    return {
      OPTIMIZE: insights.filter(i => i.recommendation === "OPTIMIZE"),
      RAISE_PRICE: insights.filter(i => i.recommendation === "RAISE_PRICE"),
      HOLD: insights.filter(i => i.recommendation === "HOLD"),
    };
  };

  const categorized = categorizeInsights();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-insights">
            Análisis con IA
          </h1>
          <p className="text-muted-foreground mt-1">
            Recomendaciones inteligentes basadas en datos de ventas reales
          </p>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          size="lg"
          data-testid="button-analyze"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Analizando...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Analizar Libros
            </>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      ) : insights && insights.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay análisis disponibles</h3>
            <p className="text-muted-foreground text-center mb-4">
              Haz clic en "Analizar Libros" para que la IA evalúe tus libros y genere recomendaciones
            </p>
            <Button onClick={handleAnalyze} disabled={isAnalyzing}>
              <Sparkles className="mr-2 h-4 w-4" />
              Analizar Ahora
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Optimizar */}
          {categorized.OPTIMIZE.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <h2 className="text-2xl font-bold">
                  Libros para Optimizar ({categorized.OPTIMIZE.length})
                </h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {categorized.OPTIMIZE.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          )}

          {/* Subir Precio */}
          {categorized.RAISE_PRICE.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h2 className="text-2xl font-bold">
                  Listos para Subir Precio ({categorized.RAISE_PRICE.length})
                </h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {categorized.RAISE_PRICE.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          )}

          {/* Mantener */}
          {categorized.HOLD.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Pause className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold">
                  Rendimiento Estable ({categorized.HOLD.length})
                </h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {categorized.HOLD.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: EnrichedInsight }) {
  const config = getCategoryConfig(insight.recommendation);
  const Icon = config.icon;

  return (
    <Card 
      className={`${config.bgColor} ${config.borderColor} border-2 hover-elevate`}
      data-testid={`card-insight-${insight.bookId}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-lg line-clamp-2">
              {insight.book?.title || "Libro sin título"}
            </CardTitle>
            <CardDescription className="mt-1">
              {insight.penName}
            </CardDescription>
          </div>
          <Icon className={`h-5 w-5 ${config.textColor} flex-shrink-0`} />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant={config.badgeVariant} className="font-semibold">
            {config.label}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {insight.confidence}% confianza
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Métricas clave */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{insight.metrics.totalSales30d}</span>
            <span className="text-muted-foreground text-xs">ventas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">${insight.metrics.totalRoyalties30d.toFixed(0)}</span>
            <span className="text-muted-foreground text-xs">regalías</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{Math.round(insight.metrics.totalKenpPages30d / 1000)}k</span>
            <span className="text-muted-foreground text-xs">KENP</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{insight.metrics.daysPublished}</span>
            <span className="text-muted-foreground text-xs">días</span>
          </div>
        </div>

        {/* Tendencia */}
        <div className="flex items-center gap-2 p-2 rounded-md bg-background/50">
          <TrendingUp className={`h-4 w-4 ${insight.metrics.royaltiesTrend >= 0 ? 'text-green-600' : 'text-red-600'}`} />
          <span className="text-sm">
            Tendencia: <span className={`font-semibold ${insight.metrics.royaltiesTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {insight.metrics.royaltiesTrend.toFixed(1)}%
            </span>
          </span>
        </div>

        {/* Razonamiento */}
        <div>
          <p className="text-sm text-foreground/90 line-clamp-3">
            {insight.rationale}
          </p>
        </div>

        {/* Acciones */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            Acciones recomendadas:
          </p>
          <ul className="space-y-1">
            {insight.actions.slice(0, 3).map((action, idx) => (
              <li key={idx} className="text-xs flex items-start gap-1.5">
                <span className="text-primary mt-0.5">•</span>
                <span className="flex-1">{action}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Sugerencia de precio */}
        {insight.priceSuggestion && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-green-100 dark:bg-green-950/30 border border-green-300 dark:border-green-800">
            <DollarSign className="h-4 w-4 text-green-700 dark:text-green-400" />
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">
              Precio sugerido: {insight.priceSuggestion}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getCategoryConfig(category: string) {
  switch (category) {
    case "OPTIMIZE":
      return {
        icon: AlertCircle,
        label: "Optimizar",
        bgColor: "bg-orange-50 dark:bg-orange-950/20",
        borderColor: "border-orange-200 dark:border-orange-800",
        badgeVariant: "destructive" as const,
        textColor: "text-orange-700 dark:text-orange-400",
      };
    case "RAISE_PRICE":
      return {
        icon: TrendingUp,
        label: "Subir Precio",
        bgColor: "bg-green-50 dark:bg-green-950/20",
        borderColor: "border-green-200 dark:border-green-800",
        badgeVariant: "default" as const,
        textColor: "text-green-700 dark:text-green-400",
      };
    case "HOLD":
      return {
        icon: Pause,
        label: "Mantener",
        bgColor: "bg-blue-50 dark:bg-blue-950/20",
        borderColor: "border-blue-200 dark:border-blue-800",
        badgeVariant: "secondary" as const,
        textColor: "text-blue-700 dark:text-blue-400",
      };
    default:
      return {
        icon: Sparkles,
        label: "Sin categoría",
        bgColor: "bg-card",
        borderColor: "border-border",
        badgeVariant: "outline" as const,
        textColor: "text-foreground",
      };
  }
}

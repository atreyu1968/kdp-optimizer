import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BookOpen, 
  TrendingUp, 
  TrendingDown, 
  Upload,
  Calendar,
  Sparkles,
  Minus,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { useMemo, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface KenpMonthlyData {
  id: number;
  bookId: number | null;
  asin: string;
  penNameId: number;
  month: string; // YYYY-MM
  totalKenpPages: number;
  marketplaces: string[];
  importedAt: string;
}

interface AuraBook {
  id: number;
  asin: string;
  title: string;
  subtitle: string | null;
  penNameId: number;
  marketplaces: string[];
}

interface PenName {
  id: number;
  name: string;
}

interface MonthlyEvolution {
  month: string;
  totalPages: number;
  booksCount: number;
  avgPagesPerBook: number;
}

interface BookTrend {
  asin: string;
  title: string;
  penName: string;
  last6Months: Array<{ month: string; pages: number }>;
  totalPages: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
  recommendation: 'POTENCIAR' | 'MANTENER' | 'OPTIMIZAR';
}

export default function AuraUnlimited() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: kenpData, isLoading: loadingKenp, refetch } = useQuery<KenpMonthlyData[]>({
    queryKey: ['/api/aura/kenp'],
  });

  const { data: books, isLoading: loadingBooks } = useQuery<AuraBook[]>({
    queryKey: ['/api/aura/books'],
  });

  const { data: penNames, isLoading: loadingPenNames } = useQuery<PenName[]>({
    queryKey: ['/api/aura/pen-names'],
  });

  const isLoading = loadingKenp || loadingBooks || loadingPenNames;

  // Calcular evolución mensual agregada
  const monthlyEvolution = useMemo<MonthlyEvolution[]>(() => {
    if (!kenpData) return [];

    const monthMap = new Map<string, { pages: number; books: Set<string> }>();

    kenpData.forEach(record => {
      const existing = monthMap.get(record.month) || { pages: 0, books: new Set() };
      existing.pages += record.totalKenpPages;
      existing.books.add(record.asin);
      monthMap.set(record.month, existing);
    });

    // Ordenar por mes y tomar últimos 6
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, data]) => ({
        month,
        totalPages: data.pages,
        booksCount: data.books.size,
        avgPagesPerBook: Math.round(data.pages / data.books.size),
      }));
  }, [kenpData]);

  // Calcular tendencias por libro
  const bookTrends = useMemo<BookTrend[]>(() => {
    if (!kenpData || !books || !penNames) return [];

    const bookMap = new Map<string, KenpMonthlyData[]>();
    kenpData.forEach(record => {
      const records = bookMap.get(record.asin) || [];
      records.push(record);
      bookMap.set(record.asin, records);
    });

    const trends: BookTrend[] = [];

    bookMap.forEach((records, asin) => {
      const book = books.find(b => b.asin === asin);
      if (!book) return;

      const penName = penNames.find(p => p.id === book.penNameId);
      if (!penName) return;

      // Ordenar por mes y tomar últimos 6
      const sortedRecords = records
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-6);

      const last6Months = sortedRecords.map(r => ({
        month: r.month,
        pages: r.totalKenpPages,
      }));

      const totalPages = sortedRecords.reduce((sum, r) => sum + r.totalKenpPages, 0);

      // Calcular tendencia comparando últimos 3 meses vs anteriores 3 meses
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let trendPercentage = 0;

      if (sortedRecords.length >= 3) {
        const recent3 = sortedRecords.slice(-3);
        const previous3 = sortedRecords.slice(-6, -3);

        if (previous3.length >= 3) {
          const recentAvg = recent3.reduce((sum, r) => sum + r.totalKenpPages, 0) / 3;
          const previousAvg = previous3.reduce((sum, r) => sum + r.totalKenpPages, 0) / 3;

          if (previousAvg > 0) {
            trendPercentage = Math.round(((recentAvg - previousAvg) / previousAvg) * 100);
            
            if (trendPercentage > 15) trend = 'up';
            else if (trendPercentage < -15) trend = 'down';
            else trend = 'stable';
          }
        }
      }

      // Determinar recomendación
      let recommendation: 'POTENCIAR' | 'MANTENER' | 'OPTIMIZAR' = 'MANTENER';
      if (trend === 'up' && totalPages > 10000) {
        recommendation = 'POTENCIAR';
      } else if (trend === 'down' || totalPages < 5000) {
        recommendation = 'OPTIMIZAR';
      }

      trends.push({
        asin,
        title: book.title,
        penName: penName.name,
        last6Months,
        totalPages,
        trend,
        trendPercentage,
        recommendation,
      });
    });

    // Ordenar por totalPages descendente
    return trends.sort((a, b) => b.totalPages - a.totalPages);
  }, [kenpData, books, penNames]);

  // Estadísticas generales
  const stats = useMemo(() => {
    if (!kenpData) return { totalBooks: 0, totalPages: 0, avgPagesPerBook: 0 };

    const uniqueBooks = new Set(kenpData.map(r => r.asin));
    const totalPages = kenpData.reduce((sum, r) => sum + r.totalKenpPages, 0);

    return {
      totalBooks: uniqueBooks.size,
      totalPages,
      avgPagesPerBook: uniqueBooks.size > 0 ? Math.round(totalPages / uniqueBooks.size) : 0,
    };
  }, [kenpData]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      toast({
        title: "Importando datos KENP...",
        description: "Por favor espera, esto puede tardar unos momentos.",
      });

      await apiRequest('POST', '/api/aura/import/kenp', formData);

      toast({
        title: "✅ Importación exitosa",
        description: "Datos KENP actualizados correctamente. Datos anteriores reemplazados.",
      });

      // Refrescar datos
      await queryClient.invalidateQueries({ queryKey: ['/api/aura/kenp'] });
      await refetch();
    } catch (error: any) {
      toast({
        title: "Error en importación",
        description: error.message || "No se pudo importar el archivo KENP",
        variant: "destructive",
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getRecommendationConfig = (rec: string) => {
    switch (rec) {
      case 'POTENCIAR':
        return {
          variant: 'default' as const,
          className: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400',
        };
      case 'OPTIMIZAR':
        return {
          variant: 'destructive' as const,
          className: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400',
        };
      default:
        return {
          variant: 'secondary' as const,
          className: '',
        };
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const hasData = kenpData && kenpData.length > 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-title">Aura Unlimited</h1>
          <p className="text-muted-foreground">
            Análisis de evolución KENP - Amazon Kindle Unlimited
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileUpload}
            className="hidden"
            data-testid="input-kenp-file"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-import-kenp"
          >
            <Upload className="w-4 h-4 mr-2" />
            {hasData ? 'Actualizar datos KENP' : 'Importar datos KENP'}
          </Button>
        </div>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold">No hay datos KENP importados</h3>
                <p className="text-sm text-muted-foreground">
                  Importa tu archivo XLSX de "KENP leídas" desde el dashboard de KDP
                </p>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                data-testid="button-import-first"
              >
                <Upload className="w-4 h-4 mr-2" />
                Importar datos KENP
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Estadísticas generales */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Libros Trackeados</CardTitle>
                <BookOpen className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-books">
                  {stats.totalBooks}
                </div>
                <p className="text-xs text-muted-foreground">
                  Libros con datos KENP
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Páginas KENP Totales</CardTitle>
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-pages">
                  {stats.totalPages.toLocaleString('es-ES')}
                </div>
                <p className="text-xs text-muted-foreground">
                  Últimos {monthlyEvolution.length} meses
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Promedio por Libro</CardTitle>
                <Sparkles className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-pages">
                  {stats.avgPagesPerBook.toLocaleString('es-ES')}
                </div>
                <p className="text-xs text-muted-foreground">
                  Páginas KENP por libro
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Evolución mensual */}
          <Card>
            <CardHeader>
              <CardTitle>Evolución Mensual - Últimos 6 Meses</CardTitle>
              <CardDescription>
                Total de páginas KENP leídas por mes (70% de la facturación proviene de Unlimited)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyEvolution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => value.toLocaleString('es-ES')}
                    labelFormatter={(label) => `Mes: ${label}`}
                  />
                  <Legend />
                  <Bar dataKey="totalPages" fill="hsl(var(--primary))" name="Páginas KENP" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tendencias por libro */}
          <Card>
            <CardHeader>
              <CardTitle>Análisis por Libro - Recomendaciones Automáticas</CardTitle>
              <CardDescription>
                Tendencias de los últimos 6 meses con recomendaciones estratégicas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {bookTrends.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No hay suficientes datos para generar tendencias
                  </p>
                ) : (
                  bookTrends.map((trend) => {
                    const recConfig = getRecommendationConfig(trend.recommendation);
                    return (
                      <div 
                        key={trend.asin}
                        className="border rounded-lg p-4 space-y-3"
                        data-testid={`card-book-${trend.asin}`}
                      >
                        {/* Header del libro */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-sm">{trend.title}</h3>
                            <p className="text-xs text-muted-foreground">{trend.penName} • ASIN: {trend.asin}</p>
                          </div>
                          <Badge {...recConfig} data-testid={`badge-recommendation-${trend.asin}`}>
                            {trend.recommendation}
                          </Badge>
                        </div>

                        {/* Métricas */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-2xl font-bold" data-testid={`text-total-pages-${trend.asin}`}>
                              {trend.totalPages.toLocaleString('es-ES')}
                            </p>
                            <p className="text-xs text-muted-foreground">Total páginas</p>
                          </div>
                          <div>
                            <div className="flex items-center justify-center gap-1">
                              {trend.trend === 'up' ? (
                                <TrendingUp className="w-4 h-4 text-green-600" />
                              ) : trend.trend === 'down' ? (
                                <TrendingDown className="w-4 h-4 text-red-600" />
                              ) : (
                                <Minus className="w-4 h-4 text-muted-foreground" />
                              )}
                              <p 
                                className={`text-2xl font-bold ${
                                  trend.trend === 'up' ? 'text-green-600' : 
                                  trend.trend === 'down' ? 'text-red-600' : 
                                  'text-muted-foreground'
                                }`}
                                data-testid={`text-trend-${trend.asin}`}
                              >
                                {trend.trendPercentage > 0 ? '+' : ''}{trend.trendPercentage}%
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">Tendencia 3 meses</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold" data-testid={`text-months-${trend.asin}`}>
                              {trend.last6Months.length}
                            </p>
                            <p className="text-xs text-muted-foreground">Meses con datos</p>
                          </div>
                        </div>

                        {/* Mini gráfico de evolución */}
                        <ResponsiveContainer width="100%" height={120}>
                          <LineChart data={trend.last6Months}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="month" 
                              tick={{ fontSize: 10 }}
                            />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip 
                              formatter={(value: number) => value.toLocaleString('es-ES')}
                              labelFormatter={(label) => `Mes: ${label}`}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="pages" 
                              stroke="hsl(var(--primary))" 
                              strokeWidth={2}
                              name="Páginas KENP"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

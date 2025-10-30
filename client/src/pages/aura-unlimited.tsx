import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  BookOpen, 
  TrendingUp, 
  TrendingDown, 
  Upload,
  Calendar as CalendarIcon,
  Sparkles,
  Minus,
  Search,
  X,
  AlertCircle,
  Plus,
  Flag,
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
import { useMemo, useRef, useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { AuraKenpImport } from "@/components/aura-kenp-import";

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
  publishDate: string | null;
  bookType?: string; // "ebook", "paperback", "hardcover", "unknown"
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
  recommendation: 'POTENCIAR' | 'MANTENER' | 'OPTIMIZAR_METADATOS' | 'AUMENTAR_PROMO';
  recommendationReason: string;
}

interface BookEvent {
  id: number;
  bookId: number;
  asin: string;
  eventType: string;
  eventDate: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AuraUnlimited() {
  const { toast } = useToast();
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const asinFromUrl = urlParams.get('asin');
  
  const [searchQuery, setSearchQuery] = useState(asinFromUrl || '');
  const [trendFilter, setTrendFilter] = useState<string>('all');
  const [recommendationFilter, setRecommendationFilter] = useState<string>('all');
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [importDialogHeaderOpen, setImportDialogHeaderOpen] = useState(false);
  const [importDialogEmptyOpen, setImportDialogEmptyOpen] = useState(false);
  const [selectedBookForEvent, setSelectedBookForEvent] = useState<{ asin: string; bookId: number; title: string } | null>(null);
  const [newEvent, setNewEvent] = useState({
    eventType: 'promotion',
    eventDate: new Date().toISOString().split('T')[0],
    title: '',
    description: '',
  });

  // Update search query when URL parameter changes
  useEffect(() => {
    if (asinFromUrl) {
      setSearchQuery(asinFromUrl);
    }
  }, [asinFromUrl]);

  const { data: kenpData, isLoading: loadingKenp, refetch: refetchKenp } = useQuery<KenpMonthlyData[]>({
    queryKey: ['/api/aura/kenp'],
  });

  const { data: books, isLoading: loadingBooks, refetch: refetchBooks } = useQuery<AuraBook[]>({
    queryKey: ['/api/aura/books'],
  });

  const { data: penNames, isLoading: loadingPenNames, refetch: refetchPenNames } = useQuery<PenName[]>({
    queryKey: ['/api/aura/pen-names'],
  });

  const { data: allEvents } = useQuery<BookEvent[]>({
    queryKey: ['/api/aura/events'],
  });

  const createEventMutation = useMutation({
    mutationFn: async (eventData: any) => {
      return await apiRequest('POST', '/api/aura/events', eventData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/aura/events'] });
      setEventDialogOpen(false);
      setNewEvent({
        eventType: 'promotion',
        eventDate: new Date().toISOString().split('T')[0],
        title: '',
        description: '',
      });
      toast({
        title: "Evento creado",
        description: "El evento se ha registrado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el evento",
        variant: "destructive",
      });
    },
  });

  const isLoading = loadingKenp || loadingBooks || loadingPenNames;

  const handleImportComplete = async () => {
    // Invalidar y refetch inmediato para asegurar que los datos se actualizan
    try {
      await Promise.all([
        refetchKenp(),
        refetchBooks(),
        refetchPenNames(),
      ]);
    } catch (error) {
      console.error('Error refetching data after import:', error);
      toast({
        title: "Error al actualizar datos",
        description: "Los datos se importaron correctamente pero hubo un problema al refrescar la vista. Recarga la página para ver los cambios.",
        variant: "destructive",
      });
    }
  };

  const handleCloseImportDialogHeader = () => {
    setImportDialogHeaderOpen(false);
  };

  const handleCloseImportDialogEmpty = () => {
    setImportDialogEmptyOpen(false);
  };

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

  // Libros sin datos KENP
  const booksWithoutKenp = useMemo(() => {
    if (!books || !kenpData || !penNames) return [];

    // ASINs que tienen datos KENP
    const asinsWithKenp = new Set(kenpData.map(r => r.asin));

    // Libros que NO tienen datos KENP
    return books
      .filter(book => !asinsWithKenp.has(book.asin))
      .map(book => {
        const penName = penNames.find(p => p.id === book.penNameId);
        return {
          asin: book.asin,
          title: book.title,
          penName: penName?.name || 'Desconocido',
          publishDate: book.publishDate,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [books, kenpData, penNames]);

  // Helper: Generar últimos 6 meses calendario en formato YYYY-MM
  const getLast6MonthsCalendar = () => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push(monthStr);
    }
    return months;
  };

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
    const last6MonthsCalendar = getLast6MonthsCalendar();

    bookMap.forEach((records, asin) => {
      const book = books.find(b => b.asin === asin);
      if (!book) return;

      // FILTRAR libros impresos - solo mostrar ebooks en análisis KENP
      // Los libros impresos nunca tienen páginas KENP (Kindle Unlimited es solo para ebooks)
      if (book.bookType && book.bookType !== 'ebook' && book.bookType !== 'unknown') {
        return; // Excluir paperback, hardcover, etc.
      }

      const penName = penNames.find(p => p.id === book.penNameId);
      if (!penName) return;

      // Determinar mes de publicación (si existe)
      const publishMonth = book.publishDate ? new Date(book.publishDate).toISOString().slice(0, 7) : null;
      const publishDay = book.publishDate ? new Date(book.publishDate).getDate() : 1;
      
      // Crear mapa de registros por mes
      const recordsByMonth = new Map<string, KenpMonthlyData>();
      records.forEach(r => recordsByMonth.set(r.month, r));

      // Rellenar últimos 6 meses (con 0 si no hay datos)
      const last6Months = last6MonthsCalendar.map(month => {
        const record = recordsByMonth.get(month);
        return {
          month,
          pages: record?.totalKenpPages || 0,
        };
      });

      // Filtrar meses completos para cálculo de tendencias
      // excluir el mes de publicación si se publicó después del día 7
      const completeMonthsRecords = last6Months.filter(r => {
        if (!publishMonth) return true; // Si no hay fecha de publicación, asumir todos completos
        if (r.month !== publishMonth) return true; // Meses diferentes al de publicación son completos
        return publishDay <= 7; // El mes de publicación es completo solo si se publicó antes del día 7
      });

      const totalPages = last6Months.reduce((sum, r) => sum + r.pages, 0);

      // Calcular tendencia comparando últimos 3 meses vs anteriores 3 meses
      // IMPORTANTE: Usar solo meses completos para el cálculo de tendencias
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let trendPercentage = 0;

      // Solo calcular tendencia si hay al menos 6 meses completos (para comparar 3 vs 3)
      if (completeMonthsRecords.length >= 6) {
        const recent3 = completeMonthsRecords.slice(-3);
        const previous3 = completeMonthsRecords.slice(-6, -3);

        // Sumar páginas de cada periodo
        const recentTotal = recent3.reduce((sum, r) => sum + r.pages, 0);
        const previousTotal = previous3.reduce((sum, r) => sum + r.pages, 0);

        if (previousTotal > 0) {
          trendPercentage = Math.round(((recentTotal - previousTotal) / previousTotal) * 100);
          
          if (trendPercentage > 15) trend = 'up';
          else if (trendPercentage < -15) trend = 'down';
          else trend = 'stable';
        }
      } else if (completeMonthsRecords.length >= 3) {
        // Si hay menos de 6 meses completos pero al menos 3, comparar últimos 3 vs primeros 3
        const recent3 = completeMonthsRecords.slice(-3);
        const first3 = completeMonthsRecords.slice(0, 3);
        
        const recentTotal = recent3.reduce((sum, r) => sum + r.pages, 0);
        const firstTotal = first3.reduce((sum, r) => sum + r.pages, 0);
        
        if (firstTotal > 0 && recent3.length === 3 && first3.length === 3) {
          trendPercentage = Math.round(((recentTotal - firstTotal) / firstTotal) * 100);
          
          if (trendPercentage > 15) trend = 'up';
          else if (trendPercentage < -15) trend = 'down';
          else trend = 'stable';
        }
      }

      // Determinar recomendación con razón específica
      let recommendation: 'POTENCIAR' | 'MANTENER' | 'OPTIMIZAR_METADATOS' | 'AUMENTAR_PROMO' = 'MANTENER';
      let recommendationReason = '';

      if (trend === 'up' && totalPages > 10000) {
        recommendation = 'POTENCIAR';
        recommendationReason = 'Alto rendimiento y tendencia positiva. Considera subir precio o crear secuela.';
      } else if (trend === 'down') {
        recommendation = 'OPTIMIZAR_METADATOS';
        recommendationReason = 'Tendencia descendente. Revisa portada, descripción, precio y palabras clave.';
      } else if (totalPages < 5000) {
        recommendation = 'AUMENTAR_PROMO';
        recommendationReason = 'Bajo volumen de lecturas. Aumenta visibilidad con Amazon Ads o promociones.';
      } else if (trend === 'stable' && totalPages > 10000) {
        recommendation = 'MANTENER';
        recommendationReason = 'Rendimiento estable y saludable. Continúa con la estrategia actual.';
      } else {
        recommendation = 'MANTENER';
        recommendationReason = 'Rendimiento moderado. Monitorea evolución en próximos meses.';
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
        recommendationReason,
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

  // Filtrar bookTrends según los filtros activos
  const filteredBookTrends = useMemo(() => {
    if (!bookTrends) return [];

    return bookTrends.filter(trend => {
      // Filtro de búsqueda (título o autor)
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = searchQuery === '' || 
        trend.title.toLowerCase().includes(searchLower) ||
        trend.penName.toLowerCase().includes(searchLower) ||
        trend.asin.toLowerCase().includes(searchLower);

      // Filtro de tendencia
      const matchesTrend = trendFilter === 'all' || trend.trend === trendFilter;

      // Filtro de recomendación
      const matchesRecommendation = recommendationFilter === 'all' || 
        trend.recommendation === recommendationFilter;

      return matchesSearch && matchesTrend && matchesRecommendation;
    });
  }, [bookTrends, searchQuery, trendFilter, recommendationFilter]);


  const handleCreateEvent = () => {
    if (!selectedBookForEvent || !newEvent.title.trim()) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    createEventMutation.mutate({
      bookId: selectedBookForEvent.bookId,
      asin: selectedBookForEvent.asin,
      eventType: newEvent.eventType,
      eventDate: new Date(newEvent.eventDate).toISOString(),
      title: newEvent.title.trim(),
      description: newEvent.description.trim() || null,
    });
  };

  const openEventDialog = (bookId: number, asin: string, title: string) => {
    setSelectedBookForEvent({ bookId, asin, title });
    setEventDialogOpen(true);
  };

  const getRecommendationConfig = (rec: string) => {
    switch (rec) {
      case 'POTENCIAR':
        return {
          variant: 'default' as const,
          className: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400',
          label: 'Potenciar',
        };
      case 'OPTIMIZAR_METADATOS':
        return {
          variant: 'destructive' as const,
          className: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400',
          label: 'Optimizar Metadatos',
        };
      case 'AUMENTAR_PROMO':
        return {
          variant: 'destructive' as const,
          className: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400',
          label: 'Aumentar Promoción',
        };
      default:
        return {
          variant: 'secondary' as const,
          className: '',
          label: 'Mantener',
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
          <Dialog open={importDialogHeaderOpen} onOpenChange={setImportDialogHeaderOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-import-kenp">
                <Upload className="w-4 h-4 mr-2" />
                {hasData ? 'Actualizar datos' : 'Importar datos'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importar Datos de KDP</DialogTitle>
              </DialogHeader>
              <AuraKenpImport onImportComplete={handleImportComplete} onClose={handleCloseImportDialogHeader} />
            </DialogContent>
          </Dialog>
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
                  Importa tu archivo XLSX desde el dashboard de KDP
                </p>
              </div>
              <Dialog open={importDialogEmptyOpen} onOpenChange={setImportDialogEmptyOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-import-first">
                    <Upload className="w-4 h-4 mr-2" />
                    Importar datos
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Importar Datos de KDP</DialogTitle>
                  </DialogHeader>
                  <AuraKenpImport onImportComplete={handleImportComplete} onClose={handleCloseImportDialogEmpty} />
                </DialogContent>
              </Dialog>
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
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
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
              {/* Filtros */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                {/* Búsqueda */}
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por título, autor o ASIN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9"
                    data-testid="input-search-books"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="button-clear-search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filtro de Tendencia */}
                <Select value={trendFilter} onValueChange={setTrendFilter}>
                  <SelectTrigger data-testid="select-trend-filter">
                    <SelectValue placeholder="Todas las tendencias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las tendencias</SelectItem>
                    <SelectItem value="up">🔥 Al alza</SelectItem>
                    <SelectItem value="stable">➖ Estable</SelectItem>
                    <SelectItem value="down">📉 A la baja</SelectItem>
                  </SelectContent>
                </Select>

                {/* Filtro de Recomendación */}
                <Select value={recommendationFilter} onValueChange={setRecommendationFilter}>
                  <SelectTrigger data-testid="select-recommendation-filter">
                    <SelectValue placeholder="Todas las recomendaciones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las recomendaciones</SelectItem>
                    <SelectItem value="POTENCIAR">🚀 Potenciar</SelectItem>
                    <SelectItem value="MANTENER">✅ Mantener</SelectItem>
                    <SelectItem value="OPTIMIZAR_METADATOS">🔧 Optimizar Metadatos</SelectItem>
                    <SelectItem value="AUMENTAR_PROMO">📣 Aumentar Promoción</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Contador de resultados */}
              {(searchQuery || trendFilter !== 'all' || recommendationFilter !== 'all') && (
                <div className="mb-4 text-sm text-muted-foreground">
                  Mostrando {filteredBookTrends.length} de {bookTrends.length} libros
                </div>
              )}

              <div className="space-y-4">
                {bookTrends.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No hay suficientes datos para generar tendencias
                  </p>
                ) : filteredBookTrends.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No se encontraron libros que coincidan con los filtros
                  </p>
                ) : (
                  filteredBookTrends.map((trend) => {
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
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const book = books?.find(b => b.asin === trend.asin);
                                if (book) {
                                  openEventDialog(book.id, trend.asin, trend.title);
                                }
                              }}
                              data-testid={`button-add-event-${trend.asin}`}
                            >
                              <Flag className="w-3 h-3 mr-1" />
                              Marcar evento
                            </Button>
                            <Badge {...recConfig} data-testid={`badge-recommendation-${trend.asin}`}>
                              {recConfig.label}
                            </Badge>
                          </div>
                        </div>

                        {/* Razón de la recomendación */}
                        <div className="bg-muted/50 rounded-md p-3">
                          <p className="text-sm">
                            <span className="font-semibold">Recomendación:</span> {trend.recommendationReason}
                          </p>
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
                            <p className="text-xs text-muted-foreground">
                              {trend.trendPercentage === 0 ? 'Datos insuficientes' : 'Tendencia (meses completos)'}
                            </p>
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

          {/* Libros sin datos KENP */}
          {booksWithoutKenp.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                  Libros sin Datos KENP ({booksWithoutKenp.length})
                </CardTitle>
                <CardDescription>
                  Estos libros no tienen lecturas de Kindle Unlimited registradas. Pueden ser libros nuevos o que necesitan promoción urgente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {booksWithoutKenp.map((book) => (
                    <div
                      key={book.asin}
                      className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-muted"
                      data-testid={`book-no-kenp-${book.asin}`}
                    >
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{book.title}</h4>
                        <p className="text-xs text-muted-foreground">
                          {book.penName} • ASIN: {book.asin}
                          {book.publishDate && ` • Publicado: ${new Date(book.publishDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })}`}
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400">
                        Sin datos KENP
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md">
                  <p className="text-sm text-orange-800 dark:text-orange-400">
                    <span className="font-semibold">💡 Recomendación:</span> Estos libros necesitan aumentar su visibilidad. Considera campañas de Amazon Ads, promociones cruzadas con tus otros libros, o actualizar metadatos para mejorar su descubrimiento.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Dialog para crear eventos */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent data-testid="dialog-create-event">
          <DialogHeader>
            <DialogTitle>Marcar Evento para Libro</DialogTitle>
            <DialogDescription>
              Registra una promoción, optimización o cambio para {selectedBookForEvent?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="event-type">Tipo de evento *</Label>
              <Select
                value={newEvent.eventType}
                onValueChange={(value) => setNewEvent({ ...newEvent, eventType: value })}
              >
                <SelectTrigger id="event-type" data-testid="select-event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="promotion">📣 Promoción</SelectItem>
                  <SelectItem value="reoptimization">🔧 Reoptimización</SelectItem>
                  <SelectItem value="price_change">💰 Cambio de Precio</SelectItem>
                  <SelectItem value="cover_update">🎨 Actualización de Portada</SelectItem>
                  <SelectItem value="description_update">📝 Actualización de Descripción</SelectItem>
                  <SelectItem value="keywords_update">🔑 Actualización de Keywords</SelectItem>
                  <SelectItem value="other">📌 Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-date">Fecha del evento *</Label>
              <Input
                id="event-date"
                type="date"
                value={newEvent.eventDate}
                onChange={(e) => setNewEvent({ ...newEvent, eventDate: e.target.value })}
                data-testid="input-event-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-title">Título del evento *</Label>
              <Input
                id="event-title"
                placeholder="Ej: Campaña Amazon Ads - €50"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                data-testid="input-event-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-description">Descripción (opcional)</Label>
              <Textarea
                id="event-description"
                placeholder="Detalles adicionales sobre el evento..."
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                rows={3}
                data-testid="textarea-event-description"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEventDialogOpen(false)}
              data-testid="button-cancel-event"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateEvent}
              disabled={createEventMutation.isPending || !newEvent.title.trim()}
              data-testid="button-save-event"
            >
              {createEventMutation.isPending ? (
                <>Guardando...</>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Evento
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

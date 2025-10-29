import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, Minus, BookOpen, Package, HardDrive, DollarSign, X, Upload } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AuraImport } from "@/components/aura-import";

interface SalesMonthlyData {
  id: number;
  bookId: number | null;
  asin: string;
  penNameId: number;
  month: string;
  bookType: string;
  totalUnits: number;
  totalRoyalty: string;
  currency: string;
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
  bookType?: string;
}

interface PenName {
  id: number;
  name: string;
}

interface BookSalesTrend {
  asin: string;
  title: string;
  penName: string;
  bookType: string;
  currency: string;
  last6Months: { month: string; units: number; royalty: number }[];
  totalUnitsLast6: number;
  totalRoyaltyLast6: number;
  trend: number;
  recommendation: string;
}

const BOOK_TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  ebook: { label: "Ebook", icon: BookOpen, color: "text-blue-600 dark:text-blue-400" },
  paperback: { label: "Tapa blanda", icon: Package, color: "text-amber-600 dark:text-amber-400" },
  hardcover: { label: "Tapa dura", icon: HardDrive, color: "text-purple-600 dark:text-purple-400" },
  unknown: { label: "Desconocido", icon: BookOpen, color: "text-muted-foreground" },
};

export default function AuraSales() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const asinFromUrl = urlParams.get('asin');
  
  const [selectedPenName, setSelectedPenName] = useState<string>("all");
  const [selectedBookType, setSelectedBookType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(asinFromUrl || '');

  // Update search query when URL parameter changes
  useEffect(() => {
    if (asinFromUrl) {
      setSearchQuery(asinFromUrl);
    }
  }, [asinFromUrl]);

  const { data: salesData = [], isLoading: isLoadingSales } = useQuery<SalesMonthlyData[]>({
    queryKey: ["/api/aura/sales"],
  });

  const { data: books = [], isLoading: isLoadingBooks } = useQuery<AuraBook[]>({
    queryKey: ["/api/aura/books"],
  });

  const { data: penNames = [], isLoading: isLoadingPenNames } = useQuery<PenName[]>({
    queryKey: ["/api/aura/pen-names"],
  });

  const isLoading = isLoadingSales || isLoadingBooks || isLoadingPenNames;

  // Helper: Generar últimos 6 meses calendario en formato YYYY-MM
  const getLast6Months = () => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push(monthStr);
    }
    return months;
  };

  // Calcular tendencias por libro discriminando por tipo Y moneda
  const bookTrends = useMemo<BookSalesTrend[]>(() => {
    if (!salesData.length || !books.length || !penNames.length) return [];

    // Agrupar ventas por ASIN + bookType + currency (evitar mezclar monedas)
    const bookMap = new Map<string, SalesMonthlyData[]>();

    salesData.forEach((sale) => {
      const key = `${sale.asin}:${sale.bookType}:${sale.currency}`;
      if (!bookMap.has(key)) {
        bookMap.set(key, []);
      }
      bookMap.get(key)!.push(sale);
    });

    const trends: BookSalesTrend[] = [];
    const last6MonthsCalendar = getLast6Months();

    bookMap.forEach((records, key) => {
      const [asin, bookType, currency] = key.split(":");
      const book = books.find((b) => b.asin === asin);
      if (!book) return;

      const penName = penNames.find((p) => p.id === book.penNameId);
      if (!penName) return;

      // Crear mapa de registros por mes
      const recordsByMonth = new Map<string, SalesMonthlyData>();
      records.forEach(r => recordsByMonth.set(r.month, r));

      // Rellenar últimos 6 meses (con 0 si no hay datos)
      const last6Months = last6MonthsCalendar.map(month => {
        const record = recordsByMonth.get(month);
        return {
          month,
          units: record?.totalUnits || 0,
          royalty: record ? parseFloat(record.totalRoyalty) : 0,
        };
      });

      // Calcular totales
      const totalUnitsLast6 = last6Months.reduce((sum, r) => sum + r.units, 0);
      const totalRoyaltyLast6 = last6Months.reduce((sum, r) => sum + r.royalty, 0);

      // Calcular tendencia (comparar últimos 3 meses vs 3 anteriores)
      const last3 = last6Months.slice(3);
      const prev3 = last6Months.slice(0, 3);

      const unitsLast3 = last3.reduce((sum, r) => sum + r.units, 0);
      const unitsPrev3 = prev3.reduce((sum, r) => sum + r.units, 0);

      let trend = 0;
      if (unitsPrev3 > 0) {
        trend = ((unitsLast3 - unitsPrev3) / unitsPrev3) * 100;
        // Limitar tendencias extremas para evitar porcentajes irreales
        trend = Math.max(-999, Math.min(999, trend));
      } else if (unitsLast3 > 0) {
        // Si no había ventas antes pero ahora sí, mostrar +999% (indicador de crecimiento nuevo)
        trend = 999;
      }

      // Generar recomendación determinista
      let recommendation = "MANTENER";
      if (trend > 20 && totalUnitsLast6 > 50) {
        recommendation = bookType === 'ebook' ? "SUBIR PRECIO" : "AUMENTAR STOCK";
      } else if (trend < -20) {
        recommendation = "OPTIMIZAR METADATOS";
      } else if (totalUnitsLast6 < 20) {
        recommendation = "AUMENTAR PROMOCIÓN";
      }

      trends.push({
        asin,
        title: book.title,
        penName: penName.name,
        bookType,
        currency,
        last6Months,
        totalUnitsLast6,
        totalRoyaltyLast6,
        trend,
        recommendation,
      });
    });

    return trends.sort((a, b) => b.totalRoyaltyLast6 - a.totalRoyaltyLast6);
  }, [salesData, books, penNames]);

  // Filtrar por seudónimo, tipo de libro y búsqueda por ASIN
  const filteredTrends = useMemo(() => {
    return bookTrends.filter((trend) => {
      if (selectedPenName !== "all" && trend.penName !== selectedPenName) return false;
      if (selectedBookType !== "all" && trend.bookType !== selectedBookType) return false;
      if (searchQuery && !trend.asin.toLowerCase().includes(searchQuery.toLowerCase()) && 
          !trend.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [bookTrends, selectedPenName, selectedBookType, searchQuery]);

  // Estadísticas globales por tipo de libro Y moneda (evitar mezclar monedas)
  const statsByTypeCurrency = useMemo(() => {
    const stats: Record<string, { units: number; royalty: number; currency: string; bookType: string }> = {};

    salesData.forEach((sale) => {
      const type = sale.bookType || "unknown";
      const currency = sale.currency;
      const key = `${type}:${currency}`;
      
      if (!stats[key]) {
        stats[key] = { units: 0, royalty: 0, currency, bookType: type };
      }
      
      stats[key].units += sale.totalUnits;
      stats[key].royalty += parseFloat(sale.totalRoyalty);
    });

    return Object.entries(stats).map(([key, value]) => ({
      key,
      ...value
    })).sort((a, b) => b.royalty - a.royalty); // Ordenar por regalías descendente
  }, [salesData]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-aura-sales">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Aura Ventas</h1>
          <p className="text-muted-foreground mt-1">
            Análisis de ventas reales discriminadas por tipo de libro (ebook, tapa blanda, tapa dura)
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            ℹ️ Este análisis <strong>excluye promociones gratuitas</strong> y muestra solo ventas con regalías
          </p>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="default" className="gap-2" data-testid="button-import-sales">
              <Upload className="h-4 w-4" />
              Importar Datos
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Importar Datos de KDP</DialogTitle>
            </DialogHeader>
            <AuraImport />
          </DialogContent>
        </Dialog>
      </div>

      {/* Estadísticas por tipo de libro y moneda (segregadas) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {statsByTypeCurrency.map((stat) => {
          const config = BOOK_TYPE_LABELS[stat.bookType];
          const Icon = config.icon;
          return (
            <Card key={stat.key} data-testid={`card-stats-${stat.bookType}-${stat.currency}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {config.label}
                  <Badge variant="secondary" className="ml-2">{stat.currency}</Badge>
                </CardTitle>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid={`text-units-${stat.bookType}-${stat.currency}`}>
                  {stat.units.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">unidades vendidas</p>
                <div className="text-lg font-semibold text-green-600 dark:text-green-400 mt-2">
                  {stat.currency === 'USD' ? '$' : ''}{stat.royalty.toFixed(2)} {stat.currency}
                </div>
                <p className="text-xs text-muted-foreground">en regalías</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <Select value={selectedPenName} onValueChange={setSelectedPenName}>
            <SelectTrigger data-testid="select-pen-name">
              <SelectValue placeholder="Todos los seudónimos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los seudónimos</SelectItem>
              {penNames.map((pn) => (
                <SelectItem key={pn.id} value={pn.name}>
                  {pn.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <Select value={selectedBookType} onValueChange={setSelectedBookType}>
            <SelectTrigger data-testid="select-book-type">
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {Object.entries(BOOK_TYPE_LABELS).map(([type, config]) => (
                <SelectItem key={type} value={type}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista de libros con tendencias */}
      <div className="space-y-4">
        {filteredTrends.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No hay datos de ventas disponibles. Importa un archivo KDP para comenzar.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredTrends.map((trend) => {
            const config = BOOK_TYPE_LABELS[trend.bookType];
            const Icon = config.icon;
            return (
              <Card key={`${trend.asin}:${trend.bookType}:${trend.currency}`} data-testid={`card-book-${trend.asin}-${trend.bookType}-${trend.currency}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg" data-testid={`text-title-${trend.asin}`}>
                          {trend.title}
                        </CardTitle>
                        <Badge variant="outline" className="gap-1">
                          <Icon className={`h-3 w-3 ${config.color}`} />
                          {config.label}
                        </Badge>
                        <Badge variant="secondary">{trend.currency}</Badge>
                      </div>
                      <CardDescription className="mt-1">
                        {trend.penName} · ASIN: {trend.asin}
                      </CardDescription>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        {trend.trend > 5 ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : trend.trend < -5 ? (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        ) : (
                          <Minus className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span
                          className={`text-sm font-medium ${
                            trend.trend > 5
                              ? "text-green-600"
                              : trend.trend < -5
                              ? "text-red-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {trend.trend > 0 ? "+" : ""}
                          {trend.trend.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">tendencia 3 meses</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <Tabs defaultValue="evolution" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="evolution">Evolución</TabsTrigger>
                      <TabsTrigger value="metrics">Métricas</TabsTrigger>
                    </TabsList>

                    <TabsContent value="evolution" className="space-y-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={trend.last6Months}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis yAxisId="left" />
                          <YAxis yAxisId="right" orientation="right" />
                          <Tooltip />
                          <Legend />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="units"
                            stroke="#3b82f6"
                            name="Unidades"
                            strokeWidth={2}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="royalty"
                            stroke="#10b981"
                            name="Regalías"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </TabsContent>

                    <TabsContent value="metrics" className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Unidades (6 meses)</p>
                          <p className="text-2xl font-bold">{trend.totalUnitsLast6}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Regalías (6 meses)</p>
                          <p className="text-2xl font-bold text-green-600">
                            {trend.currency === 'USD' ? '$' : ''}{trend.totalRoyaltyLast6.toFixed(2)} {trend.currency}
                          </p>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <p className="text-sm font-medium text-muted-foreground">Recomendación</p>
                          <Badge
                            variant={
                              trend.recommendation.includes("SUBIR") || trend.recommendation.includes("AUMENTAR STOCK")
                                ? "default"
                                : trend.recommendation.includes("OPTIMIZAR")
                                ? "destructive"
                                : "secondary"
                            }
                            className="mt-1"
                          >
                            {trend.recommendation}
                          </Badge>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Users, BookOpen, TrendingUp, Zap, ArrowRight, DollarSign, BookMarked } from "lucide-react";
import { Link } from "wouter";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useMemo } from "react";

/**
 * Tasas de conversión a EUR (moneda base)
 */
const EXCHANGE_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 0.92,
  GBP: 1.17,
  CAD: 0.67,
  AUD: 0.60,
  BRL: 0.17,
  MXN: 0.052,
  JPY: 0.0062,
  INR: 0.011,
};

/**
 * Convierte una cantidad en cualquier moneda a EUR
 */
function convertToEUR(amount: number, currency: string): number {
  const rate = EXCHANGE_RATES[currency] || 1.0;
  return amount * rate;
}

interface PenName {
  id: number;
  name: string;
  description: string | null;
}

interface AuraBook {
  id: number;
  penNameId: number;
  asin: string;
  title: string;
  marketplaces: string[];
  bookType: string;
}

interface KenpMonthlyData {
  id: number;
  bookId: number | null;
  asin: string;
  penNameId: number;
  month: string;
  totalKenpPages: number;
  marketplaces: string[];
}

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
}

export default function AuraDashboard() {
  // Fetch data
  const { data: penNames, isLoading: loadingPenNames } = useQuery<PenName[]>({
    queryKey: ['/api/aura/pen-names'],
  });

  const { data: books, isLoading: loadingBooks } = useQuery<AuraBook[]>({
    queryKey: ['/api/aura/books'],
  });

  const { data: kenpData, isLoading: loadingKenp } = useQuery<KenpMonthlyData[]>({
    queryKey: ['/api/aura/kenp'],
  });

  const { data: salesData, isLoading: loadingSales } = useQuery<SalesMonthlyData[]>({
    queryKey: ['/api/aura/sales'],
  });

  const isLoading = loadingPenNames || loadingBooks || loadingKenp || loadingSales;

  // Consolidar seudónimos por nombre
  const consolidatedPenNames = useMemo(() => {
    if (!penNames) return [];
    const nameMap = new Map<string, PenName & { ids: number[] }>();
    penNames.forEach(penName => {
      const existing = nameMap.get(penName.name);
      if (existing) {
        existing.ids.push(penName.id);
      } else {
        nameMap.set(penName.name, { ...penName, ids: [penName.id] });
      }
    });
    return Array.from(nameMap.values());
  }, [penNames]);

  // Deduplicar libros por ASIN
  const uniqueBooks = useMemo(() => {
    if (!books) return [];
    const bookMap = new Map<string, AuraBook>();
    books.forEach(book => {
      if (!bookMap.has(book.asin)) {
        bookMap.set(book.asin, book);
      }
    });
    return Array.from(bookMap.values());
  }, [books]);

  // Estadísticas generales
  const totalPenNames = consolidatedPenNames.length;
  const totalBooks = uniqueBooks.length;
  const totalKenpPages = kenpData?.reduce((sum, k) => sum + k.totalKenpPages, 0) || 0;
  const totalUnits = salesData?.reduce((sum, s) => sum + s.totalUnits, 0) || 0;

  // Calcular ingresos totales en EUR
  const totalRoyaltyEUR = useMemo(() => {
    if (!salesData) return 0;
    return salesData.reduce((sum, s) => {
      const royalty = parseFloat(s.totalRoyalty);
      return sum + convertToEUR(royalty, s.currency);
    }, 0);
  }, [salesData]);

  // Tendencia mensual de KENP
  const kenpByMonth = useMemo(() => {
    if (!kenpData) return [];
    const monthMap = new Map<string, number>();
    kenpData.forEach(k => {
      monthMap.set(k.month, (monthMap.get(k.month) || 0) + k.totalKenpPages);
    });
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, pages]) => ({
        month: new Date(month + '-01').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        pages,
      }));
  }, [kenpData]);

  // Tendencia mensual de ventas (unidades)
  const unitsByMonth = useMemo(() => {
    if (!salesData) return [];
    const monthMap = new Map<string, number>();
    salesData.forEach(s => {
      monthMap.set(s.month, (monthMap.get(s.month) || 0) + s.totalUnits);
    });
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, units]) => ({
        month: new Date(month + '-01').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        units,
      }));
  }, [salesData]);

  // Tendencia mensual de ingresos
  const royaltyByMonth = useMemo(() => {
    if (!salesData) return [];
    const monthMap = new Map<string, number>();
    salesData.forEach(s => {
      const royalty = parseFloat(s.totalRoyalty);
      const royaltyEUR = convertToEUR(royalty, s.currency);
      monthMap.set(s.month, (monthMap.get(s.month) || 0) + royaltyEUR);
    });
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, royalty]) => ({
        month: new Date(month + '-01').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        royalty: Math.round(royalty * 100) / 100,
      }));
  }, [salesData]);

  // Ventas por tipo de libro
  const salesByBookType = useMemo(() => {
    if (!salesData) return [];
    const typeMap = new Map<string, { units: number; royalty: number }>();
    salesData.forEach(s => {
      const existing = typeMap.get(s.bookType) || { units: 0, royalty: 0 };
      const royalty = parseFloat(s.totalRoyalty);
      const royaltyEUR = convertToEUR(royalty, s.currency);
      typeMap.set(s.bookType, {
        units: existing.units + s.totalUnits,
        royalty: existing.royalty + royaltyEUR,
      });
    });

    const typeLabels: Record<string, string> = {
      ebook: 'eBook',
      paperback: 'Tapa blanda',
      hardcover: 'Tapa dura',
      unknown: 'Desconocido',
    };

    return Array.from(typeMap.entries())
      .map(([type, data]) => ({
        type: typeLabels[type] || type,
        units: data.units,
        royalty: Math.round(data.royalty * 100) / 100,
      }))
      .sort((a, b) => b.royalty - a.royalty);
  }, [salesData]);

  // Top 5 libros por KENP
  const topKenpBooks = useMemo(() => {
    if (!kenpData || !books) return [];
    const bookMap = new Map<string, number>();
    kenpData.forEach(k => {
      bookMap.set(k.asin, (bookMap.get(k.asin) || 0) + k.totalKenpPages);
    });
    
    return Array.from(bookMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([asin, pages]) => ({
        asin,
        title: books.find(b => b.asin === asin)?.title || asin,
        pages,
      }));
  }, [kenpData, books]);

  // Top 5 libros por ventas
  const topSalesBooks = useMemo(() => {
    if (!salesData || !books) return [];
    const bookMap = new Map<string, { units: number; royalty: number }>();
    salesData.forEach(s => {
      const existing = bookMap.get(s.asin) || { units: 0, royalty: 0 };
      const royalty = parseFloat(s.totalRoyalty);
      const royaltyEUR = convertToEUR(royalty, s.currency);
      bookMap.set(s.asin, {
        units: existing.units + s.totalUnits,
        royalty: existing.royalty + royaltyEUR,
      });
    });
    
    return Array.from(bookMap.entries())
      .sort((a, b) => b[1].royalty - a[1].royalty)
      .slice(0, 5)
      .map(([asin, data]) => ({
        asin,
        title: books.find(b => b.asin === asin)?.title || asin,
        units: data.units,
        royalty: Math.round(data.royalty * 100) / 100,
      }));
  }, [salesData, books]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Vista general de tus ventas y análisis KDP
        </p>
      </div>

      {/* Tarjetas de estadísticas principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Seudónimos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-total-pen-names">
                {totalPenNames}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Autores únicos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Libros Publicados
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-total-books">
                {totalBooks}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Títulos únicos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Páginas KENP
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-total-kenp">
                {totalKenpPages.toLocaleString()}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Kindle Unlimited
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ingresos Totales
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-total-royalty">
                {totalRoyaltyEUR.toFixed(2)}€
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {totalUnits} unidades vendidas
            </p>
          </CardContent>
        </Card>
      </div>

      {totalPenNames === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Bienvenido a Aura</CardTitle>
            <CardDescription>
              Comienza importando tus datos de ventas de KDP para ver análisis detallados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Ve a "Importar" en el menú lateral para subir tus archivos XLSX:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-4">
              <li><strong>Aura Unlimited:</strong> Importa tu reporte mensual de páginas KENP leídas</li>
              <li><strong>Aura Ventas:</strong> Importa tu reporte de ventas y regalías</li>
            </ul>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tarjeta promocional de Aura Unlimited */}
          <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-primary/20">
            <CardContent className="py-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Aura Unlimited - Análisis KENP</h3>
                    <p className="text-sm text-muted-foreground">
                      Analiza la evolución mensual de tus páginas KENP y descubre qué libros tienen mejor rendimiento.
                    </p>
                  </div>
                </div>
                <Link href="/aura/unlimited">
                  <Button variant="default" data-testid="button-go-unlimited">
                    Ver Análisis
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Gráficas principales */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Tendencia de ingresos mensuales */}
            <Card>
              <CardHeader>
                <CardTitle>Ingresos Mensuales</CardTitle>
                <CardDescription>Evolución de regalías en EUR</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : royaltyByMonth.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={royaltyByMonth}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`${value.toFixed(2)}€`, 'Regalías']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="royalty" 
                        stroke="hsl(var(--primary))" 
                        fill="hsl(var(--primary))"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No hay datos de ventas
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tendencia de páginas KENP */}
            <Card>
              <CardHeader>
                <CardTitle>Páginas KENP Mensuales</CardTitle>
                <CardDescription>Tendencia de lecturas Kindle Unlimited</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : kenpByMonth.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={kenpByMonth}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`${value.toLocaleString()} pág`, 'KENP']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="pages" 
                        stroke="hsl(var(--chart-2))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--chart-2))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No hay datos de KENP
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ventas por tipo de libro */}
            <Card>
              <CardHeader>
                <CardTitle>Ventas por Formato</CardTitle>
                <CardDescription>Distribución de ingresos por tipo de libro</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : salesByBookType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salesByBookType}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="type" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === 'royalty') return [`${value.toFixed(2)}€`, 'Regalías'];
                          return [`${value} uds`, 'Unidades'];
                        }}
                      />
                      <Bar 
                        dataKey="royalty" 
                        fill="hsl(var(--chart-3))" 
                        radius={[4, 4, 0, 0]}
                        name="royalty"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No hay datos de ventas por tipo
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tendencia de unidades vendidas */}
            <Card>
              <CardHeader>
                <CardTitle>Unidades Vendidas Mensuales</CardTitle>
                <CardDescription>Evolución de ventas por mes</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : unitsByMonth.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={unitsByMonth}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`${value} uds`, 'Unidades']}
                      />
                      <Bar 
                        dataKey="units" 
                        fill="hsl(var(--chart-4))" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No hay datos de unidades vendidas
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Listas de Top libros */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top libros por KENP */}
            <Card>
              <CardHeader>
                <CardTitle>Top 5 Libros - KENP</CardTitle>
                <CardDescription>Libros más leídos en Kindle Unlimited</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : topKenpBooks.length > 0 ? (
                  <div className="space-y-3">
                    {topKenpBooks.map((book, i) => (
                      <div key={book.asin} className="flex items-start gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{book.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {book.pages.toLocaleString()} páginas leídas
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay datos de KENP disponibles
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Top libros por ventas */}
            <Card>
              <CardHeader>
                <CardTitle>Top 5 Libros - Ventas</CardTitle>
                <CardDescription>Libros con mayores ingresos</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : topSalesBooks.length > 0 ? (
                  <div className="space-y-3">
                    {topSalesBooks.map((book, i) => (
                      <div key={book.asin} className="flex items-start gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chart-3/10 text-xs font-medium text-chart-3">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{book.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {book.royalty.toFixed(2)}€ • {book.units} unidades
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay datos de ventas disponibles
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

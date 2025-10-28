import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Users, BookOpen, TrendingUp } from "lucide-react";
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
}

interface KdpSale {
  id: number;
  bookId: number;
  penNameId: number;
  saleDate: string;
  marketplace: string;
  transactionType: string;
  royalty: string;
  currency: string;
  unitsOrPages: number;
}

export default function AuraDashboard() {
  // Fetch data
  const { data: penNames, isLoading: loadingPenNames } = useQuery<PenName[]>({
    queryKey: ['/api/aura/pen-names'],
  });

  const { data: books, isLoading: loadingBooks } = useQuery<AuraBook[]>({
    queryKey: ['/api/aura/books'],
  });

  const { data: sales, isLoading: loadingSales } = useQuery<KdpSale[]>({
    queryKey: ['/api/aura/sales'],
  });

  // Calculate stats
  const totalPenNames = penNames?.length || 0;
  const totalBooks = books?.length || 0;
  // Contar solo ventas reales, no KENP ni Free
  const totalSales = sales?.filter(s => s.transactionType === 'Sale').length || 0;
  const totalKenpPages = sales
    ?.filter(s => s.transactionType === 'KENP Read')
    .reduce((sum, s) => sum + s.unitsOrPages, 0) || 0;

  const isLoading = loadingPenNames || loadingBooks || loadingSales;

  // Prepare chart data
  const royaltyByDate = useMemo(() => {
    if (!sales) return [];
    
    // Filter last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dateMap = new Map<string, number>();
    sales
      .filter(sale => new Date(sale.saleDate) >= thirtyDaysAgo)
      .forEach(sale => {
        const dateKey = new Date(sale.saleDate).toISOString().split('T')[0]; // YYYY-MM-DD
        const royalty = parseFloat(sale.royalty);
        // Convertir a EUR antes de sumar
        const royaltyEUR = convertToEUR(royalty, sale.currency);
        dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + royaltyEUR);
      });

    // Sort by date ascending
    return Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateKey, royalty]) => ({ 
        date: new Date(dateKey).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
        royalty: Math.round(royalty * 100) / 100 // Redondear a 2 decimales
      }));
  }, [sales]);

  const salesByMarketplace = useMemo(() => {
    if (!sales) return [];
    
    const marketMap = new Map<string, number>();
    sales.forEach(sale => {
      const royalty = parseFloat(sale.royalty);
      // Convertir a EUR antes de sumar
      const royaltyEUR = convertToEUR(royalty, sale.currency);
      marketMap.set(sale.marketplace, (marketMap.get(sale.marketplace) || 0) + royaltyEUR);
    });

    return Array.from(marketMap.entries())
      .map(([marketplace, royalty]) => ({ 
        marketplace: marketplace.replace('amazon.com.', '').replace('amazon.', '').toUpperCase(), 
        royalty: Math.round(royalty * 100) / 100 // Redondear a 2 decimales
      }))
      .sort((a, b) => b.royalty - a.royalty);
  }, [sales]);

  const royaltyByPenName = useMemo(() => {
    if (!sales || !penNames) return [];
    
    const penNameMap = new Map<number, number>();
    sales.forEach(sale => {
      const royalty = parseFloat(sale.royalty);
      // Convertir a EUR antes de sumar
      const royaltyEUR = convertToEUR(royalty, sale.currency);
      penNameMap.set(sale.penNameId, (penNameMap.get(sale.penNameId) || 0) + royaltyEUR);
    });

    return Array.from(penNameMap.entries())
      .map(([penNameId, royalty]) => ({
        name: penNames.find(p => p.id === penNameId)?.name || 'Desconocido',
        royalty
      }))
      .sort((a, b) => b.royalty - a.royalty);
  }, [sales, penNames]);

  const kenpByDate = useMemo(() => {
    if (!sales) return [];
    
    // Filter last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dateMap = new Map<string, number>();
    sales
      .filter(s => s.transactionType === 'KENP Read' && new Date(s.saleDate) >= thirtyDaysAgo)
      .forEach(sale => {
        const dateKey = new Date(sale.saleDate).toISOString().split('T')[0]; // YYYY-MM-DD
        dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + sale.unitsOrPages);
      });

    // Sort by date ascending
    return Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateKey, pages]) => ({ 
        date: new Date(dateKey).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
        pages 
      }));
  }, [sales]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Vista general de tus ventas y análisis KDP
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Seudónimos
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
              Autores registrados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Libros
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
              Títulos publicados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ventas Totales
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-total-sales">
                {totalSales}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Ventas completadas
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
              Lecturas Kindle Unlimited
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
          <CardContent>
            <p className="text-muted-foreground">
              Ve a "Importar" en el menú lateral para subir tu archivo XLSX de KDP Dashboard.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts Section */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Royalty by Date */}
            <Card>
              <CardHeader>
                <CardTitle>Ingresos por Fecha</CardTitle>
                <CardDescription>Evolución de regalías en EUR (últimos 30 días)</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : royaltyByDate.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={royaltyByDate}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
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

            {/* KENP Pages by Date */}
            <Card>
              <CardHeader>
                <CardTitle>Páginas KENP Leídas</CardTitle>
                <CardDescription>Tendencia de lecturas KU (últimos 30 días)</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : kenpByDate.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={kenpByDate}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
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

            {/* Sales by Marketplace */}
            <Card>
              <CardHeader>
                <CardTitle>Ingresos por Marketplace</CardTitle>
                <CardDescription>Distribución de regalías en EUR por país</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : salesByMarketplace.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salesByMarketplace}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="marketplace" 
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
                      <Bar 
                        dataKey="royalty" 
                        fill="hsl(var(--chart-3))" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No hay datos de ventas
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Royalty by Pen Name */}
            <Card>
              <CardHeader>
                <CardTitle>Ingresos por Seudónimo</CardTitle>
                <CardDescription>Regalías en EUR por autor</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : royaltyByPenName.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={royaltyByPenName} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        type="number"
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        type="category"
                        dataKey="name" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        width={100}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`${value.toFixed(2)}€`, 'Regalías']}
                      />
                      <Bar 
                        dataKey="royalty" 
                        fill="hsl(var(--chart-4))" 
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No hay datos de ventas
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Lists Section */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Seudónimos Activos</CardTitle>
                <CardDescription>Tus identidades de autor</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {penNames?.slice(0, 5).map((penName) => (
                      <div key={penName.id} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{penName.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {books?.filter(b => b.penNameId === penName.id).length || 0} libros
                        </span>
                      </div>
                    ))}
                    {(penNames?.length || 0) > 5 && (
                      <p className="text-xs text-muted-foreground">
                        ... y {(penNames?.length || 0) - 5} más
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actividad Reciente</CardTitle>
                <CardDescription>Últimas transacciones</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sales?.slice(-5).reverse().map((sale, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground truncate max-w-[200px]">
                          {books?.find(b => b.id === sale.bookId)?.title || 'Libro desconocido'}
                        </span>
                        <span className="text-xs font-medium">
                          {sale.transactionType === 'KENP Read' ? `${sale.unitsOrPages} pág` : sale.transactionType}
                        </span>
                      </div>
                    ))}
                    {!sales || sales.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No hay transacciones registradas
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

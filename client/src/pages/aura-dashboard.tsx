import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Users, BookOpen, TrendingUp } from "lucide-react";

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
  const totalSales = sales?.length || 0;
  const totalKenpPages = sales
    ?.filter(s => s.transactionType === 'KENP Read')
    .reduce((sum, s) => sum + s.unitsOrPages, 0) || 0;

  const isLoading = loadingPenNames || loadingBooks || loadingSales;

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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
              Todas las transacciones
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
      )}
    </div>
  );
}

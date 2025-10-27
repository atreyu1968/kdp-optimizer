import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Search, Filter } from "lucide-react";

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

const ITEMS_PER_PAGE = 20;

const TRANSACTION_TYPES = [
  'Sale',
  'Free promo',
  'Refund',
  'Borrow',
  'KENP Read',
] as const;

export default function AuraSales() {
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

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPenName, setSelectedPenName] = useState<string>('all');
  const [selectedBook, setSelectedBook] = useState<string>('all');
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('all');
  const [selectedTransactionType, setSelectedTransactionType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);

  const isLoading = loadingPenNames || loadingBooks || loadingSales;

  // Get unique marketplaces
  const marketplaces = useMemo(() => {
    if (!sales) return [];
    return Array.from(new Set(sales.map(s => s.marketplace))).sort();
  }, [sales]);

  // Filter books by selected pen name
  const filteredBooksByPenName = useMemo(() => {
    if (!books || selectedPenName === 'all') return books || [];
    return books.filter(b => b.penNameId === parseInt(selectedPenName));
  }, [books, selectedPenName]);

  // Apply filters
  const filteredSales = useMemo(() => {
    if (!sales) return [];

    let result = sales;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(sale => {
        const book = books?.find(b => b.id === sale.bookId);
        return (
          book?.title.toLowerCase().includes(query) ||
          book?.asin.toLowerCase().includes(query)
        );
      });
    }

    // Pen name filter
    if (selectedPenName !== 'all') {
      result = result.filter(s => s.penNameId === parseInt(selectedPenName));
    }

    // Book filter
    if (selectedBook !== 'all') {
      result = result.filter(s => s.bookId === parseInt(selectedBook));
    }

    // Marketplace filter
    if (selectedMarketplace !== 'all') {
      result = result.filter(s => s.marketplace === selectedMarketplace);
    }

    // Transaction type filter
    if (selectedTransactionType !== 'all') {
      result = result.filter(s => s.transactionType === selectedTransactionType);
    }

    // Date range filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      result = result.filter(s => new Date(s.saleDate) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter(s => new Date(s.saleDate) <= toDate);
    }

    // Sort by date descending (newest first)
    return result.sort((a, b) => 
      new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()
    );
  }, [sales, books, searchQuery, selectedPenName, selectedBook, selectedMarketplace, selectedTransactionType, dateFrom, dateTo]);

  // Pagination
  const totalPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE);
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSales.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSales, currentPage]);

  // Reset to page 1 when filters change and current page exceeds total pages
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }

  // Calculate totals
  const totalRoyalty = filteredSales.reduce((sum, s) => sum + parseFloat(s.royalty), 0);
  const totalTransactions = filteredSales.length;

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedPenName('all');
    setSelectedBook('all');
    setSelectedMarketplace('all');
    setSelectedTransactionType('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'Sale':
        return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'Borrow':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 'KENP Read':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
      case 'Free promo':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400';
      case 'Refund':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Ventas y Transacciones</h2>
        <p className="text-muted-foreground">
          Historial completo de ventas, préstamos y lecturas KENP
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transacciones</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-filtered-transactions">
                {totalTransactions.toLocaleString()}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {filteredSales.length !== (sales?.length || 0) && `De ${sales?.length || 0} totales`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Regalías Totales</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-filtered-royalty">
                ${totalRoyalty.toFixed(2)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Con filtros aplicados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>Filtra las transacciones por diferentes criterios</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Título o ASIN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-sales"
                />
              </div>
            </div>

            {/* Pen Name Filter */}
            <div className="space-y-2">
              <Label htmlFor="pen-name-filter">Seudónimo</Label>
              <Select
                value={selectedPenName}
                onValueChange={(value) => {
                  setSelectedPenName(value);
                  setSelectedBook('all');
                }}
              >
                <SelectTrigger id="pen-name-filter" data-testid="select-pen-name-filter">
                  <SelectValue placeholder="Todos los seudónimos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los seudónimos</SelectItem>
                  {penNames?.map((pn) => (
                    <SelectItem key={pn.id} value={pn.id.toString()}>
                      {pn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Book Filter */}
            <div className="space-y-2">
              <Label htmlFor="book-filter">Libro</Label>
              <Select
                value={selectedBook}
                onValueChange={setSelectedBook}
                disabled={selectedPenName === 'all'}
              >
                <SelectTrigger id="book-filter" data-testid="select-book-filter">
                  <SelectValue placeholder="Todos los libros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los libros</SelectItem>
                  {filteredBooksByPenName?.map((book) => (
                    <SelectItem key={book.id} value={book.id.toString()}>
                      {book.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Marketplace Filter */}
            <div className="space-y-2">
              <Label htmlFor="marketplace-filter">Marketplace</Label>
              <Select
                value={selectedMarketplace}
                onValueChange={setSelectedMarketplace}
              >
                <SelectTrigger id="marketplace-filter" data-testid="select-marketplace-filter">
                  <SelectValue placeholder="Todos los marketplaces" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los marketplaces</SelectItem>
                  {marketplaces.map((mp) => (
                    <SelectItem key={mp} value={mp}>
                      {mp.replace('Amazon.com.', '').toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Transaction Type Filter */}
            <div className="space-y-2">
              <Label htmlFor="transaction-type-filter">Tipo de Transacción</Label>
              <Select
                value={selectedTransactionType}
                onValueChange={setSelectedTransactionType}
              >
                <SelectTrigger id="transaction-type-filter" data-testid="select-transaction-type-filter">
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {TRANSACTION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From Filter */}
            <div className="space-y-2">
              <Label htmlFor="date-from">Desde</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>

            {/* Date To Filter */}
            <div className="space-y-2">
              <Label htmlFor="date-to">Hasta</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>

            {/* Clear Filters Button */}
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="w-full"
                data-testid="button-clear-filters"
              >
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transacciones</CardTitle>
          <CardDescription>
            Mostrando {paginatedSales.length} de {filteredSales.length} transacciones
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No se encontraron transacciones con los filtros seleccionados
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Libro</TableHead>
                      <TableHead>Seudónimo</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Unidades/Pág</TableHead>
                      <TableHead className="text-right">Regalías</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSales.map((sale) => {
                      const book = books?.find(b => b.id === sale.bookId);
                      const penName = penNames?.find(p => p.id === sale.penNameId);
                      
                      return (
                        <TableRow key={sale.id} data-testid={`row-sale-${sale.id}`}>
                          <TableCell className="font-medium">
                            {new Date(sale.saleDate).toLocaleDateString('es-ES')}
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[200px]">
                              <div className="font-medium truncate" title={book?.title}>
                                {book?.title || 'Desconocido'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {book?.asin}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{penName?.name || 'Desconocido'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {sale.marketplace.replace('Amazon.com.', '').toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="secondary"
                              className={getTransactionTypeColor(sale.transactionType)}
                            >
                              {sale.transactionType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {sale.unitsOrPages.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {sale.currency} {parseFloat(sale.royalty).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

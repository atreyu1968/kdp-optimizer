import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { SchedulePublicationsDialog } from "@/components/schedule-publications-dialog";
import { MarkPublishedDialog } from "@/components/mark-published-dialog";
import { ReschedulePublicationDialog } from "@/components/reschedule-publication-dialog";
import { DeletePublicationDialog } from "@/components/delete-publication-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Calendar as CalendarIcon,
  CheckCircle2, 
  Clock, 
  AlertCircle,
  BookOpen,
  TrendingUp,
  Loader2,
  ExternalLink,
  MoreVertical,
  Edit,
  Trash2,
  Search,
  X,
  Filter,
} from "lucide-react";
import { amazonMarkets, type Manuscript, type Publication, type AmazonMarket } from "@shared/schema";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface PublicationStats {
  total: number;
  published: number;
  scheduled: number;
  pending: number;
  byMarket: Record<string, {
    total: number;
    published: number;
    scheduled: number;
    pending: number;
  }>;
}

interface ScheduleDialogState {
  open: boolean;
  manuscriptId: number | null;
  manuscriptTitle: string;
  pendingMarkets: string[];
}

interface MarkPublishedDialogState {
  open: boolean;
  publication: Publication | null;
  manuscriptTitle: string;
}

interface RescheduleDialogState {
  open: boolean;
  publication: Publication | null;
  manuscriptTitle: string;
}

interface DeleteDialogState {
  open: boolean;
  publication: Publication | null;
  manuscriptTitle: string;
}

type StatusFilter = "all" | "published" | "scheduled" | "unpublished";

export default function Publications() {
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [marketFilter, setMarketFilter] = useState<string>("all");

  const [scheduleDialog, setScheduleDialog] = useState<ScheduleDialogState>({
    open: false,
    manuscriptId: null,
    manuscriptTitle: "",
    pendingMarkets: [],
  });

  const [markPublishedDialog, setMarkPublishedDialog] = useState<MarkPublishedDialogState>({
    open: false,
    publication: null,
    manuscriptTitle: "",
  });

  const [rescheduleDialog, setRescheduleDialog] = useState<RescheduleDialogState>({
    open: false,
    publication: null,
    manuscriptTitle: "",
  });

  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    publication: null,
    manuscriptTitle: "",
  });

  // Fetch manuscripts
  const { data: manuscripts = [], isLoading: manuscriptsLoading } = useQuery<Manuscript[]>({
    queryKey: ["/api/manuscripts"],
  });

  // Fetch all publications
  const { data: allPublications = [], isLoading: publicationsLoading } = useQuery<Publication[]>({
    queryKey: ["/api/publications"],
  });

  // Fetch stats
  const { data: stats } = useQuery<PublicationStats>({
    queryKey: ["/api/publications/stats"],
  });

  const getPublicationsForManuscript = (manuscriptId: number) => {
    return allPublications.filter(p => p.manuscriptId === manuscriptId);
  };

  // Filter manuscripts based on search and filters
  const filteredManuscripts = manuscripts.filter(manuscript => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        manuscript.originalTitle.toLowerCase().includes(query) ||
        (manuscript.author ?? "").toLowerCase().includes(query) ||
        (manuscript.genre ?? "").toLowerCase().includes(query);
      
      if (!matchesSearch) return false;
    }

    const publications = getPublicationsForManuscript(manuscript.id);
    
    // Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "published") {
        const hasPublished = publications.some(p => p.status === "published");
        if (!hasPublished) return false;
      } else if (statusFilter === "scheduled") {
        const hasScheduled = publications.some(p => p.status === "scheduled");
        if (!hasScheduled) return false;
      } else if (statusFilter === "unpublished") {
        // Has publications but none are published
        const allMarkets = Object.keys(amazonMarkets);
        const hasAnyUnpublished = allMarkets.some(market => {
          const pub = publications.find(p => p.market === market);
          return !pub || pub.status !== "published";
        });
        if (!hasAnyUnpublished) return false;
      }
    }

    // Market filter
    if (marketFilter !== "all") {
      const hasMarket = publications.some(p => p.market === marketFilter);
      if (!hasMarket) return false;
    }

    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Publicado</Badge>;
      case "scheduled":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Programado</Badge>;
      case "pending":
        return <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" />Pendiente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd MMM yyyy", { locale: es });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-2">
            <CalendarIcon className="h-8 w-8 text-primary" />
            Gestión de Publicaciones KDP
          </h1>
          <p className="text-muted-foreground">
            Administra tus publicaciones en Amazon KDP con límite de 3 por día
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título, autor o género..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10"
                  data-testid="input-search-manuscripts"
                />
                {searchQuery && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery("")}
                    data-testid="button-clear-search"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Estado:</span>
                </div>
                
                <Button
                  size="sm"
                  variant={statusFilter === "all" ? "default" : "outline"}
                  onClick={() => setStatusFilter("all")}
                  className="h-8"
                  data-testid="filter-status-all"
                >
                  Todos
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "published" ? "default" : "outline"}
                  onClick={() => setStatusFilter("published")}
                  className="h-8 gap-1"
                  data-testid="filter-status-published"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Publicados
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "scheduled" ? "default" : "outline"}
                  onClick={() => setStatusFilter("scheduled")}
                  className="h-8 gap-1"
                  data-testid="filter-status-scheduled"
                >
                  <Clock className="h-3 w-3" />
                  Programados
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "unpublished" ? "default" : "outline"}
                  onClick={() => setStatusFilter("unpublished")}
                  className="h-8 gap-1"
                  data-testid="filter-status-unpublished"
                >
                  <AlertCircle className="h-3 w-3" />
                  Sin publicar
                </Button>

                <div className="h-4 w-px bg-border mx-2" />

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Mercado:</span>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-2"
                      data-testid="dropdown-market-filter"
                    >
                      {marketFilter === "all" 
                        ? "Todos los mercados" 
                        : amazonMarkets[marketFilter as AmazonMarket]?.name || marketFilter}
                      <Filter className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
                    <DropdownMenuItem
                      onClick={() => setMarketFilter("all")}
                      data-testid="filter-market-all"
                    >
                      Todos los mercados
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {Object.entries(amazonMarkets).map(([key, market]) => (
                      <DropdownMenuItem
                        key={key}
                        onClick={() => setMarketFilter(key)}
                        data-testid={`filter-market-${key}`}
                      >
                        <span className="mr-2">{market.flag}</span>
                        {market.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {(searchQuery || statusFilter !== "all" || marketFilter !== "all") && (
                  <>
                    <div className="h-4 w-px bg-border mx-2" />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSearchQuery("");
                        setStatusFilter("all");
                        setMarketFilter("all");
                      }}
                      className="h-8 gap-1"
                      data-testid="button-clear-all-filters"
                    >
                      <X className="h-3 w-3" />
                      Limpiar filtros
                    </Button>
                  </>
                )}
              </div>

              {/* Results Counter */}
              {(searchQuery || statusFilter !== "all" || marketFilter !== "all") && (
                <div className="text-sm text-muted-foreground" data-testid="text-results-count">
                  {filteredManuscripts.length === 0 ? (
                    "No se encontraron manuscritos con estos filtros"
                  ) : filteredManuscripts.length === 1 ? (
                    "1 manuscrito encontrado"
                  ) : (
                    `${filteredManuscripts.length} manuscritos encontrados`
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total de Publicaciones</CardDescription>
                <CardTitle className="text-3xl">{stats.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Publicados
                </CardDescription>
                <CardTitle className="text-3xl text-green-600">{stats.published}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-blue-600" />
                  Programados
                </CardDescription>
                <CardTitle className="text-3xl text-blue-600">{stats.scheduled}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  Pendientes
                </CardDescription>
                <CardTitle className="text-3xl text-orange-600">{stats.pending}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        <Tabs defaultValue="manuscripts" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3 mb-6">
            <TabsTrigger value="manuscripts" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Por Manuscrito
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              Calendario
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Estadísticas
            </TabsTrigger>
          </TabsList>

          {/* Tab: Manuscripts */}
          <TabsContent value="manuscripts" className="space-y-4">
            {manuscriptsLoading || publicationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : manuscripts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    No hay manuscritos aún. Sube tu primer manuscrito para empezar.
                  </p>
                </CardContent>
              </Card>
            ) : filteredManuscripts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    No se encontraron manuscritos que coincidan con los filtros seleccionados.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                      setMarketFilter("all");
                    }}
                    className="mt-4"
                    data-testid="button-clear-filters-empty"
                  >
                    Limpiar filtros
                  </Button>
                </CardContent>
              </Card>
            ) : (
              filteredManuscripts.map((manuscript) => {
                const publications = getPublicationsForManuscript(manuscript.id);
                const publishedCount = publications.filter(p => p.status === "published").length;
                const scheduledCount = publications.filter(p => p.status === "scheduled").length;
                const pendingCount = Object.keys(amazonMarkets).length - publications.length;

                return (
                  <Card key={manuscript.id} className="overflow-hidden">
                    <CardHeader className="bg-muted/50">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-xl">{manuscript.originalTitle}</CardTitle>
                          <CardDescription className="flex items-center gap-3">
                            <span>{manuscript.author}</span>
                            <span>•</span>
                            <span>{manuscript.genre}</span>
                            <span>•</span>
                            <span>{manuscript.wordCount.toLocaleString()} palabras</span>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {publishedCount} publicados
                          </Badge>
                          {scheduledCount > 0 && (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />
                              {scheduledCount} programados
                            </Badge>
                          )}
                          {pendingCount > 0 && (
                            <Badge variant="outline" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {pendingCount} pendientes
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      {/* Market Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {Object.entries(amazonMarkets).map(([marketKey, marketInfo]) => {
                          const publication = publications.find(p => p.market === marketKey);
                          
                          return (
                            <div
                              key={marketKey}
                              className="group flex flex-col gap-2 p-3 rounded-lg border border-border bg-card hover-elevate"
                              data-testid={`market-${marketKey}-${manuscript.id}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-2xl flex-shrink-0">{marketInfo.flag}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {marketInfo.name.split('(')[1]?.replace(')', '') || marketInfo.name}
                                    </p>
                                    {publication && (
                                      <p className="text-xs text-muted-foreground">
                                        {publication.status === "published" && publication.publishedDate
                                          ? `Publicado ${formatDate(publication.publishedDate)}`
                                          : publication.status === "scheduled" && publication.scheduledDate
                                          ? `Prog. ${formatDate(publication.scheduledDate)}`
                                          : "Pendiente"}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {publication ? getStatusBadge(publication.status) : (
                                    <Badge variant="outline" className="gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      Sin programar
                                    </Badge>
                                  )}
                                  
                                  {/* Actions Menu */}
                                  {publication && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7"
                                          data-testid={`button-menu-${marketKey}-${manuscript.id}`}
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        {publication.status === "scheduled" && (
                                          <>
                                            <DropdownMenuItem
                                              onClick={() => {
                                                setMarkPublishedDialog({
                                                  open: true,
                                                  publication,
                                                  manuscriptTitle: manuscript.originalTitle,
                                                });
                                              }}
                                              data-testid={`menu-mark-published-${marketKey}-${manuscript.id}`}
                                            >
                                              <CheckCircle2 className="h-4 w-4 mr-2" />
                                              Marcar como publicado
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onClick={() => {
                                                setRescheduleDialog({
                                                  open: true,
                                                  publication,
                                                  manuscriptTitle: manuscript.originalTitle,
                                                });
                                              }}
                                              data-testid={`menu-reschedule-${marketKey}-${manuscript.id}`}
                                            >
                                              <Edit className="h-4 w-4 mr-2" />
                                              Reprogramar fecha
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                          </>
                                        )}
                                        {publication.status === "published" && publication.kdpUrl && (
                                          <>
                                            <DropdownMenuItem asChild>
                                              <a
                                                href={publication.kdpUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                data-testid={`menu-view-kdp-${marketKey}-${manuscript.id}`}
                                              >
                                                <ExternalLink className="h-4 w-4 mr-2" />
                                                Ver en KDP
                                              </a>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                          </>
                                        )}
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => {
                                            setDeleteDialog({
                                              open: true,
                                              publication,
                                              manuscriptTitle: manuscript.originalTitle,
                                            });
                                          }}
                                          data-testid={`menu-delete-${marketKey}-${manuscript.id}`}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Eliminar publicación
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex items-center gap-2">
                        {pendingCount > 0 && (
                          <Button 
                            size="sm" 
                            variant="default" 
                            data-testid={`button-schedule-${manuscript.id}`}
                            onClick={() => {
                              const pendingMarkets = Object.keys(amazonMarkets).filter(
                                market => !publications.find(p => p.market === market)
                              );
                              setScheduleDialog({
                                open: true,
                                manuscriptId: manuscript.id,
                                manuscriptTitle: manuscript.originalTitle,
                                pendingMarkets,
                              });
                            }}
                          >
                            <CalendarIcon className="h-4 w-4 mr-2" />
                            Programar {pendingCount} mercado{pendingCount !== 1 ? 's' : ''}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" data-testid={`button-view-details-${manuscript.id}`}>
                          Ver detalles
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Tab: Calendar */}
          <TabsContent value="calendar">
            <Card>
              <CardHeader>
                <CardTitle>Calendario de Publicaciones</CardTitle>
                <CardDescription>
                  Vista mensual con máximo 3 publicaciones por día
                </CardDescription>
              </CardHeader>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  Vista de calendario próximamente...
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Stats */}
          <TabsContent value="stats">
            <Card>
              <CardHeader>
                <CardTitle>Estadísticas Detalladas</CardTitle>
                <CardDescription>
                  Análisis de publicaciones por mercado y periodo
                </CardDescription>
              </CardHeader>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  Estadísticas detalladas próximamente...
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <AppFooter />

      {/* Schedule Publications Dialog */}
      {scheduleDialog.manuscriptId && (
        <SchedulePublicationsDialog
          open={scheduleDialog.open}
          onOpenChange={(open) => setScheduleDialog({ ...scheduleDialog, open })}
          manuscriptId={scheduleDialog.manuscriptId}
          manuscriptTitle={scheduleDialog.manuscriptTitle}
          pendingMarkets={scheduleDialog.pendingMarkets}
        />
      )}

      {/* Mark Published Dialog */}
      <MarkPublishedDialog
        open={markPublishedDialog.open}
        onOpenChange={(open) => setMarkPublishedDialog({ ...markPublishedDialog, open })}
        publication={markPublishedDialog.publication}
        manuscriptTitle={markPublishedDialog.manuscriptTitle}
      />

      {/* Reschedule Publication Dialog */}
      <ReschedulePublicationDialog
        open={rescheduleDialog.open}
        onOpenChange={(open) => setRescheduleDialog({ ...rescheduleDialog, open })}
        publication={rescheduleDialog.publication}
        manuscriptTitle={rescheduleDialog.manuscriptTitle}
      />

      {/* Delete Publication Dialog */}
      <DeletePublicationDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        publication={deleteDialog.publication}
        manuscriptTitle={deleteDialog.manuscriptTitle}
      />
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { SchedulePublicationsDialog } from "@/components/schedule-publications-dialog";
import { MarkPublishedDialog } from "@/components/mark-published-dialog";
import { ReschedulePublicationDialog } from "@/components/reschedule-publication-dialog";
import { DeletePublicationDialog } from "@/components/delete-publication-dialog";
import { TaskChecklist } from "@/components/task-checklist";
import { AllTasksView } from "@/components/all-tasks-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ChevronLeft,
  ChevronRight,
  MapPin,
  BarChart3,
  ListTodo,
  Ban,
} from "lucide-react";
import { amazonMarkets, type Manuscript, type Publication, type AmazonMarket, type BlockedDate } from "@shared/schema";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, parseISO, startOfWeek, endOfWeek, isSameMonth } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

interface BlockDateDialogState {
  open: boolean;
  date: Date | null;
  reason: string;
}

interface UnblockDateDialogState {
  open: boolean;
  blockedDate: BlockedDate | null;
}

type StatusFilter = "all" | "published" | "scheduled" | "unpublished";

export default function Publications() {
  const { toast } = useToast();
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  
  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());

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

  const [blockDateDialog, setBlockDateDialog] = useState<BlockDateDialogState>({
    open: false,
    date: null,
    reason: "",
  });

  const [unblockDateDialog, setUnblockDateDialog] = useState<UnblockDateDialogState>({
    open: false,
    blockedDate: null,
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

  // Fetch blocked dates
  const { data: blockedDates = [] } = useQuery<BlockedDate[]>({
    queryKey: ["/api/blocked-dates"],
  });

  // Create blocked date mutation
  const createBlockedDateMutation = useMutation({
    mutationFn: async (data: { date: Date; reason: string | null }) => {
      return await apiRequest("/api/blocked-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      toast({
        title: "Día bloqueado",
        description: response.rescheduledCount > 0 
          ? `${response.rescheduledCount} publicación(es) reprogramada(s) automáticamente`
          : "No hay publicaciones para reprogramar",
      });
      setBlockDateDialog({ open: false, date: null, reason: "" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo bloquear el día",
        variant: "destructive",
      });
    },
  });

  // Delete blocked date mutation
  const deleteBlockedDateMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/blocked-dates/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      toast({
        title: "Día desbloqueado",
        description: "El día ya está disponible para publicaciones",
      });
      setUnblockDateDialog({ open: false, blockedDate: null });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo desbloquear el día",
        variant: "destructive",
      });
    },
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
          <TabsList className="grid w-full md:w-auto grid-cols-2 lg:grid-cols-4 mb-6">
            <TabsTrigger value="manuscripts" className="gap-2" data-testid="tab-manuscripts">
              <BookOpen className="h-4 w-4" />
              Por Manuscrito
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2" data-testid="tab-all-tasks">
              <ListTodo className="h-4 w-4" />
              Todas las Tareas
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2" data-testid="tab-calendar">
              <CalendarIcon className="h-4 w-4" />
              Calendario
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2" data-testid="tab-stats">
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

                      {/* Task Checklist */}
                      <div className="mt-6">
                        <TaskChecklist 
                          manuscriptId={manuscript.id} 
                          manuscriptTitle={manuscript.originalTitle}
                        />
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
                        <Link href="/library">
                          <Button size="sm" variant="ghost" data-testid={`button-view-details-${manuscript.id}`}>
                            <BookOpen className="h-4 w-4 mr-2" />
                            Ver detalles
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Tab: Calendar */}
          <TabsContent value="calendar" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5" />
                      Calendario de Publicaciones
                    </CardTitle>
                    <CardDescription>
                      Vista mensual con máximo 3 publicaciones por día
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                      data-testid="button-prev-month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-[180px] text-center">
                      <p className="text-sm font-medium">
                        {format(currentMonth, "MMMM yyyy", { locale: es })}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                      data-testid="button-next-month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCurrentMonth(new Date())}
                      data-testid="button-today"
                    >
                      Hoy
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {publicationsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-2">
                      {/* Day headers */}
                      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
                        <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
                          {day}
                        </div>
                      ))}
                      
                      {/* Calendar days */}
                      {(() => {
                        const monthStart = startOfMonth(currentMonth);
                        const monthEnd = endOfMonth(currentMonth);
                        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
                        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
                        const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
                        
                        return calendarDays.map((day) => {
                          const dayPublications = allPublications.filter(pub => {
                            const pubDate = pub.scheduledDate ? new Date(pub.scheduledDate) : null;
                            return pubDate && isSameDay(pubDate, day);
                          });
                          
                          const isCurrentMonth = isSameMonth(day, currentMonth);
                          const isToday = isSameDay(day, new Date());
                          const hasPublications = dayPublications.length > 0;
                          const isAtLimit = dayPublications.length >= 3;
                          
                          // Verificar si el día está bloqueado
                          const isBlocked = blockedDates.some(bd => {
                            const blockedDate = new Date(bd.date);
                            return isSameDay(blockedDate, day);
                          });
                          const blockedDateObj = blockedDates.find(bd => {
                            const blockedDate = new Date(bd.date);
                            return isSameDay(blockedDate, day);
                          });
                          
                          return (
                            <div
                              key={day.toString()}
                              className={`min-h-[100px] border rounded-md p-2 relative group ${
                                !isCurrentMonth ? "bg-muted/30 text-muted-foreground" : "bg-card"
                              } ${isToday ? "border-primary border-2" : ""} ${
                                isBlocked ? "bg-destructive/10 border-destructive/30" : ""
                              }`}
                              data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-xs font-medium ${isToday ? "text-primary" : ""}`}>
                                  {format(day, "d")}
                                </span>
                                <div className="flex items-center gap-1">
                                  {isBlocked && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-5 w-5 p-0"
                                          data-testid={`button-blocked-${format(day, "yyyy-MM-dd")}`}
                                        >
                                          <Ban className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={() => setUnblockDateDialog({ open: true, blockedDate: blockedDateObj! })}
                                          data-testid={`button-unblock-${format(day, "yyyy-MM-dd")}`}
                                        >
                                          <X className="h-4 w-4 mr-2" />
                                          Desbloquear día
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                  {!isBlocked && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                          data-testid={`button-block-${format(day, "yyyy-MM-dd")}`}
                                        >
                                          <Ban className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={() => setBlockDateDialog({ open: true, date: day, reason: "" })}
                                          data-testid={`button-confirm-block-${format(day, "yyyy-MM-dd")}`}
                                        >
                                          <Ban className="h-4 w-4 mr-2" />
                                          Bloquear día
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                  {isAtLimit && (
                                    <Badge variant="destructive" className="h-4 text-[10px] px-1">
                                      Límite
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              
                              {hasPublications && (
                                <div className="space-y-1">
                                  {dayPublications.slice(0, 3).map((pub) => {
                                    const manuscript = manuscripts.find(m => m.id === pub.manuscriptId);
                                    const market = amazonMarkets[pub.market as AmazonMarket];
                                    
                                    return (
                                      <DropdownMenu key={pub.id}>
                                        <DropdownMenuTrigger asChild>
                                          <div
                                            className="text-[10px] bg-secondary/50 rounded px-1 py-0.5 truncate cursor-pointer hover-elevate active-elevate-2"
                                            title={`${manuscript?.originalTitle} - ${market?.name}`}
                                            data-testid={`calendar-publication-${pub.id}`}
                                          >
                                            <span className="mr-1">{market?.flag}</span>
                                            <span className="truncate">{manuscript?.originalTitle}</span>
                                          </div>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start">
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setRescheduleDialog({
                                                open: true,
                                                publication: pub,
                                                manuscriptTitle: manuscript?.originalTitle || "",
                                              });
                                            }}
                                            data-testid={`button-reschedule-pub-${pub.id}`}
                                          >
                                            <CalendarIcon className="h-4 w-4 mr-2" />
                                            Reprogramar
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setMarkPublishedDialog({
                                                open: true,
                                                publication: pub,
                                                manuscriptTitle: manuscript?.originalTitle || "",
                                              });
                                            }}
                                            data-testid={`button-mark-published-pub-${pub.id}`}
                                          >
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            Marcar publicada
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setDeleteDialog({
                                                open: true,
                                                publication: pub,
                                                manuscriptTitle: manuscript?.originalTitle || "",
                                              });
                                            }}
                                            className="text-destructive"
                                            data-testid={`button-delete-pub-${pub.id}`}
                                          >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Eliminar
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    );
                                  })}
                                  {dayPublications.length > 3 && (
                                    <div className="text-[10px] text-muted-foreground px-1">
                                      +{dayPublications.length - 3} más
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                    
                    {/* Legend */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground pt-4 border-t flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary rounded"></div>
                        <span>Hoy</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="h-4 text-[10px] px-1">Límite</Badge>
                        <span>3/3 publicaciones (límite diario)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-destructive/10 border border-destructive/30 rounded"></div>
                        <span>Día bloqueado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4" />
                        <span>Bloquear/desbloquear día (hover sobre el día)</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Stats */}
          <TabsContent value="stats" className="space-y-4">
            {publicationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Distribution by Market */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Distribución por Mercado
                    </CardTitle>
                    <CardDescription>
                      Publicaciones programadas y publicadas por mercado Amazon
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={Object.entries(amazonMarkets).map(([key, market]) => {
                            const marketPubs = allPublications.filter(p => p.market === key);
                            return {
                              market: market.name.split(' (')[0],
                              flag: market.flag,
                              publicadas: marketPubs.filter(p => p.status === "published").length,
                              programadas: marketPubs.filter(p => p.status === "scheduled").length,
                              total: marketPubs.length,
                            };
                          })}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="market" 
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis />
                          <Tooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-card border rounded-md p-3 shadow-lg">
                                    <p className="font-medium mb-2">
                                      {payload[0].payload.flag} {payload[0].payload.market}
                                    </p>
                                    <p className="text-sm text-green-600">
                                      Publicadas: {payload[0].value}
                                    </p>
                                    <p className="text-sm text-blue-600">
                                      Programadas: {payload[1].value}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      Total: {payload[0].payload.total}
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Bar dataKey="publicadas" fill="hsl(var(--chart-1))" name="Publicadas" />
                          <Bar dataKey="programadas" fill="hsl(var(--chart-2))" name="Programadas" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Distribution by Status */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Distribución por Estado
                      </CardTitle>
                      <CardDescription>
                        Proporción de publicaciones por estado
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { 
                                  name: "Publicadas", 
                                  value: allPublications.filter(p => p.status === "published").length,
                                  color: "hsl(var(--chart-1))"
                                },
                                { 
                                  name: "Programadas", 
                                  value: allPublications.filter(p => p.status === "scheduled").length,
                                  color: "hsl(var(--chart-2))"
                                },
                                { 
                                  name: "Pendientes", 
                                  value: (manuscripts.length * Object.keys(amazonMarkets).length) - allPublications.length,
                                  color: "hsl(var(--chart-3))"
                                },
                              ].filter(item => item.value > 0)}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {[
                                { color: "hsl(var(--chart-1))" },
                                { color: "hsl(var(--chart-2))" },
                                { color: "hsl(var(--chart-3))" },
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-card border rounded-md p-3 shadow-lg">
                                      <p className="font-medium">{payload[0].name}</p>
                                      <p className="text-sm">{payload[0].value} publicaciones</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Additional Metrics */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Métricas Adicionales
                      </CardTitle>
                      <CardDescription>
                        Estadísticas generales de publicaciones
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Total de manuscritos:</span>
                          <span className="text-lg font-semibold">{manuscripts.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Total de publicaciones:</span>
                          <span className="text-lg font-semibold">{allPublications.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Mercados disponibles:</span>
                          <span className="text-lg font-semibold">{Object.keys(amazonMarkets).length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Potencial máximo:</span>
                          <span className="text-lg font-semibold">
                            {manuscripts.length * Object.keys(amazonMarkets).length}
                          </span>
                        </div>
                        <div className="pt-3 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Tasa de cobertura:</span>
                            <span className="text-lg font-semibold text-primary">
                              {manuscripts.length > 0 
                                ? ((allPublications.length / (manuscripts.length * Object.keys(amazonMarkets).length)) * 100).toFixed(1)
                                : 0}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Tasa de publicación:</span>
                          <span className="text-lg font-semibold text-green-600">
                            {allPublications.length > 0
                              ? ((allPublications.filter(p => p.status === "published").length / allPublications.length) * 100).toFixed(1)
                              : 0}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Próximas publicaciones:</span>
                          <span className="text-lg font-semibold text-blue-600">
                            {allPublications.filter(p => {
                              if (!p.scheduledDate) return false;
                              const schedDate = new Date(p.scheduledDate);
                              const today = new Date();
                              const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
                              return schedDate >= today && schedDate <= nextWeek;
                            }).length}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Monthly Timeline */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5" />
                      Timeline de Publicaciones
                    </CardTitle>
                    <CardDescription>
                      Evolución mensual de publicaciones programadas y publicadas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={(() => {
                            // Generate timeline data for last 12 months and next 6 months
                            const timelineData: Record<string, { 
                              month: string; 
                              publicadas: number; 
                              programadas: number;
                              total: number;
                            }> = {};
                            
                            // Initialize months
                            const today = new Date();
                            for (let i = -12; i <= 6; i++) {
                              const date = addMonths(today, i);
                              const key = format(date, "yyyy-MM");
                              timelineData[key] = {
                                month: format(date, "MMM yyyy", { locale: es }),
                                publicadas: 0,
                                programadas: 0,
                                total: 0,
                              };
                            }
                            
                            // Aggregate publications by month
                            allPublications.forEach(pub => {
                              const date = pub.scheduledDate ? new Date(pub.scheduledDate) : null;
                              if (date) {
                                const key = format(date, "yyyy-MM");
                                if (timelineData[key]) {
                                  if (pub.status === "published") {
                                    timelineData[key].publicadas++;
                                  } else if (pub.status === "scheduled") {
                                    timelineData[key].programadas++;
                                  }
                                  timelineData[key].total++;
                                }
                              }
                            });
                            
                            return Object.values(timelineData);
                          })()}
                          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorPublicadas" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorProgramadas" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="month" 
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis />
                          <Tooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-card border rounded-md p-3 shadow-lg">
                                    <p className="font-medium mb-2">{payload[0].payload.month}</p>
                                    <p className="text-sm text-green-600">
                                      Publicadas: {payload[0].payload.publicadas}
                                    </p>
                                    <p className="text-sm text-blue-600">
                                      Programadas: {payload[0].payload.programadas}
                                    </p>
                                    <p className="text-sm font-medium mt-1">
                                      Total: {payload[0].payload.total}
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Area 
                            type="monotone" 
                            dataKey="publicadas" 
                            stroke="hsl(var(--chart-1))" 
                            fillOpacity={1} 
                            fill="url(#colorPublicadas)"
                            name="Publicadas"
                          />
                          <Area 
                            type="monotone" 
                            dataKey="programadas" 
                            stroke="hsl(var(--chart-2))" 
                            fillOpacity={1} 
                            fill="url(#colorProgramadas)"
                            name="Programadas"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Top Markets */}
                <Card>
                  <CardHeader>
                    <CardTitle>Mercados Principales</CardTitle>
                    <CardDescription>
                      Ranking de mercados por número de publicaciones
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(amazonMarkets)
                        .map(([key, market]) => ({
                          key,
                          market,
                          count: allPublications.filter(p => p.market === key).length,
                        }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 5)
                        .map((item, index) => (
                          <div key={item.key} className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium">
                              {index + 1}
                            </div>
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-xl">{item.market.flag}</span>
                              <span className="font-medium">{item.market.name.split(' (')[0]}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary"
                                  style={{ 
                                    width: `${(item.count / Math.max(...Object.keys(amazonMarkets).map(k => 
                                      allPublications.filter(p => p.market === k).length
                                    ))) * 100}%` 
                                  }}
                                />
                              </div>
                              <span className="text-sm font-semibold min-w-[2rem] text-right">
                                {item.count}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Tab: All Tasks */}
          <TabsContent value="tasks" className="space-y-4">
            <AllTasksView />
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

      {/* Block Date Dialog */}
      <Dialog
        open={blockDateDialog.open}
        onOpenChange={(open) => setBlockDateDialog({ ...blockDateDialog, open })}
      >
        <DialogContent data-testid="dialog-block-date">
          <DialogHeader>
            <DialogTitle>Bloquear Día</DialogTitle>
            <DialogDescription>
              {blockDateDialog.date && (
                <>
                  Bloquear el día {format(blockDateDialog.date, "d 'de' MMMM 'de' yyyy", { locale: es })}.
                  {allPublications.filter(pub => {
                    const pubDate = pub.scheduledDate ? new Date(pub.scheduledDate) : null;
                    return pubDate && blockDateDialog.date && isSameDay(pubDate, blockDateDialog.date);
                  }).length > 0 && (
                    <span className="block mt-2 text-sm font-semibold text-destructive">
                      Atención: Hay {allPublications.filter(pub => {
                        const pubDate = pub.scheduledDate ? new Date(pub.scheduledDate) : null;
                        return pubDate && blockDateDialog.date && isSameDay(pubDate, blockDateDialog.date);
                      }).length} publicación(es) programada(s) para este día que serán reprogramadas automáticamente.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo (opcional)</label>
              <Textarea
                placeholder="Ej: Vacaciones, evento especial, etc."
                value={blockDateDialog.reason}
                onChange={(e) => setBlockDateDialog({ ...blockDateDialog, reason: e.target.value })}
                data-testid="input-block-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBlockDateDialog({ open: false, date: null, reason: "" })}
              data-testid="button-cancel-block"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (blockDateDialog.date) {
                  createBlockedDateMutation.mutate({
                    date: blockDateDialog.date,
                    reason: blockDateDialog.reason || null,
                  });
                }
              }}
              disabled={createBlockedDateMutation.isPending}
              data-testid="button-confirm-block-date"
            >
              {createBlockedDateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Bloqueando...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4 mr-2" />
                  Bloquear día
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unblock Date Dialog */}
      <Dialog
        open={unblockDateDialog.open}
        onOpenChange={(open) => setUnblockDateDialog({ ...unblockDateDialog, open })}
      >
        <DialogContent data-testid="dialog-unblock-date">
          <DialogHeader>
            <DialogTitle>Desbloquear Día</DialogTitle>
            <DialogDescription>
              {unblockDateDialog.blockedDate && (
                <>
                  ¿Desbloquear el día {format(new Date(unblockDateDialog.blockedDate.date), "d 'de' MMMM 'de' yyyy", { locale: es })}?
                  {unblockDateDialog.blockedDate.reason && (
                    <span className="block mt-2 text-sm">
                      Motivo: {unblockDateDialog.blockedDate.reason}
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnblockDateDialog({ open: false, blockedDate: null })}
              data-testid="button-cancel-unblock"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (unblockDateDialog.blockedDate) {
                  deleteBlockedDateMutation.mutate(unblockDateDialog.blockedDate.id);
                }
              }}
              disabled={deleteBlockedDateMutation.isPending}
              data-testid="button-confirm-unblock-date"
            >
              {deleteBlockedDateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Desbloqueando...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Desbloquear día
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

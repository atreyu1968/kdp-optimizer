import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { SchedulePublicationsDialog } from "@/components/schedule-publications-dialog";
import { MarkPublishedDialog } from "@/components/mark-published-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calendar as CalendarIcon,
  CheckCircle2, 
  Clock, 
  AlertCircle,
  BookOpen,
  TrendingUp,
  Loader2,
  ExternalLink,
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

export default function Publications() {
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
            ) : (
              manuscripts.map((manuscript) => {
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
                              <div className="flex items-start justify-between">
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
                                <div className="flex-shrink-0">
                                  {publication ? getStatusBadge(publication.status) : (
                                    <Badge variant="outline" className="gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      Sin programar
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              {publication && (
                                <div className="flex items-center gap-2 mt-1">
                                  {publication.status === "published" && publication.kdpUrl && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs gap-1 flex-1"
                                      asChild
                                    >
                                      <a href={publication.kdpUrl} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-3 w-3" />
                                        Ver en KDP
                                      </a>
                                    </Button>
                                  )}
                                  {publication.status === "scheduled" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs gap-1 flex-1"
                                      onClick={() => {
                                        setMarkPublishedDialog({
                                          open: true,
                                          publication,
                                          manuscriptTitle: manuscript.originalTitle,
                                        });
                                      }}
                                      data-testid={`button-mark-published-${marketKey}-${manuscript.id}`}
                                    >
                                      <CheckCircle2 className="h-3 w-3" />
                                      Marcar publicado
                                    </Button>
                                  )}
                                </div>
                              )}
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
    </div>
  );
}

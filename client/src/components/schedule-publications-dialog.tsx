import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FlagIcon } from "@/components/flag-icon";
import { Calendar as CalendarIcon, Loader2, CheckCircle2 } from "lucide-react";
import { amazonMarkets, type AmazonMarket } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";

interface SchedulePublicationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manuscriptId: number;
  manuscriptTitle: string;
  pendingMarkets: string[];
}

export function SchedulePublicationsDialog({
  open,
  onOpenChange,
  manuscriptId,
  manuscriptTitle,
  pendingMarkets,
}: SchedulePublicationsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState<string>(
    format(addDays(new Date(), 1), "yyyy-MM-dd")
  );

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/publications/schedule", {
        manuscriptId,
        markets: pendingMarkets,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publications/stats"] });
      toast({
        title: "Publicaciones programadas",
        description: `Se programaron ${data.count} publicaciones exitosamente.`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error al programar",
        description: error.message || "No se pudieron programar las publicaciones.",
      });
    },
  });

  const handleSchedule = () => {
    scheduleMutation.mutate();
  };

  // Ordenar mercados por prioridad (español primero)
  const marketPriority: AmazonMarket[] = [
    "amazon.es",
    "amazon.es-ca",
    "amazon.com",
    "amazon.com.br",
    "amazon.fr",
    "amazon.it",
    "amazon.de",
    "amazon.co.uk",
  ];

  const sortedPendingMarkets = pendingMarkets.sort((a, b) => {
    const indexA = marketPriority.indexOf(a as AmazonMarket);
    const indexB = marketPriority.indexOf(b as AmazonMarket);
    return indexA - indexB;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-schedule-publications">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Programar Publicaciones KDP
          </DialogTitle>
          <DialogDescription>
            Genera un calendario automático respetando el límite de 3 publicaciones por día
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Manuscript Info */}
          <div className="rounded-lg bg-muted/50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Manuscrito</p>
                <p className="text-lg font-semibold text-foreground">{manuscriptTitle}</p>
              </div>
              <Badge variant="secondary" className="gap-1">
                {pendingMarkets.length} mercado{pendingMarkets.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>

          {/* Start Date Input */}
          <div className="space-y-2">
            <Label htmlFor="start-date">Fecha de inicio</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd")}
              data-testid="input-start-date"
            />
            <p className="text-xs text-muted-foreground">
              Las publicaciones se programarán desde esta fecha, respetando el límite de 3 por día
            </p>
          </div>

          {/* Market Preview */}
          <div className="space-y-2">
            <Label>Mercados a programar (en orden de prioridad)</Label>
            <div className="rounded-lg border border-border bg-card p-4 max-h-60 overflow-y-auto">
              <ol className="space-y-2">
                {sortedPendingMarkets.map((market, index) => {
                  const marketInfo = amazonMarkets[market as AmazonMarket];
                  return (
                    <li
                      key={market}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate"
                    >
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium">
                        {index + 1}
                      </div>
                      <FlagIcon countryCode={marketInfo.countryCode} size="lg" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{marketInfo.name}</p>
                      </div>
                      {index === 0 && (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Prioridad español
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
            <p className="text-xs text-muted-foreground">
              ℹ️ Los mercados en español tienen prioridad. Se programará automáticamente {" "}
              respetando el límite de 3 publicaciones por día.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={scheduleMutation.isPending}
            data-testid="button-cancel-schedule"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={scheduleMutation.isPending}
            data-testid="button-confirm-schedule"
          >
            {scheduleMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Programando...
              </>
            ) : (
              <>
                <CalendarIcon className="h-4 w-4 mr-2" />
                Programar {pendingMarkets.length} publicaciones
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
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
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { amazonMarkets, type AmazonMarket, type Publication } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ReschedulePublicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publication: Publication | null;
  manuscriptTitle: string;
}

export function ReschedulePublicationDialog({
  open,
  onOpenChange,
  publication,
  manuscriptTitle,
}: ReschedulePublicationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newDate, setNewDate] = useState<Date | undefined>(undefined);

  // Set initial date when dialog opens
  useEffect(() => {
    if (open && publication?.scheduledDate) {
      setNewDate(new Date(publication.scheduledDate));
    } else if (open) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setNewDate(tomorrow);
    }
  }, [open, publication]);

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!publication || !newDate) throw new Error("Datos incompletos");
      
      const response = await apiRequest("POST", `/api/publications/${publication.id}/reschedule`, {
        newDate: newDate.toISOString().split('T')[0],
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publications/stats"] });
      toast({
        title: "Publicación reprogramada",
        description: `Nueva fecha: ${newDate ? format(newDate, "d 'de' MMMM, yyyy", { locale: es }) : ''}`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error al reprogramar",
        description: error.message || "No se pudo reprogramar la publicación.",
      });
    },
  });

  const marketInfo = publication ? amazonMarkets[publication.market as AmazonMarket] : null;

  const handleReschedule = () => {
    if (!newDate) {
      toast({
        variant: "destructive",
        title: "Fecha requerida",
        description: "Por favor selecciona una nueva fecha.",
      });
      return;
    }
    rescheduleMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-reschedule-publication">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Reprogramar Publicación
          </DialogTitle>
          <DialogDescription>
            Cambia la fecha programada para esta publicación
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Manuscript and Market Info */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Manuscrito</p>
              <p className="text-base font-semibold text-foreground">{manuscriptTitle}</p>
            </div>
            {marketInfo && (
              <div>
                <p className="text-sm text-muted-foreground">Mercado</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{marketInfo.flag}</span>
                  <p className="text-base font-medium">{marketInfo.name}</p>
                </div>
              </div>
            )}
            {publication?.scheduledDate && (
              <div>
                <p className="text-sm text-muted-foreground">Fecha actual</p>
                <p className="text-base font-medium">
                  {format(new Date(publication.scheduledDate), "d 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
            )}
          </div>

          {/* Date Picker */}
          <div className="space-y-2">
            <Label htmlFor="new-date">Nueva fecha de publicación</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !newDate && "text-muted-foreground"
                  )}
                  data-testid="button-select-new-date"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newDate ? format(newDate, "d 'de' MMMM, yyyy", { locale: es }) : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={newDate}
                  onSelect={setNewDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  locale={es}
                  data-testid="calendar-new-date"
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              La nueva fecha debe ser hoy o posterior
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={rescheduleMutation.isPending}
            data-testid="button-cancel-reschedule"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleReschedule}
            disabled={rescheduleMutation.isPending || !publication || !newDate}
            data-testid="button-confirm-reschedule"
          >
            {rescheduleMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reprogramando...
              </>
            ) : (
              <>
                <CalendarIcon className="h-4 w-4 mr-2" />
                Reprogramar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

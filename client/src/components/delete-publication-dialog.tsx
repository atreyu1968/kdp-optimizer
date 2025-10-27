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
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { amazonMarkets, type AmazonMarket, type Publication } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DeletePublicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publication: Publication | null;
  manuscriptTitle: string;
}

export function DeletePublicationDialog({
  open,
  onOpenChange,
  publication,
  manuscriptTitle,
}: DeletePublicationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!publication) throw new Error("No publication selected");
      
      const response = await apiRequest("DELETE", `/api/publications/${publication.id}`, {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publications/stats"] });
      toast({
        title: "Publicación eliminada",
        description: `La publicación de ${marketInfo?.name} ha sido eliminada.`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error al eliminar",
        description: error.message || "No se pudo eliminar la publicación.",
      });
    },
  });

  const marketInfo = publication ? amazonMarkets[publication.market as AmazonMarket] : null;

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-delete-publication">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Eliminar Publicación
          </DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. La publicación será eliminada permanentemente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning Box */}
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 space-y-2">
            <p className="text-sm font-medium text-destructive">¿Estás seguro?</p>
            <p className="text-sm text-muted-foreground">
              Se eliminará la siguiente publicación:
            </p>
            
            <div className="mt-3 space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Manuscrito</p>
                <p className="text-sm font-semibold">{manuscriptTitle}</p>
              </div>
              {marketInfo && (
                <div>
                  <p className="text-xs text-muted-foreground">Mercado</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{marketInfo.flag}</span>
                    <p className="text-sm font-medium">{marketInfo.name}</p>
                  </div>
                </div>
              )}
              {publication && (
                <div>
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <p className="text-sm font-medium capitalize">{publication.status}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
            data-testid="button-cancel-delete"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending || !publication}
            data-testid="button-confirm-delete"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Eliminando...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar publicación
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

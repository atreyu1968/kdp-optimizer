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
import { CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { amazonMarkets, type AmazonMarket, type Publication } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MarkPublishedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publication: Publication | null;
  manuscriptTitle: string;
}

export function MarkPublishedDialog({
  open,
  onOpenChange,
  publication,
  manuscriptTitle,
}: MarkPublishedDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [kdpUrl, setKdpUrl] = useState("");

  const markPublishedMutation = useMutation({
    mutationFn: async () => {
      if (!publication) throw new Error("No publication selected");
      
      const response = await apiRequest("POST", `/api/publications/${publication.id}/publish`, {
        kdpUrl: kdpUrl.trim() || undefined,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publications/stats"] });
      toast({
        title: "Publicación marcada como publicada",
        description: `${marketInfo?.name} ahora está marcado como publicado.`,
      });
      setKdpUrl("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error al marcar como publicada",
        description: error.message || "No se pudo marcar la publicación como publicada.",
      });
    },
  });

  const marketInfo = publication ? amazonMarkets[publication.market as AmazonMarket] : null;

  const handleMarkPublished = () => {
    markPublishedMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-mark-published">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Marcar como Publicado
          </DialogTitle>
          <DialogDescription>
            Registra que este manuscrito ya fue publicado en Amazon KDP
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
          </div>

          {/* KDP URL Input (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="kdp-url">
              Enlace de KDP (opcional)
            </Label>
            <Input
              id="kdp-url"
              type="url"
              placeholder="https://www.amazon.com/dp/..."
              value={kdpUrl}
              onChange={(e) => setKdpUrl(e.target.value)}
              data-testid="input-kdp-url"
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              Enlace directo a la página del libro en Amazon (opcional)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setKdpUrl("");
              onOpenChange(false);
            }}
            disabled={markPublishedMutation.isPending}
            data-testid="button-cancel-mark-published"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleMarkPublished}
            disabled={markPublishedMutation.isPending || !publication}
            data-testid="button-confirm-mark-published"
          >
            {markPublishedMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Marcar como publicado
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

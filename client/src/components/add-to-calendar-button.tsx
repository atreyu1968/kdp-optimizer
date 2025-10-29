import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar, CalendarCheck } from "lucide-react";
import { Link } from "wouter";

interface AddToCalendarButtonProps {
  bookId: number;
  asin: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  showLabel?: boolean;
}

interface CalendarStatus {
  inCalendar: boolean;
  manuscriptId: number | null;
}

interface AddToCalendarResponse {
  manuscriptId: number;
  publications: Array<{
    id: number;
    marketplace: string;
    scheduledDate: string;
  }>;
}

export function AddToCalendarButton({ 
  bookId, 
  asin,
  size = "sm",
  variant = "outline",
  showLabel = true
}: AddToCalendarButtonProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);

  // Verificar si el libro ya está en el calendario
  const { data: calendarStatus, isLoading } = useQuery<CalendarStatus>({
    queryKey: ['/api/aura/books', bookId, 'in-calendar'],
    enabled: !!bookId,
  });

  // Mutación para agregar al calendario
  const addToCalendarMutation = useMutation({
    mutationFn: async () => {
      setIsAdding(true);
      const response = await apiRequest("POST", `/api/aura/books/${bookId}/add-to-calendar`);
      return await response.json() as AddToCalendarResponse;
    },
    onSuccess: (data: AddToCalendarResponse) => {
      toast({
        title: "Libro agregado al calendario",
        description: `El libro ha sido agregado al calendario de publicaciones con ${data.publications.length} publicaciones programadas.`,
      });
      // Invalidar queries relevantes
      queryClient.invalidateQueries({ queryKey: ['/api/aura/books', bookId, 'in-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/manuscripts'] });
      setIsAdding(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error al agregar al calendario",
        description: error.message || "No se pudo agregar el libro al calendario",
        variant: "destructive",
      });
      setIsAdding(false);
    },
  });

  if (isLoading) {
    return (
      <Button 
        size={size} 
        variant={variant}
        disabled
        data-testid={`button-calendar-loading-${asin}`}
      >
        <Calendar className="w-3 h-3 mr-1" />
        {showLabel && "Verificando..."}
      </Button>
    );
  }

  // Si ya está en el calendario, mostrar botón para ir al calendario
  if (calendarStatus?.inCalendar) {
    return (
      <Link href="/publications">
        <Button 
          size={size} 
          variant="default"
          data-testid={`button-view-in-calendar-${asin}`}
        >
          <CalendarCheck className="w-3 h-3 mr-1" />
          {showLabel && "Ver en Calendario"}
        </Button>
      </Link>
    );
  }

  // Mostrar botón para agregar al calendario
  return (
    <Button 
      size={size} 
      variant={variant}
      onClick={() => addToCalendarMutation.mutate()}
      disabled={isAdding}
      data-testid={`button-add-to-calendar-${asin}`}
    >
      <Calendar className="w-3 h-3 mr-1" />
      {showLabel && (isAdding ? "Agregando..." : "Agregar al Calendario")}
    </Button>
  );
}

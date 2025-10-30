import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  ChevronDown, 
  BookOpen, 
  Package, 
  HardDrive,
  TrendingUp,
  ShoppingCart,
  Calendar,
  Flag,
  Globe,
  Search
} from "lucide-react";
import { Link } from "wouter";
import { AddToCalendarButton } from "@/components/add-to-calendar-button";

const penNameFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
});

type PenNameForm = z.infer<typeof penNameFormSchema>;

const eventFormSchema = z.object({
  eventType: z.enum(["promotion", "reoptimization", "price_change", "cover_update", "description_update", "keywords_update", "other"]),
  eventDate: z.string().min(1, "La fecha es requerida"),
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
});

type EventForm = z.infer<typeof eventFormSchema>;

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
  subtitle: string | null;
  marketplaces: string[];
  bookType?: string;
  publishDate?: string | null;
}

interface BookEvent {
  id: number;
  bookId: number;
  asin: string;
  eventType: string;
  eventDate: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

const BOOK_TYPE_CONFIG: Record<string, { label: string; icon: any; variant: "default" | "secondary" | "outline" }> = {
  ebook: { label: "Ebook", icon: BookOpen, variant: "default" },
  paperback: { label: "Tapa blanda", icon: Package, variant: "secondary" },
  hardcover: { label: "Tapa dura", icon: HardDrive, variant: "outline" },
  unknown: { label: "Desconocido", icon: BookOpen, variant: "outline" },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  promotion: "Promoción",
  reoptimization: "Reoptimización",
  price_change: "Cambio de precio",
  cover_update: "Actualización de portada",
  description_update: "Actualización de descripción",
  keywords_update: "Actualización de palabras clave",
  other: "Otro",
};

export default function AuraPenNames() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPenName, setSelectedPenName] = useState<PenName | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedPenNames, setExpandedPenNames] = useState<Set<string>>(new Set());
  
  const [isEventHistoryDialogOpen, setIsEventHistoryDialogOpen] = useState(false);
  const [isCreateEventDialogOpen, setIsCreateEventDialogOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<{ bookId: number; asin: string; title: string } | null>(null);
  const [isAddingAllToCalendar, setIsAddingAllToCalendar] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isConsolidationDialogOpen, setIsConsolidationDialogOpen] = useState(false);
  const [consolidatingName, setConsolidatingName] = useState<string | null>(null);

  const createForm = useForm<PenNameForm>({
    resolver: zodResolver(penNameFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const editForm = useForm<PenNameForm>({
    resolver: zodResolver(penNameFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const eventForm = useForm<EventForm>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      eventType: "promotion",
      eventDate: new Date().toISOString().split('T')[0],
      title: "",
      description: "",
    },
  });

  const { data: penNames, isLoading: isLoadingPenNames, refetch: refetchPenNames } = useQuery<PenName[]>({
    queryKey: ['/api/aura/pen-names'],
  });

  const { data: books, isLoading: isLoadingBooks, refetch: refetchBooks } = useQuery<AuraBook[]>({
    queryKey: ['/api/aura/books'],
  });

  const { data: bookEvents } = useQuery<BookEvent[]>({
    queryKey: [`/api/aura/events/asin/${selectedBook?.asin}`],
    enabled: !!selectedBook?.asin && isEventHistoryDialogOpen,
  });

  const isLoading = isLoadingPenNames || isLoadingBooks;

  const consolidatedPenNames = useMemo(() => {
    if (!penNames) return [];
    
    const nameMap = new Map<string, PenName & { ids: number[] }>();
    
    penNames.forEach(penName => {
      const existing = nameMap.get(penName.name);
      if (existing) {
        existing.ids.push(penName.id);
      } else {
        nameMap.set(penName.name, {
          ...penName,
          ids: [penName.id],
        });
      }
    });
    
    return Array.from(nameMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [penNames]);

  const filteredPenNames = useMemo(() => {
    if (!consolidatedPenNames) return [];
    
    return consolidatedPenNames.filter(penName => {
      const matchesSearch = searchQuery === "" || 
        penName.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesSearch;
    });
  }, [consolidatedPenNames, searchQuery]);

  const booksByPenName = useMemo(() => {
    if (!books || !filteredPenNames) return new Map();
    
    const map = new Map<string, AuraBook[]>();
    
    filteredPenNames.forEach(penName => {
      const penNameBooks = books.filter(book => 
        penName.ids.includes(book.penNameId)
      );
      
      // Deduplicar libros por ASIN (mismo libro puede estar en múltiples marketplaces)
      const uniqueBooks = Array.from(
        penNameBooks.reduce((acc, book) => {
          const existing = acc.get(book.asin);
          if (!existing) {
            // Primera vez que vemos este ASIN, lo agregamos
            acc.set(book.asin, book);
          } else {
            // Ya existe, fusionar información
            const merged: AuraBook = {
              ...existing,
              // Preferir el subtitle más largo si hay diferencias
              subtitle: (book.subtitle && (!existing.subtitle || book.subtitle.length > existing.subtitle.length)) 
                ? book.subtitle 
                : existing.subtitle,
              // Fusionar marketplaces únicos
              marketplaces: Array.from(new Set([...existing.marketplaces, ...book.marketplaces])),
              // Usar la fecha de publicación más antigua si está disponible
              publishDate: existing.publishDate || book.publishDate,
            };
            acc.set(book.asin, merged);
          }
          return acc;
        }, new Map<string, AuraBook>()).values()
      );
      
      map.set(penName.name, uniqueBooks);
    });
    
    return map;
  }, [books, filteredPenNames]);

  const togglePenName = (name: string) => {
    const newExpanded = new Set(expandedPenNames);
    if (newExpanded.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
    setExpandedPenNames(newExpanded);
  };

  const createEventMutation = useMutation({
    mutationFn: async (data: EventForm & { bookId: number; asin: string }) => {
      return await apiRequest('POST', '/api/aura/events', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/aura/events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/aura/events/asin'] });
      setIsCreateEventDialogOpen(false);
      eventForm.reset();
      toast({
        title: "Evento creado",
        description: "El evento se ha registrado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el evento",
        variant: "destructive",
      });
    },
  });

  const consolidateMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest('POST', '/api/aura/pen-names/consolidate', { name });
      return await res.json();
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/aura/pen-names'] });
      queryClient.invalidateQueries({ queryKey: ['/api/aura/books'] });
      
      // Refetch explícitamente debido a staleTime: Infinity
      await Promise.all([refetchPenNames(), refetchBooks()]);
      
      setConsolidatingName(null);
      
      toast({
        title: "Consolidación exitosa",
        description: `Se consolidaron ${data.duplicatesRemoved} duplicados. ` +
          `Reasignados: ${data.booksReassigned} libros, ${data.seriesReassigned} series, ` +
          `${data.salesReassigned} ventas, ${data.kenpDataReassigned} datos KENP, ` +
          `${data.salesDataReassigned} datos de ventas.`,
      });
    },
    onError: (error: any) => {
      setConsolidatingName(null);
      toast({
        title: "Error al consolidar",
        description: error.message || "No se pudo consolidar el seudónimo",
        variant: "destructive",
      });
    },
  });

  const duplicatePenNames = useMemo(() => {
    return consolidatedPenNames.filter(penName => penName.ids.length > 1);
  }, [consolidatedPenNames]);

  const handleConsolidate = (name: string) => {
    setConsolidatingName(name);
    consolidateMutation.mutate(name);
  };

  const handleAddAllToCalendar = async () => {
    console.log("[Add All to Calendar] Starting batch import...");
    setIsAddingAllToCalendar(true);
    try {
      console.log("[Add All to Calendar] Making API request...");
      const res = await apiRequest('POST', '/api/aura/books/add-all-to-calendar', {});
      console.log("[Add All to Calendar] Got response, parsing JSON...");
      const response: { 
        success: boolean; 
        added: number; 
        skipped: number; 
        errors: string[]; 
        message: string;
      } = await res.json();
      console.log("[Add All to Calendar] Response parsed:", response);
      
      queryClient.invalidateQueries({ queryKey: ['/api/aura/books'] });
      queryClient.invalidateQueries({ queryKey: ['/api/manuscripts'] });
      
      const { added, skipped, errors } = response;
      
      let description = `Se agregaron ${added} libros al calendario.`;
      if (skipped > 0) {
        description += ` ${skipped} ya estaban en el calendario.`;
      }
      if (errors && errors.length > 0) {
        description += ` ${errors.length} errores encontrados.`;
      }
      
      console.log("[Add All to Calendar] Showing success toast");
      toast({
        title: "Importación completada",
        description,
        variant: errors && errors.length > 0 ? "destructive" : "default",
      });
    } catch (error: any) {
      console.error("[Add All to Calendar] Error occurred:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar los libros al calendario",
        variant: "destructive",
      });
    } finally {
      console.log("[Add All to Calendar] Resetting loading state");
      setIsAddingAllToCalendar(false);
    }
  };

  const handleCreate = async (data: PenNameForm) => {
    setIsSubmitting(true);
    try {
      await apiRequest('POST', '/api/aura/pen-names', {
        name: data.name,
        description: data.description || null,
      });

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/pen-names'] });
      
      toast({
        title: "Éxito",
        description: "Seudónimo creado correctamente",
      });

      setIsCreateDialogOpen(false);
      createForm.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el seudónimo",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: PenNameForm) => {
    if (!selectedPenName) return;

    setIsSubmitting(true);
    try {
      await apiRequest('PUT', `/api/aura/pen-names/${selectedPenName.id}`, {
        name: data.name,
        description: data.description || null,
      });

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/pen-names'] });
      
      toast({
        title: "Éxito",
        description: "Seudónimo actualizado correctamente",
      });

      setIsEditDialogOpen(false);
      setSelectedPenName(null);
      editForm.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el seudónimo",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPenName) return;

    setIsSubmitting(true);
    try {
      await apiRequest('DELETE', `/api/aura/pen-names/${selectedPenName.id}`);

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/pen-names'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/aura/books'] });
      
      toast({
        title: "Éxito",
        description: "Seudónimo eliminado correctamente",
      });

      setIsDeleteDialogOpen(false);
      setSelectedPenName(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el seudónimo",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (penName: PenName) => {
    setSelectedPenName(penName);
    editForm.reset({
      name: penName.name,
      description: penName.description || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (penName: PenName) => {
    setSelectedPenName(penName);
    setIsDeleteDialogOpen(true);
  };

  const openEventHistory = (book: AuraBook) => {
    setSelectedBook({
      bookId: book.id,
      asin: book.asin,
      title: book.title,
    });
    setIsEventHistoryDialogOpen(true);
  };

  const openCreateEvent = (book: AuraBook) => {
    setSelectedBook({
      bookId: book.id,
      asin: book.asin,
      title: book.title,
    });
    eventForm.reset({
      eventType: "promotion",
      eventDate: new Date().toISOString().split('T')[0],
      title: "",
      description: "",
    });
    setIsCreateEventDialogOpen(true);
  };

  const handleCreateEvent = (data: EventForm) => {
    if (!selectedBook) return;
    
    createEventMutation.mutate({
      ...data,
      bookId: selectedBook.bookId,
      asin: selectedBook.asin,
    });
  };

  const BookTypeIcon = ({ type }: { type: string }) => {
    const config = BOOK_TYPE_CONFIG[type] || BOOK_TYPE_CONFIG.unknown;
    const Icon = config.icon;
    return <Icon className="w-3 h-3" />;
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-aura-pen-names">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Seudónimos
          </h1>
          <p className="text-muted-foreground">
            Gestiona tus identidades de autor y sus libros
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={handleAddAllToCalendar} 
            disabled={isAddingAllToCalendar || !books || books.length === 0}
            data-testid="button-add-all-to-calendar"
          >
            <Calendar className="w-4 h-4 mr-2" />
            {isAddingAllToCalendar ? "Agregando..." : "Agregar Todos al Calendario"}
          </Button>
          {duplicatePenNames.length > 0 && (
            <Button 
              variant="outline" 
              onClick={() => setIsConsolidationDialogOpen(true)}
              data-testid="button-consolidate-duplicates"
            >
              <Flag className="w-4 h-4 mr-2" />
              Consolidar Duplicados ({duplicatePenNames.length})
            </Button>
          )}
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-pen-name">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Seudónimo
          </Button>
        </div>
      </div>

      {consolidatedPenNames.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">
              No hay seudónimos registrados. Importa archivos KDP para comenzar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar seudónimo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-pennames"
                />
              </div>
            </CardContent>
          </Card>

          {filteredPenNames.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  No se encontraron seudónimos que coincidan con la búsqueda.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredPenNames.map((penName) => {
            const penNameBooks = booksByPenName.get(penName.name) || [];
            const isExpanded = expandedPenNames.has(penName.name);
            
            return (
              <Card key={penName.name} data-testid={`card-pen-name-${penName.name}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <CardTitle data-testid={`text-pen-name-${penName.name}`}>
                          {penName.name}
                        </CardTitle>
                        <Badge variant="secondary" data-testid={`badge-book-count-${penName.name}`}>
                          {penNameBooks.length} {penNameBooks.length === 1 ? 'libro' : 'libros'}
                        </Badge>
                      </div>
                      {penName.description && (
                        <CardDescription className="mt-2">
                          {penName.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(penName)}
                        data-testid={`button-edit-${penName.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openDeleteDialog(penName)}
                        data-testid={`button-delete-${penName.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {penNameBooks.length > 0 && (
                  <Collapsible open={isExpanded} onOpenChange={() => togglePenName(penName.name)}>
                    <CollapsibleTrigger asChild>
                      <div className="px-6 pb-4">
                        <Button 
                          variant="ghost" 
                          className="w-full justify-between"
                          data-testid={`button-toggle-books-${penName.name}`}
                        >
                          <span>
                            {isExpanded ? 'Ocultar' : 'Ver'} libros ({penNameBooks.length})
                          </span>
                          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </Button>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {penNameBooks.map((book: AuraBook) => {
                            const bookTypeConfig = BOOK_TYPE_CONFIG[book.bookType || 'unknown'];
                            
                            return (
                              <Card key={`${book.id}-${book.asin}`} className="hover-elevate" data-testid={`card-book-${book.asin}`}>
                                <CardContent className="p-4">
                                  <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <h4 className="font-semibold" data-testid={`text-book-title-${book.asin}`}>
                                            {book.title}
                                          </h4>
                                          <Badge variant={bookTypeConfig.variant} data-testid={`badge-book-type-${book.asin}`}>
                                            <BookTypeIcon type={book.bookType || 'unknown'} />
                                            <span className="ml-1">{bookTypeConfig.label}</span>
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                          <span data-testid={`text-book-asin-${book.asin}`}>
                                            ASIN: {book.asin}
                                          </span>
                                          <div className="flex items-center gap-1 flex-wrap">
                                            <Globe className="w-3 h-3" />
                                            {book.marketplaces.map((marketplace: string) => (
                                              <Badge 
                                                key={marketplace} 
                                                variant="outline" 
                                                className="text-xs"
                                                data-testid={`badge-marketplace-${book.asin}-${marketplace}`}
                                              >
                                                {marketplace}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Link href={`/aura/unlimited?asin=${book.asin}`}>
                                        <Button 
                                          size="sm" 
                                          variant="outline"
                                          data-testid={`button-view-unlimited-${book.asin}`}
                                        >
                                          <TrendingUp className="w-3 h-3 mr-1" />
                                          Ver en Aura Unlimited
                                        </Button>
                                      </Link>
                                      
                                      <Link href={`/aura/sales?asin=${book.asin}`}>
                                        <Button 
                                          size="sm" 
                                          variant="outline"
                                          data-testid={`button-view-sales-${book.asin}`}
                                        >
                                          <ShoppingCart className="w-3 h-3 mr-1" />
                                          Ver en Aura Ventas
                                        </Button>
                                      </Link>
                                      
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => openEventHistory(book)}
                                        data-testid={`button-view-events-${book.asin}`}
                                      >
                                        <Calendar className="w-3 h-3 mr-1" />
                                        Ver eventos
                                      </Button>
                                      
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => openCreateEvent(book)}
                                        data-testid={`button-create-event-${book.asin}`}
                                      >
                                        <Flag className="w-3 h-3 mr-1" />
                                        Marcar evento
                                      </Button>
                                      
                                      <AddToCalendarButton
                                        bookId={book.id}
                                        asin={book.asin}
                                        size="sm"
                                        variant="outline"
                                      />
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </Card>
            );
          })}
            </div>
          )}
        </>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-pen-name">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Seudónimo</DialogTitle>
            <DialogDescription>
              Agrega un nuevo seudónimo para organizar tus libros
            </DialogDescription>
          </DialogHeader>
          
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-pen-name-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (opcional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-pen-name-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isSubmitting}
                  data-testid="button-cancel-create"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} data-testid="button-submit-create">
                  {isSubmitting ? "Creando..." : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-pen-name">
          <DialogHeader>
            <DialogTitle>Editar Seudónimo</DialogTitle>
            <DialogDescription>
              Modifica la información del seudónimo
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-pen-name-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (opcional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-edit-pen-name-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={isSubmitting}
                  data-testid="button-cancel-edit"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} data-testid="button-submit-edit">
                  {isSubmitting ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-pen-name">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar seudónimo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el seudónimo
              "{selectedPenName?.name}" y todos sus libros asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting} data-testid="button-cancel-delete">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              data-testid="button-confirm-delete"
            >
              {isSubmitting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEventHistoryDialogOpen} onOpenChange={setIsEventHistoryDialogOpen}>
        <DialogContent className="max-w-3xl" data-testid="dialog-event-history">
          <DialogHeader>
            <DialogTitle>Histórico de Eventos</DialogTitle>
            <DialogDescription>
              {selectedBook?.title} (ASIN: {selectedBook?.asin})
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {!bookEvents || bookEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay eventos registrados para este libro
              </div>
            ) : (
              bookEvents.map((event) => (
                <Card key={event.id} data-testid={`card-event-${event.id}`}>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold" data-testid={`text-event-title-${event.id}`}>
                              {event.title}
                            </h4>
                            <Badge variant="outline" data-testid={`badge-event-type-${event.id}`}>
                              {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1" data-testid={`text-event-date-${event.id}`}>
                            {new Date(event.eventDate).toLocaleDateString('es-ES', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      {event.description && (
                        <p className="text-sm" data-testid={`text-event-description-${event.id}`}>
                          {event.description}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateEventDialogOpen} onOpenChange={setIsCreateEventDialogOpen}>
        <DialogContent data-testid="dialog-create-event">
          <DialogHeader>
            <DialogTitle>Marcar Evento</DialogTitle>
            <DialogDescription>
              Registra un evento para {selectedBook?.title}
            </DialogDescription>
          </DialogHeader>
          
          <Form {...eventForm}>
            <form onSubmit={eventForm.handleSubmit(handleCreateEvent)} className="space-y-4">
              <FormField
                control={eventForm.control}
                name="eventType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de evento</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-event-type">
                          <SelectValue placeholder="Selecciona el tipo de evento" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={eventForm.control}
                name="eventDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha del evento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-event-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={eventForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ej: Campaña Amazon Ads" data-testid="input-event-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={eventForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (opcional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Detalles adicionales del evento" data-testid="input-event-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateEventDialogOpen(false)}
                  disabled={createEventMutation.isPending}
                  data-testid="button-cancel-event"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createEventMutation.isPending} data-testid="button-submit-event">
                  {createEventMutation.isPending ? "Creando..." : "Crear Evento"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isConsolidationDialogOpen} onOpenChange={setIsConsolidationDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-consolidate-duplicates">
          <DialogHeader>
            <DialogTitle>Consolidar Seudónimos Duplicados</DialogTitle>
            <DialogDescription>
              Se encontraron {duplicatePenNames.length} seudónimos con duplicados. 
              Al consolidar, se mantendrá el seudónimo más antiguo (menor ID) y se reasignarán todos los datos de los duplicados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {duplicatePenNames.map((penName) => {
              const penNameBooks = booksByPenName.get(penName.name) || [];
              const isConsolidating = consolidatingName === penName.name;

              const bookCountByPenNameId = new Map<number, number>();
              if (books) {
                penName.ids.forEach(id => {
                  const count = books.filter(book => book.penNameId === id).length;
                  bookCountByPenNameId.set(id, count);
                });
              }

              return (
                <Card key={penName.name} data-testid={`card-duplicate-${penName.name}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="text-lg" data-testid={`text-duplicate-name-${penName.name}`}>
                          {penName.name}
                        </CardTitle>
                        <CardDescription>
                          {penName.ids.length} IDs duplicados • {penNameBooks.length} libros totales
                        </CardDescription>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleConsolidate(penName.name)}
                        disabled={isConsolidating}
                        data-testid={`button-consolidate-${penName.name}`}
                      >
                        {isConsolidating ? "Consolidando..." : "Consolidar"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">IDs encontrados:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {penName.ids.map((id, index) => (
                          <div
                            key={id}
                            className="flex items-center gap-2 p-2 border rounded-md"
                            data-testid={`duplicate-id-${penName.name}-${id}`}
                          >
                            {index === 0 && (
                              <Badge variant="default" className="text-xs">
                                Principal
                              </Badge>
                            )}
                            <span className="text-sm font-mono">ID: {id}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {bookCountByPenNameId.get(id) || 0} libros
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Se mantendrá el ID {penName.ids[0]} y se reasignarán todos los datos de los otros IDs.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConsolidationDialogOpen(false)}
              disabled={!!consolidatingName}
              data-testid="button-close-consolidation"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

const seriesFormSchema = z.object({
  penNameId: z.number({ required_error: "Selecciona un seudónimo" }),
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
});

type SeriesForm = z.infer<typeof seriesFormSchema>;

interface PenName {
  id: number;
  name: string;
  description: string | null;
}

interface BookSeries {
  id: number;
  penNameId: number;
  name: string;
  description: string | null;
}

interface AuraBook {
  id: number;
  penNameId: number;
  seriesId: number | null;
  asin: string;
  title: string;
  marketplaces: string[];
}

const ITEMS_PER_PAGE = 10;

export default function AuraSeries() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<BookSeries | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const createForm = useForm<SeriesForm>({
    resolver: zodResolver(seriesFormSchema),
    defaultValues: {
      penNameId: undefined,
      name: "",
      description: "",
    },
  });

  const editForm = useForm<SeriesForm>({
    resolver: zodResolver(seriesFormSchema),
    defaultValues: {
      penNameId: undefined,
      name: "",
      description: "",
    },
  });

  const { data: penNames } = useQuery<PenName[]>({
    queryKey: ['/api/aura/pen-names'],
  });

  const { data: series, isLoading } = useQuery<BookSeries[]>({
    queryKey: ['/api/aura/series'],
  });

  const { data: books } = useQuery<AuraBook[]>({
    queryKey: ['/api/aura/books'],
  });

  // Pagination logic
  const totalPages = Math.ceil((series?.length || 0) / ITEMS_PER_PAGE);
  const paginatedSeries = series?.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Adjust current page if it becomes invalid
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const handleCreate = async (data: SeriesForm) => {
    setIsSubmitting(true);
    try {
      await apiRequest('POST', '/api/aura/series', {
        penNameId: data.penNameId,
        name: data.name,
        description: data.description || null,
      });

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/series'] });
      
      toast({
        title: "Éxito",
        description: "Serie creada correctamente",
      });

      setIsCreateDialogOpen(false);
      createForm.reset();
      setCurrentPage(1);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la serie",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: SeriesForm) => {
    if (!selectedSeries) return;

    setIsSubmitting(true);
    try {
      await apiRequest('PUT', `/api/aura/series/${selectedSeries.id}`, {
        penNameId: data.penNameId,
        name: data.name,
        description: data.description || null,
      });

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/series'] });
      
      toast({
        title: "Éxito",
        description: "Serie actualizada correctamente",
      });

      setIsEditDialogOpen(false);
      setSelectedSeries(null);
      editForm.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la serie",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSeries) return;

    setIsSubmitting(true);
    try {
      await apiRequest('DELETE', `/api/aura/series/${selectedSeries.id}`);

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/series'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/aura/books'] });
      
      toast({
        title: "Éxito",
        description: "Serie eliminada correctamente",
      });

      setIsDeleteDialogOpen(false);
      setSelectedSeries(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la serie",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (series: BookSeries) => {
    setSelectedSeries(series);
    editForm.reset({
      penNameId: series.penNameId,
      name: series.name,
      description: series.description || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (series: BookSeries) => {
    setSelectedSeries(series);
    setIsDeleteDialogOpen(true);
  };

  const getPenNameName = (penNameId: number) => {
    return penNames?.find(p => p.id === penNameId)?.name || "Desconocido";
  };

  const getBookCount = (seriesId: number) => {
    return books?.filter(b => b.seriesId === seriesId).length || 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Series</h2>
          <p className="text-muted-foreground">
            Organiza tus libros en series
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-series">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Serie
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas las Series</CardTitle>
          <CardDescription>
            Gestiona las series de libros por seudónimo
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !series || series.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No hay series registradas. Crea una para empezar.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-center">Libros</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSeries?.map((series) => (
                  <TableRow key={series.id} data-testid={`row-series-${series.id}`}>
                    <TableCell className="font-medium">{series.name}</TableCell>
                    <TableCell>{getPenNameName(series.penNameId)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {series.description || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {getBookCount(series.id)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDialog(series)}
                          data-testid={`button-edit-${series.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openDeleteDialog(series)}
                          data-testid={`button-delete-${series.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {series && series.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, series.length)} de {series.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <span className="text-sm">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  data-testid="button-next-page"
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Serie</DialogTitle>
            <DialogDescription>
              Agrega una nueva serie de libros
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="penNameId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seudónimo *</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-pen-name">
                          <SelectValue placeholder="Selecciona autor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {penNames?.map((penName) => (
                          <SelectItem key={penName.id} value={penName.id.toString()}>
                            {penName.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Saga de los Inmortales"
                        {...field}
                        data-testid="input-series-name"
                      />
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
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Información adicional sobre esta serie (opcional)"
                        {...field}
                        data-testid="input-series-description"
                      />
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
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="button-submit-series"
                >
                  {isSubmitting ? "Creando..." : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Serie</DialogTitle>
            <DialogDescription>
              Modifica la información de la serie
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="penNameId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seudónimo *</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-pen-name">
                          <SelectValue placeholder="Selecciona autor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {penNames?.map((penName) => (
                          <SelectItem key={penName.id} value={penName.id.toString()}>
                            {penName.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Saga de los Inmortales"
                        {...field}
                        data-testid="input-edit-name"
                      />
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
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Información adicional sobre esta serie (opcional)"
                        {...field}
                        data-testid="input-edit-description"
                      />
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
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="button-submit-edit"
                >
                  {isSubmitting ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la serie "{selectedSeries?.name}"
              {getBookCount(selectedSeries?.id || 0) > 0 && 
                ` y afectará ${getBookCount(selectedSeries?.id || 0)} libro(s) asociado(s)`}.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
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
    </div>
  );
}

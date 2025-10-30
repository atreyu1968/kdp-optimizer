import { useState, useEffect, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const bookFormSchema = z.object({
  penNameId: z.number({ required_error: "Selecciona un seudónimo" }),
  seriesId: z.number().optional().nullable(),
  asin: z.string().min(1, "El ASIN es requerido"),
  title: z.string().min(1, "El título es requerido"),
  marketplaces: z.array(z.string()).default([]),
});

type BookForm = z.infer<typeof bookFormSchema>;

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

export default function AuraBooks() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<AuraBook | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPenName, setFilterPenName] = useState("all");
  const [filterSeries, setFilterSeries] = useState("all");

  const createForm = useForm<BookForm>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: {
      penNameId: undefined,
      seriesId: null,
      asin: "",
      title: "",
      marketplaces: [],
    },
  });

  const editForm = useForm<BookForm>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: {
      penNameId: undefined,
      seriesId: null,
      asin: "",
      title: "",
      marketplaces: [],
    },
  });

  const { data: penNames } = useQuery<PenName[]>({
    queryKey: ['/api/aura/pen-names'],
  });

  const { data: series } = useQuery<BookSeries[]>({
    queryKey: ['/api/aura/series'],
  });

  const { data: books, isLoading } = useQuery<AuraBook[]>({
    queryKey: ['/api/aura/books'],
  });

  // Filter books
  const filteredBooks = useMemo(() => {
    if (!books) return [];
    
    return books.filter(book => {
      const matchesSearch = searchQuery === "" || 
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.asin.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesPenName = filterPenName === "all" || 
        book.penNameId.toString() === filterPenName;
      
      const matchesSeries = filterSeries === "all" || 
        (filterSeries === "none" && book.seriesId === null) ||
        (book.seriesId !== null && book.seriesId.toString() === filterSeries);
      
      return matchesSearch && matchesPenName && matchesSeries;
    });
  }, [books, searchQuery, filterPenName, filterSeries]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterPenName, filterSeries]);

  // Pagination logic
  const totalPages = Math.ceil((filteredBooks?.length || 0) / ITEMS_PER_PAGE);
  const paginatedBooks = filteredBooks?.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Adjust current page if it becomes invalid
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const handleCreate = async (data: BookForm) => {
    setIsSubmitting(true);
    try {
      await apiRequest('POST', '/api/aura/books', {
        ...data,
        seriesId: data.seriesId || null,
      });

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/books'] });
      
      toast({
        title: "Éxito",
        description: "Libro creado correctamente",
      });

      setIsCreateDialogOpen(false);
      createForm.reset();
      setCurrentPage(1);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el libro",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: BookForm) => {
    if (!selectedBook) return;

    setIsSubmitting(true);
    try {
      await apiRequest('PUT', `/api/aura/books/${selectedBook.id}`, {
        ...data,
        seriesId: data.seriesId || null,
      });

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/books'] });
      
      toast({
        title: "Éxito",
        description: "Libro actualizado correctamente",
      });

      setIsEditDialogOpen(false);
      setSelectedBook(null);
      editForm.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el libro",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBook) return;

    setIsSubmitting(true);
    try {
      await apiRequest('DELETE', `/api/aura/books/${selectedBook.id}`);

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/books'] });
      
      toast({
        title: "Éxito",
        description: "Libro eliminado correctamente",
      });

      setIsDeleteDialogOpen(false);
      setSelectedBook(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el libro",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (book: AuraBook) => {
    setSelectedBook(book);
    editForm.reset({
      penNameId: book.penNameId,
      seriesId: book.seriesId,
      asin: book.asin,
      title: book.title,
      marketplaces: book.marketplaces,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (book: AuraBook) => {
    setSelectedBook(book);
    setIsDeleteDialogOpen(true);
  };

  const getPenNameName = (penNameId: number) => {
    return penNames?.find(p => p.id === penNameId)?.name || "Desconocido";
  };

  const getSeriesName = (seriesId: number | null) => {
    if (!seriesId) return "—";
    return series?.find(s => s.id === seriesId)?.name || "—";
  };

  const getSeriesByPenName = (penNameId: number | undefined) => {
    if (!penNameId) return [];
    return series?.filter(s => s.penNameId === penNameId) || [];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Libros</h2>
          <p className="text-muted-foreground">
            Catálogo de tus libros publicados
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-book">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Libro
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todos los Libros</CardTitle>
          <CardDescription>
            Catálogo completo de libros registrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar por título o ASIN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-books"
                />
              </div>
            </div>
            <div className="w-[200px]">
              <Select
                value={filterPenName}
                onValueChange={setFilterPenName}
              >
                <SelectTrigger data-testid="select-filter-penname">
                  <SelectValue placeholder="Todos los autores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los autores</SelectItem>
                  {penNames?.map((penName) => (
                    <SelectItem key={penName.id} value={penName.id.toString()}>
                      {penName.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[200px]">
              <Select
                value={filterSeries}
                onValueChange={setFilterSeries}
              >
                <SelectTrigger data-testid="select-filter-series">
                  <SelectValue placeholder="Todas las series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las series</SelectItem>
                  <SelectItem value="none">Sin serie</SelectItem>
                  {series?.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !books || books.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No hay libros registrados. Crea uno para empezar.
              </p>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No se encontraron libros que coincidan con los filtros.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>ASIN</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Serie</TableHead>
                  <TableHead>Marketplaces</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedBooks?.map((book) => (
                  <TableRow key={book.id} data-testid={`row-book-${book.id}`}>
                    <TableCell className="font-medium">{book.title}</TableCell>
                    <TableCell className="font-mono text-sm">{book.asin}</TableCell>
                    <TableCell>{getPenNameName(book.penNameId)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {getSeriesName(book.seriesId)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {book.marketplaces.slice(0, 3).map((mp, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {mp}
                          </Badge>
                        ))}
                        {book.marketplaces.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{book.marketplaces.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDialog(book)}
                          data-testid={`button-edit-${book.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openDeleteDialog(book)}
                          data-testid={`button-delete-${book.id}`}
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

          {filteredBooks && filteredBooks.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredBooks.length)} de {filteredBooks.length}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear Libro</DialogTitle>
            <DialogDescription>
              Agrega un nuevo libro a tu catálogo
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={createForm.control}
                  name="penNameId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seudónimo *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(parseInt(value));
                          createForm.setValue('seriesId', null);
                        }}
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
                  name="seriesId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Serie (opcional)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))}
                        value={field.value?.toString() || "none"}
                        disabled={!createForm.watch('penNameId')}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-series">
                            <SelectValue placeholder="Sin serie" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sin serie</SelectItem>
                          {getSeriesByPenName(createForm.watch('penNameId')).map((series) => (
                            <SelectItem key={series.id} value={series.id.toString()}>
                              {series.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={createForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Título del libro"
                        {...field}
                        data-testid="input-book-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="asin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ASIN *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="B08XXXXXX"
                        {...field}
                        data-testid="input-book-asin"
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
                  data-testid="button-submit-book"
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Libro</DialogTitle>
            <DialogDescription>
              Modifica la información del libro
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="penNameId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seudónimo *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(parseInt(value));
                          editForm.setValue('seriesId', null);
                        }}
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
                  name="seriesId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Serie (opcional)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))}
                        value={field.value?.toString() || "none"}
                        disabled={!editForm.watch('penNameId')}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-series">
                            <SelectValue placeholder="Sin serie" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sin serie</SelectItem>
                          {getSeriesByPenName(editForm.watch('penNameId')).map((series) => (
                            <SelectItem key={series.id} value={series.id.toString()}>
                              {series.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Título del libro"
                        {...field}
                        data-testid="input-edit-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="asin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ASIN *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="B08XXXXXX"
                        {...field}
                        data-testid="input-edit-asin"
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
              Esta acción eliminará permanentemente el libro "{selectedBook?.title}".
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

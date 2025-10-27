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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

const penNameFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
});

type PenNameForm = z.infer<typeof penNameFormSchema>;

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
  marketplaces: string[];
}

const ITEMS_PER_PAGE = 10;

export default function AuraPenNames() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPenName, setSelectedPenName] = useState<PenName | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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

  const { data: penNames, isLoading } = useQuery<PenName[]>({
    queryKey: ['/api/aura/pen-names'],
  });

  const { data: books } = useQuery<AuraBook[]>({
    queryKey: ['/api/aura/books'],
  });

  // Pagination logic
  const totalPages = Math.ceil((penNames?.length || 0) / ITEMS_PER_PAGE);
  const paginatedPenNames = penNames?.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Adjust current page if it becomes invalid (e.g., after deleting items)
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const handleCreate = async (data: PenNameForm) => {
    setIsSubmitting(true);
    try {
      await apiRequest('/api/aura/pen-names', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
        }),
      });

      await queryClient.invalidateQueries({ queryKey: ['/api/aura/pen-names'] });
      
      toast({
        title: "Éxito",
        description: "Seudónimo creado correctamente",
      });

      setIsCreateDialogOpen(false);
      createForm.reset();
      setCurrentPage(1); // Go to first page to show new item
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
      await apiRequest(`/api/aura/pen-names/${selectedPenName.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
        }),
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
      await apiRequest(`/api/aura/pen-names/${selectedPenName.id}`, {
        method: 'DELETE',
      });

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

  const getBookCount = (penNameId: number) => {
    return books?.filter(b => b.penNameId === penNameId).length || 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Seudónimos</h2>
          <p className="text-muted-foreground">
            Gestiona tus identidades de autor
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-pen-name">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Seudónimo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todos los Seudónimos</CardTitle>
          <CardDescription>
            Lista completa de tus identidades de autor
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !penNames || penNames.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No hay seudónimos registrados. Crea uno para empezar.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-center">Libros</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPenNames?.map((penName) => (
                  <TableRow key={penName.id} data-testid={`row-pen-name-${penName.id}`}>
                    <TableCell className="font-medium">{penName.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {penName.description || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {getBookCount(penName.id)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDialog(penName)}
                          data-testid={`button-edit-${penName.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openDeleteDialog(penName)}
                          data-testid={`button-delete-${penName.id}`}
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

          {penNames && penNames.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, penNames.length)} de {penNames.length}
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
            <DialogTitle>Crear Seudónimo</DialogTitle>
            <DialogDescription>
              Agrega una nueva identidad de autor
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Jane Doe"
                        {...field}
                        data-testid="input-pen-name-name"
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
                        placeholder="Información adicional sobre este seudónimo (opcional)"
                        {...field}
                        data-testid="input-pen-name-description"
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
                  data-testid="button-submit-pen-name"
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
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Jane Doe"
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
                        placeholder="Información adicional sobre este seudónimo (opcional)"
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
              Esta acción eliminará permanentemente el seudónimo "{selectedPenName?.name}" 
              {getBookCount(selectedPenName?.id || 0) > 0 && 
                ` y todos sus libros asociados (${getBookCount(selectedPenName?.id || 0)})`}.
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

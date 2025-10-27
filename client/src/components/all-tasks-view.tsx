import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoreHorizontal, Trash2, ListTodo, Filter, AlertCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";

interface TaskWithManuscript {
  id: number;
  manuscriptId: number;
  description: string;
  priority: number;
  completed: number;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  manuscriptTitle: string;
  manuscriptAuthor: string;
}

const priorityLabels = {
  1: { label: "Alta", variant: "destructive" as const },
  2: { label: "Media", variant: "secondary" as const },
  3: { label: "Baja", variant: "outline" as const },
};

export function AllTasksView() {
  const { toast } = useToast();
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: allTasks = [], isLoading } = useQuery<TaskWithManuscript[]>({
    queryKey: ["/api/tasks"],
  });

  // Función para determinar el estado de urgencia de una tarea
  const getTaskUrgency = (task: TaskWithManuscript) => {
    if (!task.dueDate || task.completed === 1) return null;
    
    const dueDate = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    
    const daysUntilDue = differenceInDays(dueDate, today);
    
    if (daysUntilDue < 0) return "overdue"; // Vencida
    if (daysUntilDue === 0) return "today"; // Vence hoy
    if (daysUntilDue <= 3) return "soon"; // Vence pronto
    return "upcoming"; // Próxima
  };

  const toggleTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return await apiRequest("POST", `/api/tasks/${taskId}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la tarea",
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return await apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Tarea eliminada",
        description: "La tarea se eliminó correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la tarea",
        variant: "destructive",
      });
    },
  });

  // Filtrar tareas
  const filteredTasks = allTasks.filter((task) => {
    if (priorityFilter !== "all" && task.priority !== parseInt(priorityFilter)) {
      return false;
    }
    if (statusFilter === "pending" && task.completed === 1) {
      return false;
    }
    if (statusFilter === "completed" && task.completed === 0) {
      return false;
    }
    return true;
  });

  // Ordenar tareas: pendientes primero, luego por prioridad
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed - b.completed;
    }
    return a.priority - b.priority;
  });

  const completedCount = filteredTasks.filter((t) => t.completed === 1).length;
  const totalCount = filteredTasks.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Cargando tareas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="flex items-center gap-2">
                <ListTodo className="h-5 w-5" />
                Todas las Tareas Pendientes
              </CardTitle>
              <CardDescription>
                {totalCount > 0
                  ? `${completedCount} de ${totalCount} tareas completadas`
                  : "No hay tareas registradas"}
              </CardDescription>
            </div>
            
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" data-testid="option-status-all">Todas</SelectItem>
                    <SelectItem value="pending" data-testid="option-status-pending">Pendientes</SelectItem>
                    <SelectItem value="completed" data-testid="option-status-completed">Completadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-priority-filter">
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="option-priority-all">Todas</SelectItem>
                  <SelectItem value="1" data-testid="option-priority-high">Alta</SelectItem>
                  <SelectItem value="2" data-testid="option-priority-medium">Media</SelectItem>
                  <SelectItem value="3" data-testid="option-priority-low">Baja</SelectItem>
                </SelectContent>
              </Select>

              {(priorityFilter !== "all" || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPriorityFilter("all");
                    setStatusFilter("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  Limpiar filtros
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {sortedTasks.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              {allTasks.length === 0
                ? "No hay tareas registradas. Crea tareas desde la vista 'Por Manuscrito'."
                : "No hay tareas que coincidan con los filtros seleccionados."}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedTasks.map((task) => {
                const urgency = getTaskUrgency(task);
                
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 rounded-md border hover-elevate"
                    data-testid={`task-item-${task.id}`}
                  >
                    <Checkbox
                      checked={task.completed === 1}
                      onCheckedChange={() => toggleTaskMutation.mutate(task.id)}
                      className="mt-0.5"
                      data-testid={`checkbox-task-${task.id}`}
                    />
                    
                    <div className="flex-1 min-w-0 space-y-1">
                      <p
                        className={`text-sm ${
                          task.completed === 1
                            ? "line-through text-muted-foreground"
                            : ""
                        }`}
                        data-testid={`text-task-description-${task.id}`}
                      >
                        {task.description}
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span data-testid={`text-manuscript-title-${task.id}`}>
                          📖 {task.manuscriptTitle}
                        </span>
                        <span className="text-muted-foreground/50">•</span>
                        <span data-testid={`text-manuscript-author-${task.id}`}>
                          ✍️ {task.manuscriptAuthor}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <Badge
                        variant={priorityLabels[task.priority as 1 | 2 | 3].variant}
                        data-testid={`badge-priority-${task.id}`}
                      >
                        {priorityLabels[task.priority as 1 | 2 | 3].label}
                      </Badge>
                      
                      {task.dueDate && (
                        <Badge
                          variant={
                            urgency === "overdue"
                              ? "destructive"
                              : urgency === "today"
                              ? "destructive"
                              : urgency === "soon"
                              ? "default"
                              : "outline"
                          }
                          className="text-xs flex items-center gap-1"
                          data-testid={`badge-due-date-${task.id}`}
                        >
                          {urgency === "overdue" ? (
                            <AlertCircle className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {format(new Date(task.dueDate), "dd/MM/yy")}
                          {urgency === "overdue" && " (vencida)"}
                          {urgency === "today" && " (hoy)"}
                        </Badge>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          data-testid={`button-task-menu-${task.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => deleteTaskMutation.mutate(task.id)}
                          className="text-destructive"
                          data-testid={`button-delete-task-${task.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

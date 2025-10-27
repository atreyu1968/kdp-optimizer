import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Trash2, Loader2, CheckCircle2, Circle, CalendarIcon, AlertCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, isBefore, isToday, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import type { Task, Publication } from "@shared/schema";

interface TaskChecklistProps {
  manuscriptId: number;
  manuscriptTitle: string;
}

const PRIORITY_LABELS = {
  1: { label: "Alta", variant: "destructive" as const },
  2: { label: "Media", variant: "default" as const },
  3: { label: "Baja", variant: "secondary" as const },
};

export function TaskChecklist({ manuscriptId, manuscriptTitle }: TaskChecklistProps) {
  const { toast } = useToast();
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<number>(2);
  const [newTaskDueDate, setNewTaskDueDate] = useState<Date | undefined>();
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskDescription, setEditTaskDescription] = useState("");
  const [editTaskPriority, setEditTaskPriority] = useState<number>(2);
  const [editTaskDueDate, setEditTaskDueDate] = useState<Date | undefined>();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", "manuscript", manuscriptId],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/manuscript/${manuscriptId}`);
      if (!response.ok) throw new Error("Failed to fetch tasks");
      return response.json();
    },
  });

  const { data: publications = [] } = useQuery<Publication[]>({
    queryKey: ["/api/publications", "manuscript", manuscriptId],
    queryFn: async () => {
      const response = await fetch(`/api/publications/manuscript/${manuscriptId}`);
      if (!response.ok) throw new Error("Failed to fetch publications");
      return response.json();
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: { description: string; priority: number; dueDate?: Date }) => {
      return await apiRequest("POST", "/api/tasks", {
        manuscriptId,
        description: data.description,
        priority: data.priority,
        completed: 0,
        dueDate: data.dueDate || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", "manuscript", manuscriptId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setNewTaskDescription("");
      setNewTaskPriority(2);
      setNewTaskDueDate(undefined);
      setIsAddingTask(false);
      toast({
        title: "Tarea creada",
        description: "La tarea se ha añadido correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la tarea",
        variant: "destructive",
      });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return await apiRequest("POST", `/api/tasks/${taskId}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", "manuscript", manuscriptId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la tarea",
        variant: "destructive",
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (data: { id: number; description?: string; priority?: number; dueDate?: Date | null }) => {
      const { id, ...updates } = data;
      return await apiRequest("PUT", `/api/tasks/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", "manuscript", manuscriptId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditingTaskId(null);
      toast({
        title: "Tarea actualizada",
        description: "Los cambios se han guardado correctamente",
      });
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
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", "manuscript", manuscriptId] });
      toast({
        title: "Tarea eliminada",
        description: "La tarea se ha eliminado correctamente",
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

  const handleCreateTask = () => {
    if (!newTaskDescription.trim()) {
      toast({
        title: "Error",
        description: "La descripción de la tarea no puede estar vacía",
        variant: "destructive",
      });
      return;
    }

    createTaskMutation.mutate({
      description: newTaskDescription.trim(),
      priority: newTaskPriority,
      dueDate: newTaskDueDate,
    });
  };

  const handleEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTaskDescription(task.description);
    setEditTaskPriority(task.priority);
    setEditTaskDueDate(task.dueDate ? new Date(task.dueDate) : undefined);
  };

  const handleUpdateTask = () => {
    if (!editTaskDescription.trim()) {
      toast({
        title: "Error",
        description: "La descripción de la tarea no puede estar vacía",
        variant: "destructive",
      });
      return;
    }

    if (editingTaskId !== null) {
      updateTaskMutation.mutate({
        id: editingTaskId,
        description: editTaskDescription.trim(),
        priority: editTaskPriority,
        dueDate: editTaskDueDate || null,
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditTaskDescription("");
    setEditTaskPriority(2);
    setEditTaskDueDate(undefined);
  };

  // Obtener la fecha de publicación más próxima
  const nextPublicationDate = publications
    .filter((p) => p.scheduledDate && p.status === "scheduled")
    .map((p) => new Date(p.scheduledDate!))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  // Función para determinar el estado de urgencia de una tarea
  const getTaskUrgency = (task: Task) => {
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

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed - b.completed;
    }
    return a.priority - b.priority;
  });

  const completedCount = tasks.filter(t => t.completed === 1).length;
  const totalCount = tasks.length;

  return (
    <Card data-testid="card-task-checklist">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg">Tareas Pendientes</CardTitle>
          <CardDescription>
            {manuscriptTitle} • {completedCount} de {totalCount} completadas
          </CardDescription>
        </div>
        {!isAddingTask && (
          <Button
            size="sm"
            onClick={() => setIsAddingTask(true)}
            data-testid="button-add-task"
          >
            <Plus className="h-4 w-4 mr-1" />
            Añadir
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isAddingTask && (
          <div className="space-y-2 p-3 rounded-md border" data-testid="form-new-task">
            <Input
              placeholder="Descripción de la tarea..."
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCreateTask();
                }
              }}
              data-testid="input-task-description"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={newTaskPriority.toString()}
                onValueChange={(val) => setNewTaskPriority(parseInt(val))}
              >
                <SelectTrigger className="w-32" data-testid="select-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1" data-testid="option-priority-high">Alta</SelectItem>
                  <SelectItem value="2" data-testid="option-priority-medium">Media</SelectItem>
                  <SelectItem value="3" data-testid="option-priority-low">Baja</SelectItem>
                </SelectContent>
              </Select>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={!newTaskDueDate ? "text-muted-foreground" : ""}
                    data-testid="button-select-due-date"
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {newTaskDueDate ? format(newTaskDueDate, "PP", { locale: es }) : "Fecha límite"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newTaskDueDate}
                    onSelect={setNewTaskDueDate}
                    initialFocus
                    locale={es}
                    data-testid="calendar-due-date"
                  />
                  {nextPublicationDate && (
                    <div className="p-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Sugerencia:</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setNewTaskDueDate(nextPublicationDate)}
                        data-testid="button-suggest-publication-date"
                      >
                        Próxima publicación: {format(nextPublicationDate, "PP", { locale: es })}
                      </Button>
                    </div>
                  )}
                  {newTaskDueDate && (
                    <div className="p-3 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setNewTaskDueDate(undefined)}
                        data-testid="button-clear-due-date"
                      >
                        Limpiar fecha
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <Button
                size="sm"
                onClick={handleCreateTask}
                disabled={createTaskMutation.isPending}
                data-testid="button-save-task"
              >
                {createTaskMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Guardar"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsAddingTask(false);
                  setNewTaskDescription("");
                  setNewTaskPriority(2);
                  setNewTaskDueDate(undefined);
                }}
                data-testid="button-cancel-task"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sortedTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-tasks">
            No hay tareas pendientes. ¡Añade la primera!
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTasks.map((task) => {
              const priorityInfo = PRIORITY_LABELS[task.priority as keyof typeof PRIORITY_LABELS] || PRIORITY_LABELS[2];
              const urgency = getTaskUrgency(task);
              
              if (editingTaskId === task.id) {
                return (
                  <div
                    key={task.id}
                    className="space-y-2 p-3 rounded-md border"
                    data-testid={`task-edit-${task.id}`}
                  >
                    <Input
                      placeholder="Descripción de la tarea..."
                      value={editTaskDescription}
                      onChange={(e) => setEditTaskDescription(e.target.value)}
                      data-testid={`input-edit-task-description-${task.id}`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={editTaskPriority.toString()}
                        onValueChange={(val) => setEditTaskPriority(parseInt(val))}
                      >
                        <SelectTrigger className="w-32" data-testid={`select-edit-priority-${task.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1" data-testid="option-edit-priority-high">Alta</SelectItem>
                          <SelectItem value="2" data-testid="option-edit-priority-medium">Media</SelectItem>
                          <SelectItem value="3" data-testid="option-edit-priority-low">Baja</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={!editTaskDueDate ? "text-muted-foreground" : ""}
                            data-testid={`button-edit-due-date-${task.id}`}
                          >
                            <CalendarIcon className="h-4 w-4 mr-2" />
                            {editTaskDueDate ? format(editTaskDueDate, "PP", { locale: es }) : "Fecha límite"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={editTaskDueDate}
                            onSelect={setEditTaskDueDate}
                            initialFocus
                            locale={es}
                            data-testid={`calendar-edit-due-date-${task.id}`}
                          />
                          {editTaskDueDate && (
                            <div className="p-3 border-t">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs"
                                onClick={() => setEditTaskDueDate(undefined)}
                                data-testid={`button-clear-edit-due-date-${task.id}`}
                              >
                                Limpiar fecha
                              </Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>

                      <Button
                        size="sm"
                        onClick={handleUpdateTask}
                        disabled={updateTaskMutation.isPending}
                        data-testid={`button-save-edit-task-${task.id}`}
                      >
                        {updateTaskMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Guardar"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelEdit}
                        data-testid={`button-cancel-edit-task-${task.id}`}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                );
              }

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
                  <div className="flex-1 min-w-0">
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
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant={priorityInfo.variant} className="text-xs">
                        {priorityInfo.label}
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
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        data-testid={`button-task-menu-${task.id}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleEditTask(task)}
                        data-testid={`button-edit-task-${task.id}`}
                      >
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
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
  );
}

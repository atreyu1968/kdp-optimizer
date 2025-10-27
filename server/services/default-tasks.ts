import type { InsertTask, Task } from "@shared/schema";
import { storage } from "../storage";

export interface TaskTemplate {
  description: string;
  priority: 1 | 2 | 3; // 1=Alta, 2=Media, 3=Baja
  daysBeforePublication: number; // Días antes de la fecha de publicación
}

/**
 * Template de tareas estándar para preparar un libro KDP
 * Ordenadas por prioridad y fecha sugerida
 */
export const DEFAULT_TASK_TEMPLATES: TaskTemplate[] = [
  {
    description: "Diseñar portada del libro (3000x1800px mínimo)",
    priority: 1,
    daysBeforePublication: 10,
  },
  {
    description: "Preparar archivo EPUB/MOBI del manuscrito",
    priority: 1,
    daysBeforePublication: 7,
  },
  {
    description: "Última revisión y corrección del manuscrito",
    priority: 1,
    daysBeforePublication: 7,
  },
  {
    description: "Revisar metadatos y descripción optimizada",
    priority: 2,
    daysBeforePublication: 5,
  },
  {
    description: "Configurar precios y royalties en todos los mercados",
    priority: 2,
    daysBeforePublication: 3,
  },
  {
    description: "Revisar vista previa del libro en KDP",
    priority: 1,
    daysBeforePublication: 2,
  },
  {
    description: "Verificar categorías y palabras clave",
    priority: 2,
    daysBeforePublication: 2,
  },
];

/**
 * Crea tareas predeterminadas para un manuscrito
 * @param manuscriptId - ID del manuscrito
 * @param firstPublicationDate - Fecha de la primera publicación programada (opcional)
 * @returns Array de tareas para insertar
 */
export function createDefaultTasks(
  manuscriptId: number,
  firstPublicationDate?: Date
): Omit<InsertTask, "id" | "createdAt" | "updatedAt">[] {
  return DEFAULT_TASK_TEMPLATES.map((template) => {
    let dueDate: Date | null = null;
    
    if (firstPublicationDate) {
      dueDate = new Date(firstPublicationDate);
      dueDate.setDate(dueDate.getDate() - template.daysBeforePublication);
      
      // Si la fecha límite ya pasó, establecerla para mañana
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      if (dueDate < tomorrow) {
        dueDate = tomorrow;
      }
    }
    
    return {
      manuscriptId,
      description: template.description,
      priority: template.priority,
      dueDate,
      completed: 0,
    };
  });
}

/**
 * Actualiza las fechas límite de las tareas de un manuscrito basándose en la primera publicación
 * @param manuscriptId - ID del manuscrito
 * @param firstPublicationDate - Fecha de la primera publicación programada
 */
export async function updateTaskDueDates(
  manuscriptId: number,
  firstPublicationDate: Date
): Promise<void> {
  const tasks = await storage.getTasksByManuscript(manuscriptId);
  
  // Encontrar el template correspondiente para cada tarea y actualizar su fecha límite
  for (const task of tasks) {
    // Si la tarea ya tiene una fecha límite personalizada por el usuario, no la sobrescribimos
    if (task.dueDate) {
      continue;
    }
    
    // Buscar el template que coincida con la descripción de la tarea
    const template = DEFAULT_TASK_TEMPLATES.find(
      t => t.description === task.description
    );
    
    if (template) {
      const dueDate = new Date(firstPublicationDate);
      dueDate.setDate(dueDate.getDate() - template.daysBeforePublication);
      
      // Si la fecha límite ya pasó, establecerla para mañana
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const finalDueDate = dueDate < tomorrow ? tomorrow : dueDate;
      
      await storage.updateTask(task.id, { dueDate: finalDueDate });
    }
  }
}

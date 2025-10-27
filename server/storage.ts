import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { 
  manuscripts, 
  optimizations,
  publications,
  tasks,
  blockedDates,
  type Manuscript, 
  type Optimization,
  type Publication,
  type Task,
  type BlockedDate,
  type InsertManuscript,
  type InsertPublication,
  type InsertTask,
  type InsertBlockedDate,
  type OptimizationResult,
  type MarketMetadata,
  amazonMarkets,
} from "@shared/schema";

export interface TaskWithManuscript extends Task {
  manuscriptTitle: string;
  manuscriptAuthor: string;
}

export interface IStorage {
  getOptimization(id: string): Promise<OptimizationResult | undefined>;
  getAllOptimizations(): Promise<OptimizationResult[]>;
  saveManuscript(data: InsertManuscript): Promise<Manuscript>;
  getManuscript(id: number): Promise<Manuscript | undefined>;
  getAllManuscripts(): Promise<Manuscript[]>;
  saveOptimizationWithManuscript(
    manuscriptData: InsertManuscript, 
    optimizationId: string,
    targetMarkets: string[],
    seedKeywords: string[],
    marketResults: MarketMetadata[],
    existingManuscriptId?: number
  ): Promise<{ manuscript: Manuscript; optimization: Optimization }>;
  getOptimizationsByManuscriptId(manuscriptId: number): Promise<Optimization[]>;
  
  // Publication management
  getAllPublications(): Promise<Publication[]>;
  getPublicationsByManuscript(manuscriptId: number): Promise<Publication[]>;
  createPublication(data: InsertPublication): Promise<Publication>;
  updatePublication(id: number, data: Partial<InsertPublication>): Promise<Publication>;
  markAsPublished(id: number, publishedDate: Date, kdpUrl?: string): Promise<Publication>;
  getPublicationsByDateRange(start: Date, end: Date): Promise<Publication[]>;
  deletePublication(id: number): Promise<void>;
  
  // Task management
  getAllTasks(): Promise<Task[]>;
  getAllTasksWithManuscriptInfo(): Promise<TaskWithManuscript[]>;
  getTasksByManuscript(manuscriptId: number): Promise<Task[]>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask>): Promise<Task>;
  toggleTaskCompleted(id: number): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  
  // Blocked dates management
  getAllBlockedDates(): Promise<BlockedDate[]>;
  getBlockedDatesByRange(start: Date, end: Date): Promise<BlockedDate[]>;
  isDateBlocked(date: Date): Promise<boolean>;
  createBlockedDate(data: InsertBlockedDate): Promise<BlockedDate>;
  deleteBlockedDate(id: number): Promise<void>;
  reschedulePublicationsFromBlockedDate(blockedDate: Date): Promise<Publication[]>;
}

export class DbStorage implements IStorage {
  private db;

  constructor() {
    const sql = neon(process.env.DATABASE_URL!);
    this.db = drizzle(sql);
  }

  async saveManuscript(data: InsertManuscript): Promise<Manuscript> {
    const [manuscript] = await this.db.insert(manuscripts).values(data).returning();
    return manuscript;
  }

  async getManuscript(id: number): Promise<Manuscript | undefined> {
    const [manuscript] = await this.db.select().from(manuscripts).where(eq(manuscripts.id, id));
    return manuscript;
  }

  async getAllManuscripts(): Promise<Manuscript[]> {
    return await this.db.select().from(manuscripts).orderBy(desc(manuscripts.createdAt));
  }

  async getOptimization(id: string): Promise<OptimizationResult | undefined> {
    const result = await this.db
      .select({
        optimization: optimizations,
        manuscript: manuscripts,
      })
      .from(optimizations)
      .innerJoin(manuscripts, eq(optimizations.manuscriptId, manuscripts.id))
      .where(eq(optimizations.id, id));
    
    if (result.length === 0) return undefined;

    const { optimization, manuscript } = result[0];

    return {
      id: optimization.id,
      originalTitle: manuscript.originalTitle,
      author: manuscript.author,
      manuscriptWordCount: manuscript.wordCount,
      seedKeywords: optimization.seedKeywords,
      marketResults: optimization.marketResults as MarketMetadata[],
      createdAt: optimization.createdAt.toISOString(),
      seriesName: manuscript.seriesName ?? undefined,
      seriesNumber: manuscript.seriesNumber ?? undefined,
    };
  }

  async getAllOptimizations(): Promise<OptimizationResult[]> {
    const results = await this.db
      .select({
        optimization: optimizations,
        manuscript: manuscripts,
      })
      .from(optimizations)
      .innerJoin(manuscripts, eq(optimizations.manuscriptId, manuscripts.id))
      .orderBy(desc(optimizations.createdAt));
    
    return results.map(({ optimization, manuscript }) => ({
      id: optimization.id,
      originalTitle: manuscript.originalTitle,
      author: manuscript.author,
      manuscriptWordCount: manuscript.wordCount,
      seedKeywords: optimization.seedKeywords,
      marketResults: optimization.marketResults as MarketMetadata[],
      createdAt: optimization.createdAt.toISOString(),
      seriesName: manuscript.seriesName ?? undefined,
      seriesNumber: manuscript.seriesNumber ?? undefined,
    }));
  }

  async getOptimizationsByManuscriptId(manuscriptId: number): Promise<Optimization[]> {
    return await this.db.select().from(optimizations).where(eq(optimizations.manuscriptId, manuscriptId)).orderBy(desc(optimizations.createdAt));
  }

  // Publication methods
  async getAllPublications(): Promise<Publication[]> {
    return await this.db.select().from(publications).orderBy(desc(publications.createdAt));
  }

  async getPublicationsByManuscript(manuscriptId: number): Promise<Publication[]> {
    return await this.db
      .select()
      .from(publications)
      .where(eq(publications.manuscriptId, manuscriptId))
      .orderBy(desc(publications.scheduledDate));
  }

  async createPublication(data: InsertPublication): Promise<Publication> {
    const [publication] = await this.db.insert(publications).values(data).returning();
    return publication;
  }

  async updatePublication(id: number, data: Partial<InsertPublication>): Promise<Publication> {
    const [publication] = await this.db
      .update(publications)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(publications.id, id))
      .returning();
    return publication;
  }

  async markAsPublished(id: number, publishedDate: Date, kdpUrl?: string): Promise<Publication> {
    const updateData: any = {
      status: "published",
      publishedDate,
      updatedAt: new Date(),
    };
    if (kdpUrl) {
      updateData.kdpUrl = kdpUrl;
    }
    const [publication] = await this.db
      .update(publications)
      .set(updateData)
      .where(eq(publications.id, id))
      .returning();
    return publication;
  }

  async getPublicationsByDateRange(start: Date, end: Date): Promise<Publication[]> {
    return await this.db
      .select()
      .from(publications)
      .where(
        and(
          gte(publications.scheduledDate, start),
          lte(publications.scheduledDate, end)
        )
      )
      .orderBy(publications.scheduledDate);
  }

  async deletePublication(id: number): Promise<void> {
    await this.db.delete(publications).where(eq(publications.id, id));
  }

  // Task methods
  async getAllTasks(): Promise<Task[]> {
    return await this.db.select().from(tasks).orderBy(tasks.priority, desc(tasks.createdAt));
  }

  async getAllTasksWithManuscriptInfo(): Promise<TaskWithManuscript[]> {
    const results = await this.db
      .select({
        task: tasks,
        manuscript: manuscripts,
      })
      .from(tasks)
      .innerJoin(manuscripts, eq(tasks.manuscriptId, manuscripts.id))
      .orderBy(tasks.completed, tasks.priority, desc(tasks.createdAt));

    return results.map(({ task, manuscript }) => ({
      ...task,
      manuscriptTitle: manuscript.originalTitle,
      manuscriptAuthor: manuscript.author,
    }));
  }

  async getTasksByManuscript(manuscriptId: number): Promise<Task[]> {
    return await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.manuscriptId, manuscriptId))
      .orderBy(tasks.priority, desc(tasks.createdAt));
  }

  async createTask(data: InsertTask): Promise<Task> {
    const [task] = await this.db.insert(tasks).values(data).returning();
    return task;
  }

  async updateTask(id: number, data: Partial<InsertTask>): Promise<Task> {
    const [task] = await this.db
      .update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async toggleTaskCompleted(id: number): Promise<Task> {
    const [currentTask] = await this.db.select().from(tasks).where(eq(tasks.id, id));
    if (!currentTask) {
      throw new Error(`Task with ID ${id} not found`);
    }
    const newCompleted = currentTask.completed === 1 ? 0 : 1;
    const [task] = await this.db
      .update(tasks)
      .set({ completed: newCompleted, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async deleteTask(id: number): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id));
  }

  // Blocked dates management
  async getAllBlockedDates(): Promise<BlockedDate[]> {
    return await this.db.select().from(blockedDates).orderBy(blockedDates.date);
  }

  async getBlockedDatesByRange(start: Date, end: Date): Promise<BlockedDate[]> {
    return await this.db
      .select()
      .from(blockedDates)
      .where(and(gte(blockedDates.date, start), lte(blockedDates.date, end)))
      .orderBy(blockedDates.date);
  }

  async isDateBlocked(date: Date): Promise<boolean> {
    // Normalizar la fecha a las 00:00:00 para comparar solo el día
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    
    const startOfDay = normalizedDate;
    const endOfDay = new Date(normalizedDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const blocked = await this.db
      .select()
      .from(blockedDates)
      .where(and(gte(blockedDates.date, startOfDay), lte(blockedDates.date, endOfDay)))
      .limit(1);
    
    return blocked.length > 0;
  }

  async createBlockedDate(data: InsertBlockedDate): Promise<BlockedDate> {
    // Normalizar la fecha a las 00:00:00
    const normalizedDate = new Date(data.date);
    normalizedDate.setHours(0, 0, 0, 0);
    
    const [blockedDate] = await this.db
      .insert(blockedDates)
      .values({ ...data, date: normalizedDate })
      .returning();
    
    return blockedDate;
  }

  async deleteBlockedDate(id: number): Promise<void> {
    await this.db.delete(blockedDates).where(eq(blockedDates.id, id));
  }

  async reschedulePublicationsFromBlockedDate(blockedDate: Date): Promise<Publication[]> {
    // Normalizar la fecha
    const normalizedDate = new Date(blockedDate);
    normalizedDate.setHours(0, 0, 0, 0);
    
    const startOfDay = normalizedDate;
    const endOfDay = new Date(normalizedDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Obtener todas las publicaciones programadas para ese día
    const publicationsToReschedule = await this.db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.status, 'scheduled'),
          gte(publications.scheduledDate, startOfDay),
          lte(publications.scheduledDate, endOfDay)
        )
      );
    
    if (publicationsToReschedule.length === 0) {
      return [];
    }
    
    // Encontrar el próximo día disponible
    const rescheduledPubs: Publication[] = [];
    for (const pub of publicationsToReschedule) {
      let nextDate = new Date(normalizedDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      // Buscar el próximo día no bloqueado con menos de 3 publicaciones
      let attempts = 0;
      while (attempts < 365) { // Límite de seguridad
        const isBlocked = await this.isDateBlocked(nextDate);
        
        if (!isBlocked) {
          // Verificar cuántas publicaciones hay ese día
          const startOfNextDay = new Date(nextDate);
          startOfNextDay.setHours(0, 0, 0, 0);
          const endOfNextDay = new Date(nextDate);
          endOfNextDay.setHours(23, 59, 59, 999);
          
          const pubsOnDay = await this.db
            .select()
            .from(publications)
            .where(
              and(
                eq(publications.status, 'scheduled'),
                gte(publications.scheduledDate, startOfNextDay),
                lte(publications.scheduledDate, endOfNextDay)
              )
            );
          
          if (pubsOnDay.length < 3) {
            // Día disponible encontrado
            const [updated] = await this.db
              .update(publications)
              .set({ 
                scheduledDate: nextDate,
                updatedAt: new Date()
              })
              .where(eq(publications.id, pub.id))
              .returning();
            
            rescheduledPubs.push(updated);
            break;
          }
        }
        
        nextDate.setDate(nextDate.getDate() + 1);
        attempts++;
      }
    }
    
    return rescheduledPubs;
  }

  async saveOptimizationWithManuscript(
    manuscriptData: InsertManuscript,
    optimizationId: string,
    targetMarkets: string[],
    seedKeywords: string[],
    marketResults: MarketMetadata[],
    existingManuscriptId?: number
  ): Promise<{ manuscript: Manuscript; optimization: Optimization }> {
    let manuscript: Manuscript;
    
    if (existingManuscriptId) {
      const existing = await this.getManuscript(existingManuscriptId);
      if (!existing) {
        throw new Error(`Manuscript with ID ${existingManuscriptId} not found`);
      }
      manuscript = existing;
    } else {
      const [newManuscript] = await this.db.insert(manuscripts).values(manuscriptData).returning();
      manuscript = newManuscript;
    }
    
    const [optimization] = await this.db.insert(optimizations).values({
      id: optimizationId,
      manuscriptId: manuscript.id,
      targetMarkets,
      seedKeywords,
      marketResults: marketResults as any,
    }).returning();

    return { manuscript, optimization };
  }
}

export class MemStorage implements IStorage {
  private optimizations: Map<string, OptimizationResult>;

  constructor() {
    this.optimizations = new Map();
  }

  async getOptimization(id: string): Promise<OptimizationResult | undefined> {
    return this.optimizations.get(id);
  }

  async getAllOptimizations(): Promise<OptimizationResult[]> {
    return Array.from(this.optimizations.values());
  }

  async saveManuscript(data: InsertManuscript): Promise<Manuscript> {
    throw new Error("MemStorage does not support manuscript operations");
  }

  async getManuscript(id: number): Promise<Manuscript | undefined> {
    throw new Error("MemStorage does not support manuscript operations");
  }

  async getAllManuscripts(): Promise<Manuscript[]> {
    throw new Error("MemStorage does not support manuscript operations");
  }

  async saveOptimizationWithManuscript(): Promise<{ manuscript: Manuscript; optimization: Optimization }> {
    throw new Error("MemStorage does not support manuscript operations");
  }

  async getOptimizationsByManuscriptId(manuscriptId: number): Promise<Optimization[]> {
    throw new Error("MemStorage does not support manuscript operations");
  }

  async getAllPublications(): Promise<Publication[]> {
    throw new Error("MemStorage does not support publication operations");
  }

  async getPublicationsByManuscript(manuscriptId: number): Promise<Publication[]> {
    throw new Error("MemStorage does not support publication operations");
  }

  async createPublication(data: InsertPublication): Promise<Publication> {
    throw new Error("MemStorage does not support publication operations");
  }

  async updatePublication(id: number, data: Partial<InsertPublication>): Promise<Publication> {
    throw new Error("MemStorage does not support publication operations");
  }

  async markAsPublished(id: number, publishedDate: Date, kdpUrl?: string): Promise<Publication> {
    throw new Error("MemStorage does not support publication operations");
  }

  async getPublicationsByDateRange(start: Date, end: Date): Promise<Publication[]> {
    throw new Error("MemStorage does not support publication operations");
  }

  async deletePublication(id: number): Promise<void> {
    throw new Error("MemStorage does not support publication operations");
  }

  async getAllTasks(): Promise<Task[]> {
    throw new Error("MemStorage does not support task operations");
  }

  async getAllTasksWithManuscriptInfo(): Promise<TaskWithManuscript[]> {
    throw new Error("MemStorage does not support task operations");
  }

  async getTasksByManuscript(manuscriptId: number): Promise<Task[]> {
    throw new Error("MemStorage does not support task operations");
  }

  async createTask(data: InsertTask): Promise<Task> {
    throw new Error("MemStorage does not support task operations");
  }

  async updateTask(id: number, data: Partial<InsertTask>): Promise<Task> {
    throw new Error("MemStorage does not support task operations");
  }

  async toggleTaskCompleted(id: number): Promise<Task> {
    throw new Error("MemStorage does not support task operations");
  }

  async deleteTask(id: number): Promise<void> {
    throw new Error("MemStorage does not support task operations");
  }

  async getAllBlockedDates(): Promise<BlockedDate[]> {
    throw new Error("MemStorage does not support blocked dates operations");
  }

  async getBlockedDatesByRange(start: Date, end: Date): Promise<BlockedDate[]> {
    throw new Error("MemStorage does not support blocked dates operations");
  }

  async isDateBlocked(date: Date): Promise<boolean> {
    throw new Error("MemStorage does not support blocked dates operations");
  }

  async createBlockedDate(data: InsertBlockedDate): Promise<BlockedDate> {
    throw new Error("MemStorage does not support blocked dates operations");
  }

  async deleteBlockedDate(id: number): Promise<void> {
    throw new Error("MemStorage does not support blocked dates operations");
  }

  async reschedulePublicationsFromBlockedDate(blockedDate: Date): Promise<Publication[]> {
    throw new Error("MemStorage does not support blocked dates operations");
  }
}

export const storage = new DbStorage();

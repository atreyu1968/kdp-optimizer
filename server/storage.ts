import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { 
  manuscripts, 
  optimizations,
  publications,
  tasks,
  type Manuscript, 
  type Optimization,
  type Publication,
  type Task,
  type InsertManuscript,
  type InsertPublication,
  type InsertTask,
  type OptimizationResult,
  type MarketMetadata,
  amazonMarkets,
} from "@shared/schema";

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
  getTasksByManuscript(manuscriptId: number): Promise<Task[]>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask>): Promise<Task>;
  toggleTaskCompleted(id: number): Promise<Task>;
  deleteTask(id: number): Promise<void>;
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
}

export const storage = new DbStorage();

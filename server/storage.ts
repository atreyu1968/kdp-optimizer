import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { 
  manuscripts, 
  optimizations,
  publications,
  tasks,
  blockedDates,
  penNames,
  bookSeries,
  auraBooks,
  kdpSales,
  auraBookInsights,
  kenpMonthlyData,
  type Manuscript, 
  type Optimization,
  type Publication,
  type Task,
  type BlockedDate,
  type PenName,
  type BookSeries,
  type AuraBook,
  type KdpSale,
  type BookInsight,
  type KenpMonthlyData,
  type InsertManuscript,
  type InsertPublication,
  type InsertTask,
  type InsertBlockedDate,
  type InsertPenName,
  type InsertBookSeries,
  type InsertAuraBook,
  type InsertKdpSale,
  type InsertBookInsight,
  type InsertKenpMonthlyData,
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
  
  // ============================================================================
  // AURA SYSTEM - Pen Names, Books, Series, and KDP Sales
  // ============================================================================
  
  // Pen Names (Seudónimos)
  getAllPenNames(): Promise<PenName[]>;
  getPenName(id: number): Promise<PenName | undefined>;
  createPenName(data: InsertPenName): Promise<PenName>;
  updatePenName(id: number, data: Partial<InsertPenName>): Promise<PenName>;
  deletePenName(id: number): Promise<void>;
  
  // Book Series
  getAllBookSeries(): Promise<BookSeries[]>;
  getBookSeriesByPenName(penNameId: number): Promise<BookSeries[]>;
  getBookSeries(id: number): Promise<BookSeries | undefined>;
  createBookSeries(data: InsertBookSeries): Promise<BookSeries>;
  updateBookSeries(id: number, data: Partial<InsertBookSeries>): Promise<BookSeries>;
  deleteBookSeries(id: number): Promise<void>;
  
  // Aura Books
  getAllAuraBooks(): Promise<AuraBook[]>;
  getAuraBooksByPenName(penNameId: number): Promise<AuraBook[]>;
  getAuraBooksBySeries(seriesId: number): Promise<AuraBook[]>;
  getAuraBook(id: number): Promise<AuraBook | undefined>;
  getAuraBookByAsin(asin: string): Promise<AuraBook | undefined>;
  createAuraBook(data: InsertAuraBook): Promise<AuraBook>;
  updateAuraBook(id: number, data: Partial<InsertAuraBook>): Promise<AuraBook>;
  deleteAuraBook(id: number): Promise<void>;
  
  // KDP Sales
  getAllKdpSales(): Promise<KdpSale[]>;
  getKdpSalesByPenName(penNameId: number): Promise<KdpSale[]>;
  getKdpSalesByBook(bookId: number): Promise<KdpSale[]>;
  getKdpSalesByDateRange(start: Date, end: Date): Promise<KdpSale[]>;
  createKdpSale(data: InsertKdpSale): Promise<KdpSale>;
  bulkCreateKdpSales(data: InsertKdpSale[]): Promise<KdpSale[]>;
  deleteKdpSalesByBatchId(batchId: string): Promise<void>;
  
  // Book Insights (AI Analysis)
  getAllBookInsights(): Promise<BookInsight[]>;
  getBookInsight(bookId: number): Promise<BookInsight | undefined>;
  createOrUpdateBookInsight(data: InsertBookInsight): Promise<BookInsight>;
  deleteBookInsight(bookId: number): Promise<void>;
  markInsightsAsStale(): Promise<void>;
  
  // KENP Monthly Data (Aura Unlimited)
  getAllKenpMonthlyData(): Promise<KenpMonthlyData[]>;
  getKenpMonthlyDataByBook(bookId: number): Promise<KenpMonthlyData[]>;
  getKenpMonthlyDataByAsin(asin: string): Promise<KenpMonthlyData[]>;
  createKenpMonthlyData(data: InsertKenpMonthlyData): Promise<KenpMonthlyData>;
  deleteAllKenpMonthlyData(): Promise<void>;
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

  // ============================================================================
  // AURA SYSTEM - Implementation
  // ============================================================================

  // Pen Names (Seudónimos)
  async getAllPenNames(): Promise<PenName[]> {
    return await this.db.select().from(penNames).orderBy(desc(penNames.createdAt));
  }

  async getPenName(id: number): Promise<PenName | undefined> {
    const [penName] = await this.db.select().from(penNames).where(eq(penNames.id, id));
    return penName;
  }

  async createPenName(data: InsertPenName): Promise<PenName> {
    const [penName] = await this.db.insert(penNames).values(data).returning();
    return penName;
  }

  async updatePenName(id: number, data: Partial<InsertPenName>): Promise<PenName> {
    const [penName] = await this.db
      .update(penNames)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(penNames.id, id))
      .returning();
    return penName;
  }

  async deletePenName(id: number): Promise<void> {
    // Verificar si hay libros asociados
    const booksCount = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(auraBooks)
      .where(eq(auraBooks.penNameId, id));
    
    const books = Number(booksCount[0]?.count || 0);
    
    // Verificar si hay ventas asociadas
    const salesCount = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(kdpSales)
      .where(eq(kdpSales.penNameId, id));
    
    const sales = Number(salesCount[0]?.count || 0);
    
    // Verificar si hay series asociadas
    const seriesCount = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(bookSeries)
      .where(eq(bookSeries.penNameId, id));
    
    const series = Number(seriesCount[0]?.count || 0);
    
    if (books > 0 || sales > 0 || series > 0) {
      const details = [];
      if (books > 0) details.push(`${books} libro${books > 1 ? 's' : ''}`);
      if (series > 0) details.push(`${series} serie${series > 1 ? 's' : ''}`);
      if (sales > 0) details.push(`${sales} venta${sales > 1 ? 's' : ''}`);
      
      throw new Error(
        `No se puede eliminar el seudónimo porque tiene datos asociados: ${details.join(', ')}. ` +
        `Primero elimine o reasigne estos elementos.`
      );
    }
    
    await this.db.delete(penNames).where(eq(penNames.id, id));
  }

  // Book Series
  async getAllBookSeries(): Promise<BookSeries[]> {
    return await this.db.select().from(bookSeries).orderBy(desc(bookSeries.createdAt));
  }

  async getBookSeriesByPenName(penNameId: number): Promise<BookSeries[]> {
    return await this.db
      .select()
      .from(bookSeries)
      .where(eq(bookSeries.penNameId, penNameId))
      .orderBy(desc(bookSeries.createdAt));
  }

  async getBookSeries(id: number): Promise<BookSeries | undefined> {
    const [series] = await this.db.select().from(bookSeries).where(eq(bookSeries.id, id));
    return series;
  }

  async createBookSeries(data: InsertBookSeries): Promise<BookSeries> {
    const [series] = await this.db.insert(bookSeries).values(data).returning();
    return series;
  }

  async updateBookSeries(id: number, data: Partial<InsertBookSeries>): Promise<BookSeries> {
    const [series] = await this.db
      .update(bookSeries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(bookSeries.id, id))
      .returning();
    return series;
  }

  async deleteBookSeries(id: number): Promise<void> {
    await this.db.delete(bookSeries).where(eq(bookSeries.id, id));
  }

  // Aura Books
  async getAllAuraBooks(): Promise<AuraBook[]> {
    return await this.db.select().from(auraBooks).orderBy(desc(auraBooks.createdAt));
  }

  async getAuraBooksByPenName(penNameId: number): Promise<AuraBook[]> {
    return await this.db
      .select()
      .from(auraBooks)
      .where(eq(auraBooks.penNameId, penNameId))
      .orderBy(desc(auraBooks.createdAt));
  }

  async getAuraBooksBySeries(seriesId: number): Promise<AuraBook[]> {
    return await this.db
      .select()
      .from(auraBooks)
      .where(eq(auraBooks.seriesId, seriesId))
      .orderBy(desc(auraBooks.createdAt));
  }

  async getAuraBook(id: number): Promise<AuraBook | undefined> {
    const [book] = await this.db.select().from(auraBooks).where(eq(auraBooks.id, id));
    return book;
  }

  async getAuraBookByAsin(asin: string): Promise<AuraBook | undefined> {
    const [book] = await this.db.select().from(auraBooks).where(eq(auraBooks.asin, asin));
    return book;
  }

  async createAuraBook(data: InsertAuraBook): Promise<AuraBook> {
    const [book] = await this.db.insert(auraBooks).values(data).returning();
    return book;
  }

  async updateAuraBook(id: number, data: Partial<InsertAuraBook>): Promise<AuraBook> {
    const [book] = await this.db
      .update(auraBooks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(auraBooks.id, id))
      .returning();
    return book;
  }

  async deleteAuraBook(id: number): Promise<void> {
    await this.db.delete(auraBooks).where(eq(auraBooks.id, id));
  }

  // KDP Sales
  async getAllKdpSales(): Promise<KdpSale[]> {
    return await this.db.select().from(kdpSales).orderBy(desc(kdpSales.saleDate));
  }

  async getKdpSalesByPenName(penNameId: number): Promise<KdpSale[]> {
    return await this.db
      .select()
      .from(kdpSales)
      .where(eq(kdpSales.penNameId, penNameId))
      .orderBy(desc(kdpSales.saleDate));
  }

  async getKdpSalesByBook(bookId: number): Promise<KdpSale[]> {
    return await this.db
      .select()
      .from(kdpSales)
      .where(eq(kdpSales.bookId, bookId))
      .orderBy(desc(kdpSales.saleDate));
  }

  async getKdpSalesByDateRange(start: Date, end: Date): Promise<KdpSale[]> {
    return await this.db
      .select()
      .from(kdpSales)
      .where(and(gte(kdpSales.saleDate, start), lte(kdpSales.saleDate, end)))
      .orderBy(kdpSales.saleDate);
  }

  async createKdpSale(data: InsertKdpSale): Promise<KdpSale> {
    const [sale] = await this.db.insert(kdpSales).values(data).returning();
    return sale;
  }

  async bulkCreateKdpSales(data: InsertKdpSale[]): Promise<KdpSale[]> {
    const sales = await this.db.insert(kdpSales).values(data).returning();
    return sales;
  }

  async deleteKdpSalesByBatchId(batchId: string): Promise<void> {
    await this.db.delete(kdpSales).where(eq(kdpSales.importBatchId, batchId));
  }

  // Book Insights (AI Analysis)
  async getAllBookInsights(): Promise<BookInsight[]> {
    return await this.db.select().from(auraBookInsights).orderBy(desc(auraBookInsights.analyzedAt));
  }

  async getBookInsight(bookId: number): Promise<BookInsight | undefined> {
    const [insight] = await this.db.select().from(auraBookInsights).where(eq(auraBookInsights.bookId, bookId));
    return insight;
  }

  async createOrUpdateBookInsight(data: InsertBookInsight): Promise<BookInsight> {
    // Primero intentamos actualizar si existe
    const existing = await this.getBookInsight(data.bookId);
    
    if (existing) {
      const [updated] = await this.db
        .update(auraBookInsights)
        .set({ ...data, analyzedAt: new Date() })
        .where(eq(auraBookInsights.bookId, data.bookId))
        .returning();
      return updated;
    }
    
    // Si no existe, creamos nuevo
    const [insight] = await this.db.insert(auraBookInsights).values(data).returning();
    return insight;
  }

  async deleteBookInsight(bookId: number): Promise<void> {
    await this.db.delete(auraBookInsights).where(eq(auraBookInsights.bookId, bookId));
  }

  async markInsightsAsStale(): Promise<void> {
    await this.db.update(auraBookInsights).set({ status: 'stale' });
  }

  // ============================================================================
  // KENP Monthly Data (Aura Unlimited)
  // ============================================================================
  
  async getAllKenpMonthlyData(): Promise<KenpMonthlyData[]> {
    return await this.db.select().from(kenpMonthlyData).orderBy(desc(kenpMonthlyData.month));
  }

  async getKenpMonthlyDataByBook(bookId: number): Promise<KenpMonthlyData[]> {
    return await this.db
      .select()
      .from(kenpMonthlyData)
      .where(eq(kenpMonthlyData.bookId, bookId))
      .orderBy(desc(kenpMonthlyData.month));
  }

  async getKenpMonthlyDataByAsin(asin: string): Promise<KenpMonthlyData[]> {
    return await this.db
      .select()
      .from(kenpMonthlyData)
      .where(eq(kenpMonthlyData.asin, asin))
      .orderBy(desc(kenpMonthlyData.month));
  }

  async createKenpMonthlyData(data: InsertKenpMonthlyData): Promise<KenpMonthlyData> {
    const [record] = await this.db.insert(kenpMonthlyData).values(data).returning();
    return record;
  }

  async deleteAllKenpMonthlyData(): Promise<void> {
    await this.db.delete(kenpMonthlyData);
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

  // Aura System - Stubs (MemStorage no soporta estas operaciones)
  async getAllPenNames(): Promise<PenName[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getPenName(id: number): Promise<PenName | undefined> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async createPenName(data: InsertPenName): Promise<PenName> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async updatePenName(id: number, data: Partial<InsertPenName>): Promise<PenName> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async deletePenName(id: number): Promise<void> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getAllBookSeries(): Promise<BookSeries[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getBookSeriesByPenName(penNameId: number): Promise<BookSeries[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getBookSeries(id: number): Promise<BookSeries | undefined> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async createBookSeries(data: InsertBookSeries): Promise<BookSeries> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async updateBookSeries(id: number, data: Partial<InsertBookSeries>): Promise<BookSeries> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async deleteBookSeries(id: number): Promise<void> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getAllAuraBooks(): Promise<AuraBook[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getAuraBooksByPenName(penNameId: number): Promise<AuraBook[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getAuraBooksBySeries(seriesId: number): Promise<AuraBook[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getAuraBook(id: number): Promise<AuraBook | undefined> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getAuraBookByAsin(asin: string): Promise<AuraBook | undefined> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async createAuraBook(data: InsertAuraBook): Promise<AuraBook> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async updateAuraBook(id: number, data: Partial<InsertAuraBook>): Promise<AuraBook> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async deleteAuraBook(id: number): Promise<void> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getAllKdpSales(): Promise<KdpSale[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getKdpSalesByPenName(penNameId: number): Promise<KdpSale[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getKdpSalesByBook(bookId: number): Promise<KdpSale[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getKdpSalesByDateRange(start: Date, end: Date): Promise<KdpSale[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async createKdpSale(data: InsertKdpSale): Promise<KdpSale> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async bulkCreateKdpSales(data: InsertKdpSale[]): Promise<KdpSale[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async deleteKdpSalesByBatchId(batchId: string): Promise<void> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getAllBookInsights(): Promise<BookInsight[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getBookInsight(bookId: number): Promise<BookInsight | undefined> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async createOrUpdateBookInsight(data: InsertBookInsight): Promise<BookInsight> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async deleteBookInsight(bookId: number): Promise<void> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async markInsightsAsStale(): Promise<void> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getAllKenpMonthlyData(): Promise<KenpMonthlyData[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getKenpMonthlyDataByBook(bookId: number): Promise<KenpMonthlyData[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async getKenpMonthlyDataByAsin(asin: string): Promise<KenpMonthlyData[]> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async createKenpMonthlyData(data: InsertKenpMonthlyData): Promise<KenpMonthlyData> {
    throw new Error("MemStorage does not support Aura operations");
  }

  async deleteAllKenpMonthlyData(): Promise<void> {
    throw new Error("MemStorage does not support Aura operations");
  }
}

export const storage = new DbStorage();

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, desc } from "drizzle-orm";
import { 
  manuscripts, 
  optimizations, 
  type Manuscript, 
  type Optimization, 
  type InsertManuscript,
  type OptimizationResult,
  type MarketMetadata
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
}

export const storage = new DbStorage();

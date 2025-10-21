import { type OptimizationResult } from "@shared/schema";

export interface IStorage {
  saveOptimization(result: OptimizationResult): Promise<void>;
  getOptimization(id: string): Promise<OptimizationResult | undefined>;
  getAllOptimizations(): Promise<OptimizationResult[]>;
}

export class MemStorage implements IStorage {
  private optimizations: Map<string, OptimizationResult>;

  constructor() {
    this.optimizations = new Map();
  }

  async saveOptimization(result: OptimizationResult): Promise<void> {
    this.optimizations.set(result.id, result);
  }

  async getOptimization(id: string): Promise<OptimizationResult | undefined> {
    return this.optimizations.get(id);
  }

  async getAllOptimizations(): Promise<OptimizationResult[]> {
    return Array.from(this.optimizations.values());
  }
}

export const storage = new MemStorage();

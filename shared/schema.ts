import { z } from "zod";
import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const amazonMarkets = {
  "amazon.com": { name: "Amazon.com (Estados Unidos)", currency: "USD", flag: "🇺🇸", locale: "en-US" },
  "amazon.es": { name: "Amazon.es (España)", currency: "EUR", flag: "🇪🇸", locale: "es-ES" },
  "amazon.es-ca": { name: "Amazon.es (Catalunya)", currency: "EUR", flag: "🇪🇸", locale: "ca-ES" },
  "amazon.de": { name: "Amazon.de (Alemania)", currency: "EUR", flag: "🇩🇪", locale: "de-DE" },
  "amazon.fr": { name: "Amazon.fr (Francia)", currency: "EUR", flag: "🇫🇷", locale: "fr-FR" },
  "amazon.it": { name: "Amazon.it (Italia)", currency: "EUR", flag: "🇮🇹", locale: "it-IT" },
  "amazon.co.uk": { name: "Amazon.co.uk (Reino Unido)", currency: "GBP", flag: "🇬🇧", locale: "en-GB" },
  "amazon.com.br": { name: "Amazon.com.br (Brasil)", currency: "BRL", flag: "🇧🇷", locale: "pt-BR" },
} as const;

export type AmazonMarket = keyof typeof amazonMarkets;

export const bookGenres = [
  "Ficción",
  "Ciencia Ficción",
  "Fantasía",
  "Misterio",
  "Thriller",
  "Romance",
  "Horror",
  "No Ficción",
  "Autoayuda",
  "Negocios",
  "Biografía",
  "Historia",
  "Ciencia",
  "Tecnología",
  "Infantil",
  "Jóvenes Adultos",
] as const;

export type BookGenre = typeof bookGenres[number];

export const optimizationRequestSchema = z.object({
  manuscriptText: z.string().min(100, "El manuscrito debe tener al menos 100 caracteres"),
  originalTitle: z.string().min(1, "El título es requerido"),
  author: z.string().min(1, "El nombre del autor es requerido"),
  language: z.string().min(2, "El idioma es requerido"),
  targetMarkets: z.array(z.string()).min(1, "Selecciona al menos un mercado"),
  genre: z.string().min(1, "El género es requerido"),
  targetAudience: z.string().optional(),
  seriesName: z.string().optional(),
  seriesNumber: z.number().int().positive().optional(),
});

export type OptimizationRequest = z.infer<typeof optimizationRequestSchema>;

export const keywordFieldSchema = z.object({
  keywords: z.string().max(50, "Máximo 50 caracteres por campo"),
  charCount: z.number(),
});

export type KeywordField = z.infer<typeof keywordFieldSchema>;

export const kdpValidationRules = {
  maxTitleSubtitleLength: 200,
  maxKeywordFieldChars: 50,
  prohibitedTerms: [
    "bestseller",
    "best seller",
    "best-seller",
    "free",
    "gratis",
    "nuevo",
    "new",
    "#1",
    "número 1",
    "numero 1",
    "top selling",
    "top-selling",
    "award-winning",
    "award winning",
  ] as const,
  allowedHTMLTags: ["b", "i", "u", "br", "p", "h4", "h5", "h6", "ul", "li", "ol"] as const,
} as const;

export const validationWarningSchema = z.object({
  type: z.enum(["title_length", "keyword_chars", "prohibited_terms", "html_tags"]),
  severity: z.enum(["warning", "error", "info"]),
  message: z.string(),
  field: z.string().optional(),
  details: z.any().optional(),
});

export type ValidationWarning = z.infer<typeof validationWarningSchema>;

export const validationResultSchema = z.object({
  isValid: z.boolean(),
  warnings: z.array(validationWarningSchema),
  prohibitedTermsFound: z.array(z.string()).optional(),
});

export type ValidationResult = z.infer<typeof validationResultSchema>;

export const marketMetadataSchema = z.object({
  market: z.string(),
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  keywordFields: z.array(keywordFieldSchema).length(7),
  categories: z.array(z.string()).length(3),
  recommendedPrice: z.number(),
  currency: z.string(),
  royaltyOption: z.enum(["35%", "70%"]),
  estimatedEarnings: z.number(),
  validationWarnings: z.array(validationWarningSchema).optional(),
});

export type MarketMetadata = z.infer<typeof marketMetadataSchema>;

export const optimizationResultSchema = z.object({
  id: z.string(),
  originalTitle: z.string(),
  author: z.string(),
  manuscriptWordCount: z.number(),
  seedKeywords: z.array(z.string()),
  marketResults: z.array(marketMetadataSchema),
  createdAt: z.string(),
  seriesName: z.string().optional(),
  seriesNumber: z.number().optional(),
});

export type OptimizationResult = z.infer<typeof optimizationResultSchema>;

export const pricingRules = {
  USD: {
    "35%": { min: 0.99, max: 200.00 },
    "70%": { min: 2.99, max: 9.99 },
  },
  EUR: {
    "35%": { min: 0.89, max: 215.00 },
    "70%": { min: 2.69, max: 9.99 },
  },
  GBP: {
    "35%": { min: 0.77, max: 150.00 },
    "70%": { min: 1.77, max: 9.99 },
  },
  BRL: {
    "35%": { min: 1.99, max: 400.00 },
    "70%": { min: 5.99, max: 24.99 },
  },
} as const;

export interface UploadProgress {
  stage: "uploading" | "analyzing" | "researching" | "generating" | "complete";
  message: string;
  progress: number;
  currentMarket?: string;
}

// Tabla de manuscritos guardados
export const manuscripts = pgTable("manuscripts", {
  id: serial("id").primaryKey(),
  originalTitle: text("original_title").notNull(),
  author: text("author").notNull(),
  genre: text("genre").notNull(),
  targetAudience: text("target_audience"),
  language: text("language").notNull(),
  manuscriptText: text("manuscript_text").notNull(),
  wordCount: integer("word_count").notNull(),
  seriesName: text("series_name"),
  seriesNumber: integer("series_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tabla de optimizaciones (múltiples optimizaciones por manuscrito)
export const optimizations = pgTable("optimizations", {
  id: text("id").primaryKey(),
  manuscriptId: integer("manuscript_id").notNull().references(() => manuscripts.id),
  targetMarkets: text("target_markets").array().notNull(),
  seedKeywords: text("seed_keywords").array().notNull(),
  marketResults: jsonb("market_results").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tabla de publicaciones KDP (tracking de publicaciones por manuscrito y mercado)
export const publications = pgTable("publications", {
  id: serial("id").primaryKey(),
  manuscriptId: integer("manuscript_id").notNull().references(() => manuscripts.id),
  market: text("market").notNull(),
  status: text("status").notNull(),
  scheduledDate: timestamp("scheduled_date"),
  publishedDate: timestamp("published_date"),
  kdpUrl: text("kdp_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Estados de publicación
export const publicationStatuses = ["pending", "scheduled", "published"] as const;
export type PublicationStatus = typeof publicationStatuses[number];

// Tipos de inserción y selección
export const insertManuscriptSchema = createInsertSchema(manuscripts).omit({ id: true, createdAt: true });
export type InsertManuscript = z.infer<typeof insertManuscriptSchema>;
export type Manuscript = typeof manuscripts.$inferSelect;

export const insertOptimizationSchema = createInsertSchema(optimizations).omit({ createdAt: true });
export type InsertOptimization = z.infer<typeof insertOptimizationSchema>;
export type Optimization = typeof optimizations.$inferSelect;

export const insertPublicationSchema = createInsertSchema(publications).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
}).extend({
  status: z.enum(publicationStatuses),
  market: z.string().refine((m) => m in amazonMarkets, "Mercado inválido"),
});
export type InsertPublication = z.infer<typeof insertPublicationSchema>;
export type Publication = typeof publications.$inferSelect;

import { z } from "zod";

export const amazonMarkets = {
  "amazon.com": { name: "Amazon.com (US)", currency: "USD", flag: "🇺🇸", locale: "en-US" },
  "amazon.es": { name: "Amazon.es (Spain)", currency: "EUR", flag: "🇪🇸", locale: "es-ES" },
  "amazon.de": { name: "Amazon.de (Germany)", currency: "EUR", flag: "🇩🇪", locale: "de-DE" },
  "amazon.fr": { name: "Amazon.fr (France)", currency: "EUR", flag: "🇫🇷", locale: "fr-FR" },
  "amazon.it": { name: "Amazon.it (Italy)", currency: "EUR", flag: "🇮🇹", locale: "it-IT" },
  "amazon.co.uk": { name: "Amazon.co.uk (UK)", currency: "GBP", flag: "🇬🇧", locale: "en-GB" },
  "amazon.com.br": { name: "Amazon.com.br (Brazil)", currency: "BRL", flag: "🇧🇷", locale: "pt-BR" },
} as const;

export type AmazonMarket = keyof typeof amazonMarkets;

export const bookGenres = [
  "Fiction",
  "Science Fiction",
  "Fantasy",
  "Mystery",
  "Thriller",
  "Romance",
  "Horror",
  "Non-Fiction",
  "Self-Help",
  "Business",
  "Biography",
  "History",
  "Science",
  "Technology",
  "Children's",
  "Young Adult",
] as const;

export type BookGenre = typeof bookGenres[number];

export const optimizationRequestSchema = z.object({
  manuscriptText: z.string().min(100, "Manuscript must be at least 100 characters"),
  originalTitle: z.string().min(1, "Title is required"),
  language: z.string().min(2, "Language is required"),
  targetMarkets: z.array(z.string()).min(1, "Select at least one market"),
  genre: z.string().min(1, "Genre is required"),
  targetAudience: z.string().optional(),
});

export type OptimizationRequest = z.infer<typeof optimizationRequestSchema>;

export const keywordFieldSchema = z.object({
  keywords: z.string().max(249, "Maximum 249 bytes per field"),
  byteCount: z.number(),
});

export type KeywordField = z.infer<typeof keywordFieldSchema>;

export const kdpValidationRules = {
  maxTitleSubtitleLength: 200,
  maxKeywordFieldBytes: 249,
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
  type: z.enum(["title_length", "keyword_bytes", "prohibited_terms", "html_tags"]),
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
  manuscriptWordCount: z.number(),
  seedKeywords: z.array(z.string()),
  marketResults: z.array(marketMetadataSchema),
  createdAt: z.string(),
});

export type OptimizationResult = z.infer<typeof optimizationResultSchema>;

export const pricingRules = {
  USD: {
    "35%": { min: 0.99, max: 200 },
    "70%": { min: 2.99, max: 9.99 },
  },
  EUR: {
    "35%": { min: 0.99, max: 200 },
    "70%": { min: 2.99, max: 9.99 },
  },
  GBP: {
    "35%": { min: 0.99, max: 200 },
    "70%": { min: 1.99, max: 9.99 },
  },
  BRL: {
    "35%": { min: 1.99, max: 200 },
    "70%": { min: 4.99, max: 14.99 },
  },
} as const;

export interface UploadProgress {
  stage: "uploading" | "analyzing" | "researching" | "generating" | "complete";
  message: string;
  progress: number;
  currentMarket?: string;
}

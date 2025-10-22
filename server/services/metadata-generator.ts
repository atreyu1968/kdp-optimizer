import {
  analyzeManuscript,
  generateMetadata,
  optimizeKeywordsForMarket,
} from "../ai/openai-client";
import {
  amazonMarkets,
  pricingRules,
  type MarketMetadata,
  type KeywordField,
  type OptimizationRequest,
  type AmazonMarket,
  type ValidationWarning,
} from "@shared/schema";
import { randomUUID } from "crypto";
import {
  validateTitleLength,
  validateMetadata,
  truncateSubtitle,
  truncateKeywordBytes,
  sanitizeHTML,
  validateKeywordBytes,
} from "../utils/kdp-validator";

function removeWordsFromKeywords(
  keywords: string[],
  wordsToRemove: string
): string[] {
  const wordsSet = new Set(
    wordsToRemove
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  return keywords.filter((keyword) => {
    const keywordWords = keyword.toLowerCase().split(/\s+/);
    return !keywordWords.some((word) => wordsSet.has(word));
  });
}

function distributeKeywordsToFields(keywords: string[]): KeywordField[] {
  const fields: KeywordField[] = [];
  const encoder = new TextEncoder();

  let currentField = "";
  let fieldIndex = 0;

  for (const keyword of keywords) {
    if (fieldIndex >= 7) break;

    const testField = currentField
      ? `${currentField} ${keyword}`
      : keyword;
    const byteCount = encoder.encode(testField).length;

    if (byteCount <= 249) {
      currentField = testField;
    } else {
      if (currentField) {
        fields.push({
          keywords: currentField,
          byteCount: encoder.encode(currentField).length,
        });
        fieldIndex++;
      }
      currentField = keyword;
    }
  }

  if (currentField && fieldIndex < 7) {
    fields.push({
      keywords: currentField,
      byteCount: encoder.encode(currentField).length,
    });
    fieldIndex++;
  }

  while (fields.length < 7) {
    fields.push({ keywords: "", byteCount: 0 });
  }

  return fields.slice(0, 7);
}

function calculatePrice(
  currency: string,
  fileSize: number = 5
): {
  price: number;
  royaltyOption: "35%" | "70%";
  earnings: number;
} {
  const rules = pricingRules[currency as keyof typeof pricingRules];

  if (!rules) {
    return {
      price: 4.99,
      royaltyOption: "70%",
      earnings: 3.49,
    };
  }

  const price70Range = rules["70%"];
  let price: number;

  if (currency === "USD" || currency === "EUR") {
    price = 4.99;
  } else if (currency === "GBP") {
    price = 3.99;
  } else if (currency === "BRL") {
    price = 9.99;
  } else {
    price = 4.99;
  }

  if (price >= price70Range.min && price <= price70Range.max) {
    const deliveryCost = fileSize * 0.15;
    const earnings = price * 0.7 - deliveryCost;
    return {
      price,
      royaltyOption: "70%",
      earnings: Math.max(earnings, 0),
    };
  }

  const earnings35 = price * 0.35;
  return {
    price,
    royaltyOption: "35%",
    earnings: earnings35,
  };
}

export async function generateOptimizationResult(
  request: OptimizationRequest,
  onProgress?: (stage: string, message: string, progress: number, currentMarket?: string) => void
) {
  const { manuscriptText, originalTitle, language, targetMarkets, genre, targetAudience } = request;

  try {
    onProgress?.("analyzing", "Leyendo y analizando manuscrito...", 5);
    
    const wordCount = manuscriptText.trim().split(/\s+/).length;

    onProgress?.("analyzing", "Extrayendo temas y palabras clave con IA...", 15);
    const analysis = await analyzeManuscript(manuscriptText, language, genre);
    
    if (!analysis || !analysis.seedKeywords || analysis.seedKeywords.length === 0) {
      throw new Error("El análisis del manuscrito no produjo resultados válidos. Por favor, intenta de nuevo.");
    }

  const marketResults: MarketMetadata[] = [];
  const totalMarkets = targetMarkets.length;
  
  let marketIndex = 0;
  for (const marketId of targetMarkets) {
    const market = amazonMarkets[marketId as AmazonMarket];
    if (!market) continue;

    const baseProgress = 25 + (marketIndex / totalMarkets) * 60;
    
    onProgress?.("researching", `Generando metadatos para ${market.name}...`, baseProgress, market.name);

    const metadata = await generateMetadata(
      originalTitle,
      analysis.seedKeywords,
      analysis.themes,
      genre,
      targetAudience || "",
      market.name,
      market.locale
    );

    onProgress?.("researching", `Optimizando palabras clave para ${market.name}...`, baseProgress + 15);

    const optimizedKeywords = await optimizeKeywordsForMarket(
      metadata.keywords,
      market.name,
      market.locale,
      genre
    );

    const titleSubtitle = `${metadata.title} ${metadata.subtitle}`;
    const filteredKeywords = removeWordsFromKeywords(
      optimizedKeywords,
      titleSubtitle
    );

    const keywordFields = distributeKeywordsToFields(filteredKeywords);

    let finalTitle = metadata.title;
    let finalSubtitle = metadata.subtitle;
    
    if (!validateTitleLength(finalTitle, finalSubtitle)) {
      console.log(`[KDP Validation] Title+Subtitle exceeds 200 chars (${finalTitle.length + finalSubtitle.length}). Truncating subtitle...`);
      finalSubtitle = truncateSubtitle(finalTitle, finalSubtitle);
      console.log(`[KDP Validation] Subtitle truncated to: "${finalSubtitle}"`);
    }
    
    let finalDescription = sanitizeHTML(metadata.description);
    if (finalDescription !== metadata.description) {
      console.log(`[KDP Validation] HTML sanitized in description for ${market.name}`);
    }
    
    const finalKeywordFields = keywordFields.map((field, index) => {
      if (field.keywords && !validateKeywordBytes(field.keywords)) {
        const truncated = truncateKeywordBytes(field.keywords);
        console.log(`[KDP Validation] Keyword field ${index + 1} truncated from ${field.byteCount} to ${new TextEncoder().encode(truncated).length} bytes`);
        return {
          keywords: truncated,
          byteCount: new TextEncoder().encode(truncated).length,
        };
      }
      return field;
    });
    
    const warnings = validateMetadata(
      finalTitle,
      finalSubtitle,
      finalDescription,
      finalKeywordFields.map(f => f.keywords)
    );
    
    if (warnings.length > 0) {
      console.log(`[KDP Validation] Found ${warnings.length} validation warnings for ${market.name}:`, 
        warnings.map(w => w.message));
    }

    const pricing = calculatePrice(market.currency);

    marketResults.push({
      market: marketId,
      title: finalTitle,
      subtitle: finalSubtitle,
      description: finalDescription,
      keywordFields: finalKeywordFields,
      categories: metadata.categories.slice(0, 3),
      recommendedPrice: pricing.price,
      currency: market.currency,
      royaltyOption: pricing.royaltyOption,
      estimatedEarnings: pricing.earnings,
      validationWarnings: warnings.length > 0 ? warnings : undefined,
    });

    marketIndex++;
  }

    onProgress?.("generating", "Finalizando resultados de optimización...", 95);

    return {
      id: randomUUID(),
      originalTitle,
      manuscriptWordCount: wordCount,
      seedKeywords: analysis.seedKeywords.slice(0, 20),
      marketResults,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error en generateOptimizationResult:", error);
    
    if (error instanceof Error) {
      if (error.message.includes("API key") || error.message.includes("authentication")) {
        throw new Error("Error de autenticación con OpenAI. Por favor, contacta al administrador del sistema.");
      } else if (error.message.includes("timeout") || error.message.includes("ECONNREFUSED")) {
        throw new Error("La conexión con el servicio de IA tardó demasiado. Por favor, intenta de nuevo.");
      } else if (error.message.includes("rate limit")) {
        throw new Error("Se ha excedido el límite de solicitudes a la IA. Por favor, espera unos minutos e intenta de nuevo.");
      } else {
        throw new Error(`Error al procesar tu manuscrito: ${error.message}`);
      }
    }
    
    throw new Error("Ocurrió un error inesperado al optimizar tu manuscrito. Por favor, intenta de nuevo.");
  }
}

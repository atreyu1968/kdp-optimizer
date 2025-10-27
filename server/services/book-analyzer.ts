import OpenAI from "openai";
import { storage } from "../storage";
import type { AuraBook, KdpSale } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY!,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface BookMetrics {
  bookId: number;
  asin: string;
  title: string;
  penName: string;
  
  // Métricas de ventas (últimos 30 días)
  totalSales30d: number;
  totalRefunds30d: number;
  totalKenpPages30d: number;
  totalRoyalties30d: number;
  
  // Métricas de ventas (últimos 90 días)
  totalSales90d: number;
  totalKenpPages90d: number;
  totalRoyalties90d: number;
  
  // Tendencias (comparando últimos 30 vs 30 anteriores)
  salesTrend: number; // % cambio
  royaltiesTrend: number; // % cambio
  
  // Marketplaces
  topMarketplaces: string[];
  marketplaceCount: number;
  
  // Edad del libro
  daysPublished: number;
  
  // Precio promedio
  avgPrice: number;
}

interface AIRecommendation {
  category: "OPTIMIZE" | "HOLD" | "RAISE_PRICE";
  confidence: number; // 0-100
  summary: string;
  rationale: string;
  actions: string[];
  priceSuggestion?: string;
  metricsUsed: string[];
}

/**
 * Calcula métricas agregadas para un libro específico
 */
async function calculateBookMetrics(
  book: AuraBook,
  allSales: KdpSale[],
  penNameMap: Map<number, string>
): Promise<BookMetrics> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  
  // Filtrar ventas de este libro
  const bookSales = allSales.filter(s => s.bookId === book.id || s.asin === book.asin);
  
  // Últimos 30 días
  const sales30d = bookSales.filter(s => new Date(s.saleDate) >= thirtyDaysAgo);
  const totalSales30d = sales30d.filter(s => s.transactionType === "Sale").length;
  const totalRefunds30d = sales30d.filter(s => s.transactionType === "Refund").length;
  const totalKenpPages30d = sales30d
    .filter(s => s.transactionType === "KENP Read")
    .reduce((sum, s) => sum + (s.unitsOrPages || 0), 0);
  const totalRoyalties30d = sales30d.reduce((sum, s) => sum + parseFloat(s.royalty || "0"), 0);
  
  // 30-60 días atrás (para tendencia)
  const sales30to60 = bookSales.filter(s => {
    const date = new Date(s.saleDate);
    return date >= sixtyDaysAgo && date < thirtyDaysAgo;
  });
  const totalSales30to60 = sales30to60.filter(s => s.transactionType === "Sale").length;
  const totalRoyalties30to60 = sales30to60.reduce((sum, s) => sum + parseFloat(s.royalty || "0"), 0);
  
  // Últimos 90 días
  const sales90d = bookSales.filter(s => new Date(s.saleDate) >= ninetyDaysAgo);
  const totalSales90d = sales90d.filter(s => s.transactionType === "Sale").length;
  const totalKenpPages90d = sales90d
    .filter(s => s.transactionType === "KENP Read")
    .reduce((sum, s) => sum + (s.unitsOrPages || 0), 0);
  const totalRoyalties90d = sales90d.reduce((sum, s) => sum + parseFloat(s.royalty || "0"), 0);
  
  // Calcular tendencias (% cambio)
  const salesTrend = totalSales30to60 > 0 
    ? ((totalSales30d - totalSales30to60) / totalSales30to60) * 100 
    : totalSales30d > 0 ? 100 : 0;
  
  const royaltiesTrend = totalRoyalties30to60 > 0 
    ? ((totalRoyalties30d - totalRoyalties30to60) / totalRoyalties30to60) * 100 
    : totalRoyalties30d > 0 ? 100 : 0;
  
  // Marketplaces
  const marketplaces = new Set(bookSales.map(s => s.marketplace));
  const topMarketplaces = Array.from(marketplaces).slice(0, 3);
  
  // Edad del libro
  const publishDate = book.publishDate ? new Date(book.publishDate) : new Date(book.createdAt);
  const daysPublished = Math.floor((now.getTime() - publishDate.getTime()) / (24 * 60 * 60 * 1000));
  
  // Precio promedio (extraer de price JSON si existe)
  let avgPrice = 0;
  try {
    const prices = book.price ? JSON.parse(book.price) : {};
    const priceValues = Object.values(prices).map((p: any) => parseFloat(p) || 0);
    avgPrice = priceValues.length > 0 ? priceValues.reduce((a, b) => a + b, 0) / priceValues.length : 0;
  } catch {
    avgPrice = 0;
  }
  
  return {
    bookId: book.id,
    asin: book.asin,
    title: book.title,
    penName: penNameMap.get(book.penNameId) || "Unknown",
    totalSales30d,
    totalRefunds30d,
    totalKenpPages30d,
    totalRoyalties30d,
    totalSales90d,
    totalKenpPages90d,
    totalRoyalties90d,
    salesTrend,
    royaltiesTrend,
    topMarketplaces,
    marketplaceCount: marketplaces.size,
    daysPublished,
    avgPrice,
  };
}

/**
 * Llama a OpenAI para analizar un libro y generar recomendación
 */
async function analyzeBookWithAI(metrics: BookMetrics): Promise<AIRecommendation> {
  const systemPrompt = `Eres un experto estratega en KDP (Kindle Direct Publishing) de Amazon. 
Analizas datos de ventas de libros y proporcionas recomendaciones estratégicas basadas en métricas reales.

Tu tarea es categorizar cada libro en una de estas 3 categorías y proporcionar acciones específicas:

1. OPTIMIZE: Libros con bajo rendimiento que necesitan optimización de metadata (título, descripción, keywords, portada)
2. HOLD: Libros que están funcionando bien y no necesitan cambios significativos
3. RAISE_PRICE: Libros con buen rendimiento que pueden soportar un precio más alto

IMPORTANTE: Debes responder SIEMPRE con un JSON válido siguiendo este esquema exacto:
{
  "category": "OPTIMIZE" | "HOLD" | "RAISE_PRICE",
  "confidence": <número 0-100>,
  "summary": "<resumen breve en 1 línea>",
  "rationale": "<explicación detallada de por qué esta categoría>",
  "actions": ["<acción 1>", "<acción 2>", "..."],
  "priceSuggestion": "<precio sugerido si aplica>",
  "metricsUsed": ["<métrica 1>", "<métrica 2>", "..."]
}`;

  const userPrompt = `Analiza este libro y proporciona tu recomendación:

DATOS DEL LIBRO:
- Título: ${metrics.title}
- ASIN: ${metrics.asin}
- Autor/Seudónimo: ${metrics.penName}
- Días publicado: ${metrics.daysPublished}
- Precio promedio: $${metrics.avgPrice.toFixed(2)}

MÉTRICAS (ÚLTIMOS 30 DÍAS):
- Ventas: ${metrics.totalSales30d}
- Devoluciones: ${metrics.totalRefunds30d}
- Páginas KENP leídas: ${metrics.totalKenpPages30d}
- Regalías: $${metrics.totalRoyalties30d.toFixed(2)}

MÉTRICAS (ÚLTIMOS 90 DÍAS):
- Ventas: ${metrics.totalSales90d}
- Páginas KENP: ${metrics.totalKenpPages90d}
- Regalías: $${metrics.totalRoyalties90d.toFixed(2)}

TENDENCIAS:
- Tendencia de ventas: ${metrics.salesTrend.toFixed(1)}%
- Tendencia de regalías: ${metrics.royaltiesTrend.toFixed(1)}%

DISTRIBUCIÓN:
- Marketplaces activos: ${metrics.marketplaceCount}
- Top marketplaces: ${metrics.topMarketplaces.join(", ")}

Proporciona tu análisis y recomendación en formato JSON.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const recommendation = JSON.parse(content) as AIRecommendation;
    
    // Validar que la respuesta tenga la estructura correcta
    if (!recommendation.category || !recommendation.actions || !recommendation.rationale) {
      throw new Error("Invalid recommendation structure from AI");
    }

    return recommendation;
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    
    // Fallback: generar recomendación básica basada en reglas
    return generateFallbackRecommendation(metrics);
  }
}

/**
 * Genera una recomendación básica si OpenAI falla
 */
function generateFallbackRecommendation(metrics: BookMetrics): AIRecommendation {
  // Lógica simple basada en reglas
  if (metrics.totalRoyalties30d < 10 && metrics.totalSales30d < 5) {
    return {
      category: "OPTIMIZE",
      confidence: 75,
      summary: "Bajo rendimiento - necesita optimización",
      rationale: "El libro tiene muy pocas ventas y regalías bajas. Se recomienda optimizar la metadata para mejorar visibilidad.",
      actions: [
        "Revisar y mejorar título y subtítulo con keywords relevantes",
        "Actualizar descripción del libro con copy más atractivo",
        "Considerar rediseño de portada para mejor CTR",
        "Investigar keywords de alto volumen y baja competencia",
      ],
      metricsUsed: ["totalRoyalties30d", "totalSales30d"],
    };
  }
  
  if (metrics.royaltiesTrend > 20 && metrics.totalRoyalties30d > 50) {
    return {
      category: "RAISE_PRICE",
      confidence: 80,
      summary: "Buen rendimiento - puede soportar precio más alto",
      rationale: "El libro muestra tendencia positiva de regalías y buen volumen de ventas. Puede soportar un incremento de precio.",
      actions: [
        "Incrementar precio gradualmente (10-15%)",
        "Monitorear impacto en ventas durante 2 semanas",
        "Mantener precio premium con buen posicionamiento",
      ],
      priceSuggestion: `$${(metrics.avgPrice * 1.15).toFixed(2)}`,
      metricsUsed: ["royaltiesTrend", "totalRoyalties30d", "avgPrice"],
    };
  }
  
  return {
    category: "HOLD",
    confidence: 70,
    summary: "Rendimiento estable - mantener estrategia actual",
    rationale: "El libro tiene un rendimiento aceptable y estable. No se recomiendan cambios significativos en este momento.",
    actions: [
      "Mantener estrategia actual",
      "Monitorear métricas mensualmente",
      "Considerar promociones estacionales",
    ],
    metricsUsed: ["totalRoyalties30d", "salesTrend"],
  };
}

/**
 * Analiza todos los libros y genera/actualiza recomendaciones
 */
export async function analyzeAllBooks(): Promise<void> {
  console.log("[BookAnalyzer] Iniciando análisis de libros...");
  
  // Obtener todos los datos necesarios
  const [books, sales, penNames] = await Promise.all([
    storage.getAllAuraBooks(),
    storage.getAllKdpSales(),
    storage.getAllPenNames(),
  ]);
  
  console.log(`[BookAnalyzer] Analizando ${books.length} libros con ${sales.length} transacciones`);
  
  // Crear mapa de pen names
  const penNameMap = new Map(penNames.map(p => [p.id, p.name]));
  
  // Analizar cada libro
  let analyzed = 0;
  for (const book of books) {
    try {
      // Calcular métricas
      const metrics = await calculateBookMetrics(book, sales, penNameMap);
      
      // Analizar con IA
      console.log(`[BookAnalyzer] Analizando: ${metrics.title}`);
      const recommendation = await analyzeBookWithAI(metrics);
      
      // Guardar en BD
      await storage.createOrUpdateBookInsight({
        bookId: book.id,
        recommendation: recommendation.category,
        rationale: recommendation.rationale,
        actionPlan: JSON.stringify(recommendation.actions),
        priceSuggestion: recommendation.priceSuggestion || null,
        confidence: recommendation.confidence,
        metricsPayload: JSON.stringify(metrics),
        status: "fresh",
      });
      
      analyzed++;
      console.log(`[BookAnalyzer] ✓ ${metrics.title} → ${recommendation.category} (${recommendation.confidence}% confianza)`);
    } catch (error) {
      console.error(`[BookAnalyzer] Error analizando libro ${book.id}:`, error);
    }
  }
  
  console.log(`[BookAnalyzer] Análisis completado: ${analyzed}/${books.length} libros`);
}

/**
 * Obtiene insights con información completa del libro
 */
export async function getEnrichedInsights() {
  const [insights, books, penNames] = await Promise.all([
    storage.getAllBookInsights(),
    storage.getAllAuraBooks(),
    storage.getAllPenNames(),
  ]);
  
  const booksMap = new Map(books.map(b => [b.id, b]));
  const penNamesMap = new Map(penNames.map(p => [p.id, p]));
  
  return insights.map(insight => {
    const book = booksMap.get(insight.bookId);
    const penName = book ? penNamesMap.get(book.penNameId) : null;
    
    return {
      ...insight,
      book: book || null,
      penName: penName?.name || "Unknown",
      actions: JSON.parse(insight.actionPlan),
      metrics: JSON.parse(insight.metricsPayload),
    };
  });
}

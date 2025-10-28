import OpenAI from "openai";
import { storage } from "../storage";
import type { AuraBook, KdpSale } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY!,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * Tasas de conversión a EUR (moneda base)
 * Tasas aproximadas para octubre 2025
 */
const EXCHANGE_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 0.92,
  GBP: 1.17,
  CAD: 0.67,
  AUD: 0.60,
  BRL: 0.17,
  MXN: 0.052,
  JPY: 0.0062,
  INR: 0.011,
};

/**
 * Convierte una cantidad en cualquier moneda a EUR
 */
function convertToEUR(amount: number, currency: string): number {
  const rate = EXCHANGE_RATES[currency] || 1.0;
  return amount * rate;
}

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
 * Clasifica un libro basándose en umbrales deterministas
 * ANTES de llamar a la IA
 */
function classifyBookByMetrics(metrics: BookMetrics): "OPTIMIZE" | "HOLD" | "RAISE_PRICE" {
  const {
    totalRoyalties30d,
    totalRoyalties90d,
    royaltiesTrend,
    totalKenpPages30d,
    totalSales30d,
    daysPublished,
  } = metrics;

  // RAISE_PRICE: Alto rendimiento
  // - Regalías significativas Y tendencia positiva
  // - O regalías muy altas independientemente de tendencia
  if (
    (totalRoyalties30d > 50 && royaltiesTrend > 10) ||
    totalRoyalties30d > 100 ||
    (totalKenpPages30d > 15000 && royaltiesTrend > 10)
  ) {
    return "RAISE_PRICE";
  }

  // HOLD: Rendimiento estable/moderado
  // - Regalías moderadas con tendencia estable
  // - O KENP significativo
  // - O libro muy nuevo (menos de 60 días)
  if (
    (totalRoyalties30d >= 10 && totalRoyalties30d <= 50 && Math.abs(royaltiesTrend) <= 15) ||
    (totalKenpPages30d >= 3000 && totalKenpPages30d <= 15000) ||
    (daysPublished < 60 && totalRoyalties30d > 5) ||
    (totalSales30d >= 5 && totalRoyalties30d >= 15)
  ) {
    return "HOLD";
  }

  // OPTIMIZE: Bajo rendimiento que necesita trabajo
  // - Regalías bajas
  // - KENP bajo
  // - Libro con suficiente antigüedad (más de 60 días)
  return "OPTIMIZE";
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
  // Convertir todas las regalías a EUR antes de sumar
  const totalRoyalties30d = sales30d.reduce((sum, s) => {
    const amount = parseFloat(s.royalty || "0");
    return sum + convertToEUR(amount, s.currency);
  }, 0);
  
  // 30-60 días atrás (para tendencia)
  const sales30to60 = bookSales.filter(s => {
    const date = new Date(s.saleDate);
    return date >= sixtyDaysAgo && date < thirtyDaysAgo;
  });
  const totalSales30to60 = sales30to60.filter(s => s.transactionType === "Sale").length;
  // Convertir todas las regalías a EUR antes de sumar
  const totalRoyalties30to60 = sales30to60.reduce((sum, s) => {
    const amount = parseFloat(s.royalty || "0");
    return sum + convertToEUR(amount, s.currency);
  }, 0);
  
  // Últimos 90 días
  const sales90d = bookSales.filter(s => new Date(s.saleDate) >= ninetyDaysAgo);
  const totalSales90d = sales90d.filter(s => s.transactionType === "Sale").length;
  const totalKenpPages90d = sales90d
    .filter(s => s.transactionType === "KENP Read")
    .reduce((sum, s) => sum + (s.unitsOrPages || 0), 0);
  // Convertir todas las regalías a EUR antes de sumar
  const totalRoyalties90d = sales90d.reduce((sum, s) => {
    const amount = parseFloat(s.royalty || "0");
    return sum + convertToEUR(amount, s.currency);
  }, 0);
  
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
 * NOTA: La categoría ya está determinada por umbrales. La IA solo justifica.
 */
async function analyzeBookWithAI(metrics: BookMetrics): Promise<AIRecommendation> {
  // PASO 1: Clasificar usando umbrales deterministas
  const preassignedCategory = classifyBookByMetrics(metrics);
  
  const systemPrompt = `Eres un experto estratega en KDP (Kindle Direct Publishing) de Amazon. 
Tu tarea es JUSTIFICAR por qué un libro ha sido categorizado de cierta manera, basándote en métricas objetivas.

CRITERIOS DE CLASIFICACIÓN (ya aplicados):

RAISE_PRICE - Alto rendimiento:
- Regalías 30d > 50€ con tendencia positiva (>10%)
- O regalías 30d > 100€
- O KENP 30d > 15,000 páginas con tendencia positiva

HOLD - Rendimiento estable/moderado:
- Regalías 30d entre 10€-50€ con tendencia estable (-15% a +15%)
- O KENP 30d entre 3,000-15,000 páginas
- O libro nuevo (<60 días) con regalías > 5€
- O al menos 5 ventas 30d con regalías > 15€

OPTIMIZE - Bajo rendimiento:
- Regalías 30d < 10€
- KENP 30d < 3,000 páginas
- Libro con suficiente antigüedad (>60 días)

NOTA: Todas las regalías están convertidas a EUR para comparabilidad.

IMPORTANTE: Debes responder SIEMPRE con un JSON válido con este esquema exacto:
{
  "category": "${preassignedCategory}",
  "confidence": <número 70-95>,
  "summary": "<resumen breve en 1 línea>",
  "rationale": "<explicación de por qué las métricas indican esta categoría>",
  "actions": ["<acción 1>", "<acción 2>", "..."],
  "priceSuggestion": "<precio sugerido si aplica>",
  "metricsUsed": ["<métricas clave que justifican la clasificación>"]
}`;

  const userPrompt = `Este libro ha sido clasificado como "${preassignedCategory}" basándose en métricas objetivas.
Proporciona una justificación detallada de POR QUÉ esta categoría es correcta según los datos:

DATOS DEL LIBRO:
- Título: ${metrics.title}
- ASIN: ${metrics.asin}
- Autor/Seudónimo: ${metrics.penName}
- Días publicado: ${metrics.daysPublished}
- Precio promedio: $${metrics.avgPrice.toFixed(2)}

MÉTRICAS (ÚLTIMOS 30 DÍAS):
- Ventas: ${metrics.totalSales30d}
- Devoluciones: ${metrics.totalRefunds30d}
- Páginas KENP leídas: ${metrics.totalKenpPages30d.toLocaleString()}
- Regalías: ${metrics.totalRoyalties30d.toFixed(2)}€

MÉTRICAS (ÚLTIMOS 90 DÍAS):
- Ventas: ${metrics.totalSales90d}
- Páginas KENP: ${metrics.totalKenpPages90d.toLocaleString()}
- Regalías: ${metrics.totalRoyalties90d.toFixed(2)}€

TENDENCIAS:
- Tendencia de ventas: ${metrics.salesTrend.toFixed(1)}%
- Tendencia de regalías: ${metrics.royaltiesTrend.toFixed(1)}%

DISTRIBUCIÓN:
- Marketplaces activos: ${metrics.marketplaceCount}
- Top marketplaces: ${metrics.topMarketplaces.join(", ")}

Explica por qué esta clasificación "${preassignedCategory}" es correcta y proporciona acciones específicas en formato JSON.`;

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
    
    // FORZAR la categoría pre-asignada (por si la IA se confunde)
    recommendation.category = preassignedCategory;

    return recommendation;
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    
    // Fallback: generar recomendación básica basada en la categoría pre-asignada
    return generateFallbackRecommendation(metrics, preassignedCategory);
  }
}

/**
 * Genera una recomendación básica si OpenAI falla
 * Usa la categoría pre-asignada por classifyBookByMetrics()
 */
function generateFallbackRecommendation(
  metrics: BookMetrics,
  category: "OPTIMIZE" | "HOLD" | "RAISE_PRICE"
): AIRecommendation {
  if (category === "OPTIMIZE") {
    return {
      category: "OPTIMIZE",
      confidence: 75,
      summary: "Bajo rendimiento - necesita optimización",
      rationale: `El libro muestra regalías de ${metrics.totalRoyalties30d.toFixed(2)}€ en los últimos 30 días, con ${metrics.totalSales30d} ventas y ${metrics.totalKenpPages30d.toLocaleString()} páginas KENP leídas. Necesita optimización de metadata para mejorar visibilidad.`,
      actions: [
        "Revisar y mejorar título y subtítulo con keywords relevantes",
        "Actualizar descripción del libro con copy más atractivo",
        "Considerar rediseño de portada para mejor CTR",
        "Investigar keywords de alto volumen y baja competencia",
        "Analizar competencia directa en el nicho",
      ],
      metricsUsed: ["totalRoyalties30d", "totalSales30d", "totalKenpPages30d"],
    };
  }
  
  if (category === "RAISE_PRICE") {
    const suggestedPrice = metrics.avgPrice > 0 ? (metrics.avgPrice * 1.15).toFixed(2) : "N/A";
    return {
      category: "RAISE_PRICE",
      confidence: 80,
      summary: "Buen rendimiento - puede soportar precio más alto",
      rationale: `El libro genera ${metrics.totalRoyalties30d.toFixed(2)}€ en regalías mensuales con una tendencia de ${metrics.royaltiesTrend.toFixed(1)}%. El rendimiento sólido sugiere que puede soportar un incremento de precio.`,
      actions: [
        "Incrementar precio gradualmente (10-15%)",
        "Monitorear impacto en ventas durante 2 semanas",
        "Mantener precio premium con buen posicionamiento",
        "Considerar promociones flash para mantener visibilidad",
      ],
      priceSuggestion: `${suggestedPrice}€`,
      metricsUsed: ["royaltiesTrend", "totalRoyalties30d", "avgPrice"],
    };
  }
  
  // HOLD
  return {
    category: "HOLD",
    confidence: 70,
    summary: "Rendimiento estable - mantener estrategia actual",
    rationale: `El libro muestra un rendimiento estable con ${metrics.totalRoyalties30d.toFixed(2)}€ en regalías y ${metrics.totalKenpPages30d.toLocaleString()} páginas KENP. No se recomiendan cambios significativos en este momento.`,
    actions: [
      "Mantener estrategia actual",
      "Monitorear métricas mensualmente",
      "Considerar promociones estacionales",
      "Evaluar expansión a nuevos marketplaces si aplica",
    ],
    metricsUsed: ["totalRoyalties30d", "totalKenpPages30d", "salesTrend"],
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

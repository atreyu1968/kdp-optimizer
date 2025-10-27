import { storage } from "../storage";
import { amazonMarkets, type AmazonMarket, type Publication } from "@shared/schema";

const MAX_PUBLICATIONS_PER_DAY = 3;

// Orden de prioridad de mercados (español primero)
const MARKET_PRIORITY: AmazonMarket[] = [
  "amazon.es",       // España (prioridad 1)
  "amazon.es-ca",    // Catalunya
  "amazon.com",      // Estados Unidos
  "amazon.com.br",   // Brasil (portugués)
  "amazon.fr",       // Francia
  "amazon.it",       // Italia
  "amazon.de",       // Alemania
  "amazon.co.uk",    // Reino Unido
];

/**
 * Cuenta cuántas publicaciones están programadas para una fecha específica
 */
function getPublicationsCountForDate(publications: Publication[], date: Date): number {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return publications.filter(pub => {
    if (!pub.scheduledDate) return false;
    const pubDateStr = new Date(pub.scheduledDate).toISOString().split('T')[0];
    return pubDateStr === dateStr;
  }).length;
}

/**
 * Encuentra la próxima fecha disponible para programar una publicación
 * Respeta el límite de 3 publicaciones por día y evita días bloqueados
 */
async function getNextAvailableDate(startDate: Date = new Date()): Promise<Date> {
  // Normalizar a medianoche
  const date = new Date(startDate);
  date.setHours(0, 0, 0, 0);
  
  // Si la fecha es pasada, empezar desde mañana
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    date.setTime(today.getTime());
    date.setDate(date.getDate() + 1);
  }
  
  // Obtener todas las publicaciones programadas
  const allPublications = await storage.getAllPublications();
  
  // Buscar la primera fecha con menos de 3 publicaciones y que no esté bloqueada
  let currentDate = new Date(date);
  let attempts = 0;
  const MAX_ATTEMPTS = 365; // Buscar hasta 1 año en el futuro
  
  while (attempts < MAX_ATTEMPTS) {
    // Verificar si el día está bloqueado
    const isBlocked = await storage.isDateBlocked(currentDate);
    
    if (!isBlocked) {
      // Verificar si el día tiene menos de 3 publicaciones
      const count = getPublicationsCountForDate(allPublications, currentDate);
      if (count < MAX_PUBLICATIONS_PER_DAY) {
        return currentDate;
      }
    }
    
    // Avanzar al día siguiente
    currentDate.setDate(currentDate.getDate() + 1);
    attempts++;
  }
  
  throw new Error("No se pudo encontrar una fecha disponible en los próximos 365 días");
}

/**
 * Ordena los mercados según prioridad (español primero)
 */
function sortMarketsByPriority(markets: string[]): AmazonMarket[] {
  return markets.sort((a, b) => {
    const indexA = MARKET_PRIORITY.indexOf(a as AmazonMarket);
    const indexB = MARKET_PRIORITY.indexOf(b as AmazonMarket);
    return indexA - indexB;
  }) as AmazonMarket[];
}

/**
 * Genera un calendario automático de publicaciones para un manuscrito
 * 
 * @param manuscriptId - ID del manuscrito
 * @param markets - Mercados objetivo (ej: ["amazon.es", "amazon.com"])
 * @param startDate - Fecha inicial (por defecto: mañana)
 * @returns Array de publicaciones creadas
 */
export async function generatePublicationSchedule(
  manuscriptId: number,
  markets: string[],
  startDate?: Date
): Promise<Publication[]> {
  // Obtener publicaciones existentes para este manuscrito
  const existingPublications = await storage.getPublicationsByManuscript(manuscriptId);
  const existingMarkets = new Set(existingPublications.map(p => p.market));
  
  // Filtrar mercados que aún no están programados ni publicados
  const marketsToSchedule = markets.filter(market => !existingMarkets.has(market));
  
  if (marketsToSchedule.length === 0) {
    console.log(`[Scheduler] Todos los mercados ya están programados para manuscript ${manuscriptId}`);
    return [];
  }
  
  // Ordenar por prioridad (español primero)
  const sortedMarkets = sortMarketsByPriority(marketsToSchedule);
  
  console.log(
    `[Scheduler] Programando ${sortedMarkets.length} mercados para manuscript ${manuscriptId}:\n` +
    sortedMarkets.map((m, i) => `  ${i + 1}. ${amazonMarkets[m].name}`).join('\n')
  );
  
  // Generar publicaciones
  const newPublications: Publication[] = [];
  let currentDate = startDate || await getNextAvailableDate();
  
  for (const market of sortedMarkets) {
    // Encontrar la próxima fecha disponible
    const schedDate = await getNextAvailableDate(currentDate);
    
    // Crear publicación
    const publication = await storage.createPublication({
      manuscriptId,
      market,
      status: "scheduled",
      scheduledDate: schedDate,
      publishedDate: null,
      kdpUrl: null,
      notes: null,
    });
    
    newPublications.push(publication);
    
    console.log(
      `[Scheduler] ✓ ${amazonMarkets[market].name} programado para ${schedDate.toISOString().split('T')[0]}`
    );
    
    // Avanzar al día siguiente para la próxima iteración
    currentDate = new Date(schedDate);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return newPublications;
}

/**
 * Reprograma una publicación a una nueva fecha
 * Valida que la nueva fecha no exceda el límite diario y que no esté bloqueada
 */
export async function reschedulePublication(
  publicationId: number,
  newDate: Date
): Promise<Publication> {
  // Normalizar fecha
  const normalizedDate = new Date(newDate);
  normalizedDate.setHours(0, 0, 0, 0);
  
  // Verificar que la fecha no esté en el pasado
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (normalizedDate < today) {
    throw new Error("No puedes programar publicaciones en el pasado");
  }
  
  // Verificar que el día no esté bloqueado
  const isBlocked = await storage.isDateBlocked(normalizedDate);
  if (isBlocked) {
    throw new Error(
      `La fecha ${normalizedDate.toISOString().split('T')[0]} está bloqueada y no está disponible para publicaciones`
    );
  }
  
  // Obtener todas las publicaciones para esa fecha
  const allPublications = await storage.getAllPublications();
  const countOnDate = getPublicationsCountForDate(
    allPublications.filter(p => p.id !== publicationId), // Excluir la que estamos reprogramando
    normalizedDate
  );
  
  if (countOnDate >= MAX_PUBLICATIONS_PER_DAY) {
    throw new Error(
      `La fecha ${normalizedDate.toISOString().split('T')[0]} ya tiene ${countOnDate} publicaciones programadas (máximo ${MAX_PUBLICATIONS_PER_DAY})`
    );
  }
  
  // Actualizar
  return await storage.updatePublication(publicationId, {
    scheduledDate: normalizedDate,
    status: "scheduled",
  });
}

/**
 * Obtiene estadísticas de publicaciones
 */
export async function getPublicationStats() {
  const allPublications = await storage.getAllPublications();
  
  const stats = {
    total: allPublications.length,
    published: allPublications.filter(p => p.status === "published").length,
    scheduled: allPublications.filter(p => p.status === "scheduled").length,
    pending: allPublications.filter(p => p.status === "pending").length,
    byMarket: {} as Record<string, { total: number; published: number; scheduled: number; pending: number }>,
  };
  
  // Stats por mercado
  for (const market of Object.keys(amazonMarkets)) {
    const marketPubs = allPublications.filter(p => p.market === market);
    stats.byMarket[market] = {
      total: marketPubs.length,
      published: marketPubs.filter(p => p.status === "published").length,
      scheduled: marketPubs.filter(p => p.status === "scheduled").length,
      pending: marketPubs.filter(p => p.status === "pending").length,
    };
  }
  
  return stats;
}

/**
 * Marca una publicación como publicada
 */
export async function markPublicationAsPublished(
  publicationId: number,
  kdpUrl?: string
): Promise<Publication> {
  return await storage.markAsPublished(publicationId, new Date(), kdpUrl);
}

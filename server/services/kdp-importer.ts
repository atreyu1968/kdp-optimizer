import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { storage } from '../storage';
import type { InsertKdpSale, InsertAuraBook, PenName } from '@shared/schema';
import { nanoid } from 'nanoid';

/**
 * Parsea una fecha de Excel que puede venir como número serial o como string
 * Excel almacena fechas como números (días desde 1900-01-01)
 * Retorna null si la fecha no es válida para que pueda ser manejada apropiadamente
 */
function parseExcelDate(value: any): Date | null {
  // Valores vacíos, undefined, null, 0, o string vacío
  if (!value || value === 0 || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }

  // Si ya es una Date, retornarla
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  // Si es un número (fecha serial de Excel) mayor que 0
  if (typeof value === 'number' && value > 0) {
    // Excel epoch starts on 1900-01-01 (with a bug counting 1900 as leap year)
    // JavaScript epoch is 1970-01-01
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 30 Dec 1899
    const msPerDay = 24 * 60 * 60 * 1000;
    const date = new Date(excelEpoch.getTime() + value * msPerDay);
    
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Si es un string, intentar parsearlo
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

interface KdpCombinedSale {
  'Fecha de las regalías': string;
  'Título': string;
  'Nombre del autor': string;
  'ASIN/ISBN': string;
  'Tienda': string;
  'Tipo de regalía': string;
  'Tipo de transacción': string;
  'Unidades vendidas': number;
  'Unidades devueltas': number;
  'Unidades netas vendidas': number;
  'Precio de lista medio sin impuestos': number;
  'Precio de oferta medio sin impuestos': number;
  'Gasto medio de entrega/producción': number;
  'Regalías': number;
  'Moneda': string;
}

interface KdpKenpRead {
  'Fecha': string;
  'Título': string;
  'Nombre del autor': string;
  'ASIN': string;
  'Tienda': string;
  'Páginas KENP leídas': number;
}

interface KdpFreeOrder {
  'Fecha': string;
  'Título': string;
  'Nombre del autor': string;
  'ASIN': string;
  'Tienda': string;
  'Unidades pagadas': number;
  'Unidades gratuitas': number;
}

export interface ImportStats {
  penNamesCreated: number;
  booksCreated: number;
  salesImported: number;
  kenpImported: number;
  importBatchId: string;
  errors: string[];
}

/**
 * Normaliza el nombre de tienda de KDP al formato de la app
 */
function normalizeMarketplace(kdpStore: string): string {
  const mapping: Record<string, string> = {
    'Amazon.com': 'amazon.com',
    'Amazon.es': 'amazon.es',
    'Amazon.it': 'amazon.it',
    'Amazon.fr': 'amazon.fr',
    'Amazon.de': 'amazon.de',
    'Amazon.co.uk': 'amazon.co.uk',
    'Amazon.com.br': 'amazon.com.br',
    'Amazon.ca': 'amazon.ca',
    'Amazon.com.mx': 'amazon.com.mx',
    'Amazon.in': 'amazon.in',
    'Amazon.co.jp': 'amazon.co.jp',
    'Amazon.com.au': 'amazon.com.au',
  };
  
  return mapping[kdpStore] || kdpStore.toLowerCase().replace(/\s/g, '');
}

/**
 * Normaliza el tipo de transacción de KDP
 */
function normalizeTransactionType(kdpType: string): string {
  const mapping: Record<string, string> = {
    // Español
    'Venta': 'Sale',
    'Promoción gratuita': 'Free',
    'Devolución': 'Refund',
    'Préstamo': 'Borrow',
    'KENP leídas': 'KENP Read',
    // Tipos de regalía (todas son ventas)
    'Estándar': 'Sale',
    'Estándar - Tapa blanda': 'Sale',
    'Kindle Countdown Deals': 'Sale',
    'Promociones de Kindle': 'Sale',
    'Extendida': 'Sale',
    // Inglés
    'Standard': 'Sale',
    'Standard - Paperback': 'Sale',
    'Free Promotion': 'Free',
    'Refund': 'Refund',
    'Borrow': 'Borrow',
  };
  
  return mapping[kdpType] || kdpType;
}

/**
 * Detecta el tipo de libro basándose en el campo "Tipo de regalía" de KDP
 * 
 * Mapeo de Amazon KDP:
 * - "Estándar" → ebook
 * - "Promoción gratuita" → ebook
 * - "Kindle Countdown Deals" → ebook
 * - "Estándar - Tapa blanda" → paperback
 * - "Estándar - Tapa dura" → hardcover
 * - "70%", "35%" → ebook (porcentajes de regalía de ebook)
 * - "60%" → paperback (porcentaje de regalía de libro impreso)
 * 
 * Retorna: "ebook", "paperback", "hardcover", o "unknown"
 */
function detectBookType(royaltyType: string): string {
  if (!royaltyType) return 'unknown';
  
  const type = royaltyType.toLowerCase().trim();
  
  // IMPORTANTE: Primero verificar libros impresos (más específicos)
  // porque "Estándar - Tapa blanda" contiene la palabra "estándar"
  if (type.includes('tapa blanda') || type.includes('paperback')) {
    return 'paperback';
  }
  if (type.includes('tapa dura') || type.includes('hardcover')) {
    return 'hardcover';
  }
  
  // Detectar por porcentaje de regalía (60% = impreso)
  if (type === '60%') {
    return 'paperback';
  }
  
  // Luego detectar ebooks (más genéricos)
  // Incluye: "Estándar", "Promoción gratuita", "Kindle Countdown Deals", "KENP leídas", etc.
  if (type.includes('kindle') || 
      type.includes('kenp') || 
      type.includes('estándar') || 
      type.includes('standard') || 
      type.includes('extendida') || 
      type.includes('extended') ||
      type.includes('countdown') || 
      type.includes('promoción') || 
      type.includes('promotion') ||
      type.includes('gratuita') ||
      type.includes('free') ||
      type === '70%' ||  // Regalía estándar de ebook
      type === '35%') {  // Regalía extendida de ebook
    return 'ebook';
  }
  
  return 'unknown';
}

/**
 * Obtiene o crea un seudónimo por nombre de autor
 * Retorna el seudónimo y una flag indicando si fue creado
 * 
 * IMPORTANTE: Primero busca si ya existe un seudónimo con ese nombre (case-insensitive)
 * para evitar crear duplicados. Solo crea uno nuevo si no existe.
 */
async function getOrCreatePenName(
  authorName: string,
  penNamesCache: Map<string, PenName>
): Promise<{ penName: PenName; wasCreated: boolean }> {
  const normalizedName = authorName.toLowerCase();
  
  // Buscar en cache
  const existing = penNamesCache.get(normalizedName);
  if (existing) {
    return { penName: existing, wasCreated: false };
  }
  
  // Buscar en base de datos si ya existe un seudónimo con ese nombre
  const existingPenNames = await storage.getPenNamesByName(authorName);
  
  if (existingPenNames.length > 0) {
    // Si existen duplicados, usar el más antiguo (menor ID)
    const oldestPenName = existingPenNames[0];
    penNamesCache.set(normalizedName, oldestPenName);
    return { penName: oldestPenName, wasCreated: false };
  }
  
  // Si no existe, crear nuevo seudónimo
  const newPenName = await storage.createPenName({
    name: authorName,
    description: `Creado automáticamente al importar datos de KDP`,
  });
  
  // Agregar al cache
  penNamesCache.set(normalizedName, newPenName);
  
  return { penName: newPenName, wasCreated: true };
}

/**
 * Obtiene o crea un libro por ASIN
 * Retorna el ID del libro y una flag indicando si fue creado
 */
async function getOrCreateBook(
  asin: string,
  title: string,
  penNameId: number,
  marketplace: string,
  booksCache: Map<string, { id: number; marketplaces: string[]; publishDate: Date | null; bookType?: string }>,
  royaltyType?: string
): Promise<{ bookId: number; wasCreated: boolean }> {
  // Buscar en cache
  const existing = booksCache.get(asin);
  
  // Detectar tipo de libro si se proporciona tipo de regalía
  const detectedType = royaltyType ? detectBookType(royaltyType) : 'unknown';
  
  if (existing) {
    // Actualizar marketplaces si no está incluido
    let needsUpdate = false;
    const updates: any = {};
    
    if (!existing.marketplaces.includes(marketplace)) {
      existing.marketplaces.push(marketplace);
      updates.marketplaces = existing.marketplaces;
      needsUpdate = true;
    }
    
    // Actualizar bookType si se detectó uno más específico
    if (detectedType !== 'unknown' && (!existing.bookType || existing.bookType === 'unknown')) {
      updates.bookType = detectedType;
      existing.bookType = detectedType;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await storage.updateAuraBook(existing.id, updates);
    }
    
    return { bookId: existing.id, wasCreated: false };
  }
  
  // Crear nuevo libro (publishDate se actualizará después con la primera venta)
  const book = await storage.createAuraBook({
    penNameId,
    seriesId: null,
    asin,
    title,
    subtitle: null,
    publishDate: null, // Se actualizará después
    price: null,
    marketplaces: [marketplace],
    bookType: detectedType,
  });
  
  // Agregar al cache
  booksCache.set(asin, {
    id: book.id,
    marketplaces: [marketplace],
    publishDate: null,
    bookType: detectedType,
  });
  
  return { bookId: book.id, wasCreated: true };
}

/**
 * Importa un archivo XLSX de KDP
 */
export async function importKdpXlsx(
  filePath: string,
  options: {
    deleteExisting?: boolean;
  } = {}
): Promise<ImportStats> {
  // Generar ID único para este batch de importación
  const batchId = `kdp-import-${nanoid()}`;

  const stats: ImportStats = {
    penNamesCreated: 0,
    booksCreated: 0,
    salesImported: 0,
    kenpImported: 0,
    importBatchId: batchId,
    errors: [],
  };

  try {
    // Leer el archivo
    const fileBuffer = readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    // Si se solicita, eliminar importación anterior con este batchId (no debería existir)
    if (options.deleteExisting) {
      await storage.deleteKdpSalesByBatchId(batchId);
    }

    // Inicializar caches para optimizar rendimiento
    const penNamesCache = new Map<string, PenName>();
    const booksCache = new Map<string, { id: number; marketplaces: string[]; publishDate: Date | null; bookType?: string }>();
    
    // Cargar pen names existentes en cache
    const existingPenNames = await storage.getAllPenNames();
    existingPenNames.forEach(pn => {
      penNamesCache.set(pn.name.toLowerCase(), pn);
    });
    
    // Cargar libros existentes en cache
    const existingBooks = await storage.getAllAuraBooks();
    existingBooks.forEach(book => {
      booksCache.set(book.asin, {
        id: book.id,
        marketplaces: [...book.marketplaces],
        publishDate: book.publishDate ? new Date(book.publishDate) : null,
        bookType: book.bookType || 'unknown',
      });
    });
    
    // Mapeo para tracking de fechas de publicación más tempranas por libro
    const bookEarliestDates = new Map<number, Date>();

    // Procesar hoja "Ventas combinadas"
    if (workbook.SheetNames.includes('Ventas combinadas')) {
      const worksheet = workbook.Sheets['Ventas combinadas'];
      const data = XLSX.utils.sheet_to_json<KdpCombinedSale>(worksheet);
      
      console.log(`[KDP Import] Procesando ${data.length} ventas combinadas...`);
      
      for (const row of data) {
        try {
          // Obtener o crear seudónimo
          const { penName, wasCreated: penNameCreated } = await getOrCreatePenName(
            row['Nombre del autor'],
            penNamesCache
          );
          if (penNameCreated) {
            stats.penNamesCreated++;
          }
          
          // Normalizar marketplace
          const marketplace = normalizeMarketplace(row['Tienda']);
          
          // Obtener o crear libro (pasando tipo de regalía para detectar si es ebook o impreso)
          const { bookId, wasCreated: bookCreated } = await getOrCreateBook(
            row['ASIN/ISBN'],
            row['Título'],
            penName.id,
            marketplace,
            booksCache,
            row['Tipo de regalía'] // Pasar tipo de regalía para detectar formato del libro
          );
          if (bookCreated) {
            stats.booksCreated++;
          }
          
          // Validar fecha
          const saleDate = parseExcelDate(row['Fecha de las regalías']);
          if (!saleDate) {
            stats.errors.push(`Fecha inválida para ${row['Título']}, fila omitida`);
            continue;
          }
          
          // Normalizar tipo de transacción
          const transactionType = normalizeTransactionType(row['Tipo de transacción']);
          
          // Crear registro de venta
          await storage.createKdpSale({
            bookId,
            penNameId: penName.id,
            saleDate,
            marketplace,
            transactionType: transactionType as any,
            royaltyType: row['Tipo de regalía'], // Guardar tipo de regalía para detectar formato del libro
            royalty: row['Regalías'].toString(),
            currency: row['Moneda'],
            unitsOrPages: row['Unidades netas vendidas'],
            asin: row['ASIN/ISBN'],
            title: row['Título'],
            importBatchId: batchId,
          });
          
          // Solo rastrear fecha de publicación para VENTAS reales (no KENP ni Free)
          if (transactionType === "Sale") {
            if (!bookEarliestDates.has(bookId) || saleDate < bookEarliestDates.get(bookId)!) {
              bookEarliestDates.set(bookId, saleDate);
            }
          }
          
          stats.salesImported++;
        } catch (error) {
          stats.errors.push(`Error procesando venta: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }
    }

    // Procesar hoja "KENP leídas"
    if (workbook.SheetNames.includes('KENP leídas')) {
      const worksheet = workbook.Sheets['KENP leídas'];
      const data = XLSX.utils.sheet_to_json<KdpKenpRead>(worksheet);
      
      console.log(`[KDP Import] Procesando ${data.length} lecturas KENP...`);
      
      for (const row of data) {
        try {
          // Obtener o crear seudónimo
          const { penName, wasCreated: penNameCreated } = await getOrCreatePenName(
            row['Nombre del autor'],
            penNamesCache
          );
          if (penNameCreated) {
            stats.penNamesCreated++;
          }
          
          // Normalizar marketplace
          const marketplace = normalizeMarketplace(row['Tienda']);
          
          // Obtener o crear libro (KENP solo existe para ebooks)
          const { bookId, wasCreated: bookCreated } = await getOrCreateBook(
            row['ASIN'],
            row['Título'],
            penName.id,
            marketplace,
            booksCache,
            'KENP leídas' // Tipo de regalía ficticio para indicar que es ebook
          );
          if (bookCreated) {
            stats.booksCreated++;
          }
          
          // Validar fecha
          const saleDate = parseExcelDate(row['Fecha']);
          if (!saleDate) {
            stats.errors.push(`Fecha inválida para ${row['Título']}, fila omitida`);
            continue;
          }
          
          // Crear registro KENP (regalías por página se calculan después)
          await storage.createKdpSale({
            bookId,
            penNameId: penName.id,
            saleDate,
            marketplace,
            transactionType: 'KENP Read',
            royaltyType: 'KENP leídas', // Indicar que es un ebook
            royalty: '0', // Se calcula por el total de páginas del mes
            currency: 'USD', // KENP siempre en USD
            unitsOrPages: row['Páginas KENP leídas'],
            asin: row['ASIN'],
            title: row['Título'],
            importBatchId: batchId,
          });
          
          stats.kenpImported++;
        } catch (error) {
          stats.errors.push(`Error procesando KENP: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }
    }

    // Procesar hoja "Pedidos completados de eBooks" (promociones gratuitas adicionales)
    if (workbook.SheetNames.includes('Pedidos completados de eBooks')) {
      const worksheet = workbook.Sheets['Pedidos completados de eBooks'];
      const data = XLSX.utils.sheet_to_json<KdpFreeOrder>(worksheet);
      
      console.log(`[KDP Import] Procesando ${data.length} pedidos gratuitos...`);
      
      for (const row of data) {
        try {
          if (row['Unidades gratuitas'] > 0) {
            // Obtener o crear seudónimo
            const { penName, wasCreated: penNameCreated } = await getOrCreatePenName(
              row['Nombre del autor'],
              penNamesCache
            );
            if (penNameCreated) {
              stats.penNamesCreated++;
            }
            
            // Normalizar marketplace
            const marketplace = normalizeMarketplace(row['Tienda']);
            
            // Obtener o crear libro (Pedidos gratuitos solo existen para ebooks)
            const { bookId, wasCreated: bookCreated } = await getOrCreateBook(
              row['ASIN'],
              row['Título'],
              penName.id,
              marketplace,
              booksCache,
              'Promoción gratuita' // Tipo de regalía ficticio para indicar que es ebook
            );
            if (bookCreated) {
              stats.booksCreated++;
            }
            
            // Validar fecha
            const saleDate = parseExcelDate(row['Fecha']);
            if (!saleDate) {
              stats.errors.push(`Fecha inválida para ${row['Título']}, fila omitida`);
              continue;
            }
            
            // Crear registro de promoción gratuita
            await storage.createKdpSale({
              bookId,
              penNameId: penName.id,
              saleDate,
              marketplace,
              transactionType: 'Free',
              royaltyType: 'Promoción gratuita', // Indicar que es un ebook
              royalty: '0',
              currency: 'USD',
              unitsOrPages: row['Unidades gratuitas'],
              asin: row['ASIN'],
              title: row['Título'],
              importBatchId: batchId,
            });
            
            stats.salesImported++;
          }
        } catch (error) {
          stats.errors.push(`Error procesando pedido gratuito: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }
    }

    // Actualizar fechas de publicación de libros basándose en la primera venta
    console.log(`[KDP Import] Actualizando fechas de publicación para ${bookEarliestDates.size} libros...`);
    for (const [bookId, publishDate] of Array.from(bookEarliestDates.entries())) {
      const cachedBook = Array.from(booksCache.values()).find(b => b.id === bookId);
      if (!cachedBook?.publishDate || publishDate < cachedBook.publishDate) {
        await storage.updateAuraBook(bookId, { publishDate });
        console.log(`[KDP Import] Libro ID ${bookId} → publishDate: ${publishDate.toISOString()}`);
      }
    }

    console.log(`[KDP Import] Importación completada:`);
    console.log(`  - Seudónimos: ${stats.penNamesCreated}`);
    console.log(`  - Libros: ${stats.booksCreated}`);
    console.log(`  - Ventas: ${stats.salesImported}`);
    console.log(`  - KENP: ${stats.kenpImported}`);
    console.log(`  - Errores: ${stats.errors.length}`);
    
    return stats;
  } catch (error) {
    stats.errors.push(`Error fatal: ${error instanceof Error ? error.message : 'Unknown'}`);
    throw error;
  }
}

// ============================================================================
// AURA UNLIMITED - Importación de datos mensuales KENP
// ============================================================================

export interface KenpMonthlyRecord {
  asin: string;
  title: string;
  authorName: string;
  month: string; // Formato: 'YYYY-MM'
  totalKenpPages: number;
  marketplaces: string[];
}

export interface KenpImportStats {
  monthlyRecordsCreated: number;
  penNamesProcessed: number;
  errors: string[];
}

/**
 * Parsea un archivo XLSX de KENP y genera datos mensuales agregados
 * IMPORTANTE: Este reempl aza todos los datos KENP anteriores
 */
export async function parseKenpMonthlyFile(filePath: string): Promise<{
  records: KenpMonthlyRecord[];
  stats: KenpImportStats;
}> {
  const stats: KenpImportStats = {
    monthlyRecordsCreated: 0,
    penNamesProcessed: 0,
    errors: [],
  };

  try {
    console.log(`[KENP Import] Leyendo archivo: ${filePath}`);
    const fileBuffer = readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Buscar la hoja "KENP leídas"
    const sheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes('kenp') && name.toLowerCase().includes('leída')
    );

    if (!sheetName) {
      throw new Error('No se encontró la hoja "KENP leídas" en el archivo');
    }

    console.log(`[KENP Import] Procesando hoja: "${sheetName}"`);
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any>(sheet);

    if (rows.length === 0) {
      throw new Error('La hoja KENP no contiene datos');
    }

    console.log(`[KENP Import] Encontradas ${rows.length} filas de datos KENP`);

    // Agrupar por ASIN + mes
    const monthlyData = new Map<string, {
      asin: string;
      title: string;
      authorName: string;
      month: string;
      pages: number;
      marketplaces: Set<string>;
    }>();

    for (const row of rows) {
      try {
        // Extraer datos del row (las columnas pueden variar según idioma)
        const dateValue = row['Fecha'] || row['Date'];
        const asin = row['ASIN'];
        const title = row['Título'] || row['Title'];
        const authorName = row['Nombre del autor'] || row['Author Name'];
        const marketplace = row['Tienda'] || row['Marketplace'];
        const kenpPages = parseInt(row['Páginas KENP leídas'] || row['KENP Read'] || '0', 10);

        if (!asin || !dateValue || isNaN(kenpPages)) {
          continue; // Skip invalid rows
        }

        // Parsear fecha y extraer mes (formato YYYY-MM)
        const date = parseExcelDate(dateValue);
        if (!date) {
          stats.errors.push(`Fecha inválida para ASIN ${asin}`);
          continue;
        }

        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const normalizedMarketplace = normalizeMarketplace(marketplace);

        // Clave única: ASIN + mes
        const key = `${asin}:${month}`;

        if (!monthlyData.has(key)) {
          monthlyData.set(key, {
            asin,
            title,
            authorName,
            month,
            pages: 0,
            marketplaces: new Set(),
          });
        }

        const record = monthlyData.get(key)!;
        record.pages += kenpPages;
        record.marketplaces.add(normalizedMarketplace);
      } catch (error) {
        stats.errors.push(`Error procesando fila KENP: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    // Convertir a array de records
    const records: KenpMonthlyRecord[] = Array.from(monthlyData.values()).map(item => ({
      asin: item.asin,
      title: item.title,
      authorName: item.authorName,
      month: item.month,
      totalKenpPages: item.pages,
      marketplaces: Array.from(item.marketplaces),
    }));

    stats.monthlyRecordsCreated = records.length;

    console.log(`[KENP Import] Agregación completada:`);
    console.log(`  - Registros mensuales: ${records.length}`);
    console.log(`  - Errores: ${stats.errors.length}`);

    return { records, stats };
  } catch (error) {
    stats.errors.push(`Error fatal: ${error instanceof Error ? error.message : 'Unknown'}`);
    throw error;
  }
}

/**
 * Importa datos KENP mensuales a la base de datos
 * IMPORTANTE: REEMPLAZA todos los datos anteriores
 */
export async function importKenpMonthlyData(filePath: string): Promise<KenpImportStats> {
  const { records, stats } = await parseKenpMonthlyFile(filePath);

  try {
    console.log(`[KENP Import] Eliminando datos KENP anteriores...`);
    // PASO 1: ELIMINAR todos los datos KENP anteriores
    await storage.deleteAllKenpMonthlyData();

    console.log(`[KENP Import] Importando ${records.length} registros mensuales...`);

    // PASO 2: Obtener/crear seudónimos y libros
    const penNamesCache = new Map<string, PenName>();
    const booksCache = new Map<string, { id: number; marketplaces: string[]; publishDate: Date | null }>();

    // Procesar todos los autores únicos
    const uniqueAuthors = new Set(records.map(r => r.authorName));
    for (const authorName of Array.from(uniqueAuthors)) {
      const { penName } = await getOrCreatePenName(authorName, penNamesCache);
      stats.penNamesProcessed++;
    }

    // PASO 3: Insertar nuevos registros KENP mensuales
    for (const record of records) {
      try {
        // Obtener penName
        const { penName } = await getOrCreatePenName(record.authorName, penNamesCache);

        // Obtener o crear libro (KENP solo existe para ebooks)
        const { bookId } = await getOrCreateBook(
          record.asin,
          record.title,
          penName.id,
          record.marketplaces[0], // usar primer marketplace
          booksCache,
          'KENP leídas' // Tipo de regalía ficticio para indicar que es ebook
        );

        // Insertar registro mensual KENP
        await storage.createKenpMonthlyData({
          bookId,
          asin: record.asin,
          penNameId: penName.id,
          month: record.month,
          totalKenpPages: record.totalKenpPages,
          marketplaces: record.marketplaces,
          importedAt: new Date(),
        });
      } catch (error) {
        stats.errors.push(`Error insertando KENP para ${record.asin}: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    console.log(`[KENP Import] Importación KENP completada exitosamente`);
    return stats;
  } catch (error) {
    stats.errors.push(`Error en importación KENP: ${error instanceof Error ? error.message : 'Unknown'}`);
    throw error;
  }
}

// ============================================================================
// AURA VENTAS - Procesamiento de ventas mensuales por tipo de libro
// ============================================================================

export interface SalesImportStats {
  monthlyRecordsCreated: number;
  errors: string[];
}

/**
 * Procesa ventas de kdpSales y genera datos mensuales agregados por tipo de libro
 * IMPORTANTE: Los datos se ACUMULAN (no se reemplazan)
 */
export async function processSalesMonthlyData(batchId: string): Promise<SalesImportStats> {
  const stats: SalesImportStats = {
    monthlyRecordsCreated: 0,
    errors: [],
  };

  try {
    console.log(`[Sales Import] Procesando ventas del batch: ${batchId}`);
    
    // Obtener todas las ventas del batch actual
    const allSales = await storage.getAllKdpSales();
    const batchSales = allSales.filter(sale => 
      sale.importBatchId === batchId && 
      sale.transactionType === 'Sale' // Solo ventas reales
    );

    console.log(`[Sales Import] Encontradas ${batchSales.length} ventas para procesar`);

    // Obtener todos los libros para saber su bookType
    const allBooks = await storage.getAllAuraBooks();
    const booksMap = new Map(allBooks.map(book => [book.id, book]));

    // Agrupar por: ASIN + mes + bookType
    const monthlyData = new Map<string, {
      asin: string;
      bookId: number | null;
      penNameId: number;
      month: string;
      bookType: string;
      totalUnits: number;
      totalRoyalty: number;
      currency: string;
      marketplaces: Set<string>;
    }>();

    for (const sale of batchSales) {
      try {
        // Saltar ventas sin ASIN
        if (!sale.asin) {
          continue;
        }

        const saleDate = new Date(sale.saleDate);
        const month = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
        
        // Detectar tipo de libro desde royaltyType (más confiable que aura_books)
        const bookType = sale.royaltyType ? detectBookType(sale.royaltyType) : 'unknown';
        
        // Clave única: ASIN + mes + bookType
        const key = `${sale.asin}:${month}:${bookType}`;

        if (!monthlyData.has(key)) {
          monthlyData.set(key, {
            asin: sale.asin,
            bookId: sale.bookId,
            penNameId: sale.penNameId,
            month,
            bookType,
            totalUnits: 0,
            totalRoyalty: 0,
            currency: sale.currency,
            marketplaces: new Set(),
          });
        }

        const record = monthlyData.get(key)!;
        record.totalUnits += (sale.unitsOrPages || 0);
        record.totalRoyalty += parseFloat(sale.royalty || '0');
        record.marketplaces.add(sale.marketplace);
      } catch (error) {
        stats.errors.push(`Error procesando venta: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    console.log(`[Sales Import] Generados ${monthlyData.size} registros mensuales únicos`);

    // Insertar registros mensuales
    const recordsToInsert = Array.from(monthlyData.values()).map(record => ({
      bookId: record.bookId,
      asin: record.asin,
      penNameId: record.penNameId,
      month: record.month,
      bookType: record.bookType,
      totalUnits: record.totalUnits,
      totalRoyalty: record.totalRoyalty.toFixed(2),
      currency: record.currency,
      marketplaces: Array.from(record.marketplaces),
      importedAt: new Date(),
    }));

    if (recordsToInsert.length > 0) {
      await storage.bulkCreateSalesMonthlyData(recordsToInsert);
      stats.monthlyRecordsCreated = recordsToInsert.length;
    }

    console.log(`[Sales Import] Importación de ventas completada: ${stats.monthlyRecordsCreated} registros creados`);
    return stats;
  } catch (error) {
    stats.errors.push(`Error en procesamiento de ventas: ${error instanceof Error ? error.message : 'Unknown'}`);
    throw error;
  }
}

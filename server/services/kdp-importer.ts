import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { storage } from '../storage';
import type { InsertKdpSale, InsertAuraBook, PenName } from '@shared/schema';
import { nanoid } from 'nanoid';

/**
 * Converts an ExcelJS worksheet to JSON array (similar to xlsx's sheet_to_json)
 */
function worksheetToJson<T = Record<string, any>>(worksheet: ExcelJS.Worksheet): T[] {
  const rows: T[] = [];
  const headers: string[] = [];
  
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        headers.push(cell.value?.toString() || '');
      });
    } else {
      const rowData: Record<string, any> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          rowData[header] = cell.value ?? null;
        }
      });
      if (Object.keys(rowData).length > 0) {
        rows.push(rowData as T);
      }
    }
  });
  
  return rows;
}

/**
 * Parsea una fecha de Excel que puede venir como número serial o como string
 * Excel almacena fechas como números (días desde 1900-01-01)
 * Retorna null si la fecha no es válida para que pueda ser manejada apropiadamente
 */
function parseExcelDate(value: any): Date | null {
  if (!value || value === 0 || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && value > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const msPerDay = 24 * 60 * 60 * 1000;
    const date = new Date(excelEpoch.getTime() + value * msPerDay);
    
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

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
    'Venta': 'Sale',
    'Promoción gratuita': 'Free',
    'Devolución': 'Refund',
    'Préstamo': 'Borrow',
    'KENP leídas': 'KENP Read',
    'Estándar': 'Sale',
    'Estándar - Tapa blanda': 'Sale',
    'Kindle Countdown Deals': 'Sale',
    'Promociones de Kindle': 'Sale',
    'Extendida': 'Sale',
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
 */
function detectBookType(royaltyType: string): string {
  if (!royaltyType) return 'unknown';
  
  const type = royaltyType.toLowerCase().trim();
  
  if (type.includes('tapa blanda') || type.includes('paperback')) {
    return 'paperback';
  }
  if (type.includes('tapa dura') || type.includes('hardcover')) {
    return 'hardcover';
  }
  
  if (type === '60%') {
    return 'paperback';
  }
  
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
      type === '70%' ||
      type === '35%') {
    return 'ebook';
  }
  
  return 'unknown';
}

/**
 * Obtiene o crea un seudónimo por nombre de autor
 */
async function getOrCreatePenName(
  authorName: string,
  penNamesCache: Map<string, PenName>
): Promise<{ penName: PenName; wasCreated: boolean }> {
  const normalizedName = authorName.toLowerCase();
  
  const existing = penNamesCache.get(normalizedName);
  if (existing) {
    return { penName: existing, wasCreated: false };
  }
  
  const existingPenNames = await storage.getPenNamesByName(authorName);
  
  if (existingPenNames.length > 0) {
    const oldestPenName = existingPenNames[0];
    penNamesCache.set(normalizedName, oldestPenName);
    return { penName: oldestPenName, wasCreated: false };
  }
  
  const newPenName = await storage.createPenName({
    name: authorName,
    description: `Creado automáticamente al importar datos de KDP`,
  });
  
  penNamesCache.set(normalizedName, newPenName);
  
  return { penName: newPenName, wasCreated: true };
}

/**
 * Obtiene o crea un libro por ASIN
 */
async function getOrCreateBook(
  asin: string,
  title: string,
  penNameId: number,
  marketplace: string,
  booksCache: Map<string, { id: number; marketplaces: string[]; publishDate: Date | null; bookType?: string }>,
  royaltyType?: string
): Promise<{ bookId: number; wasCreated: boolean }> {
  const existing = booksCache.get(asin);
  
  const detectedType = royaltyType ? detectBookType(royaltyType) : 'unknown';
  
  if (existing) {
    let needsUpdate = false;
    const updates: any = {};
    
    if (!existing.marketplaces.includes(marketplace)) {
      existing.marketplaces.push(marketplace);
      updates.marketplaces = existing.marketplaces;
      needsUpdate = true;
    }
    
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
  
  const book = await storage.createAuraBook({
    penNameId,
    seriesId: null,
    asin,
    title,
    subtitle: null,
    publishDate: null,
    price: null,
    marketplaces: [marketplace],
    bookType: detectedType,
  });
  
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
    const fileBuffer = readFileSync(filePath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    const sheetNames = workbook.worksheets.map(ws => ws.name);
    
    if (options.deleteExisting) {
      await storage.deleteKdpSalesByBatchId(batchId);
    }

    const penNamesCache = new Map<string, PenName>();
    const booksCache = new Map<string, { id: number; marketplaces: string[]; publishDate: Date | null; bookType?: string }>();
    
    const existingPenNames = await storage.getAllPenNames();
    existingPenNames.forEach(pn => {
      penNamesCache.set(pn.name.toLowerCase(), pn);
    });
    
    const existingBooks = await storage.getAllAuraBooks();
    existingBooks.forEach(book => {
      booksCache.set(book.asin, {
        id: book.id,
        marketplaces: [...book.marketplaces],
        publishDate: book.publishDate ? new Date(book.publishDate) : null,
        bookType: book.bookType || 'unknown',
      });
    });
    
    const bookEarliestDates = new Map<number, Date>();

    if (sheetNames.includes('Ventas combinadas')) {
      const worksheet = workbook.getWorksheet('Ventas combinadas')!;
      const data = worksheetToJson<KdpCombinedSale>(worksheet);
      
      console.log(`[KDP Import] Procesando ${data.length} ventas combinadas...`);
      
      for (const row of data) {
        try {
          const { penName, wasCreated: penNameCreated } = await getOrCreatePenName(
            row['Nombre del autor'],
            penNamesCache
          );
          if (penNameCreated) {
            stats.penNamesCreated++;
          }
          
          const marketplace = normalizeMarketplace(row['Tienda']);
          
          const { bookId, wasCreated: bookCreated } = await getOrCreateBook(
            row['ASIN/ISBN'],
            row['Título'],
            penName.id,
            marketplace,
            booksCache,
            row['Tipo de regalía']
          );
          if (bookCreated) {
            stats.booksCreated++;
          }
          
          const saleDate = parseExcelDate(row['Fecha de las regalías']);
          if (!saleDate) {
            stats.errors.push(`Fecha inválida para ${row['Título']}, fila omitida`);
            continue;
          }
          
          const transactionType = normalizeTransactionType(row['Tipo de transacción']);
          
          await storage.createKdpSale({
            bookId,
            penNameId: penName.id,
            saleDate,
            marketplace,
            transactionType: transactionType as any,
            royaltyType: row['Tipo de regalía'],
            royalty: row['Regalías'].toString(),
            currency: row['Moneda'],
            unitsOrPages: row['Unidades netas vendidas'],
            asin: row['ASIN/ISBN'],
            title: row['Título'],
            importBatchId: batchId,
          });
          
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

    if (sheetNames.includes('KENP leídas')) {
      const worksheet = workbook.getWorksheet('KENP leídas')!;
      const data = worksheetToJson<KdpKenpRead>(worksheet);
      
      console.log(`[KDP Import] Procesando ${data.length} lecturas KENP...`);
      
      for (const row of data) {
        try {
          const { penName, wasCreated: penNameCreated } = await getOrCreatePenName(
            row['Nombre del autor'],
            penNamesCache
          );
          if (penNameCreated) {
            stats.penNamesCreated++;
          }
          
          const marketplace = normalizeMarketplace(row['Tienda']);
          
          const { bookId, wasCreated: bookCreated } = await getOrCreateBook(
            row['ASIN'],
            row['Título'],
            penName.id,
            marketplace,
            booksCache,
            'KENP leídas'
          );
          if (bookCreated) {
            stats.booksCreated++;
          }
          
          const saleDate = parseExcelDate(row['Fecha']);
          if (!saleDate) {
            stats.errors.push(`Fecha inválida para ${row['Título']}, fila omitida`);
            continue;
          }
          
          await storage.createKdpSale({
            bookId,
            penNameId: penName.id,
            saleDate,
            marketplace,
            transactionType: 'KENP Read',
            royaltyType: 'KENP leídas',
            royalty: '0',
            currency: 'USD',
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

    if (sheetNames.includes('Pedidos completados de eBooks')) {
      const worksheet = workbook.getWorksheet('Pedidos completados de eBooks')!;
      const data = worksheetToJson<KdpFreeOrder>(worksheet);
      
      console.log(`[KDP Import] Procesando ${data.length} pedidos gratuitos...`);
      
      for (const row of data) {
        try {
          if (row['Unidades gratuitas'] > 0) {
            const { penName, wasCreated: penNameCreated } = await getOrCreatePenName(
              row['Nombre del autor'],
              penNamesCache
            );
            if (penNameCreated) {
              stats.penNamesCreated++;
            }
            
            const marketplace = normalizeMarketplace(row['Tienda']);
            
            const { bookId, wasCreated: bookCreated } = await getOrCreateBook(
              row['ASIN'],
              row['Título'],
              penName.id,
              marketplace,
              booksCache,
              'Promoción gratuita'
            );
            if (bookCreated) {
              stats.booksCreated++;
            }
            
            const saleDate = parseExcelDate(row['Fecha']);
            if (!saleDate) {
              stats.errors.push(`Fecha inválida para ${row['Título']}, fila omitida`);
              continue;
            }
            
            await storage.createKdpSale({
              bookId,
              penNameId: penName.id,
              saleDate,
              marketplace,
              transactionType: 'Free',
              royaltyType: 'Promoción gratuita',
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

export interface KenpMonthlyRecord {
  asin: string;
  title: string;
  authorName: string;
  month: string;
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
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);

    const sheetNames = workbook.worksheets.map(ws => ws.name);
    const sheetName = sheetNames.find(name => 
      name.toLowerCase().includes('kenp') && name.toLowerCase().includes('leída')
    );

    if (!sheetName) {
      throw new Error('No se encontró la hoja "KENP leídas" en el archivo');
    }

    console.log(`[KENP Import] Procesando hoja: "${sheetName}"`);
    const sheet = workbook.getWorksheet(sheetName)!;
    const rows = worksheetToJson<any>(sheet);

    if (rows.length === 0) {
      throw new Error('La hoja KENP no contiene datos');
    }

    console.log(`[KENP Import] Encontradas ${rows.length} filas de datos KENP`);

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
        const dateValue = row['Fecha'] || row['Date'];
        const asin = row['ASIN'];
        const title = row['Título'] || row['Title'];
        const authorName = row['Nombre del autor'] || row['Author Name'];
        const marketplace = row['Tienda'] || row['Marketplace'];
        const kenpPages = parseInt(row['Páginas KENP leídas'] || row['KENP Read'] || '0', 10);

        if (!asin || !dateValue || isNaN(kenpPages)) {
          continue;
        }

        const date = parseExcelDate(dateValue);
        if (!date) {
          stats.errors.push(`Fecha inválida para ASIN ${asin}`);
          continue;
        }

        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const normalizedMarketplace = normalizeMarketplace(marketplace);

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
 */
export async function importKenpMonthlyData(filePath: string): Promise<KenpImportStats> {
  const { records, stats } = await parseKenpMonthlyFile(filePath);

  try {
    console.log(`[KENP Import] Eliminando datos KENP anteriores...`);
    await storage.deleteAllKenpMonthlyData();

    console.log(`[KENP Import] Importando ${records.length} registros mensuales...`);

    const penNamesCache = new Map<string, PenName>();
    const booksCache = new Map<string, { id: number; marketplaces: string[]; publishDate: Date | null }>();

    const uniqueAuthors = new Set(records.map(r => r.authorName));
    for (const authorName of Array.from(uniqueAuthors)) {
      const { penName } = await getOrCreatePenName(authorName, penNamesCache);
      stats.penNamesProcessed++;
    }

    for (const record of records) {
      try {
        const { penName } = await getOrCreatePenName(record.authorName, penNamesCache);

        const { bookId } = await getOrCreateBook(
          record.asin,
          record.title,
          penName.id,
          record.marketplaces[0],
          booksCache,
          'KENP leídas'
        );

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

export interface SalesImportStats {
  monthlyRecordsCreated: number;
  errors: string[];
}

/**
 * Procesa ventas de kdpSales y genera datos mensuales agregados por tipo de libro
 */
export async function processSalesMonthlyData(batchId: string): Promise<SalesImportStats> {
  const stats: SalesImportStats = {
    monthlyRecordsCreated: 0,
    errors: [],
  };

  try {
    console.log(`[Sales Import] Procesando ventas del batch: ${batchId}`);
    
    const allSales = await storage.getAllKdpSales();
    const batchSales = allSales.filter(sale => 
      sale.importBatchId === batchId && 
      sale.transactionType === 'Sale'
    );

    console.log(`[Sales Import] Encontradas ${batchSales.length} ventas para procesar`);

    const allBooks = await storage.getAllAuraBooks();
    const booksMap = new Map(allBooks.map(book => [book.id, book]));

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
        if (!sale.asin) {
          continue;
        }

        const saleDate = new Date(sale.saleDate);
        const month = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
        
        const bookType = sale.royaltyType ? detectBookType(sale.royaltyType) : 'unknown';
        
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

import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { storage } from '../storage';
import type { InsertKdpSale, InsertAuraBook, PenName } from '@shared/schema';
import { nanoid } from 'nanoid';

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
  };
  
  return mapping[kdpType] || kdpType;
}

/**
 * Obtiene o crea un seudónimo por nombre de autor
 * Retorna el seudónimo y una flag indicando si fue creado
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
  
  // Crear nuevo seudónimo
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
  booksCache: Map<string, { id: number; marketplaces: string[] }>
): Promise<{ bookId: number; wasCreated: boolean }> {
  // Buscar en cache
  const existing = booksCache.get(asin);
  
  if (existing) {
    // Actualizar marketplaces si no está incluido
    if (!existing.marketplaces.includes(marketplace)) {
      existing.marketplaces.push(marketplace);
      await storage.updateAuraBook(existing.id, {
        marketplaces: existing.marketplaces,
      });
    }
    return { bookId: existing.id, wasCreated: false };
  }
  
  // Crear nuevo libro
  const book = await storage.createAuraBook({
    penNameId,
    seriesId: null,
    asin,
    title,
    subtitle: null,
    publishDate: null,
    price: null,
    marketplaces: [marketplace],
  });
  
  // Agregar al cache
  booksCache.set(asin, {
    id: book.id,
    marketplaces: [marketplace],
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
  const stats: ImportStats = {
    penNamesCreated: 0,
    booksCreated: 0,
    salesImported: 0,
    kenpImported: 0,
    errors: [],
  };

  try {
    // Leer el archivo
    const fileBuffer = readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    // Generar ID único para este batch de importación
    const batchId = `kdp-import-${nanoid()}`;
    
    // Si se solicita, eliminar importación anterior con este batchId (no debería existir)
    if (options.deleteExisting) {
      await storage.deleteKdpSalesByBatchId(batchId);
    }

    // Inicializar caches para optimizar rendimiento
    const penNamesCache = new Map<string, PenName>();
    const booksCache = new Map<string, { id: number; marketplaces: string[] }>();
    
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
      });
    });

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
          
          // Obtener o crear libro
          const { bookId, wasCreated: bookCreated } = await getOrCreateBook(
            row['ASIN/ISBN'],
            row['Título'],
            penName.id,
            marketplace,
            booksCache
          );
          if (bookCreated) {
            stats.booksCreated++;
          }
          
          // Normalizar tipo de transacción
          const transactionType = normalizeTransactionType(row['Tipo de transacción']);
          
          // Crear registro de venta
          await storage.createKdpSale({
            bookId,
            penNameId: penName.id,
            saleDate: new Date(row['Fecha de las regalías']),
            marketplace,
            transactionType: transactionType as any,
            royalty: row['Regalías'].toString(),
            currency: row['Moneda'],
            unitsOrPages: row['Unidades netas vendidas'],
            asin: row['ASIN/ISBN'],
            title: row['Título'],
            importBatchId: batchId,
          });
          
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
          
          // Obtener o crear libro
          const { bookId, wasCreated: bookCreated } = await getOrCreateBook(
            row['ASIN'],
            row['Título'],
            penName.id,
            marketplace,
            booksCache
          );
          if (bookCreated) {
            stats.booksCreated++;
          }
          
          // Crear registro KENP (regalías por página se calculan después)
          await storage.createKdpSale({
            bookId,
            penNameId: penName.id,
            saleDate: new Date(row['Fecha']),
            marketplace,
            transactionType: 'KENP Read',
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
            
            // Obtener o crear libro
            const { bookId, wasCreated: bookCreated } = await getOrCreateBook(
              row['ASIN'],
              row['Título'],
              penName.id,
              marketplace,
              booksCache
            );
            if (bookCreated) {
              stats.booksCreated++;
            }
            
            // Crear registro de promoción gratuita
            await storage.createKdpSale({
              bookId,
              penNameId: penName.id,
              saleDate: new Date(row['Fecha']),
              marketplace,
              transactionType: 'Free',
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

import * as XLSX from 'xlsx';
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
 */
async function getOrCreatePenName(authorName: string): Promise<PenName> {
  const allPenNames = await storage.getAllPenNames();
  const existing = allPenNames.find(p => p.name.toLowerCase() === authorName.toLowerCase());
  
  if (existing) {
    return existing;
  }
  
  // Crear nuevo seudónimo
  return await storage.createPenName({
    name: authorName,
    description: `Creado automáticamente al importar datos de KDP`,
  });
}

/**
 * Obtiene o crea un libro por ASIN
 */
async function getOrCreateBook(
  asin: string,
  title: string,
  penNameId: number,
  marketplace: string
): Promise<number> {
  const existing = await storage.getAuraBookByAsin(asin);
  
  if (existing) {
    // Actualizar marketplaces si no está incluido
    if (!existing.marketplaces.includes(marketplace)) {
      await storage.updateAuraBook(existing.id, {
        marketplaces: [...existing.marketplaces, marketplace],
      });
    }
    return existing.id;
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
  
  return book.id;
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
    const workbook = XLSX.readFile(filePath);
    
    // Generar ID único para este batch de importación
    const batchId = `kdp-import-${nanoid()}`;
    
    // Si se solicita, eliminar importación anterior con este batchId (no debería existir)
    if (options.deleteExisting) {
      await storage.deleteKdpSalesByBatchId(batchId);
    }

    // Procesar hoja "Ventas combinadas"
    if (workbook.SheetNames.includes('Ventas combinadas')) {
      const worksheet = workbook.Sheets['Ventas combinadas'];
      const data = XLSX.utils.sheet_to_json<KdpCombinedSale>(worksheet);
      
      console.log(`[KDP Import] Procesando ${data.length} ventas combinadas...`);
      
      for (const row of data) {
        try {
          // Obtener o crear seudónimo
          const penName = await getOrCreatePenName(row['Nombre del autor']);
          if (!stats.penNamesCreated && penName) {
            // Solo contar si fue creado nuevo (aproximación)
            const allPenNames = await storage.getAllPenNames();
            stats.penNamesCreated = allPenNames.length;
          }
          
          // Normalizar marketplace
          const marketplace = normalizeMarketplace(row['Tienda']);
          
          // Obtener o crear libro
          const bookId = await getOrCreateBook(
            row['ASIN/ISBN'],
            row['Título'],
            penName.id,
            marketplace
          );
          
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
          const penName = await getOrCreatePenName(row['Nombre del autor']);
          
          // Normalizar marketplace
          const marketplace = normalizeMarketplace(row['Tienda']);
          
          // Obtener o crear libro
          const bookId = await getOrCreateBook(
            row['ASIN'],
            row['Título'],
            penName.id,
            marketplace
          );
          
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
            const penName = await getOrCreatePenName(row['Nombre del autor']);
            
            // Normalizar marketplace
            const marketplace = normalizeMarketplace(row['Tienda']);
            
            // Obtener o crear libro
            const bookId = await getOrCreateBook(
              row['ASIN'],
              row['Título'],
              penName.id,
              marketplace
            );
            
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

    // Contar libros creados
    const allBooks = await storage.getAllAuraBooks();
    stats.booksCreated = allBooks.length;

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

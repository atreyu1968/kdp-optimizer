import { importKdpXlsx } from './services/kdp-importer';
import { storage } from './storage';

/**
 * Script de prueba para importar archivo XLSX de KDP
 */
async function testImport() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.error('Error: Debes proporcionar la ruta del archivo XLSX');
    console.log('Uso: tsx server/test-kdp-import.ts <ruta-archivo.xlsx>');
    process.exit(1);
  }

  console.log('=== Iniciando prueba de importación KDP ===\n');
  
  try {
    // Importar el archivo
    const stats = await importKdpXlsx(filePath);
    
    console.log('\n=== Resultado de la importación ===');
    console.log(`✅ Seudónimos: ${stats.penNamesCreated}`);
    console.log(`✅ Libros: ${stats.booksCreated}`);
    console.log(`✅ Ventas importadas: ${stats.salesImported}`);
    console.log(`✅ Páginas KENP importadas: ${stats.kenpImported}`);
    
    if (stats.errors.length > 0) {
      console.log(`\n⚠️  Errores (${stats.errors.length}):`);
      stats.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    // Mostrar datos importados
    console.log('\n=== Datos importados ===\n');
    
    const penNames = await storage.getAllPenNames();
    console.log('Seudónimos:');
    penNames.forEach(pn => {
      console.log(`  - ${pn.name} (ID: ${pn.id})`);
    });
    
    const books = await storage.getAllAuraBooks();
    console.log(`\nLibros (${books.length}):`);
    books.slice(0, 5).forEach(book => {
      console.log(`  - ${book.title}`);
      console.log(`    ASIN: ${book.asin}`);
      console.log(`    Marketplaces: ${book.marketplaces.join(', ')}`);
    });
    
    if (books.length > 5) {
      console.log(`  ... y ${books.length - 5} más`);
    }
    
    const sales = await storage.getAllKdpSales();
    console.log(`\nVentas totales: ${sales.length}`);
    
    // Agrupar por tipo de transacción
    const byType: Record<string, number> = {};
    sales.forEach(sale => {
      byType[sale.transactionType] = (byType[sale.transactionType] || 0) + 1;
    });
    
    console.log('Por tipo de transacción:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    
    console.log('\n✅ Prueba completada exitosamente');
  } catch (error) {
    console.error('\n❌ Error durante la importación:');
    console.error(error);
    process.exit(1);
  }
}

testImport();

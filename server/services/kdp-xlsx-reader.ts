import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

/**
 * Lee un archivo XLSX de KDP y muestra su estructura
 */
export function analyzeKdpXlsx(filePath: string) {
  // Leer el archivo
  const fileBuffer = readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  console.log('=== Análisis de archivo KDP XLSX ===\n');
  
  // Información del workbook
  console.log(`Número de hojas: ${workbook.SheetNames.length}`);
  console.log(`Nombres de hojas: ${workbook.SheetNames.join(', ')}\n`);

  // Analizar cada hoja
  workbook.SheetNames.forEach((sheetName) => {
    console.log(`\n--- Hoja: "${sheetName}" ---`);
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir a JSON para ver los datos
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    
    console.log(`Filas de datos: ${jsonData.length}`);
    
    if (jsonData.length > 0) {
      console.log('\nColumnas encontradas:');
      const firstRow = jsonData[0] as Record<string, any>;
      Object.keys(firstRow).forEach((key, index) => {
        const value = firstRow[key];
        const valueType = typeof value;
        const valuePreview = value !== null ? String(value).substring(0, 50) : 'null';
        console.log(`  ${index + 1}. ${key} (${valueType}): ${valuePreview}`);
      });

      console.log('\nPrimeras 3 filas de ejemplo:');
      jsonData.slice(0, 3).forEach((row, index) => {
        console.log(`\nFila ${index + 1}:`, JSON.stringify(row, null, 2));
      });
    }
  });

  return {
    sheetNames: workbook.SheetNames,
    workbook
  };
}

// Ejecutar análisis si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Error: Debes proporcionar la ruta del archivo XLSX');
    console.log('Uso: tsx server/services/kdp-xlsx-reader.ts <ruta-archivo.xlsx>');
    process.exit(1);
  }
  
  try {
    analyzeKdpXlsx(filePath);
  } catch (error) {
    console.error('Error al leer el archivo:', error);
    process.exit(1);
  }
}

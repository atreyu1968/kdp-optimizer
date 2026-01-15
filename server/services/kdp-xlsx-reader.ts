import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';

/**
 * Converts an ExcelJS worksheet to JSON array (similar to xlsx's sheet_to_json)
 */
function worksheetToJson(worksheet: ExcelJS.Worksheet): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
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
        rows.push(rowData);
      }
    }
  });
  
  return rows;
}

/**
 * Lee un archivo XLSX de KDP y muestra su estructura
 */
export async function analyzeKdpXlsx(filePath: string) {
  const fileBuffer = readFileSync(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  console.log('=== Análisis de archivo KDP XLSX ===\n');
  
  const sheetNames = workbook.worksheets.map(ws => ws.name);
  console.log(`Número de hojas: ${sheetNames.length}`);
  console.log(`Nombres de hojas: ${sheetNames.join(', ')}\n`);

  for (const worksheet of workbook.worksheets) {
    console.log(`\n--- Hoja: "${worksheet.name}" ---`);
    
    const jsonData = worksheetToJson(worksheet);
    
    console.log(`Filas de datos: ${jsonData.length}`);
    
    if (jsonData.length > 0) {
      console.log('\nColumnas encontradas:');
      const firstRow = jsonData[0];
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
  }

  return {
    sheetNames,
    workbook
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Error: Debes proporcionar la ruta del archivo XLSX');
    console.log('Uso: tsx server/services/kdp-xlsx-reader.ts <ruta-archivo.xlsx>');
    process.exit(1);
  }
  
  analyzeKdpXlsx(filePath).catch((error) => {
    console.error('Error al leer el archivo:', error);
    process.exit(1);
  });
}

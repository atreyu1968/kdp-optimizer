import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const filePath = 'attached_assets/KDP_Royalties_Estimator-cbfc0d86-15eb-4916-b1d7-1666226e9558_1761605462374.xlsx';

console.log('=== ANÁLISIS DETALLADO DEL ARCHIVO KDP ===\n');

try {
  const fileBuffer = readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  
  // Analizar "Ventas combinadas"
  const ventasSheet = workbook.Sheets['Ventas combinadas'];
  if (ventasSheet) {
    const ventasData = XLSX.utils.sheet_to_json(ventasSheet);
    
    console.log('━━━ VENTAS COMBINADAS ━━━');
    console.log(`Total de filas: ${ventasData.length}\n`);
    
    // Tipos de regalía únicos
    const tiposRegalia = new Set();
    const tiposTransaccion = new Set();
    const fechas = new Set();
    
    ventasData.forEach((row: any) => {
      if (row['Tipo de regalía']) tiposRegalia.add(row['Tipo de regalía']);
      if (row['Tipo de transacción']) tiposTransaccion.add(row['Tipo de transacción']);
      if (row['Fecha de las regalías']) fechas.add(row['Fecha de las regalías']);
    });
    
    console.log('TIPOS DE REGALÍA encontrados:');
    tiposRegalia.forEach(tipo => console.log(`  - "${tipo}"`));
    
    console.log('\nTIPOS DE TRANSACCIÓN encontrados:');
    tiposTransaccion.forEach(tipo => console.log(`  - "${tipo}"`));
    
    console.log('\nFORMATO DE FECHAS (primeras 5):');
    Array.from(fechas).slice(0, 5).forEach(fecha => {
      console.log(`  - "${fecha}" (tipo: ${typeof fecha})`);
    });
    
    console.log('\nMUESTRA DE 5 REGISTROS COMPLETOS:');
    ventasData.slice(0, 5).forEach((row: any, idx) => {
      console.log(`\n[${idx + 1}]`);
      console.log(`  Fecha: "${row['Fecha de las regalías']}" (tipo: ${typeof row['Fecha de las regalías']})`);
      console.log(`  Título: "${row['Título']}"`);
      console.log(`  ASIN: "${row['ASIN/ISBN']}"`);
      console.log(`  Tienda: "${row['Tienda']}"`);
      console.log(`  Tipo Regalía: "${row['Tipo de regalía']}"`);
      console.log(`  Tipo Transacción: "${row['Tipo de transacción']}"`);
      console.log(`  Unidades vendidas: ${row['Unidades vendidas']}`);
      console.log(`  Regalías: ${row['Regalías']} ${row['Moneda']}`);
    });
  }
  
  // Analizar "KENP leídas"
  const kenpSheet = workbook.Sheets['KENP leídas'];
  if (kenpSheet) {
    const kenpData = XLSX.utils.sheet_to_json(kenpSheet);
    
    console.log('\n\n━━━ KENP LEÍDAS ━━━');
    console.log(`Total de filas: ${kenpData.length}\n`);
    
    const fechasKenp = new Set();
    kenpData.forEach((row: any) => {
      if (row['Fecha']) fechasKenp.add(row['Fecha']);
    });
    
    console.log('FORMATO DE FECHAS KENP (primeras 5):');
    Array.from(fechasKenp).slice(0, 5).forEach(fecha => {
      console.log(`  - "${fecha}" (tipo: ${typeof fecha})`);
    });
    
    console.log('\nMUESTRA DE 3 REGISTROS KENP:');
    kenpData.slice(0, 3).forEach((row: any, idx) => {
      console.log(`\n[${idx + 1}]`);
      console.log(`  Fecha: "${row['Fecha']}" (tipo: ${typeof row['Fecha']})`);
      console.log(`  Título: "${row['Título']}"`);
      console.log(`  ASIN: "${row['ASIN']}"`);
      console.log(`  Tienda: "${row['Tienda']}"`);
      console.log(`  Páginas KENP: ${row['Páginas KENP leídas']}`);
    });
  }
  
  // Analizar "Pedidos completados"
  const pedidosSheet = workbook.Sheets['Pedidos completados de eBooks'];
  if (pedidosSheet) {
    const pedidosData = XLSX.utils.sheet_to_json(pedidosSheet);
    
    console.log('\n\n━━━ PEDIDOS COMPLETADOS (GRATIS) ━━━');
    console.log(`Total de filas: ${pedidosData.length}\n`);
    
    console.log('Columnas disponibles:');
    if (pedidosData.length > 0) {
      console.log(Object.keys(pedidosData[0]));
    }
    
    console.log('\nMUESTRA DE 3 REGISTROS GRATIS:');
    pedidosData.slice(0, 3).forEach((row: any, idx) => {
      console.log(`\n[${idx + 1}]`);
      console.log(JSON.stringify(row, null, 2));
    });
  }
  
} catch (error) {
  console.error('Error analizando archivo:', error);
}

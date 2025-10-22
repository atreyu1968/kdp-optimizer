import jsPDF from "jspdf";
import type { OptimizationResult } from "@shared/schema";

export async function exportOptimizationToPDF(result: OptimizationResult): Promise<void> {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  // Función para agregar nueva página si es necesario
  const checkPageBreak = (requiredSpace: number = 10) => {
    if (yPosition + requiredSpace > pageHeight - margin) {
      pdf.addPage();
      yPosition = margin;
    }
  };

  // Encabezado
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  pdf.text("Optimización KDP - Resultados", margin, yPosition);
  yPosition += 10;

  // Línea divisoria
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 8;

  // Información general
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text("Información del Libro", margin, yPosition);
  yPosition += 7;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  
  const infoLines = [
    `Título: ${result.originalTitle}`,
    `Autor: ${result.author}`,
    result.seriesName ? `Serie: ${result.seriesName}${result.seriesNumber ? ` #${result.seriesNumber}` : ""}` : null,
    `Palabras: ${result.manuscriptWordCount.toLocaleString()}`,
    `Fecha: ${new Date(result.createdAt).toLocaleDateString("es-ES", { 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    })}`,
  ].filter(Boolean) as string[];

  infoLines.forEach((line) => {
    pdf.text(line, margin, yPosition);
    yPosition += 5;
  });

  yPosition += 5;

  // Palabras clave semilla
  checkPageBreak(15);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("Palabras Clave Semilla", margin, yPosition);
  yPosition += 6;

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  const seedKeywordsText = result.seedKeywords.join(", ");
  const seedLines = pdf.splitTextToSize(seedKeywordsText, contentWidth);
  seedLines.forEach((line: string) => {
    checkPageBreak();
    pdf.text(line, margin, yPosition);
    yPosition += 4;
  });

  yPosition += 8;

  // Resultados por mercado
  result.marketResults.forEach((marketResult, index) => {
    checkPageBreak(20);

    // Título del mercado
    pdf.setFillColor(240, 240, 240);
    pdf.rect(margin, yPosition - 4, contentWidth, 8, "F");
    
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(marketResult.market.toUpperCase(), margin + 2, yPosition);
    yPosition += 8;

    // Título y Subtítulo
    checkPageBreak(15);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text("Título y Subtítulo:", margin, yPosition);
    yPosition += 5;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    
    const titleText = `${marketResult.title}: ${marketResult.subtitle}`;
    const titleLines = pdf.splitTextToSize(titleText, contentWidth - 5);
    titleLines.forEach((line: string) => {
      checkPageBreak();
      pdf.text(line, margin + 3, yPosition);
      yPosition += 4.5;
    });

    const charCount = marketResult.title.length + marketResult.subtitle.length;
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`(${charCount}/200 caracteres)`, margin + 3, yPosition);
    pdf.setTextColor(0, 0, 0);
    yPosition += 6;

    // Descripción
    checkPageBreak(15);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text("Descripción:", margin, yPosition);
    yPosition += 5;

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    
    // Limpiar HTML de la descripción
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = marketResult.description;
    const descriptionText = tempDiv.textContent || tempDiv.innerText || "";
    
    const descLines = pdf.splitTextToSize(descriptionText, contentWidth - 5);
    descLines.forEach((line: string) => {
      checkPageBreak();
      pdf.text(line, margin + 3, yPosition);
      yPosition += 4;
    });

    yPosition += 6;

    // Palabras clave backend
    checkPageBreak(20);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text("Palabras Clave Backend (7 campos):", margin, yPosition);
    yPosition += 5;

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    
    marketResult.keywordFields.forEach((field, fieldIndex) => {
      checkPageBreak(6);
      const fieldText = `Campo ${fieldIndex + 1}: ${field.keywords || "(vacío)"}`;
      const charInfo = field.keywords ? ` (${field.charCount}/50 caracteres)` : "";
      
      pdf.text(fieldText, margin + 3, yPosition);
      
      if (charInfo) {
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(charInfo, margin + 3, yPosition + 3.5);
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(9);
        yPosition += 7;
      } else {
        yPosition += 5;
      }
    });

    yPosition += 5;

    // Categorías
    checkPageBreak(15);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text("Categorías:", margin, yPosition);
    yPosition += 5;

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    marketResult.categories.forEach((category, catIndex) => {
      checkPageBreak();
      pdf.text(`${catIndex + 1}. ${category}`, margin + 3, yPosition);
      yPosition += 4.5;
    });

    yPosition += 5;

    // Precio
    checkPageBreak(10);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text("Precio Recomendado:", margin, yPosition);
    yPosition += 5;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    const priceSymbol = marketResult.currency === "USD" ? "$" : 
                       marketResult.currency === "EUR" ? "€" : 
                       marketResult.currency === "GBP" ? "£" :
                       marketResult.currency === "BRL" ? "R$" : "";
    const priceText = `${priceSymbol}${marketResult.recommendedPrice.toFixed(2)} ${marketResult.currency} (${marketResult.royaltyOption} regalías)`;
    const earningsText = `Ganancia estimada: ${priceSymbol}${marketResult.estimatedEarnings.toFixed(2)} por venta`;
    
    pdf.text(priceText, margin + 3, yPosition);
    yPosition += 5;
    pdf.text(earningsText, margin + 3, yPosition);
    yPosition += 10;

    // Advertencias de validación
    if (marketResult.validationWarnings && marketResult.validationWarnings.length > 0) {
      checkPageBreak(15);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(180, 100, 0);
      pdf.text("⚠ Advertencias de Validación:", margin, yPosition);
      yPosition += 5;

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);
      
      marketResult.validationWarnings.forEach((warning) => {
        checkPageBreak(6);
        const warningLines = pdf.splitTextToSize(`• ${warning.message}`, contentWidth - 5);
        warningLines.forEach((line: string) => {
          checkPageBreak();
          pdf.text(line, margin + 3, yPosition);
          yPosition += 3.5;
        });
      });
      
      yPosition += 5;
    }

    // Separador entre mercados
    if (index < result.marketResults.length - 1) {
      checkPageBreak(10);
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;
    }
  });

  // Pie de página en todas las páginas
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `Generado por KDP Optimizer AI - Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  }

  // Generar nombre de archivo
  const fileName = `KDP_${result.originalTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  
  // Descargar PDF
  pdf.save(fileName);
}

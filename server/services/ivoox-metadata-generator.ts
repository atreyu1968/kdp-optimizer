import { generateIVooxMetadata as generateIVooxMetadataAI } from "../ai/openai-client";
import { delayBetweenCalls } from "../ai/retry-utils.js";
import type { IVooxMetadata } from "@shared/schema";

/**
 * Generate optimized iVoox metadata for an audiobook project
 */
export async function generateIVooxMetadataForProject(
  bookTitle: string,
  author: string,
  manuscriptText: string,
  genre: string,
  language: string
): Promise<IVooxMetadata & { chapters: IVooxChapterMeta[] }> {
  try {
    console.log(`[iVoox] Generating metadata for "${bookTitle}"...`);
    
    // Call AI to generate iVoox-specific metadata
    const aiMetadata = await generateIVooxMetadataAI(
      manuscriptText,
      genre,
      language
    );
    
    await delayBetweenCalls();
    
    const metadata: IVooxMetadata = {
      programTitle: aiMetadata.programTitle || `${bookTitle} - Audiolibro`,
      programDescription: aiMetadata.programDescription || `Escucha ${bookTitle} de ${author}. Audiolibro completo narrado profesionalmente.`,
      programCategory: (aiMetadata.programCategory as any) || "Audiolibros y Relatos",
      programTags: aiMetadata.programTags || [genre, "audiolibro", "literatura"],
      subscriptionPrice: aiMetadata.subscriptionPrice || 1.99,
      freeChaptersCount: Math.max(1, Math.min(2, aiMetadata.freeChaptersCount || 2)),
      episodeTitleTemplate: aiMetadata.episodeTitleTemplate || `Capítulo {capitulo}: {titulo_capitulo} - ${bookTitle}`,
      episodeDescriptionTemplate: aiMetadata.episodeDescriptionTemplate || `{titulo_libro} - {titulo_capitulo}. Audiolibro narrado profesionalmente.`,
      freeAccessCTA: aiMetadata.freeAccessCTA,
      paidAccessCTA: aiMetadata.paidAccessCTA,
    };
    
    console.log(`[iVoox] ✓ Generated metadata for "${bookTitle}"`);
    return {
      ...metadata,
      chapters: [], // Will be populated separately
    };
  } catch (error) {
    console.error(`[iVoox] Error generating metadata:`, error);
    throw error;
  }
}

export interface IVooxChapterMeta {
  chapterNumber: number;
  title: string;
  formattedTitle: string;
  formattedDescription: string;
  isExclusiveForFans: boolean;
  accessLabel: string;
}

/**
 * Generate iVoox metadata for all chapters
 */
export function generateChaptersMetadata(
  chapters: Array<{ title: string; sequenceNumber: number }>,
  bookTitle: string,
  metadata: IVooxMetadata
): IVooxChapterMeta[] {
  return chapters.map((chapter, index) => {
    const chapterNumber = chapter.sequenceNumber || index + 1;
    const isExclusiveForFans = chapterNumber > metadata.freeChaptersCount;
    
    return {
      chapterNumber,
      title: chapter.title,
      formattedTitle: formatEpisodeTitle(
        metadata.episodeTitleTemplate,
        chapterNumber,
        chapter.title,
        bookTitle
      ),
      formattedDescription: formatEpisodeDescription(
        metadata.episodeDescriptionTemplate,
        chapterNumber,
        chapter.title,
        bookTitle,
        isExclusiveForFans
      ),
      isExclusiveForFans,
      accessLabel: isExclusiveForFans ? "🔒 Exclusivo para Fans" : "🆓 Gratis",
    };
  });
}

/**
 * Format episode title using template and chapter info
 */
export function formatEpisodeTitle(
  template: string,
  chapterNumber: number,
  chapterTitle: string,
  bookTitle: string
): string {
  return template
    .replace(/\{capitulo\}/gi, `Capítulo ${chapterNumber}`)
    .replace(/\{titulo_capitulo\}/gi, chapterTitle)
    .replace(/\{titulo_libro\}/gi, bookTitle)
    .substring(0, 150);
}

/**
 * Format episode description using template
 */
export function formatEpisodeDescription(
  template: string,
  chapterNumber: number,
  chapterTitle: string,
  bookTitle: string,
  isExclusiveForFans: boolean
): string {
  let description = template
    .replace(/\{capitulo\}/gi, `Capítulo ${chapterNumber}`)
    .replace(/\{titulo_capitulo\}/gi, chapterTitle)
    .replace(/\{titulo_libro\}/gi, bookTitle);
  
  if (isExclusiveForFans) {
    description += "\n\n🔒 Contenido exclusivo para miembros. Hazte Fan para desbloquear.";
  } else {
    description += "\n\n🆓 Episodio gratuito. ¡Disfrútalo!";
  }
  
  return description.substring(0, 1000);
}

/**
 * Generate a complete iVoox publishing guide
 */
export function generateIVooxPublishingGuide(
  metadata: IVooxMetadata,
  chaptersCount: number
): string {
  const freeCount = Math.min(metadata.freeChaptersCount, chaptersCount);
  const paidCount = chaptersCount - freeCount;
  
  return `
## 📻 Guía de Publicación en iVoox

### 1. Crear el Programa
- **Título:** ${metadata.programTitle}
- **Categoría:** ${metadata.programCategory}
- **Descripción:** ${metadata.programDescription.substring(0, 200)}...

### 2. Configurar Etiquetas
${metadata.programTags.map(tag => `- ${tag}`).join('\n')}

### 3. Estrategia Freemium
- **Capítulos gratuitos:** ${freeCount} (Capítulo 1${freeCount > 1 ? ` al ${freeCount}` : ''})
- **Capítulos exclusivos:** ${paidCount} (para Fans)
- **Precio suscripción:** €${metadata.subscriptionPrice.toFixed(2)}/mes

### 4. Llamadas a la Acción
**Para capítulos gratuitos:**
${metadata.freeAccessCTA || 'Si te gusta esta historia, hazte Fan para desbloquear el audiolibro completo.'}

**Para capítulos de pago:**
${metadata.paidAccessCTA || 'Contenido exclusivo para Fans. Suscríbete para continuar escuchando.'}

### 5. Próximos Pasos
1. Sube la portada (1400x1400 px)
2. Sube cada capítulo como episodio separado
3. Marca los primeros ${freeCount} como públicos
4. Activa "Suscripciones para Fans"
5. Comparte el enlace del Capítulo 1 en redes
`.trim();
}

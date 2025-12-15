import { generateIVooxMetadata as generateIVooxMetadataAI } from "../ai/openai-client";
import { delayBetweenCalls } from "../ai/retry-utils.js";
import { storage } from "../storage";
import type { IVooxMetadata } from "@shared/schema";

/**
 * Generate optimized iVoox metadata for an audiobook project
 */
export async function generateIVooxMetadata(
  projectId: number,
  manuscriptText: string,
  genre: string,
  language: string
): Promise<IVooxMetadata> {
  try {
    console.log(`[iVoox] Generating metadata for project ${projectId}...`);
    
    // Call AI to generate iVoox-specific metadata
    const aiMetadata = await generateIVooxMetadataAI(
      manuscriptText,
      genre,
      language
    );
    
    await delayBetweenCalls();
    
    const metadata: IVooxMetadata = {
      programTitle: aiMetadata.programTitle,
      programDescription: aiMetadata.programDescription,
      programCategory: aiMetadata.programCategory || "Audiolibros y Relatos",
      programTags: aiMetadata.programTags || [],
      subscriptionPrice: aiMetadata.subscriptionPrice || 1.99,
      freeChaptersCount: Math.max(1, Math.min(2, aiMetadata.freeChaptersCount || 2)),
      episodeTitleTemplate: aiMetadata.episodeTitleTemplate,
      episodeDescriptionTemplate: aiMetadata.episodeDescriptionTemplate,
      freeAccessCTA: aiMetadata.freeAccessCTA,
      paidAccessCTA: aiMetadata.paidAccessCTA,
    };
    
    console.log(`[iVoox] ✓ Generated metadata for project ${projectId}`);
    return metadata;
  } catch (error) {
    console.error(`[iVoox] Error generating metadata:`, error);
    throw error;
  }
}

/**
 * Save iVoox metadata to database
 */
export async function saveIVooxMetadata(
  projectId: number,
  metadata: IVooxMetadata
): Promise<void> {
  try {
    await storage.saveIVooxMetadata(projectId, metadata);
    console.log(`[iVoox] ✓ Saved metadata for project ${projectId}`);
  } catch (error) {
    console.error(`[iVoox] Error saving metadata:`, error);
    throw error;
  }
}

/**
 * Get iVoox metadata for a project
 */
export async function getIVooxMetadata(projectId: number): Promise<IVooxMetadata | null> {
  try {
    const metadata = await storage.getIVooxMetadata(projectId);
    return metadata ? {
      programTitle: metadata.programTitle,
      programDescription: metadata.programDescription,
      programCategory: metadata.programCategory as any,
      programTags: metadata.programTags,
      subscriptionPrice: metadata.subscriptionPrice / 100, // Convert from cents
      freeChaptersCount: metadata.freeChaptersCount,
      episodeTitleTemplate: metadata.episodeTitleTemplate,
      episodeDescriptionTemplate: metadata.episodeDescriptionTemplate,
      freeAccessCTA: metadata.freeAccessCTA || undefined,
      paidAccessCTA: metadata.paidAccessCTA || undefined,
    } : null;
  } catch (error) {
    console.error(`[iVoox] Error fetching metadata:`, error);
    return null;
  }
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
    .replace("{capitulo}", `Capítulo ${chapterNumber}`)
    .replace("{titulo_capitulo}", chapterTitle)
    .replace("{titulo_libro}", bookTitle)
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
    .replace("{capitulo}", `Capítulo ${chapterNumber}`)
    .replace("{titulo_capitulo}", chapterTitle)
    .replace("{titulo_libro}", bookTitle);
  
  if (isExclusiveForFans) {
    description += "\n\n[Contenido exclusivo para miembros]";
  }
  
  return description.substring(0, 1000);
}

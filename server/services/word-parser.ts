/**
 * Word Document Parser for AudiobookForge
 * Extracts chapters from .docx files using multiple detection strategies
 */

import mammoth from "mammoth";
import * as cheerio from "cheerio";

export interface ParsedChapter {
  sequenceNumber: number;
  title: string;
  contentText: string;
  characterCount: number;
  estimatedDurationSeconds: number;
}

export interface ParsedDocument {
  title: string;
  chapters: ParsedChapter[];
  totalCharacters: number;
  totalEstimatedDuration: number;
}

/**
 * Average reading speed for audiobook narration (characters per second)
 * Professional narrators typically read 150-160 words per minute
 * Average word length is ~5 characters, so ~750-800 chars/min = ~12.5 chars/sec
 */
const CHARS_PER_SECOND = 12.5;

/**
 * Patterns that indicate a chapter title
 */
const CHAPTER_PATTERNS = [
  /^capítulo\s+\d+/i,
  /^capitulo\s+\d+/i,
  /^chapter\s+\d+/i,
  /^prólogo/i,
  /^prologo/i,
  /^prologue/i,
  /^epílogo/i,
  /^epilogo/i,
  /^epilogue/i,
  /^introducción/i,
  /^introduccion/i,
  /^introduction/i,
  /^parte\s+\d+/i,
  /^part\s+\d+/i,
  /^acto\s+\d+/i,
  /^act\s+\d+/i,
  /^escena\s+\d+/i,
  /^scene\s+\d+/i,
  /^cap\.\s*\d+/i,
  /^cap\s+\d+/i,
  /^\d+\.\s+[A-ZÁÉÍÓÚÑ]/,  // "1. Título del capítulo"
  /^[IVXLCDM]+\.\s+/i,     // Roman numerals: "I. Título"
];

/**
 * Check if text looks like a chapter title
 */
function isChapterTitle(text: string): boolean {
  const trimmed = text.trim();
  
  // Too long to be a title (more than 100 chars)
  if (trimmed.length > 100) return false;
  
  // Check against known patterns
  for (const pattern of CHAPTER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Convert Word document buffer to HTML using Mammoth
 */
async function convertToHtml(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  if (result.messages.length > 0) {
    console.log("[WordParser] Conversion messages:", result.messages);
  }
  console.log("[WordParser] HTML length:", result.value.length);
  return result.value;
}

/**
 * Extract plain text from HTML, preserving paragraph breaks
 */
function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html);
  
  // Get text content with paragraph breaks
  let text = "";
  $("body").children().each((_, el) => {
    const elementText = $(el).text().trim();
    if (elementText) {
      text += elementText + "\n\n";
    }
  });
  
  // Clean up excessive whitespace
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Calculate estimated duration based on character count
 */
function calculateDuration(characterCount: number): number {
  return Math.ceil(characterCount / CHARS_PER_SECOND);
}

/**
 * Parse Word document and extract chapters using multiple strategies
 */
export async function parseWordDocument(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  const html = await convertToHtml(buffer);
  const $ = cheerio.load(html);
  
  const chapters: ParsedChapter[] = [];
  let currentChapterTitle = "";
  let currentChapterContent: string[] = [];
  let sequenceNumber = 1;
  
  // Count H1 headings only
  const h1Count = $("h1").length;
  
  console.log(`[WordParser] Document structure: ${h1Count} H1 headings found`);
  
  // Only use H1 for chapter detection
  const useH1Detection = h1Count > 0;
  
  if (useH1Detection) {
    console.log("[WordParser] Using H1 for chapter detection");
  } else {
    console.log("[WordParser] No H1 headings found, document will be treated as single chapter");
  }
  
  // Process each element in body
  $("body").children().each((_, element) => {
    const $el = $(element);
    const tagName = element.tagName?.toLowerCase() || "";
    const text = $el.text().trim();
    
    // Check if this element is a chapter break (only H1)
    let isChapterBreak = false;
    let chapterTitle = "";
    
    // Only detect H1 as chapter breaks
    if (useH1Detection && tagName === "h1") {
      isChapterBreak = true;
      chapterTitle = text;
    }
    
    if (isChapterBreak) {
      // If we have accumulated content, save the previous chapter
      if (currentChapterContent.length > 0 || currentChapterTitle) {
        const contentText = currentChapterContent.join("\n\n").trim();
        if (contentText) {
          const characterCount = contentText.length;
          chapters.push({
            sequenceNumber,
            title: currentChapterTitle || `Capítulo ${sequenceNumber}`,
            contentText,
            characterCount,
            estimatedDurationSeconds: calculateDuration(characterCount),
          });
          sequenceNumber++;
        }
      }
      
      // Start a new chapter
      currentChapterTitle = chapterTitle || `Capítulo ${sequenceNumber}`;
      currentChapterContent = [];
      console.log(`[WordParser] Found chapter: "${currentChapterTitle}"`);
    } else {
      // Accumulate content
      if (text) {
        currentChapterContent.push(text);
      }
    }
  });
  
  // Don't forget the last chapter
  if (currentChapterContent.length > 0 || currentChapterTitle) {
    const contentText = currentChapterContent.join("\n\n").trim();
    if (contentText) {
      const characterCount = contentText.length;
      chapters.push({
        sequenceNumber,
        title: currentChapterTitle || `Capítulo ${sequenceNumber}`,
        contentText,
        characterCount,
        estimatedDurationSeconds: calculateDuration(characterCount),
      });
    }
  }
  
  // If no chapters found, treat entire document as single chapter
  if (chapters.length === 0) {
    console.log("[WordParser] No chapters detected, treating as single document");
    const plainText = htmlToPlainText(html);
    if (plainText) {
      const characterCount = plainText.length;
      chapters.push({
        sequenceNumber: 1,
        title: filename.replace(/\.docx?$/i, "") || "Documento",
        contentText: plainText,
        characterCount,
        estimatedDurationSeconds: calculateDuration(characterCount),
      });
    }
  }
  
  // Calculate totals
  const totalCharacters = chapters.reduce((sum, ch) => sum + ch.characterCount, 0);
  const totalEstimatedDuration = chapters.reduce((sum, ch) => sum + ch.estimatedDurationSeconds, 0);
  
  // Determine document title from first H1 or filename
  const title = chapters[0]?.title || filename.replace(/\.docx?$/i, "");
  
  console.log(`[WordParser] Parsed "${filename}": ${chapters.length} chapters, ${totalCharacters} chars, ~${Math.round(totalEstimatedDuration / 60)} min`);
  
  return {
    title,
    chapters,
    totalCharacters,
    totalEstimatedDuration,
  };
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

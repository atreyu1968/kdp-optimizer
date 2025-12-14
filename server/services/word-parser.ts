/**
 * Word Document Parser for AudiobookForge
 * Extracts chapters from .docx files using H1 headings as chapter breaks
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
 * Convert Word document buffer to HTML using Mammoth
 */
async function convertToHtml(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  if (result.messages.length > 0) {
    console.log("[WordParser] Conversion messages:", result.messages);
  }
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
 * Parse Word document and extract chapters by H1 headings
 */
export async function parseWordDocument(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  const html = await convertToHtml(buffer);
  const $ = cheerio.load(html);
  
  const chapters: ParsedChapter[] = [];
  let currentChapterTitle = "";
  let currentChapterContent: string[] = [];
  let sequenceNumber = 1;
  
  // Process each element in body
  $("body").children().each((_, element) => {
    const $el = $(element);
    const tagName = element.tagName?.toLowerCase() || "";
    
    if (tagName === "h1") {
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
      currentChapterTitle = $el.text().trim() || `Capítulo ${sequenceNumber}`;
      currentChapterContent = [];
    } else {
      // Accumulate content
      const text = $el.text().trim();
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
  
  // If no H1 headings found, treat entire document as single chapter
  if (chapters.length === 0) {
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

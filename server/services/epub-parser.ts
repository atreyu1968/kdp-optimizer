/**
 * EPUB3 Parser for AudiobookForge
 * Extracts chapters from EPUB files and preserves SSML annotations
 * 
 * EPUB3 supports SSML through:
 * - ssml:ph (phoneme) - provides phonetic pronunciation
 * - ssml:alphabet - specifies phonetic alphabet (ipa, x-sampa)
 * - CSS Speech properties
 * - PLS (Pronunciation Lexicon Specification) files
 */

import JSZip from "jszip";
import * as cheerio from "cheerio";
import * as path from "path";

export interface SSMLAnnotation {
  originalText: string;
  phoneme: string;
  alphabet: string;
}

export interface ParsedChapterWithSSML {
  sequenceNumber: number;
  title: string;
  contentText: string;
  contentWithSSML: string;
  characterCount: number;
  estimatedDurationSeconds: number;
  ssmlAnnotations: SSMLAnnotation[];
}

export interface ParsedEpubDocument {
  title: string;
  author: string;
  language: string;
  chapters: ParsedChapterWithSSML[];
  totalCharacters: number;
  totalEstimatedDuration: number;
  hasSSMLAnnotations: boolean;
  plsLexicons: PLSLexicon[];
}

export interface PLSLexicon {
  id: string;
  language: string;
  entries: PLSEntry[];
}

export interface PLSEntry {
  grapheme: string;
  phoneme: string;
  alphabet: string;
}

const CHARS_PER_SECOND = 12.5;

function calculateDuration(characterCount: number): number {
  return Math.ceil(characterCount / CHARS_PER_SECOND);
}

/**
 * Parse the container.xml to find the rootfile (content.opf) path
 */
async function findRootfilePath(zip: JSZip): Promise<string> {
  const containerPath = "META-INF/container.xml";
  const containerFile = zip.file(containerPath);
  
  if (!containerFile) {
    throw new Error("Invalid EPUB: META-INF/container.xml not found");
  }
  
  const containerXml = await containerFile.async("text");
  const $ = cheerio.load(containerXml, { xmlMode: true });
  
  const rootfilePath = $("rootfile").attr("full-path");
  if (!rootfilePath) {
    throw new Error("Invalid EPUB: rootfile path not found in container.xml");
  }
  
  return rootfilePath;
}

/**
 * Parse OPF file to get metadata, manifest, and spine
 */
async function parseOPF(zip: JSZip, opfPath: string): Promise<{
  title: string;
  author: string;
  language: string;
  manifest: Map<string, { href: string; mediaType: string }>;
  spine: string[];
  plsFiles: string[];
}> {
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
  }
  
  const opfXml = await opfFile.async("text");
  const $ = cheerio.load(opfXml, { xmlMode: true });
  
  const opfDir = path.dirname(opfPath);
  
  const title = $("metadata title, dc\\:title").first().text() || "Sin título";
  const author = $("metadata creator, dc\\:creator").first().text() || "Autor desconocido";
  const language = $("metadata language, dc\\:language").first().text() || "es";
  
  const manifest = new Map<string, { href: string; mediaType: string }>();
  const plsFiles: string[] = [];
  
  $("manifest item").each((_, item) => {
    const $item = $(item);
    const id = $item.attr("id");
    const href = $item.attr("href");
    const mediaType = $item.attr("media-type") || "";
    
    if (id && href) {
      const fullPath = opfDir ? path.join(opfDir, href).replace(/\\/g, "/") : href;
      manifest.set(id, { href: fullPath, mediaType });
      
      if (mediaType === "application/pls+xml") {
        plsFiles.push(fullPath);
      }
    }
  });
  
  const spine: string[] = [];
  $("spine itemref").each((_, itemref) => {
    const idref = $(itemref).attr("idref");
    if (idref) {
      spine.push(idref);
    }
  });
  
  return { title, author, language, manifest, spine, plsFiles };
}

/**
 * Parse PLS (Pronunciation Lexicon Specification) file
 */
async function parsePLSFile(zip: JSZip, plsPath: string): Promise<PLSLexicon | null> {
  const plsFile = zip.file(plsPath);
  if (!plsFile) {
    console.log(`[EpubParser] PLS file not found: ${plsPath}`);
    return null;
  }
  
  try {
    const plsXml = await plsFile.async("text");
    const $ = cheerio.load(plsXml, { xmlMode: true });
    
    const lexicon = $("lexicon");
    const language = lexicon.attr("xml:lang") || "es";
    const alphabet = lexicon.attr("alphabet") || "ipa";
    
    const entries: PLSEntry[] = [];
    
    $("lexeme").each((_, lexeme) => {
      const $lexeme = $(lexeme);
      const grapheme = $lexeme.find("grapheme").text().trim();
      const phoneme = $lexeme.find("phoneme").text().trim();
      
      if (grapheme && phoneme) {
        entries.push({
          grapheme,
          phoneme,
          alphabet,
        });
      }
    });
    
    console.log(`[EpubParser] Parsed PLS lexicon: ${entries.length} entries`);
    
    return {
      id: path.basename(plsPath),
      language,
      entries,
    };
  } catch (error) {
    console.error(`[EpubParser] Error parsing PLS file ${plsPath}:`, error);
    return null;
  }
}

/**
 * Extract text content from XHTML while preserving SSML annotations
 * Returns both plain text and SSML-enriched text
 */
function extractContentWithSSML($: cheerio.CheerioAPI, element: any): {
  plainText: string;
  ssmlText: string;
  annotations: SSMLAnnotation[];
} {
  const annotations: SSMLAnnotation[] = [];
  let plainText = "";
  let ssmlText = "";
  
  function processNode(node: any) {
    if (node.type === "text") {
      const text = node.data || "";
      plainText += text;
      ssmlText += text;
      return;
    }
    
    if (node.type !== "tag") return;
    
    const $node = $(node);
    const tagName = node.name?.toLowerCase() || "";
    
    const ssmlPh = $node.attr("ssml:ph") || $node.attr("ssml-ph");
    const ssmlAlphabet = $node.attr("ssml:alphabet") || $node.attr("ssml-alphabet") || "ipa";
    
    if (ssmlPh) {
      const originalText = $node.text();
      plainText += originalText;
      
      ssmlText += `<phoneme alphabet="${ssmlAlphabet}" ph="${ssmlPh}">${originalText}</phoneme>`;
      
      annotations.push({
        originalText,
        phoneme: ssmlPh,
        alphabet: ssmlAlphabet,
      });
      return;
    }
    
    if (["script", "style", "head", "nav"].includes(tagName)) {
      return;
    }
    
    if (["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote"].includes(tagName)) {
      if (plainText && !plainText.endsWith("\n\n")) {
        plainText += "\n\n";
        ssmlText += "\n\n";
      }
    }
    
    if (["br"].includes(tagName)) {
      plainText += "\n";
      ssmlText += "\n";
      return;
    }
    
    const children = node.children || [];
    for (const child of children) {
      processNode(child);
    }
  }
  
  processNode(element);
  
  plainText = plainText
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  
  ssmlText = ssmlText
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  
  return { plainText, ssmlText, annotations };
}

/**
 * Parse a single XHTML document from the EPUB spine
 */
async function parseSpineDocument(
  zip: JSZip,
  docPath: string,
  sequenceNumber: number
): Promise<ParsedChapterWithSSML | null> {
  const docFile = zip.file(docPath);
  if (!docFile) {
    console.log(`[EpubParser] Spine document not found: ${docPath}`);
    return null;
  }
  
  try {
    const xhtml = await docFile.async("text");
    const $ = cheerio.load(xhtml, { xmlMode: true });
    
    let title = $("h1").first().text().trim();
    if (!title) {
      title = $("title").text().trim() || `Capítulo ${sequenceNumber}`;
    }
    
    const body = $("body").get(0);
    if (!body) {
      return null;
    }
    
    const { plainText, ssmlText, annotations } = extractContentWithSSML($, body);
    
    if (!plainText.trim()) {
      return null;
    }
    
    const characterCount = plainText.length;
    
    return {
      sequenceNumber,
      title,
      contentText: plainText,
      contentWithSSML: ssmlText,
      characterCount,
      estimatedDurationSeconds: calculateDuration(characterCount),
      ssmlAnnotations: annotations,
    };
  } catch (error) {
    console.error(`[EpubParser] Error parsing document ${docPath}:`, error);
    return null;
  }
}

/**
 * Main function to parse an EPUB3 file
 */
export async function parseEpubDocument(buffer: Buffer, filename: string): Promise<ParsedEpubDocument> {
  console.log(`[EpubParser] Parsing EPUB: ${filename}`);
  
  const zip = await JSZip.loadAsync(buffer);
  
  const rootfilePath = await findRootfilePath(zip);
  console.log(`[EpubParser] Found rootfile at: ${rootfilePath}`);
  
  const { title, author, language, manifest, spine, plsFiles } = await parseOPF(zip, rootfilePath);
  console.log(`[EpubParser] Metadata - Title: "${title}", Author: "${author}", Language: ${language}`);
  console.log(`[EpubParser] Spine contains ${spine.length} documents`);
  
  const plsLexicons: PLSLexicon[] = [];
  for (const plsPath of plsFiles) {
    const lexicon = await parsePLSFile(zip, plsPath);
    if (lexicon) {
      plsLexicons.push(lexicon);
    }
  }
  
  if (plsLexicons.length > 0) {
    console.log(`[EpubParser] Found ${plsLexicons.length} PLS pronunciation lexicon(s)`);
  }
  
  const chapters: ParsedChapterWithSSML[] = [];
  let sequenceNumber = 1;
  
  for (const itemId of spine) {
    const manifestItem = manifest.get(itemId);
    if (!manifestItem) {
      console.log(`[EpubParser] Manifest item not found for spine ref: ${itemId}`);
      continue;
    }
    
    if (!manifestItem.mediaType.includes("xhtml") && !manifestItem.mediaType.includes("html")) {
      continue;
    }
    
    const chapter = await parseSpineDocument(zip, manifestItem.href, sequenceNumber);
    if (chapter) {
      chapters.push(chapter);
      sequenceNumber++;
      
      if (chapter.ssmlAnnotations.length > 0) {
        console.log(`[EpubParser] Chapter "${chapter.title}" has ${chapter.ssmlAnnotations.length} SSML annotations`);
      }
    }
  }
  
  if (chapters.length === 0) {
    throw new Error("No readable chapters found in EPUB");
  }
  
  const allH1Titles = chapters.every(ch => ch.title.startsWith("Capítulo"));
  if (chapters.length > 1 && allH1Titles) {
    let mergedContent = "";
    let mergedSSML = "";
    const allAnnotations: SSMLAnnotation[] = [];
    
    for (const ch of chapters) {
      mergedContent += ch.contentText + "\n\n";
      mergedSSML += ch.contentWithSSML + "\n\n";
      allAnnotations.push(...ch.ssmlAnnotations);
    }
    
    console.log(`[EpubParser] Merged ${chapters.length} spine documents into single chapter`);
  }
  
  const totalCharacters = chapters.reduce((sum, ch) => sum + ch.characterCount, 0);
  const totalEstimatedDuration = chapters.reduce((sum, ch) => sum + ch.estimatedDurationSeconds, 0);
  const totalAnnotations = chapters.reduce((sum, ch) => sum + ch.ssmlAnnotations.length, 0);
  const hasSSMLAnnotations = totalAnnotations > 0 || plsLexicons.length > 0;
  
  console.log(`[EpubParser] Parsed "${filename}": ${chapters.length} chapters, ${totalCharacters} chars, ~${Math.round(totalEstimatedDuration / 60)} min`);
  if (hasSSMLAnnotations) {
    console.log(`[EpubParser] SSML support detected: ${totalAnnotations} inline annotations, ${plsLexicons.length} PLS lexicons`);
  }
  
  return {
    title,
    author,
    language,
    chapters,
    totalCharacters,
    totalEstimatedDuration,
    hasSSMLAnnotations,
    plsLexicons,
  };
}

/**
 * Apply PLS lexicon to text, converting matching words to SSML phoneme tags
 */
export function applyPLSLexicon(text: string, lexicons: PLSLexicon[]): string {
  let result = text;
  
  for (const lexicon of lexicons) {
    for (const entry of lexicon.entries) {
      const regex = new RegExp(`\\b${escapeRegex(entry.grapheme)}\\b`, "gi");
      result = result.replace(regex, `<phoneme alphabet="${entry.alphabet}" ph="${entry.phoneme}">${entry.grapheme}</phoneme>`);
    }
  }
  
  return result;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert parsed EPUB chapter to format compatible with existing word-parser
 */
export function convertToStandardFormat(epubDoc: ParsedEpubDocument): {
  title: string;
  chapters: Array<{
    sequenceNumber: number;
    title: string;
    contentText: string;
    characterCount: number;
    estimatedDurationSeconds: number;
  }>;
  totalCharacters: number;
  totalEstimatedDuration: number;
} {
  return {
    title: epubDoc.title,
    chapters: epubDoc.chapters.map(ch => ({
      sequenceNumber: ch.sequenceNumber,
      title: ch.title,
      contentText: ch.contentText,
      characterCount: ch.characterCount,
      estimatedDurationSeconds: ch.estimatedDurationSeconds,
    })),
    totalCharacters: epubDoc.totalCharacters,
    totalEstimatedDuration: epubDoc.totalEstimatedDuration,
  };
}

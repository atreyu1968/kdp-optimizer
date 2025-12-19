/**
 * Text Preprocessor for TTS - Advanced Protocol
 * Based on "Ingeniería de la Naturalidad" document
 * Optimizes manuscripts for Amazon Polly Neural synthesis
 * 
 * Key principles:
 * - Context preservation for neural prosody
 * - Whitespace management (double spaces, tabs, soft returns)
 * - Punctuation as prosodic cues
 * - Scene break detection
 * - Semantic structure preservation
 */

// Spanish number words
const UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const TEENS = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const TENS = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function numberToSpanishWords(num: number): string {
  if (num === 0) return 'cero';
  if (num < 0) return 'menos ' + numberToSpanishWords(Math.abs(num));
  
  if (num === 100) return 'cien';
  if (num === 1000) return 'mil';
  if (num === 1000000) return 'un millón';
  
  let result = '';
  
  // Millions
  if (num >= 1000000) {
    const millions = Math.floor(num / 1000000);
    if (millions === 1) {
      result += 'un millón ';
    } else {
      result += numberToSpanishWords(millions) + ' millones ';
    }
    num %= 1000000;
  }
  
  // Thousands
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    if (thousands === 1) {
      result += 'mil ';
    } else {
      result += numberToSpanishWords(thousands) + ' mil ';
    }
    num %= 1000;
  }
  
  // Hundreds
  if (num >= 100) {
    const hundreds = Math.floor(num / 100);
    if (num === 100) {
      result += 'cien';
      return result.trim();
    }
    result += HUNDREDS[hundreds] + ' ';
    num %= 100;
  }
  
  // Tens and units
  if (num >= 20) {
    const tens = Math.floor(num / 10);
    const units = num % 10;
    result += TENS[tens];
    if (units > 0) {
      result += ' y ' + UNITS[units];
    }
  } else if (num >= 10) {
    result += TEENS[num - 10];
  } else if (num > 0) {
    result += UNITS[num];
  }
  
  return result.trim();
}

function convertYearsToWords(text: string): string {
  return text.replace(/\b(19|20)\d{2}\b/g, (match) => {
    const year = parseInt(match);
    return numberToSpanishWords(year);
  });
}

function convertNumbersToWords(text: string): string {
  return text.replace(/\b\d{1,4}\b/g, (match) => {
    const num = parseInt(match);
    if (num <= 9999) {
      return numberToSpanishWords(num);
    }
    return match;
  });
}

function expandAbbreviations(text: string): string {
  const abbreviations: Record<string, string> = {
    'Sr.': 'Señor',
    'Sra.': 'Señora',
    'Srta.': 'Señorita',
    'Dr.': 'Doctor',
    'Dra.': 'Doctora',
    'Ud.': 'Usted',
    'Uds.': 'Ustedes',
    'etc.': 'etcétera',
    'pág.': 'página',
    'págs.': 'páginas',
    'cap.': 'capítulo',
    'vol.': 'volumen',
    'núm.': 'número',
    'tel.': 'teléfono',
    'ej.': 'ejemplo',
    'p.ej.': 'por ejemplo',
    'vs.': 'versus',
    'aprox.': 'aproximadamente',
    'min.': 'minutos',
    'seg.': 'segundos',
    'hrs.': 'horas',
    'km.': 'kilómetros',
    'km/h': 'kilómetros por hora',
    'm.': 'metros',
    'cm.': 'centímetros',
    'mm.': 'milímetros',
    'kg.': 'kilogramos',
    'gr.': 'gramos',
    'lt.': 'litros',
    'ml.': 'mililitros',
  };
  
  let result = text;
  for (const [abbr, full] of Object.entries(abbreviations)) {
    const regex = new RegExp(abbr.replace('.', '\\.'), 'gi');
    result = result.replace(regex, full);
  }
  
  return result;
}

/**
 * PROTOCOL 2.1.1: Whitespace Management
 * - Double spaces create extended irregular pauses
 * - Tabs are null characters or unpredictable pauses
 * - Non-breaking spaces can cause rushed pronunciation
 * - Leading/trailing spaces confuse voice onset detection
 */
function sanitizeWhitespace(text: string): string {
  let result = text;
  
  // Replace non-breaking spaces with regular spaces
  result = result.replace(/\u00A0/g, ' ');
  
  // Replace all whitespace variants with regular space
  result = result.replace(/[\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  
  // Remove tabs (disruptive for TTS)
  result = result.replace(/\t/g, ' ');
  
  // Replace multiple spaces with single space (critical for consistent timing)
  // Run multiple times to catch all instances
  let prevLength = 0;
  while (result.length !== prevLength) {
    prevLength = result.length;
    result = result.replace(/  /g, ' ');
  }
  
  // Remove spaces at the start of paragraphs (confuses voice onset)
  result = result.replace(/\n\s+/g, '\n');
  
  // Remove spaces at the end of paragraphs
  result = result.replace(/\s+\n/g, '\n');
  
  // Trim leading/trailing whitespace from entire text
  result = result.trim();
  
  return result;
}

/**
 * PROTOCOL 2.1.2: Line Breaks Management
 * - Hard returns (paragraph breaks) = proper pause + intonation reset
 * - Soft returns (line breaks) = prosody collapse, rushed speech
 * - Convert soft returns to proper paragraphs unless intentional poetry
 */
function normalizeLineBreaks(text: string): string {
  let result = text;
  
  // Convert Windows line endings to Unix
  result = result.replace(/\r\n/g, '\n');
  
  // Convert old Mac line endings
  result = result.replace(/\r/g, '\n');
  
  // Soft return pattern: single newline not followed by another newline
  // These break prosody - convert to proper paragraph breaks for prose
  // BUT preserve single newlines in dialogue/poetry context
  
  // For general prose: ensure proper paragraph separation
  // Multiple newlines become proper pause (2 newlines)
  result = result.replace(/\n{3,}/g, '\n\n');
  
  return result;
}

/**
 * PROTOCOL 2.1.3: Invisible Characters and Metadata
 * Remove characters that cause TTS to stutter, stop, or fail
 */
function removeInvisibleCharacters(text: string): string {
  let result = text;
  
  // Zero-width characters (cause stuttering)
  result = result.replace(/[\u200B-\u200F\u2028-\u202E\uFEFF]/g, '');
  
  // Soft hyphens (discretionary hyphens)
  result = result.replace(/\u00AD/g, '');
  
  // Left-to-right / Right-to-left marks
  result = result.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
  
  // Word joiner and other formatting characters
  result = result.replace(/[\u2060-\u206F]/g, '');
  
  // Object replacement character (often from copy-paste)
  result = result.replace(/\uFFFC/g, '');
  
  // Private use area characters
  result = result.replace(/[\uE000-\uF8FF]/g, '');
  
  return result;
}

/**
 * PROTOCOL 2.2: Punctuation as Prosodic Cues
 * Punctuation controls breathing, intonation, and pacing
 */
function normalizePunctuation(text: string): string {
  let result = text;
  
  // === QUOTES: Normalize to consistent format ===
  // Smart quotes to straight quotes (encoding safety)
  result = result.replace(/[""„‟]/g, '"');
  result = result.replace(/[''‚‛]/g, "'");
  
  // Spanish angular quotes - keep but ensure spacing
  result = result.replace(/«\s*/g, '« ');
  result = result.replace(/\s*»/g, ' »');
  
  // === DASHES: Critical distinction ===
  // En-dash (–) and Em-dash (—) need proper spacing for parenthetical effect
  // Without spaces, TTS may try to read as compound word
  result = result.replace(/\s*[–—]\s*/g, ' — ');
  
  // Hyphen stays for compound words (bien-intencionado)
  // No changes needed for regular hyphens
  
  // === ELLIPSIS: Suspension/hesitation ===
  // Normalize to proper ellipsis character or consistent format
  result = result.replace(/\.{3,}/g, '...');
  result = result.replace(/…/g, '...');
  // Ensure space after ellipsis for proper pause
  result = result.replace(/\.\.\.(?=[A-ZÁÉÍÓÚÑa-záéíóúñ])/g, '... ');
  
  // === SEMICOLON: Longer pause, maintains tonal connection ===
  // Ensure proper spacing
  result = result.replace(/\s*;\s*/g, '; ');
  
  // === COLON: Proper pause before explanation ===
  result = result.replace(/\s*:\s*/g, ': ');
  
  // === EXCESSIVE PUNCTUATION ===
  // Multiple exclamation/question marks reduce to one
  result = result.replace(/!{2,}/g, '!');
  result = result.replace(/\?{2,}/g, '?');
  result = result.replace(/,{2,}/g, ',');
  
  // Combined ?! or !? - keep but normalize
  result = result.replace(/[!?]{2,}/g, (match) => {
    if (match.includes('?') && match.includes('!')) return '?!';
    if (match[0] === '?') return '?';
    return '!';
  });
  
  // === ENSURE SPACING AFTER PUNCTUATION ===
  // Missing space after period/comma causes rushed pronunciation
  result = result.replace(/([.!?;:,])([A-ZÁÉÍÓÚÑa-záéíóúñ«"])/g, '$1 $2');
  
  return result;
}

/**
 * PROTOCOL 3.1.2: Scene Break Detection
 * Visual scene separators (***) must become SSML breaks
 * Without proper handling, TTS jumps scenes abruptly
 */
function handleSceneBreaks(text: string): string {
  let result = text;
  
  // Common scene break patterns: ***, ---, ===, ###, ~~~
  // Also centered asterisks or dashes
  const sceneBreakPatterns = [
    /\n\s*\*\s*\*\s*\*\s*\n/g,       // * * * or ***
    /\n\s*\*{3,}\s*\n/g,              // ***
    /\n\s*-{3,}\s*\n/g,               // ---
    /\n\s*={3,}\s*\n/g,               // ===
    /\n\s*#{3,}\s*\n/g,               // ###
    /\n\s*~{3,}\s*\n/g,               // ~~~
    /\n\s*•\s*•\s*•\s*\n/g,           // • • •
    /\n\s*◊\s*◊\s*◊\s*\n/g,           // ◊ ◊ ◊
  ];
  
  // Replace with a clear paragraph break marker
  // This will be converted to SSML break in wrapInSSML
  for (const pattern of sceneBreakPatterns) {
    result = result.replace(pattern, '\n[SCENE_BREAK]\n');
  }
  
  return result;
}

/**
 * Handle dialogue with proper pauses for natural narration
 */
function addDialoguePauses(text: string): string {
  let result = text;
  
  // Ensure space after opening dialogue markers for proper pause
  result = result.replace(/—\s*/g, '— ');
  result = result.replace(/«\s*/g, '« ');
  
  // Add comma before dialogue attribution verbs for natural pause
  const dialogueVerbs = [
    'dijo', 'respondió', 'preguntó', 'exclamó', 'murmuró', 
    'susurró', 'gritó', 'añadió', 'comentó', 'contestó', 
    'replicó', 'musitó', 'gruñó', 'afirmó', 'negó',
    'explicó', 'declaró', 'ordenó', 'suplicó', 'rogó'
  ];
  
  for (const verb of dialogueVerbs) {
    // After closing quote/dash before verb
    const regex = new RegExp(`(["»—])\\s*(${verb})`, 'gi');
    result = result.replace(regex, '$1, $2');
  }
  
  return result;
}

/**
 * Handle Roman numerals conversion
 */
function handleRomanNumerals(text: string): string {
  const romanNumerals: Record<string, string> = {
    ' I ': ' primero ',
    ' II ': ' segundo ',
    ' III ': ' tercero ',
    ' IV ': ' cuarto ',
    ' V ': ' quinto ',
    ' VI ': ' sexto ',
    ' VII ': ' séptimo ',
    ' VIII ': ' octavo ',
    ' IX ': ' noveno ',
    ' X ': ' décimo ',
    ' XI ': ' undécimo ',
    ' XII ': ' duodécimo ',
    ' XIII ': ' decimotercero ',
    ' XIV ': ' decimocuarto ',
    ' XV ': ' decimoquinto ',
    ' XVI ': ' decimosexto ',
    ' XVII ': ' decimoséptimo ',
    ' XVIII ': ' decimoctavo ',
    ' XIX ': ' decimonoveno ',
    ' XX ': ' vigésimo ',
    'Capítulo I': 'Capítulo primero',
    'Capítulo II': 'Capítulo segundo',
    'Capítulo III': 'Capítulo tercero',
    'Capítulo IV': 'Capítulo cuarto',
    'Capítulo V': 'Capítulo quinto',
    'Capítulo VI': 'Capítulo sexto',
    'Capítulo VII': 'Capítulo séptimo',
    'Capítulo VIII': 'Capítulo octavo',
    'Capítulo IX': 'Capítulo noveno',
    'Capítulo X': 'Capítulo décimo',
  };
  
  let result = text;
  for (const [roman, word] of Object.entries(romanNumerals)) {
    result = result.replace(new RegExp(roman, 'g'), word);
  }
  
  return result;
}

/**
 * Remove URLs and emails (not pronounceable)
 */
function removeUnpronounceable(text: string): string {
  let result = text;
  
  // URLs
  result = result.replace(/https?:\/\/[^\s]+/g, '');
  result = result.replace(/www\.[^\s]+/g, '');
  
  // Email addresses
  result = result.replace(/[\w.-]+@[\w.-]+\.\w+/g, '');
  
  // Hashtags (convert to readable)
  result = result.replace(/#(\w+)/g, '$1');
  
  // Remove isolated special characters
  result = result.replace(/\s[@#$%&]\s/g, ' ');
  
  return result;
}

/**
 * Remove formatting markers (asterisks, underscores for emphasis)
 */
function removeFormattingMarkers(text: string): string {
  let result = text;
  
  // Asterisks for emphasis (*bold* or **bold**)
  result = result.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
  
  // Underscores for emphasis (_italic_ or __bold__)
  result = result.replace(/_{1,2}([^_]+)_{1,2}/g, '$1');
  
  return result;
}

/**
 * Final cleanup pass
 */
function finalCleanup(text: string): string {
  let result = text;
  
  // Ensure single space between words (final safety net)
  result = result.replace(/\s+/g, ' ');
  
  // But preserve paragraph breaks
  result = result.replace(/ \n /g, '\n');
  result = result.replace(/ \n/g, '\n');
  result = result.replace(/\n /g, '\n');
  
  // Ensure proper paragraph separation (double newline)
  result = result.replace(/\n\n+/g, '\n\n');
  
  return result.trim();
}

export interface PreprocessOptions {
  convertNumbers?: boolean;
  expandAbbreviations?: boolean;
  addDialoguePauses?: boolean;
  handleRomanNumerals?: boolean;
  sanitizeWhitespace?: boolean;
  normalizeLineBreaks?: boolean;
  removeInvisibleChars?: boolean;
  normalizePunctuation?: boolean;
  handleSceneBreaks?: boolean;
  removeUnpronounceable?: boolean;
  removeFormattingMarkers?: boolean;
}

const defaultOptions: PreprocessOptions = {
  convertNumbers: true,
  expandAbbreviations: true,
  addDialoguePauses: true,
  handleRomanNumerals: true,
  sanitizeWhitespace: true,
  normalizeLineBreaks: true,
  removeInvisibleChars: true,
  normalizePunctuation: true,
  handleSceneBreaks: true,
  removeUnpronounceable: true,
  removeFormattingMarkers: true,
};

/**
 * Main preprocessing function - Advanced Protocol
 * Applies all normalization steps in optimal order
 */
export function preprocessTextForTTS(text: string, options: PreprocessOptions = {}): string {
  const opts = { ...defaultOptions, ...options };
  let result = text;
  
  // === PHASE 1: STRUCTURAL CLEANUP ===
  // Remove invisible characters first (they interfere with everything)
  if (opts.removeInvisibleChars) {
    result = removeInvisibleCharacters(result);
  }
  
  // Normalize line breaks before whitespace cleanup
  if (opts.normalizeLineBreaks) {
    result = normalizeLineBreaks(result);
  }
  
  // Sanitize whitespace (double spaces, tabs, etc.)
  if (opts.sanitizeWhitespace) {
    result = sanitizeWhitespace(result);
  }
  
  // === PHASE 2: CONTENT NORMALIZATION ===
  // Handle scene breaks before punctuation normalization
  if (opts.handleSceneBreaks) {
    result = handleSceneBreaks(result);
  }
  
  // Normalize punctuation for proper prosody
  if (opts.normalizePunctuation) {
    result = normalizePunctuation(result);
  }
  
  // Remove formatting markers (asterisks, underscores)
  if (opts.removeFormattingMarkers) {
    result = removeFormattingMarkers(result);
  }
  
  // Remove unpronounceable content (URLs, emails)
  if (opts.removeUnpronounceable) {
    result = removeUnpronounceable(result);
  }
  
  // === PHASE 3: LINGUISTIC EXPANSION ===
  // Handle Roman numerals
  if (opts.handleRomanNumerals) {
    result = handleRomanNumerals(result);
  }
  
  // Expand abbreviations
  if (opts.expandAbbreviations) {
    result = expandAbbreviations(result);
  }
  
  // Convert numbers to words (years first, then general)
  if (opts.convertNumbers) {
    result = convertYearsToWords(result);
    result = convertNumbersToWords(result);
  }
  
  // === PHASE 4: PROSODY ENHANCEMENT ===
  // Add dialogue pauses for natural narration
  if (opts.addDialoguePauses) {
    result = addDialoguePauses(result);
  }
  
  // Final cleanup
  result = finalCleanup(result);
  
  return result;
}

/**
 * Spanish pronunciation corrections using IPA phonemes
 * Maps problematic words to their correct SSML phoneme representation
 * These words are mispronounced by Amazon Polly's Spanish voices
 * 
 * Format: [word, IPA phoneme, display text]
 */
const PRONUNCIATION_CORRECTIONS: Array<[string, string, string]> = [
  // "piedra" - often mispronounced, correct IPA: /ˈpjeðɾa/
  ['piedra', 'ˈpjeðɾa', 'piedra'],
  ['Piedra', 'ˈpjeðɾa', 'Piedra'],
  ['piedras', 'ˈpjeðɾas', 'piedras'],
  ['Piedras', 'ˈpjeðɾas', 'Piedras'],
];

/**
 * Apply pronunciation corrections to already-escaped text
 * Inserts phoneme SSML tags for words that need pronunciation fixes
 */
function applyPronunciationCorrections(escapedText: string): string {
  let result = escapedText;
  
  for (const [word, ipa, display] of PRONUNCIATION_CORRECTIONS) {
    // Match word boundaries - the text is already XML-escaped so no special chars
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    const phonemeTag = `<phoneme alphabet="ipa" ph="${ipa}">${display}</phoneme>`;
    result = result.replace(regex, phonemeTag);
  }
  
  return result;
}

/**
 * Wrap text in SSML with prosody controls
 * Converts special markers to SSML tags
 * Following ACX/Audible audiobook standards
 * 
 * Natural breathing pattern for audiobook narration:
 * - Sentence end (period): 600-700ms - natural breath
 * - Exclamation/Question: 700ms - emotional beat + breath
 * - Comma: 200ms - quick micro-pause
 * - Semicolon/Colon: 350ms - medium pause
 * - Ellipsis: 500ms - suspense/hesitation
 * - Paragraph break: 900ms - topic change + breath
 * - Scene break: 1.8s - major transition
 */
export function wrapInSSML(text: string, rate: string = 'medium'): string {
  const rateMap: Record<string, string> = {
    'very-slow': 'x-slow',
    'slow': 'slow', 
    'medium': 'medium',
    'fast': 'fast',
    'very-fast': 'x-fast',
  };
  
  const prosodyRate = rateMap[rate] || rate;
  
  // Escape special XML characters FIRST (before any SSML insertions)
  let escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Apply pronunciation corrections for problematic Spanish words
  // This must happen AFTER escape but BEFORE other SSML insertions
  escapedText = applyPronunciationCorrections(escapedText);
  
  // === STRUCTURAL BREAKS (largest to smallest) ===
  
  // Scene breaks: 1.8 seconds (major transition, time for listener to reset)
  escapedText = escapedText.replace(/\[SCENE_BREAK\]/g, '<break time="1800ms"/>');
  
  // Paragraph breaks (double newline): 900ms (topic change, natural breath)
  escapedText = escapedText.replace(/\n\n/g, '<break time="900ms"/>');
  
  // Single newlines: 400ms (soft break, minor pause)
  escapedText = escapedText.replace(/\n/g, '<break time="400ms"/>');
  
  // === PUNCTUATION-BASED BREATHING ===
  // These mimic natural narrator breathing patterns
  
  // Ellipsis: 500ms pause for suspense/hesitation (before space or end)
  escapedText = escapedText.replace(/\.\.\.(\s|$)/g, '<break time="500ms"/>$1');
  
  // Period at end of sentence: 650ms (natural breath point)
  // Match period followed by space and capital, or period at very end
  escapedText = escapedText.replace(/\.(\s+)(?=[A-ZÁÉÍÓÚÑ])/g, '.<break time="650ms"/>$1');
  escapedText = escapedText.replace(/\.(\s*)$/g, '.<break time="650ms"/>$1');
  
  // Question mark: 700ms (question needs beat for reflection)
  escapedText = escapedText.replace(/\?(\s+)/g, '?<break time="700ms"/>$1');
  escapedText = escapedText.replace(/\?(\s*)$/g, '?<break time="700ms"/>$1');
  
  // Exclamation: 700ms (emotional beat + breath)
  escapedText = escapedText.replace(/!(\s+)/g, '!<break time="700ms"/>$1');
  escapedText = escapedText.replace(/!(\s*)$/g, '!<break time="700ms"/>$1');
  
  // Semicolon: 350ms (longer than comma, connects related ideas)
  escapedText = escapedText.replace(/;(\s+)/g, ';<break time="350ms"/>$1');
  
  // Colon: 350ms (pause before explanation/list)
  escapedText = escapedText.replace(/:(\s+)/g, ':<break time="350ms"/>$1');
  
  // Em-dash or en-dash: 300ms (parenthetical pause)
  escapedText = escapedText.replace(/—(\s*)/g, '—<break time="300ms"/>$1');
  escapedText = escapedText.replace(/–(\s*)/g, '–<break time="300ms"/>$1');
  
  // Comma: 200ms (quick micro-pause, no full breath)
  escapedText = escapedText.replace(/,(\s+)/g, ',<break time="200ms"/>$1');
  
  // Closing dialogue quotes with attribution coming: 250ms
  escapedText = escapedText.replace(/(["»])(\s*,\s*)/g, '$1<break time="250ms"/>$2');
  
  return `<speak><prosody rate="${prosodyRate}">${escapedText}</prosody></speak>`;
}

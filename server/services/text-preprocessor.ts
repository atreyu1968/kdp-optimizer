/**
 * Text Preprocessor for TTS
 * Optimizes text before sending to Amazon Polly for better audio quality
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
  // Convert years (1900-2099) to words
  return text.replace(/\b(19|20)\d{2}\b/g, (match) => {
    const year = parseInt(match);
    return numberToSpanishWords(year);
  });
}

function convertNumbersToWords(text: string): string {
  // Convert numbers up to 9999 to words (larger numbers stay as digits for clarity)
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

function addDialoguePauses(text: string): string {
  // Add pauses after dialogue markers (—, -, «, », ")
  // SSML break for natural pauses in dialogue
  
  // Pause after opening dialogue markers
  let result = text.replace(/—\s*/g, '— ');
  result = result.replace(/«\s*/g, '« ');
  result = result.replace(/"([^"]+)"/g, '"$1"');
  
  // Add pause before dialogue attribution (dijo, respondió, etc.)
  const dialogueVerbs = ['dijo', 'respondió', 'preguntó', 'exclamó', 'murmuró', 'susurró', 'gritó', 'añadió', 'comentó', 'contestó', 'replicó', 'musitó', 'gruñó'];
  for (const verb of dialogueVerbs) {
    const regex = new RegExp(`(["»—])\\s*(${verb})`, 'gi');
    result = result.replace(regex, '$1, $2');
  }
  
  return result;
}

function cleanSpecialCharacters(text: string): string {
  // Remove or replace problematic characters for TTS
  let result = text;
  
  // Replace multiple spaces with single space
  result = result.replace(/\s+/g, ' ');
  
  // Replace multiple newlines with single newline
  result = result.replace(/\n{3,}/g, '\n\n');
  
  // Remove invisible characters
  result = result.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  // Replace smart quotes with regular quotes
  result = result.replace(/[""]/g, '"');
  result = result.replace(/['']/g, "'");
  
  // Replace en-dash and em-dash with regular dash
  result = result.replace(/[–—]/g, ' — ');
  
  // Remove asterisks used for emphasis (common in manuscripts)
  result = result.replace(/\*+([^*]+)\*+/g, '$1');
  
  // Remove underscores used for emphasis
  result = result.replace(/_+([^_]+)_+/g, '$1');
  
  // Clean up ellipsis
  result = result.replace(/\.{3,}/g, '...');
  result = result.replace(/…/g, '...');
  
  // Add pause after ellipsis
  result = result.replace(/\.\.\./g, '... ');
  
  // Remove URLs
  result = result.replace(/https?:\/\/[^\s]+/g, '');
  
  // Remove email addresses
  result = result.replace(/[\w.-]+@[\w.-]+\.\w+/g, '');
  
  // Clean up excessive punctuation
  result = result.replace(/([!?]){2,}/g, '$1');
  result = result.replace(/,{2,}/g, ',');
  
  return result.trim();
}

function addPunctuationPauses(text: string): string {
  // Ensure proper spacing after punctuation for natural pauses
  let result = text;
  
  // Add space after punctuation if missing
  result = result.replace(/([.!?;:,])([A-ZÁÉÍÓÚÑa-záéíóúñ])/g, '$1 $2');
  
  // Add extra space after paragraph ends for longer pauses
  result = result.replace(/\.\s*\n/g, '.\n\n');
  
  return result;
}

function handleRomanNumerals(text: string): string {
  // Convert common Roman numerals to words
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
    'Capítulo I': 'Capítulo primero',
    'Capítulo II': 'Capítulo segundo',
    'Capítulo III': 'Capítulo tercero',
    'Capítulo IV': 'Capítulo cuarto',
    'Capítulo V': 'Capítulo quinto',
  };
  
  let result = text;
  for (const [roman, word] of Object.entries(romanNumerals)) {
    result = result.replace(new RegExp(roman, 'g'), word);
  }
  
  return result;
}

export interface PreprocessOptions {
  convertNumbers?: boolean;
  expandAbbreviations?: boolean;
  addDialoguePauses?: boolean;
  cleanCharacters?: boolean;
  handleRomanNumerals?: boolean;
}

const defaultOptions: PreprocessOptions = {
  convertNumbers: true,
  expandAbbreviations: true,
  addDialoguePauses: true,
  cleanCharacters: true,
  handleRomanNumerals: true,
};

/**
 * Main preprocessing function
 * Optimizes text for TTS synthesis
 */
export function preprocessTextForTTS(text: string, options: PreprocessOptions = {}): string {
  const opts = { ...defaultOptions, ...options };
  let result = text;
  
  // Clean special characters first
  if (opts.cleanCharacters) {
    result = cleanSpecialCharacters(result);
  }
  
  // Handle Roman numerals
  if (opts.handleRomanNumerals) {
    result = handleRomanNumerals(result);
  }
  
  // Expand abbreviations
  if (opts.expandAbbreviations) {
    result = expandAbbreviations(result);
  }
  
  // Convert years first (before general numbers)
  if (opts.convertNumbers) {
    result = convertYearsToWords(result);
    result = convertNumbersToWords(result);
  }
  
  // Add dialogue pauses
  if (opts.addDialoguePauses) {
    result = addDialoguePauses(result);
  }
  
  // Final punctuation cleanup
  result = addPunctuationPauses(result);
  
  return result.trim();
}

/**
 * Wrap text in SSML with prosody controls for natural narration
 * Following ACX/Audible audiobook standards
 * Note: amazon:auto-breaths is NOT supported by Neural voices
 */
export function wrapInSSML(text: string, rate: string = 'medium'): string {
  // Rate options: x-slow, slow, medium, fast, x-fast, or percentage like 90%
  const rateMap: Record<string, string> = {
    'very-slow': 'x-slow',
    'slow': 'slow', 
    'medium': 'medium',
    'fast': 'fast',
    'very-fast': 'x-fast',
  };
  
  const prosodyRate = rateMap[rate] || rate;
  
  // Escape special XML characters
  let escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Wrap with prosody for speed control
  // Note: amazon:auto-breaths is only supported by Standard voices, not Neural
  return `<speak><prosody rate="${prosodyRate}">${escapedText}</prosody></speak>`;
}

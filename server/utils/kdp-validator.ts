import { kdpValidationRules, type ValidationWarning } from "@shared/schema";

/**
 * Validates if combined title and subtitle length is within KDP limits
 * @param title - Book title
 * @param subtitle - Book subtitle
 * @returns true if combined length is <= 200 characters
 */
export function validateTitleLength(title: string, subtitle: string): boolean {
  const combinedLength = title.length + subtitle.length;
  return combinedLength <= kdpValidationRules.maxTitleSubtitleLength;
}

/**
 * Validates if a keyword field is within the character limit
 * @param keyword - Keyword string to validate
 * @returns true if <= 50 characters
 */
export function validateKeywordChars(keyword: string): boolean {
  return keyword.length <= kdpValidationRules.maxKeywordFieldChars;
}

/**
 * Detects prohibited terms in text (case-insensitive)
 * @param text - Text to check for prohibited terms
 * @returns Array of prohibited terms found (empty if none)
 */
export function validateProhibitedTerms(text: string): string[] {
  const lowerText = text.toLowerCase();
  const foundTerms: string[] = [];

  for (const term of kdpValidationRules.prohibitedTerms) {
    const lowerTerm = term.toLowerCase();
    const escapedTerm = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Determine boundaries based on term's start/end characters
    // Use \b only for word characters, otherwise use whitespace/start/end boundaries
    const startsWithWordChar = /^\w/.test(lowerTerm);
    const endsWithWordChar = /\w$/.test(lowerTerm);
    
    // Build regex pattern with appropriate boundaries
    const beforeBoundary = startsWithWordChar ? '\\b' : '(?:^|\\s)';
    const afterBoundary = endsWithWordChar ? '\\b' : '(?:\\s|$)';
    
    const regex = new RegExp(`${beforeBoundary}${escapedTerm}${afterBoundary}`, 'i');
    
    if (regex.test(lowerText)) {
      console.log(`[KDP Validation] Detected prohibited term: "${term}" in text`);
      foundTerms.push(term);
    }
  }

  return foundTerms;
}

/**
 * Validates if HTML description only uses supported tags
 * @param description - HTML description to validate
 * @returns true if only supported HTML tags are used
 */
export function validateHTML(description: string): boolean {
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
  const matches = Array.from(description.matchAll(tagRegex));
  
  for (const match of matches) {
    const tagName = match[1].toLowerCase();
    if (!kdpValidationRules.allowedHTMLTags.includes(tagName as any)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Removes unsupported HTML tags from description
 * Preserves text content, only removes invalid tags
 * @param description - HTML description to sanitize
 * @returns Sanitized HTML with only supported tags
 */
export function sanitizeHTML(description: string): string {
  const allowedTagsSet = new Set(kdpValidationRules.allowedHTMLTags);
  
  let sanitized = description.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tagName) => {
    if (allowedTagsSet.has(tagName.toLowerCase())) {
      return match;
    }
    return '';
  });
  
  return sanitized;
}

/**
 * Intelligently truncates subtitle to fit within title+subtitle limit
 * Maintains whole words, doesn't cut mid-word
 * @param title - Book title
 * @param subtitle - Book subtitle to truncate
 * @param maxLength - Maximum combined length (default 200)
 * @returns Truncated subtitle that fits within limit
 */
export function truncateSubtitle(
  title: string,
  subtitle: string,
  maxLength: number = kdpValidationRules.maxTitleSubtitleLength
): string {
  const availableLength = maxLength - title.length;
  
  if (subtitle.length <= availableLength) {
    return subtitle;
  }
  
  if (availableLength <= 3) {
    return '';
  }
  
  const words = subtitle.split(' ');
  let truncated = '';
  
  for (const word of words) {
    const testString = truncated ? `${truncated} ${word}` : word;
    
    if (testString.length <= availableLength - 3) {
      truncated = testString;
    } else {
      break;
    }
  }
  
  return truncated ? `${truncated}...` : '';
}

/**
 * Truncates keyword to fit within character limit
 * Maintains whole words when possible
 * @param keyword - Keyword string to truncate
 * @param maxChars - Maximum character count (default 50)
 * @returns Truncated keyword within character limit
 */
export function truncateKeywordChars(
  keyword: string,
  maxChars: number = kdpValidationRules.maxKeywordFieldChars
): string {
  if (keyword.length <= maxChars) {
    return keyword;
  }
  
  const words = keyword.split(' ');
  let truncated = '';
  
  for (const word of words) {
    const testString = truncated ? `${truncated} ${word}` : word;
    
    if (testString.length <= maxChars) {
      truncated = testString;
    } else {
      break;
    }
  }
  
  return truncated;
}

/**
 * Performs comprehensive validation on metadata
 * @param title - Book title
 * @param subtitle - Book subtitle
 * @param description - Book description (HTML)
 * @param keywordFields - Array of keyword strings
 * @returns Array of validation warnings
 */
export function validateMetadata(
  title: string,
  subtitle: string,
  description: string,
  keywordFields: string[]
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  
  if (!validateTitleLength(title, subtitle)) {
    warnings.push({
      type: "title_length",
      severity: "warning",
      message: `Title + Subtitle exceeds ${kdpValidationRules.maxTitleSubtitleLength} characters (${title.length + subtitle.length} total)`,
      field: "title+subtitle",
      details: { 
        titleLength: title.length, 
        subtitleLength: subtitle.length,
        combinedLength: title.length + subtitle.length 
      }
    });
  }
  
  const prohibitedInTitle = validateProhibitedTerms(`${title} ${subtitle}`);
  if (prohibitedInTitle.length > 0) {
    warnings.push({
      type: "prohibited_terms",
      severity: "warning",
      message: `Title/Subtitle contains prohibited terms: ${prohibitedInTitle.join(', ')}`,
      field: "title+subtitle",
      details: { terms: prohibitedInTitle }
    });
  }
  
  const prohibitedInDescription = validateProhibitedTerms(description);
  if (prohibitedInDescription.length > 0) {
    warnings.push({
      type: "prohibited_terms",
      severity: "warning",
      message: `Description contains prohibited terms: ${prohibitedInDescription.join(', ')}`,
      field: "description",
      details: { terms: prohibitedInDescription }
    });
  }
  
  if (!validateHTML(description)) {
    warnings.push({
      type: "html_tags",
      severity: "warning",
      message: "Description contains unsupported HTML tags that will be removed",
      field: "description"
    });
  }
  
  keywordFields.forEach((keyword, index) => {
    if (!validateKeywordChars(keyword)) {
      const charCount = keyword.length;
      warnings.push({
        type: "keyword_chars",
        severity: "warning",
        message: `Keyword field ${index + 1} exceeds ${kdpValidationRules.maxKeywordFieldChars} characters (${charCount} characters)`,
        field: `keyword_${index + 1}`,
        details: { charCount, maxChars: kdpValidationRules.maxKeywordFieldChars }
      });
    }
  });
  
  return warnings;
}

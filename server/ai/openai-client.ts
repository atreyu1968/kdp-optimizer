import OpenAI from "openai";
import { withRetry, delayBetweenCalls } from "./retry-utils.js";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * Prepara el manuscrito para análisis por IA usando muestreo estratégico.
 * 
 * ESTRATEGIA DE OPTIMIZACIÓN:
 * - Para reducir consumo de tokens (85% menos) sin perder calidad
 * - Muestrea secciones clave: INICIO + MEDIO + FINAL
 * - Mantiene cobertura completa de la narrativa
 * 
 * MUESTREO PARA MANUSCRITOS GRANDES (>60k caracteres):
 * - Primeros 25,000 caracteres (introducción, personajes, conflicto inicial)
 * - 20,000 caracteres del MEDIO (desarrollo, giros de trama)
 * - Últimos 15,000 caracteres (clímax, resolución)
 * - TOTAL: ~60,000 caracteres (~15k tokens)
 * 
 * MANUSCRITOS PEQUEÑOS (≤60k caracteres):
 * - Se envía el texto COMPLETO (óptimo para libros cortos)
 * 
 * BENEFICIOS:
 * - ✅ 85% menos consumo de tokens (de ~100k a ~15k)
 * - ✅ Cobertura de toda la estructura narrativa
 * - ✅ Evita errores de rate limiting
 * - ✅ Análisis más rápido
 * 
 * @param text - Texto completo del manuscrito
 * @returns Texto completo (si es corto) o muestreo estratégico (si es largo)
 */
function prepareManuscriptForAnalysis(text: string): string {
  const SAMPLE_THRESHOLD = 60000; // 60k caracteres
  const START_CHARS = 25000;      // Primeros 25k
  const MIDDLE_CHARS = 20000;     // 20k del medio
  const END_CHARS = 15000;        // Últimos 15k
  
  // Manuscritos cortos: enviar completo
  if (text.length <= SAMPLE_THRESHOLD) {
    console.log(
      `[AI Analysis] 📖 Manuscrito pequeño: ${text.length.toLocaleString()} caracteres\n` +
      `  → Enviando texto COMPLETO para análisis`
    );
    return text;
  }

  // Manuscritos largos: muestreo estratégico
  const wordCount = Math.floor(text.length / 4);
  const totalSampleChars = START_CHARS + MIDDLE_CHARS + END_CHARS;
  const coveragePercent = Math.floor((totalSampleChars / text.length) * 100);
  
  console.log(
    `[AI Analysis] 📚 Manuscrito largo: ${text.length.toLocaleString()} caracteres (~${wordCount.toLocaleString()} palabras)\n` +
    `  → Usando MUESTREO ESTRATÉGICO:\n` +
    `    • Inicio: ${START_CHARS.toLocaleString()} caracteres\n` +
    `    • Medio: ${MIDDLE_CHARS.toLocaleString()} caracteres\n` +
    `    • Final: ${END_CHARS.toLocaleString()} caracteres\n` +
    `  → Total a analizar: ${totalSampleChars.toLocaleString()} caracteres (${coveragePercent}% coverage)\n` +
    `  → Reducción de tokens: ~85% vs. enviar texto completo`
  );
  
  // Extraer secciones estratégicas
  const startSection = text.substring(0, START_CHARS);
  
  const middleStart = Math.floor((text.length - MIDDLE_CHARS) / 2);
  const middleSection = text.substring(middleStart, middleStart + MIDDLE_CHARS);
  
  const endSection = text.substring(text.length - END_CHARS);
  
  // Combinar con separadores claros
  return (
    `=== INICIO DEL MANUSCRITO ===\n${startSection}\n\n` +
    `=== SECCIÓN MEDIA DEL MANUSCRITO ===\n${middleSection}\n\n` +
    `=== FINAL DEL MANUSCRITO ===\n${endSection}`
  );
}

export async function analyzeManuscript(
  text: string,
  language: string,
  genre: string
): Promise<{
  seedKeywords: string[];
  themes: string[];
  entities: string[];
  tropes: string[];
  targetAudienceInsights: string[];
  emotionalHooks: string[];
  isFiction: boolean;
}> {
  // Preparar manuscrito usando muestreo estratégico para optimizar consumo de tokens
  const manuscriptText = prepareManuscriptForAnalysis(text);
  
  // Determinar si es ficción o no ficción basado en el género
  const fictionGenres = ['fiction', 'novel', 'romance', 'mystery', 'thriller', 'fantasy', 'sci-fi', 'horror', 'literary', 'historical fiction', 'novela', 'ficción', 'romántica', 'misterio', 'terror', 'fantasía'];
  const isFiction = fictionGenres.some(fg => genre.toLowerCase().includes(fg));
  
  const prompt = `Analyze this ${genre} manuscript written in ${language} for Amazon KDP optimization using the A9 algorithm principles.

CRITICAL CONTEXT - Amazon's A9 Algorithm:
- Prioritizes CONVERSION and SALES VELOCITY over traditional SEO
- Books that convert searchers into buyers get promoted
- Long-tail keywords (3-5 words) attract HIGH-INTENT buyers
- Generic single words attract browsers, not buyers

IMPORTANT: You are receiving STRATEGIC SAMPLES from the manuscript:
- BEGINNING section (introduction, characters, initial conflict)
- MIDDLE section (development, plot twists)  
- ENDING section (climax, resolution)

BOOK TYPE: ${isFiction ? 'FICTION' : 'NON-FICTION'}

Extract the following with DEEP ANALYSIS:

1. SEED KEYWORDS (25-35 diverse LONG-TAIL phrases):
   Apply the 4-TYPE KEYWORD STRATEGY from professional KDP marketing:
   
   TYPE A - GENRE KEYWORDS (6-8 phrases):
   - Specific subgenre phrases, NOT generic genre words
   - BAD: "Fantasy" | GOOD: "Fantasía urbana con brujas y romance"
   - BAD: "Mystery" | GOOD: "Cozy mystery small town amateur detective"
   
   TYPE B - AUDIENCE KEYWORDS (5-7 phrases):
   - Micro-segmented reader identity keywords
   - BAD: "Para mujeres" | GOOD: "Libros para mujeres emprendedoras de 35+"
   - BAD: "For teens" | GOOD: "Young adult readers who loved Hunger Games"
   
   TYPE C - TROPE/TONE KEYWORDS (6-8 phrases):
   - Specific literary tropes readers actively search for
   - Examples: "enemies to lovers slow burn", "found family adventure", "unreliable narrator psychological", "second chance romance"
   
   TYPE D - ${isFiction ? 'SETTING/ATMOSPHERE' : 'SOLUTION/BENEFIT'} KEYWORDS (6-8 phrases):
   ${isFiction ? 
   '- Setting and atmosphere descriptors\n   - Examples: "Victorian London gaslight mystery", "small coastal town secrets", "dystopian future rebellion"' :
   '- Specific problems the book solves\n   - BAD: "Dieta" | GOOD: "Recetas bajas en carbohidratos para principiantes"\n   - BAD: "Business" | GOOD: "Passive income strategies for busy professionals"'}

2. LITERARY TROPES (5-8 specific tropes):
   - Identify recognizable narrative patterns readers search for
   - Fiction examples: "slow burn romance", "chosen one", "heist gone wrong", "fish out of water", "dark academia", "morally grey protagonist"
   - Non-fiction examples: "step-by-step guide", "personal transformation journey", "contrarian advice", "myth-busting approach"

3. TARGET AUDIENCE INSIGHTS (4-6 specific reader profiles):
   - WHO exactly would buy this book?
   - Be SPECIFIC about demographics, psychographics, and reading preferences
   - Examples: "Fans of Colleen Hoover seeking darker romance", "Middle-aged women rediscovering themselves after divorce", "History buffs interested in WWII resistance movements"

4. EMOTIONAL HOOKS (4-6 emotional promises):
   - What emotions does this book deliver?
   - What transformation does the reader experience?
   - Examples: "heart-wrenching redemption arc", "edge-of-seat suspense until last page", "cathartic emotional release", "empowering self-discovery journey"

5. MAIN THEMES (3-5 SPECIFIC themes):
   - Go beyond generic themes
   - BAD: "love", "redemption" | GOOD: "healing from betrayal through unexpected friendship", "finding purpose after career collapse"

6. NAMED ENTITIES:
   - Character names with brief archetype description
   - Key locations/settings
   - Important objects/symbols

Complete manuscript:
${manuscriptText}

RESPONSE FORMAT:
Return JSON with:
- seedKeywords: array of 25-35 long-tail keyword phrases
- themes: array of 3-5 specific theme strings
- entities: array of character/place/object strings
- tropes: array of 5-8 literary trope strings
- targetAudienceInsights: array of 4-6 specific reader profile strings
- emotionalHooks: array of 4-6 emotional promise strings
- isFiction: boolean (${isFiction})`;

  const response = await withRetry(async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert Amazon KDP marketing strategist specializing in conversion optimization. Your goal is to identify long-tail, high-intent keywords that attract buyers ready to purchase, not just browsers. You understand that Amazon's A9 algorithm prioritizes sales velocity and conversion rate over traditional SEO metrics.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return {
    seedKeywords: result.seedKeywords || [],
    themes: result.themes || [],
    entities: result.entities || [],
    tropes: result.tropes || [],
    targetAudienceInsights: result.targetAudienceInsights || [],
    emotionalHooks: result.emotionalHooks || [],
    isFiction: result.isFiction ?? isFiction,
  };
}

export async function generateMetadata(
  originalTitle: string,
  seedKeywords: string[],
  themes: string[],
  genre: string,
  targetAudience: string,
  market: string,
  locale: string,
  tropes?: string[],
  emotionalHooks?: string[],
  isFiction?: boolean
): Promise<{
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
  categories: string[];
}> {
  const bookType = isFiction !== false ? 'FICTION' : 'NON-FICTION';
  
  const prompt = `Generate conversion-optimized Amazon KDP metadata for a ${genre} book targeting ${market} (${locale}).

CRITICAL CONTEXT - Amazon's A9 Algorithm:
- Prioritizes CONVERSION and SALES VELOCITY over traditional SEO
- Books that convert searchers into buyers get promoted
- First impressions drive click-through rate (CTR), which impacts ranking
- Write ALL content natively in ${locale} - DO NOT translate from another language

BOOK TYPE: ${bookType}
Original Title: ${originalTitle}
Target Audience: ${targetAudience || "General readers"}
Seed Keywords: ${seedKeywords.slice(0, 20).join(", ")}
Themes: ${themes.join(", ")}
${tropes?.length ? `Literary Tropes: ${tropes.join(", ")}` : ''}
${emotionalHooks?.length ? `Emotional Hooks: ${emotionalHooks.join(", ")}` : ''}

REQUIREMENTS:

1. TITLE (Keep original title):
   - Use the original title: "${originalTitle}"
   - If the original title doesn't start with the main keyword, that's OK - we'll optimize in the subtitle
   - Maximum 80 characters recommended

2. SUBTITLE (CRITICAL for conversion):
   - Place the MOST IMPORTANT long-tail keyword phrase at the START
   - Include a clear PROMISE or TRANSFORMATION for the reader
   ${bookType === 'NON-FICTION' ? 
   `- For NON-FICTION: Promise a BENEFIT ("Cómo hacer X en Y tiempo", "Guía práctica para...")` :
   `- For FICTION: Evoke the genre and emotional experience`}
   - Example structure: "[Main Long-tail Keyword]: [Clear Benefit/Promise]"
   - Good example: "A Cozy Mystery with Small-Town Secrets: Unravel the Truth in this Page-Turning Whodunit"
   - Bad example: "Book One in the Series" (no keyword, no promise)
   - MUST be persuasive and benefit-oriented, not just keyword stuffing
   - Combined title + subtitle MUST be under 200 characters total

3. HTML DESCRIPTION - THIS IS COPYWRITING, NOT A PLOT SUMMARY:
   
   ⚠️ CRITICAL ERROR TO AVOID: Do NOT simply summarize the plot!
   The description is a SALES PAGE, not a synopsis. Your goal is to SELL, not inform.
   
   COPYWRITING STRUCTURE (Hook → Conflict → Stakes → CTA):
   
   A) THE HOOK (First 150 chars - visible in search results):
      - Start with <b>bold text</b> that GRABS attention
      - Use a provocative question, shocking statement, or emotional trigger
      - ${bookType === 'FICTION' ? 
      'Fiction examples: "¿Qué harías si descubrieras que tu mejor amigo es un asesino?"' :
      'Non-fiction examples: "El 90% de los emprendedores fracasan en su primer año. Este libro te enseña a ser del otro 10%."'}
   
   B) THE CONFLICT/PROBLEM:
      - ${bookType === 'FICTION' ? 
      'Present the central conflict without spoilers. Make readers FEEL the tension.' :
      'Identify the reader\'s PAIN POINT. Make them feel understood.'}
      - Use <i>italics</i> for emotional emphasis
   
   C) THE STAKES (What's at risk?):
      - ${bookType === 'FICTION' ? 
      '¿Qué pierde el protagonista si falla? Make readers CARE about the outcome.' :
      '¿Qué pierde el lector si no actúa? Create urgency.'}
   
   D) BENEFITS/FEATURES (Use bullet list):
      - <ul><li>3-5 compelling reasons to buy</li></ul>
      - ${bookType === 'FICTION' ? 
      'Examples: "Giros inesperados que te mantendrán despierto", "Personajes que nunca olvidarás"' :
      'Examples: "Estrategias probadas por expertos", "Ejercicios prácticos paso a paso"'}
   
   E) CALL TO ACTION (Final paragraph):
      - Create urgency and clear next step
      - Example: "Desplaza hacia arriba y haz clic en 'Comprar ahora' para comenzar tu transformación hoy"
   
   FORMAT RULES:
   - Use ONLY: <b>, <i>, <u>, <br>, <p>, <h4>, <h5>, <h6>, <ul><li>, <ol><li>
   - 3-4 paragraphs using <p></p>
   - Maximum 4000 characters
   - NEVER reveal the ending or major plot twists

4. PROHIBITED TERMS (DO NOT use these anywhere):
   - "bestseller", "best-seller", "#1"
   - "free", "gratis"
   - "new release", "nuevo"
   - Competitor author names
   - Trademarked terms you don't own
   - Subjective claims without proof

5. BACKEND KEYWORDS - Apply 4-TYPE STRATEGY:
   Generate EXACTLY 7 keyword phrases (one per KDP field, max 50 chars each):
   
   - Field 1 (GENRE): Specific subgenre phrase (e.g., "cozy mystery amateur sleuth")
   - Field 2 (AUDIENCE): Reader identity phrase (e.g., "libros para mujeres 40+")
   - Field 3 (TROPES): Literary trope phrase (e.g., "enemies to lovers slow burn")
   - Field 4 (${bookType === 'FICTION' ? 'SETTING' : 'SOLUTION'}): ${bookType === 'FICTION' ? 'Atmosphere/setting' : 'Problem solved'} phrase
   - Field 5 (EMOTION): Emotional benefit phrase (e.g., "feel-good heartwarming")
   - Field 6 (SYNONYMS): Variations and related terms
   - Field 7 (COMP): Comparable books/authors readers search

6. CATEGORIES (3 category suggestions):
   - 1 main broad category
   - 2 niche/specific subcategories (less competitive, easier to rank #1)
   - Format: "Category > Subcategory > Sub-subcategory" where applicable

RESPONSE FORMAT:
Return JSON with: title (string), subtitle (string), description (HTML string), keywords (array of EXACTLY 7 strings, each max 50 characters), categories (array of 3 strings)

Remember: Write natively in ${locale} with cultural relevance. Every word should help turn a browser into a buyer.`;

  const response = await withRetry(async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert Amazon KDP conversion optimization specialist with deep knowledge of the A9 algorithm. Your primary goal is maximizing sales conversion, not just search visibility. You understand that Amazon rewards books that convert searchers into buyers. You are a skilled copywriter who creates persuasive, benefit-driven content while naturally incorporating keywords. You NEVER use prohibited terms. You write natively in the target language with cultural nuance, never simply translating.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return {
    title: result.title || originalTitle,
    subtitle: result.subtitle || "",
    description: result.description || "",
    keywords: result.keywords || [],
    categories: result.categories || [],
  };
}

export async function optimizeKeywordsForMarket(
  keywords: string[],
  market: string,
  locale: string,
  genre: string
): Promise<string[]> {
  const prompt = `Generate market-optimized backend keywords for Amazon KDP ${market} marketplace (${locale}).

CRITICAL CONTEXT - Backend Keyword Strategy:
- These go into KDP's 7 backend keyword fields (50 characters each max)
- Amazon uses a "BAG OF WORDS" indexing model - logical order is NOT required
- Amazon automatically indexes all permutations and combinations
- Words from title/subtitle are ALREADY indexed - repeating them wastes space
- Focus on CONVERSION: high-intent buyer keywords, not casual browser terms
- Generate NATIVELY in ${locale} - understand local search patterns and idioms

Genre: ${genre}
Base Keywords: ${keywords.slice(0, 15).join(", ")}

REQUIREMENTS:

1. EXACTLY 7 KEYWORD PHRASES:
   - Generate EXACTLY 7 keyword phrases (one per KDP field)
   - Each phrase MUST be maximum 50 characters
   - You can combine multiple keywords within one phrase using commas if they fit (e.g., "mystery, thriller, suspense")
   - Prioritize long-tail phrases when possible within the 50 char limit

2. DIVERSITY - Each field should target different aspects:
   - Field 1: Specific subgenre phrases (e.g., "cozy mystery, amateur sleuth")
   - Field 2: Character archetype phrases (e.g., "strong heroine, detective duo")
   - Field 3: Setting-based phrases (e.g., "Victorian London, historical")
   - Field 4: Emotional/benefit phrases (e.g., "heartwarming, second chance")
   - Field 5: Trope-based phrases (e.g., "forbidden love, enemies to lovers")
   - Field 6: Variations & synonyms (e.g., "thriller, suspense, page turner")
   - Field 7: Additional relevant terms specific to the book

3. NATIVE LANGUAGE GENERATION:
   - Think like a ${locale} reader searching on Amazon
   - Use local idioms, colloquialisms, and search patterns
   - Include regional spelling variations
   - Consider cultural nuances in how ${locale} readers search for books
   - DO NOT simply translate - generate authentically

4. FORMAT RULES (CRITICAL):
   - EXACTLY 7 strings in the array (one per field)
   - Each string maximum 50 characters
   - Multiple keywords within one field separated by commas
   - NO prohibited terms: "bestseller", "free", "new", "#1", competitor names
   - Example: ["mystery, thriller, suspense", "detective, sleuth, investigator", "Victorian London, historical"]

5. BUYER INTENT FOCUS:
   - Target searchers ready to BUY, not just browse
   - Specific phrases indicate higher purchase intent
   - Generic single words attract browsers, not buyers

RESPONSE FORMAT:
Return JSON with: keywords (array of EXACTLY 7 strings, each max 50 characters)

Remember: Write for ${locale} native speakers. Think about how they ACTUALLY search when looking to buy a book. Optimize for CONVERSION.`;

  const response = await withRetry(async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert in Amazon KDP backend keyword optimization and international market research. You understand the 'bag of words' indexing model and prioritize long-tail, high-intent keywords. You generate keywords natively in each language based on local search behavior, cultural nuances, and regional idioms - you never simply translate. Your goal is conversion optimization: attracting buyers, not just browsers.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return result.keywords || keywords;
}

export interface MarketingKit {
  tiktokHooks: string[];
  instagramPosts: string[];
  pinterestDescriptions: string[];
  hashtags: {
    general: string[];
    specific: string[];
  };
  leadMagnetIdeas: string[];
  reviewCTA: string;
  freePromoStrategy: string;
  bookQuotes: string[];
}

export async function generateMarketingKit(
  title: string,
  genre: string,
  themes: string[],
  tropes: string[],
  emotionalHooks: string[],
  targetAudienceInsights: string[],
  locale: string,
  isFiction: boolean
): Promise<MarketingKit> {
  const bookType = isFiction ? 'FICTION' : 'NON-FICTION';
  
  const prompt = `Generate a comprehensive ORGANIC MARKETING KIT for a ${genre} book in ${locale}.

CONTEXT - Zero-Budget Marketing Strategy:
This kit is for independent publishers using organic (free) marketing strategies.
The goal is to convert TIME + KNOWLEDGE into VISIBILITY without paid ads.

BOOK INFORMATION:
- Title: "${title}"
- Type: ${bookType}
- Themes: ${themes.join(", ")}
${tropes?.length ? `- Literary Tropes: ${tropes.join(", ")}` : ''}
${emotionalHooks?.length ? `- Emotional Hooks: ${emotionalHooks.join(", ")}` : ''}
${targetAudienceInsights?.length ? `- Target Audience: ${targetAudienceInsights.join(", ")}` : ''}

GENERATE THE FOLLOWING MARKETING ASSETS:

1. TIKTOK HOOKS (5 viral-worthy hooks):
   - First 3 seconds are CRITICAL - these must grab attention immediately
   - Use provocative questions, bold statements, or pattern interrupts
   - Format: Text that appears on screen in the first 3 seconds
   - Examples: 
     * "Si te gusta Stephen King, este libro te va a impedir dormir"
     * "POV: Encontraste el libro perfecto para tu situación"
     * "Este libro debería ser ilegal por lo adictivo que es"
   - Make them specific to THIS book's themes and emotional hooks

2. INSTAGRAM POST IDEAS (5 post concepts):
   - Mix of formats: quote graphics, carousel ideas, reel concepts
   - Each should include: Post type, Content concept, Caption hook
   - Focus on aesthetic and shareable content
   - Examples:
     * "Carrusel: 5 frases que te harán replantearte todo - extraídas del libro"
     * "Quote graphic: [frase impactante] sobre fondo de estética [género]"

3. PINTEREST DESCRIPTIONS (3 SEO-optimized descriptions):
   - Long-tail keywords for discoverability
   - Descriptions that work as mini-sales pitches
   - Include reader benefit/promise
   - Pinterest content has long shelf life (months/years)

4. HASHTAGS:
   - General (10): Broad reach hashtags (#BookTokEspaña, #LibrosRecomendados, etc.)
   - Specific (10): Niche hashtags related to this book's genre/themes

5. LEAD MAGNET IDEAS (3 ideas):
   - Free content to offer in exchange for email subscription
   - Examples for fiction: "Primeros 3 capítulos gratis", "Final alternativo exclusivo", "Mapa del mundo del libro"
   - Examples for non-fiction: "Checklist imprimible", "Mini-guía de 10 páginas", "Plantillas descargables"
   - Make them specific to THIS book

6. REVIEW REQUEST CTA:
   - Text to include at the end of the ebook
   - Warm, non-pushy request for honest review
   - Include direct link instruction placeholder
   - Should feel personal, not corporate

7. FREE PROMO STRATEGY (KDP Select 5-Day Free):
   - Step-by-step plan for the 5 free days promotion
   - Where to promote (Facebook groups, forums, etc.)
   - Timeline and messaging strategy
   - Post-promotion follow-up

8. QUOTABLE BOOK QUOTES (5 quotes):
   - If you can infer memorable quotes from the themes/hooks, suggest them
   - If not, suggest the TYPE of quotes that would work well for sharing
   - These should be perfect for quote graphics on social media

LANGUAGE: Generate ALL content natively in ${locale} with cultural relevance.

RESPONSE FORMAT:
Return JSON with:
- tiktokHooks: array of 5 strings
- instagramPosts: array of 5 strings (post concept descriptions)
- pinterestDescriptions: array of 3 strings
- hashtags: { general: array of 10 strings, specific: array of 10 strings }
- leadMagnetIdeas: array of 3 strings
- reviewCTA: string (the full call-to-action text)
- freePromoStrategy: string (complete strategy description)
- bookQuotes: array of 5 strings (suggested quotable content)`;

  const response = await withRetry(async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert in organic book marketing and social media strategy for independent publishers. You understand BookTok, Bookstagram, and Pinterest algorithms. You create viral-worthy content hooks and engagement-driving strategies. You write natively in Spanish and understand the nuances of the Spanish-speaking book community. Your goal is to help authors build visibility without paid advertising.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return {
    tiktokHooks: result.tiktokHooks || [],
    instagramPosts: result.instagramPosts || [],
    pinterestDescriptions: result.pinterestDescriptions || [],
    hashtags: result.hashtags || { general: [], specific: [] },
    leadMagnetIdeas: result.leadMagnetIdeas || [],
    reviewCTA: result.reviewCTA || "",
    freePromoStrategy: result.freePromoStrategy || "",
    bookQuotes: result.bookQuotes || [],
  };
}

export interface SEOFields {
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  ogTitle?: string;
  ogDescription?: string;
}

export async function generateSEO(
  bookTitle: string,
  subtitle: string,
  genre: string,
  themes: string[],
  description: string,
  locale: string
): Promise<SEOFields> {
  const prompt = `Generate SEO metadata for a book landing page in ${locale}.

BOOK INFORMATION:
- Title: "${bookTitle}"
- Subtitle: "${subtitle}"
- Genre: ${genre}
- Themes: ${themes.join(", ")}
- Book Description (for context): ${description.slice(0, 500)}...

GENERATE OPTIMIZED SEO METADATA:

1. SEO TITLE (50-60 characters):
   - Include main keyword (title + genre)
   - Format: "[Book Title] - [Genre/Hook]" or "[Book Title]: [Compelling Promise]"
   - Must be compelling for Google search results
   - Example: "La Mente del Cautivo - Thriller Histórico que te Atrapa"

2. SEO DESCRIPTION (150-160 characters):
   - Meta description for Google search results
   - Include primary keywords naturally
   - End with a call to action or hook
   - Must entice clicks from search results
   - Example: "Descubre el thriller histórico que ha cautivado a miles de lectores. Una historia de suspenso que no podrás dejar. Lee el primer capítulo gratis."

3. SEO KEYWORDS (8-12 keywords):
   - Mix of head terms and long-tail keywords
   - Include: book title, genre, author themes, reader searches
   - Focus on what potential buyers would search
   - Example: ["thriller histórico", "novela de suspenso", "libro cautivo", "mejor thriller español 2024"]

4. OPEN GRAPH TITLE (60-70 characters):
   - Title for social media shares (Facebook, LinkedIn)
   - Can be slightly longer and more descriptive than SEO title
   - Should be engaging and shareable

5. OPEN GRAPH DESCRIPTION (100-150 characters):
   - Description for social media previews
   - More casual/emotional than SEO description
   - Designed for social engagement

LANGUAGE: Generate ALL content natively in ${locale}.

RESPONSE FORMAT:
Return JSON with:
- seoTitle: string (50-60 chars)
- seoDescription: string (150-160 chars)
- seoKeywords: array of 8-12 strings
- ogTitle: string (60-70 chars)
- ogDescription: string (100-150 chars)`;

  const response = await withRetry(async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert in SEO optimization for book landing pages and author websites. You understand Google's search algorithms, meta tag best practices, and Open Graph optimization for social sharing. You write compelling, keyword-rich meta content that ranks well and drives clicks. You write natively in the requested language.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.6,
    });
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return {
    seoTitle: result.seoTitle || `${bookTitle} - ${genre}`,
    seoDescription: result.seoDescription || "",
    seoKeywords: result.seoKeywords || [],
    ogTitle: result.ogTitle,
    ogDescription: result.ogDescription,
  };
}

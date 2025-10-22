import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function analyzeManuscript(
  text: string,
  language: string,
  genre: string
): Promise<{
  seedKeywords: string[];
  themes: string[];
  entities: string[];
}> {
  const prompt = `Analyze this ${genre} manuscript written in ${language} for Amazon KDP optimization.

CRITICAL: Amazon's A9 algorithm prioritizes CONVERSION and SALES, not just SEO relevance. Focus on identifying specific, niche elements that will attract HIGH-INTENT buyers.

Extract the following:

1. SEED KEYWORDS (20-30 diverse keywords):
   - Prioritize LONG-TAIL keywords (3-5 word phrases) over generic single words
   - Example: Instead of "mystery", use "cozy mystery small town detective"
   - Include character archetypes (e.g., "reluctant hero", "strong female protagonist", "unlikely allies")
   - Include specific subgenres and tropes (e.g., "enemies to lovers romance", "time travel adventure")
   - Include setting descriptors (e.g., "Victorian London mystery", "post-apocalyptic survival")
   - Include emotional hooks and reader promises (e.g., "heartwarming second chance", "edge-of-seat suspense")
   - These should be diverse and cover different angles: plot elements, character types, themes, emotional tones, settings

2. MAIN THEMES (3-5 specific themes):
   - Go beyond generic themes like "love" or "redemption"
   - Be specific: "overcoming childhood trauma", "navigating corporate corruption", "finding identity in a new culture"
   - Focus on themes that resonate emotionally and indicate transformation/promise

3. NAMED ENTITIES (characters, places, important objects):
   - Character names and types
   - Specific locations or settings
   - Important objects or symbols

Manuscript excerpt (first 5000 characters):
${text.substring(0, 5000)}

Return a JSON object with: seedKeywords (array of strings with long-tail phrases), themes (array of specific theme strings), entities (array of strings).`;

  const response = await openai.chat.completions.create({
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

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return {
    seedKeywords: result.seedKeywords || [],
    themes: result.themes || [],
    entities: result.entities || [],
  };
}

export async function generateMetadata(
  originalTitle: string,
  seedKeywords: string[],
  themes: string[],
  genre: string,
  targetAudience: string,
  market: string,
  locale: string
): Promise<{
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
  categories: string[];
}> {
  const prompt = `Generate conversion-optimized Amazon KDP metadata for a ${genre} book targeting ${market} (${locale}).

CRITICAL CONTEXT - Amazon's A9 Algorithm:
- Prioritizes CONVERSION and SALES VELOCITY over traditional SEO
- Books that convert searchers into buyers get promoted
- First impressions drive click-through rate (CTR), which impacts ranking
- Write ALL content natively in ${locale} - DO NOT translate from another language

Original Title: ${originalTitle}
Target Audience: ${targetAudience || "General readers"}
Seed Keywords: ${seedKeywords.slice(0, 15).join(", ")}
Themes: ${themes.join(", ")}

REQUIREMENTS:

1. TITLE (Keep original title):
   - Use the original title: "${originalTitle}"
   - If the original title doesn't start with the main keyword, that's OK - we'll optimize in the subtitle
   - Maximum 80 characters recommended

2. SUBTITLE (CRITICAL for conversion):
   - Place the MOST IMPORTANT long-tail keyword phrase at the START
   - Include a clear PROMISE or TRANSFORMATION for the reader
   - Example structure: "[Main Long-tail Keyword]: [Clear Benefit/Promise]"
   - Good example: "A Cozy Mystery with Small-Town Secrets: Unravel the Truth in this Page-Turning Whodunit"
   - Bad example: "Book One in the Series" (no keyword, no promise)
   - MUST be persuasive and benefit-oriented, not just keyword stuffing
   - Combined title + subtitle MUST be under 200 characters total

3. HTML DESCRIPTION (Optimize for CONVERSION, not just keywords):
   - CRITICAL: First 150 characters are visible in search results - make them compelling!
   - Start with a powerful hook using <b>bold text</b> in the first sentence
   - Structure: Hook → Conflict/Stakes/Promise → Benefits/Features → Call to Action
   - Use ONLY these HTML tags (others will break): <b>, <i>, <u>, <br>, <p>, <h4>, <h5>, <h6>, <ul><li>, <ol><li>
   - Include 3-4 paragraphs using <p></p>
   - Use <ul><li></li></ul> for key benefits or features (3-5 bullet points)
   - Use <i>italics</i> for emotional emphasis
   - End with a persuasive call to action (e.g., "Scroll up and click 'Buy Now' to start your journey today!")
   - Maximum 4000 characters
   - Write to SELL, not just to inform - persuasive copywriting is key

4. PROHIBITED TERMS (DO NOT use these anywhere):
   - "bestseller", "best-seller", "#1"
   - "free", "gratis"
   - "new release", "nuevo"
   - Competitor author names
   - Trademarked terms you don't own
   - Subjective claims without proof

5. BACKEND KEYWORDS (EXACTLY 7 keyword phrases):
   - Generate EXACTLY 7 diverse, market-specific keyword phrases
   - Each phrase MUST be maximum 50 characters
   - Prioritize long-tail phrases (3-5 words) for each field
   - Include variations, synonyms, and common misspellings relevant to ${locale}
   - Mix of different types: subgenre terms, character types, settings, themes, emotional hooks
   - Focus on high-intent buyer keywords, not casual browser terms
   - Each field should be a complete, optimized phrase separated by commas if multiple keywords fit within 50 chars

6. CATEGORIES (3 category suggestions):
   - 1 main broad category
   - 2 niche/specific subcategories (less competitive)
   - Format: "Category > Subcategory > Sub-subcategory" where applicable

RESPONSE FORMAT:
Return JSON with: title (string), subtitle (string), description (HTML string), keywords (array of EXACTLY 7 strings, each max 50 characters), categories (array of 3 strings)

Remember: Write natively in ${locale} with cultural relevance and local search patterns. Optimize for CONVERSION - every word should help turn a browser into a buyer.`;

  const response = await openai.chat.completions.create({
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

  const response = await openai.chat.completions.create({
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

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return result.keywords || keywords;
}

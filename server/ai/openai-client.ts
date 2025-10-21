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
  const prompt = `Analyze this ${genre} manuscript written in ${language}. Extract:
1. 20-30 seed keywords (important nouns, verbs, themes, concepts)
2. Main themes (3-5 key themes)
3. Named entities (characters, places, important objects)

Manuscript excerpt (first 5000 characters):
${text.substring(0, 5000)}

Return a JSON object with: seedKeywords (array of strings), themes (array of strings), entities (array of strings).`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert book marketing analyst. Extract keywords and themes for Amazon KDP optimization.",
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
  const prompt = `Generate optimized Amazon KDP metadata for a ${genre} book.

Original Title: ${originalTitle}
Target Market: ${market} (${locale})
Target Audience: ${targetAudience || "General readers"}
Seed Keywords: ${seedKeywords.slice(0, 15).join(", ")}
Themes: ${themes.join(", ")}

Requirements:
1. Keep the original title
2. Create a compelling subtitle that includes the main keyword and value proposition
3. Ensure title + subtitle is under 200 characters
4. Generate an HTML-formatted description (max 4000 characters) with:
   - Opening hook with <b> tags
   - 3-4 paragraphs with <p> tags
   - Use <ul><li> for key benefits/features
   - Include <i> for emphasis
   - Call to action at the end
5. Generate 50 relevant keywords for backend use (mix of long-tail and short-tail)
6. Suggest 3 categories: 1 main category and 2 niche categories

Respond in JSON format with: title, subtitle, description, keywords (array), categories (array).`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are an expert Amazon KDP metadata optimizer. Create compelling, SEO-optimized content that follows all KDP guidelines.",
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
  const prompt = `Optimize these keywords for ${market} (${locale}) Amazon marketplace.

Genre: ${genre}
Base Keywords: ${keywords.slice(0, 30).join(", ")}

Requirements:
1. Adapt keywords to local search behavior and language nuances
2. Remove any that appear in title/subtitle (they'll be provided separately)
3. Focus on high-demand, low-competition phrases
4. Mix long-tail (3-5 words) and short-tail (1-2 words)
5. Return 50 optimized keywords

Respond with a JSON object containing: keywords (array of strings).`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert in Amazon keyword research and local market optimization.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return result.keywords || keywords;
}

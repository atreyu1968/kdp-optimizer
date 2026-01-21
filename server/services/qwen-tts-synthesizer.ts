/**
 * Qwen 3 TTS Synthesizer for AudiobookForge
 * Uses Alibaba Cloud DashScope API for high-quality multilingual speech synthesis
 * Supports 49 voices, 10 languages including Spanish, English, German, French, Italian, Portuguese
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { storage } from "../storage";
import { preprocessTextForTTS } from "./text-preprocessor";
import { masterAudioFromUrl, type MasteringOptions, type ID3Metadata } from "./audio-mastering";

// Qwen TTS has 600 character limit per request
const MAX_CHARS_PER_REQUEST = 500;

// Concurrency settings - reduced for Qwen due to rate limits
const PARALLEL_CHAPTER_LIMIT = 1;
const DELAY_BETWEEN_REQUESTS_MS = 200;

// DashScope API endpoints (multimodal-generation for TTS)
const DASHSCOPE_INTL_URL = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const DASHSCOPE_CN_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

// Available Qwen TTS voices with their characteristics
export const QWEN_VOICES = [
  // English voices
  { id: "Cherry", name: "Cherry", gender: "Female", language: "en", description: "Warm and friendly" },
  { id: "Ethan", name: "Ethan", gender: "Male", language: "en", description: "Professional narrator" },
  { id: "Jennifer", name: "Jennifer", gender: "Female", language: "en", description: "Clear and articulate" },
  { id: "Ryan", name: "Ryan", gender: "Male", language: "en", description: "Confident and dynamic" },
  { id: "Jada", name: "Jada", gender: "Female", language: "en", description: "Expressive storyteller" },
  { id: "Dylan", name: "Dylan", gender: "Male", language: "en", description: "Casual and engaging" },
  { id: "Sunny", name: "Sunny", gender: "Female", language: "en", description: "Bright and cheerful" },
  { id: "Marcus", name: "Marcus", gender: "Male", language: "en", description: "Deep and authoritative" },
  { id: "Peter", name: "Peter", gender: "Male", language: "en", description: "Neutral and clear" },
  { id: "Kiki", name: "Kiki", gender: "Female", language: "en", description: "Young and vibrant" },
  { id: "Eric", name: "Eric", gender: "Male", language: "en", description: "Mature narrator" },
  
  // Spanish voices
  { id: "Katerina", name: "Katerina", gender: "Female", language: "es", description: "Spanish narrator" },
  { id: "Elias", name: "Elias", gender: "Male", language: "es", description: "Spanish narrator" },
  
  // German voices
  { id: "Rocky", name: "Rocky", gender: "Male", language: "de", description: "German narrator" },
  
  // French voices
  { id: "Nofish", name: "Nofish", gender: "Male", language: "fr", description: "French narrator" },
  
  // Italian voices
  { id: "Li", name: "Li", gender: "Female", language: "it", description: "Italian narrator" },
  
  // Portuguese voices
  { id: "Roy", name: "Roy", gender: "Male", language: "pt", description: "Portuguese narrator" },
];

// Language code mapping
const LANGUAGE_MAP: Record<string, string> = {
  "en": "English",
  "es": "Spanish", 
  "de": "German",
  "fr": "French",
  "it": "Italian",
  "pt": "Portuguese",
  "zh": "Chinese",
  "ja": "Japanese",
  "ko": "Korean",
  "ru": "Russian",
};

export interface QwenVoiceOption {
  id: string;
  name: string;
  languageCode: string;
  languageName: string;
  gender: string;
  description: string;
}

/**
 * Check if Qwen TTS is configured
 */
export function isQwenTTSConfigured(): boolean {
  return !!process.env.DASHSCOPE_API_KEY;
}

/**
 * Get the DashScope API URL based on region preference
 */
function getDashScopeUrl(): string {
  const region = process.env.DASHSCOPE_REGION || "intl";
  return region === "cn" ? DASHSCOPE_CN_URL : DASHSCOPE_INTL_URL;
}

/**
 * Get available Qwen TTS voices, optionally filtered by language
 */
export async function getQwenVoices(languageCode?: string): Promise<QwenVoiceOption[]> {
  const voices: QwenVoiceOption[] = QWEN_VOICES.map(voice => ({
    id: voice.id,
    name: voice.name,
    languageCode: voice.language,
    languageName: LANGUAGE_MAP[voice.language] || voice.language,
    gender: voice.gender,
    description: voice.description,
  }));
  
  if (languageCode) {
    const langPrefix = languageCode.split("-")[0].toLowerCase();
    return voices.filter(v => v.languageCode === langPrefix);
  }
  
  return voices;
}

/**
 * Split text into chunks that fit within Qwen TTS limits
 */
function splitTextIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHARS_PER_REQUEST) {
    return [text];
  }
  
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHARS_PER_REQUEST) {
      chunks.push(remaining.trim());
      break;
    }
    
    let splitPoint = MAX_CHARS_PER_REQUEST;
    
    // Try to split at paragraph break
    const paragraphBreak = remaining.lastIndexOf("\n\n", MAX_CHARS_PER_REQUEST);
    if (paragraphBreak > MAX_CHARS_PER_REQUEST * 0.5) {
      splitPoint = paragraphBreak + 2;
    } else {
      // Try to split at sentence end
      const sentenceEnd = Math.max(
        remaining.lastIndexOf(". ", MAX_CHARS_PER_REQUEST),
        remaining.lastIndexOf("! ", MAX_CHARS_PER_REQUEST),
        remaining.lastIndexOf("? ", MAX_CHARS_PER_REQUEST)
      );
      if (sentenceEnd > MAX_CHARS_PER_REQUEST * 0.5) {
        splitPoint = sentenceEnd + 2;
      } else {
        // Fall back to space
        const spaceIndex = remaining.lastIndexOf(" ", MAX_CHARS_PER_REQUEST);
        if (spaceIndex > MAX_CHARS_PER_REQUEST * 0.5) {
          splitPoint = spaceIndex + 1;
        }
      }
    }
    
    chunks.push(remaining.slice(0, splitPoint).trim());
    remaining = remaining.slice(splitPoint).trim();
  }
  
  return chunks;
}

/**
 * Synthesize text using Qwen 3 TTS API
 * Returns audio as a Buffer (WAV format, converted to MP3 for storage)
 */
async function synthesizeWithQwen(
  text: string,
  voiceId: string,
  languageType?: string
): Promise<Buffer> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY no está configurado");
  }
  
  const url = getDashScopeUrl();
  
  const requestBody = {
    model: "qwen3-tts-flash",
    input: {
      text: text,
      voice: voiceId,
    },
    parameters: {
      format: "mp3",
      sample_rate: 24000,
    },
  };
  
  console.log(`[Qwen TTS] Sending request to ${url} with voice ${voiceId}, text length: ${text.length}`);
  
  // Add timeout to prevent hanging requests (120 seconds for long text chunks)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "disable",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    if (fetchError.name === "AbortError") {
      throw new Error("Qwen TTS request timeout after 120 seconds");
    }
    throw fetchError;
  } finally {
    clearTimeout(timeoutId);
  }
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Qwen TTS] API error: ${response.status} - ${errorText}`);
    throw new Error(`Qwen TTS API error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json() as {
    output?: { 
      audio?: { url?: string } | string;
    };
    code?: string;
    message?: string;
  };
  
  if (result.code && result.code !== "SUCCESS") {
    throw new Error(`Qwen TTS error: ${result.code} - ${result.message}`);
  }
  
  // Handle both URL response and base64 response formats
  let audioBuffer: Buffer;
  
  if (result.output?.audio) {
    const audioData = result.output.audio;
    
    if (typeof audioData === "object" && audioData.url) {
      // Audio is returned as a URL - download it
      console.log(`[Qwen TTS] Downloading audio from URL...`);
      const audioResponse = await fetch(audioData.url);
      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio: ${audioResponse.status}`);
      }
      const arrayBuffer = await audioResponse.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else if (typeof audioData === "string") {
      // Audio is returned as base64
      audioBuffer = Buffer.from(audioData, "base64");
    } else {
      throw new Error("Unexpected audio format from Qwen TTS");
    }
  } else {
    throw new Error("No audio received from Qwen TTS");
  }
  
  console.log(`[Qwen TTS] Received audio: ${audioBuffer.length} bytes`);
  
  return audioBuffer;
}

/**
 * Concatenate multiple audio buffers using ffmpeg
 */
async function concatenateAudioChunks(chunks: Buffer[], outputPath: string): Promise<void> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execPromise = promisify(exec);
  
  const tempDir = path.join(os.tmpdir(), `qwen-tts-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  try {
    // Write each chunk to a temp file
    const chunkFiles: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = path.join(tempDir, `chunk_${i.toString().padStart(4, "0")}.mp3`);
      fs.writeFileSync(chunkPath, chunks[i]);
      chunkFiles.push(chunkPath);
    }
    
    // Create concat file list
    const listPath = path.join(tempDir, "concat_list.txt");
    const listContent = chunkFiles.map(f => `file '${f}'`).join("\n");
    fs.writeFileSync(listPath, listContent);
    
    // Concatenate with ffmpeg
    const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`;
    await execPromise(cmd, { timeout: 120000 });
    
    console.log(`[Qwen TTS] Concatenated ${chunks.length} chunks to ${outputPath}`);
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[Qwen TTS] Failed to cleanup temp dir: ${e}`);
    }
  }
}

/**
 * Sanitize filename for safe storage
 */
function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
}

/**
 * Synthesize a full chapter using Qwen TTS
 * Handles chunking for long texts and applies ACX mastering
 */
export async function synthesizeChapterWithQwen(
  chapterId: number,
  projectId: number,
  text: string,
  voiceId: string,
  speechRate: string = "medium",
  chapterTitle: string = "",
  chapterIndex: number = 1,
  totalChapters: number = 1
): Promise<void> {
  // Preprocess text for TTS
  const processedText = preprocessTextForTTS(text);
  console.log(`[Qwen TTS] Processing chapter ${chapterId}: ${text.length} -> ${processedText.length} chars`);
  
  // Create synthesis job record
  const job = await storage.createSynthesisJob({
    chapterId,
    projectId,
    pollyTaskId: null,
    s3OutputUri: null,
    localAudioPath: null,
    finalAudioUrl: null,
    status: "pending",
    errorMessage: null,
    retryCount: 0,
    startedAt: new Date(),
    completedAt: null,
  });
  
  try {
    await storage.updateSynthesisJob(job.id, { status: "synthesizing" });
    
    // Split text into manageable chunks
    const chunks = splitTextIntoChunks(processedText);
    console.log(`[Qwen TTS] Split into ${chunks.length} chunks`);
    
    // Synthesize each chunk
    const audioChunks: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[Qwen TTS] Synthesizing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
      
      // Retry logic
      let retries = 3;
      let chunkAudio: Buffer | null = null;
      
      while (retries > 0 && !chunkAudio) {
        try {
          chunkAudio = await synthesizeWithQwen(chunks[i], voiceId);
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          console.warn(`[Qwen TTS] Chunk ${i + 1} failed, retrying... (${retries} left)`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      
      if (chunkAudio) {
        audioChunks.push(chunkAudio);
      }
      
      // Add delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
      }
    }
    
    // Create output directory
    const masteringDir = path.join(os.tmpdir(), "audiobook-mastered");
    if (!fs.existsSync(masteringDir)) {
      fs.mkdirSync(masteringDir, { recursive: true });
    }
    
    const baseFilename = chapterTitle ? sanitizeFilename(chapterTitle) : `chapter_${chapterId}`;
    const uniqueSuffix = `${chapterId}_${Date.now()}`;
    const rawAudioPath = path.join(masteringDir, `raw_qwen_${uniqueSuffix}.mp3`);
    const masteredPath = path.join(masteringDir, `${baseFilename}_${uniqueSuffix}.mp3`);
    
    // Concatenate chunks if multiple
    if (audioChunks.length === 1) {
      fs.writeFileSync(rawAudioPath, audioChunks[0]);
    } else {
      await concatenateAudioChunks(audioChunks, rawAudioPath);
    }
    
    console.log(`[Qwen TTS] Raw audio saved: ${rawAudioPath}`);
    
    // Update status to mastering
    await storage.updateSynthesisJob(job.id, { status: "mastering" });
    
    // Apply ACX-compliant mastering
    const masteringOptions: MasteringOptions = {
      targetLoudness: -20,
      targetPeak: -3,
      targetLRA: 11,
      silenceStart: 1000,
      silenceEnd: 3000,
      sampleRate: 44100,
      bitrate: "192k",
    };
    
    // Get project metadata for ID3 tags
    const project = await storage.getAudiobookProject(projectId);
    const metadata: ID3Metadata = {
      title: chapterTitle || `Chapter ${chapterId}`,
      album: project?.title ?? undefined,
      albumArtist: project?.albumArtist ?? undefined,
      year: project?.albumYear ?? undefined,
      genre: project?.albumGenre || "Audiobook",
      track: `${chapterIndex}/${totalChapters}`,
      coverImageBase64: project?.coverImageUrl ?? undefined,
    };
    
    console.log(`[Qwen TTS] Starting mastering for chapter ${chapterId}`);
    
    // Create file:// URL for local mastering
    const rawAudioUrl = `file://${rawAudioPath}`;
    const masteringResult = await masterAudioFromUrl(rawAudioUrl, masteredPath, masteringOptions, metadata);
    
    if (!masteringResult.success) {
      console.error(`[Qwen TTS] Mastering failed:`, masteringResult.error);
      // Use raw audio as fallback
      fs.copyFileSync(rawAudioPath, masteredPath);
    }
    
    // Upload to S3
    const { uploadToS3 } = await import("./polly-synthesizer");
    const s3Key = `audiobooks/mastered/project_${projectId}/${baseFilename}.mp3`;
    const s3Uri = await uploadToS3(masteredPath, s3Key);
    
    // Get download URL
    const { getAudioDownloadUrl } = await import("./polly-synthesizer");
    const finalUrl = await getAudioDownloadUrl(s3Uri);
    
    // Update job status
    await storage.updateSynthesisJob(job.id, {
      status: "mastered",
      s3OutputUri: s3Uri,
      finalAudioUrl: finalUrl,
      completedAt: new Date(),
    });
    
    // Update mastered chapters count
    await storage.updateMasteredChaptersCount(projectId);
    
    console.log(`[Qwen TTS] Chapter ${chapterId} completed: ${finalUrl.substring(0, 80)}...`);
    
    // Cleanup temp files
    try {
      if (fs.existsSync(rawAudioPath)) fs.unlinkSync(rawAudioPath);
      if (fs.existsSync(masteredPath)) fs.unlinkSync(masteredPath);
    } catch (e) {
      console.warn(`[Qwen TTS] Cleanup warning:`, e);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Qwen TTS] Chapter ${chapterId} failed:`, errorMessage);
    
    await storage.updateSynthesisJob(job.id, {
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    });
    
    throw error;
  }
}

/**
 * Process all chapters in a project using Qwen TTS with parallel processing
 */
export async function processProjectWithQwen(
  projectId: number,
  voiceId: string,
  speechRate: string = "medium",
  onProgress?: (completed: number, total: number, chapterTitle: string) => void
): Promise<{ succeeded: number; failed: number }> {
  const chapters = await storage.getChaptersByProject(projectId);
  
  if (chapters.length === 0) {
    throw new Error("No hay capítulos para procesar");
  }
  
  // Sort by sequence number
  chapters.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  
  // Process chapters in batches
  for (let i = 0; i < chapters.length; i += PARALLEL_CHAPTER_LIMIT) {
    const batch = chapters.slice(i, i + PARALLEL_CHAPTER_LIMIT);
    
    const batchPromises = batch.map(async (chapter, batchIndex) => {
      const globalIndex = i + batchIndex;
      
      try {
        await synthesizeChapterWithQwen(
          chapter.id,
          projectId,
          chapter.contentText,
          voiceId,
          speechRate,
          chapter.title,
          globalIndex + 1,
          chapters.length
        );
        
        succeeded++;
        completed++;
        onProgress?.(completed, chapters.length, chapter.title);
        
      } catch (error) {
        failed++;
        completed++;
        console.error(`[Qwen TTS] Chapter "${chapter.title}" failed:`, error);
        onProgress?.(completed, chapters.length, chapter.title);
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  return { succeeded, failed };
}

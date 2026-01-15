/**
 * Google Cloud Text-to-Speech Synthesizer for AudiobookForge
 * Uses Neural2 voices for high-quality Spanish audiobook narration
 */

import { TextToSpeechClient, protos } from "@google-cloud/text-to-speech";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { storage } from "../storage";
import { preprocessTextForTTS, wrapInSSMLForGoogle } from "./text-preprocessor";
import { masterAudioFromUrl, type MasteringOptions, type ID3Metadata } from "./audio-mastering";

// Google TTS has a 5000 byte limit per request for standard synthesis
const MAX_BYTES_PER_REQUEST = 4500;

// Concurrency settings (same as Polly for consistency)
const PARALLEL_CHAPTER_LIMIT = 3;
const MAX_CONCURRENCY = 4;

export interface GoogleVoiceOption {
  id: string;
  name: string;
  languageCode: string;
  languageName: string;
  gender: string;
  voiceType: string; // Neural2, WaveNet, Standard, etc.
}

let ttsClient: TextToSpeechClient | null = null;

/**
 * Initialize Google Cloud TTS client
 * Uses GOOGLE_TTS_CREDENTIALS environment variable (JSON string)
 */
function getGoogleTTSClient(): TextToSpeechClient {
  if (!ttsClient) {
    const credentials = process.env.GOOGLE_TTS_CREDENTIALS;
    
    if (credentials) {
      try {
        const parsedCredentials = JSON.parse(credentials);
        ttsClient = new TextToSpeechClient({
          credentials: parsedCredentials,
        });
      } catch (e) {
        console.error("[Google TTS] Error parsing credentials JSON:", e);
        throw new Error("Invalid GOOGLE_TTS_CREDENTIALS format");
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      ttsClient = new TextToSpeechClient();
    } else {
      throw new Error("Google Cloud TTS credentials not configured. Set GOOGLE_TTS_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS");
    }
  }
  return ttsClient;
}

/**
 * Check if Google Cloud TTS is configured and available
 */
export function isGoogleTTSConfigured(): boolean {
  return !!(process.env.GOOGLE_TTS_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

/**
 * Get available Google Cloud TTS voices, optionally filtered by language
 * Focuses on Neural2 and WaveNet voices for high quality
 */
export async function getGoogleVoices(languageCode?: string): Promise<GoogleVoiceOption[]> {
  const client = getGoogleTTSClient();
  
  const [response] = await client.listVoices({
    languageCode: languageCode,
  });
  
  const voiceOptions: GoogleVoiceOption[] = [];
  
  for (const voice of response.voices || []) {
    // Only include Neural2, WaveNet, and Journey voices (skip Standard for quality)
    const name = voice.name || "";
    if (!name.includes("Neural2") && !name.includes("Wavenet") && !name.includes("Journey")) {
      continue;
    }
    
    // Determine voice type from name
    let voiceType = "Standard";
    if (name.includes("Neural2")) voiceType = "Neural2";
    else if (name.includes("Journey")) voiceType = "Journey";
    else if (name.includes("Wavenet")) voiceType = "WaveNet";
    
    // Map gender (ssmlGender is an enum: SSML_VOICE_GENDER_UNSPECIFIED=0, MALE=1, FEMALE=2, NEUTRAL=3)
    const genderValue = typeof voice.ssmlGender === 'number' ? voice.ssmlGender : 0;
    const genderMap: Record<number, string> = {
      0: "Unknown",
      1: "Male",
      2: "Female",
      3: "Neutral",
    };
    const gender = genderMap[genderValue] || "Unknown";
    
    // Get primary language code
    const langCode = voice.languageCodes?.[0] || "";
    
    // Map language code to readable name
    const langNameMap: Record<string, string> = {
      "es-ES": "Español (España)",
      "es-US": "Español (Estados Unidos)",
      "es-MX": "Español (México)", 
      "en-US": "English (US)",
      "en-GB": "English (UK)",
      "de-DE": "Deutsch",
      "fr-FR": "Français",
      "it-IT": "Italiano",
      "pt-BR": "Português (Brasil)",
      "pt-PT": "Português (Portugal)",
      "ca-ES": "Català",
    };
    
    voiceOptions.push({
      id: name,
      name: name,
      languageCode: langCode,
      languageName: langNameMap[langCode] || langCode,
      gender,
      voiceType,
    });
  }
  
  // Sort by language, then by voice type (Neural2 first), then by name
  voiceOptions.sort((a, b) => {
    if (a.languageCode !== b.languageCode) return a.languageCode.localeCompare(b.languageCode);
    if (a.voiceType !== b.voiceType) {
      const order = ["Neural2", "Journey", "WaveNet"];
      return order.indexOf(a.voiceType) - order.indexOf(b.voiceType);
    }
    return a.name.localeCompare(b.name);
  });
  
  return voiceOptions;
}

/**
 * Synthesize text to audio using Google Cloud TTS
 * Returns the audio content as a Buffer
 */
async function synthesizeText(
  text: string,
  voiceId: string,
  languageCode: string,
  speakingRate: number = 1.0,
  pitch: number = 0.0,
  useSSML: boolean = true
): Promise<Buffer> {
  const client = getGoogleTTSClient();
  
  const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
    input: useSSML ? { ssml: text } : { text: text },
    voice: {
      languageCode: languageCode,
      name: voiceId,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: speakingRate,
      pitch: pitch,
      sampleRateHertz: 24000,
    },
  };
  
  const [response] = await client.synthesizeSpeech(request);
  
  if (!response.audioContent) {
    throw new Error("No audio content received from Google TTS");
  }
  
  return Buffer.from(response.audioContent as Uint8Array);
}

/**
 * Split text into chunks that fit within Google TTS byte limits
 */
function splitTextIntoChunks(text: string): string[] {
  const encoder = new TextEncoder();
  
  if (encoder.encode(text).length <= MAX_BYTES_PER_REQUEST) {
    return [text];
  }
  
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (encoder.encode(remaining).length <= MAX_BYTES_PER_REQUEST) {
      chunks.push(remaining.trim());
      break;
    }
    
    // Find a good split point within byte limit
    let splitPoint = Math.floor(MAX_BYTES_PER_REQUEST * 0.8); // Start conservatively
    
    // Adjust to find actual character position
    while (splitPoint > 0 && encoder.encode(remaining.slice(0, splitPoint)).length > MAX_BYTES_PER_REQUEST) {
      splitPoint -= 100;
    }
    
    // Try to split at paragraph break
    const paragraphBreak = remaining.lastIndexOf("\n\n", splitPoint);
    if (paragraphBreak > splitPoint * 0.5) {
      splitPoint = paragraphBreak + 2;
    } else {
      // Try to split at sentence end
      const sentenceEnd = Math.max(
        remaining.lastIndexOf(". ", splitPoint),
        remaining.lastIndexOf("! ", splitPoint),
        remaining.lastIndexOf("? ", splitPoint)
      );
      if (sentenceEnd > splitPoint * 0.5) {
        splitPoint = sentenceEnd + 2;
      } else {
        // Fall back to space
        const spaceIndex = remaining.lastIndexOf(" ", splitPoint);
        if (spaceIndex > splitPoint * 0.5) {
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
 * Convert speech rate string to Google TTS speaking rate (0.25 to 4.0)
 * Default is 1.0, our optimal 75% maps to 0.75
 */
function parseSpeakingRate(rate: string): number {
  // Handle percentage format like "75%"
  if (rate.endsWith("%")) {
    const percent = parseInt(rate.replace("%", ""), 10);
    return percent / 100;
  }
  
  // Handle named rates
  const rateMap: Record<string, number> = {
    "x-slow": 0.5,
    "slow": 0.75,
    "medium": 1.0,
    "fast": 1.25,
    "x-fast": 1.5,
  };
  
  return rateMap[rate] || 1.0;
}

/**
 * Synthesize a complete chapter using Google Cloud TTS
 * Handles text preprocessing, chunking, synthesis, and mastering
 */
export async function synthesizeChapterWithGoogle(
  chapterId: number,
  projectId: number,
  text: string,
  voiceId: string,
  languageCode: string,
  speechRate: string = "75%",
  chapterTitle: string = "",
  chapterIndex: number = 1,
  totalChapters: number = 1,
  preGeneratedSsml?: string | null
): Promise<void> {
  let ssmlText: string;
  
  if (preGeneratedSsml) {
    // Use pre-generated SSML from EPUB3 with phoneme annotations
    console.log(`[Google TTS] Using pre-generated SSML from EPUB for chapter ${chapterId}`);
    
    // Escape any unescaped characters for SSML
    const escapedSsml = preGeneratedSsml
      .replace(/&(?!(amp;|lt;|gt;|apos;|quot;|#\d+;|#x[0-9a-fA-F]+;))/g, '&amp;')
      .replace(/<(?!\/?(phoneme|break|prosody|emphasis|say-as|sub|p|s)[>\s])/g, '&lt;');
    
    // Normalize speech rate for Google TTS
    // Handle percentage format like "75%" or named rates like "medium"
    let rateValue: string;
    if (speechRate.endsWith('%')) {
      rateValue = speechRate;
    } else {
      // Convert named rates to percentage values
      const namedRates: Record<string, string> = {
        "x-slow": "50%",
        "slow": "75%",
        "medium": "100%",
        "fast": "125%",
        "x-fast": "150%",
      };
      rateValue = namedRates[speechRate] || "100%";
    }
    
    // Wrap in speak tags with speech rate
    ssmlText = `<speak><prosody rate="${rateValue}">${escapedSsml}</prosody></speak>`;
    
    console.log(`[Google TTS] Pre-generated SSML length: ${ssmlText.length} chars`);
  } else {
    // Preprocess text for TTS quality
    let processedText = preprocessTextForTTS(text);
    
    // Wrap in SSML for Google
    ssmlText = wrapInSSMLForGoogle(processedText, speechRate);
    
    console.log(`[Google TTS] Processing chapter ${chapterId}: ${text.length} -> ${processedText.length} chars, rate: ${speechRate}`);
  }
  
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
  
  const speakingRate = parseSpeakingRate(speechRate);
  
  try {
    await storage.updateSynthesisJob(job.id, { status: "synthesizing" });
    
    // Split text into chunks if needed
    const chunks = splitTextIntoChunks(ssmlText);
    console.log(`[Google TTS] Chapter ${chapterId} split into ${chunks.length} chunks`);
    
    // Synthesize each chunk
    const audioBuffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[Google TTS] Synthesizing chunk ${i + 1}/${chunks.length} for chapter ${chapterId}`);
      const audioBuffer = await synthesizeText(
        chunks[i],
        voiceId,
        languageCode,
        speakingRate,
        0.0, // pitch
        true // useSSML
      );
      audioBuffers.push(audioBuffer);
    }
    
    // Concatenate audio buffers
    const combinedAudio = Buffer.concat(audioBuffers);
    
    // Save to temporary file
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `google_tts_${chapterId}_${Date.now()}.mp3`);
    fs.writeFileSync(tempFilePath, combinedAudio);
    
    console.log(`[Google TTS] Raw audio saved to ${tempFilePath} (${combinedAudio.length} bytes)`);
    
    await storage.updateSynthesisJob(job.id, {
      status: "mastering",
      localAudioPath: tempFilePath,
    });
    
    // Get project info for metadata
    const project = await storage.getAudiobookProject(projectId);
    const chapters = await storage.getChaptersByProject(projectId);
    const chapter = chapters.find(ch => ch.id === chapterId);
    
    // Prepare output path with unique suffix to avoid conflicts in multi-worker production
    const outputDir = path.join(process.cwd(), "uploads", "audiobooks", `project_${projectId}`);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const uniqueSuffix = `${job.id}_${Date.now()}`;
    const masteredPath = path.join(outputDir, `chapter_${chapterIndex}_mastered_${uniqueSuffix}.mp3`);
    
    // Prepare ID3 metadata
    const id3Metadata: ID3Metadata = {
      title: chapterTitle || chapter?.title || `Capítulo ${chapterIndex}`,
      artist: project?.author || "Autor",
      album: project?.title || "Audiolibro",
      track: `${chapterIndex}/${totalChapters}`,
      genre: "Audiobook",
      year: String(new Date().getFullYear()),
    };
    
    // Get cover art if available
    if (project?.coverImageUrl) {
      const coverPath = path.join(process.cwd(), "uploads", project.coverImageUrl);
      if (fs.existsSync(coverPath)) {
        id3Metadata.coverImagePath = coverPath;
      }
    }
    
    // Master the audio with ACX compliance
    const masteringOptions: MasteringOptions = {
      targetLoudness: -19,
      targetPeak: -3,
      deEsser: true,
      deEsserAmount: -4,
    };
    
    const masteringResult = await masterAudioFromUrl(
      tempFilePath,
      masteredPath,
      masteringOptions,
      id3Metadata
    );
    
    console.log(`[Google TTS] Chapter ${chapterId} mastered: ${masteringResult.outputPath}`);
    
    // Update job with final result
    await storage.updateSynthesisJob(job.id, {
      status: "mastered",
      localAudioPath: masteringResult.outputPath,
      finalAudioUrl: masteringResult.outputPath,
      completedAt: new Date(),
    });
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (e) {
      console.warn(`[Google TTS] Could not delete temp file: ${tempFilePath}`);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Google TTS] Error synthesizing chapter ${chapterId}:`, errorMessage);
    
    await storage.updateSynthesisJob(job.id, {
      status: "failed",
      errorMessage,
    });
    
    throw error;
  }
}

/**
 * Process items in parallel (same implementation as Polly synthesizer)
 */
async function processInParallel<T, R>(
  items: T[],
  processor: (item: T, globalIndex: number) => Promise<R>,
  concurrency: number,
  onItemStart?: (item: T, globalIndex: number) => void,
  onItemComplete?: (item: T, globalIndex: number, result: R | Error, succeeded: boolean) => void | Promise<void>
): Promise<{ results: (R | Error)[]; succeeded: number; failed: number }> {
  const results: (R | Error)[] = new Array(items.length);
  let succeeded = 0;
  let failed = 0;
  
  for (let batchStart = 0; batchStart < items.length; batchStart += concurrency) {
    const batchEnd = Math.min(batchStart + concurrency, items.length);
    const batchNum = Math.floor(batchStart / concurrency) + 1;
    const totalBatches = Math.ceil(items.length / concurrency);
    
    console.log(`[Google TTS Parallel] Starting batch ${batchNum}/${totalBatches}: items ${batchStart + 1}-${batchEnd}`);
    
    const batchPromises: Promise<void>[] = [];
    
    for (let i = 0; i < batchEnd - batchStart; i++) {
      const globalIndex = batchStart + i;
      const item = items[globalIndex];
      
      batchPromises.push((async () => {
        try {
          onItemStart?.(item, globalIndex);
        } catch (startErr) {
          console.error(`[Google TTS Parallel] onItemStart error:`, startErr);
        }
        
        let processingResult: R | undefined;
        let processingError: Error | undefined;
        
        try {
          processingResult = await processor(item, globalIndex);
          results[globalIndex] = processingResult;
          succeeded++;
        } catch (error) {
          processingError = error instanceof Error ? error : new Error(String(error));
          results[globalIndex] = processingError;
          failed++;
        }
        
        try {
          if (processingError) {
            await onItemComplete?.(item, globalIndex, processingError, false);
          } else if (processingResult !== undefined) {
            await onItemComplete?.(item, globalIndex, processingResult, true);
          }
        } catch (completeErr) {
          console.error(`[Google TTS Parallel] onItemComplete error:`, completeErr);
        }
      })());
    }
    
    await Promise.allSettled(batchPromises);
    console.log(`[Google TTS Parallel] Batch ${batchNum}/${totalBatches} complete. ${succeeded} succeeded, ${failed} failed`);
  }
  
  return { results, succeeded, failed };
}

/**
 * Synthesize an entire project using Google Cloud TTS
 */
export async function synthesizeProjectWithGoogle(
  projectId: number,
  onProgress?: (completed: number, total: number, currentChapter: string) => void,
  concurrency: number = PARALLEL_CHAPTER_LIMIT
): Promise<void> {
  const project = await storage.getAudiobookProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  
  const chapters = await storage.getChaptersByProject(projectId);
  if (chapters.length === 0) {
    throw new Error(`Project ${projectId} has no chapters`);
  }
  
  // Update project status
  await storage.updateAudiobookProject(projectId, { status: "synthesizing" });
  
  // Filter chapters that need processing
  let alreadyMastered = 0;
  const chaptersToProcess: typeof chapters = [];
  
  for (const chapter of chapters) {
    const latestJob = await storage.getLatestJobByChapter(chapter.id);
    if (latestJob?.status === "mastered") {
      alreadyMastered++;
      console.log(`[Google TTS] Skipping chapter "${chapter.title}" - already mastered`);
    } else {
      chaptersToProcess.push(chapter);
    }
  }
  
  const effectiveConcurrency = Math.min(concurrency, MAX_CONCURRENCY, chaptersToProcess.length);
  console.log(`[Google TTS] Project ${projectId}: ${alreadyMastered} mastered, ${chaptersToProcess.length} to process`);
  console.log(`[Google TTS] Using PARALLEL processing with ${effectiveConcurrency} concurrent chapters`);
  
  const speechRate = project.speechRate || "75%";
  
  // Extract language code from voice ID (e.g., "es-ES-Neural2-A" -> "es-ES")
  const languageCode = project.voiceId.split("-").slice(0, 2).join("-");
  
  // Create chapter index map
  const chapterIndices = new Map<number, number>();
  chapters.forEach((ch, index) => {
    chapterIndices.set(ch.id, index + 1);
  });
  
  const progress = { completed: alreadyMastered, inProgress: new Set<string>() };
  const failedChapters: string[] = [];
  
  // Process chapters in parallel
  const results = await processInParallel(
    chaptersToProcess,
    async (chapter, index) => {
      await storage.deleteOldJobsByChapter(chapter.id);
      
      await synthesizeChapterWithGoogle(
        chapter.id,
        projectId,
        chapter.contentText,
        project.voiceId,
        languageCode,
        speechRate,
        chapter.title,
        chapterIndices.get(chapter.id) || 1,
        chapters.length,
        chapter.contentSsml
      );
    },
    effectiveConcurrency,
    (chapter, index) => {
      progress.inProgress.add(chapter.title);
      console.log(`[Google TTS] Starting chapter: ${chapter.title}`);
    },
    async (chapter, index, result, succeeded) => {
      progress.inProgress.delete(chapter.title);
      
      if (succeeded) {
        progress.completed++;
        console.log(`[Google TTS] Completed chapter: ${chapter.title} (${progress.completed}/${chapters.length})`);
      } else {
        failedChapters.push(chapter.title);
        console.error(`[Google TTS] Failed chapter: ${chapter.title}`);
      }
      
      onProgress?.(progress.completed, chapters.length, chapter.title);
    }
  );
  
  // Update project status
  if (failedChapters.length === 0) {
    await storage.updateAudiobookProject(projectId, { status: "completed" });
    onProgress?.(chapters.length, chapters.length, "Completado");
  } else if (failedChapters.length === chaptersToProcess.length) {
    await storage.updateAudiobookProject(projectId, { status: "failed" });
    throw new Error(`All chapters failed: ${failedChapters.join(", ")}`);
  } else {
    // Partial success - keep as completed but log warning
    await storage.updateAudiobookProject(projectId, { status: "completed" });
    console.warn(`[Google TTS] Project completed with ${failedChapters.length} failed chapters`);
    onProgress?.(chapters.length, chapters.length, `Completado con ${failedChapters.length} errores`);
  }
}

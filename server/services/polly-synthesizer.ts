/**
 * Amazon Polly Synthesizer for AudiobookForge
 * Uses StartSpeechSynthesisTask for async processing of long texts
 */

import {
  PollyClient,
  StartSpeechSynthesisTaskCommand,
  GetSpeechSynthesisTaskCommand,
  DescribeVoicesCommand,
  Engine,
  OutputFormat,
  TextType,
  TaskStatus,
  LanguageCode,
  VoiceId,
  type Voice,
  type SynthesisTask,
} from "@aws-sdk/client-polly";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { storage } from "../storage";
import { preprocessTextForTTS, wrapInSSML } from "./text-preprocessor";
import { masterAudioFromUrl, type MasteringOptions, type ID3Metadata } from "./audio-mastering";

// Polly text limit per request (for neural voices, actual limit is 3000 chars)
const MAX_CHARS_PER_REQUEST = 2800;

export interface SynthesisResult {
  taskId: string;
  s3Uri: string;
  status: TaskStatus | string;
}

export interface VoiceOption {
  id: string;
  name: string;
  languageCode: string;
  languageName: string;
  gender: string;
  engine: Engine | string;
}

let pollyClient: PollyClient | null = null;
let s3Client: S3Client | null = null;

/**
 * Initialize AWS clients
 */
function getPollyClient(): PollyClient {
  if (!pollyClient) {
    const region = process.env.AWS_REGION || "us-east-1";
    pollyClient = new PollyClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return pollyClient;
}

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.AWS_REGION || "us-east-1";
    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return s3Client;
}

/**
 * Get available Polly voices for a language
 * Returns one entry per voice/engine combination
 */
export async function getAvailableVoices(languageCode?: LanguageCode): Promise<VoiceOption[]> {
  const client = getPollyClient();
  
  const command = new DescribeVoicesCommand({
    LanguageCode: languageCode,
    IncludeAdditionalLanguageCodes: true,
  });
  
  const response = await client.send(command);
  
  const voiceOptions: VoiceOption[] = [];
  
  for (const voice of response.Voices || []) {
    const engines = voice.SupportedEngines || ["standard"];
    for (const engine of engines) {
      voiceOptions.push({
        id: voice.Id || "",
        name: voice.Name || "",
        languageCode: voice.LanguageCode || "",
        languageName: voice.LanguageName || "",
        gender: voice.Gender || "",
        engine: engine,
      });
    }
  }
  
  return voiceOptions;
}

/**
 * Split text into chunks that fit within Polly's limits
 * Try to split at paragraph or sentence boundaries
 */
export function splitTextIntoChunks(text: string): string[] {
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
    
    // Find a good split point
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
 * Start async speech synthesis task for a chapter
 */
export async function startSynthesisTask(
  text: string,
  voiceId: VoiceId,
  engine: Engine = Engine.NEURAL,
  outputFormat: OutputFormat = OutputFormat.MP3,
  useSSML: boolean = false
): Promise<SynthesisResult> {
  const client = getPollyClient();
  const bucket = process.env.S3_BUCKET_NAME;
  
  if (!bucket) {
    throw new Error("S3_BUCKET_NAME no está configurado");
  }
  
  const command = new StartSpeechSynthesisTaskCommand({
    OutputFormat: outputFormat,
    OutputS3BucketName: bucket,
    OutputS3KeyPrefix: "audiobooks/",
    Text: text,
    TextType: useSSML ? TextType.SSML : TextType.TEXT,
    VoiceId: voiceId,
    Engine: engine,
    SampleRate: engine === Engine.STANDARD ? "22050" : "24000",
  });
  
  const result = await client.send(command);
  
  if (!result.SynthesisTask?.TaskId) {
    throw new Error("No se recibió TaskId de Polly");
  }
  
  return {
    taskId: result.SynthesisTask.TaskId,
    s3Uri: result.SynthesisTask.OutputUri || "",
    status: result.SynthesisTask.TaskStatus || "inProgress",
  };
}

/**
 * Check status of a synthesis task
 */
export async function getSynthesisTaskStatus(taskId: string): Promise<SynthesisTask> {
  const client = getPollyClient();
  
  const command = new GetSpeechSynthesisTaskCommand({
    TaskId: taskId,
  });
  
  const response = await client.send(command);
  
  if (!response.SynthesisTask) {
    throw new Error(`Task ${taskId} not found`);
  }
  
  return response.SynthesisTask;
}

/**
 * Wait for synthesis task to complete
 */
export async function waitForTaskCompletion(
  taskId: string,
  maxWaitMs: number = 300000, // 5 minutes default
  pollIntervalMs: number = 5000
): Promise<SynthesisTask> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const task = await getSynthesisTaskStatus(taskId);
    
    if (task.TaskStatus === TaskStatus.COMPLETED) {
      return task;
    }
    
    if (task.TaskStatus === TaskStatus.FAILED) {
      throw new Error(`Synthesis failed: ${task.TaskStatusReason || "Unknown error"}`);
    }
    
    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error("Synthesis timeout exceeded");
}

/**
 * Get a presigned URL to download the audio from S3
 * Supports both s3://bucket/key and https://s3.region.amazonaws.com/bucket/key formats
 */
export async function getAudioDownloadUrl(s3Uri: string, expiresIn: number = 3600): Promise<string> {
  const client = getS3Client();
  
  let bucket: string;
  let key: string;
  
  // Try S3 URI format: s3://bucket/key
  const s3Match = s3Uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (s3Match) {
    [, bucket, key] = s3Match;
  } else {
    // Try HTTPS format: https://s3.region.amazonaws.com/bucket/key
    const httpsMatch = s3Uri.match(/^https:\/\/s3\.[^/]+\.amazonaws\.com\/([^/]+)\/(.+)$/);
    if (httpsMatch) {
      [, bucket, key] = httpsMatch;
    } else {
      // Try alternative HTTPS format: https://bucket.s3.region.amazonaws.com/key
      const altHttpsMatch = s3Uri.match(/^https:\/\/([^.]+)\.s3\.[^/]+\.amazonaws\.com\/(.+)$/);
      if (altHttpsMatch) {
        [, bucket, key] = altHttpsMatch;
      } else {
        throw new Error(`Invalid S3 URI format: ${s3Uri}`);
      }
    }
  }
  
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Sanitize a chapter title for use as filename
 */
function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "_") // Spaces to underscores
    .replace(/_+/g, "_") // Multiple underscores to single
    .replace(/^_|_$/g, "") // Trim underscores
    .slice(0, 50); // Limit length
}

/**
 * Upload a local file to S3 and return the S3 URI
 */
export async function uploadToS3(localPath: string, s3Key: string): Promise<string> {
  const client = getS3Client();
  const bucket = process.env.S3_BUCKET_NAME;
  
  if (!bucket) {
    throw new Error("S3_BUCKET_NAME no está configurado");
  }
  
  const fileBuffer = fs.readFileSync(localPath);
  
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: "audio/mpeg",
  });
  
  await client.send(command);
  
  return `s3://${bucket}/${s3Key}`;
}

/**
 * Synthesize a full chapter (handles chunking for long texts)
 */
export async function synthesizeChapter(
  chapterId: number,
  projectId: number,
  text: string,
  voiceId: string,
  engine: string = "neural",
  speechRate: string = "medium",
  chapterTitle: string = "",
  chapterIndex: number = 1,
  totalChapters: number = 1
): Promise<void> {
  // Preprocess text for better TTS quality
  let processedText = preprocessTextForTTS(text);
  
  // Check text length and truncate if needed (Polly's hard limit is 100k chars for StartSpeechSynthesisTask)
  const maxLength = 90000; // Leave room for SSML tags
  if (processedText.length > maxLength) {
    processedText = processedText.slice(0, maxLength);
  }
  
  // Wrap in SSML with speech rate control
  const ssmlText = wrapInSSML(processedText, speechRate);
  
  console.log(`[Polly] Preprocessed text for chapter ${chapterId}: ${text.length} -> ${processedText.length} chars, rate: ${speechRate}`);
  
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
    // Start the synthesis task
    await storage.updateSynthesisJob(job.id, { status: "synthesizing" });
    
    // Map engine string to Polly Engine enum
    let pollyEngine: Engine;
    switch (engine) {
      case "neural":
        pollyEngine = Engine.NEURAL;
        break;
      case "long-form":
        pollyEngine = Engine.LONG_FORM;
        break;
      case "generative":
        pollyEngine = Engine.GENERATIVE;
        break;
      default:
        pollyEngine = Engine.STANDARD;
    }
    const result = await startSynthesisTask(ssmlText, voiceId as VoiceId, pollyEngine, OutputFormat.MP3, true);
    
    await storage.updateSynthesisJob(job.id, {
      pollyTaskId: result.taskId,
      s3OutputUri: result.s3Uri,
      status: "synthesizing",
    });
    
    console.log(`[Polly] Started synthesis task ${result.taskId} for chapter ${chapterId}`);
    
    // Wait for completion (async polling)
    const completedTask = await waitForTaskCompletion(result.taskId);
    
    // Get the download URL for the raw Polly audio
    const rawAudioUrl = completedTask.OutputUri 
      ? await getAudioDownloadUrl(completedTask.OutputUri)
      : null;
    
    if (!rawAudioUrl) {
      throw new Error("No audio URL received from Polly");
    }
    
    await storage.updateSynthesisJob(job.id, {
      status: "mastering",
      s3OutputUri: completedTask.OutputUri || null,
    });
    
    console.log(`[Polly] Synthesis complete for chapter ${chapterId}, starting mastering...`);
    
    // Apply ACX-compliant mastering (2-pass loudnorm + room tone)
    const masteringDir = path.join(os.tmpdir(), "audiobook-mastered");
    if (!fs.existsSync(masteringDir)) {
      fs.mkdirSync(masteringDir, { recursive: true });
    }
    
    // Use chapter title for filename, with fallback to chapter ID
    const safeFilename = chapterTitle ? sanitizeFilename(chapterTitle) : `chapter_${chapterId}`;
    const masteredPath = path.join(masteringDir, `${safeFilename}.mp3`);
    
    const masteringOptions: MasteringOptions = {
      targetLoudness: -20,    // ACX target: -20 LUFS
      targetPeak: -3,          // ACX max peak: -3 dB
      targetLRA: 11,           // Loudness range
      silenceStart: 1000,      // 1s room tone at start
      silenceEnd: 3000,        // 3s room tone at end
      sampleRate: 44100,       // 44.1 kHz for ACX
      bitrate: "192k",         // 192 kbps CBR for ACX
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
    
    const masteringResult = await masterAudioFromUrl(rawAudioUrl, masteredPath, masteringOptions, metadata);
    
    if (!masteringResult.success) {
      console.error(`[Mastering] Failed for chapter ${chapterId}:`, masteringResult.error);
      console.log(`[Mastering] Using raw Polly audio as fallback for chapter ${chapterId}`);
      
      // Upload raw audio to S3 mastered folder as fallback
      const s3Key = `audiobooks/mastered/project_${projectId}/${safeFilename}.mp3`;
      try {
        // Download raw audio and upload to mastered location
        const tempRawPath = path.join(masteringDir, `raw_${safeFilename}.mp3`);
        const https = await import('https');
        const file = fs.createWriteStream(tempRawPath);
        
        await new Promise<void>((resolve, reject) => {
          https.get(rawAudioUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }).on('error', reject);
        });
        
        const rawS3Uri = await uploadToS3(tempRawPath, s3Key);
        const rawDownloadUrl = await getAudioDownloadUrl(rawS3Uri);
        
        fs.unlinkSync(tempRawPath);
        
        // Mark as mastered (using raw audio) so it counts as complete
        await storage.updateSynthesisJob(job.id, {
          status: "mastered",
          s3OutputUri: rawS3Uri,
          finalAudioUrl: rawDownloadUrl,
          errorMessage: `Audio sin masterizar (fallback): ${masteringResult.error}`,
          completedAt: new Date(),
        });
        
        await storage.updateMasteredChaptersCount(projectId);
        console.log(`[Mastering] Fallback complete for chapter ${chapterId}`);
        
      } catch (fallbackError) {
        console.error(`[Mastering] Fallback upload failed:`, fallbackError);
        // Last resort: use presigned URL directly
        await storage.updateSynthesisJob(job.id, {
          status: "mastered",
          finalAudioUrl: rawAudioUrl,
          errorMessage: `Audio sin masterizar: ${masteringResult.error}`,
          completedAt: new Date(),
        });
        await storage.updateMasteredChaptersCount(projectId);
      }
    } else {
      console.log(`[Mastering] Success for chapter ${chapterId}: ${masteredPath}`);
      console.log(`[Mastering] Analysis: I=${masteringResult.analysis?.input_i} LUFS -> ${masteringResult.analysis?.output_i} LUFS`);
      
      // Upload mastered audio to S3
      const s3Key = `audiobooks/mastered/project_${projectId}/${safeFilename}.mp3`;
      try {
        const masteredS3Uri = await uploadToS3(masteredPath, s3Key);
        const masteredDownloadUrl = await getAudioDownloadUrl(masteredS3Uri);
        
        console.log(`[S3] Uploaded mastered audio: ${masteredS3Uri}`);
        
        await storage.updateSynthesisJob(job.id, {
          status: "mastered",
          localAudioPath: masteredPath,
          s3OutputUri: masteredS3Uri,
          finalAudioUrl: masteredDownloadUrl,
          completedAt: new Date(),
        });
        
        // Actualizar contador de capítulos masterizados
        await storage.updateMasteredChaptersCount(projectId);
        
        // Clean up local temp file
        fs.unlinkSync(masteredPath);
      } catch (uploadError) {
        console.error(`[S3] Failed to upload mastered audio:`, uploadError);
        // Fall back to keeping local file
        await storage.updateSynthesisJob(job.id, {
          status: "mastered",
          localAudioPath: masteredPath,
          finalAudioUrl: rawAudioUrl,
          completedAt: new Date(),
        });
        
        // Actualizar contador de capítulos masterizados
        await storage.updateMasteredChaptersCount(projectId);
      }
    }
    
    console.log(`[Polly] Completed synthesis and mastering for chapter ${chapterId}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const retryCount = (job.retryCount || 0) + 1;
    
    console.error(`[Polly] Error synthesizing chapter ${chapterId}:`, errorMessage);
    console.error(`[Polly] Retry count: ${retryCount}/3`);
    
    // Retry up to 3 times with exponential backoff
    if (retryCount < 3 && !errorMessage.includes("FFmpeg timeout")) {
      console.log(`[Polly] Retrying chapter ${chapterId} in ${retryCount * 5} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryCount * 5000));
      
      // Recursively retry
      try {
        return await synthesizeChapter(
          chapterId,
          projectId,
          text,
          voiceId,
          engine,
          speechRate,
          chapterTitle,
          chapterIndex,
          totalChapters
        );
      } catch (retryError) {
        console.error(`[Polly] Retry attempt ${retryCount} failed for chapter ${chapterId}`);
      }
    }
    
    // If timeout or max retries reached, mark as failed
    const finalErrorMsg = retryCount >= 3 
      ? `${errorMessage} (Falló después de 3 intentos)`
      : errorMessage;
    
    await storage.updateSynthesisJob(job.id, {
      status: "failed",
      errorMessage: finalErrorMsg,
      retryCount,
    });
    
    throw error;
  }
}

/**
 * Synthesize all chapters of a project sequentially
 * Skips chapters that are already mastered
 */
export async function synthesizeProject(
  projectId: number,
  onProgress?: (completed: number, total: number, currentChapter: string) => void
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
  
  // Count already mastered chapters
  let alreadyMastered = 0;
  const chaptersToProcess: typeof chapters = [];
  
  for (const chapter of chapters) {
    const latestJob = await storage.getLatestJobByChapter(chapter.id);
    if (latestJob?.status === "mastered") {
      alreadyMastered++;
      console.log(`[Polly] Skipping chapter "${chapter.title}" - already mastered`);
    } else {
      chaptersToProcess.push(chapter);
    }
  }
  
  console.log(`[Polly] Project ${projectId}: ${alreadyMastered} mastered, ${chaptersToProcess.length} to process`);
  
  let completed = alreadyMastered;
  const failedChapters: string[] = [];
  
  // Use speech rate from project or default to 90% for ACX audiobooks
  const speechRate = project.speechRate || "90%";
  
  // Create a map of chapter indices for track number calculation
  const chapterIndices = new Map<number, number>();
  chapters.forEach((ch, index) => {
    chapterIndices.set(ch.id, index + 1);
  });
  
  for (const chapter of chaptersToProcess) {
    onProgress?.(completed, chapters.length, chapter.title);
    
    try {
      // Delete old jobs for this chapter before creating new one
      await storage.deleteOldJobsByChapter(chapter.id);
      
      await synthesizeChapter(
        chapter.id,
        projectId,
        chapter.contentText,
        project.voiceId,
        project.engine,
        speechRate,
        chapter.title,
        chapterIndices.get(chapter.id) || 1,
        chapters.length
      );
      
      completed++;
      await storage.updateAudiobookProject(projectId, { completedChapters: completed });
      
    } catch (error) {
      // Log error but continue with next chapter
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Polly] Chapter "${chapter.title}" failed, continuing with next: ${errorMessage}`);
      failedChapters.push(chapter.title);
      
      // Still count as processed (even if failed) so progress continues
      completed++;
      await storage.updateAudiobookProject(projectId, { 
        completedChapters: completed,
        errorMessage: `Capítulos con error: ${failedChapters.join(", ")}`,
      });
    }
  }
  
  // Determine final status based on results
  if (failedChapters.length === 0) {
    await storage.updateAudiobookProject(projectId, { status: "completed" });
    onProgress?.(completed, chapters.length, "Completado");
  } else if (failedChapters.length === chaptersToProcess.length) {
    // All chapters failed
    await storage.updateAudiobookProject(projectId, { 
      status: "failed",
      errorMessage: `Todos los capítulos fallaron: ${failedChapters.join(", ")}`,
    });
  } else {
    // Some chapters succeeded, some failed
    await storage.updateAudiobookProject(projectId, { 
      status: "completed",
      errorMessage: `Completado con ${failedChapters.length} errores: ${failedChapters.join(", ")}`,
    });
    onProgress?.(completed, chapters.length, `Completado con ${failedChapters.length} errores`);
  }
}

/**
 * Validate AWS credentials are properly configured
 */
export async function validateAwsCredentials(): Promise<{ valid: boolean; error?: string }> {
  try {
    const client = getPollyClient();
    
    // Try a simple API call to validate credentials
    const command = new DescribeVoicesCommand({
      LanguageCode: LanguageCode.es_ES,
    });
    
    await client.send(command);
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid AWS credentials",
    };
  }
}

/**
 * Apply mastering to a job that has completed synthesis but hasn't been mastered yet
 */
async function applyMasteringToJob(
  job: { id: number; chapterId: number; finalAudioUrl: string | null; s3OutputUri: string | null },
  projectId: number
): Promise<void> {
  if (!job.finalAudioUrl) {
    throw new Error(`Job ${job.id} has no audio URL`);
  }
  
  // Get chapter info for filename
  const chapter = await storage.getChapterById(job.chapterId);
  const chapterTitle = chapter?.title || `chapter_${job.chapterId}`;
  
  console.log(`[Mastering] Applying mastering to job ${job.id}: ${chapterTitle}`);
  
  await storage.updateSynthesisJob(job.id, { status: "mastering" });
  
  const masteringDir = path.join(os.tmpdir(), "audiobook-mastered");
  if (!fs.existsSync(masteringDir)) {
    fs.mkdirSync(masteringDir, { recursive: true });
  }
  
  const safeFilename = sanitizeFilename(chapterTitle);
  const masteredPath = path.join(masteringDir, `${safeFilename}.mp3`);
  
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
    title: chapterTitle ?? undefined,
    album: project?.title ?? undefined,
    albumArtist: project?.albumArtist ?? undefined,
    year: project?.albumYear ?? undefined,
    genre: project?.albumGenre || "Audiobook",
    coverImageBase64: project?.coverImageUrl ?? undefined,
  };
  
  const masteringResult = await masterAudioFromUrl(job.finalAudioUrl, masteredPath, masteringOptions, metadata);
  
  if (!masteringResult.success) {
    console.error(`[Mastering] Failed for job ${job.id}:`, masteringResult.error);
    await storage.updateSynthesisJob(job.id, {
      status: "completed",
      errorMessage: `Mastering failed: ${masteringResult.error}`,
    });
    throw new Error(`Mastering failed: ${masteringResult.error}`);
  }
  
  console.log(`[Mastering] Success for job ${job.id}: ${masteredPath}`);
  
  // Upload to S3
  const s3Key = `audiobooks/mastered/project_${projectId}/${safeFilename}.mp3`;
  try {
    const masteredS3Uri = await uploadToS3(masteredPath, s3Key);
    const masteredDownloadUrl = await getAudioDownloadUrl(masteredS3Uri);
    
    await storage.updateSynthesisJob(job.id, {
      status: "mastered",
      localAudioPath: masteredPath,
      s3OutputUri: masteredS3Uri,
      finalAudioUrl: masteredDownloadUrl,
      completedAt: new Date(),
    });
    
    fs.unlinkSync(masteredPath);
    console.log(`[Mastering] Job ${job.id} mastered successfully`);
  } catch (uploadError) {
    console.error(`[S3] Failed to upload mastered audio:`, uploadError);
    await storage.updateSynthesisJob(job.id, {
      status: "mastered",
      localAudioPath: masteredPath,
      finalAudioUrl: job.finalAudioUrl,
      completedAt: new Date(),
    });
  }
}

/**
 * Recover a single job that was interrupted (check Polly status and update DB)
 */
export async function recoverSynthesisJob(jobId: number): Promise<{ recovered: boolean; status: string; error?: string }> {
  const jobs = await storage.getSynthesisJobsByProject(0); // Get all to find by id
  const allJobs = await storage.getSynthesisJobsByProject(1); // TODO: Need a getJobById method
  
  // Find the job by iterating (temporary until we add getJobById)
  const job = allJobs.find(j => j.id === jobId);
  if (!job) {
    return { recovered: false, status: "not_found", error: "Job not found" };
  }
  
  if (!job.pollyTaskId) {
    return { recovered: false, status: job.status, error: "No Polly task ID" };
  }
  
  try {
    const task = await getSynthesisTaskStatus(job.pollyTaskId);
    
    if (task.TaskStatus === TaskStatus.COMPLETED) {
      // Get the download URL
      const audioUrl = task.OutputUri 
        ? await getAudioDownloadUrl(task.OutputUri)
        : null;
      
      await storage.updateSynthesisJob(job.id, {
        status: "completed",
        s3OutputUri: task.OutputUri || null,
        finalAudioUrl: audioUrl,
        completedAt: new Date(),
      });
      
      return { recovered: true, status: "completed" };
    } else if (task.TaskStatus === TaskStatus.FAILED) {
      await storage.updateSynthesisJob(job.id, {
        status: "failed",
        errorMessage: task.TaskStatusReason || "Polly task failed",
      });
      return { recovered: true, status: "failed", error: task.TaskStatusReason };
    } else {
      // Still in progress
      return { recovered: false, status: task.TaskStatus || "in_progress" };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { recovered: false, status: "error", error: errorMessage };
  }
}

/**
 * Recover all pending synthesis jobs (called on server startup or manually)
 * Only considers the LATEST job per chapter (ignores old failed jobs if newer ones exist)
 */
export async function recoverPendingJobs(): Promise<{ recovered: number; failed: number; pending: number }> {
  let recovered = 0;
  let failed = 0;
  let pending = 0;
  
  // Get all projects that are in synthesizing state
  const projects = await storage.getAllAudiobookProjects();
  
  for (const project of projects) {
    if (project.status !== "synthesizing") continue;
    
    console.log(`[Recovery] Checking project ${project.id}: ${project.title}`);
    
    const allJobs = await storage.getSynthesisJobsByProject(project.id);
    
    // Get only the latest job per chapter
    const latestJobsByChapter = new Map<number, typeof allJobs[0]>();
    for (const job of allJobs) {
      const existing = latestJobsByChapter.get(job.chapterId);
      if (!existing || job.id > existing.id) {
        latestJobsByChapter.set(job.chapterId, job);
      }
    }
    
    let allJobsCompleted = true;
    let anyLatestFailed = false;
    let masteredCount = 0;
    
    // Process only the latest job per chapter
    for (const job of Array.from(latestJobsByChapter.values())) {
      if (job.status === "synthesizing" && job.pollyTaskId) {
        try {
          console.log(`[Recovery] Checking Polly task ${job.pollyTaskId} for job ${job.id}`);
          const task = await getSynthesisTaskStatus(job.pollyTaskId);
          
          if (task.TaskStatus === TaskStatus.COMPLETED) {
            const audioUrl = task.OutputUri 
              ? await getAudioDownloadUrl(task.OutputUri)
              : null;
            
            await storage.updateSynthesisJob(job.id, {
              status: "completed",
              s3OutputUri: task.OutputUri || null,
              finalAudioUrl: audioUrl,
              completedAt: new Date(),
            });
            console.log(`[Recovery] Job ${job.id} recovered as completed`);
            recovered++;
            // Job needs mastering still, so allJobsCompleted stays based on status
          } else if (task.TaskStatus === TaskStatus.FAILED) {
            await storage.updateSynthesisJob(job.id, {
              status: "failed",
              errorMessage: task.TaskStatusReason || "Polly task failed",
            });
            console.log(`[Recovery] Job ${job.id} marked as failed: ${task.TaskStatusReason}`);
            failed++;
            anyLatestFailed = true;
          } else {
            // Still processing in AWS
            console.log(`[Recovery] Job ${job.id} still in progress: ${task.TaskStatus}`);
            allJobsCompleted = false;
            pending++;
          }
        } catch (error) {
          console.error(`[Recovery] Error checking job ${job.id}:`, error);
          pending++;
          allJobsCompleted = false;
        }
      } else if (job.status === "mastered") {
        masteredCount++;
      } else if (job.status === "completed") {
        // Completed but not mastered - might need mastering
      } else if (job.status === "pending" || job.status === "mastering") {
        allJobsCompleted = false;
      } else if (job.status === "failed") {
        anyLatestFailed = true;
      }
    }
    
    // Update mastered chapters count
    await storage.updateMasteredChaptersCount(project.id);
    
    // Check if we need to continue synthesis for remaining chapters
    const chapters = await storage.getChaptersByProject(project.id);
    const processedChapterIds = new Set(latestJobsByChapter.keys());
    
    // Find chapters that either:
    // 1. Have no job at all, OR
    // 2. Have only failed jobs (latest job is failed)
    const chaptersToProcess = chapters.filter(c => {
      const latestJob = latestJobsByChapter.get(c.id);
      if (!latestJob) return true; // No job at all
      if (latestJob.status === "failed") return true; // Latest is failed, retry
      return false;
    });
    
    // Also check for chapters with completed (not mastered) jobs - they need mastering
    const completedNotMastered = Array.from(latestJobsByChapter.values()).filter(
      j => j.status === "completed" && j.finalAudioUrl
    );
    
    console.log(`[Recovery] Project ${project.id}: ${masteredCount} mastered, ${chaptersToProcess.length} to process, ${completedNotMastered.length} need mastering`);
    
    // First, apply mastering to jobs that have completed synthesis but no mastering
    if (completedNotMastered.length > 0) {
      console.log(`[Recovery] Applying mastering to ${completedNotMastered.length} completed jobs`);
      for (const job of completedNotMastered) {
        try {
          await applyMasteringToJob(job, project.id);
          masteredCount++;
        } catch (error) {
          console.error(`[Recovery] Failed to master job ${job.id}:`, error);
        }
      }
      await storage.updateMasteredChaptersCount(project.id);
    }
    
    if (chaptersToProcess.length > 0 && !anyLatestFailed) {
      // Continue synthesis for remaining chapters
      console.log(`[Recovery] Resuming synthesis for project ${project.id}, ${chaptersToProcess.length} chapters to process`);
      // Don't await - let it run in background
      synthesizeProjectFromChapter(project.id, chaptersToProcess, masteredCount);
    } else if (chaptersToProcess.length === 0 && masteredCount === chapters.length) {
      // All chapters are mastered
      console.log(`[Recovery] Project ${project.id} is complete`);
      await storage.updateAudiobookProject(project.id, { status: "completed" });
    } else if (anyLatestFailed && chaptersToProcess.length === 0) {
      // Some chapters failed with no retry possible
      console.log(`[Recovery] Project ${project.id} has failed chapters`);
      await storage.updateAudiobookProject(project.id, { status: "failed" });
    }
  }
  
  return { recovered, failed, pending };
}

/**
 * Continue synthesizing a project from specific chapters
 */
async function synthesizeProjectFromChapter(
  projectId: number,
  chapters: { id: number; title: string; contentText: string }[],
  startCount: number
): Promise<void> {
  const project = await storage.getAudiobookProject(projectId);
  if (!project) return;
  
  let completed = startCount;
  
  try {
    for (const chapter of chapters) {
      console.log(`[Synthesis] Project ${projectId}: ${completed}/${project.totalChapters} - ${chapter.title}`);
      
      await synthesizeChapter(
        chapter.id,
        projectId,
        chapter.contentText,
        project.voiceId,
        project.engine,
        project.speechRate || "90%",
        chapter.title
      );
      
      completed++;
      await storage.updateAudiobookProject(projectId, { completedChapters: completed });
    }
    
    await storage.updateAudiobookProject(projectId, { status: "completed" });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await storage.updateAudiobookProject(projectId, { 
      status: "failed",
      errorMessage,
    });
  }
}

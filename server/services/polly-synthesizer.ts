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
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storage } from "../storage";

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
  outputFormat: OutputFormat = OutputFormat.MP3
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
    TextType: TextType.TEXT,
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
 * Synthesize a full chapter (handles chunking for long texts)
 */
export async function synthesizeChapter(
  chapterId: number,
  projectId: number,
  text: string,
  voiceId: string,
  engine: string = "neural"
): Promise<void> {
  // For now, we'll use a single task per chapter
  // Long texts will be handled with SSML marks in a future update
  
  // Check text length and truncate if needed (Polly's hard limit is 100k chars for StartSpeechSynthesisTask)
  const maxLength = 100000;
  const processedText = text.length > maxLength ? text.slice(0, maxLength) : text;
  
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
    const result = await startSynthesisTask(processedText, voiceId as VoiceId, pollyEngine);
    
    await storage.updateSynthesisJob(job.id, {
      pollyTaskId: result.taskId,
      s3OutputUri: result.s3Uri,
      status: "synthesizing",
    });
    
    console.log(`[Polly] Started synthesis task ${result.taskId} for chapter ${chapterId}`);
    
    // Wait for completion (async polling)
    const completedTask = await waitForTaskCompletion(result.taskId);
    
    // Get the download URL
    const audioUrl = completedTask.OutputUri 
      ? await getAudioDownloadUrl(completedTask.OutputUri)
      : null;
    
    await storage.updateSynthesisJob(job.id, {
      status: "completed",
      s3OutputUri: completedTask.OutputUri || null,
      finalAudioUrl: audioUrl,
      completedAt: new Date(),
    });
    
    console.log(`[Polly] Completed synthesis for chapter ${chapterId}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Polly] Error synthesizing chapter ${chapterId}:`, errorMessage);
    
    await storage.updateSynthesisJob(job.id, {
      status: "failed",
      errorMessage,
      retryCount: (job.retryCount || 0) + 1,
    });
    
    throw error;
  }
}

/**
 * Synthesize all chapters of a project sequentially
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
  
  let completed = 0;
  
  try {
    for (const chapter of chapters) {
      onProgress?.(completed, chapters.length, chapter.title);
      
      await synthesizeChapter(
        chapter.id,
        projectId,
        chapter.contentText,
        project.voiceId,
        project.engine
      );
      
      completed++;
      await storage.updateAudiobookProject(projectId, { completedChapters: completed });
    }
    
    await storage.updateAudiobookProject(projectId, { status: "completed" });
    onProgress?.(completed, chapters.length, "Completado");
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await storage.updateAudiobookProject(projectId, { 
      status: "failed",
      errorMessage,
    });
    throw error;
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
 */
export async function recoverPendingJobs(): Promise<{ recovered: number; failed: number; pending: number }> {
  let recovered = 0;
  let failed = 0;
  let pending = 0;
  
  // Get all projects that are in synthesizing state
  const projects = await storage.getAllAudiobookProjects();
  
  for (const project of projects) {
    if (project.status !== "synthesizing") continue;
    
    const jobs = await storage.getSynthesisJobsByProject(project.id);
    let allCompleted = true;
    let anyFailed = false;
    let completedCount = 0;
    
    for (const job of jobs) {
      if (job.status === "synthesizing" && job.pollyTaskId) {
        try {
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
            recovered++;
            completedCount++;
          } else if (task.TaskStatus === TaskStatus.FAILED) {
            await storage.updateSynthesisJob(job.id, {
              status: "failed",
              errorMessage: task.TaskStatusReason || "Polly task failed",
            });
            failed++;
            anyFailed = true;
          } else {
            // Still processing
            allCompleted = false;
            pending++;
          }
        } catch (error) {
          console.error(`[Recovery] Error checking job ${job.id}:`, error);
          pending++;
          allCompleted = false;
        }
      } else if (job.status === "completed" || job.status === "mastered") {
        completedCount++;
      } else if (job.status === "pending") {
        allCompleted = false;
      } else if (job.status === "failed") {
        anyFailed = true;
      }
    }
    
    // Update project completed count
    await storage.updateAudiobookProject(project.id, { completedChapters: completedCount });
    
    // Check if we need to continue synthesis for remaining chapters
    const chapters = await storage.getChaptersByProject(project.id);
    const processedChapterIds = new Set(jobs.map(j => j.chapterId));
    const remainingChapters = chapters.filter(c => !processedChapterIds.has(c.id));
    
    if (remainingChapters.length > 0 && allCompleted && !anyFailed) {
      // Continue synthesis for remaining chapters
      console.log(`[Recovery] Resuming synthesis for project ${project.id}, ${remainingChapters.length} chapters remaining`);
      synthesizeProjectFromChapter(project.id, remainingChapters, completedCount);
    } else if (allCompleted && remainingChapters.length === 0) {
      // All done
      await storage.updateAudiobookProject(project.id, { 
        status: anyFailed ? "failed" : "completed" 
      });
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
        project.engine
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

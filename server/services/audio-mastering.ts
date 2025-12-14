/**
 * Audio Mastering Service for AudiobookForge
 * Applies 2-pass loudnorm for ACX compliance using FFmpeg
 * 
 * ACX Requirements:
 * - Peak value: -3 dBFS maximum
 * - RMS (loudness): -23 dBFS to -18 dBFS
 * - Noise floor: -60 dBFS or lower
 * - Sample rate: 44.1 kHz
 * - Bit depth: 16-bit or higher
 * - Format: MP3 (192 kbps or higher) or M4A
 */

import ffmpeg from "fluent-ffmpeg";
import { join, dirname, basename } from "path";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

// ACX Target loudness values
const ACX_TARGET_I = -20; // Integrated loudness (LUFS) - middle of -18 to -23
const ACX_TARGET_LRA = 7; // Loudness range
const ACX_TARGET_TP = -3; // True peak

const OUTPUT_DIR = join(process.cwd(), "audiobooks_output");
const TEMP_DIR = join(process.cwd(), "audiobooks_temp");

export interface MasteringResult {
  inputPath: string;
  outputPath: string;
  measuredI: number;
  measuredLRA: number;
  measuredTP: number;
  success: boolean;
  error?: string;
}

export interface LoudnessStats {
  input_i: number;
  input_lra: number;
  input_tp: number;
  input_thresh: number;
  output_i: number;
  output_lra: number;
  output_tp: number;
  output_thresh: number;
}

/**
 * Ensure output directories exist
 */
function ensureDirectories(): void {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/**
 * Run first pass of loudnorm to analyze audio
 */
async function analyzeLoudness(inputPath: string): Promise<LoudnessStats | null> {
  try {
    const command = `ffmpeg -i "${inputPath}" -af "loudnorm=I=${ACX_TARGET_I}:LRA=${ACX_TARGET_LRA}:TP=${ACX_TARGET_TP}:print_format=json" -f null - 2>&1`;
    
    const { stdout, stderr } = await execAsync(command);
    const output = stdout + stderr;
    
    // Extract JSON from output
    const jsonMatch = output.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (!jsonMatch) {
      console.error("[Mastering] Could not parse loudness analysis output");
      return null;
    }
    
    const stats = JSON.parse(jsonMatch[0]) as LoudnessStats;
    console.log(`[Mastering] Analysis: I=${stats.input_i} LUFS, TP=${stats.input_tp} dBFS`);
    
    return stats;
  } catch (error) {
    console.error("[Mastering] Analysis error:", error);
    return null;
  }
}

/**
 * Apply 2-pass loudnorm normalization with measured values
 */
async function applyNormalization(
  inputPath: string,
  outputPath: string,
  stats: LoudnessStats
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const loudnormFilter = `loudnorm=I=${ACX_TARGET_I}:LRA=${ACX_TARGET_LRA}:TP=${ACX_TARGET_TP}:measured_I=${stats.input_i}:measured_LRA=${stats.input_lra}:measured_TP=${stats.input_tp}:measured_thresh=${stats.input_thresh}:linear=true`;
    
    ffmpeg(inputPath)
      .audioFilters([
        loudnormFilter,
        // High-pass filter to reduce low rumble (below 80 Hz)
        "highpass=f=80",
        // Very subtle compression for consistency
        "acompressor=threshold=-24dB:ratio=2:attack=20:release=250",
      ])
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .audioFrequency(44100)
      .audioChannels(1) // Mono for audiobooks
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Mastering] Running: ${cmd.slice(0, 100)}...`);
      })
      .on("end", () => {
        console.log(`[Mastering] Completed: ${basename(outputPath)}`);
        resolve(true);
      })
      .on("error", (err) => {
        console.error(`[Mastering] Error: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Master a single audio file with 2-pass loudnorm
 */
export async function masterAudioFile(
  inputPath: string,
  projectId: number,
  chapterNumber: number
): Promise<MasteringResult> {
  ensureDirectories();
  
  const outputFilename = `project_${projectId}_ch${String(chapterNumber).padStart(3, "0")}_mastered.mp3`;
  const outputPath = join(OUTPUT_DIR, outputFilename);
  
  console.log(`[Mastering] Processing: ${basename(inputPath)}`);
  
  try {
    // First pass: analyze loudness
    const stats = await analyzeLoudness(inputPath);
    
    if (!stats) {
      return {
        inputPath,
        outputPath,
        measuredI: 0,
        measuredLRA: 0,
        measuredTP: 0,
        success: false,
        error: "Could not analyze audio loudness",
      };
    }
    
    // Second pass: apply normalization with measured values
    await applyNormalization(inputPath, outputPath, stats);
    
    return {
      inputPath,
      outputPath,
      measuredI: stats.output_i || ACX_TARGET_I,
      measuredLRA: stats.output_lra || ACX_TARGET_LRA,
      measuredTP: stats.output_tp || ACX_TARGET_TP,
      success: true,
    };
    
  } catch (error) {
    return {
      inputPath,
      outputPath,
      measuredI: 0,
      measuredLRA: 0,
      measuredTP: 0,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Simple single-pass normalization for quick preview (less accurate)
 */
export async function masterAudioSimple(
  inputPath: string,
  outputPath: string
): Promise<boolean> {
  ensureDirectories();
  
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters([
        `loudnorm=I=${ACX_TARGET_I}:LRA=${ACX_TARGET_LRA}:TP=${ACX_TARGET_TP}`,
        "highpass=f=80",
      ])
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .audioFrequency(44100)
      .audioChannels(1)
      .output(outputPath)
      .on("end", () => resolve(true))
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * Concatenate multiple audio files into a single file
 */
export async function concatenateAudioFiles(
  inputPaths: string[],
  outputPath: string
): Promise<boolean> {
  if (inputPaths.length === 0) {
    throw new Error("No input files provided");
  }
  
  if (inputPaths.length === 1) {
    // Just copy/convert the single file
    return new Promise((resolve, reject) => {
      ffmpeg(inputPaths[0])
        .audioCodec("libmp3lame")
        .audioBitrate("192k")
        .audioFrequency(44100)
        .output(outputPath)
        .on("end", () => resolve(true))
        .on("error", reject)
        .run();
    });
  }
  
  // Create concat file list
  const listPath = join(TEMP_DIR, `concat_${Date.now()}.txt`);
  const listContent = inputPaths.map(p => `file '${p}'`).join("\n");
  
  const { writeFileSync } = await import("fs");
  writeFileSync(listPath, listContent);
  
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .audioFrequency(44100)
      .output(outputPath)
      .on("end", () => {
        // Clean up list file
        try {
          unlinkSync(listPath);
        } catch (e) {
          // Ignore
        }
        resolve(true);
      })
      .on("error", (err) => {
        try {
          unlinkSync(listPath);
        } catch (e) {
          // Ignore
        }
        reject(err);
      })
      .run();
  });
}

/**
 * Get audio duration in seconds
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Verify ffmpeg is available
 */
export async function verifyFfmpeg(): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await execAsync("ffmpeg -version");
    const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
    return {
      available: true,
      version: versionMatch?.[1] || "unknown",
    };
  } catch (error) {
    return {
      available: false,
      error: "FFmpeg not found. Please ensure FFmpeg is installed.",
    };
  }
}

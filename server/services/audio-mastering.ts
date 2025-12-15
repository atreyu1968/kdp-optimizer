/**
 * Audio Mastering Service for AudiobookForge
 * Implements 2-pass loudnorm algorithm following ACX/Audible standards
 * 
 * ACX Standards:
 * - RMS: -23 dB to -18 dB (target -20 dB)
 * - Peak: maximum -3 dB
 * - Noise floor: -60 dB or lower
 * - Format: MP3, 192 kbps CBR, 44.1 kHz
 * - Room Tone: 0.5-1s start, 1-5s end (using 1s start, 3s end)
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LoudnormAnalysis {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  output_i: string;
  output_tp: string;
  output_lra: string;
  output_thresh: string;
  normalization_type: string;
  target_offset: string;
}

export interface MasteringResult {
  success: boolean;
  outputPath: string;
  analysis?: LoudnormAnalysis;
  error?: string;
  duration?: number;
}

export interface MasteringOptions {
  targetLoudness?: number;      // Target integrated loudness (default: -20 LUFS)
  targetPeak?: number;          // Target true peak (default: -3 dB)
  targetLRA?: number;           // Target loudness range (default: 11)
  silenceStart?: number;        // Silence at start in ms (default: 1000)
  silenceEnd?: number;          // Silence at end in ms (default: 3000)
  sampleRate?: number;          // Output sample rate (default: 44100)
  bitrate?: string;             // Output bitrate (default: 192k)
}

const DEFAULT_OPTIONS: Required<MasteringOptions> = {
  targetLoudness: -20,
  targetPeak: -3,
  targetLRA: 11,
  silenceStart: 1000,
  silenceEnd: 3000,
  sampleRate: 44100,
  bitrate: '192k',
};

/**
 * Execute FFmpeg command and return stdout/stderr
 * Includes a 5-minute timeout to prevent hanging in production
 */
function runFFmpeg(args: string[], timeoutMs: number = 300000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    
    let stdout = '';
    let stderr = '';
    let killed = false;
    
    // Timeout to prevent hanging
    const timeout = setTimeout(() => {
      killed = true;
      ffmpeg.kill('SIGKILL');
      reject(new Error(`FFmpeg timeout after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    
    ffmpeg.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
      if (!killed) {
        resolve({ stdout, stderr, code: code || 0 });
      }
    });
    
    ffmpeg.on('error', (error) => {
      clearTimeout(timeout);
      if (!killed) {
        reject(error);
      }
    });
  });
}

/**
 * Parse loudnorm JSON output from FFmpeg stderr
 */
function parseLoudnormOutput(stderr: string): LoudnormAnalysis | null {
  // Find the JSON block in FFmpeg output
  const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  
  if (!jsonMatch) {
    console.error('[Mastering] Could not find loudnorm JSON in FFmpeg output');
    return null;
  }
  
  try {
    // Clean up the JSON (FFmpeg outputs it with some formatting issues sometimes)
    let jsonStr = jsonMatch[0];
    
    // Replace newlines and tabs with proper formatting
    jsonStr = jsonStr.replace(/\s+/g, ' ');
    
    // Parse the JSON
    const parsed = JSON.parse(jsonStr);
    
    return {
      input_i: parsed.input_i || '0',
      input_tp: parsed.input_tp || '0',
      input_lra: parsed.input_lra || '0',
      input_thresh: parsed.input_thresh || '0',
      output_i: parsed.output_i || '0',
      output_tp: parsed.output_tp || '0',
      output_lra: parsed.output_lra || '0',
      output_thresh: parsed.output_thresh || '0',
      normalization_type: parsed.normalization_type || 'dynamic',
      target_offset: parsed.target_offset || '0',
    };
  } catch (error) {
    console.error('[Mastering] Error parsing loudnorm JSON:', error);
    console.error('[Mastering] Raw JSON string:', jsonMatch[0]);
    return null;
  }
}

/**
 * Pass 1: Analyze audio loudness levels
 * Returns the measured values needed for pass 2
 */
async function analyzeLoudness(
  inputPath: string,
  options: Required<MasteringOptions>
): Promise<LoudnormAnalysis | null> {
  console.log(`[Mastering] Pass 1: Analyzing loudness for ${inputPath}`);
  
  const args = [
    '-i', inputPath,
    '-af', `loudnorm=I=${options.targetLoudness}:TP=${options.targetPeak}:LRA=${options.targetLRA}:print_format=json`,
    '-f', 'null',
    '-'
  ];
  
  try {
    const result = await runFFmpeg(args);
    
    if (result.code !== 0) {
      console.error('[Mastering] FFmpeg analysis failed:', result.stderr);
      return null;
    }
    
    return parseLoudnormOutput(result.stderr);
  } catch (error) {
    console.error('[Mastering] Error during loudness analysis:', error);
    return null;
  }
}

/**
 * Pass 2: Apply loudness correction with measured values
 * Uses linear=true for highest quality correction
 */
async function applyLoudnessCorrection(
  inputPath: string,
  outputPath: string,
  analysis: LoudnormAnalysis,
  options: Required<MasteringOptions>
): Promise<boolean> {
  console.log(`[Mastering] Pass 2: Applying loudness correction`);
  console.log(`[Mastering] Measured values: I=${analysis.input_i}, TP=${analysis.input_tp}, LRA=${analysis.input_lra}`);
  
  // Build the loudnorm filter with measured values, offset and linear mode
  // The offset parameter is critical for hitting the exact target loudness
  const loudnormFilter = [
    `loudnorm=I=${options.targetLoudness}`,
    `TP=${options.targetPeak}`,
    `LRA=${options.targetLRA}`,
    `measured_I=${analysis.input_i}`,
    `measured_TP=${analysis.input_tp}`,
    `measured_LRA=${analysis.input_lra}`,
    `measured_thresh=${analysis.input_thresh}`,
    `offset=${analysis.target_offset}`,
    'linear=true'
  ].join(':');
  
  const args = [
    '-y',
    '-i', inputPath,
    '-af', loudnormFilter,
    '-ar', options.sampleRate.toString(),
    '-b:a', options.bitrate,
    '-codec:a', 'libmp3lame',
    outputPath
  ];
  
  try {
    const result = await runFFmpeg(args);
    
    if (result.code !== 0) {
      console.error('[Mastering] FFmpeg correction failed:', result.stderr);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[Mastering] Error during loudness correction:', error);
    return false;
  }
}

/**
 * Add room tone (silence) at the beginning and end of audio
 * ACX recommends 0.5-1s start, 1-5s end
 */
async function addRoomTone(
  inputPath: string,
  outputPath: string,
  options: Required<MasteringOptions>
): Promise<boolean> {
  console.log(`[Mastering] Adding room tone: ${options.silenceStart}ms start, ${options.silenceEnd}ms end`);
  
  // Calculate silence durations in samples
  const startSamples = Math.round((options.silenceStart / 1000) * options.sampleRate);
  const endSamples = Math.round((options.silenceEnd / 1000) * options.sampleRate);
  
  // Use apad for end silence and adelay for start silence
  // adelay adds delay to the audio (effectively silence at start)
  // apad pads with silence at the end
  const filterComplex = [
    `adelay=${options.silenceStart}|${options.silenceStart}`,
    `apad=pad_dur=${options.silenceEnd / 1000}`
  ].join(',');
  
  const args = [
    '-y',
    '-i', inputPath,
    '-af', filterComplex,
    '-ar', options.sampleRate.toString(),
    '-b:a', options.bitrate,
    '-codec:a', 'libmp3lame',
    outputPath
  ];
  
  try {
    const result = await runFFmpeg(args);
    
    if (result.code !== 0) {
      console.error('[Mastering] FFmpeg room tone failed:', result.stderr);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[Mastering] Error adding room tone:', error);
    return false;
  }
}

/**
 * Get audio duration in seconds using FFprobe
 */
async function getAudioDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    
    let stdout = '';
    
    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffprobe.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(parseFloat(stdout.trim()));
      } else {
        resolve(null);
      }
    });
    
    ffprobe.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Download audio from URL to local file
 */
async function downloadAudio(url: string, outputPath: string): Promise<boolean> {
  console.log(`[Mastering] Downloading audio from URL`);
  
  const args = [
    '-y',
    '-i', url,
    '-c', 'copy',
    outputPath
  ];
  
  try {
    const result = await runFFmpeg(args);
    return result.code === 0;
  } catch (error) {
    console.error('[Mastering] Error downloading audio:', error);
    return false;
  }
}

/**
 * Main mastering function - applies 2-pass loudnorm and room tone
 * 
 * @param inputPath - Path to input audio file (or presigned S3 URL)
 * @param outputPath - Path where mastered audio will be saved
 * @param options - Mastering options
 */
export async function masterAudio(
  inputPath: string,
  outputPath: string,
  options: MasteringOptions = {}
): Promise<MasteringResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Create temp directory for intermediate files
  const tempDir = path.join(os.tmpdir(), 'audiobook-mastering');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const timestamp = Date.now();
  const tempInput = path.join(tempDir, `input_${timestamp}.mp3`);
  const tempNormalized = path.join(tempDir, `normalized_${timestamp}.mp3`);
  
  try {
    // If input is a URL, download it first
    let localInputPath = inputPath;
    if (inputPath.startsWith('http://') || inputPath.startsWith('https://')) {
      const downloaded = await downloadAudio(inputPath, tempInput);
      if (!downloaded) {
        return {
          success: false,
          outputPath: '',
          error: 'Failed to download audio from URL',
        };
      }
      localInputPath = tempInput;
    }
    
    // Check if input file exists
    if (!fs.existsSync(localInputPath)) {
      return {
        success: false,
        outputPath: '',
        error: `Input file not found: ${localInputPath}`,
      };
    }
    
    // Pass 1: Analyze loudness
    const analysis = await analyzeLoudness(localInputPath, opts);
    if (!analysis) {
      return {
        success: false,
        outputPath: '',
        error: 'Failed to analyze audio loudness',
      };
    }
    
    console.log(`[Mastering] Analysis complete: I=${analysis.input_i} LUFS, TP=${analysis.input_tp} dB`);
    
    // Pass 2: Apply loudness correction
    const normalized = await applyLoudnessCorrection(localInputPath, tempNormalized, analysis, opts);
    if (!normalized) {
      return {
        success: false,
        outputPath: '',
        error: 'Failed to apply loudness correction',
      };
    }
    
    // Pass 3: Add room tone (silence at start and end)
    const roomToneAdded = await addRoomTone(tempNormalized, outputPath, opts);
    if (!roomToneAdded) {
      return {
        success: false,
        outputPath: '',
        error: 'Failed to add room tone',
      };
    }
    
    // Verify final loudness meets ACX requirements
    const finalAnalysis = await verifyLoudness(outputPath, opts);
    
    // Get final duration
    const duration = await getAudioDuration(outputPath);
    
    // Cleanup temp files
    try {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempNormalized)) fs.unlinkSync(tempNormalized);
    } catch {
      // Ignore cleanup errors
    }
    
    console.log(`[Mastering] Complete: ${outputPath}`);
    
    return {
      success: true,
      outputPath,
      analysis,
      duration: duration || undefined,
    };
    
  } catch (error) {
    // Cleanup on error
    try {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempNormalized)) fs.unlinkSync(tempNormalized);
    } catch {
      // Ignore cleanup errors
    }
    
    return {
      success: false,
      outputPath: '',
      error: error instanceof Error ? error.message : 'Unknown mastering error',
    };
  }
}

/**
 * Master audio from S3 presigned URL and save locally
 */
export async function masterAudioFromUrl(
  audioUrl: string,
  outputPath: string,
  options: MasteringOptions = {}
): Promise<MasteringResult> {
  return masterAudio(audioUrl, outputPath, options);
}

/**
 * Verify FFmpeg is available
 */
export async function verifyFFmpegAvailable(): Promise<boolean> {
  try {
    const result = await runFFmpeg(['-version']);
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Verify final audio loudness matches ACX requirements
 * Runs a quick analysis pass to confirm compliance
 */
async function verifyLoudness(
  filePath: string,
  options: Required<MasteringOptions>
): Promise<LoudnormAnalysis | null> {
  console.log(`[Mastering] Verifying final loudness for ${filePath}`);
  
  const args = [
    '-i', filePath,
    '-af', `loudnorm=I=${options.targetLoudness}:TP=${options.targetPeak}:LRA=${options.targetLRA}:print_format=json`,
    '-f', 'null',
    '-'
  ];
  
  try {
    const result = await runFFmpeg(args);
    
    if (result.code !== 0) {
      console.error('[Mastering] FFmpeg verification failed');
      return null;
    }
    
    const analysis = parseLoudnormOutput(result.stderr);
    if (analysis) {
      // Check if within ACX tolerances (±1 LUFS of target)
      const finalLoudness = parseFloat(analysis.input_i);
      const targetLoudness = options.targetLoudness;
      const tolerance = 1.0;
      
      if (Math.abs(finalLoudness - targetLoudness) <= tolerance) {
        console.log(`[Mastering] PASS: Final loudness ${finalLoudness} LUFS (target: ${targetLoudness} LUFS)`);
      } else {
        console.warn(`[Mastering] WARNING: Final loudness ${finalLoudness} LUFS differs from target ${targetLoudness} LUFS`);
      }
      
      // Check peak compliance
      const finalPeak = parseFloat(analysis.input_tp);
      if (finalPeak <= options.targetPeak) {
        console.log(`[Mastering] PASS: Peak ${finalPeak} dB (max: ${options.targetPeak} dB)`);
      } else {
        console.warn(`[Mastering] WARNING: Peak ${finalPeak} dB exceeds max ${options.targetPeak} dB`);
      }
    }
    
    return analysis;
  } catch (error) {
    console.error('[Mastering] Error during verification:', error);
    return null;
  }
}

/**
 * Get audio info (duration, bitrate, sample rate)
 */
export async function getAudioInfo(filePath: string): Promise<{
  duration: number | null;
  bitrate: string | null;
  sampleRate: string | null;
} | null> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration,bit_rate:stream=sample_rate',
      '-of', 'json',
      filePath
    ]);
    
    let stdout = '';
    
    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffprobe.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const info = JSON.parse(stdout);
          resolve({
            duration: info.format?.duration ? parseFloat(info.format.duration) : null,
            bitrate: info.format?.bit_rate || null,
            sampleRate: info.streams?.[0]?.sample_rate || null,
          });
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
    
    ffprobe.on('error', () => {
      resolve(null);
    });
  });
}

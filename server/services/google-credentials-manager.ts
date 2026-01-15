/**
 * Google Cloud TTS Credentials Manager
 * Handles secure storage and retrieval of multiple Google Cloud service account credentials
 * Uses AES-256-GCM encryption for secure storage in the database
 */

import * as crypto from "crypto";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { storage } from "../storage";
import type { GoogleTtsCredential, InsertGoogleTtsCredential } from "@shared/schema";

// Cache of validated TTS clients by credential ID
const clientCache = new Map<number, TextToSpeechClient>();

// Master key for encryption - must be 32 bytes for AES-256
function getMasterKey(): Buffer {
  const key = process.env.GOOGLE_TTS_MASTER_KEY;
  if (!key) {
    throw new Error("GOOGLE_TTS_MASTER_KEY not configured. Generate a 64-character hex string.");
  }
  
  // Key should be a 64-char hex string (32 bytes)
  if (key.length !== 64) {
    throw new Error("GOOGLE_TTS_MASTER_KEY must be exactly 64 hex characters (32 bytes)");
  }
  
  return Buffer.from(key, "hex");
}

/**
 * Check if the master encryption key is configured
 */
export function isMasterKeyConfigured(): boolean {
  const key = process.env.GOOGLE_TTS_MASTER_KEY;
  return !!key && key.length === 64;
}

/**
 * Generate a new master key (for setup purposes)
 * Returns a 64-character hex string suitable for GOOGLE_TTS_MASTER_KEY
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Encrypt a JSON credential payload using AES-256-GCM
 */
function encryptCredential(jsonPayload: string): { encrypted: string; iv: string; authTag: string } {
  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
  
  let encrypted = cipher.update(jsonPayload, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt a credential payload using AES-256-GCM
 */
function decryptCredential(encrypted: string, iv: string, authTag: string): string {
  const masterKey = getMasterKey();
  const ivBuffer = Buffer.from(iv, "base64");
  const authTagBuffer = Buffer.from(authTag, "base64");
  
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, ivBuffer, { authTagLength: 16 });
  decipher.setAuthTag(authTagBuffer);
  
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

/**
 * Parse and validate credential JSON, extract metadata
 */
function parseCredentialJson(jsonStr: string): { projectId: string; clientEmail: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    
    if (!parsed.type || parsed.type !== "service_account") {
      throw new Error("Invalid credential type. Expected 'service_account'.");
    }
    
    if (!parsed.project_id) {
      throw new Error("Missing 'project_id' in credentials.");
    }
    
    if (!parsed.client_email) {
      throw new Error("Missing 'client_email' in credentials.");
    }
    
    if (!parsed.private_key) {
      throw new Error("Missing 'private_key' in credentials.");
    }
    
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid JSON format in credentials.");
    }
    throw error;
  }
}

/**
 * Create a new Google TTS credential entry
 * Encrypts the JSON payload and stores it securely
 */
export async function createCredential(
  label: string,
  jsonPayload: string
): Promise<GoogleTtsCredential> {
  // Parse and validate the JSON
  const { projectId, clientEmail } = parseCredentialJson(jsonPayload);
  
  // Encrypt the payload
  const { encrypted, iv, authTag } = encryptCredential(jsonPayload);
  
  // Store in database
  const credential = await storage.createGoogleTtsCredential({
    label,
    projectId,
    clientEmail,
    encryptedPayload: encrypted,
    iv,
    authTag,
    status: "pending",
    statusMessage: null,
    lastValidatedAt: null,
  });
  
  // Immediately validate the credential
  await validateCredential(credential.id);
  
  // Return updated credential
  return (await storage.getGoogleTtsCredential(credential.id))!;
}

/**
 * Get all credentials (without decrypted payloads)
 */
export async function listCredentials(): Promise<Omit<GoogleTtsCredential, "encryptedPayload" | "iv" | "authTag">[]> {
  const credentials = await storage.getAllGoogleTtsCredentials();
  
  // Remove sensitive fields before returning
  return credentials.map(({ encryptedPayload, iv, authTag, ...rest }) => rest);
}

/**
 * Get a single credential (without decrypted payload)
 */
export async function getCredential(id: number): Promise<Omit<GoogleTtsCredential, "encryptedPayload" | "iv" | "authTag"> | null> {
  const credential = await storage.getGoogleTtsCredential(id);
  if (!credential) return null;
  
  const { encryptedPayload, iv, authTag, ...rest } = credential;
  return rest;
}

/**
 * Update a credential's label
 */
export async function updateCredentialLabel(id: number, label: string): Promise<void> {
  await storage.updateGoogleTtsCredential(id, { label });
}

/**
 * Update a credential's JSON payload
 * Re-encrypts and revalidates
 */
export async function updateCredentialPayload(id: number, jsonPayload: string): Promise<void> {
  const { projectId, clientEmail } = parseCredentialJson(jsonPayload);
  const { encrypted, iv, authTag } = encryptCredential(jsonPayload);
  
  await storage.updateGoogleTtsCredential(id, {
    projectId,
    clientEmail,
    encryptedPayload: encrypted,
    iv,
    authTag,
    status: "pending",
    statusMessage: null,
  });
  
  // Clear cached client
  clientCache.delete(id);
  
  // Revalidate
  await validateCredential(id);
}

/**
 * Delete a credential
 */
export async function deleteCredential(id: number): Promise<void> {
  clientCache.delete(id);
  await storage.deleteGoogleTtsCredential(id);
}

/**
 * Validate a credential by attempting to list voices
 */
export async function validateCredential(id: number): Promise<{ valid: boolean; message: string }> {
  const credential = await storage.getGoogleTtsCredential(id);
  if (!credential) {
    return { valid: false, message: "Credential not found" };
  }
  
  try {
    // Decrypt the payload
    const jsonPayload = decryptCredential(
      credential.encryptedPayload,
      credential.iv,
      credential.authTag
    );
    
    // Parse credentials
    const parsedCredentials = JSON.parse(jsonPayload);
    
    // Create a temporary client
    const client = new TextToSpeechClient({
      credentials: parsedCredentials,
    });
    
    // Try to list voices (with timeout)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout validating credentials")), 10000);
    });
    
    await Promise.race([
      client.listVoices({ languageCode: "es-ES" }),
      timeoutPromise,
    ]);
    
    // Success - update status and cache client
    await storage.updateGoogleTtsCredential(id, {
      status: "valid",
      statusMessage: "Credenciales válidas",
      lastValidatedAt: new Date(),
    });
    
    clientCache.set(id, client);
    
    return { valid: true, message: "Credenciales válidas" };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    
    await storage.updateGoogleTtsCredential(id, {
      status: "invalid",
      statusMessage: message,
      lastValidatedAt: new Date(),
    });
    
    clientCache.delete(id);
    
    return { valid: false, message };
  }
}

/**
 * Get a validated TTS client for a specific credential
 * Returns cached client if available, otherwise creates and validates
 */
export async function getClientForCredential(id: number): Promise<TextToSpeechClient> {
  // Check cache first
  if (clientCache.has(id)) {
    return clientCache.get(id)!;
  }
  
  const credential = await storage.getGoogleTtsCredential(id);
  if (!credential) {
    throw new Error(`Credential ${id} not found`);
  }
  
  if (credential.status !== "valid") {
    // Try to validate
    const result = await validateCredential(id);
    if (!result.valid) {
      throw new Error(`Credential ${id} is invalid: ${result.message}`);
    }
  }
  
  // Decrypt and create client
  const jsonPayload = decryptCredential(
    credential.encryptedPayload,
    credential.iv,
    credential.authTag
  );
  
  const parsedCredentials = JSON.parse(jsonPayload);
  const client = new TextToSpeechClient({
    credentials: parsedCredentials,
  });
  
  clientCache.set(id, client);
  return client;
}

/**
 * List voices using a specific credential
 */
export async function listVoicesWithCredential(id: number, languageCode?: string): Promise<any[]> {
  const client = await getClientForCredential(id);
  
  const [response] = await client.listVoices({
    languageCode: languageCode,
  });
  
  const voiceOptions: any[] = [];
  
  for (const voice of response.voices || []) {
    const name = voice.name || "";
    if (!name.includes("Neural2") && !name.includes("Wavenet") && !name.includes("Journey")) {
      continue;
    }
    
    let voiceType = "Standard";
    if (name.includes("Neural2")) voiceType = "Neural2";
    else if (name.includes("Journey")) voiceType = "Journey";
    else if (name.includes("Wavenet")) voiceType = "WaveNet";
    
    const genderValue = typeof voice.ssmlGender === 'number' ? voice.ssmlGender : 0;
    const genderMap: Record<number, string> = {
      0: "Unknown",
      1: "Male",
      2: "Female",
      3: "Neutral",
    };
    const gender = genderMap[genderValue] || "Unknown";
    
    const langCode = voice.languageCodes?.[0] || "";
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
  
  return voiceOptions;
}

/**
 * Utilidades para manejo de reintentos y rate limiting de OpenAI
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Sleep helper para delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ejecuta una función con retry logic exponencial para errores 429 (rate limit)
 * 
 * @param fn - Función asíncrona a ejecutar
 * @param options - Opciones de configuración del retry
 * @returns Resultado de la función
 * @throws Error si se agotan los reintentos
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2
  } = options;

  let lastError: Error | undefined;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Solo reintentar en errores 429 (rate limit)
      const isRateLimitError = 
        error?.status === 429 || 
        error?.code === 'rate_limit_exceeded' ||
        error?.message?.includes('429');

      if (!isRateLimitError) {
        // Para otros errores, fallar inmediatamente
        throw error;
      }

      // Si es el último intento, lanzar el error
      if (attempt === maxRetries) {
        console.error(
          `[Retry] Agotados ${maxRetries} reintentos después de error 429. Fallando.`
        );
        throw error;
      }

      // Calcular delay con exponential backoff
      const jitter = Math.random() * 0.3 * delayMs; // 0-30% jitter
      const currentDelay = Math.min(delayMs + jitter, maxDelayMs);

      console.warn(
        `[Retry] Rate limit excedido (intento ${attempt + 1}/${maxRetries + 1}). ` +
        `Esperando ${Math.round(currentDelay / 1000)}s antes de reintentar...`
      );

      await sleep(currentDelay);
      
      // Incrementar delay para próximo intento
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
    }
  }

  // Esto no debería alcanzarse, pero TypeScript lo requiere
  throw lastError || new Error('Retry failed');
}

/**
 * Agrega un pequeño delay entre llamadas secuenciales para evitar rate limiting
 * 
 * @param delayMs - Milisegundos de delay (default: 500ms)
 */
export async function delayBetweenCalls(delayMs: number = 500): Promise<void> {
  await sleep(delayMs);
}

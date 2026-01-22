/**
 * Retry utility for handling transient failures with exponential backoff.
 *
 * This utility provides a standardized way to retry operations that may fail
 * due to transient issues like network errors, rate limiting, or temporary
 * service unavailability.
 */

/**
 * Configuration options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds between retries (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Function to determine if an error is retryable (default: all errors are retryable) */
  isRetryable?: (error: unknown) => boolean;
  /** Optional callback for logging retry attempts */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Executes a function with retry logic and exponential backoff.
 *
 * @param fn The async function to execute
 * @param options Configuration options for retry behavior
 * @returns The result of the function or throws after all retries exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchDataFromAPI(),
 *   {
 *     maxRetries: 3,
 *     isRetryable: (error) => isTransientError(error),
 *     onRetry: (error, attempt, delay) => {
 *       console.log(`Retry attempt ${attempt} after ${delay}ms`);
 *     },
 *   }
 * );
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
    initialDelayMs = DEFAULT_RETRY_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
    backoffMultiplier = DEFAULT_RETRY_OPTIONS.backoffMultiplier,
    isRetryable = () => true,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!isRetryable(error)) {
        throw lastError;
      }

      // If this was the last attempt, throw the error
      if (attempt >= maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      const jitter = Math.random() * 0.1 * baseDelay; // Add up to 10% jitter
      const delay = Math.min(baseDelay + jitter, maxDelayMs);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(lastError, attempt, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed');
}

/**
 * Executes a function with retry logic and returns a result object instead of throwing.
 *
 * @param fn The async function to execute
 * @param options Configuration options for retry behavior
 * @returns A result object containing success status, data/error, and attempt count
 *
 * @example
 * ```typescript
 * const result = await withRetrySafe(
 *   () => fetchDataFromAPI(),
 *   { maxRetries: 3 }
 * );
 *
 * if (result.success) {
 *   console.log("Data:", result.data);
 * } else {
 *   console.error(`Failed after ${result.attempts} attempts:`, result.error);
 * }
 * ```
 */
export async function withRetrySafe<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
    initialDelayMs = DEFAULT_RETRY_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
    backoffMultiplier = DEFAULT_RETRY_OPTIONS.backoffMultiplier,
    isRetryable = () => true,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    attempts = attempt;

    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!isRetryable(error)) {
        return {
          success: false,
          error: lastError,
          attempts,
        };
      }

      // If this was the last attempt, return failure
      if (attempt >= maxRetries) {
        return {
          success: false,
          error: lastError,
          attempts,
        };
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      const jitter = Math.random() * 0.1 * baseDelay;
      const delay = Math.min(baseDelay + jitter, maxDelayMs);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(lastError, attempt, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts,
  };
}

/**
 * Sleep helper function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Common error type checkers for Google API errors
 */
export const GoogleAPIErrorCheckers = {
  /**
   * Checks if an error is a rate limit error (HTTP 429)
   */
  isRateLimitError(error: unknown): boolean {
    const apiError = error as { code?: number; status?: number };
    return apiError.code === 429 || apiError.status === 429;
  },

  /**
   * Checks if an error is a server error (HTTP 5xx)
   */
  isServerError(error: unknown): boolean {
    const apiError = error as { code?: number; status?: number };
    const code = apiError.code ?? apiError.status ?? 0;
    return code >= 500 && code < 600;
  },

  /**
   * Checks if an error is a network/connection error
   */
  isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('socket hang up') ||
        message.includes('dns')
      );
    }
    return false;
  },

  /**
   * Checks if an error is a quota exceeded error
   */
  isQuotaExceededError(error: unknown): boolean {
    const apiError = error as { code?: number; message?: string };
    if (apiError.code === 403) {
      const message = apiError.message?.toLowerCase() ?? '';
      return (
        message.includes('quota') ||
        message.includes('rate limit') ||
        message.includes('user rate limit')
      );
    }
    return false;
  },

  /**
   * Checks if an error is an authentication error (not retryable)
   */
  isAuthError(error: unknown): boolean {
    const apiError = error as { code?: number };
    return apiError.code === 401;
  },

  /**
   * Checks if an error is a permission error (not retryable)
   */
  isPermissionError(error: unknown): boolean {
    const apiError = error as { code?: number; message?: string };
    if (apiError.code === 403) {
      const message = apiError.message?.toLowerCase() ?? '';
      // Permission errors (not quota) are not retryable
      return !this.isQuotaExceededError(error) && message.includes('permission');
    }
    return false;
  },

  /**
   * Combined check for transient (retryable) errors
   */
  isTransientError(error: unknown): boolean {
    return (
      this.isRateLimitError(error) ||
      this.isServerError(error) ||
      this.isNetworkError(error) ||
      this.isQuotaExceededError(error)
    );
  },

  /**
   * Combined check for non-retryable errors
   */
  isNonRetryableError(error: unknown): boolean {
    return this.isAuthError(error) || this.isPermissionError(error);
  },
};

/**
 * Creates a retryable function checker for Google API operations.
 * This checker allows retrying transient errors while immediately failing on auth/permission errors.
 */
export function createGoogleAPIRetryChecker(): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    // Never retry auth or permission errors
    if (GoogleAPIErrorCheckers.isNonRetryableError(error)) {
      return false;
    }

    // Retry transient errors
    if (GoogleAPIErrorCheckers.isTransientError(error)) {
      return true;
    }

    // For unknown errors, default to retrying
    // This provides resilience against unexpected transient issues
    return true;
  };
}

/**
 * Creates an onRetry callback that logs retry attempts
 */
export function createRetryLogger(
  serviceName: string
): (error: unknown, attempt: number, delayMs: number) => void {
  return (error: unknown, attempt: number, delayMs: number) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(
      `[${serviceName}] Retry attempt ${attempt} after ${Math.round(delayMs)}ms due to: ${errorMessage}`
    );
  };
}

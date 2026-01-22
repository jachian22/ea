/**
 * Retry utility for handling transient failures with exponential backoff.
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

  throw lastError || new Error('Retry failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Common error type checkers for Google API errors
 */
export const GoogleAPIErrorCheckers = {
  isRateLimitError(error: unknown): boolean {
    const apiError = error as { code?: number; status?: number };
    return apiError.code === 429 || apiError.status === 429;
  },

  isServerError(error: unknown): boolean {
    const apiError = error as { code?: number; status?: number };
    const code = apiError.code ?? apiError.status ?? 0;
    return code >= 500 && code < 600;
  },

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

  isAuthError(error: unknown): boolean {
    const apiError = error as { code?: number };
    return apiError.code === 401;
  },

  isPermissionError(error: unknown): boolean {
    const apiError = error as { code?: number; message?: string };
    if (apiError.code === 403) {
      const message = apiError.message?.toLowerCase() ?? '';
      return !this.isQuotaExceededError(error) && message.includes('permission');
    }
    return false;
  },

  isTransientError(error: unknown): boolean {
    return (
      this.isRateLimitError(error) ||
      this.isServerError(error) ||
      this.isNetworkError(error) ||
      this.isQuotaExceededError(error)
    );
  },

  isNonRetryableError(error: unknown): boolean {
    return this.isAuthError(error) || this.isPermissionError(error);
  },
};

/**
 * Creates a retryable function checker for Google API operations.
 */
export function createGoogleAPIRetryChecker(): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (GoogleAPIErrorCheckers.isNonRetryableError(error)) {
      return false;
    }
    if (GoogleAPIErrorCheckers.isTransientError(error)) {
      return true;
    }
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

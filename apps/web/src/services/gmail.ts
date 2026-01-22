import { google, type gmail_v1 } from 'googleapis';
import type { Auth } from 'googleapis';
import type { EmailData, GoogleIntegration } from '~/db/schema';
import {
  createAuthenticatedClient,
  GoogleAuthError,
  GoogleAuthErrorCodes,
  isIntegrationValid,
} from '~/lib/google-client';
import {
  withRetry,
  createGoogleAPIRetryChecker,
  createRetryLogger,
  GoogleAPIErrorCheckers,
  type RetryOptions,
} from '~/utils/retry';

/**
 * Configuration options for fetching emails
 */
export interface FetchEmailsOptions {
  /** Maximum number of emails to fetch (default: 50) */
  maxResults?: number;
  /** Hours to look back for emails (default: 24) */
  hoursBack?: number;
  /** Labels to include (default: ['INBOX']) */
  labelIds?: string[];
  /** Retry configuration (default: 3 retries with exponential backoff) */
  retryOptions?: RetryOptions;
}

/**
 * Raw email data from Gmail API before transformation
 */
interface GmailMessageMetadata {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: gmail_v1.Schema$MessagePart;
  internalDate: string;
}

/**
 * Default retry options for Gmail API calls
 */
const DEFAULT_GMAIL_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  isRetryable: createGoogleAPIRetryChecker(),
  onRetry: createRetryLogger('GmailService'),
};

/**
 * Gmail API service for fetching and processing emails.
 *
 * This service handles:
 * - Fetching emails from the past 24 hours (or configured time range)
 * - Parsing email headers and metadata
 * - Transforming Gmail API responses to our EmailData format
 * - Automatic retry with exponential backoff for transient failures
 * - Proper error handling for different failure types
 */
export class GmailService {
  private gmail: gmail_v1.Gmail;
  private userEmail: string;
  private retryOptions: RetryOptions;

  constructor(auth: Auth.OAuth2Client, userEmail: string, retryOptions: RetryOptions = {}) {
    this.gmail = google.gmail({ version: 'v1', auth });
    this.userEmail = userEmail;
    this.retryOptions = { ...DEFAULT_GMAIL_RETRY_OPTIONS, ...retryOptions };
  }

  /**
   * Creates a GmailService instance from a user's Google integration.
   *
   * @param integration The user's Google integration record
   * @param retryOptions Optional retry configuration
   * @returns A configured GmailService instance
   * @throws GoogleAuthError if the integration is invalid or token refresh fails
   */
  static async fromIntegration(
    integration: GoogleIntegration,
    retryOptions?: RetryOptions
  ): Promise<GmailService> {
    if (!isIntegrationValid(integration)) {
      throw new GoogleAuthError(
        'Google integration is not valid or connected',
        GoogleAuthErrorCodes.INTEGRATION_DISCONNECTED
      );
    }

    const authClient = await createAuthenticatedClient(integration);
    return new GmailService(authClient, integration.googleEmail, retryOptions);
  }

  /**
   * Fetches emails from the past 24 hours (or configured time range).
   *
   * Implements retry logic with exponential backoff for transient failures.
   * Rate limit errors (429) and server errors (5xx) are automatically retried.
   * Authentication and permission errors are not retried.
   *
   * @param options Configuration options for fetching emails
   * @returns Array of EmailData objects
   * @throws GoogleAuthError for authentication or API errors
   */
  async fetchRecentEmails(options: FetchEmailsOptions = {}): Promise<EmailData[]> {
    const { maxResults = 50, hoursBack = 24, labelIds = ['INBOX'], retryOptions } = options;

    // Merge retry options
    const effectiveRetryOptions = { ...this.retryOptions, ...retryOptions };

    // Calculate the timestamp for the time range
    const afterDate = new Date();
    afterDate.setHours(afterDate.getHours() - hoursBack);
    const afterTimestamp = Math.floor(afterDate.getTime() / 1000);

    // Build the Gmail search query
    const query = `after:${afterTimestamp}`;

    try {
      // List messages matching the query with retry logic
      const listResponse = await withRetry(async () => {
        return this.gmail.users.messages.list({
          userId: 'me',
          q: query,
          labelIds,
          maxResults,
        });
      }, effectiveRetryOptions);

      const messages = listResponse.data.messages || [];

      if (messages.length === 0) {
        return [];
      }

      // Fetch full details for each message with individual retry logic
      const emailPromises = messages.map((msg) =>
        this.fetchMessageDetailsWithRetry(msg.id!, effectiveRetryOptions)
      );

      const emails = await Promise.all(emailPromises);

      // Filter out any null results (failed fetches after retries)
      return emails.filter((email): email is EmailData => email !== null);
    } catch (error) {
      throw this.handleGmailError(error);
    }
  }

  /**
   * Fetches detailed information for a single message with retry logic.
   *
   * @param messageId The Gmail message ID
   * @param retryOptions Retry configuration options
   * @returns EmailData object or null if fetch failed after all retries
   */
  private async fetchMessageDetailsWithRetry(
    messageId: string,
    retryOptions: RetryOptions
  ): Promise<EmailData | null> {
    try {
      const response = await withRetry(
        async () => {
          return this.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          });
        },
        {
          ...retryOptions,
          onRetry: (error, attempt, delayMs) => {
            console.warn(
              `[GmailService] Retrying message ${messageId} (attempt ${attempt}) after ${Math.round(delayMs)}ms`
            );
          },
        }
      );

      const message = response.data as GmailMessageMetadata;
      return this.transformToEmailData(message);
    } catch (error) {
      // Log the error but return null to allow other messages to be processed
      const errorInfo = this.getErrorInfo(error);
      console.error(
        `[GmailService] Failed to fetch message ${messageId} after retries: ${errorInfo.message} (code: ${errorInfo.code})`
      );
      return null;
    }
  }

  /**
   * Fetches detailed information for a single message.
   *
   * @param messageId The Gmail message ID
   * @returns EmailData object or null if fetch failed
   * @deprecated Use fetchMessageDetailsWithRetry for better resilience
   */
  private async fetchMessageDetails(messageId: string): Promise<EmailData | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const message = response.data as GmailMessageMetadata;
      return this.transformToEmailData(message);
    } catch (error) {
      console.error(`Failed to fetch message ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Extracts error information from an unknown error.
   *
   * @param error The error to extract information from
   * @returns Object with error code and message
   */
  private getErrorInfo(error: unknown): { code: number | string; message: string } {
    if (error instanceof GoogleAuthError) {
      return { code: error.code, message: error.message };
    }

    const apiError = error as { code?: number; message?: string };
    return {
      code: apiError.code ?? 'UNKNOWN',
      message: apiError.message ?? 'Unknown error',
    };
  }

  /**
   * Transforms a Gmail API message to our EmailData format.
   *
   * @param message The raw Gmail message
   * @returns Transformed EmailData object
   */
  private transformToEmailData(message: GmailMessageMetadata): EmailData {
    const headers = message.payload.headers || [];

    const getHeader = (name: string): string => {
      const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    const fromHeader = getHeader('From');
    const toHeader = getHeader('To');
    const subject = getHeader('Subject');
    const dateHeader = getHeader('Date');

    // Parse the 'From' header into email and name
    const from = this.parseEmailAddress(fromHeader);

    // Parse the 'To' header into an array of recipients
    const to = this.parseEmailAddresses(toHeader);

    // Check if the email is unread
    const isRead = !message.labelIds.includes('UNREAD');

    // Get meaningful labels (filter out internal Gmail labels)
    const labels = this.getReadableLabels(message.labelIds);

    // Determine importance based on labels and sender
    const importance = this.determineImportance(message.labelIds, from.email);

    // Determine action status based on email characteristics
    const actionStatus = this.determineActionStatus(message.labelIds, from.email, to);

    return {
      id: message.id,
      threadId: message.threadId,
      subject: subject || '(No Subject)',
      from,
      to,
      snippet: message.snippet || '',
      receivedAt: dateHeader
        ? new Date(dateHeader).toISOString()
        : new Date(parseInt(message.internalDate)).toISOString(),
      isRead,
      labels,
      importance,
      actionStatus,
    };
  }

  /**
   * Parses an email address header into email and name components.
   *
   * @param header The raw header value (e.g., "John Doe <john@example.com>")
   * @returns Object with email and optional name
   */
  private parseEmailAddress(header: string): { email: string; name?: string } {
    if (!header) {
      return { email: '' };
    }

    // Match "Name <email>" format
    const match = header.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/);

    if (match) {
      const name = match[1]?.trim();
      const email = match[2]?.trim() || '';
      return name ? { email, name } : { email };
    }

    // Fallback: treat the whole string as an email
    return { email: header.trim() };
  }

  /**
   * Parses multiple email addresses from a header.
   *
   * @param header The raw header value with comma-separated addresses
   * @returns Array of parsed email addresses
   */
  private parseEmailAddresses(header: string): { email: string; name?: string }[] {
    if (!header) {
      return [];
    }

    // Split by comma, but be careful of commas inside quotes
    const addresses: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of header) {
      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === ',' && !inQuotes) {
        if (current.trim()) {
          addresses.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      addresses.push(current.trim());
    }

    return addresses.map((addr) => this.parseEmailAddress(addr));
  }

  /**
   * Filters Gmail labels to only include user-readable ones.
   *
   * @param labelIds Array of Gmail label IDs
   * @returns Array of readable label names
   */
  private getReadableLabels(labelIds: string[]): string[] {
    // Gmail system labels to exclude
    const systemLabels = new Set([
      'INBOX',
      'UNREAD',
      'CATEGORY_PERSONAL',
      'CATEGORY_SOCIAL',
      'CATEGORY_PROMOTIONS',
      'CATEGORY_UPDATES',
      'CATEGORY_FORUMS',
    ]);

    return labelIds
      .filter((label) => !systemLabels.has(label))
      .map((label) => {
        // Convert IMPORTANT to a readable format
        if (label === 'IMPORTANT') return 'Important';
        if (label === 'STARRED') return 'Starred';
        if (label === 'SENT') return 'Sent';
        if (label === 'DRAFT') return 'Draft';
        // Remove Label_ prefix from custom labels
        return label.replace(/^Label_/, '');
      });
  }

  /**
   * Determines the importance level of an email.
   * This is a rule-based determination that can be enhanced with AI later.
   *
   * @param labelIds Array of Gmail label IDs
   * @param fromEmail The sender's email address
   * @returns Importance level: "high", "medium", or "low"
   */
  private determineImportance(labelIds: string[], fromEmail: string): 'high' | 'medium' | 'low' {
    // High importance indicators
    if (labelIds.includes('IMPORTANT') || labelIds.includes('STARRED')) {
      return 'high';
    }

    // Low importance indicators (promotional/social)
    if (labelIds.includes('CATEGORY_PROMOTIONS') || labelIds.includes('CATEGORY_SOCIAL')) {
      return 'low';
    }

    // Check for common no-reply addresses
    const lowerEmail = fromEmail.toLowerCase();
    if (
      lowerEmail.includes('noreply') ||
      lowerEmail.includes('no-reply') ||
      lowerEmail.includes('notifications') ||
      lowerEmail.includes('mailer-daemon')
    ) {
      return 'low';
    }

    // Default to medium importance
    return 'medium';
  }

  /**
   * Determines the action status of an email.
   * This is a rule-based determination that can be enhanced with AI later.
   *
   * @param labelIds Array of Gmail label IDs
   * @param fromEmail The sender's email address
   * @param to Array of recipient email addresses
   * @returns Action status
   */
  private determineActionStatus(
    labelIds: string[],
    fromEmail: string,
    to: { email: string; name?: string }[]
  ): 'needs_response' | 'awaiting_reply' | 'fyi' | 'none' {
    const isUnread = labelIds.includes('UNREAD');
    const isSent = labelIds.includes('SENT');

    // If it's a sent email, we might be awaiting a reply
    if (isSent) {
      return 'awaiting_reply';
    }

    // Check for automated/no-reply senders
    const lowerEmail = fromEmail.toLowerCase();
    if (
      lowerEmail.includes('noreply') ||
      lowerEmail.includes('no-reply') ||
      lowerEmail.includes('notifications') ||
      lowerEmail.includes('mailer-daemon')
    ) {
      return 'fyi';
    }

    // If addressed directly to the user and unread, likely needs response
    const isDirectlyAddressed = to.some(
      (recipient) => recipient.email.toLowerCase() === this.userEmail.toLowerCase()
    );

    if (isUnread && isDirectlyAddressed) {
      return 'needs_response';
    }

    // Promotional/social emails are FYI
    if (
      labelIds.includes('CATEGORY_PROMOTIONS') ||
      labelIds.includes('CATEGORY_SOCIAL') ||
      labelIds.includes('CATEGORY_UPDATES')
    ) {
      return 'fyi';
    }

    // Default for unread personal emails
    if (isUnread) {
      return 'needs_response';
    }

    return 'none';
  }

  /**
   * Handles Gmail API errors and converts them to GoogleAuthError.
   *
   * Provides specific error handling for:
   * - Authentication errors (401): User needs to reconnect
   * - Permission errors (403): Check scopes/permissions
   * - Rate limit errors (429): Temporary, but all retries exhausted
   * - Server errors (5xx): Google service issues
   * - Not found errors (404): Resource doesn't exist
   * - Quota exceeded: User/project quota limits
   *
   * @param error The caught error
   * @returns A GoogleAuthError with appropriate code and message
   */
  private handleGmailError(error: unknown): GoogleAuthError {
    if (error instanceof GoogleAuthError) {
      return error;
    }

    // Check for specific Google API errors
    const apiError = error as {
      code?: number;
      message?: string;
      errors?: Array<{ reason?: string }>;
    };

    // Authentication failed (401)
    if (apiError.code === 401) {
      return new GoogleAuthError(
        'Gmail authentication failed. Please reconnect your Google account.',
        GoogleAuthErrorCodes.INVALID_CREDENTIALS,
        error
      );
    }

    // Permission denied (403) - could be various reasons
    if (apiError.code === 403) {
      // Check if it's a quota/rate limit issue vs permission issue
      if (GoogleAPIErrorCheckers.isQuotaExceededError(error)) {
        return new GoogleAuthError(
          'Gmail API quota exceeded. Please try again later.',
          GoogleAuthErrorCodes.API_ERROR,
          error
        );
      }

      return new GoogleAuthError(
        'Access to Gmail was denied. Please check your permissions and reconnect your Google account.',
        GoogleAuthErrorCodes.INVALID_CREDENTIALS,
        error
      );
    }

    // Not found (404)
    if (apiError.code === 404) {
      return new GoogleAuthError(
        'Requested Gmail resource not found.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    // Rate limited (429)
    if (apiError.code === 429) {
      return new GoogleAuthError(
        'Gmail API rate limit exceeded. Please try again in a few minutes.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    // Server errors (5xx)
    if (apiError.code && apiError.code >= 500 && apiError.code < 600) {
      return new GoogleAuthError(
        `Gmail service temporarily unavailable (${apiError.code}). Please try again later.`,
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    // Network errors
    if (GoogleAPIErrorCheckers.isNetworkError(error)) {
      return new GoogleAuthError(
        'Network error while connecting to Gmail. Please check your connection and try again.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    // Generic API error
    return new GoogleAuthError(
      `Gmail API error: ${apiError.message || 'Unknown error'}`,
      GoogleAuthErrorCodes.API_ERROR,
      error
    );
  }
}

/**
 * Convenience function to fetch recent emails for a user.
 *
 * Includes automatic retry with exponential backoff for transient failures.
 *
 * @param integration The user's Google integration
 * @param options Optional fetch configuration (including retry options)
 * @returns Array of EmailData objects
 * @throws GoogleAuthError for authentication or API errors
 */
export async function fetchUserEmails(
  integration: GoogleIntegration,
  options?: FetchEmailsOptions
): Promise<EmailData[]> {
  const gmailService = await GmailService.fromIntegration(integration, options?.retryOptions);
  return gmailService.fetchRecentEmails(options);
}

/**
 * Fetches emails from the past 24 hours for a user's daily brief.
 *
 * Includes automatic retry with exponential backoff for transient failures.
 * Default configuration:
 * - Max 50 emails
 * - Past 24 hours
 * - INBOX only
 * - Up to 3 retries with exponential backoff
 *
 * @param integration The user's Google integration
 * @param retryOptions Optional retry configuration override
 * @returns Array of EmailData objects from the past 24 hours
 * @throws GoogleAuthError for authentication or API errors
 */
export async function fetchEmailsForDailyBrief(
  integration: GoogleIntegration,
  retryOptions?: RetryOptions
): Promise<EmailData[]> {
  return fetchUserEmails(integration, {
    maxResults: 50,
    hoursBack: 24,
    labelIds: ['INBOX'],
    retryOptions,
  });
}

// Re-export retry utilities for consumers who want to customize retry behavior
export { type RetryOptions } from '~/utils/retry';

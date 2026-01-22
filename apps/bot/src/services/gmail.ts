/**
 * Gmail API service for fetching and processing emails.
 */

import { google, type gmail_v1 } from 'googleapis';
import type { Auth } from 'googleapis';
import type { EmailData, GoogleIntegration } from '../db/schema.js';
import {
  createAuthenticatedClient,
  GoogleAuthError,
  GoogleAuthErrorCodes,
  isIntegrationValid,
} from './google-client.js';
import {
  withRetry,
  createGoogleAPIRetryChecker,
  createRetryLogger,
  GoogleAPIErrorCheckers,
  type RetryOptions,
} from '../utils/retry.js';

/**
 * Configuration options for fetching emails
 */
export interface FetchEmailsOptions {
  maxResults?: number;
  hoursBack?: number;
  labelIds?: string[];
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
 * Maximum concurrent Gmail API requests to prevent overwhelming the API
 */
const MAX_CONCURRENT_GMAIL_REQUESTS = 5;

/**
 * Processes items in batches with limited concurrency
 */
async function processInBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  maxConcurrency: number
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += maxConcurrency) {
    const batch = items.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Gmail API service for fetching and processing emails.
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
   */
  static async fromIntegration(integration: GoogleIntegration, retryOptions?: RetryOptions): Promise<GmailService> {
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
   */
  async fetchRecentEmails(options: FetchEmailsOptions = {}): Promise<EmailData[]> {
    const { maxResults = 50, hoursBack = 24, labelIds = ['INBOX'], retryOptions } = options;

    const effectiveRetryOptions = { ...this.retryOptions, ...retryOptions };

    // Calculate the timestamp for the time range
    const afterDate = new Date();
    afterDate.setHours(afterDate.getHours() - hoursBack);
    const afterTimestamp = Math.floor(afterDate.getTime() / 1000);

    const query = `after:${afterTimestamp}`;

    try {
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

      // Process messages in batches to prevent overwhelming the API
      const emails = await processInBatches(
        messages,
        (msg) => this.fetchMessageDetailsWithRetry(msg.id!, effectiveRetryOptions),
        MAX_CONCURRENT_GMAIL_REQUESTS
      );

      return emails.filter((email): email is EmailData => email !== null);
    } catch (error) {
      throw this.handleGmailError(error);
    }
  }

  private async fetchMessageDetailsWithRetry(messageId: string, retryOptions: RetryOptions): Promise<EmailData | null> {
    try {
      const response = await withRetry(async () => {
        return this.gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        });
      }, retryOptions);

      const message = response.data as GmailMessageMetadata;
      return this.transformToEmailData(message);
    } catch (error) {
      const errorInfo = this.getErrorInfo(error);
      console.error(
        `[GmailService] Failed to fetch message ${messageId} after retries: ${errorInfo.message} (code: ${errorInfo.code})`
      );
      return null;
    }
  }

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

    const from = this.parseEmailAddress(fromHeader);
    const to = this.parseEmailAddresses(toHeader);
    const isRead = !message.labelIds.includes('UNREAD');
    const labels = this.getReadableLabels(message.labelIds);
    const importance = this.determineImportance(message.labelIds, from.email);
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

  private parseEmailAddress(header: string): { email: string; name?: string } {
    if (!header) {
      return { email: '' };
    }

    const match = header.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/);

    if (match) {
      const name = match[1]?.trim();
      const email = match[2]?.trim() || '';
      return name ? { email, name } : { email };
    }

    return { email: header.trim() };
  }

  private parseEmailAddresses(header: string): { email: string; name?: string }[] {
    if (!header) {
      return [];
    }

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

  private getReadableLabels(labelIds: string[]): string[] {
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
        if (label === 'IMPORTANT') return 'Important';
        if (label === 'STARRED') return 'Starred';
        if (label === 'SENT') return 'Sent';
        if (label === 'DRAFT') return 'Draft';
        return label.replace(/^Label_/, '');
      });
  }

  private determineImportance(labelIds: string[], fromEmail: string): 'high' | 'medium' | 'low' {
    if (labelIds.includes('IMPORTANT') || labelIds.includes('STARRED')) {
      return 'high';
    }

    if (labelIds.includes('CATEGORY_PROMOTIONS') || labelIds.includes('CATEGORY_SOCIAL')) {
      return 'low';
    }

    const lowerEmail = fromEmail.toLowerCase();
    if (
      lowerEmail.includes('noreply') ||
      lowerEmail.includes('no-reply') ||
      lowerEmail.includes('notifications') ||
      lowerEmail.includes('mailer-daemon')
    ) {
      return 'low';
    }

    return 'medium';
  }

  private determineActionStatus(
    labelIds: string[],
    fromEmail: string,
    to: { email: string; name?: string }[]
  ): 'needs_response' | 'awaiting_reply' | 'fyi' | 'none' {
    const isUnread = labelIds.includes('UNREAD');
    const isSent = labelIds.includes('SENT');

    if (isSent) {
      return 'awaiting_reply';
    }

    const lowerEmail = fromEmail.toLowerCase();
    if (
      lowerEmail.includes('noreply') ||
      lowerEmail.includes('no-reply') ||
      lowerEmail.includes('notifications') ||
      lowerEmail.includes('mailer-daemon')
    ) {
      return 'fyi';
    }

    const isDirectlyAddressed = to.some(
      (recipient) => recipient.email.toLowerCase() === this.userEmail.toLowerCase()
    );

    if (isUnread && isDirectlyAddressed) {
      return 'needs_response';
    }

    if (
      labelIds.includes('CATEGORY_PROMOTIONS') ||
      labelIds.includes('CATEGORY_SOCIAL') ||
      labelIds.includes('CATEGORY_UPDATES')
    ) {
      return 'fyi';
    }

    if (isUnread) {
      return 'needs_response';
    }

    return 'none';
  }

  private handleGmailError(error: unknown): GoogleAuthError {
    if (error instanceof GoogleAuthError) {
      return error;
    }

    const apiError = error as { code?: number; message?: string };

    if (apiError.code === 401) {
      return new GoogleAuthError(
        'Gmail authentication failed. Please reconnect your Google account.',
        GoogleAuthErrorCodes.INVALID_CREDENTIALS,
        error
      );
    }

    if (apiError.code === 403) {
      if (GoogleAPIErrorCheckers.isQuotaExceededError(error)) {
        return new GoogleAuthError('Gmail API quota exceeded. Please try again later.', GoogleAuthErrorCodes.API_ERROR, error);
      }
      return new GoogleAuthError(
        'Access to Gmail was denied. Please check your permissions.',
        GoogleAuthErrorCodes.INVALID_CREDENTIALS,
        error
      );
    }

    if (apiError.code === 429) {
      return new GoogleAuthError(
        'Gmail API rate limit exceeded. Please try again in a few minutes.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    if (apiError.code && apiError.code >= 500 && apiError.code < 600) {
      return new GoogleAuthError(
        `Gmail service temporarily unavailable (${apiError.code}).`,
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    if (GoogleAPIErrorCheckers.isNetworkError(error)) {
      return new GoogleAuthError(
        'Network error while connecting to Gmail.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    return new GoogleAuthError(
      `Gmail API error: ${apiError.message || 'Unknown error'}`,
      GoogleAuthErrorCodes.API_ERROR,
      error
    );
  }
}

/**
 * Convenience function to fetch recent emails for a user.
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

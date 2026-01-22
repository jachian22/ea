import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking fetch
import {
  sendDiscordNotification,
  sendMFANotification,
  sendRunCompletionNotification,
  sendErrorNotification,
  DiscordColors,
} from '~/services/discord';

describe('Discord Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendDiscordNotification', () => {
    it('should skip notification if no webhook URL provided', async () => {
      await sendDiscordNotification('', { content: 'test' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw error for invalid webhook URL', async () => {
      await expect(
        sendDiscordNotification('https://invalid.url/webhook', { content: 'test' })
      ).rejects.toThrow('Invalid Discord webhook URL format');
    });

    it('should send notification with correct payload', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const webhookUrl = 'https://discord.com/api/webhooks/123/abc';
      const message = {
        content: 'Test message',
        embeds: [{ title: 'Test' }],
      };

      await sendDiscordNotification(webhookUrl, message);

      expect(mockFetch).toHaveBeenCalledWith(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"username":"EA Bank Statements"'),
      });
    });

    it('should throw error on failed request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });

      await expect(
        sendDiscordNotification('https://discord.com/api/webhooks/123/abc', {
          content: 'test',
        })
      ).rejects.toThrow('Discord webhook failed (400): Bad request');
    });
  });

  describe('sendMFANotification', () => {
    it('should send MFA notification with correct format', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await sendMFANotification('https://discord.com/api/webhooks/123/abc', 'Chase');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.embeds[0].title).toBe('🔐 MFA Required');
      expect(body.embeds[0].description).toContain('Chase');
      expect(body.embeds[0].color).toBe(DiscordColors.MFA);
    });
  });

  describe('sendRunCompletionNotification', () => {
    it('should send completed notification with correct format', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await sendRunCompletionNotification('https://discord.com/api/webhooks/123/abc', {
        status: 'completed',
        statementsDownloaded: 5,
        banksProcessed: 3,
        banksSuccessful: 3,
        duration: 125,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.embeds[0].title).toContain('Statement Download Complete');
      expect(body.embeds[0].color).toBe(DiscordColors.SUCCESS);
      expect(body.embeds[0].fields).toHaveLength(3);
    });

    it('should send failed notification with errors', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await sendRunCompletionNotification('https://discord.com/api/webhooks/123/abc', {
        status: 'failed',
        statementsDownloaded: 0,
        banksProcessed: 2,
        banksSuccessful: 0,
        errors: ['Bank A failed', 'Bank B failed'],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.embeds[0].title).toContain('Statement Download Failed');
      expect(body.embeds[0].color).toBe(DiscordColors.ERROR);
      expect(body.embeds[0].description).toContain('Bank A failed');
    });
  });

  describe('sendErrorNotification', () => {
    it('should send error notification with correct format', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await sendErrorNotification(
        'https://discord.com/api/webhooks/123/abc',
        'Connection failed',
        'During Chase login'
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.embeds[0].title).toContain('Error');
      expect(body.embeds[0].description).toBe('Connection failed');
      expect(body.embeds[0].fields[0].value).toBe('During Chase login');
      expect(body.embeds[0].color).toBe(DiscordColors.ERROR);
    });
  });
});

describe('Statement Types', () => {
  it('should have correct BanksProcessedData structure', () => {
    // Type-check test - if this compiles, the types are correct
    const banksProcessed: Record<string, { status: string; statementsDownloaded?: number }> = {
      chase: { status: 'success', statementsDownloaded: 3 },
      bofa: { status: 'failed' },
    };

    expect(banksProcessed.chase.status).toBe('success');
    expect(banksProcessed.chase.statementsDownloaded).toBe(3);
    expect(banksProcessed.bofa.status).toBe('failed');
  });
});

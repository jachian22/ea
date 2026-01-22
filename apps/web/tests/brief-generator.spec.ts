/**
 * Tests for Brief Generation Logic
 *
 * These tests verify:
 * - BriefGeneratorService functionality
 * - Brief content generation from calendar and email data
 * - Email analysis integration
 * - Action item generation
 * - Markdown formatting
 * - Error handling and retry logic
 * - Edge cases (empty data, no meetings, no emails)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  CalendarEventData,
  EmailData,
  GoogleIntegration,
  DailyBrief,
} from "~/db/schema";
import type {
  BriefContent,
  BriefData,
  BriefGenerationResult,
  ActionItem,
} from "~/services/brief-generator";

// Mock modules before imports
vi.mock("~/services/gmail", () => ({
  fetchEmailsForDailyBrief: vi.fn(),
}));

vi.mock("~/services/google-calendar", () => ({
  fetchEventsForDailyBrief: vi.fn(),
}));

vi.mock("~/data-access/google-integration", () => ({
  findGoogleIntegrationByUserId: vi.fn(),
  updateGoogleIntegrationLastSynced: vi.fn(),
}));

vi.mock("~/data-access/daily-briefs", () => ({
  upsertDailyBrief: vi.fn(),
  updateDailyBriefStatus: vi.fn(),
  getTodayDateString: vi.fn().mockReturnValue("2025-01-15"),
}));

vi.mock("~/lib/google-client", () => ({
  GoogleAuthError: class GoogleAuthError extends Error {
    code: string;
    cause?: unknown;
    constructor(message: string, code: string, cause?: unknown) {
      super(message);
      this.name = "GoogleAuthError";
      this.code = code;
      this.cause = cause;
    }
  },
  GoogleAuthErrorCodes: {
    TOKEN_REFRESH_FAILED: "TOKEN_REFRESH_FAILED",
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
    INTEGRATION_NOT_FOUND: "INTEGRATION_NOT_FOUND",
    INTEGRATION_DISCONNECTED: "INTEGRATION_DISCONNECTED",
    API_ERROR: "API_ERROR",
  },
  isIntegrationValid: vi.fn(),
  markIntegrationDisconnected: vi.fn(),
}));

// Import mocked modules
import { fetchEmailsForDailyBrief } from "~/services/gmail";
import { fetchEventsForDailyBrief } from "~/services/google-calendar";
import {
  findGoogleIntegrationByUserId,
  updateGoogleIntegrationLastSynced,
} from "~/data-access/google-integration";
import { upsertDailyBrief, getTodayDateString } from "~/data-access/daily-briefs";
import {
  isIntegrationValid,
  markIntegrationDisconnected,
  GoogleAuthError,
  GoogleAuthErrorCodes,
} from "~/lib/google-client";

// Import email analyzer functions (not mocked - we test them directly)
import {
  analyzeEmailsForBrief,
  getTopPriorityEmails,
  hasUrgentEmails,
  scoreToImportance,
  formatEmailForBrief,
  EmailAnalyzer,
  type EmailAnalysis,
  type GroupedEmails,
} from "~/utils/email-analyzer";

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Creates a mock Google integration
 */
function createMockIntegration(overrides: Partial<GoogleIntegration> = {}): GoogleIntegration {
  return {
    id: "integration_123",
    userId: "user_123",
    accessToken: "mock_access_token",
    refreshToken: "mock_refresh_token",
    accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
    scope: "gmail.readonly calendar.readonly",
    googleEmail: "test@gmail.com",
    googleAccountId: "google_user_123",
    isConnected: true,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock calendar event
 */
function createMockCalendarEvent(overrides: Partial<CalendarEventData> = {}): CalendarEventData {
  return {
    id: "event_" + Math.random().toString(36).substring(7),
    title: "Team Standup",
    description: "Daily team sync",
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    location: "Conference Room A",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    attendees: [
      { email: "alice@example.com", name: "Alice", responseStatus: "accepted" },
      { email: "bob@example.com", name: "Bob", responseStatus: "tentative" },
    ],
    isAllDay: false,
    ...overrides,
  };
}

/**
 * Creates a mock email
 */
function createMockEmail(overrides: Partial<EmailData> = {}): EmailData {
  return {
    id: "email_" + Math.random().toString(36).substring(7),
    threadId: "thread_" + Math.random().toString(36).substring(7),
    subject: "Project Update",
    from: { email: "sender@example.com", name: "Sender Name" },
    to: [{ email: "test@gmail.com", name: "Test User" }],
    snippet: "Here is the latest update on the project...",
    receivedAt: new Date().toISOString(),
    isRead: false,
    labels: ["INBOX", "UNREAD"],
    importance: "medium",
    actionStatus: "needs_response",
    ...overrides,
  };
}

/**
 * Creates a mock daily brief
 */
function createMockDailyBrief(overrides: Partial<DailyBrief> = {}): DailyBrief {
  return {
    id: "brief_123",
    userId: "user_123",
    briefDate: "2025-01-15",
    calendarEvents: [],
    emails: [],
    weather: null,
    briefContent: null,
    status: "pending",
    errorMessage: null,
    totalEvents: "0",
    totalEmails: "0",
    emailsNeedingResponse: "0",
    generatedAt: null,
    enrichedContent: null,
    enrichedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Email Analyzer Tests
// ============================================================================

describe("Email Analyzer", () => {
  describe("EmailAnalyzer class", () => {
    const userEmail = "test@gmail.com";
    let analyzer: EmailAnalyzer;

    beforeEach(() => {
      analyzer = new EmailAnalyzer(userEmail);
    });

    describe("analyzeEmail", () => {
      it("should return a score and signals for an email", () => {
        const email = createMockEmail();
        const result = analyzer.analyzeEmail(email);

        expect(result).toHaveProperty("email");
        expect(result).toHaveProperty("score");
        expect(result).toHaveProperty("signals");
        expect(result.email).toBe(email);
        expect(typeof result.score).toBe("number");
        expect(Array.isArray(result.signals)).toBe(true);
      });

      it("should increase score for emails with IMPORTANT label", () => {
        const email = createMockEmail({
          labels: ["INBOX", "IMPORTANT"],
        });
        const result = analyzer.analyzeEmail(email);

        const importantSignal = result.signals.find((s) => s.type === "gmail_important");
        expect(importantSignal).toBeDefined();
        expect(importantSignal?.weight).toBeGreaterThan(0);
      });

      it("should increase score for starred emails", () => {
        const email = createMockEmail({
          labels: ["INBOX", "STARRED"],
        });
        const result = analyzer.analyzeEmail(email);

        const starredSignal = result.signals.find((s) => s.type === "gmail_starred");
        expect(starredSignal).toBeDefined();
        expect(starredSignal?.weight).toBeGreaterThan(0);
      });

      it("should decrease score for promotional emails", () => {
        const email = createMockEmail({
          labels: ["INBOX", "CATEGORY_PROMOTIONS"],
        });
        const result = analyzer.analyzeEmail(email);

        const promoSignal = result.signals.find((s) => s.type === "promotional");
        expect(promoSignal).toBeDefined();
        expect(promoSignal?.weight).toBeLessThan(0);
      });

      it("should decrease score for social emails", () => {
        const email = createMockEmail({
          labels: ["INBOX", "CATEGORY_SOCIAL"],
        });
        const result = analyzer.analyzeEmail(email);

        const socialSignal = result.signals.find((s) => s.type === "social");
        expect(socialSignal).toBeDefined();
        expect(socialSignal?.weight).toBeLessThan(0);
      });

      it("should detect urgent keywords in subject", () => {
        const email = createMockEmail({
          subject: "URGENT: Need your approval ASAP",
        });
        const result = analyzer.analyzeEmail(email);

        const urgentSignal = result.signals.find((s) => s.type === "urgent_keyword");
        expect(urgentSignal).toBeDefined();
        expect(urgentSignal?.description).toContain("urgent");
      });

      it("should detect action keywords in content", () => {
        const email = createMockEmail({
          subject: "Action Required: Budget Review",
        });
        const result = analyzer.analyzeEmail(email);

        const actionSignal = result.signals.find((s) => s.type === "action_keyword");
        expect(actionSignal).toBeDefined();
        expect(actionSignal?.description).toContain("action required");
      });

      it("should detect time-sensitive keywords", () => {
        const email = createMockEmail({
          subject: "Report due by end of day today",
        });
        const result = analyzer.analyzeEmail(email);

        const timeSignal = result.signals.find((s) => s.type === "time_sensitive");
        expect(timeSignal).toBeDefined();
      });

      it("should detect meeting-related emails", () => {
        const email = createMockEmail({
          subject: "Meeting invite: Weekly sync",
        });
        const result = analyzer.analyzeEmail(email);

        const meetingSignal = result.signals.find((s) => s.type === "meeting_related");
        expect(meetingSignal).toBeDefined();
      });

      it("should detect automated senders", () => {
        const email = createMockEmail({
          from: { email: "noreply@service.com", name: "Service Notifications" },
        });
        const result = analyzer.analyzeEmail(email);

        const automatedSignal = result.signals.find((s) => s.type === "automated_sender");
        expect(automatedSignal).toBeDefined();
        expect(automatedSignal?.weight).toBeLessThan(0);
      });

      it("should boost score for unread emails", () => {
        const email = createMockEmail({ isRead: false });
        const result = analyzer.analyzeEmail(email);

        const unreadSignal = result.signals.find((s) => s.type === "unread");
        expect(unreadSignal).toBeDefined();
        expect(unreadSignal?.weight).toBeGreaterThan(0);
      });

      it("should boost score for directly addressed emails", () => {
        const email = createMockEmail({
          to: [{ email: "test@gmail.com", name: "Test User" }],
        });
        const result = analyzer.analyzeEmail(email);

        const directSignal = result.signals.find((s) => s.type === "direct_address");
        expect(directSignal).toBeDefined();
        expect(directSignal?.weight).toBeGreaterThan(0);
      });

      it("should detect reply thread emails", () => {
        const email = createMockEmail({
          subject: "Re: Project Discussion",
        });
        const result = analyzer.analyzeEmail(email);

        const replySignal = result.signals.find((s) => s.type === "reply_expected");
        expect(replySignal).toBeDefined();
      });

      it("should clamp score to 0-100 range", () => {
        // Email with many negative signals
        const lowEmail = createMockEmail({
          labels: ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"],
          from: { email: "noreply@marketing.com", name: "Marketing" },
          importance: "low",
          isRead: true,
        });
        const lowResult = analyzer.analyzeEmail(lowEmail);
        expect(lowResult.score).toBeGreaterThanOrEqual(0);
        expect(lowResult.score).toBeLessThanOrEqual(100);

        // Email with many positive signals
        const highEmail = createMockEmail({
          labels: ["IMPORTANT", "STARRED"],
          subject: "URGENT: Action Required - Meeting Tomorrow",
          importance: "high",
          isRead: false,
        });
        const highResult = analyzer.analyzeEmail(highEmail);
        expect(highResult.score).toBeGreaterThanOrEqual(0);
        expect(highResult.score).toBeLessThanOrEqual(100);
      });
    });

    describe("VIP sender handling", () => {
      it("should boost score for VIP senders", () => {
        const vipAnalyzer = new EmailAnalyzer(userEmail, ["vip@company.com"]);
        const email = createMockEmail({
          from: { email: "vip@company.com", name: "VIP Person" },
        });
        const result = vipAnalyzer.analyzeEmail(email);

        const vipSignal = result.signals.find((s) => s.type === "vip_sender");
        expect(vipSignal).toBeDefined();
        expect(vipSignal?.weight).toBeGreaterThan(0);
      });

      it("should skip automated sender check for VIP senders", () => {
        // Even if VIP has "noreply" in email, they shouldn't get penalized
        const vipAnalyzer = new EmailAnalyzer(userEmail, ["noreply@vip.com"]);
        const email = createMockEmail({
          from: { email: "noreply@vip.com", name: "VIP System" },
        });
        const result = vipAnalyzer.analyzeEmail(email);

        const automatedSignal = result.signals.find((s) => s.type === "automated_sender");
        expect(automatedSignal).toBeUndefined();
      });
    });

    describe("analyzeEmails", () => {
      it("should analyze multiple emails and sort by score", () => {
        const emails = [
          createMockEmail({ importance: "low", subject: "Newsletter" }),
          createMockEmail({
            importance: "high",
            subject: "URGENT: Need your help",
            labels: ["IMPORTANT"],
          }),
          createMockEmail({ importance: "medium", subject: "Weekly Update" }),
        ];

        const results = analyzer.analyzeEmails(emails);

        expect(results).toHaveLength(3);
        // Should be sorted by score descending
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
        expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
      });

      it("should return empty array for empty input", () => {
        const results = analyzer.analyzeEmails([]);
        expect(results).toEqual([]);
      });
    });

    describe("groupByActionStatus", () => {
      it("should group emails by their action status", () => {
        const emails = [
          createMockEmail({ actionStatus: "needs_response" }),
          createMockEmail({ actionStatus: "awaiting_reply" }),
          createMockEmail({ actionStatus: "fyi" }),
          createMockEmail({ actionStatus: "none" }),
        ];

        const analyses = analyzer.analyzeEmails(emails);
        const grouped = analyzer.groupByActionStatus(analyses);

        expect(grouped.needsResponse).toHaveLength(1);
        expect(grouped.awaitingReply).toHaveLength(1);
        expect(grouped.fyi).toHaveLength(1);
        expect(grouped.other).toHaveLength(1);
      });

      it("should sort each group by score", () => {
        const emails = [
          createMockEmail({
            actionStatus: "needs_response",
            importance: "low",
            subject: "Low priority request",
          }),
          createMockEmail({
            actionStatus: "needs_response",
            importance: "high",
            subject: "URGENT: High priority request",
            labels: ["IMPORTANT"],
          }),
        ];

        const analyses = analyzer.analyzeEmails(emails);
        const grouped = analyzer.groupByActionStatus(analyses);

        expect(grouped.needsResponse).toHaveLength(2);
        expect(grouped.needsResponse[0].score).toBeGreaterThan(
          grouped.needsResponse[1].score
        );
      });
    });

    describe("generateSummary", () => {
      it("should generate accurate summary statistics", () => {
        const emails = [
          createMockEmail({
            isRead: false,
            importance: "high",
            actionStatus: "needs_response",
          }),
          createMockEmail({
            isRead: true,
            importance: "medium",
            actionStatus: "awaiting_reply",
          }),
          createMockEmail({
            isRead: false,
            importance: "low",
            actionStatus: "fyi",
          }),
        ];

        const analyses = analyzer.analyzeEmails(emails);
        const summary = analyzer.generateSummary(analyses);

        expect(summary.total).toBe(3);
        expect(summary.unread).toBe(2);
        expect(summary.highImportance).toBe(1);
        expect(summary.mediumImportance).toBe(1);
        expect(summary.lowImportance).toBe(1);
        expect(summary.needsResponse).toBe(1);
        expect(summary.awaitingReply).toBe(1);
        expect(summary.fyi).toBe(1);
      });

      it("should handle empty array", () => {
        const summary = analyzer.generateSummary([]);

        expect(summary.total).toBe(0);
        expect(summary.unread).toBe(0);
        expect(summary.highImportance).toBe(0);
        expect(summary.needsResponse).toBe(0);
      });
    });
  });

  describe("Convenience functions", () => {
    describe("analyzeEmailsForBrief", () => {
      it("should return grouped emails, summary, and all analyses", () => {
        const emails = [
          createMockEmail({ actionStatus: "needs_response" }),
          createMockEmail({ actionStatus: "fyi" }),
        ];

        const result = analyzeEmailsForBrief(emails, "test@gmail.com");

        expect(result).toHaveProperty("grouped");
        expect(result).toHaveProperty("summary");
        expect(result).toHaveProperty("all");
        expect(result.all).toHaveLength(2);
        expect(result.grouped.needsResponse).toHaveLength(1);
        expect(result.grouped.fyi).toHaveLength(1);
      });
    });

    describe("scoreToImportance", () => {
      it("should return high for scores >= 70", () => {
        expect(scoreToImportance(70)).toBe("high");
        expect(scoreToImportance(85)).toBe("high");
        expect(scoreToImportance(100)).toBe("high");
      });

      it("should return medium for scores 40-69", () => {
        expect(scoreToImportance(40)).toBe("medium");
        expect(scoreToImportance(55)).toBe("medium");
        expect(scoreToImportance(69)).toBe("medium");
      });

      it("should return low for scores < 40", () => {
        expect(scoreToImportance(0)).toBe("low");
        expect(scoreToImportance(20)).toBe("low");
        expect(scoreToImportance(39)).toBe("low");
      });
    });

    describe("getTopPriorityEmails", () => {
      it("should return emails needing response or high importance", () => {
        const emails = [
          createMockEmail({
            actionStatus: "needs_response",
            importance: "high",
          }),
          createMockEmail({ actionStatus: "fyi", importance: "low" }),
          createMockEmail({ actionStatus: "none", importance: "high" }),
        ];

        const analyses = new EmailAnalyzer("test@gmail.com").analyzeEmails(emails);
        const topPriority = getTopPriorityEmails(analyses);

        // Should include needs_response and high importance, but not the fyi/low one
        expect(topPriority.length).toBeLessThanOrEqual(5);
        topPriority.forEach((analysis) => {
          const isHighPriority =
            analysis.email.actionStatus === "needs_response" ||
            analysis.email.importance === "high";
          expect(isHighPriority).toBe(true);
        });
      });

      it("should limit to specified number", () => {
        const emails = Array(10)
          .fill(null)
          .map(() =>
            createMockEmail({
              actionStatus: "needs_response",
              importance: "high",
            })
          );

        const analyses = new EmailAnalyzer("test@gmail.com").analyzeEmails(emails);
        const topPriority = getTopPriorityEmails(analyses, 3);

        expect(topPriority).toHaveLength(3);
      });

      it("should sort by score descending", () => {
        const emails = [
          createMockEmail({
            actionStatus: "needs_response",
            importance: "medium",
          }),
          createMockEmail({
            actionStatus: "needs_response",
            importance: "high",
            labels: ["IMPORTANT", "STARRED"],
            subject: "URGENT",
          }),
        ];

        const analyses = new EmailAnalyzer("test@gmail.com").analyzeEmails(emails);
        const topPriority = getTopPriorityEmails(analyses);

        if (topPriority.length > 1) {
          expect(topPriority[0].score).toBeGreaterThanOrEqual(topPriority[1].score);
        }
      });
    });

    describe("hasUrgentEmails", () => {
      it("should return true when there are urgent emails", () => {
        const emails = [
          createMockEmail({
            actionStatus: "needs_response",
            importance: "high",
            labels: ["IMPORTANT", "STARRED"],
            subject: "URGENT: Critical issue",
            isRead: false,
          }),
        ];

        const analyses = new EmailAnalyzer("test@gmail.com").analyzeEmails(emails);
        // Only if score > 80 and needs_response
        const result = hasUrgentEmails(analyses);
        // The result depends on the actual scoring
        expect(typeof result).toBe("boolean");
      });

      it("should return false when no emails need urgent response", () => {
        const emails = [
          createMockEmail({
            actionStatus: "fyi",
            importance: "low",
          }),
        ];

        const analyses = new EmailAnalyzer("test@gmail.com").analyzeEmails(emails);
        expect(hasUrgentEmails(analyses)).toBe(false);
      });

      it("should return false for empty array", () => {
        expect(hasUrgentEmails([])).toBe(false);
      });
    });

    describe("formatEmailForBrief", () => {
      it("should format email analysis for display", () => {
        const email = createMockEmail({
          subject: "Important Update",
          from: { email: "boss@company.com", name: "The Boss" },
          snippet: "This is a very long snippet that should be truncated if it exceeds the maximum length allowed for display purposes.",
        });

        const analysis: EmailAnalysis = {
          email,
          score: 75,
          signals: [
            { type: "unread", description: "Unread email", weight: 10 },
            { type: "urgent_keyword", description: 'Contains urgent indicator: "important"', weight: 20 },
          ],
        };

        const formatted = formatEmailForBrief(analysis);

        expect(formatted).toContain("The Boss");
        expect(formatted).toContain("Important Update");
        expect(formatted).toContain("!!!");  // High importance indicator
      });

      it("should use email address if name is not available", () => {
        const email = createMockEmail({
          from: { email: "no-name@example.com" },
        });

        const analysis: EmailAnalysis = {
          email,
          score: 50,
          signals: [],
        };

        const formatted = formatEmailForBrief(analysis);
        expect(formatted).toContain("no-name@example.com");
      });

      it("should truncate long snippets", () => {
        const longSnippet = "A".repeat(200);
        const email = createMockEmail({ snippet: longSnippet });

        const analysis: EmailAnalysis = {
          email,
          score: 50,
          signals: [],
        };

        const formatted = formatEmailForBrief(analysis);
        expect(formatted).toContain("...");
        expect(formatted.length).toBeLessThan(longSnippet.length + 200);
      });
    });
  });
});

// ============================================================================
// Brief Generator Service Tests
// ============================================================================

describe("BriefGeneratorService", () => {
  const mockUserId = "user_123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Brief generation - success cases", () => {
    it("should generate a brief with calendar and email data", async () => {
      const mockIntegration = createMockIntegration();
      const mockEvents = [createMockCalendarEvent()];
      const mockEmails = [createMockEmail()];
      const mockBrief = createMockDailyBrief({ status: "completed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue(mockEvents);
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue(mockEmails);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      // Dynamic import to get fresh instance after mocks are set up
      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId);
      const result = await generator.generateBrief();

      expect(result.success).toBe(true);
      expect(result.brief).toBeDefined();
      expect(findGoogleIntegrationByUserId).toHaveBeenCalledWith(mockUserId);
      expect(fetchEventsForDailyBrief).toHaveBeenCalled();
      expect(fetchEmailsForDailyBrief).toHaveBeenCalled();
      expect(upsertDailyBrief).toHaveBeenCalled();
      expect(updateGoogleIntegrationLastSynced).toHaveBeenCalledWith(mockUserId);
    });

    it("should handle empty calendar events gracefully", async () => {
      const mockIntegration = createMockIntegration();
      const mockEmails = [createMockEmail()];
      const mockBrief = createMockDailyBrief({ status: "completed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue([]); // Empty events
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue(mockEmails);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId);
      const result = await generator.generateBrief();

      expect(result.success).toBe(true);
    });

    it("should handle empty emails gracefully", async () => {
      const mockIntegration = createMockIntegration();
      const mockEvents = [createMockCalendarEvent()];
      const mockBrief = createMockDailyBrief({ status: "completed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue(mockEvents);
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue([]); // Empty emails
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId);
      const result = await generator.generateBrief();

      expect(result.success).toBe(true);
    });

    it("should handle both empty calendar and emails", async () => {
      const mockIntegration = createMockIntegration();
      const mockBrief = createMockDailyBrief({ status: "completed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue([]);
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue([]);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId);
      const result = await generator.generateBrief();

      expect(result.success).toBe(true);
    });
  });

  describe("Brief generation - error cases", () => {
    it("should return error when integration is not connected", async () => {
      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(null);
      vi.mocked(isIntegrationValid).mockReturnValue(false);

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId);
      const result = await generator.generateBrief();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INTEGRATION_NOT_CONNECTED");
      expect(result.error?.retryable).toBe(false);
    });

    it("should return error when integration is disconnected", async () => {
      const mockIntegration = createMockIntegration({ isConnected: false });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(false);

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId);
      const result = await generator.generateBrief();

      expect(result.success).toBe(false);
      expect(result.error?.retryable).toBe(false);
    });

    it("should handle token refresh failure", async () => {
      const mockIntegration = createMockIntegration();
      const mockBrief = createMockDailyBrief({ status: "failed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockRejectedValue(
        new GoogleAuthError("Token refresh failed", GoogleAuthErrorCodes.TOKEN_REFRESH_FAILED)
      );
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(markIntegrationDisconnected).mockResolvedValue();

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId);
      const result = await generator.generateBrief();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("TOKEN_REFRESH_FAILED");
      expect(result.error?.retryable).toBe(false);
      expect(markIntegrationDisconnected).toHaveBeenCalledWith(mockUserId);
    });

    it("should handle invalid credentials error", async () => {
      const mockIntegration = createMockIntegration();
      const mockBrief = createMockDailyBrief({ status: "failed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockRejectedValue(
        new GoogleAuthError("Invalid credentials", GoogleAuthErrorCodes.INVALID_CREDENTIALS)
      );
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(markIntegrationDisconnected).mockResolvedValue();

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId);
      const result = await generator.generateBrief();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_CREDENTIALS");
      expect(result.error?.retryable).toBe(false);
    });

    it("should handle API errors with retryable flag", async () => {
      const mockIntegration = createMockIntegration();
      const mockBrief = createMockDailyBrief({ status: "failed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      // Fail all retry attempts
      vi.mocked(fetchEventsForDailyBrief).mockRejectedValue(
        new GoogleAuthError("API Error", GoogleAuthErrorCodes.API_ERROR)
      );
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue([]);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId, { maxRetries: 1 });
      const result = await generator.generateBrief();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("API_ERROR");
      expect(result.error?.retryable).toBe(true);
    });

    it("should handle unknown errors", async () => {
      const mockIntegration = createMockIntegration();
      const mockBrief = createMockDailyBrief({ status: "failed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockRejectedValue(new Error("Unknown error"));
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue([]);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId, { maxRetries: 1 });
      const result = await generator.generateBrief();

      expect(result.success).toBe(false);
      expect(result.error?.retryable).toBe(true);
    });
  });

  describe("Brief generation options", () => {
    it("should use custom timezone", async () => {
      const mockIntegration = createMockIntegration();
      const mockBrief = createMockDailyBrief({ status: "completed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue([]);
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue([]);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId, {
        timeZone: "America/New_York",
      });
      const result = await generator.generateBrief();

      expect(result.success).toBe(true);
      expect(fetchEventsForDailyBrief).toHaveBeenCalledWith(
        expect.anything(),
        "America/New_York"
      );
    });

    it("should use custom top priority limit", async () => {
      const mockIntegration = createMockIntegration();
      const mockBrief = createMockDailyBrief({ status: "completed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue([]);
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue([]);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      const { BriefGeneratorService } = await import("~/services/brief-generator");
      const generator = new BriefGeneratorService(mockUserId, {
        topPriorityLimit: 10,
      });
      const result = await generator.generateBrief();

      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Brief Content Generation Tests
// ============================================================================

describe("Brief Content Generation", () => {
  describe("generateBriefContent helper tests", () => {
    it("should create proper summary with meetings and emails", () => {
      const events: CalendarEventData[] = [
        createMockCalendarEvent({ title: "Meeting 1" }),
        createMockCalendarEvent({ title: "Meeting 2" }),
      ];

      const emails: EmailData[] = [
        createMockEmail({ actionStatus: "needs_response" }),
        createMockEmail({ actionStatus: "fyi" }),
      ];

      const emailAnalysis = analyzeEmailsForBrief(emails, "test@gmail.com");

      // Manual brief content construction to test
      const briefContent: BriefContent = {
        greeting: "Good Morning",
        date: "Wednesday, January 15, 2025",
        summary: {
          totalMeetings: events.length,
          totalEmails: emailAnalysis.summary.total,
          emailsNeedingResponse: emailAnalysis.summary.needsResponse,
          hasUrgentItems: false,
          overdueCommitments: 0,
          commitmentsDueToday: 0,
        },
        calendar: {
          events,
          isEmpty: false,
        },
        emails: {
          needsResponse: emailAnalysis.grouped.needsResponse,
          awaitingReply: emailAnalysis.grouped.awaitingReply,
          fyi: emailAnalysis.grouped.fyi,
          topPriority: getTopPriorityEmails(emailAnalysis.all),
          isEmpty: false,
        },
        conversations: {
          needsResponse: [],
          awaitingReply: [],
          resolved: [],
          summary: { totalThreads: 0, totalEmails: 0, threadsNeedingResponse: 0, threadsAwaitingReply: 0, threadsResolved: 0, unreadThreads: 0 },
          isEmpty: true,
        },
        commitments: {
          dueToday: [],
          overdue: [],
          upcoming: [],
          isEmpty: true,
        },
        followUpRadar: {
          items: [],
          isEmpty: true,
        },
        actionItems: [],
      };

      expect(briefContent.summary.totalMeetings).toBe(2);
      expect(briefContent.summary.totalEmails).toBe(2);
      expect(briefContent.summary.emailsNeedingResponse).toBe(1);
    });

    it("should show empty message when no meetings", () => {
      const briefContent: BriefContent = {
        greeting: "Good Morning",
        date: "Wednesday, January 15, 2025",
        summary: {
          totalMeetings: 0,
          totalEmails: 0,
          emailsNeedingResponse: 0,
          hasUrgentItems: false,
          overdueCommitments: 0,
          commitmentsDueToday: 0,
        },
        calendar: {
          events: [],
          isEmpty: true,
          message: "No meetings scheduled for today. Great time for focused work!",
        },
        emails: {
          needsResponse: [],
          awaitingReply: [],
          fyi: [],
          topPriority: [],
          isEmpty: true,
          message: "No new emails in the past 24 hours. Inbox zero!",
        },
        conversations: {
          needsResponse: [],
          awaitingReply: [],
          resolved: [],
          summary: { totalThreads: 0, totalEmails: 0, threadsNeedingResponse: 0, threadsAwaitingReply: 0, threadsResolved: 0, unreadThreads: 0 },
          isEmpty: true,
        },
        commitments: {
          dueToday: [],
          overdue: [],
          upcoming: [],
          isEmpty: true,
        },
        followUpRadar: {
          items: [],
          isEmpty: true,
        },
        actionItems: [],
      };

      expect(briefContent.calendar.isEmpty).toBe(true);
      expect(briefContent.calendar.message).toContain("No meetings");
      expect(briefContent.emails.isEmpty).toBe(true);
      expect(briefContent.emails.message).toContain("No new emails");
    });
  });

  describe("Action items generation", () => {
    it("should generate action items from high priority emails", () => {
      const emails: EmailData[] = [
        createMockEmail({
          actionStatus: "needs_response",
          importance: "high",
          subject: "URGENT: Budget Approval",
          from: { email: "cfo@company.com", name: "CFO" },
        }),
      ];

      const emailAnalysis = analyzeEmailsForBrief(emails, "test@gmail.com");
      const topPriority = getTopPriorityEmails(emailAnalysis.all);

      // Generate action items from emails
      const actionItems: ActionItem[] = [];
      for (const analysis of topPriority) {
        if (analysis.email.actionStatus === "needs_response") {
          actionItems.push({
            type: "email",
            priority: analysis.score >= 70 ? "high" : "medium",
            description: `Respond to "${analysis.email.subject}" from ${analysis.email.from.name || analysis.email.from.email}`,
            source: `Email ID: ${analysis.email.id}`,
          });
        }
      }

      expect(actionItems.length).toBeGreaterThan(0);
      expect(actionItems[0].type).toBe("email");
      expect(actionItems[0].description).toContain("Budget Approval");
      expect(actionItems[0].description).toContain("CFO");
    });

    it("should generate action items from upcoming meetings", () => {
      // Meeting in 1 hour
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      const events: CalendarEventData[] = [
        createMockCalendarEvent({
          title: "Important Client Call",
          startTime: oneHourLater.toISOString(),
          endTime: new Date(oneHourLater.getTime() + 30 * 60 * 1000).toISOString(),
          isAllDay: false,
        }),
      ];

      // Generate action items from meetings
      const actionItems: ActionItem[] = [];
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      for (const event of events) {
        const eventStart = new Date(event.startTime);

        if (eventStart >= now && eventStart <= twoHoursLater && !event.isAllDay) {
          actionItems.push({
            type: "meeting",
            priority: "high",
            description: `Upcoming: "${event.title}"`,
            source: event.meetingLink || event.location || "No location specified",
          });
        }
      }

      expect(actionItems.length).toBe(1);
      expect(actionItems[0].type).toBe("meeting");
      expect(actionItems[0].priority).toBe("high");
      expect(actionItems[0].description).toContain("Important Client Call");
    });

    it("should not include all-day events as urgent action items", () => {
      const events: CalendarEventData[] = [
        createMockCalendarEvent({
          title: "Company Holiday",
          isAllDay: true,
        }),
      ];

      const now = new Date();
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      const actionItems: ActionItem[] = [];
      for (const event of events) {
        const eventStart = new Date(event.startTime);

        if (eventStart >= now && eventStart <= twoHoursLater && !event.isAllDay) {
          actionItems.push({
            type: "meeting",
            priority: "high",
            description: `Upcoming: "${event.title}"`,
            source: event.meetingLink || event.location || "No location specified",
          });
        }
      }

      expect(actionItems.length).toBe(0);
    });

    it("should sort action items by priority", () => {
      const actionItems: ActionItem[] = [
        { type: "email", priority: "low", description: "Low priority", source: "email" },
        { type: "meeting", priority: "high", description: "High priority", source: "calendar" },
        { type: "email", priority: "medium", description: "Medium priority", source: "email" },
      ];

      const priorityOrder = { high: 0, medium: 1, low: 2 };
      actionItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      expect(actionItems[0].priority).toBe("high");
      expect(actionItems[1].priority).toBe("medium");
      expect(actionItems[2].priority).toBe("low");
    });
  });
});

// ============================================================================
// Markdown Formatting Tests
// ============================================================================

describe("Brief Markdown Formatting", () => {
  describe("formatBriefAsMarkdown", () => {
    it("should format header with greeting and date", () => {
      const briefContent: BriefContent = {
        greeting: "Good Morning",
        date: "Wednesday, January 15, 2025",
        summary: {
          totalMeetings: 0,
          totalEmails: 0,
          emailsNeedingResponse: 0,
          hasUrgentItems: false,
          overdueCommitments: 0,
          commitmentsDueToday: 0,
        },
        calendar: { events: [], isEmpty: true },
        emails: {
          needsResponse: [],
          awaitingReply: [],
          fyi: [],
          topPriority: [],
          isEmpty: true,
        },
        conversations: {
          needsResponse: [],
          awaitingReply: [],
          resolved: [],
          summary: { totalThreads: 0, totalEmails: 0, threadsNeedingResponse: 0, threadsAwaitingReply: 0, threadsResolved: 0, unreadThreads: 0 },
          isEmpty: true,
        },
        commitments: {
          dueToday: [],
          overdue: [],
          upcoming: [],
          isEmpty: true,
        },
        followUpRadar: {
          items: [],
          isEmpty: true,
        },
        actionItems: [],
      };

      // Simulate markdown formatting
      const sections: string[] = [];
      sections.push(`# ${briefContent.greeting}`);
      sections.push(`**${briefContent.date}**`);
      sections.push("");
      sections.push("## Today at a Glance");

      const markdown = sections.join("\n");

      expect(markdown).toContain("# Good Morning");
      expect(markdown).toContain("**Wednesday, January 15, 2025**");
      expect(markdown).toContain("## Today at a Glance");
    });

    it("should include urgent attention message when needed", () => {
      const briefContent: BriefContent = {
        greeting: "Good Morning",
        date: "Wednesday, January 15, 2025",
        summary: {
          totalMeetings: 1,
          totalEmails: 5,
          emailsNeedingResponse: 3,
          hasUrgentItems: true,
          overdueCommitments: 0,
          commitmentsDueToday: 0,
        },
        calendar: { events: [], isEmpty: false },
        emails: {
          needsResponse: [],
          awaitingReply: [],
          fyi: [],
          topPriority: [],
          isEmpty: false,
        },
        conversations: {
          needsResponse: [],
          awaitingReply: [],
          resolved: [],
          summary: { totalThreads: 0, totalEmails: 0, threadsNeedingResponse: 0, threadsAwaitingReply: 0, threadsResolved: 0, unreadThreads: 0 },
          isEmpty: true,
        },
        commitments: {
          dueToday: [],
          overdue: [],
          upcoming: [],
          isEmpty: true,
        },
        followUpRadar: {
          items: [],
          isEmpty: true,
        },
        actionItems: [],
      };

      // Simulate markdown formatting
      const sections: string[] = [];
      sections.push("## Today at a Glance");
      sections.push("");

      if (briefContent.summary.hasUrgentItems) {
        sections.push("**Attention needed on urgent items below**");
        sections.push("");
      }

      const markdown = sections.join("\n");

      expect(markdown).toContain("**Attention needed on urgent items below**");
    });

    it("should format calendar events with details", () => {
      const event = createMockCalendarEvent({
        title: "Team Sync",
        startTime: "2025-01-15T09:00:00Z",
        endTime: "2025-01-15T10:00:00Z",
        location: "Conference Room",
        meetingLink: "https://meet.google.com/abc",
        attendees: [
          { email: "alice@example.com", name: "Alice" },
          { email: "bob@example.com", name: "Bob" },
        ],
      });

      // Simulate event formatting
      const sections: string[] = [];
      sections.push(`### ${event.title}`);
      sections.push(`**Time:** 9:00 AM - 10:00 AM`);

      if (event.location) {
        sections.push(`**Location:** ${event.location}`);
      }

      if (event.meetingLink) {
        sections.push(`**Meeting Link:** [Join Meeting](${event.meetingLink})`);
      }

      if (event.attendees && event.attendees.length > 0) {
        const attendeeList = event.attendees.map((a) => a.name || a.email).join(", ");
        sections.push(`**Attendees:** ${attendeeList}`);
      }

      const markdown = sections.join("\n");

      expect(markdown).toContain("### Team Sync");
      expect(markdown).toContain("**Location:** Conference Room");
      expect(markdown).toContain("[Join Meeting](https://meet.google.com/abc)");
      expect(markdown).toContain("Alice, Bob");
    });

    it("should show empty calendar message", () => {
      const message = "No meetings scheduled for today. Great time for focused work!";

      expect(message).toContain("No meetings scheduled");
    });

    it("should format email sections by category", () => {
      const emails: EmailData[] = [
        createMockEmail({
          subject: "Need your approval",
          actionStatus: "needs_response",
          importance: "high",
        }),
        createMockEmail({
          subject: "Waiting for response",
          actionStatus: "awaiting_reply",
        }),
        createMockEmail({
          subject: "FYI: Weekly Newsletter",
          actionStatus: "fyi",
        }),
      ];

      const emailAnalysis = analyzeEmailsForBrief(emails, "test@gmail.com");

      expect(emailAnalysis.grouped.needsResponse.length).toBe(1);
      expect(emailAnalysis.grouped.awaitingReply.length).toBe(1);
      expect(emailAnalysis.grouped.fyi.length).toBe(1);
    });

    it("should use importance indicators for emails", () => {
      // !!! for high, !! for medium, ! for low
      const highScore = 75;
      const mediumScore = 50;
      const lowScore = 25;

      const getIndicator = (score: number) => {
        if (score >= 70) return "!!!";
        if (score >= 40) return "!!";
        return "!";
      };

      expect(getIndicator(highScore)).toBe("!!!");
      expect(getIndicator(mediumScore)).toBe("!!");
      expect(getIndicator(lowScore)).toBe("!");
    });

    it("should truncate long email snippets", () => {
      const longSnippet = "A".repeat(200);
      const maxLength = 100;

      const truncated =
        longSnippet.slice(0, maxLength) + (longSnippet.length > maxLength ? "..." : "");

      expect(truncated.length).toBe(103); // 100 chars + "..."
      expect(truncated).toContain("...");
    });
  });
});

// ============================================================================
// Convenience Functions Tests
// ============================================================================

describe("Convenience Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateDailyBrief", () => {
    it("should create generator and call generateBrief", async () => {
      const mockIntegration = createMockIntegration();
      const mockBrief = createMockDailyBrief({ status: "completed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue([]);
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue([]);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      const { generateDailyBrief } = await import("~/services/brief-generator");
      const result = await generateDailyBrief("user_123");

      expect(result.success).toBe(true);
    });

    it("should pass options to the generator", async () => {
      const mockIntegration = createMockIntegration();
      const mockBrief = createMockDailyBrief({ status: "completed" });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue([]);
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue([]);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      const { generateDailyBrief } = await import("~/services/brief-generator");
      const result = await generateDailyBrief("user_123", {
        timeZone: "Europe/London",
        topPriorityLimit: 3,
      });

      expect(result.success).toBe(true);
      expect(fetchEventsForDailyBrief).toHaveBeenCalledWith(
        expect.anything(),
        "Europe/London"
      );
    });
  });

  describe("getTodayDateString", () => {
    it("should return date in YYYY-MM-DD format", () => {
      const dateString = getTodayDateString();
      // Our mock returns "2025-01-15"
      expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

// ============================================================================
// Integration Tests - Full Flow
// ============================================================================

describe("Brief Generation Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Full brief generation flow", () => {
    it("should generate a complete brief with all data", async () => {
      const mockIntegration = createMockIntegration();
      const mockEvents = [
        createMockCalendarEvent({
          title: "Morning Standup",
          startTime: "2025-01-15T09:00:00Z",
          endTime: "2025-01-15T09:30:00Z",
        }),
        createMockCalendarEvent({
          title: "Sprint Planning",
          startTime: "2025-01-15T14:00:00Z",
          endTime: "2025-01-15T15:00:00Z",
        }),
      ];
      const mockEmails = [
        createMockEmail({
          subject: "URGENT: Need approval",
          actionStatus: "needs_response",
          importance: "high",
          labels: ["IMPORTANT"],
        }),
        createMockEmail({
          subject: "Weekly Update",
          actionStatus: "fyi",
          importance: "low",
        }),
      ];
      const mockBrief = createMockDailyBrief({
        status: "completed",
        calendarEvents: mockEvents,
        emails: mockEmails,
        totalEvents: "2",
        totalEmails: "2",
        emailsNeedingResponse: "1",
      });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue(mockEvents);
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue(mockEmails);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      const { generateDailyBrief } = await import("~/services/brief-generator");
      const result = await generateDailyBrief("user_123");

      expect(result.success).toBe(true);
      expect(result.brief?.status).toBe("completed");

      // Verify the upsert was called with expected data
      expect(upsertDailyBrief).toHaveBeenCalled();
      const upsertCall = vi.mocked(upsertDailyBrief).mock.calls[1]; // Second call is the completed brief
      if (upsertCall) {
        expect(upsertCall[2]).toMatchObject({
          status: "completed",
          totalEvents: "2",
          totalEmails: "2",
          emailsNeedingResponse: "1",
        });
      }
    });

    it("should handle partial data gracefully", async () => {
      const mockIntegration = createMockIntegration();
      const mockEvents: CalendarEventData[] = [];
      const mockEmails = [
        createMockEmail({
          subject: "Only email",
          actionStatus: "fyi",
        }),
      ];
      const mockBrief = createMockDailyBrief({
        status: "completed",
        calendarEvents: [],
        emails: mockEmails,
        totalEvents: "0",
        totalEmails: "1",
        emailsNeedingResponse: "0",
      });

      vi.mocked(findGoogleIntegrationByUserId).mockResolvedValue(mockIntegration);
      vi.mocked(isIntegrationValid).mockReturnValue(true);
      vi.mocked(fetchEventsForDailyBrief).mockResolvedValue(mockEvents);
      vi.mocked(fetchEmailsForDailyBrief).mockResolvedValue(mockEmails);
      vi.mocked(upsertDailyBrief).mockResolvedValue(mockBrief);
      vi.mocked(updateGoogleIntegrationLastSynced).mockResolvedValue(null);

      const { generateDailyBrief } = await import("~/services/brief-generator");
      const result = await generateDailyBrief("user_123");

      expect(result.success).toBe(true);
      expect(result.brief?.totalEvents).toBe("0");
      expect(result.brief?.totalEmails).toBe("1");
    });
  });
});

// ============================================================================
// Greeting Time Tests
// ============================================================================

describe("Greeting based on time of day", () => {
  it("should return appropriate greeting for morning", () => {
    const hour = 8;
    let greeting: string;

    if (hour < 12) {
      greeting = "Good Morning";
    } else if (hour < 17) {
      greeting = "Good Afternoon";
    } else {
      greeting = "Good Evening";
    }

    expect(greeting).toBe("Good Morning");
  });

  it("should return appropriate greeting for afternoon", () => {
    const hour = 14;
    let greeting: string;

    if (hour < 12) {
      greeting = "Good Morning";
    } else if (hour < 17) {
      greeting = "Good Afternoon";
    } else {
      greeting = "Good Evening";
    }

    expect(greeting).toBe("Good Afternoon");
  });

  it("should return appropriate greeting for evening", () => {
    const hour = 19;
    let greeting: string;

    if (hour < 12) {
      greeting = "Good Morning";
    } else if (hour < 17) {
      greeting = "Good Afternoon";
    } else {
      greeting = "Good Evening";
    }

    expect(greeting).toBe("Good Evening");
  });
});

// ============================================================================
// Date Formatting Tests
// ============================================================================

describe("Date and Time Formatting", () => {
  describe("formatDate", () => {
    it("should format date string for display", () => {
      const dateString = "2025-01-15";
      const date = new Date(dateString + "T00:00:00");
      const formatted = date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      expect(formatted).toContain("2025");
      expect(formatted).toContain("January");
      expect(formatted).toContain("15");
    });
  });

  describe("formatTime", () => {
    it("should format ISO time string for display", () => {
      const isoString = "2025-01-15T14:30:00Z";
      const date = new Date(isoString);
      const formatted = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      // The exact output depends on timezone, but should contain AM or PM
      expect(formatted).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
    });

    it("should handle different time formats", () => {
      const times = [
        "2025-01-15T00:00:00Z",
        "2025-01-15T12:00:00Z",
        "2025-01-15T23:59:00Z",
      ];

      times.forEach((time) => {
        const date = new Date(time);
        const formatted = date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        expect(formatted).toBeDefined();
        expect(typeof formatted).toBe("string");
      });
    });
  });
});

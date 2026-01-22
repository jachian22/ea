import type { EmailData } from "~/db/schema";

/**
 * Email analysis result with importance score and categorization
 */
export interface EmailAnalysis {
  email: EmailData;
  /** Numeric score (0-100) for sorting emails by priority */
  score: number;
  /** Signals that contributed to the importance determination */
  signals: ImportanceSignal[];
}

/**
 * Signals that indicate email importance
 */
export interface ImportanceSignal {
  type: SignalType;
  description: string;
  /** Weight contribution to the overall score (positive or negative) */
  weight: number;
}

export type SignalType =
  | "gmail_important"
  | "gmail_starred"
  | "urgent_keyword"
  | "action_keyword"
  | "time_sensitive"
  | "direct_address"
  | "reply_expected"
  | "automated_sender"
  | "promotional"
  | "social"
  | "unread"
  | "vip_sender"
  | "meeting_related";

/**
 * Grouped emails by their action status
 */
export interface GroupedEmails {
  needsResponse: EmailAnalysis[];
  awaitingReply: EmailAnalysis[];
  fyi: EmailAnalysis[];
  other: EmailAnalysis[];
}

/**
 * Summary statistics for email analysis
 */
export interface EmailAnalysisSummary {
  total: number;
  unread: number;
  highImportance: number;
  mediumImportance: number;
  lowImportance: number;
  needsResponse: number;
  awaitingReply: number;
  fyi: number;
}

// ============================================================================
// Constants for rule-based analysis
// ============================================================================

/**
 * Keywords that suggest urgency in subject lines
 */
const URGENT_KEYWORDS = [
  "urgent",
  "asap",
  "immediately",
  "critical",
  "emergency",
  "time-sensitive",
  "deadline",
  "eod",
  "end of day",
  "priority",
  "important",
] as const;

/**
 * Keywords that suggest an action is needed
 */
const ACTION_KEYWORDS = [
  "action required",
  "action needed",
  "please review",
  "please respond",
  "need your",
  "waiting for",
  "awaiting your",
  "follow up",
  "follow-up",
  "reminder",
  "response needed",
  "approval needed",
  "sign off",
  "sign-off",
  "feedback",
  "input needed",
] as const;

/**
 * Keywords that suggest time sensitivity
 */
const TIME_SENSITIVE_KEYWORDS = [
  "today",
  "tomorrow",
  "this week",
  "by friday",
  "by monday",
  "by end of",
  "expires",
  "expiring",
  "last chance",
  "final notice",
  "overdue",
] as const;

/**
 * Keywords that suggest meeting-related content
 */
const MEETING_KEYWORDS = [
  "meeting",
  "calendar",
  "invite",
  "scheduled",
  "call",
  "zoom",
  "teams",
  "google meet",
  "agenda",
  "reschedule",
  "cancel meeting",
] as const;

/**
 * Patterns for automated/no-reply senders
 */
const AUTOMATED_SENDER_PATTERNS = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "notifications",
  "notification",
  "mailer-daemon",
  "postmaster",
  "automated",
  "auto-",
  "newsletter",
  "digest",
  "updates@",
  "info@",
  "support@",
  "help@",
  "feedback@",
  "survey@",
  "marketing@",
  "promo@",
  "deals@",
  "sales@",
  "billing@",
  "calendar-notification@google.com",
  "calendar@google.com",
] as const;

/**
 * Weight values for different signals
 */
const SIGNAL_WEIGHTS = {
  // Positive signals (increase importance)
  gmail_important: 25,
  gmail_starred: 30,
  urgent_keyword: 20,
  action_keyword: 15,
  time_sensitive: 15,
  direct_address: 10,
  reply_expected: 10,
  unread: 10,
  vip_sender: 35,
  meeting_related: 10,

  // Negative signals (decrease importance)
  automated_sender: -20,
  promotional: -25,
  social: -15,
} as const;

/**
 * Base scores for importance levels
 */
const IMPORTANCE_BASE_SCORES = {
  high: 70,
  medium: 50,
  low: 30,
} as const;

// ============================================================================
// Email Analyzer Class
// ============================================================================

/**
 * Rule-based email importance analyzer.
 *
 * This analyzer evaluates emails based on multiple signals:
 * - Gmail labels (IMPORTANT, STARRED, CATEGORY_*)
 * - Subject line keywords (urgent, action required, etc.)
 * - Sender patterns (no-reply, automated, VIP)
 * - Read status
 * - Direct addressing
 *
 * The analyzer can be extended in the future to include:
 * - AI-powered content analysis
 * - User-defined VIP lists
 * - Historical interaction patterns
 */
export class EmailAnalyzer {
  private userEmail: string;
  private vipSenders: Set<string>;

  /**
   * Creates a new EmailAnalyzer instance.
   *
   * @param userEmail The user's email address (for detecting direct addressing)
   * @param vipSenders Optional list of VIP sender email addresses
   */
  constructor(userEmail: string, vipSenders: string[] = []) {
    this.userEmail = userEmail.toLowerCase();
    this.vipSenders = new Set(vipSenders.map((e) => e.toLowerCase()));
  }

  /**
   * Analyzes a single email and returns importance signals and score.
   *
   * @param email The email data to analyze
   * @returns Analysis result with score and signals
   */
  analyzeEmail(email: EmailData): EmailAnalysis {
    const signals: ImportanceSignal[] = [];

    // Start with base score based on existing importance
    let score: number = IMPORTANCE_BASE_SCORES[email.importance];

    // Check Gmail labels
    this.analyzeLabels(email, signals);

    // Check subject and snippet for keywords
    this.analyzeContent(email, signals);

    // Check sender patterns
    this.analyzeSender(email, signals);

    // Check read status
    this.analyzeReadStatus(email, signals);

    // Check if directly addressed
    this.analyzeRecipients(email, signals);

    // Calculate final score
    for (const signal of signals) {
      score += signal.weight;
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score));

    return {
      email,
      score,
      signals,
    };
  }

  /**
   * Analyzes multiple emails and returns sorted results.
   *
   * @param emails Array of emails to analyze
   * @returns Array of analysis results sorted by score (highest first)
   */
  analyzeEmails(emails: EmailData[]): EmailAnalysis[] {
    const analyses = emails.map((email) => this.analyzeEmail(email));

    // Sort by score (highest first)
    return analyses.sort((a, b) => b.score - a.score);
  }

  /**
   * Groups analyzed emails by their action status.
   *
   * @param analyses Array of analyzed emails
   * @returns Grouped emails by action status
   */
  groupByActionStatus(analyses: EmailAnalysis[]): GroupedEmails {
    const grouped: GroupedEmails = {
      needsResponse: [],
      awaitingReply: [],
      fyi: [],
      other: [],
    };

    for (const analysis of analyses) {
      switch (analysis.email.actionStatus) {
        case "needs_response":
          grouped.needsResponse.push(analysis);
          break;
        case "awaiting_reply":
          grouped.awaitingReply.push(analysis);
          break;
        case "fyi":
          grouped.fyi.push(analysis);
          break;
        default:
          grouped.other.push(analysis);
      }
    }

    // Sort each group by score
    grouped.needsResponse.sort((a, b) => b.score - a.score);
    grouped.awaitingReply.sort((a, b) => b.score - a.score);
    grouped.fyi.sort((a, b) => b.score - a.score);
    grouped.other.sort((a, b) => b.score - a.score);

    return grouped;
  }

  /**
   * Generates summary statistics for the analyzed emails.
   *
   * @param analyses Array of analyzed emails
   * @returns Summary statistics
   */
  generateSummary(analyses: EmailAnalysis[]): EmailAnalysisSummary {
    const summary: EmailAnalysisSummary = {
      total: analyses.length,
      unread: 0,
      highImportance: 0,
      mediumImportance: 0,
      lowImportance: 0,
      needsResponse: 0,
      awaitingReply: 0,
      fyi: 0,
    };

    for (const analysis of analyses) {
      const { email } = analysis;

      if (!email.isRead) {
        summary.unread++;
      }

      switch (email.importance) {
        case "high":
          summary.highImportance++;
          break;
        case "medium":
          summary.mediumImportance++;
          break;
        case "low":
          summary.lowImportance++;
          break;
      }

      switch (email.actionStatus) {
        case "needs_response":
          summary.needsResponse++;
          break;
        case "awaiting_reply":
          summary.awaitingReply++;
          break;
        case "fyi":
          summary.fyi++;
          break;
      }
    }

    return summary;
  }

  // ============================================================================
  // Private analysis methods
  // ============================================================================

  /**
   * Analyzes Gmail labels for importance signals.
   */
  private analyzeLabels(email: EmailData, signals: ImportanceSignal[]): void {
    const labels = email.labels || [];
    const labelSet = new Set(labels.map((l) => l.toUpperCase()));

    // Check for Gmail's IMPORTANT label
    if (labelSet.has("IMPORTANT")) {
      signals.push({
        type: "gmail_important",
        description: "Marked as important by Gmail",
        weight: SIGNAL_WEIGHTS.gmail_important,
      });
    }

    // Check for starred emails
    if (labelSet.has("STARRED")) {
      signals.push({
        type: "gmail_starred",
        description: "Starred by user",
        weight: SIGNAL_WEIGHTS.gmail_starred,
      });
    }

    // Check for promotional category
    if (labelSet.has("CATEGORY_PROMOTIONS") || labelSet.has("PROMOTIONS")) {
      signals.push({
        type: "promotional",
        description: "Promotional email",
        weight: SIGNAL_WEIGHTS.promotional,
      });
    }

    // Check for social category
    if (labelSet.has("CATEGORY_SOCIAL") || labelSet.has("SOCIAL")) {
      signals.push({
        type: "social",
        description: "Social notification",
        weight: SIGNAL_WEIGHTS.social,
      });
    }
  }

  /**
   * Analyzes email subject and snippet for importance keywords.
   */
  private analyzeContent(email: EmailData, signals: ImportanceSignal[]): void {
    const textToAnalyze = `${email.subject} ${email.snippet}`.toLowerCase();

    // Check for urgent keywords
    const urgentMatch = URGENT_KEYWORDS.find((keyword) =>
      textToAnalyze.includes(keyword)
    );
    if (urgentMatch) {
      signals.push({
        type: "urgent_keyword",
        description: `Contains urgent indicator: "${urgentMatch}"`,
        weight: SIGNAL_WEIGHTS.urgent_keyword,
      });
    }

    // Check for action keywords
    const actionMatch = ACTION_KEYWORDS.find((keyword) =>
      textToAnalyze.includes(keyword)
    );
    if (actionMatch) {
      signals.push({
        type: "action_keyword",
        description: `Contains action request: "${actionMatch}"`,
        weight: SIGNAL_WEIGHTS.action_keyword,
      });
    }

    // Check for time-sensitive keywords
    const timeMatch = TIME_SENSITIVE_KEYWORDS.find((keyword) =>
      textToAnalyze.includes(keyword)
    );
    if (timeMatch) {
      signals.push({
        type: "time_sensitive",
        description: `Time-sensitive: "${timeMatch}"`,
        weight: SIGNAL_WEIGHTS.time_sensitive,
      });
    }

    // Check for meeting-related keywords
    const meetingMatch = MEETING_KEYWORDS.find((keyword) =>
      textToAnalyze.includes(keyword)
    );
    if (meetingMatch) {
      signals.push({
        type: "meeting_related",
        description: `Meeting-related: "${meetingMatch}"`,
        weight: SIGNAL_WEIGHTS.meeting_related,
      });
    }
  }

  /**
   * Analyzes sender email for patterns indicating automated or VIP senders.
   */
  private analyzeSender(email: EmailData, signals: ImportanceSignal[]): void {
    const senderEmail = email.from.email.toLowerCase();

    // Check for VIP senders
    if (this.vipSenders.has(senderEmail)) {
      signals.push({
        type: "vip_sender",
        description: `VIP sender: ${email.from.name || senderEmail}`,
        weight: SIGNAL_WEIGHTS.vip_sender,
      });
      return; // Skip automated sender check for VIPs
    }

    // Check for automated sender patterns
    const automatedMatch = AUTOMATED_SENDER_PATTERNS.find(
      (pattern) =>
        senderEmail.includes(pattern) ||
        senderEmail.startsWith(pattern) ||
        senderEmail.endsWith(pattern)
    );
    if (automatedMatch) {
      signals.push({
        type: "automated_sender",
        description: `Automated sender: ${email.from.email}`,
        weight: SIGNAL_WEIGHTS.automated_sender,
      });
    }
  }

  /**
   * Analyzes read status.
   */
  private analyzeReadStatus(
    email: EmailData,
    signals: ImportanceSignal[]
  ): void {
    if (!email.isRead) {
      signals.push({
        type: "unread",
        description: "Unread email",
        weight: SIGNAL_WEIGHTS.unread,
      });
    }
  }

  /**
   * Analyzes recipients to determine if user is directly addressed.
   */
  private analyzeRecipients(
    email: EmailData,
    signals: ImportanceSignal[]
  ): void {
    const isDirectlyAddressed = email.to.some(
      (recipient) => recipient.email.toLowerCase() === this.userEmail
    );

    if (isDirectlyAddressed) {
      signals.push({
        type: "direct_address",
        description: "Directly addressed to you",
        weight: SIGNAL_WEIGHTS.direct_address,
      });
    }

    // Check if this looks like a reply thread (Re: in subject)
    if (email.subject.toLowerCase().startsWith("re:")) {
      signals.push({
        type: "reply_expected",
        description: "Part of a reply thread",
        weight: SIGNAL_WEIGHTS.reply_expected,
      });
    }
  }
}

// ============================================================================
// Convenience functions
// ============================================================================

/**
 * Analyzes emails and returns grouped results for daily brief generation.
 *
 * This is the main entry point for the brief generator service.
 *
 * @param emails Array of emails from Gmail
 * @param userEmail The user's email address
 * @param vipSenders Optional list of VIP sender emails
 * @returns Object containing grouped emails and summary statistics
 */
export function analyzeEmailsForBrief(
  emails: EmailData[],
  userEmail: string,
  vipSenders: string[] = []
): {
  grouped: GroupedEmails;
  summary: EmailAnalysisSummary;
  all: EmailAnalysis[];
} {
  const analyzer = new EmailAnalyzer(userEmail, vipSenders);
  const analyses = analyzer.analyzeEmails(emails);
  const grouped = analyzer.groupByActionStatus(analyses);
  const summary = analyzer.generateSummary(analyses);

  return {
    grouped,
    summary,
    all: analyses,
  };
}

/**
 * Recalculates importance level based on analysis score.
 *
 * This can be used to update the importance level after analysis.
 *
 * @param score The analysis score (0-100)
 * @returns The calculated importance level
 */
export function scoreToImportance(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Gets the top priority emails that need immediate attention.
 *
 * @param analyses Array of analyzed emails
 * @param limit Maximum number of emails to return (default: 5)
 * @returns Top priority emails
 */
export function getTopPriorityEmails(
  analyses: EmailAnalysis[],
  limit: number = 5
): EmailAnalysis[] {
  return analyses
    .filter(
      (a) =>
        a.email.actionStatus === "needs_response" ||
        a.email.importance === "high"
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Checks if any emails need urgent attention (score > 80 and needs_response).
 *
 * @param analyses Array of analyzed emails
 * @returns True if there are urgent emails
 */
export function hasUrgentEmails(analyses: EmailAnalysis[]): boolean {
  return analyses.some(
    (a) => a.score > 80 && a.email.actionStatus === "needs_response"
  );
}

/**
 * Formats an email analysis for display in the brief.
 *
 * @param analysis The email analysis
 * @returns Formatted string for display
 */
export function formatEmailForBrief(analysis: EmailAnalysis): string {
  const { email, score, signals } = analysis;
  const fromDisplay = email.from.name || email.from.email;
  const importanceIndicator = score >= 70 ? "!!!" : score >= 40 ? "!!" : "!";

  let summary = `${importanceIndicator} From: ${fromDisplay}\n`;
  summary += `   Subject: ${email.subject}\n`;
  summary += `   ${email.snippet.slice(0, 100)}${email.snippet.length > 100 ? "..." : ""}\n`;

  // Add key signals
  const keySignals = signals
    .filter((s) => s.weight > 10 || s.weight < -10)
    .map((s) => s.description)
    .slice(0, 2);

  if (keySignals.length > 0) {
    summary += `   Signals: ${keySignals.join(", ")}\n`;
  }

  return summary;
}

// ============================================================================
// Phase 2: Thread Grouping (Brief v2)
// ============================================================================

/**
 * Conversation state based on who sent the last message
 */
export type ConversationState = "needs_response" | "awaiting_reply" | "resolved";

/**
 * Email thread (conversation) grouping
 */
export interface EmailThread {
  /** Gmail thread ID */
  threadId: string;
  /** Subject line (from first email in thread) */
  subject: string;
  /** All participants in the thread */
  participants: { email: string; name?: string }[];
  /** Current conversation state */
  state: ConversationState;
  /** Number of emails in this thread */
  emailCount: number;
  /** Whether any email in thread is unread */
  hasUnread: boolean;
  /** Timestamp of most recent email */
  lastActivityAt: Date;
  /** The emails in this thread (most recent first) */
  emails: EmailData[];
  /** Highest importance from any email in thread */
  importance: "high" | "medium" | "low";
}

/**
 * Groups emails by threadId into conversation threads.
 *
 * @param emails Array of emails to group
 * @param userEmail The user's email address (to determine conversation state)
 * @returns Array of email threads sorted by last activity (most recent first)
 */
export function groupEmailsByThread(
  emails: EmailData[],
  userEmail: string
): EmailThread[] {
  const normalizedUserEmail = userEmail.toLowerCase();

  // Group emails by threadId
  const threadMap = new Map<string, EmailData[]>();

  for (const email of emails) {
    const threadId = email.threadId;
    const existing = threadMap.get(threadId) || [];
    existing.push(email);
    threadMap.set(threadId, existing);
  }

  // Build thread objects
  const threads: EmailThread[] = [];

  for (const [threadId, threadEmails] of threadMap) {
    // Sort emails by date (most recent first)
    const sortedEmails = [...threadEmails].sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );

    const latestEmail = sortedEmails[0];
    const oldestEmail = sortedEmails[sortedEmails.length - 1];

    // Collect unique participants
    const participantMap = new Map<string, { email: string; name?: string }>();
    for (const email of sortedEmails) {
      // Add sender
      const fromEmail = email.from.email.toLowerCase();
      if (!participantMap.has(fromEmail)) {
        participantMap.set(fromEmail, {
          email: email.from.email,
          name: email.from.name,
        });
      }
      // Add recipients
      for (const to of email.to) {
        const toEmail = to.email.toLowerCase();
        if (!participantMap.has(toEmail)) {
          participantMap.set(toEmail, { email: to.email, name: to.name });
        }
      }
    }

    // Determine conversation state based on last sender
    const state = determineConversationState(latestEmail, normalizedUserEmail);

    // Check for unread emails
    const hasUnread = sortedEmails.some((e) => !e.isRead);

    // Get highest importance
    const importance = getHighestImportance(sortedEmails);

    threads.push({
      threadId,
      subject: oldestEmail.subject, // Use original subject
      participants: Array.from(participantMap.values()),
      state,
      emailCount: sortedEmails.length,
      hasUnread,
      lastActivityAt: new Date(latestEmail.receivedAt),
      emails: sortedEmails,
      importance,
    });
  }

  // Sort by last activity (most recent first)
  threads.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

  return threads;
}

/**
 * Determines the conversation state based on who sent the last email.
 *
 * - If user sent the last email: "awaiting_reply" (waiting for other party)
 * - If someone else sent the last email: "needs_response" (user should respond)
 * - If the thread appears resolved (automated message, etc): "resolved"
 *
 * @param lastEmail The most recent email in the thread
 * @param userEmail The user's email address (normalized to lowercase)
 * @returns The conversation state
 */
function determineConversationState(
  lastEmail: EmailData,
  userEmail: string
): ConversationState {
  const lastSender = lastEmail.from.email.toLowerCase();

  // If user sent the last email, they're awaiting a reply
  if (lastSender === userEmail) {
    return "awaiting_reply";
  }

  // If it's from an automated sender, it's likely resolved/FYI
  if (isAutomatedSender(lastSender)) {
    return "resolved";
  }

  // Otherwise, the user needs to respond
  return "needs_response";
}

/**
 * Checks if an email address appears to be an automated/no-reply sender.
 */
function isAutomatedSender(email: string): boolean {
  const automatedPatterns = [
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "notifications",
    "notification",
    "mailer-daemon",
    "support@",
    "info@",
    "news@",
    "newsletter",
    "automated",
  ];

  return automatedPatterns.some((pattern) => email.includes(pattern));
}

/**
 * Gets the highest importance level from a list of emails.
 */
function getHighestImportance(
  emails: EmailData[]
): "high" | "medium" | "low" {
  if (emails.some((e) => e.importance === "high")) return "high";
  if (emails.some((e) => e.importance === "medium")) return "medium";
  return "low";
}

/**
 * Groups threads by state for display.
 */
export interface GroupedThreads {
  needsResponse: EmailThread[];
  awaitingReply: EmailThread[];
  resolved: EmailThread[];
}

/**
 * Groups email threads by their conversation state.
 *
 * @param threads Array of email threads
 * @returns Threads grouped by state
 */
export function groupThreadsByState(threads: EmailThread[]): GroupedThreads {
  return {
    needsResponse: threads.filter((t) => t.state === "needs_response"),
    awaitingReply: threads.filter((t) => t.state === "awaiting_reply"),
    resolved: threads.filter((t) => t.state === "resolved"),
  };
}

/**
 * Summary statistics for thread analysis
 */
export interface ThreadAnalysisSummary {
  totalThreads: number;
  totalEmails: number;
  threadsNeedingResponse: number;
  threadsAwaitingReply: number;
  threadsResolved: number;
  unreadThreads: number;
}

/**
 * Generates summary statistics for email threads.
 *
 * @param threads Array of email threads
 * @returns Summary statistics
 */
export function generateThreadSummary(
  threads: EmailThread[]
): ThreadAnalysisSummary {
  return {
    totalThreads: threads.length,
    totalEmails: threads.reduce((sum, t) => sum + t.emailCount, 0),
    threadsNeedingResponse: threads.filter((t) => t.state === "needs_response")
      .length,
    threadsAwaitingReply: threads.filter((t) => t.state === "awaiting_reply")
      .length,
    threadsResolved: threads.filter((t) => t.state === "resolved").length,
    unreadThreads: threads.filter((t) => t.hasUnread).length,
  };
}

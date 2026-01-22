/**
 * Commitment Detector Service
 *
 * Extracts commitments (promises) from emails and calendar events.
 * Uses rule-based detection first (no AI cost), with optional AI enhancement.
 */

import type { PersonDomain, Commitment } from "~/db/schema";
import { createCommitment } from "~/data-access/commitments";

// ============================================================================
// Types
// ============================================================================

export interface DetectedCommitment {
  description: string;
  direction: "user_owes" | "they_owe";
  dueDate?: Date;
  priority: "high" | "medium" | "low";
  confidence: number; // 0-1
  matchedPattern?: string;
  sourceText?: string;
}

export interface CommitmentDetectionResult {
  commitments: DetectedCommitment[];
  totalMatches: number;
  highConfidenceMatches: number;
}

export interface EmailForAnalysis {
  id: string;
  subject: string;
  body?: string;
  snippet?: string;
  from: { email: string; name?: string };
  receivedAt: Date;
  direction: "inbound" | "outbound";
}

export interface CalendarEventForAnalysis {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  attendees?: Array<{ email: string; name?: string }>;
}

// ============================================================================
// Detection Patterns
// ============================================================================

// Patterns that indicate the USER is making a commitment (they owe)
const USER_COMMITMENT_PATTERNS = [
  // Future tense promises
  { pattern: /\bI will\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI'll\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI am going to\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI'm going to\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI plan to\s+([^.!?]+)/gi, extract: 1 },

  // Explicit promises
  { pattern: /\bI promise to\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI commit to\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI'll make sure to\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI'll take care of\s+([^.!?]+)/gi, extract: 1 },

  // Delivery promises
  { pattern: /\bI'll send\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI'll get\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI'll have\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI'll prepare\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI'll finish\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bI'll complete\s+([^.!?]+)/gi, extract: 1 },

  // Follow-up promises
  { pattern: /\bI'll get back to you\s*([^.!?]*)/gi, extract: 0 },
  { pattern: /\bI'll follow up\s*([^.!?]*)/gi, extract: 0 },
  { pattern: /\bI'll circle back\s*([^.!?]*)/gi, extract: 0 },
  { pattern: /\bI'll let you know\s*([^.!?]*)/gi, extract: 0 },

  // Action items
  { pattern: /\bAction item:\s*([^.!?\n]+)/gi, extract: 1 },
  { pattern: /\bTODO:\s*([^.!?\n]+)/gi, extract: 1 },
  { pattern: /\bAI:\s*([^.!?\n]+)/gi, extract: 1 },
];

// Patterns that indicate SOMEONE ELSE is making a commitment to the user
const THEY_OWE_PATTERNS = [
  // Their future promises
  { pattern: /\bthey will\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bthey'll\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bhe will\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bhe'll\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bshe will\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bshe'll\s+([^.!?]+)/gi, extract: 1 },

  // Request responses
  { pattern: /\bwe will\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bwe'll\s+([^.!?]+)/gi, extract: 1 },

  // Explicit promises to user
  { pattern: /\bI owe you\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\byou'll receive\s+([^.!?]+)/gi, extract: 1 },
  { pattern: /\bexpect\s+([^.!?]+)\s+from me/gi, extract: 1 },
];

// Date patterns
const DATE_PATTERNS = [
  { pattern: /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, type: "day" },
  { pattern: /\bby\s+(tomorrow)/gi, type: "relative" },
  { pattern: /\bby\s+end of (day|week|month)/gi, type: "relative" },
  { pattern: /\bby\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/gi, type: "date" },
  { pattern: /\bby\s+(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month))/gi, type: "relative" },
  { pattern: /\bdue\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, type: "day" },
  { pattern: /\bdue\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/gi, type: "date" },
  { pattern: /\bdeadline[:\s]+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/gi, type: "date" },
];

// Priority indicators
const HIGH_PRIORITY_INDICATORS = [
  /urgent/i,
  /asap/i,
  /immediately/i,
  /critical/i,
  /high priority/i,
  /time[- ]sensitive/i,
  /as soon as possible/i,
];

const LOW_PRIORITY_INDICATORS = [
  /when you have time/i,
  /no rush/i,
  /low priority/i,
  /whenever/i,
  /at your convenience/i,
];

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect commitments in email text
 */
export function detectCommitmentsInText(
  text: string,
  isOutboundEmail: boolean = true
): DetectedCommitment[] {
  const commitments: DetectedCommitment[] = [];
  const seenDescriptions = new Set<string>();

  // Determine which patterns to use based on email direction
  const patterns = isOutboundEmail
    ? USER_COMMITMENT_PATTERNS // Outbound = user is making commitments
    : THEY_OWE_PATTERNS; // Inbound = they might be making commitments

  const direction: "user_owes" | "they_owe" = isOutboundEmail
    ? "user_owes"
    : "they_owe";

  for (const { pattern, extract } of patterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0];
      const extractedText = extract > 0 ? match[extract] : fullMatch;

      if (!extractedText || extractedText.length < 5) continue;

      // Clean up the description
      const description = cleanCommitmentDescription(extractedText);

      // Skip if too short or already seen
      if (description.length < 10) continue;
      if (seenDescriptions.has(description.toLowerCase())) continue;
      seenDescriptions.add(description.toLowerCase());

      // Detect due date
      const dueDate = extractDueDate(text, match.index);

      // Detect priority
      const priority = detectPriority(text, fullMatch);

      // Calculate confidence
      const confidence = calculateConfidence(fullMatch, description);

      commitments.push({
        description,
        direction,
        dueDate,
        priority,
        confidence,
        matchedPattern: pattern.source,
        sourceText: fullMatch,
      });
    }
  }

  return commitments;
}

/**
 * Detect commitments in an email
 */
export function detectCommitmentsInEmail(
  email: EmailForAnalysis
): CommitmentDetectionResult {
  const text = [email.subject, email.body || email.snippet]
    .filter(Boolean)
    .join(" ");

  const isOutbound = email.direction === "outbound";
  const commitments = detectCommitmentsInText(text, isOutbound);

  // For inbound emails, also check if they're requesting something (implies we owe)
  if (!isOutbound) {
    const requestCommitments = detectRequestsInText(text);
    commitments.push(...requestCommitments);
  }

  return {
    commitments,
    totalMatches: commitments.length,
    highConfidenceMatches: commitments.filter((c) => c.confidence >= 0.7).length,
  };
}

/**
 * Detect commitments in a calendar event
 */
export function detectCommitmentsInCalendarEvent(
  event: CalendarEventForAnalysis
): CommitmentDetectionResult {
  const text = [event.title, event.description].filter(Boolean).join(" ");

  // Calendar events with action items
  const actionItemPatterns = [
    /action items?:?\s*\n?((?:[-•*]\s*[^\n]+\n?)+)/gi,
    /todo:?\s*\n?((?:[-•*]\s*[^\n]+\n?)+)/gi,
    /follow[- ]?up:?\s*([^\n]+)/gi,
    /next steps?:?\s*\n?((?:[-•*]\s*[^\n]+\n?)+)/gi,
  ];

  const commitments: DetectedCommitment[] = [];

  for (const pattern of actionItemPatterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(text)) !== null) {
      const items = match[1]
        .split(/[-•*\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 5);

      for (const item of items) {
        commitments.push({
          description: cleanCommitmentDescription(item),
          direction: "user_owes",
          dueDate: event.startTime, // Meeting date as default due date
          priority: "medium",
          confidence: 0.6,
          matchedPattern: "calendar_action_item",
          sourceText: item,
        });
      }
    }
  }

  return {
    commitments,
    totalMatches: commitments.length,
    highConfidenceMatches: commitments.filter((c) => c.confidence >= 0.7).length,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clean up commitment description
 */
function cleanCommitmentDescription(text: string): string {
  return text
    .trim()
    .replace(/^[-•*]\s*/, "") // Remove bullet points
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/[.!?,;:]+$/, "") // Remove trailing punctuation
    .trim();
}

/**
 * Extract due date from surrounding text
 */
function extractDueDate(text: string, matchIndex: number): Date | undefined {
  // Look for date patterns within 100 chars of the match
  const searchStart = Math.max(0, matchIndex - 50);
  const searchEnd = Math.min(text.length, matchIndex + 200);
  const searchText = text.substring(searchStart, searchEnd);

  for (const { pattern, type } of DATE_PATTERNS) {
    const match = pattern.exec(searchText);
    if (match) {
      return parseDateReference(match[1], type);
    }
  }

  return undefined;
}

/**
 * Parse date reference to actual Date
 */
function parseDateReference(
  reference: string,
  type: string
): Date | undefined {
  const now = new Date();
  const lowerRef = reference.toLowerCase();

  if (type === "relative") {
    if (lowerRef === "tomorrow") {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    if (lowerRef.includes("end of day")) {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59);
      return endOfDay;
    }
    if (lowerRef.includes("end of week")) {
      const endOfWeek = new Date(now);
      const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
      endOfWeek.setDate(endOfWeek.getDate() + daysUntilFriday);
      return endOfWeek;
    }
    if (lowerRef.includes("end of month")) {
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return endOfMonth;
    }
  }

  if (type === "day") {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const targetDay = days.indexOf(lowerRef);
    if (targetDay >= 0) {
      const result = new Date(now);
      const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;
      result.setDate(result.getDate() + daysUntil);
      return result;
    }
  }

  if (type === "date") {
    // Try to parse MM/DD or MM/DD/YY(YY)
    const parts = reference.split("/");
    if (parts.length >= 2) {
      const month = parseInt(parts[0], 10) - 1;
      const day = parseInt(parts[1], 10);
      const year = parts[2] ? parseInt(parts[2], 10) : now.getFullYear();
      const fullYear = year < 100 ? 2000 + year : year;
      return new Date(fullYear, month, day);
    }
  }

  return undefined;
}

/**
 * Detect priority from text
 */
function detectPriority(
  fullText: string,
  matchText: string
): "high" | "medium" | "low" {
  const searchText = matchText + " " + fullText.substring(0, 200);

  for (const pattern of HIGH_PRIORITY_INDICATORS) {
    if (pattern.test(searchText)) {
      return "high";
    }
  }

  for (const pattern of LOW_PRIORITY_INDICATORS) {
    if (pattern.test(searchText)) {
      return "low";
    }
  }

  return "medium";
}

/**
 * Calculate confidence score for a detected commitment
 */
function calculateConfidence(matchText: string, description: string): number {
  let confidence = 0.5;

  // Longer descriptions = more confidence
  if (description.length > 30) confidence += 0.1;
  if (description.length > 50) confidence += 0.1;

  // Explicit commitment words boost confidence
  if (/\b(promise|commit|will|going to)\b/i.test(matchText)) {
    confidence += 0.1;
  }

  // Action verbs boost confidence
  if (/\b(send|deliver|complete|finish|prepare|review|update)\b/i.test(description)) {
    confidence += 0.1;
  }

  // Cap at 1.0
  return Math.min(1.0, confidence);
}

/**
 * Detect requests in inbound emails (implies user owes something)
 */
function detectRequestsInText(text: string): DetectedCommitment[] {
  const requestPatterns = [
    { pattern: /\bcan you\s+([^.!?]+)/gi, extract: 1 },
    { pattern: /\bcould you\s+([^.!?]+)/gi, extract: 1 },
    { pattern: /\bwould you\s+([^.!?]+)/gi, extract: 1 },
    { pattern: /\bplease\s+([^.!?]+)/gi, extract: 1 },
    { pattern: /\bwe need you to\s+([^.!?]+)/gi, extract: 1 },
    { pattern: /\bwe're waiting for\s+([^.!?]+)/gi, extract: 1 },
    { pattern: /\blet me know\s+([^.!?]*)/gi, extract: 0 },
  ];

  const commitments: DetectedCommitment[] = [];
  const seenDescriptions = new Set<string>();

  for (const { pattern, extract } of requestPatterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(text)) !== null) {
      const extractedText = extract > 0 ? match[extract] : match[0];
      if (!extractedText || extractedText.length < 5) continue;

      const description = cleanCommitmentDescription(extractedText);
      if (description.length < 10) continue;
      if (seenDescriptions.has(description.toLowerCase())) continue;
      seenDescriptions.add(description.toLowerCase());

      commitments.push({
        description,
        direction: "user_owes",
        priority: detectPriority(text, match[0]),
        confidence: 0.5, // Lower confidence for inferred commitments
        matchedPattern: pattern.source,
        sourceText: match[0],
      });
    }
  }

  return commitments;
}

// ============================================================================
// Commitment Persistence
// ============================================================================

/**
 * Save detected commitments to database
 */
export async function saveDetectedCommitments(
  userId: string,
  detected: DetectedCommitment[],
  source: {
    type: "email" | "calendar" | "manual";
    id: string;
    personId?: string;
    domain?: PersonDomain;
  },
  options?: {
    minConfidence?: number;
  }
): Promise<Commitment[]> {
  const minConfidence = options?.minConfidence ?? 0.6;
  const saved: Commitment[] = [];

  const highConfidence = detected.filter((c) => c.confidence >= minConfidence);

  for (const commitment of highConfidence) {
    const created = await createCommitment({
      id: crypto.randomUUID(),
      userId,
      personId: source.personId,
      description: commitment.description,
      direction: commitment.direction,
      status: "pending",
      priority: commitment.priority,
      dueDate: commitment.dueDate,
      sourceType: source.type,
      sourceId: source.id,
      promisedAt: new Date(),
    });

    saved.push(created);
  }

  return saved;
}

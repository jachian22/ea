/**
 * Domain Classifier Service
 *
 * Automatically classifies emails, people, and content into domains
 * (family, business, job, personal, other) based on user-defined rules.
 */

import {
  findDomainRulesByUserId,
  classifyEmailToDomain,
  classifyTextToDomain,
} from '~/data-access/domain-rules';
import type { PersonDomain, DomainRule } from '~/db/schema';

// ============================================================================
// Types
// ============================================================================

export interface ClassificationResult {
  domain: PersonDomain;
  confidence: 'rule' | 'heuristic' | 'default';
  matchedRule?: {
    id: string;
    ruleType: string;
    pattern: string;
  };
  reason: string;
}

export interface EmailClassificationInput {
  email: string;
  name?: string;
  subject?: string;
  body?: string;
}

// ============================================================================
// Well-Known Domain Heuristics
// ============================================================================

// Personal email domains (heuristic: likely personal/family)
const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'fastmail.com',
  'mail.com',
  'live.com',
  'msn.com',
];

// Business-related keywords
const BUSINESS_KEYWORDS = [
  'invoice',
  'payment',
  'contract',
  'proposal',
  'quote',
  'estimate',
  'deal',
  'client',
  'customer',
  'vendor',
  'supplier',
  'order',
  'purchase',
  'sales',
  'revenue',
  'profit',
  'margin',
  'budget',
];

// Job-related keywords
const JOB_KEYWORDS = [
  'meeting',
  'standup',
  'sprint',
  'jira',
  'slack',
  'roadmap',
  'deadline',
  'release',
  'deploy',
  'review',
  'feedback',
  'performance',
  '1:1',
  'one-on-one',
  'team',
  'project',
  'milestone',
  'quarterly',
];

// Family-related keywords
const FAMILY_KEYWORDS = [
  'birthday',
  'anniversary',
  'holiday',
  'vacation',
  'dinner',
  'family',
  'kids',
  'school',
  'doctor',
  'appointment',
  'home',
  'weekend',
  'trip',
  'gathering',
];

// ============================================================================
// Main Classification Functions
// ============================================================================

/**
 * Classify an email sender to a domain
 * Uses rules first, then falls back to heuristics
 */
export async function classifyEmail(
  userId: string,
  input: EmailClassificationInput
): Promise<ClassificationResult> {
  const { email, subject, body } = input;

  // Step 1: Try user-defined rules (highest priority)
  const ruledDomain = await classifyEmailToDomain(userId, email);
  if (ruledDomain) {
    const rules = await findDomainRulesByUserId(userId);
    const matchedRule = rules.find(
      (r) =>
        r.domain === ruledDomain &&
        (r.pattern.toLowerCase() === email.toLowerCase() ||
          email.toLowerCase().endsWith(r.pattern.toLowerCase()))
    );

    return {
      domain: ruledDomain,
      confidence: 'rule',
      matchedRule: matchedRule
        ? {
            id: matchedRule.id,
            ruleType: matchedRule.ruleType,
            pattern: matchedRule.pattern,
          }
        : undefined,
      reason: `Matched user rule: ${matchedRule?.pattern || ruledDomain}`,
    };
  }

  // Step 2: Try keyword rules on subject/body
  if (subject || body) {
    const text = [subject, body].filter(Boolean).join(' ');
    const keywordDomain = await classifyTextToDomain(userId, text);
    if (keywordDomain) {
      return {
        domain: keywordDomain,
        confidence: 'rule',
        reason: `Matched keyword rule in email content`,
      };
    }
  }

  // Step 3: Use heuristics based on email domain
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (emailDomain) {
    // Personal email domains suggest family/personal
    if (PERSONAL_EMAIL_DOMAINS.includes(emailDomain)) {
      return {
        domain: 'personal',
        confidence: 'heuristic',
        reason: `Personal email domain: ${emailDomain}`,
      };
    }

    // Corporate email domains suggest job
    // (any non-personal domain is likely work-related)
    return {
      domain: 'job',
      confidence: 'heuristic',
      reason: `Corporate email domain: ${emailDomain}`,
    };
  }

  // Step 4: Try content-based heuristics
  if (subject || body) {
    const text = [subject, body].filter(Boolean).join(' ').toLowerCase();

    // Check for family keywords
    for (const keyword of FAMILY_KEYWORDS) {
      if (text.includes(keyword)) {
        return {
          domain: 'family',
          confidence: 'heuristic',
          reason: `Contains family keyword: ${keyword}`,
        };
      }
    }

    // Check for business keywords
    for (const keyword of BUSINESS_KEYWORDS) {
      if (text.includes(keyword)) {
        return {
          domain: 'business',
          confidence: 'heuristic',
          reason: `Contains business keyword: ${keyword}`,
        };
      }
    }

    // Check for job keywords
    for (const keyword of JOB_KEYWORDS) {
      if (text.includes(keyword)) {
        return {
          domain: 'job',
          confidence: 'heuristic',
          reason: `Contains job keyword: ${keyword}`,
        };
      }
    }
  }

  // Step 5: Default to "other"
  return {
    domain: 'other',
    confidence: 'default',
    reason: 'No matching rules or heuristics',
  };
}

/**
 * Classify a person based on their email and any known context
 */
export async function classifyPerson(
  userId: string,
  email: string,
  context?: {
    company?: string;
    role?: string;
    recentSubjects?: string[];
  }
): Promise<ClassificationResult> {
  // First try email-based classification
  const emailResult = await classifyEmail(userId, {
    email,
    subject: context?.recentSubjects?.join(' '),
  });

  // If we got a rule match, use it
  if (emailResult.confidence === 'rule') {
    return emailResult;
  }

  // If we have company info, might indicate job/business
  if (context?.company) {
    // Check if company name suggests business vs job
    // This is a simple heuristic - could be improved
    return {
      domain: 'job',
      confidence: 'heuristic',
      reason: `Has company association: ${context.company}`,
    };
  }

  // Return the email-based result
  return emailResult;
}

/**
 * Batch classify multiple emails
 */
export async function classifyEmails(
  userId: string,
  emails: EmailClassificationInput[]
): Promise<Map<string, ClassificationResult>> {
  const results = new Map<string, ClassificationResult>();

  for (const email of emails) {
    const result = await classifyEmail(userId, email);
    results.set(email.email, result);
  }

  return results;
}

// ============================================================================
// Domain Statistics
// ============================================================================

export interface DomainStats {
  domain: PersonDomain;
  count: number;
  percentage: number;
}

/**
 * Calculate domain distribution from classification results
 */
export function calculateDomainStats(results: ClassificationResult[]): DomainStats[] {
  const counts = new Map<PersonDomain, number>();
  const domains: PersonDomain[] = ['family', 'business', 'job', 'personal', 'other'];

  // Initialize all domains with 0
  for (const domain of domains) {
    counts.set(domain, 0);
  }

  // Count occurrences
  for (const result of results) {
    counts.set(result.domain, (counts.get(result.domain) || 0) + 1);
  }

  // Calculate percentages
  const total = results.length || 1;
  return domains.map((domain) => ({
    domain,
    count: counts.get(domain) || 0,
    percentage: Math.round(((counts.get(domain) || 0) / total) * 100),
  }));
}

// ============================================================================
// Rule Suggestion
// ============================================================================

export interface RuleSuggestion {
  ruleType: 'email_domain' | 'email_address' | 'keyword';
  pattern: string;
  suggestedDomain: PersonDomain;
  reason: string;
  frequency: number;
}

/**
 * Suggest new domain rules based on classification patterns
 */
export function suggestDomainRules(
  classifiedEmails: Array<{
    email: string;
    classification: ClassificationResult;
    userOverride?: PersonDomain;
  }>
): RuleSuggestion[] {
  const suggestions: RuleSuggestion[] = [];
  const domainCounts = new Map<string, Map<PersonDomain, number>>();

  // Count domain occurrences per email domain
  for (const item of classifiedEmails) {
    const emailDomain = item.email.split('@')[1]?.toLowerCase();
    if (!emailDomain) continue;

    // Use user override if available, otherwise use classification
    const domain = item.userOverride || item.classification.domain;

    if (!domainCounts.has(emailDomain)) {
      domainCounts.set(emailDomain, new Map());
    }

    const counts = domainCounts.get(emailDomain)!;
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }

  // Generate suggestions for consistent patterns
  for (const [emailDomain, counts] of domainCounts) {
    // Skip personal email domains (too generic)
    if (PERSONAL_EMAIL_DOMAINS.includes(emailDomain)) continue;

    // Find the dominant domain for this email domain
    let maxDomain: PersonDomain = 'other';
    let maxCount = 0;
    let totalCount = 0;

    for (const [domain, count] of counts) {
      totalCount += count;
      if (count > maxCount) {
        maxCount = count;
        maxDomain = domain;
      }
    }

    // If >80% of emails from this domain are classified the same way
    // and we have at least 3 examples, suggest a rule
    if (totalCount >= 3 && maxCount / totalCount >= 0.8) {
      suggestions.push({
        ruleType: 'email_domain',
        pattern: `@${emailDomain}`,
        suggestedDomain: maxDomain,
        reason: `${maxCount}/${totalCount} emails from this domain are ${maxDomain}`,
        frequency: maxCount,
      });
    }
  }

  // Sort by frequency (most common first)
  return suggestions.sort((a, b) => b.frequency - a.frequency);
}

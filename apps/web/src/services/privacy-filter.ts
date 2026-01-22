/**
 * Privacy Filter Service
 *
 * Controls what data can be sent to cloud AI services.
 * Provides filtering and redaction capabilities.
 */

import {
  findPrivacySettingsByUserId,
  findOrCreatePrivacySettings,
} from "~/data-access/privacy-settings";
import { findPersonById } from "~/data-access/persons";
import type {
  Person,
  Commitment,
  Interaction,
  PrivacySettings,
  PersonDomain,
} from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

export interface PrivacyCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface RedactionResult {
  original: string;
  redacted: string;
  redactionsApplied: number;
}

export interface FilterableEntity {
  id?: string;
  personId?: string | null;
  domain?: PersonDomain | null;
  email?: string;
  userId?: string;
}

// ============================================================================
// Privacy Filter Class
// ============================================================================

export class PrivacyFilter {
  private settings: PrivacySettings;
  private cachedPersonDomains: Map<string, PersonDomain | null> = new Map();

  constructor(settings: PrivacySettings) {
    this.settings = settings;
  }

  /**
   * Create a PrivacyFilter instance for a user
   */
  static async forUser(userId: string): Promise<PrivacyFilter> {
    const settings = await findOrCreatePrivacySettings(userId);
    return new PrivacyFilter(settings);
  }

  /**
   * Check if cloud AI is allowed at all
   */
  isCloudAIAllowed(): boolean {
    return this.settings.allowCloudAI;
  }

  /**
   * Check if a specific domain is excluded
   */
  isDomainExcluded(domain: PersonDomain): boolean {
    return (this.settings.excludedDomains || []).includes(domain);
  }

  /**
   * Check if a specific person is excluded
   */
  isPersonExcluded(personId: string): boolean {
    return (this.settings.excludedPersonIds || []).includes(personId);
  }

  /**
   * Check if an email domain is excluded
   */
  isEmailDomainExcluded(email: string): boolean {
    const emailDomain = email.split("@")[1]?.toLowerCase();
    if (!emailDomain) return false;

    return (this.settings.excludedEmailDomains || []).some(
      (excluded) => emailDomain === excluded.toLowerCase()
    );
  }

  /**
   * Check if an entity can be sent to cloud AI
   */
  async canSendToCloud(entity: FilterableEntity): Promise<PrivacyCheckResult> {
    // Master switch
    if (!this.settings.allowCloudAI) {
      return {
        allowed: false,
        reason: "Cloud AI is disabled in privacy settings",
      };
    }

    // Check email domain
    if (entity.email && this.isEmailDomainExcluded(entity.email)) {
      return {
        allowed: false,
        reason: `Email domain is in exclusion list`,
      };
    }

    // Check person exclusion
    if (entity.personId && this.isPersonExcluded(entity.personId)) {
      return {
        allowed: false,
        reason: "Person is in exclusion list",
      };
    }

    // Check domain exclusion
    if (entity.domain && this.isDomainExcluded(entity.domain)) {
      return {
        allowed: false,
        reason: `Domain '${entity.domain}' is excluded`,
      };
    }

    // If entity has personId but no domain, look up the person's domain
    if (entity.personId && !entity.domain) {
      const personDomain = await this.getPersonDomain(entity.personId);
      if (personDomain && this.isDomainExcluded(personDomain)) {
        return {
          allowed: false,
          reason: `Person's domain '${personDomain}' is excluded`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Sanitize text by applying redaction patterns
   */
  sanitize(text: string): RedactionResult {
    let redacted = text;
    let redactionsApplied = 0;

    const patterns = this.settings.redactPatterns || [];

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, "gi");
        const matches = redacted.match(regex);
        if (matches) {
          redactionsApplied += matches.length;
          redacted = redacted.replace(regex, "[REDACTED]");
        }
      } catch (e) {
        // Invalid regex pattern, skip it
        console.warn(`Invalid redaction pattern: ${pattern}`);
      }
    }

    return {
      original: text,
      redacted,
      redactionsApplied,
    };
  }

  /**
   * Filter a list of entities, returning only those allowed for cloud
   */
  async filterForCloud<T extends FilterableEntity>(entities: T[]): Promise<T[]> {
    const results: T[] = [];

    for (const entity of entities) {
      const check = await this.canSendToCloud(entity);
      if (check.allowed) {
        results.push(entity);
      }
    }

    return results;
  }

  /**
   * Filter persons for cloud
   */
  async filterPersonsForCloud(persons: Person[]): Promise<Person[]> {
    return this.filterForCloud(
      persons.map((p) => ({
        ...p,
        personId: p.id,
        domain: p.domain as PersonDomain,
      }))
    );
  }

  /**
   * Filter commitments for cloud
   */
  async filterCommitmentsForCloud(
    commitments: Commitment[]
  ): Promise<Commitment[]> {
    return this.filterForCloud(commitments);
  }

  /**
   * Filter interactions for cloud
   */
  async filterInteractionsForCloud(
    interactions: Interaction[]
  ): Promise<Interaction[]> {
    return this.filterForCloud(interactions);
  }

  /**
   * Prepare entity for cloud - check permissions and redact sensitive data
   */
  async prepareForCloud<T extends FilterableEntity & { description?: string }>(
    entity: T
  ): Promise<{ entity: T; allowed: boolean; reason?: string }> {
    const check = await this.canSendToCloud(entity);

    if (!check.allowed) {
      return { entity, allowed: false, reason: check.reason };
    }

    // Apply redaction to description if present
    if (entity.description) {
      const redacted = this.sanitize(entity.description);
      return {
        entity: { ...entity, description: redacted.redacted },
        allowed: true,
      };
    }

    return { entity, allowed: true };
  }

  /**
   * Get person's domain (with caching)
   */
  private async getPersonDomain(
    personId: string
  ): Promise<PersonDomain | null> {
    if (this.cachedPersonDomains.has(personId)) {
      return this.cachedPersonDomains.get(personId) || null;
    }

    const person = await findPersonById(personId);
    const domain = (person?.domain as PersonDomain) || null;
    this.cachedPersonDomains.set(personId, domain);
    return domain;
  }

  /**
   * Get current settings
   */
  getSettings(): PrivacySettings {
    return this.settings;
  }

  /**
   * Clear the person domain cache
   */
  clearCache(): void {
    this.cachedPersonDomains.clear();
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick check if content can be sent to cloud for a user
 */
export async function canSendToCloudForUser(
  userId: string,
  entity: FilterableEntity
): Promise<PrivacyCheckResult> {
  const filter = await PrivacyFilter.forUser(userId);
  return filter.canSendToCloud(entity);
}

/**
 * Quick filter entities for cloud for a user
 */
export async function filterEntitiesForCloud<T extends FilterableEntity>(
  userId: string,
  entities: T[]
): Promise<T[]> {
  const filter = await PrivacyFilter.forUser(userId);
  return filter.filterForCloud(entities);
}

/**
 * Sanitize text for a user
 */
export async function sanitizeTextForUser(
  userId: string,
  text: string
): Promise<RedactionResult> {
  const filter = await PrivacyFilter.forUser(userId);
  return filter.sanitize(text);
}

// ============================================================================
// Common Redaction Patterns
// ============================================================================

/**
 * Get common redaction pattern suggestions
 */
export function getCommonRedactionPatterns(): Array<{
  pattern: string;
  description: string;
  category: string;
}> {
  return [
    {
      pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
      description: "Social Security Numbers (XXX-XX-XXXX)",
      category: "PII",
    },
    {
      pattern: "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b",
      description: "Credit Card Numbers",
      category: "Financial",
    },
    {
      pattern: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b",
      description: "Email Addresses",
      category: "Contact",
    },
    {
      pattern: "\\b\\d{10}\\b|\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b",
      description: "Phone Numbers",
      category: "Contact",
    },
    {
      pattern:
        "\\$\\s?\\d{1,3}(,\\d{3})*(\\.\\d{2})?|\\d{1,3}(,\\d{3})*(\\.\\d{2})?\\s?(USD|dollars?)",
      description: "Dollar Amounts",
      category: "Financial",
    },
    {
      pattern: "\\b[A-Z]{2}\\d{6,9}\\b",
      description: "Passport Numbers",
      category: "PII",
    },
  ];
}

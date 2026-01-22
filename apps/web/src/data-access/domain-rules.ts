import { eq, and, desc, asc } from "drizzle-orm";
import { database } from "~/db";
import {
  domainRule,
  type DomainRule,
  type CreateDomainRuleData,
  type UpdateDomainRuleData,
  type DomainRuleType,
  type PersonDomain,
} from "~/db/schema";

// ============================================================================
// Domain Rule CRUD
// ============================================================================

/**
 * Create a new domain rule
 */
export async function createDomainRule(
  data: CreateDomainRuleData
): Promise<DomainRule> {
  const [newRule] = await database
    .insert(domainRule)
    .values(data)
    .returning();

  return newRule;
}

/**
 * Find domain rule by ID
 */
export async function findDomainRuleById(
  id: string
): Promise<DomainRule | null> {
  const [result] = await database
    .select()
    .from(domainRule)
    .where(eq(domainRule.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find all domain rules for a user
 */
export async function findDomainRulesByUserId(
  userId: string
): Promise<DomainRule[]> {
  const results = await database
    .select()
    .from(domainRule)
    .where(eq(domainRule.userId, userId))
    .orderBy(desc(domainRule.priority), desc(domainRule.createdAt));

  return results;
}

/**
 * Find domain rules by type
 */
export async function findDomainRulesByType(
  userId: string,
  ruleType: DomainRuleType
): Promise<DomainRule[]> {
  const results = await database
    .select()
    .from(domainRule)
    .where(
      and(eq(domainRule.userId, userId), eq(domainRule.ruleType, ruleType))
    )
    .orderBy(desc(domainRule.priority));

  return results;
}

/**
 * Find domain rules by target domain
 */
export async function findDomainRulesByDomain(
  userId: string,
  domain: PersonDomain
): Promise<DomainRule[]> {
  const results = await database
    .select()
    .from(domainRule)
    .where(and(eq(domainRule.userId, userId), eq(domainRule.domain, domain)))
    .orderBy(desc(domainRule.priority));

  return results;
}

/**
 * Find domain rule by pattern (case insensitive)
 */
export async function findDomainRuleByPattern(
  userId: string,
  pattern: string
): Promise<DomainRule | null> {
  const rules = await findDomainRulesByUserId(userId);
  const normalizedPattern = pattern.toLowerCase();

  const match = rules.find(
    (rule) => rule.pattern.toLowerCase() === normalizedPattern
  );

  return match || null;
}

/**
 * Update a domain rule
 */
export async function updateDomainRule(
  id: string,
  data: UpdateDomainRuleData
): Promise<DomainRule | null> {
  const [updated] = await database
    .update(domainRule)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(domainRule.id, id))
    .returning();

  return updated || null;
}

/**
 * Delete a domain rule
 */
export async function deleteDomainRule(id: string): Promise<boolean> {
  const [deleted] = await database
    .delete(domainRule)
    .where(eq(domainRule.id, id))
    .returning();

  return deleted !== undefined;
}

// ============================================================================
// Domain Classification Logic
// ============================================================================

/**
 * Classify an email address to a domain based on user's rules
 * Returns the domain if a rule matches, null otherwise
 */
export async function classifyEmailToDomain(
  userId: string,
  email: string
): Promise<PersonDomain | null> {
  const rules = await findDomainRulesByUserId(userId);
  const normalizedEmail = email.toLowerCase();
  const emailDomain = normalizedEmail.split("@")[1];

  // Sort by priority (already sorted from DB) and find matching rule
  for (const rule of rules) {
    const pattern = rule.pattern.toLowerCase();

    switch (rule.ruleType) {
      case "email_address":
        if (normalizedEmail === pattern) {
          return rule.domain;
        }
        break;

      case "email_domain":
        // Pattern like "@company.com" or "company.com"
        const domainPattern = pattern.startsWith("@")
          ? pattern.slice(1)
          : pattern;
        if (emailDomain === domainPattern) {
          return rule.domain;
        }
        break;

      case "keyword":
        // Check if keyword is in the email
        if (normalizedEmail.includes(pattern)) {
          return rule.domain;
        }
        break;
    }
  }

  return null;
}

/**
 * Classify text content (like email subject) to a domain based on keyword rules
 */
export async function classifyTextToDomain(
  userId: string,
  text: string
): Promise<PersonDomain | null> {
  const keywordRules = await findDomainRulesByType(userId, "keyword");
  const normalizedText = text.toLowerCase();

  for (const rule of keywordRules) {
    if (normalizedText.includes(rule.pattern.toLowerCase())) {
      return rule.domain;
    }
  }

  return null;
}

/**
 * Get all email domain patterns for a specific domain classification
 */
export async function getEmailDomainsForClassification(
  userId: string,
  domain: PersonDomain
): Promise<string[]> {
  const rules = await database
    .select()
    .from(domainRule)
    .where(
      and(
        eq(domainRule.userId, userId),
        eq(domainRule.domain, domain),
        eq(domainRule.ruleType, "email_domain")
      )
    );

  return rules.map((rule) =>
    rule.pattern.startsWith("@") ? rule.pattern.slice(1) : rule.pattern
  );
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Create multiple domain rules at once
 */
export async function createDomainRules(
  rules: CreateDomainRuleData[]
): Promise<DomainRule[]> {
  if (rules.length === 0) return [];

  const newRules = await database
    .insert(domainRule)
    .values(rules)
    .returning();

  return newRules;
}

/**
 * Delete all domain rules for a user
 */
export async function deleteAllDomainRulesForUser(
  userId: string
): Promise<number> {
  const deleted = await database
    .delete(domainRule)
    .where(eq(domainRule.userId, userId))
    .returning();

  return deleted.length;
}

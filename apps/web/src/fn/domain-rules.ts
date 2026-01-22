import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authenticatedMiddleware } from "./middleware";
import {
  createDomainRule,
  findDomainRulesByUserId,
  findDomainRuleById,
  updateDomainRule,
  deleteDomainRule,
  createDomainRules,
} from "~/data-access/domain-rules";

// ============================================================================
// Create Domain Rule
// ============================================================================

export const createDomainRuleFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      ruleType: z.enum(["email_domain", "email_address", "person", "keyword"]),
      pattern: z.string().min(1, "Pattern is required"),
      domain: z.enum(["family", "business", "job", "personal", "other"]),
      priority: z.number().min(0).max(100).optional().default(0),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const rule = await createDomainRule({
        id: crypto.randomUUID(),
        userId,
        ruleType: data.ruleType,
        pattern: data.pattern,
        domain: data.domain,
        priority: data.priority,
      });

      return {
        success: true,
        data: rule,
        error: null,
      };
    } catch (error) {
      console.error("Failed to create domain rule:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to create domain rule",
      };
    }
  });

// ============================================================================
// Get Domain Rules
// ============================================================================

export const getDomainRulesFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const rules = await findDomainRulesByUserId(userId);

      return {
        success: true,
        data: rules,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get domain rules:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get domain rules",
      };
    }
  });

// ============================================================================
// Update Domain Rule
// ============================================================================

export const updateDomainRuleFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      pattern: z.string().min(1).optional(),
      domain: z.enum(["family", "business", "job", "personal", "other"]).optional(),
      priority: z.number().min(0).max(100).optional(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const existing = await findDomainRuleById(data.id);

      if (!existing || existing.userId !== userId) {
        return {
          success: false,
          data: null,
          error: "Domain rule not found",
        };
      }

      const updated = await updateDomainRule(data.id, {
        pattern: data.pattern,
        domain: data.domain,
        priority: data.priority,
      });

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to update domain rule:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to update domain rule",
      };
    }
  });

// ============================================================================
// Delete Domain Rule
// ============================================================================

export const deleteDomainRuleFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const existing = await findDomainRuleById(data.id);

      if (!existing || existing.userId !== userId) {
        return {
          success: false,
          error: "Domain rule not found",
        };
      }

      await deleteDomainRule(data.id);

      return {
        success: true,
        error: null,
      };
    } catch (error) {
      console.error("Failed to delete domain rule:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete domain rule",
      };
    }
  });

// ============================================================================
// Bulk Create Domain Rules
// ============================================================================

export const bulkCreateDomainRulesFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      rules: z.array(
        z.object({
          ruleType: z.enum(["email_domain", "email_address", "person", "keyword"]),
          pattern: z.string().min(1),
          domain: z.enum(["family", "business", "job", "personal", "other"]),
          priority: z.number().min(0).max(100).optional().default(0),
        })
      ),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const rulesWithIds = data.rules.map((rule) => ({
        id: crypto.randomUUID(),
        userId,
        ruleType: rule.ruleType,
        pattern: rule.pattern,
        domain: rule.domain,
        priority: rule.priority,
      }));

      const created = await createDomainRules(rulesWithIds);

      return {
        success: true,
        data: created,
        error: null,
      };
    } catch (error) {
      console.error("Failed to bulk create domain rules:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to create domain rules",
      };
    }
  });

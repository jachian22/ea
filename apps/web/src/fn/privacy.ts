import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authenticatedMiddleware } from "./middleware";
import {
  findOrCreatePrivacySettings,
  updatePrivacySettings,
  addExcludedDomain,
  removeExcludedDomain,
  addExcludedPerson,
  removeExcludedPerson,
  addExcludedEmailDomain,
  removeExcludedEmailDomain,
  addRedactPattern,
  removeRedactPattern,
  setCloudAIPermission,
} from "~/data-access/privacy-settings";
import { getCommonRedactionPatterns } from "~/services/privacy-filter";

// ============================================================================
// Get Privacy Settings
// ============================================================================

export const getPrivacySettingsFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const settings = await findOrCreatePrivacySettings(userId);

      return {
        success: true,
        data: settings,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get privacy settings:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get privacy settings",
      };
    }
  });

// ============================================================================
// Update Privacy Settings
// ============================================================================

export const updatePrivacySettingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      allowCloudAI: z.boolean().optional(),
      excludedDomains: z
        .array(z.enum(["family", "business", "job", "personal", "other"]))
        .optional(),
      excludedPersonIds: z.array(z.string()).optional(),
      excludedEmailDomains: z.array(z.string()).optional(),
      redactPatterns: z.array(z.string()).optional(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const settings = await findOrCreatePrivacySettings(userId);
      const updated = await updatePrivacySettings(settings.id, data);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to update privacy settings:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to update privacy settings",
      };
    }
  });

// ============================================================================
// Toggle Cloud AI Permission
// ============================================================================

export const setCloudAIPermissionFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      allow: z.boolean(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const updated = await setCloudAIPermission(userId, data.allow);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to set cloud AI permission:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to set cloud AI permission",
      };
    }
  });

// ============================================================================
// Add Excluded Domain
// ============================================================================

export const addExcludedDomainFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      domain: z.enum(["family", "business", "job", "personal", "other"]),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const updated = await addExcludedDomain(userId, data.domain);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to add excluded domain:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to add excluded domain",
      };
    }
  });

// ============================================================================
// Remove Excluded Domain
// ============================================================================

export const removeExcludedDomainFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      domain: z.enum(["family", "business", "job", "personal", "other"]),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const updated = await removeExcludedDomain(userId, data.domain);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to remove excluded domain:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to remove excluded domain",
      };
    }
  });

// ============================================================================
// Add Excluded Person
// ============================================================================

export const addExcludedPersonFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      personId: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const updated = await addExcludedPerson(userId, data.personId);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to add excluded person:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to add excluded person",
      };
    }
  });

// ============================================================================
// Remove Excluded Person
// ============================================================================

export const removeExcludedPersonFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      personId: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const updated = await removeExcludedPerson(userId, data.personId);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to remove excluded person:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to remove excluded person",
      };
    }
  });

// ============================================================================
// Add Excluded Email Domain
// ============================================================================

export const addExcludedEmailDomainFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      emailDomain: z.string().min(1),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const updated = await addExcludedEmailDomain(userId, data.emailDomain);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to add excluded email domain:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to add excluded email domain",
      };
    }
  });

// ============================================================================
// Remove Excluded Email Domain
// ============================================================================

export const removeExcludedEmailDomainFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      emailDomain: z.string().min(1),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const updated = await removeExcludedEmailDomain(userId, data.emailDomain);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to remove excluded email domain:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to remove excluded email domain",
      };
    }
  });

// ============================================================================
// Add Redact Pattern
// ============================================================================

export const addRedactPatternFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      pattern: z.string().min(1),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      // Validate regex pattern
      try {
        new RegExp(data.pattern, "gi");
      } catch {
        return {
          success: false,
          data: null,
          error: "Invalid regex pattern",
        };
      }

      const updated = await addRedactPattern(userId, data.pattern);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to add redact pattern:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to add redact pattern",
      };
    }
  });

// ============================================================================
// Remove Redact Pattern
// ============================================================================

export const removeRedactPatternFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      pattern: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const updated = await removeRedactPattern(userId, data.pattern);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to remove redact pattern:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to remove redact pattern",
      };
    }
  });

// ============================================================================
// Get Common Redaction Pattern Suggestions
// ============================================================================

export const getRedactionPatternSuggestionsFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .handler(async () => {
    try {
      const suggestions = getCommonRedactionPatterns();

      return {
        success: true,
        data: suggestions,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get redaction pattern suggestions:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get suggestions",
      };
    }
  });

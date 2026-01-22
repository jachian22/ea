import {
  findActionTypeById,
  findActionTypeByName,
  findAllActionTypes,
  seedBuiltInActionTypes,
} from "~/data-access/action-types";
import {
  findAuthoritySettingByUserAndActionType,
  getEffectiveAuthorityLevel,
  initializeUserAuthoritySettings,
  upsertAuthoritySetting,
} from "~/data-access/authority-settings";
import {
  createActionLog,
  findActionLogById,
  approveAction,
  rejectAction,
  markActionExecuted,
  markActionFailed,
  markActionReversed,
  addUserFeedback,
  findPendingApprovals,
  getPendingApprovalCount,
  getActionLogStats,
} from "~/data-access/action-logs";
import type {
  ActionType,
  ActionLog,
  AuthoritySetting,
  AuthorityLevel,
  ActionLogStatus,
  ActionTargetType,
  ActionLogMetadata,
  AuthorityConditions,
  UserFeedback,
} from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

export type ActionRequest = {
  actionTypeName: string;
  targetType: ActionTargetType;
  targetId: string;
  description: string;
  payload?: Record<string, unknown>;
  confidenceScore?: number; // 0-100
  metadata?: ActionLogMetadata;
};

export type ActionDecision = {
  shouldExecute: boolean;
  authorityLevel: AuthorityLevel;
  requiresApproval: boolean;
  actionLog: ActionLog | null;
  reason: string;
};

export type AuthorityCheckResult = {
  authorityLevel: AuthorityLevel;
  isUserOverride: boolean;
  conditions: AuthorityConditions | null;
  conditionsMet: boolean;
  conditionsFailureReason?: string;
};

// ============================================================================
// Authority Service
// ============================================================================

/**
 * Initialize the authority system for a new user
 * Seeds built-in action types and creates default settings
 */
export async function initializeAuthorityForUser(userId: string): Promise<{
  actionTypesSeeded: number;
  settingsCreated: number;
}> {
  // Ensure built-in action types exist
  const { created, existing } = await seedBuiltInActionTypes();
  
  // Initialize user authority settings with defaults
  const settings = await initializeUserAuthoritySettings(userId);
  
  return {
    actionTypesSeeded: created,
    settingsCreated: settings.length,
  };
}

/**
 * Check authority level for a specific action
 * Evaluates user settings and conditions
 */
export async function checkAuthority(
  userId: string,
  actionTypeName: string,
  context?: {
    senderEmail?: string;
    senderDomain?: string;
    currentTime?: Date;
    importanceScore?: number;
    isVip?: boolean;
    customFields?: Record<string, unknown>;
  }
): Promise<AuthorityCheckResult> {
  // Find the action type
  const type = await findActionTypeByName(actionTypeName);
  if (!type) {
    throw new Error("Unknown action type: " + actionTypeName);
  }

  // Get effective authority level
  const { authorityLevel, isUserOverride, conditions } = 
    await getEffectiveAuthorityLevel(userId, type.id);

  // If disabled, short-circuit
  if (authorityLevel === "disabled") {
    return {
      authorityLevel,
      isUserOverride,
      conditions,
      conditionsMet: false,
      conditionsFailureReason: "Action type is disabled",
    };
  }

  // If no conditions or no context, conditions are considered met
  if (!conditions || !context) {
    return {
      authorityLevel,
      isUserOverride,
      conditions,
      conditionsMet: true,
    };
  }

  // Evaluate conditions
  const conditionResult = evaluateConditions(conditions, context);

  return {
    authorityLevel,
    isUserOverride,
    conditions,
    conditionsMet: conditionResult.met,
    conditionsFailureReason: conditionResult.reason,
  };
}

/**
 * Evaluate authority conditions against context
 */
function evaluateConditions(
  conditions: AuthorityConditions,
  context: {
    senderEmail?: string;
    senderDomain?: string;
    currentTime?: Date;
    importanceScore?: number;
    isVip?: boolean;
    customFields?: Record<string, unknown>;
  }
): { met: boolean; reason?: string } {
  // Check time window
  if (conditions.timeWindow && context.currentTime) {
    const currentHour = context.currentTime.getHours();
    const currentMinute = context.currentTime.getMinutes();
    const currentTimeStr = String(currentHour).padStart(2, "0") + ":" + String(currentMinute).padStart(2, "0");
    
    const startTime = conditions.timeWindow.start;
    const endTime = conditions.timeWindow.end;
    
    if (currentTimeStr < startTime || currentTimeStr > endTime) {
      return {
        met: false,
        reason: "Outside allowed time window (" + startTime + " - " + endTime + ")",
      };
    }
  }

  // Check allowed domains
  if (conditions.allowedDomains && conditions.allowedDomains.length > 0 && context.senderDomain) {
    const domainAllowed = conditions.allowedDomains.some(
      (d) => context.senderDomain?.toLowerCase().includes(d.toLowerCase())
    );
    if (!domainAllowed) {
      return {
        met: false,
        reason: "Sender domain not in allowed list",
      };
    }
  }

  // Check blocked domains
  if (conditions.blockedDomains && conditions.blockedDomains.length > 0 && context.senderDomain) {
    const domainBlocked = conditions.blockedDomains.some(
      (d) => context.senderDomain?.toLowerCase().includes(d.toLowerCase())
    );
    if (domainBlocked) {
      return {
        met: false,
        reason: "Sender domain is blocked",
      };
    }
  }

  // Check VIP requirement
  if (conditions.vipOnly && !context.isVip) {
    return {
      met: false,
      reason: "VIP status required",
    };
  }

  // Check confidence threshold
  if (conditions.minConfidence !== undefined && context.importanceScore !== undefined) {
    if (context.importanceScore < conditions.minConfidence * 100) {
      return {
        met: false,
        reason: "Confidence score below threshold (" + context.importanceScore + " < " + (conditions.minConfidence * 100) + ")",
      };
    }
  }

  // Check custom rules
  if (conditions.customRules && conditions.customRules.length > 0 && context.customFields) {
    for (const rule of conditions.customRules) {
      const fieldValue = context.customFields[rule.field];
      if (fieldValue === undefined) continue;

      let rulePassed = false;
      switch (rule.operator) {
        case "equals":
          rulePassed = fieldValue === rule.value;
          break;
        case "contains":
          rulePassed = String(fieldValue).includes(String(rule.value));
          break;
        case "matches":
          rulePassed = new RegExp(String(rule.value)).test(String(fieldValue));
          break;
        case "gt":
          rulePassed = Number(fieldValue) > Number(rule.value);
          break;
        case "lt":
          rulePassed = Number(fieldValue) < Number(rule.value);
          break;
      }

      if (!rulePassed) {
        return {
          met: false,
          reason: "Custom rule failed: " + rule.field + " " + rule.operator + " " + rule.value,
        };
      }
    }
  }

  return { met: true };
}

/**
 * Process an action request and decide what to do
 */
export async function processActionRequest(
  userId: string,
  request: ActionRequest
): Promise<ActionDecision> {
  // Find the action type
  const type = await findActionTypeByName(request.actionTypeName);
  if (!type) {
    return {
      shouldExecute: false,
      authorityLevel: "disabled",
      requiresApproval: false,
      actionLog: null,
      reason: "Unknown action type: " + request.actionTypeName,
    };
  }

  // Check authority
  const authorityCheck = await checkAuthority(userId, request.actionTypeName, {
    currentTime: new Date(),
  });

  // If disabled, don't proceed
  if (authorityCheck.authorityLevel === "disabled") {
    return {
      shouldExecute: false,
      authorityLevel: "disabled",
      requiresApproval: false,
      actionLog: null,
      reason: "Action type is disabled for this user",
    };
  }

  // If conditions not met, fall back to ask_first
  const effectiveLevel = authorityCheck.conditionsMet
    ? authorityCheck.authorityLevel
    : "ask_first";

  // Determine initial status based on authority level
  let initialStatus: ActionLogStatus;
  let shouldExecute: boolean;
  let requiresApproval: boolean;

  switch (effectiveLevel) {
    case "full_auto":
      initialStatus = "approved"; // Will be changed to "executed" after execution
      shouldExecute = true;
      requiresApproval = false;
      break;
    case "draft_approve":
      initialStatus = "pending_approval";
      shouldExecute = false;
      requiresApproval = true;
      break;
    case "ask_first":
      initialStatus = "pending_approval";
      shouldExecute = false;
      requiresApproval = true;
      break;
    default:
      initialStatus = "pending_approval";
      shouldExecute = false;
      requiresApproval = true;
  }

  // Create the action log
  const actionLog = await createActionLog({
    userId,
    actionTypeId: type.id,
    authorityLevel: effectiveLevel,
    status: initialStatus,
    targetType: request.targetType,
    targetId: request.targetId,
    description: request.description,
    payload: request.payload,
    confidenceScore: request.confidenceScore,
    metadata: {
      ...request.metadata,
      triggeredBy: "auto",
      confidenceFactors: request.metadata?.confidenceFactors,
    },
  });

  return {
    shouldExecute,
    authorityLevel: effectiveLevel,
    requiresApproval,
    actionLog,
    reason: shouldExecute
      ? "Action approved for automatic execution"
      : requiresApproval
        ? "Action requires user approval"
        : "Action cannot be executed",
  };
}

/**
 * Execute an approved action
 * This should be called after processActionRequest when shouldExecute is true
 * or after user approval
 */
export async function executeAction(
  actionLogId: string,
  executor: () => Promise<{ success: boolean; error?: string }>
): Promise<{
  success: boolean;
  actionLog: ActionLog | null;
  error?: string;
}> {
  const log = await findActionLogById(actionLogId);
  if (!log) {
    return {
      success: false,
      actionLog: null,
      error: "Action log not found",
    };
  }

  // Check if action is in a state that can be executed
  if (log.status !== "approved" && log.status !== "pending_approval") {
    return {
      success: false,
      actionLog: log,
      error: "Action cannot be executed in status: " + log.status,
    };
  }

  try {
    // Execute the action
    const result = await executor();

    if (result.success) {
      const updated = await markActionExecuted(actionLogId);
      return {
        success: true,
        actionLog: updated,
      };
    } else {
      const updated = await markActionFailed(actionLogId, result.error || "Unknown error");
      return {
        success: false,
        actionLog: updated,
        error: result.error,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const updated = await markActionFailed(actionLogId, errorMessage);
    return {
      success: false,
      actionLog: updated,
      error: errorMessage,
    };
  }
}

/**
 * Approve an action manually
 */
export async function approveActionManually(
  actionLogId: string,
  editedContent?: string
): Promise<ActionLog | null> {
  const log = await findActionLogById(actionLogId);
  if (!log) return null;

  const metadata: Partial<ActionLogMetadata> = {};
  if (editedContent) {
    metadata.editedContent = editedContent;
  }

  return approveAction(actionLogId, Object.keys(metadata).length > 0 ? metadata : undefined);
}

/**
 * Reject an action manually
 */
export async function rejectActionManually(
  actionLogId: string,
  reason?: string
): Promise<ActionLog | null> {
  return rejectAction(actionLogId, reason);
}

/**
 * Reverse an executed action
 */
export async function reverseAction(
  actionLogId: string,
  reversedBy: "user" | "system",
  reason?: string
): Promise<ActionLog | null> {
  return markActionReversed(actionLogId, reversedBy, reason);
}

/**
 * Submit user feedback for an action
 */
export async function submitActionFeedback(
  actionLogId: string,
  feedback: UserFeedback
): Promise<ActionLog | null> {
  return addUserFeedback(actionLogId, feedback);
}

/**
 * Get pending actions for a user
 */
export async function getPendingActionsForUser(
  userId: string,
  limit: number = 50
): Promise<Array<ActionLog & { actionType: ActionType }>> {
  return findPendingApprovals(userId, limit);
}

/**
 * Get count of pending actions for a user
 */
export async function getPendingActionCount(userId: string): Promise<number> {
  return getPendingApprovalCount(userId);
}

/**
 * Get action statistics for a user
 */
export async function getActionStatistics(
  userId: string,
  since?: Date
): Promise<ReturnType<typeof getActionLogStats>> {
  return getActionLogStats(userId, since);
}

/**
 * Update authority setting for a user
 */
export async function updateUserAuthoritySetting(
  userId: string,
  actionTypeName: string,
  authorityLevel: AuthorityLevel,
  conditions?: AuthorityConditions
): Promise<AuthoritySetting> {
  const type = await findActionTypeByName(actionTypeName);
  if (!type) {
    throw new Error("Unknown action type: " + actionTypeName);
  }

  return upsertAuthoritySetting(userId, type.id, authorityLevel, conditions);
}

/**
 * Disable all automation for a user (emergency stop)
 */
export async function disableAllAutomation(
  userId: string
): Promise<{ updated: number }> {
  const allTypes = await findAllActionTypes();
  let updated = 0;

  for (const type of allTypes) {
    await upsertAuthoritySetting(userId, type.id, "disabled");
    updated++;
  }

  return { updated };
}

/**
 * Enable automation with conservative defaults for a user
 */
export async function enableConservativeAutomation(
  userId: string
): Promise<{ updated: number }> {
  const allTypes = await findAllActionTypes();
  let updated = 0;

  for (const type of allTypes) {
    // Use ask_first for high risk, draft_approve for medium, default for low
    let level: AuthorityLevel;
    switch (type.riskLevel) {
      case "high":
        level = "ask_first";
        break;
      case "medium":
        level = "draft_approve";
        break;
      case "low":
        level = type.defaultAuthorityLevel;
        break;
      default:
        level = "ask_first";
    }

    await upsertAuthoritySetting(userId, type.id, level);
    updated++;
  }

  return { updated };
}

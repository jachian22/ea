import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authenticatedMiddleware } from './middleware';
import {
  initializeAuthorityForUser,
  checkAuthority,
  processActionRequest,
  executeAction,
  approveActionManually,
  rejectActionManually,
  reverseAction,
  submitActionFeedback,
  getPendingActionsForUser,
  getPendingActionCount,
  getActionStatistics,
  updateUserAuthoritySetting,
  disableAllAutomation,
  enableConservativeAutomation,
} from '~/services/authority-service';
import { findAllActionTypes, findActionTypesByCategory } from '~/data-access/action-types';
import {
  findAuthoritySettingsWithActionTypes,
  bulkUpdateAuthoritySettings,
} from '~/data-access/authority-settings';
import {
  findActionLogsWithActionType,
  batchApproveActions,
  batchRejectActions,
} from '~/data-access/action-logs';
import type { ActionCategory, AuthorityLevel, UserFeedback } from '~/db/schema';

// ============================================================================
// Schema Definitions
// ============================================================================

const authorityLevelSchema = z.enum(['full_auto', 'draft_approve', 'ask_first', 'disabled']);
const actionCategorySchema = z.enum(['calendar', 'email', 'task', 'notification']);
const userFeedbackSchema = z.enum(['correct', 'should_ask', 'should_auto', 'wrong']);

const authorityConditionsSchema = z
  .object({
    timeWindow: z
      .object({
        start: z.string(),
        end: z.string(),
        timezone: z.string().optional(),
      })
      .optional(),
    allowedDomains: z.array(z.string()).optional(),
    blockedDomains: z.array(z.string()).optional(),
    vipOnly: z.boolean().optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    customRules: z
      .array(
        z.object({
          field: z.string(),
          operator: z.enum(['equals', 'contains', 'matches', 'gt', 'lt']),
          value: z.union([z.string(), z.number()]),
        })
      )
      .optional(),
  })
  .optional();

// ============================================================================
// Action Types
// ============================================================================

/**
 * Get all available action types
 */
export const getActionTypesFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async () => {
    try {
      const actionTypes = await findAllActionTypes();
      return {
        success: true,
        data: actionTypes,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get action types:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get action types',
      };
    }
  });

/**
 * Get action types by category
 */
export const getActionTypesByCategoryFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      category: actionCategorySchema,
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data }) => {
    try {
      const actionTypes = await findActionTypesByCategory(data.category);
      return {
        success: true,
        data: actionTypes,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get action types by category:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get action types',
      };
    }
  });

// ============================================================================
// Authority Settings
// ============================================================================

/**
 * Get all authority settings for the current user
 */
export const getAuthoritySettingsFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const settings = await findAuthoritySettingsWithActionTypes(userId);
      return {
        success: true,
        data: settings,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get authority settings:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get authority settings',
      };
    }
  });

/**
 * Update a single authority setting
 */
export const updateAuthoritySettingFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      actionTypeName: z.string(),
      authorityLevel: authorityLevelSchema,
      conditions: authorityConditionsSchema,
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const setting = await updateUserAuthoritySetting(
        userId,
        data.actionTypeName,
        data.authorityLevel,
        data.conditions
      );
      return {
        success: true,
        data: setting,
        error: null,
      };
    } catch (error) {
      console.error('Failed to update authority setting:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to update authority setting',
      };
    }
  });

/**
 * Bulk update authority settings
 */
export const bulkUpdateAuthoritySettingsFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      updates: z.array(
        z.object({
          actionTypeId: z.string(),
          authorityLevel: authorityLevelSchema,
          conditions: authorityConditionsSchema,
        })
      ),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const settings = await bulkUpdateAuthoritySettings(userId, data.updates);
      return {
        success: true,
        data: settings,
        error: null,
      };
    } catch (error) {
      console.error('Failed to bulk update authority settings:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to update authority settings',
      };
    }
  });

/**
 * Initialize authority settings for a new user
 */
export const initializeAuthorityFn = createServerFn({ method: 'POST' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const result = await initializeAuthorityForUser(userId);
      return {
        success: true,
        data: result,
        error: null,
      };
    } catch (error) {
      console.error('Failed to initialize authority:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to initialize authority',
      };
    }
  });

/**
 * Disable all automation (emergency stop)
 */
export const disableAllAutomationFn = createServerFn({ method: 'POST' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const result = await disableAllAutomation(userId);
      return {
        success: true,
        data: result,
        error: null,
      };
    } catch (error) {
      console.error('Failed to disable automation:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to disable automation',
      };
    }
  });

/**
 * Enable conservative automation defaults
 */
export const enableConservativeAutomationFn = createServerFn({ method: 'POST' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const result = await enableConservativeAutomation(userId);
      return {
        success: true,
        data: result,
        error: null,
      };
    } catch (error) {
      console.error('Failed to enable automation:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to enable automation',
      };
    }
  });

// ============================================================================
// Action Logs / Approval Queue
// ============================================================================

/**
 * Get pending approvals for the current user
 */
export const getPendingApprovalsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        limit: z.number().min(1).max(100).optional().default(50),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const limit = data?.limit ?? 50;

    try {
      const pending = await getPendingActionsForUser(userId, limit);
      return {
        success: true,
        data: pending,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get pending approvals:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get pending approvals',
      };
    }
  });

/**
 * Get pending approval count
 */
export const getPendingApprovalCountFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const count = await getPendingActionCount(userId);
      return {
        success: true,
        data: { count },
        error: null,
      };
    } catch (error) {
      console.error('Failed to get pending approval count:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get count',
      };
    }
  });

/**
 * Get action log history
 */
export const getActionLogsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        limit: z.number().min(1).max(100).optional().default(50),
        status: z
          .enum(['pending_approval', 'approved', 'rejected', 'executed', 'failed', 'reversed'])
          .optional(),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const limit = data?.limit ?? 50;

    try {
      const logs = await findActionLogsWithActionType(userId, limit, data?.status);
      return {
        success: true,
        data: logs,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get action logs:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get action logs',
      };
    }
  });

/**
 * Get action statistics
 */
export const getActionStatsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        sinceDays: z.number().min(1).max(365).optional(),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    let since: Date | undefined;
    if (data?.sinceDays) {
      since = new Date();
      since.setDate(since.getDate() - data.sinceDays);
    }

    try {
      const stats = await getActionStatistics(userId, since);
      return {
        success: true,
        data: stats,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get action stats:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get stats',
      };
    }
  });

/**
 * Approve a single action
 */
export const approveActionFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      actionLogId: z.string(),
      editedContent: z.string().optional(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data }) => {
    try {
      const result = await approveActionManually(data.actionLogId, data.editedContent);
      if (!result) {
        return {
          success: false,
          data: null,
          error: 'Action not found or cannot be approved',
        };
      }
      return {
        success: true,
        data: result,
        error: null,
      };
    } catch (error) {
      console.error('Failed to approve action:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to approve action',
      };
    }
  });

/**
 * Reject a single action
 */
export const rejectActionFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      actionLogId: z.string(),
      reason: z.string().optional(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data }) => {
    try {
      const result = await rejectActionManually(data.actionLogId, data.reason);
      if (!result) {
        return {
          success: false,
          data: null,
          error: 'Action not found or cannot be rejected',
        };
      }
      return {
        success: true,
        data: result,
        error: null,
      };
    } catch (error) {
      console.error('Failed to reject action:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to reject action',
      };
    }
  });

/**
 * Batch approve multiple actions
 */
export const batchApproveActionsFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      actionLogIds: z.array(z.string()),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data }) => {
    try {
      const result = await batchApproveActions(data.actionLogIds);
      return {
        success: true,
        data: result,
        error: null,
      };
    } catch (error) {
      console.error('Failed to batch approve actions:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to batch approve actions',
      };
    }
  });

/**
 * Batch reject multiple actions
 */
export const batchRejectActionsFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      actionLogIds: z.array(z.string()),
      reason: z.string().optional(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data }) => {
    try {
      const result = await batchRejectActions(data.actionLogIds, data.reason);
      return {
        success: true,
        data: result,
        error: null,
      };
    } catch (error) {
      console.error('Failed to batch reject actions:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to batch reject actions',
      };
    }
  });

/**
 * Reverse an executed action
 */
export const reverseActionFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      actionLogId: z.string(),
      reason: z.string().optional(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data }) => {
    try {
      const result = await reverseAction(data.actionLogId, 'user', data.reason);
      if (!result) {
        return {
          success: false,
          data: null,
          error: 'Action not found or cannot be reversed',
        };
      }
      return {
        success: true,
        data: result,
        error: null,
      };
    } catch (error) {
      console.error('Failed to reverse action:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to reverse action',
      };
    }
  });

/**
 * Submit feedback for an action
 */
export const submitFeedbackFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      actionLogId: z.string(),
      feedback: userFeedbackSchema,
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data }) => {
    try {
      const result = await submitActionFeedback(data.actionLogId, data.feedback);
      if (!result) {
        return {
          success: false,
          data: null,
          error: 'Action not found',
        };
      }
      return {
        success: true,
        data: result,
        error: null,
      };
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to submit feedback',
      };
    }
  });

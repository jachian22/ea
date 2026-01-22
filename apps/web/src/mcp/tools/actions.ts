/**
 * Action Tools
 *
 * Tools for managing pending actions and the approval queue.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  findPendingApprovals,
  findActionLogsByUserId,
  findActionLogById,
  approveAction,
  rejectAction,
  addUserFeedback,
  getActionLogStats,
  findActionLogsByDateRange,
} from '~/data-access/action-logs';
import type { ActionLog, ActionLogStatus, UserFeedback } from '~/db/schema';

/**
 * Register action tools with the MCP server
 */
export function registerActionTools(server: McpServer, userId: string) {
  // ea_get_pending_actions - Get actions awaiting approval
  server.tool(
    'ea_get_pending_actions',
    'Get all pending actions that are waiting for your approval.',
    {
      limit: z.number().optional().default(50).describe('Maximum actions to return'),
    },
    async ({ limit }) => {
      try {
        const actions = await findPendingApprovals(userId, limit);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  count: actions.length,
                  actions: actions.map(formatActionLog),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ea_approve_action - Approve a pending action
  server.tool(
    'ea_approve_action',
    'Approve a pending action for execution.',
    {
      actionId: z.string().describe('The action ID to approve'),
    },
    async ({ actionId }) => {
      try {
        // Verify action belongs to user
        const action = await findActionLogById(actionId);
        if (!action) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Action not found',
                }),
              },
            ],
            isError: true,
          };
        }

        if (action.userId !== userId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Access denied',
                }),
              },
            ],
            isError: true,
          };
        }

        if (action.status !== 'pending_approval') {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: `Action is not pending approval (current status: ${action.status})`,
                }),
              },
            ],
            isError: true,
          };
        }

        const approved = await approveAction(actionId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Action approved',
                  action: formatActionLog(approved!),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ea_reject_action - Reject a pending action
  server.tool(
    'ea_reject_action',
    'Reject a pending action with an optional reason.',
    {
      actionId: z.string().describe('The action ID to reject'),
      reason: z.string().optional().describe('Reason for rejection'),
    },
    async ({ actionId, reason }) => {
      try {
        // Verify action belongs to user
        const action = await findActionLogById(actionId);
        if (!action) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Action not found',
                }),
              },
            ],
            isError: true,
          };
        }

        if (action.userId !== userId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Access denied',
                }),
              },
            ],
            isError: true,
          };
        }

        if (action.status !== 'pending_approval') {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: `Action is not pending approval (current status: ${action.status})`,
                }),
              },
            ],
            isError: true,
          };
        }

        const rejected = await rejectAction(actionId, reason);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Action rejected',
                  action: formatActionLog(rejected!),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ea_get_action_log - Get history of automated actions
  server.tool(
    'ea_get_action_log',
    'Get the history of automated actions with optional filters.',
    {
      status: z
        .enum(['pending_approval', 'approved', 'rejected', 'executed', 'failed', 'reversed'])
        .optional()
        .describe('Filter by status'),
      limit: z.number().optional().default(50).describe('Maximum actions to return'),
      daysBack: z.number().optional().describe('Only show actions from the last N days'),
    },
    async ({ status, limit, daysBack }) => {
      try {
        let actions;

        if (daysBack) {
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - daysBack);
          actions = await findActionLogsByDateRange(userId, startDate, endDate, limit);
        } else {
          actions = await findActionLogsByUserId(userId, limit);
        }

        // Filter by status if provided
        if (status) {
          actions = actions.filter((a) => a.status === status);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  count: actions.length,
                  actions: actions.map(formatActionLog),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ea_get_action_stats - Get action statistics
  server.tool(
    'ea_get_action_stats',
    'Get statistics about automated actions.',
    {
      daysBack: z.number().optional().default(30).describe('Number of days to include in stats'),
    },
    async ({ daysBack }) => {
      try {
        const since = new Date();
        since.setDate(since.getDate() - daysBack);

        const stats = await getActionLogStats(userId, since);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  period: `Last ${daysBack} days`,
                  stats: {
                    total: stats.total,
                    byStatus: {
                      pending: stats.pending,
                      approved: stats.approved,
                      rejected: stats.rejected,
                      executed: stats.executed,
                      failed: stats.failed,
                      reversed: stats.reversed,
                    },
                    feedback: {
                      correct: stats.feedbackStats.correct,
                      shouldAsk: stats.feedbackStats.shouldAsk,
                      shouldAuto: stats.feedbackStats.shouldAuto,
                      wrong: stats.feedbackStats.wrong,
                    },
                    rates: {
                      approvalRate:
                        stats.total > 0
                          ? Math.round(((stats.approved + stats.executed) / stats.total) * 100)
                          : 0,
                      rejectionRate:
                        stats.total > 0 ? Math.round((stats.rejected / stats.total) * 100) : 0,
                    },
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ea_provide_action_feedback - Provide feedback on an action
  server.tool(
    'ea_provide_action_feedback',
    'Provide feedback on an action to help improve future automation decisions.',
    {
      actionId: z.string().describe('The action ID to provide feedback for'),
      feedback: z
        .enum(['correct', 'should_ask', 'should_auto', 'wrong'])
        .describe('Your feedback on the action'),
    },
    async ({ actionId, feedback }) => {
      try {
        // Verify action belongs to user
        const action = await findActionLogById(actionId);
        if (!action) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Action not found',
                }),
              },
            ],
            isError: true,
          };
        }

        if (action.userId !== userId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Access denied',
                }),
              },
            ],
            isError: true,
          };
        }

        const updated = await addUserFeedback(actionId, feedback as UserFeedback);

        const feedbackMessages: Record<string, string> = {
          correct: 'Great! The action was handled correctly.',
          should_ask: 'Noted. Similar actions will require approval in the future.',
          should_auto: 'Understood. Similar actions may be automated in the future.',
          wrong: 'Sorry about that. This feedback will help improve future decisions.',
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: feedbackMessages[feedback],
                  action: formatActionLog(updated!),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// Helper functions

function formatActionLog(
  action: ActionLog & { actionType?: { name: string; category: string; riskLevel: string } }
) {
  return {
    id: action.id,
    type: action.actionType?.name || action.actionTypeId,
    category: action.actionType?.category,
    riskLevel: action.actionType?.riskLevel,
    status: action.status,
    description: action.description,
    targetType: action.targetType,
    targetId: action.targetId,
    confidenceScore: action.confidenceScore,
    authorityLevel: action.authorityLevel,
    userFeedback: action.userFeedback,
    createdAt: action.createdAt?.toISOString(),
    executedAt: action.executedAt?.toISOString(),
    approvedAt: action.approvedAt?.toISOString(),
    rejectedAt: action.rejectedAt?.toISOString(),
    metadata: action.metadata,
  };
}

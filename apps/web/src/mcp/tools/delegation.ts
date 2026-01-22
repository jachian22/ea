/**
 * Delegation Tools
 *
 * Tools for managing delegations - tasks assigned to others.
 * Note: This is a simplified implementation as the full delegation
 * system would require additional database tables.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createCommitment,
  findCommitmentsWithPerson,
  updateCommitmentStatus,
  findCommitmentById,
} from '~/data-access/commitments';
import { findPersonById, findPersonByUserIdAndEmail, searchPersons } from '~/data-access/persons';
import type { Commitment, Person } from '~/db/schema';

/**
 * Register delegation tools with the MCP server
 *
 * Note: Delegations are implemented as commitments where direction = "they_owe"
 * This allows us to track delegated tasks using the existing commitment infrastructure.
 */
export function registerDelegationTools(server: McpServer, userId: string) {
  // ea_get_delegates - Get people who can receive delegations
  server.tool(
    'ea_get_delegates',
    'Get a list of people who can receive task delegations.',
    {
      domain: z
        .enum(['business', 'job', 'family', 'personal', 'other'])
        .optional()
        .describe('Filter by domain'),
      limit: z.number().optional().default(50).describe('Maximum results'),
    },
    async ({ domain, limit }) => {
      try {
        const { findPersonsByUserId, findPersonsByDomain } = await import('~/data-access/persons');

        let people;
        if (domain) {
          people = await findPersonsByDomain(userId, domain, limit);
        } else {
          people = await findPersonsByUserId(userId, limit);
        }

        // Sort by importance score to prioritize key contacts
        people.sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  count: people.length,
                  delegates: people.map((p) => ({
                    id: p.id,
                    name: p.name,
                    email: p.email,
                    company: p.company,
                    role: p.role,
                    domain: p.domain,
                    importanceScore: p.importanceScore,
                    lastContactAt: p.lastContactAt?.toISOString(),
                  })),
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

  // ea_create_delegation - Create a new delegation
  server.tool(
    'ea_create_delegation',
    'Create a new task delegation - assign a task to someone else.',
    {
      description: z.string().describe('Description of the delegated task'),
      delegateId: z.string().optional().describe('Person ID to delegate to'),
      delegateEmail: z.string().optional().describe('Email of person to delegate to (if no ID)'),
      dueDate: z.string().optional().describe('Due date for the task (ISO format)'),
      priority: z
        .enum(['high', 'medium', 'low'])
        .optional()
        .default('medium')
        .describe('Priority level'),
      context: z
        .string()
        .optional()
        .describe('Additional context or instructions for the delegate'),
    },
    async ({ description, delegateId, delegateEmail, dueDate, priority, context }) => {
      try {
        if (!delegateId && !delegateEmail) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Either delegateId or delegateEmail is required',
                }),
              },
            ],
            isError: true,
          };
        }

        // Resolve the delegate
        let delegate: Person | null = null;
        if (delegateId) {
          delegate = await findPersonById(delegateId);
        } else if (delegateEmail) {
          delegate = await findPersonByUserIdAndEmail(userId, delegateEmail);
        }

        if (!delegate) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Delegate not found. Please provide a valid person ID or email.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Create the delegation as a commitment
        const fullDescription = context ? `${description}\n\nContext: ${context}` : description;

        const commitment = await createCommitment({
          id: crypto.randomUUID(),
          userId,
          personId: delegate.id,
          description: fullDescription,
          direction: 'they_owe', // Delegation = they owe us
          status: 'pending',
          priority,
          dueDate: dueDate ? new Date(dueDate) : null,
          promisedAt: new Date(),
          sourceType: 'manual',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: `Task delegated to ${delegate.name || delegate.email}`,
                  delegation: {
                    id: commitment.id,
                    description: description,
                    context: context,
                    delegate: {
                      id: delegate.id,
                      name: delegate.name,
                      email: delegate.email,
                      company: delegate.company,
                    },
                    dueDate: commitment.dueDate?.toISOString(),
                    priority: commitment.priority,
                    status: commitment.status,
                    createdAt: commitment.createdAt?.toISOString(),
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

  // ea_get_delegations - Get delegated tasks
  server.tool(
    'ea_get_delegations',
    'Get tasks that have been delegated to others.',
    {
      status: z
        .enum(['pending', 'in_progress', 'completed', 'cancelled'])
        .optional()
        .describe('Filter by status'),
      delegateId: z.string().optional().describe('Filter by delegate (person ID)'),
      limit: z.number().optional().default(50).describe('Maximum results'),
    },
    async ({ status, delegateId, limit }) => {
      try {
        // Get commitments where they_owe (these are delegations)
        const statusFilter = status ? [status] : ['pending', 'in_progress'];
        let delegations = await findCommitmentsWithPerson(userId, {
          direction: 'they_owe',
          status: statusFilter as any,
          limit,
        });

        // Filter by delegate if specified
        if (delegateId) {
          delegations = delegations.filter((d) => d.personId === delegateId);
        }

        // Group by status
        const byStatus = {
          pending: delegations.filter((d) => d.status === 'pending').length,
          in_progress: delegations.filter((d) => d.status === 'in_progress').length,
          completed: delegations.filter((d) => d.status === 'completed').length,
        };

        // Check for overdue
        const now = new Date();
        const overdue = delegations.filter(
          (d) =>
            d.dueDate && d.dueDate < now && (d.status === 'pending' || d.status === 'in_progress')
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  summary: {
                    total: delegations.length,
                    overdue: overdue.length,
                    byStatus,
                  },
                  delegations: delegations.map((d) => ({
                    id: d.id,
                    description: d.description,
                    delegate: d.person
                      ? {
                          id: d.person.id,
                          name: d.person.name,
                          email: d.person.email,
                          company: d.person.company,
                        }
                      : null,
                    status: d.status,
                    priority: d.priority,
                    dueDate: d.dueDate?.toISOString(),
                    isOverdue:
                      d.dueDate &&
                      d.dueDate < now &&
                      (d.status === 'pending' || d.status === 'in_progress'),
                    createdAt: d.createdAt?.toISOString(),
                  })),
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

  // ea_update_delegation_status - Update delegation status
  server.tool(
    'ea_update_delegation_status',
    'Update the status of a delegated task.',
    {
      delegationId: z.string().describe('The delegation/commitment ID'),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).describe('New status'),
      note: z.string().optional().describe('Optional note about the status change'),
    },
    async ({ delegationId, status, note }) => {
      try {
        // Verify the delegation exists and belongs to user
        const delegation = await findCommitmentById(delegationId);
        if (!delegation) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Delegation not found',
                }),
              },
            ],
            isError: true,
          };
        }

        if (delegation.userId !== userId) {
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

        // Update the status
        const updated = await updateCommitmentStatus(delegationId, status, note);

        // Get delegate info
        let delegate = null;
        if (delegation.personId) {
          const person = await findPersonById(delegation.personId);
          if (person) {
            delegate = {
              id: person.id,
              name: person.name,
              email: person.email,
            };
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: `Delegation status updated to ${status}`,
                  delegation: {
                    id: updated!.id,
                    description: updated!.description,
                    delegate,
                    status: updated!.status,
                    completedAt: updated!.completedAt?.toISOString(),
                    completionEvidence: updated!.completionEvidence,
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

  // ea_follow_up_delegation - Mark a delegation as needing follow-up
  server.tool(
    'ea_follow_up_delegation',
    'Flag a delegated task for follow-up.',
    {
      delegationId: z.string().describe('The delegation/commitment ID'),
      note: z.string().optional().describe('Follow-up note or reminder'),
    },
    async ({ delegationId, note }) => {
      try {
        // Verify the delegation exists
        const delegation = await findCommitmentById(delegationId);
        if (!delegation) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Delegation not found',
                }),
              },
            ],
            isError: true,
          };
        }

        if (delegation.userId !== userId) {
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

        // Update to in_progress to indicate it needs attention
        const updated = await updateCommitmentStatus(delegationId, 'in_progress', note);

        // Get delegate info
        let delegate = null;
        if (delegation.personId) {
          const person = await findPersonById(delegation.personId);
          if (person) {
            delegate = {
              id: person.id,
              name: person.name,
              email: person.email,
            };
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Delegation marked for follow-up',
                  delegation: {
                    id: updated!.id,
                    description: updated!.description,
                    delegate,
                    status: updated!.status,
                    followUpNote: note,
                  },
                  suggestion: delegate?.email
                    ? `Consider sending a follow-up email to ${delegate.email}`
                    : 'Consider following up with the delegate',
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

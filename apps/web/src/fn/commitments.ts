import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authenticatedMiddleware } from './middleware';
import {
  createCommitment,
  findCommitmentById,
  findOpenCommitments,
  findCommitmentsUserOwes,
  findCommitmentsOwedToUser,
  findCommitmentsDueToday,
  findOverdueCommitments,
  findUpcomingCommitments,
  updateCommitment,
  updateCommitmentStatus,
  deleteCommitment,
  getCommitmentCountsByStatus,
  findCommitmentsWithPerson,
  createDefaultReminders,
} from '~/data-access/commitments';
import { findPersonByUserIdAndEmail, findOrCreatePerson } from '~/data-access/persons';
import type { CommitmentStatus } from '~/db/schema';

// ============================================================================
// Create Commitment
// ============================================================================

export const createCommitmentFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      description: z.string().min(1, 'Description is required'),
      direction: z.enum(['user_owes', 'they_owe']),
      personEmail: z.string().email().optional(),
      personName: z.string().optional(),
      dueDate: z.string().optional(), // ISO date string
      priority: z.enum(['high', 'medium', 'low']).optional(),
      createReminders: z.boolean().optional().default(true),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      // If person email provided, find or create person
      let personId: string | undefined;
      if (data.personEmail) {
        const person = await findOrCreatePerson(userId, data.personEmail, {
          name: data.personName,
        });
        personId = person.id;
      }

      // Create commitment
      const commitment = await createCommitment({
        id: crypto.randomUUID(),
        userId,
        personId,
        description: data.description,
        direction: data.direction,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        priority: data.priority || 'medium',
        promisedAt: new Date(),
        sourceType: 'manual',
      });

      // Create default reminders if due date is set
      if (data.createReminders && data.dueDate) {
        await createDefaultReminders(commitment.id, new Date(data.dueDate));
      }

      return {
        success: true,
        data: commitment,
        error: null,
      };
    } catch (error) {
      console.error('Failed to create commitment:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to create commitment',
      };
    }
  });

// ============================================================================
// Get Commitments
// ============================================================================

export const getCommitmentsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        filter: z
          .enum(['all', 'open', 'user_owes', 'they_owe', 'due_today', 'overdue', 'upcoming'])
          .optional()
          .default('open'),
        limit: z.number().min(1).max(100).optional().default(50),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const filter = data?.filter || 'open';
    const limit = data?.limit || 50;

    try {
      let commitments;

      switch (filter) {
        case 'all':
          commitments = await findCommitmentsWithPerson(userId, { limit });
          break;
        case 'open':
          commitments = await findCommitmentsWithPerson(userId, {
            status: ['pending', 'in_progress'],
            limit,
          });
          break;
        case 'user_owes':
          commitments = await findCommitmentsWithPerson(userId, {
            direction: 'user_owes',
            status: ['pending', 'in_progress'],
            limit,
          });
          break;
        case 'they_owe':
          commitments = await findCommitmentsWithPerson(userId, {
            direction: 'they_owe',
            status: ['pending', 'in_progress'],
            limit,
          });
          break;
        case 'due_today':
          commitments = await findCommitmentsDueToday(userId);
          break;
        case 'overdue':
          commitments = await findOverdueCommitments(userId);
          break;
        case 'upcoming':
          commitments = await findUpcomingCommitments(userId, 7);
          break;
        default:
          commitments = await findOpenCommitments(userId, limit);
      }

      return {
        success: true,
        data: commitments,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get commitments:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get commitments',
      };
    }
  });

// ============================================================================
// Get Commitment by ID
// ============================================================================

export const getCommitmentByIdFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const commitment = await findCommitmentById(data.id);

      if (!commitment || commitment.userId !== userId) {
        return {
          success: false,
          data: null,
          error: 'Commitment not found',
        };
      }

      return {
        success: true,
        data: commitment,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get commitment:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get commitment',
      };
    }
  });

// ============================================================================
// Update Commitment
// ============================================================================

export const updateCommitmentFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string(),
      description: z.string().optional(),
      dueDate: z.string().nullable().optional(),
      priority: z.enum(['high', 'medium', 'low']).optional(),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
      completionEvidence: z.string().optional(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      // Verify ownership
      const existing = await findCommitmentById(data.id);
      if (!existing || existing.userId !== userId) {
        return {
          success: false,
          data: null,
          error: 'Commitment not found',
        };
      }

      // If status is being updated, use the status update function
      if (data.status) {
        const updated = await updateCommitmentStatus(data.id, data.status, data.completionEvidence);
        return {
          success: true,
          data: updated,
          error: null,
        };
      }

      // Otherwise, update other fields
      const updated = await updateCommitment(data.id, {
        description: data.description,
        dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
        priority: data.priority,
      });

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error('Failed to update commitment:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to update commitment',
      };
    }
  });

// ============================================================================
// Delete Commitment
// ============================================================================

export const deleteCommitmentFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      // Verify ownership
      const existing = await findCommitmentById(data.id);
      if (!existing || existing.userId !== userId) {
        return {
          success: false,
          error: 'Commitment not found',
        };
      }

      await deleteCommitment(data.id);

      return {
        success: true,
        error: null,
      };
    } catch (error) {
      console.error('Failed to delete commitment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete commitment',
      };
    }
  });

// ============================================================================
// Get Commitment Stats
// ============================================================================

export const getCommitmentStatsFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const counts = await getCommitmentCountsByStatus(userId);
      const dueToday = await findCommitmentsDueToday(userId);
      const overdue = await findOverdueCommitments(userId);

      return {
        success: true,
        data: {
          counts,
          dueTodayCount: dueToday.length,
          overdueCount: overdue.length,
          openCount: counts.pending + counts.in_progress,
        },
        error: null,
      };
    } catch (error) {
      console.error('Failed to get commitment stats:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get commitment stats',
      };
    }
  });

import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authenticatedMiddleware } from './middleware';
import {
  createPerson,
  findPersonById,
  findPersonsByUserId,
  findPersonsByDomain,
  searchPersons,
  findStaleContacts,
  findHighImportancePersons,
  updatePerson,
  deletePerson,
  getPersonCount,
  getPersonDossier,
} from '~/data-access/persons';
import type { PersonDomain } from '~/db/schema';

// ============================================================================
// Create Person
// ============================================================================

export const createPersonFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      email: z.string().email(),
      name: z.string().optional(),
      role: z.string().optional(),
      company: z.string().optional(),
      domain: z.enum(['business', 'job', 'family', 'personal', 'other']).optional(),
      personalNotes: z.string().optional(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const person = await createPerson({
        id: crypto.randomUUID(),
        userId,
        email: data.email,
        name: data.name,
        role: data.role,
        company: data.company,
        domain: data.domain || 'business',
        personalNotes: data.personalNotes,
      });

      return {
        success: true,
        data: person,
        error: null,
      };
    } catch (error) {
      console.error('Failed to create person:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to create person',
      };
    }
  });

// ============================================================================
// Get Persons
// ============================================================================

export const getPersonsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        domain: z.enum(['business', 'job', 'family', 'personal', 'other']).optional(),
        limit: z.number().min(1).max(200).optional().default(100),
        offset: z.number().min(0).optional().default(0),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const limit = data?.limit || 100;
    const offset = data?.offset || 0;

    try {
      let persons;

      if (data?.domain) {
        persons = await findPersonsByDomain(userId, data.domain, limit);
      } else {
        persons = await findPersonsByUserId(userId, limit, offset);
      }

      return {
        success: true,
        data: persons,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get persons:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get persons',
      };
    }
  });

// ============================================================================
// Search Persons
// ============================================================================

export const searchPersonsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(50).optional().default(20),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const persons = await searchPersons(userId, data.query, data.limit);

      return {
        success: true,
        data: persons,
        error: null,
      };
    } catch (error) {
      console.error('Failed to search persons:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to search persons',
      };
    }
  });

// ============================================================================
// Get Person Dossier (Full Profile)
// ============================================================================

export const getPersonDossierFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const dossier = await getPersonDossier(data.id);

      if (!dossier || dossier.userId !== userId) {
        return {
          success: false,
          data: null,
          error: 'Person not found',
        };
      }

      return {
        success: true,
        data: dossier,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get person dossier:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get person dossier',
      };
    }
  });

// ============================================================================
// Get Stale Contacts (Follow-up Radar)
// ============================================================================

export const getStaleContactsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        daysThreshold: z.number().min(1).max(365).optional().default(30),
        limit: z.number().min(1).max(50).optional().default(20),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const daysThreshold = data?.daysThreshold || 30;
    const limit = data?.limit || 20;

    try {
      const persons = await findStaleContacts(userId, daysThreshold, limit);

      // Add days since last contact to each person
      const withDaysSince = persons.map((person) => {
        const daysSince = person.lastContactAt
          ? Math.round((Date.now() - person.lastContactAt.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          ...person,
          daysSinceContact: daysSince,
        };
      });

      return {
        success: true,
        data: withDaysSince,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get stale contacts:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get stale contacts',
      };
    }
  });

// ============================================================================
// Get High Importance Persons
// ============================================================================

export const getHighImportancePersonsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        minScore: z.number().min(0).max(100).optional().default(70),
        limit: z.number().min(1).max(50).optional().default(20),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const minScore = data?.minScore || 70;
    const limit = data?.limit || 20;

    try {
      const persons = await findHighImportancePersons(userId, minScore, limit);

      return {
        success: true,
        data: persons,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get high importance persons:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get high importance persons',
      };
    }
  });

// ============================================================================
// Update Person
// ============================================================================

export const updatePersonFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      role: z.string().optional(),
      company: z.string().optional(),
      domain: z.enum(['business', 'job', 'family', 'personal', 'other']).optional(),
      personalNotes: z.string().optional(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      // Verify ownership
      const existing = await findPersonById(data.id);
      if (!existing || existing.userId !== userId) {
        return {
          success: false,
          data: null,
          error: 'Person not found',
        };
      }

      const updated = await updatePerson(data.id, {
        name: data.name,
        role: data.role,
        company: data.company,
        domain: data.domain,
        personalNotes: data.personalNotes,
      });

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error('Failed to update person:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to update person',
      };
    }
  });

// ============================================================================
// Delete Person
// ============================================================================

export const deletePersonFn = createServerFn({ method: 'POST' })
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
      const existing = await findPersonById(data.id);
      if (!existing || existing.userId !== userId) {
        return {
          success: false,
          error: 'Person not found',
        };
      }

      await deletePerson(data.id);

      return {
        success: true,
        error: null,
      };
    } catch (error) {
      console.error('Failed to delete person:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete person',
      };
    }
  });

// ============================================================================
// Get Person Stats
// ============================================================================

export const getPersonStatsFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const totalCount = await getPersonCount(userId);
      const staleContacts = await findStaleContacts(userId, 30, 100);
      const highImportance = await findHighImportancePersons(userId, 70, 100);

      return {
        success: true,
        data: {
          totalCount,
          staleContactsCount: staleContacts.length,
          highImportanceCount: highImportance.length,
        },
        error: null,
      };
    } catch (error) {
      console.error('Failed to get person stats:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get person stats',
      };
    }
  });

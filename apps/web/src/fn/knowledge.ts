import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authenticatedMiddleware } from "./middleware";
import {
  findPersonById,
  searchPersons,
  findPersonsByDomain,
  findStaleContacts,
  getPersonDossier,
} from "~/data-access/persons";
import {
  findCommitmentsWithPerson,
  findCommitmentsDueToday,
  findOverdueCommitments,
  findUpcomingCommitments,
} from "~/data-access/commitments";
import { findRelationshipsForPerson, getRelationshipsWithPersons } from "~/data-access/relationships";
import type { PersonDomain } from "~/db/schema";

// ============================================================================
// Get Person Context (Full Dossier)
// ============================================================================

export const getPersonContextFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      personId: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      // Get full dossier
      const dossier = await getPersonDossier(data.personId);

      if (!dossier || dossier.userId !== userId) {
        return {
          success: false,
          data: null,
          error: "Person not found",
        };
      }

      // Get relationships
      const relationships = await findRelationshipsForPerson(data.personId);

      return {
        success: true,
        data: {
          person: dossier,
          relationships,
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to get person context:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get person context",
      };
    }
  });

// ============================================================================
// Search Knowledge Graph
// ============================================================================

export const searchKnowledgeFn = createServerFn({ method: "GET" })
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
      // Search people
      const people = await searchPersons(userId, data.query, data.limit);

      // Search commitments that match the query
      const commitments = await findCommitmentsWithPerson(userId, {
        limit: data.limit,
        searchQuery: data.query,
      });

      return {
        success: true,
        data: {
          people,
          commitments,
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to search knowledge:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to search knowledge",
      };
    }
  });

// ============================================================================
// Get Commitments Dashboard
// ============================================================================

export const getCommitmentsDashboardFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const [
        overdueUserOwes,
        overdueTheyOwe,
        dueTodayUserOwes,
        dueTodayTheyOwe,
        upcomingUserOwes,
        upcomingTheyOwe,
      ] = await Promise.all([
        // Overdue - user owes
        findCommitmentsWithPerson(userId, {
          direction: "user_owes",
          overdue: true,
          status: ["pending", "in_progress"],
        }),
        // Overdue - they owe
        findCommitmentsWithPerson(userId, {
          direction: "they_owe",
          overdue: true,
          status: ["pending", "in_progress"],
        }),
        // Due today - user owes
        findCommitmentsDueToday(userId).then(
          (all) => all.filter((c) => c.direction === "user_owes")
        ),
        // Due today - they owe
        findCommitmentsDueToday(userId).then(
          (all) => all.filter((c) => c.direction === "they_owe")
        ),
        // Upcoming - user owes
        findUpcomingCommitments(userId, 7).then(
          (all) => all.filter((c) => c.direction === "user_owes")
        ),
        // Upcoming - they owe
        findUpcomingCommitments(userId, 7).then(
          (all) => all.filter((c) => c.direction === "they_owe")
        ),
      ]);

      return {
        success: true,
        data: {
          overduePromisesByMe: overdueUserOwes,
          overduePromisesToMe: overdueTheyOwe,
          dueTodayPromisesByMe: dueTodayUserOwes,
          dueTodayPromisesToMe: dueTodayTheyOwe,
          upcomingPromisesByMe: upcomingUserOwes,
          upcomingPromisesToMe: upcomingTheyOwe,
          summary: {
            totalOverdue: overdueUserOwes.length + overdueTheyOwe.length,
            totalDueToday: dueTodayUserOwes.length + dueTodayTheyOwe.length,
            totalUpcoming: upcomingUserOwes.length + upcomingTheyOwe.length,
          },
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to get commitments dashboard:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get commitments dashboard",
      };
    }
  });

// ============================================================================
// Get People by Domain
// ============================================================================

export const getPeopleByDomainFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      domain: z.enum(["family", "business", "job", "personal", "other"]),
      limit: z.number().min(1).max(100).optional().default(50),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const people = await findPersonsByDomain(
        userId,
        data.domain as PersonDomain,
        data.limit
      );

      return {
        success: true,
        data: people,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get people by domain:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get people by domain",
      };
    }
  });

// ============================================================================
// Get Follow-Up Radar (Stale Contacts)
// ============================================================================

export const getFollowUpRadarFn = createServerFn({ method: "GET" })
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
    const daysThreshold = data?.daysThreshold ?? 30;
    const limit = data?.limit ?? 20;

    try {
      const staleContacts = await findStaleContacts(userId, daysThreshold, limit);

      // Get relationships for context
      const contactsWithRelationships = await Promise.all(
        staleContacts.map(async (person) => {
          const relationships = await findRelationshipsForPerson(person.id);
          return {
            ...person,
            relationships,
          };
        })
      );

      return {
        success: true,
        data: contactsWithRelationships,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get follow-up radar:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get follow-up radar",
      };
    }
  });

// ============================================================================
// Get Relationships
// ============================================================================

export const getRelationshipsFn = createServerFn({ method: "GET" })
  .inputValidator(
    z
      .object({
        relationType: z
          .enum([
            "spouse",
            "child",
            "parent",
            "sibling",
            "friend",
            "client",
            "vendor",
            "colleague",
            "manager",
            "report",
            "investor",
            "partner",
            "other",
          ])
          .optional(),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const relationships = await getRelationshipsWithPersons(
        userId,
        data?.relationType
      );

      return {
        success: true,
        data: relationships,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get relationships:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get relationships",
      };
    }
  });

// ============================================================================
// Get Knowledge Summary
// ============================================================================

export const getKnowledgeSummaryFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      // Get counts by domain
      const [familyPeople, businessPeople, jobPeople, personalPeople, otherPeople] =
        await Promise.all([
          findPersonsByDomain(userId, "family", 1000),
          findPersonsByDomain(userId, "business", 1000),
          findPersonsByDomain(userId, "job", 1000),
          findPersonsByDomain(userId, "personal", 1000),
          findPersonsByDomain(userId, "other", 1000),
        ]);

      // Get commitment stats
      const [openCommitments, overdueCommitments] = await Promise.all([
        findCommitmentsWithPerson(userId, {
          status: ["pending", "in_progress"],
          limit: 1000,
        }),
        findOverdueCommitments(userId),
      ]);

      // Get stale contacts
      const staleContacts = await findStaleContacts(userId, 30, 10);

      return {
        success: true,
        data: {
          people: {
            total:
              familyPeople.length +
              businessPeople.length +
              jobPeople.length +
              personalPeople.length +
              otherPeople.length,
            byDomain: {
              family: familyPeople.length,
              business: businessPeople.length,
              job: jobPeople.length,
              personal: personalPeople.length,
              other: otherPeople.length,
            },
          },
          commitments: {
            open: openCommitments.length,
            overdue: overdueCommitments.length,
            userOwes: openCommitments.filter((c) => c.direction === "user_owes").length,
            theyOwe: openCommitments.filter((c) => c.direction === "they_owe").length,
          },
          followUp: {
            staleContactsCount: staleContacts.length,
          },
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to get knowledge summary:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get knowledge summary",
      };
    }
  });

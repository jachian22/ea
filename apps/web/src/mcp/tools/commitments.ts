/**
 * Commitment Tools
 *
 * Tools for creating, updating, and managing commitments.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createCommitment,
  findCommitmentById,
  updateCommitment,
  updateCommitmentStatus,
  findOverdueCommitments,
  findCommitmentsDueToday,
  findUpcomingCommitments,
  findCommitmentsWithPerson,
  getCommitmentCountsByStatus,
  type CommitmentWithPerson,
} from "~/data-access/commitments";
import { findPersonById, findPersonByUserIdAndEmail } from "~/data-access/persons";
import type { Commitment, CommitmentStatus } from "~/db/schema";

/**
 * Register commitment tools with the MCP server
 */
export function registerCommitmentTools(server: McpServer, userId: string) {
  // ea_create_commitment - Create a new commitment
  server.tool(
    "ea_create_commitment",
    "Create a new commitment - something you owe to someone or they owe to you.",
    {
      description: z.string().describe("What was committed/promised"),
      direction: z.enum(["user_owes", "they_owe"]).describe("Who owes whom"),
      personId: z.string().optional().describe("Person ID this commitment is with (optional)"),
      personEmail: z.string().optional().describe("Person email if no ID (will find or create person)"),
      dueDate: z.string().optional().describe("Due date (ISO format)"),
      priority: z.enum(["high", "medium", "low"]).optional().default("medium").describe("Priority level"),
      sourceType: z.enum(["email", "calendar", "manual"]).optional().describe("Where this commitment came from"),
      sourceId: z.string().optional().describe("Reference ID from source"),
    },
    async ({ description, direction, personId, personEmail, dueDate, priority, sourceType, sourceId }) => {
      try {
        // Resolve person if email provided but no ID
        let resolvedPersonId = personId;
        if (!resolvedPersonId && personEmail) {
          const person = await findPersonByUserIdAndEmail(userId, personEmail);
          if (person) {
            resolvedPersonId = person.id;
          }
        }

        const commitment = await createCommitment({
          id: crypto.randomUUID(),
          userId,
          personId: resolvedPersonId || null,
          description,
          direction,
          status: "pending",
          priority,
          dueDate: dueDate ? new Date(dueDate) : null,
          promisedAt: new Date(),
          sourceType: sourceType || null,
          sourceId: sourceId || null,
        });

        // Get person info if available
        let personInfo = null;
        if (commitment.personId) {
          const person = await findPersonById(commitment.personId);
          if (person) {
            personInfo = {
              id: person.id,
              name: person.name,
              email: person.email,
            };
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              commitment: {
                id: commitment.id,
                description: commitment.description,
                direction: commitment.direction,
                status: commitment.status,
                priority: commitment.priority,
                dueDate: commitment.dueDate?.toISOString(),
                person: personInfo,
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // ea_update_commitment - Update a commitment
  server.tool(
    "ea_update_commitment",
    "Update an existing commitment - change description, due date, priority, or status.",
    {
      id: z.string().describe("Commitment ID to update"),
      description: z.string().optional().describe("New description"),
      dueDate: z.string().optional().describe("New due date (ISO format)"),
      priority: z.enum(["high", "medium", "low"]).optional().describe("New priority"),
      status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional().describe("New status"),
    },
    async ({ id, description, dueDate, priority, status }) => {
      try {
        // Verify commitment belongs to user
        const existing = await findCommitmentById(id);
        if (!existing) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Commitment not found",
              }),
            }],
            isError: true,
          };
        }

        if (existing.userId !== userId) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Access denied",
              }),
            }],
            isError: true,
          };
        }

        const updated = await updateCommitment(id, {
          ...(description && { description }),
          ...(dueDate && { dueDate: new Date(dueDate) }),
          ...(priority && { priority }),
          ...(status && { status }),
          ...(status === "completed" && { completedAt: new Date() }),
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              commitment: formatCommitment(updated!),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // ea_complete_commitment - Mark a commitment as completed
  server.tool(
    "ea_complete_commitment",
    "Mark a commitment as completed with optional completion note.",
    {
      id: z.string().describe("Commitment ID to complete"),
      note: z.string().optional().describe("Completion note or evidence"),
    },
    async ({ id, note }) => {
      try {
        // Verify commitment belongs to user
        const existing = await findCommitmentById(id);
        if (!existing) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Commitment not found",
              }),
            }],
            isError: true,
          };
        }

        if (existing.userId !== userId) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Access denied",
              }),
            }],
            isError: true,
          };
        }

        const updated = await updateCommitmentStatus(id, "completed", note);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: "Commitment marked as completed",
              commitment: formatCommitment(updated!),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // ea_get_overdue_commitments - Get all overdue commitments
  server.tool(
    "ea_get_overdue_commitments",
    "Get all overdue commitments that need attention.",
    {},
    async () => {
      try {
        const commitments = await findOverdueCommitments(userId);

        // Get person info for each commitment
        const withPerson = await Promise.all(
          commitments.map(async (c) => {
            let person = null;
            if (c.personId) {
              const p = await findPersonById(c.personId);
              if (p) {
                person = { id: p.id, name: p.name, email: p.email };
              }
            }
            return { ...c, person };
          })
        );

        // Calculate stats
        const byDirection = {
          user_owes: withPerson.filter(c => c.direction === "user_owes").length,
          they_owe: withPerson.filter(c => c.direction === "they_owe").length,
        };

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              count: commitments.length,
              summary: {
                youOwe: byDirection.user_owes,
                theyOwe: byDirection.they_owe,
              },
              commitments: withPerson.map(c => ({
                ...formatCommitment(c),
                person: c.person,
                daysOverdue: c.dueDate
                  ? Math.floor((Date.now() - c.dueDate.getTime()) / (1000 * 60 * 60 * 24))
                  : null,
              })),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // ea_get_commitments_due_today - Get commitments due today
  server.tool(
    "ea_get_commitments_due_today",
    "Get all commitments that are due today.",
    {},
    async () => {
      try {
        const commitments = await findCommitmentsDueToday(userId);

        // Get person info for each
        const withPerson = await Promise.all(
          commitments.map(async (c) => {
            let person = null;
            if (c.personId) {
              const p = await findPersonById(c.personId);
              if (p) {
                person = { id: p.id, name: p.name, email: p.email };
              }
            }
            return { ...c, person };
          })
        );

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              date: new Date().toISOString().split('T')[0],
              count: commitments.length,
              commitments: withPerson.map(c => ({
                ...formatCommitment(c),
                person: c.person,
              })),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // ea_get_commitment_stats - Get commitment statistics
  server.tool(
    "ea_get_commitment_stats",
    "Get a summary of commitment statistics by status.",
    {},
    async () => {
      try {
        const counts = await getCommitmentCountsByStatus(userId);
        const overdue = await findOverdueCommitments(userId);
        const dueToday = await findCommitmentsDueToday(userId);
        const upcoming = await findUpcomingCommitments(userId, 7);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              stats: {
                byStatus: counts,
                overdue: overdue.length,
                dueToday: dueToday.length,
                upcomingWeek: upcoming.length,
                totalOpen: counts.pending + counts.in_progress,
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          }],
          isError: true,
        };
      }
    }
  );
}

// Helper functions

function formatCommitment(commitment: Commitment) {
  const now = new Date();
  const isOverdue = commitment.dueDate && commitment.dueDate < now &&
    (commitment.status === "pending" || commitment.status === "in_progress");

  return {
    id: commitment.id,
    description: commitment.description,
    direction: commitment.direction,
    status: commitment.status,
    priority: commitment.priority,
    dueDate: commitment.dueDate?.toISOString(),
    isOverdue,
    promisedAt: commitment.promisedAt?.toISOString(),
    completedAt: commitment.completedAt?.toISOString(),
    completionEvidence: commitment.completionEvidence,
    sourceType: commitment.sourceType,
    createdAt: commitment.createdAt?.toISOString(),
  };
}

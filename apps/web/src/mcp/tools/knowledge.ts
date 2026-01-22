/**
 * Knowledge Graph Tools
 *
 * Tools for querying people, commitments, and interactions from the EA knowledge graph.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  searchPersons,
  findPersonById,
  getPersonDossier,
  findPersonsByDomain,
  findHighImportancePersons,
  type PersonDossier,
} from "~/data-access/persons";
import {
  findCommitmentsByUserId,
  findOverdueCommitments,
  findCommitmentsWithPerson,
  findUpcomingCommitments,
} from "~/data-access/commitments";
import {
  findInteractionsByUserId,
  findInteractionsByPersonId,
  findInteractionsWithPerson,
} from "~/data-access/interactions";
import type { Person, Commitment, Interaction, PersonDomain, CommitmentStatus } from "~/db/schema";

/**
 * Register knowledge graph tools with the MCP server
 */
export function registerKnowledgeTools(server: McpServer, userId: string) {
  // ea_search_people - Search for people by query
  server.tool(
    "ea_search_people",
    "Search for people in your contacts by name, email, or company. Returns matching people with basic info.",
    {
      query: z.string().describe("Search query to match against names, emails, or companies"),
      limit: z.number().optional().default(20).describe("Maximum number of results to return"),
    },
    async ({ query, limit }) => {
      try {
        const people = await searchPersons(userId, query, limit);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              count: people.length,
              people: people.map(formatPersonBasic),
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

  // ea_get_person - Get full person dossier
  server.tool(
    "ea_get_person",
    "Get the full dossier for a person, including their interaction history, commitments, and patterns.",
    {
      id: z.string().describe("The person's unique ID"),
    },
    async ({ id }) => {
      try {
        const dossier = await getPersonDossier(id);

        if (!dossier) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Person not found",
              }),
            }],
            isError: true,
          };
        }

        // Verify the person belongs to this user
        if (dossier.userId !== userId) {
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

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              dossier: formatDossier(dossier),
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

  // ea_search_knowledge - Search across people, commitments, and interactions
  server.tool(
    "ea_search_knowledge",
    "Search across all knowledge: people, commitments, and interactions. Returns combined results.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().optional().default(10).describe("Max results per category"),
    },
    async ({ query, limit }) => {
      try {
        // Search people
        const people = await searchPersons(userId, query, limit);

        // Get all commitments and filter by description
        const allCommitments = await findCommitmentsByUserId(userId, 100);
        const matchingCommitments = allCommitments
          .filter(c =>
            c.description.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, limit);

        // Get recent interactions and filter
        const recentInteractions = await findInteractionsWithPerson(userId, 100);
        const matchingInteractions = recentInteractions
          .filter(i =>
            i.subject?.toLowerCase().includes(query.toLowerCase()) ||
            i.summary?.toLowerCase().includes(query.toLowerCase()) ||
            i.person?.name?.toLowerCase().includes(query.toLowerCase()) ||
            i.person?.email?.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, limit);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              results: {
                people: {
                  count: people.length,
                  items: people.map(formatPersonBasic),
                },
                commitments: {
                  count: matchingCommitments.length,
                  items: matchingCommitments.map(formatCommitmentBasic),
                },
                interactions: {
                  count: matchingInteractions.length,
                  items: matchingInteractions.map(formatInteractionBasic),
                },
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

  // ea_get_commitments - Get filtered commitments
  server.tool(
    "ea_get_commitments",
    "Get commitments with optional filters. Can filter by status, direction, person, or due date.",
    {
      direction: z.enum(["user_owes", "they_owe"]).optional().describe("Filter by commitment direction"),
      status: z.array(z.enum(["pending", "in_progress", "completed", "cancelled"])).optional().describe("Filter by status"),
      personId: z.string().optional().describe("Filter by person ID"),
      overdue: z.boolean().optional().describe("Only return overdue commitments"),
      upcoming: z.number().optional().describe("Days ahead for upcoming commitments"),
      limit: z.number().optional().default(50).describe("Maximum results"),
    },
    async ({ direction, status, personId, overdue, upcoming, limit }) => {
      try {
        let commitments;

        if (overdue) {
          commitments = await findOverdueCommitments(userId);
        } else if (upcoming !== undefined) {
          commitments = await findUpcomingCommitments(userId, upcoming);
        } else {
          commitments = await findCommitmentsWithPerson(userId, {
            direction: direction as "user_owes" | "they_owe" | undefined,
            status: status as CommitmentStatus[] | undefined,
            limit,
          });
        }

        // Filter by personId if provided
        if (personId) {
          commitments = commitments.filter(c => c.personId === personId);
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              count: commitments.length,
              commitments: commitments.map(c => {
                const personData = 'person' in c ? c.person as { id: string; name: string | null; email: string } | null : null;
                return {
                  ...formatCommitmentBasic(c),
                  person: personData && personData.id ? {
                    id: personData.id,
                    name: personData.name,
                    email: personData.email,
                  } : null,
                };
              }),
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

  // ea_get_interactions - Get interaction history
  server.tool(
    "ea_get_interactions",
    "Get interaction history with optional filters by person, type, or date range.",
    {
      personId: z.string().optional().describe("Filter by person ID"),
      type: z.enum(["email", "meeting", "call", "message", "other"]).optional().describe("Filter by interaction type"),
      limit: z.number().optional().default(50).describe("Maximum results"),
    },
    async ({ personId, type, limit }) => {
      try {
        let interactions;

        if (personId) {
          interactions = await findInteractionsByPersonId(personId, limit);
        } else {
          interactions = await findInteractionsWithPerson(userId, limit);
        }

        // Filter by type if provided
        if (type) {
          interactions = interactions.filter(i => i.type === type);
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              count: interactions.length,
              interactions: interactions.map(i => {
                const personData = 'person' in i ? i.person as { id: string; name: string | null; email: string } | null : null;
                return {
                  ...formatInteractionBasic(i),
                  person: personData && personData.id ? {
                    id: personData.id,
                    name: personData.name,
                    email: personData.email,
                  } : null,
                };
              }),
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

  // ea_get_people_by_domain - Get people by domain
  server.tool(
    "ea_get_people_by_domain",
    "Get all contacts in a specific domain (family, business, job, personal, other).",
    {
      domain: z.enum(["family", "business", "job", "personal", "other"]).describe("The domain to filter by"),
      limit: z.number().optional().default(50).describe("Maximum results"),
    },
    async ({ domain, limit }) => {
      try {
        const people = await findPersonsByDomain(userId, domain as PersonDomain, limit);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              domain,
              count: people.length,
              people: people.map(formatPersonBasic),
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

  // ea_get_vip_contacts - Get high importance contacts
  server.tool(
    "ea_get_vip_contacts",
    "Get your most important contacts based on interaction frequency and importance score.",
    {
      minScore: z.number().optional().default(70).describe("Minimum importance score (0-100)"),
      limit: z.number().optional().default(20).describe("Maximum results"),
    },
    async ({ minScore, limit }) => {
      try {
        const people = await findHighImportancePersons(userId, minScore, limit);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              count: people.length,
              people: people.map(formatPersonBasic),
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

// Helper functions to format data

function formatPersonBasic(person: Person) {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    role: person.role,
    company: person.company,
    domain: person.domain,
    importanceScore: person.importanceScore,
    lastContactAt: person.lastContactAt?.toISOString(),
    totalInteractions: person.totalInteractions,
  };
}

function formatDossier(dossier: PersonDossier) {
  return {
    // Basic info
    id: dossier.id,
    name: dossier.name,
    email: dossier.email,
    role: dossier.role,
    company: dossier.company,
    domain: dossier.domain,
    importanceScore: dossier.importanceScore,
    preferredChannel: dossier.preferredChannel,
    personalNotes: dossier.personalNotes,

    // Interaction stats
    stats: dossier.interactionStats,

    // Recent interactions
    recentInteractions: dossier.recentInteractions.map(i => ({
      type: i.type,
      channel: i.channel,
      subject: i.subject,
      summary: i.summary,
      date: i.occurredAt?.toISOString(),
    })),

    // Commitments
    commitmentsYouOwe: dossier.openCommitmentsYouOwe.map(c => ({
      id: c.id,
      description: c.description,
      dueDate: c.dueDate?.toISOString(),
      status: c.status,
    })),
    commitmentsTheyOwe: dossier.openCommitmentsTheyOwe.map(c => ({
      id: c.id,
      description: c.description,
      dueDate: c.dueDate?.toISOString(),
      status: c.status,
    })),
    recentlyCompleted: dossier.completedCommitments.map(c => ({
      id: c.id,
      description: c.description,
      direction: c.direction,
      completedAt: c.completedAt?.toISOString(),
    })),
  };
}

function formatCommitmentBasic(commitment: Commitment) {
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
  };
}

function formatInteractionBasic(interaction: Interaction) {
  return {
    id: interaction.id,
    type: interaction.type,
    channel: interaction.channel,
    direction: interaction.direction,
    subject: interaction.subject,
    summary: interaction.summary,
    occurredAt: interaction.occurredAt?.toISOString(),
  };
}

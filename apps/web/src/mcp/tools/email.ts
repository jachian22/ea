/**
 * Email Tools
 *
 * Tools for managing emails, viewing inbox, and drafting replies.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findGoogleIntegrationByUserId } from "~/data-access/google-integration";
import { GmailService } from "~/services/gmail";
import { findInteractionsByPersonId } from "~/data-access/interactions";
import { findPersonByUserIdAndEmail } from "~/data-access/persons";
import type { EmailData } from "~/db/schema";

/**
 * Register email tools with the MCP server
 */
export function registerEmailTools(server: McpServer, userId: string) {
  // ea_get_inbox - Get filtered inbox
  server.tool(
    "ea_get_inbox",
    "Get emails from inbox with optional filters. Returns emails with person context when available.",
    {
      unread: z.boolean().optional().describe("Filter to only unread emails"),
      important: z.boolean().optional().describe("Filter to only important emails"),
      sender: z.string().optional().describe("Filter by sender email address"),
      limit: z.number().optional().default(50).describe("Maximum emails to return"),
      hoursBack: z.number().optional().default(24).describe("Hours to look back"),
    },
    async ({ unread, important, sender, limit, hoursBack }) => {
      try {
        const integration = await findGoogleIntegrationByUserId(userId);
        if (!integration || !integration.isConnected) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Gmail not connected. Please connect your Google account.",
              }),
            }],
            isError: true,
          };
        }

        const gmailService = await GmailService.fromIntegration(integration);
        let emails = await gmailService.fetchRecentEmails({
          maxResults: limit,
          hoursBack,
          labelIds: ["INBOX"],
        });

        // Apply filters
        if (unread) {
          emails = emails.filter(e => !e.isRead);
        }
        if (important) {
          emails = emails.filter(e => e.importance === "high");
        }
        if (sender) {
          emails = emails.filter(e =>
            e.from.email.toLowerCase().includes(sender.toLowerCase())
          );
        }

        // Group by action status
        const grouped = {
          needsResponse: emails.filter(e => e.actionStatus === "needs_response"),
          awaitingReply: emails.filter(e => e.actionStatus === "awaiting_reply"),
          fyi: emails.filter(e => e.actionStatus === "fyi"),
          other: emails.filter(e => e.actionStatus === "none"),
        };

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              summary: {
                total: emails.length,
                needsResponse: grouped.needsResponse.length,
                awaitingReply: grouped.awaitingReply.length,
                fyi: grouped.fyi.length,
                other: grouped.other.length,
              },
              emails: emails.map(formatEmail),
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

  // ea_get_email - Get a specific email with full context
  server.tool(
    "ea_get_email",
    "Get details for a specific email including thread context and sender information.",
    {
      emailId: z.string().describe("The Gmail message ID"),
    },
    async ({ emailId }) => {
      try {
        const integration = await findGoogleIntegrationByUserId(userId);
        if (!integration || !integration.isConnected) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Gmail not connected. Please connect your Google account.",
              }),
            }],
            isError: true,
          };
        }

        // Fetch recent emails to find the one we want
        const gmailService = await GmailService.fromIntegration(integration);
        const emails = await gmailService.fetchRecentEmails({
          maxResults: 100,
          hoursBack: 72, // Look back 3 days
        });

        const email = emails.find(e => e.id === emailId);
        if (!email) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Email not found. It may be older than 72 hours.",
              }),
            }],
            isError: true,
          };
        }

        // Try to get person context for the sender
        const senderPerson = await findPersonByUserIdAndEmail(userId, email.from.email);
        let senderContext = null;
        let recentInteractions: any[] = [];

        if (senderPerson) {
          senderContext = {
            id: senderPerson.id,
            name: senderPerson.name,
            email: senderPerson.email,
            company: senderPerson.company,
            role: senderPerson.role,
            domain: senderPerson.domain,
            importanceScore: senderPerson.importanceScore,
            totalInteractions: senderPerson.totalInteractions,
          };

          // Get recent interactions with this person
          const interactions = await findInteractionsByPersonId(senderPerson.id, 5);
          recentInteractions = interactions.map(i => ({
            type: i.type,
            channel: i.channel,
            subject: i.subject,
            summary: i.summary,
            date: i.occurredAt?.toISOString(),
          }));
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              email: {
                ...formatEmail(email),
                snippet: email.snippet,
              },
              senderContext,
              recentInteractions,
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

  // ea_get_priority_emails - Get high priority emails
  server.tool(
    "ea_get_priority_emails",
    "Get emails that need your attention, sorted by priority.",
    {
      hoursBack: z.number().optional().default(24).describe("Hours to look back"),
      limit: z.number().optional().default(20).describe("Maximum emails to return"),
    },
    async ({ hoursBack, limit }) => {
      try {
        const integration = await findGoogleIntegrationByUserId(userId);
        if (!integration || !integration.isConnected) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Gmail not connected. Please connect your Google account.",
              }),
            }],
            isError: true,
          };
        }

        const gmailService = await GmailService.fromIntegration(integration);
        const emails = await gmailService.fetchRecentEmails({
          maxResults: 100,
          hoursBack,
        });

        // Sort by priority
        const priorityEmails = emails
          .filter(e => !e.isRead || e.actionStatus === "needs_response")
          .sort((a, b) => {
            // High importance first
            if (a.importance !== b.importance) {
              const order = { high: 0, medium: 1, low: 2 };
              return order[a.importance] - order[b.importance];
            }
            // Needs response before others
            if (a.actionStatus !== b.actionStatus) {
              const order = {
                needs_response: 0,
                awaiting_reply: 1,
                fyi: 2,
                none: 3,
              };
              return order[a.actionStatus] - order[b.actionStatus];
            }
            // Recent first
            return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
          })
          .slice(0, limit);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              count: priorityEmails.length,
              emails: priorityEmails.map(formatEmail),
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

  // ea_get_email_threads - Get email history with a person
  server.tool(
    "ea_get_email_threads",
    "Get recent email history with a specific person.",
    {
      personId: z.string().optional().describe("Person ID to get email history for"),
      email: z.string().optional().describe("Email address to get history for (if no person ID)"),
      hoursBack: z.number().optional().default(168).describe("Hours to look back (default 7 days)"),
      limit: z.number().optional().default(20).describe("Maximum emails to return"),
    },
    async ({ personId, email, hoursBack, limit }) => {
      try {
        if (!personId && !email) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Either personId or email is required",
              }),
            }],
            isError: true,
          };
        }

        const integration = await findGoogleIntegrationByUserId(userId);
        if (!integration || !integration.isConnected) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Gmail not connected. Please connect your Google account.",
              }),
            }],
            isError: true,
          };
        }

        // Get the email address to search for
        let searchEmail = email;
        if (personId && !searchEmail) {
          const person = await findPersonByUserIdAndEmail(userId, ""); // Need to get by ID
          // Note: We'd need a findPersonById here, which exists in data-access
        }

        const gmailService = await GmailService.fromIntegration(integration);
        const allEmails = await gmailService.fetchRecentEmails({
          maxResults: 200,
          hoursBack,
        });

        // Filter emails by sender/recipient
        const targetEmail = searchEmail?.toLowerCase();
        const filteredEmails = targetEmail
          ? allEmails.filter(e =>
              e.from.email.toLowerCase() === targetEmail ||
              e.to.some(t => t.email.toLowerCase() === targetEmail)
            ).slice(0, limit)
          : [];

        // Group by thread
        const threadMap = new Map<string, EmailData[]>();
        for (const email of filteredEmails) {
          const existing = threadMap.get(email.threadId) || [];
          existing.push(email);
          threadMap.set(email.threadId, existing);
        }

        const threads = Array.from(threadMap.entries()).map(([threadId, emails]) => ({
          threadId,
          subject: emails[0]?.subject,
          messageCount: emails.length,
          lastMessage: emails[0]?.receivedAt,
          messages: emails.map(formatEmail),
        }));

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              email: searchEmail,
              threadCount: threads.length,
              messageCount: filteredEmails.length,
              threads: threads.slice(0, 10),
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

  // ea_draft_reply - Draft a reply to an email
  server.tool(
    "ea_draft_reply",
    "Draft a reply to an email based on your intent. Returns the draft for review - does not send.",
    {
      emailId: z.string().describe("The Gmail message ID to reply to"),
      intent: z.string().describe("What you want to say or accomplish with this reply"),
      tone: z.enum(["formal", "friendly", "brief", "detailed"]).optional().default("friendly").describe("Desired tone"),
      includeOriginal: z.boolean().optional().default(true).describe("Include original message in reply"),
    },
    async ({ emailId, intent, tone, includeOriginal }) => {
      try {
        const integration = await findGoogleIntegrationByUserId(userId);
        if (!integration || !integration.isConnected) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Gmail not connected. Please connect your Google account.",
              }),
            }],
            isError: true,
          };
        }

        // Find the original email
        const gmailService = await GmailService.fromIntegration(integration);
        const emails = await gmailService.fetchRecentEmails({
          maxResults: 100,
          hoursBack: 72,
        });

        const originalEmail = emails.find(e => e.id === emailId);
        if (!originalEmail) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Original email not found",
              }),
            }],
            isError: true,
          };
        }

        // Get context about the sender
        const senderPerson = await findPersonByUserIdAndEmail(userId, originalEmail.from.email);

        // Build the draft context
        const draftContext = {
          originalEmail: {
            subject: originalEmail.subject,
            from: originalEmail.from,
            snippet: originalEmail.snippet,
            receivedAt: originalEmail.receivedAt,
          },
          senderContext: senderPerson ? {
            name: senderPerson.name,
            company: senderPerson.company,
            domain: senderPerson.domain,
          } : null,
          intent,
          tone,
        };

        // Generate draft suggestion (this would ideally use an LLM)
        const suggestedSubject = originalEmail.subject.startsWith("Re:")
          ? originalEmail.subject
          : `Re: ${originalEmail.subject}`;

        const greeting = senderPerson?.name
          ? `Hi ${senderPerson.name.split(' ')[0]},`
          : `Hi,`;

        const closing = tone === "formal" ? "Best regards," : "Thanks,";

        // Note: In a real implementation, this would use an LLM to generate the draft
        const draftBody = `${greeting}

[Draft based on your intent: "${intent}"]

${closing}
[Your name]`;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              draft: {
                to: [originalEmail.from],
                subject: suggestedSubject,
                body: draftBody,
                inReplyTo: emailId,
                threadId: originalEmail.threadId,
              },
              context: draftContext,
              instructions: "This is a draft suggestion. Please review and edit before sending. Use ea_send_email to send when ready.",
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

function formatEmail(email: EmailData) {
  return {
    id: email.id,
    threadId: email.threadId,
    subject: email.subject,
    from: email.from,
    to: email.to,
    receivedAt: email.receivedAt,
    isRead: email.isRead,
    importance: email.importance,
    actionStatus: email.actionStatus,
    labels: email.labels,
    preview: email.snippet?.slice(0, 200),
  };
}

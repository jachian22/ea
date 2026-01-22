#!/usr/bin/env node
/**
 * MCP Tool Server for Executive Assistant (EA)
 *
 * This server exposes EA capabilities as MCP tools that Claude Code can call.
 * It provides tools for:
 * - Knowledge Graph (people, commitments, interactions)
 * - Calendar (events, briefings, scheduling)
 * - Email (inbox, threads, drafting)
 * - Commitments (CRUD operations)
 * - Briefings (daily/weekly briefs)
 * - Actions (approval queue)
 * - Delegation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Import tool handlers
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerEmailTools } from "./tools/email.js";
import { registerCommitmentTools } from "./tools/commitments.js";
import { registerBriefingTools } from "./tools/briefings.js";
import { registerActionTools } from "./tools/actions.js";
import { registerDelegationTools } from "./tools/delegation.js";

// Server configuration
const SERVER_NAME = "ea-assistant";
const SERVER_VERSION = "1.0.0";

/**
 * Get the user ID from environment variable
 * This is set when configuring the MCP server in Claude Code
 */
function getUserId(): string {
  const userId = process.env.EA_USER_ID;
  if (!userId) {
    throw new Error("EA_USER_ID environment variable is required");
  }
  return userId;
}

/**
 * Main function to start the MCP server
 */
async function main() {
  // Create the MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Get the user ID from environment
  const userId = getUserId();

  // Register all tool categories
  registerKnowledgeTools(server, userId);
  registerCalendarTools(server, userId);
  registerEmailTools(server, userId);
  registerCommitmentTools(server, userId);
  registerBriefingTools(server, userId);
  registerActionTools(server, userId);
  registerDelegationTools(server, userId);

  // Create transport and connect
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[${SERVER_NAME}] MCP server started for user: ${userId}`);
}

// Run the server
main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  process.exit(1);
});

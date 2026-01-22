import { createFileRoute } from "@tanstack/react-router";
import {
  createStatementRun,
  upsertBankAccount,
  upsertBankStatement,
  completeStatementRun,
} from "~/data-access/statements";
import { sendRunCompletionNotification } from "~/services/discord";
import type { BanksProcessedData, StatementRunStatus } from "~/db/schema";

/**
 * Request body for statement run reporting
 */
interface ReportRequestBody {
  // User ID for tracking - in a production app this would be authenticated
  userId?: string;
  // Overall run status
  status: "completed" | "failed" | "mfa_required";
  // Per-bank results
  banks: {
    [bank: string]: {
      status: "success" | "failed" | "mfa_required" | "mfa_timeout" | "skipped";
      statementsDownloaded?: number;
      error?: string;
    };
  };
  // Downloaded statements
  statements: Array<{
    bank: string;
    accountType: string;
    last4: string;
    date: string; // e.g., "2025-01"
    filePath: string;
    fileSize?: number;
  }>;
  // Optional error message for the overall run
  error?: string;
  // Run duration in seconds
  duration?: number;
  // Discord webhook URL for notifications (optional - can come from settings)
  discordWebhookUrl?: string;
}

/**
 * POST /api/statements/report
 *
 * Called by the bank-statements CLI after each run to report results.
 * No authentication required (localhost only, personal use).
 *
 * This endpoint:
 * 1. Creates a statementRun record
 * 2. Upserts bankAccount records for any new accounts
 * 3. Upserts bankStatement records for downloaded statements
 * 4. Sends Discord notification with summary
 */
export const Route = createFileRoute("/api/statements/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as ReportRequestBody;

          // Validate required fields
          if (!body.status || !body.banks) {
            return Response.json(
              { error: "Missing required fields: status, banks" },
              { status: 400 }
            );
          }

          // Use a default user ID for now (personal use, single user)
          // In production, this would be authenticated
          const userId = body.userId || "default-user";

          // Calculate totals
          const totalStatementsDownloaded = body.statements?.length ?? 0;
          const banksProcessed = Object.keys(body.banks).length;
          const banksSuccessful = Object.values(body.banks).filter(
            (b) => b.status === "success"
          ).length;

          // Map CLI status to our schema status
          const runStatus: StatementRunStatus =
            body.status === "completed"
              ? "completed"
              : body.status === "mfa_required"
                ? "mfa_required"
                : "failed";

          // 1. Create the statement run record
          const run = await createStatementRun({
            userId,
            status: runStatus,
          });

          // 2. Process each downloaded statement
          const statementResults: { success: number; failed: number } = {
            success: 0,
            failed: 0,
          };

          if (body.statements && body.statements.length > 0) {
            for (const stmt of body.statements) {
              try {
                // Upsert the bank account
                const account = await upsertBankAccount(
                  userId,
                  stmt.bank,
                  stmt.accountType,
                  stmt.last4
                );

                // Upsert the statement
                await upsertBankStatement(
                  account.id,
                  stmt.date,
                  stmt.filePath,
                  stmt.fileSize
                );

                statementResults.success++;
              } catch (error) {
                console.error(
                  `[StatementsReport] Failed to save statement:`,
                  error
                );
                statementResults.failed++;
              }
            }
          }

          // 3. Complete the run with results
          const banksProcessedData: BanksProcessedData = body.banks;
          await completeStatementRun(run.id, {
            status: runStatus,
            statementsDownloaded: statementResults.success,
            banksProcessed: banksProcessedData,
            errorMessage: body.error,
          });

          // 4. Send Discord notification if webhook URL provided
          if (body.discordWebhookUrl) {
            try {
              const errors = Object.entries(body.banks)
                .filter(([, b]) => b.status !== "success" && b.error)
                .map(([bank, b]) => `${bank}: ${b.error}`);

              await sendRunCompletionNotification(body.discordWebhookUrl, {
                status:
                  runStatus === "completed"
                    ? "completed"
                    : banksSuccessful > 0
                      ? "partial"
                      : "failed",
                statementsDownloaded: statementResults.success,
                banksProcessed,
                banksSuccessful,
                duration: body.duration,
                errors: errors.length > 0 ? errors : undefined,
              });
            } catch (error) {
              // Log but don't fail the request if Discord notification fails
              console.error(
                "[StatementsReport] Failed to send Discord notification:",
                error
              );
            }
          }

          return Response.json({
            success: true,
            runId: run.id,
            statementsProcessed: {
              success: statementResults.success,
              failed: statementResults.failed,
            },
          });
        } catch (error) {
          console.error("[StatementsReport] Error processing report:", error);
          return Response.json(
            {
              error: "Failed to process report",
              details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
          );
        }
      },
    },
  },
});

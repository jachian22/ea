import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authenticatedMiddleware } from './middleware';
import {
  findStatementRunsByUserId,
  findLatestStatementRun,
  findStatementsByUserId,
  findBankAccountsByUserId,
  getStatementRunStats,
  getStatementCountsByBank,
} from '~/data-access/statements';

/**
 * Gets the statement runs history for the authenticated user.
 *
 * Returns a paginated list of past automation runs, useful for
 * viewing the history of statement downloads.
 *
 * @param limit Maximum number of runs to return (default: 20)
 * @returns Array of past runs (most recent first)
 */
export const getStatementRunsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        limit: z.number().min(1).max(100).optional().default(20),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const limit = data?.limit ?? 20;

    try {
      const runs = await findStatementRunsByUserId(userId, limit);

      return {
        success: true,
        data: runs.map((run) => ({
          id: run.id,
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          statementsDownloaded: run.statementsDownloaded,
          banksProcessed: run.banksProcessed,
          errorMessage: run.errorMessage,
        })),
        error: null,
      };
    } catch (error) {
      console.error('Failed to get statement runs:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get statement runs',
      };
    }
  });

/**
 * Gets the latest statement run for the authenticated user.
 *
 * Returns the most recent run regardless of status, useful for
 * displaying the current state on the dashboard.
 *
 * @returns The latest run or null if none exists
 */
export const getLatestStatementRunFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const run = await findLatestStatementRun(userId);

      if (!run) {
        return {
          success: true,
          data: null,
          error: null,
        };
      }

      return {
        success: true,
        data: {
          id: run.id,
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          statementsDownloaded: run.statementsDownloaded,
          banksProcessed: run.banksProcessed,
          errorMessage: run.errorMessage,
        },
        error: null,
      };
    } catch (error) {
      console.error('Failed to get latest statement run:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get latest statement run',
      };
    }
  });

/**
 * Gets all downloaded statements for the authenticated user.
 *
 * Returns statements with their associated bank account information,
 * sorted by statement date (most recent first).
 *
 * @param limit Maximum number of statements to return (default: 100)
 * @returns Array of statements with account info
 */
export const getStatementsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        limit: z.number().min(1).max(500).optional().default(100),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const limit = data?.limit ?? 100;

    try {
      const statements = await findStatementsByUserId(userId, limit);

      return {
        success: true,
        data: statements.map((stmt) => ({
          id: stmt.id,
          statementDate: stmt.statementDate,
          filePath: stmt.filePath,
          fileSize: stmt.fileSize,
          downloadedAt: stmt.downloadedAt,
          account: {
            id: stmt.account.id,
            bank: stmt.account.bank,
            accountType: stmt.account.accountType,
            last4: stmt.account.last4,
            nickname: stmt.account.nickname,
          },
        })),
        error: null,
      };
    } catch (error) {
      console.error('Failed to get statements:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get statements',
      };
    }
  });

/**
 * Gets all bank accounts for the authenticated user.
 *
 * Returns configured bank accounts, useful for displaying
 * account configuration on the dashboard.
 *
 * @returns Array of bank accounts
 */
export const getBankAccountsFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const accounts = await findBankAccountsByUserId(userId);

      return {
        success: true,
        data: accounts.map((account) => ({
          id: account.id,
          bank: account.bank,
          accountType: account.accountType,
          last4: account.last4,
          nickname: account.nickname,
          isEnabled: account.isEnabled,
          createdAt: account.createdAt,
        })),
        error: null,
      };
    } catch (error) {
      console.error('Failed to get bank accounts:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get bank accounts',
      };
    }
  });

/**
 * Gets statement statistics for the authenticated user.
 *
 * Returns aggregate statistics about runs and downloads,
 * useful for dashboard overview.
 *
 * @returns Statistics object
 */
export const getStatementStatsFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const [runStats, bankCounts] = await Promise.all([
        getStatementRunStats(userId),
        getStatementCountsByBank(userId),
      ]);

      return {
        success: true,
        data: {
          totalRuns: runStats.totalRuns,
          successfulRuns: runStats.successfulRuns,
          failedRuns: runStats.failedRuns,
          totalStatementsDownloaded: runStats.totalStatementsDownloaded,
          statementsByBank: bankCounts,
        },
        error: null,
      };
    } catch (error) {
      console.error('Failed to get statement stats:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get statement stats',
      };
    }
  });

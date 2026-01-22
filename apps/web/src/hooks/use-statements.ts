import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  statementRunsQueryOptions,
  latestStatementRunQueryOptions,
  statementsQueryOptions,
  bankAccountsQueryOptions,
  statementStatsQueryOptions,
} from '~/queries/statements';
import { authClient } from '~/lib/auth-client';
import type { BanksProcessedData, StatementRunStatus } from '~/db/schema';

/**
 * Statement run data returned from queries
 */
export interface StatementRunData {
  id: string;
  status: StatementRunStatus;
  startedAt: Date;
  completedAt: Date | null;
  statementsDownloaded: number | null;
  banksProcessed: BanksProcessedData | null;
  errorMessage: string | null;
}

/**
 * Statement data with account info returned from queries
 */
export interface StatementData {
  id: string;
  statementDate: string;
  filePath: string;
  fileSize: number | null;
  downloadedAt: Date;
  account: {
    id: string;
    bank: string;
    accountType: string;
    last4: string;
    nickname: string | null;
  };
}

/**
 * Bank account data returned from queries
 */
export interface BankAccountData {
  id: string;
  bank: string;
  accountType: string;
  last4: string;
  nickname: string | null;
  isEnabled: boolean | null;
  createdAt: Date;
}

/**
 * Statement statistics returned from queries
 */
export interface StatementStatsData {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalStatementsDownloaded: number;
  statementsByBank: { bank: string; count: number }[];
}

/**
 * Hook to get statement run history.
 *
 * Returns a paginated list of past automation runs,
 * useful for viewing the history of statement downloads.
 *
 * @param limit - Maximum number of runs to return (default: 20)
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with statement runs
 */
export function useStatementRuns(limit?: number, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...statementRunsQueryOptions(limit),
    enabled: enabled ?? isAuthenticated,
  });
}

/**
 * Hook to get the latest statement run.
 *
 * Returns the most recent run regardless of status,
 * useful for displaying the current state on the dashboard.
 *
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with the latest run
 */
export function useLatestStatementRun(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...latestStatementRunQueryOptions(),
    enabled: enabled ?? isAuthenticated,
  });
}

/**
 * Hook to get all downloaded statements.
 *
 * Returns statements with their associated bank account information,
 * sorted by statement date (most recent first).
 *
 * @param limit - Maximum number of statements to return (default: 100)
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with statements
 */
export function useStatements(limit?: number, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...statementsQueryOptions(limit),
    enabled: enabled ?? isAuthenticated,
  });
}

/**
 * Hook to get all bank accounts.
 *
 * Returns configured bank accounts for the user.
 *
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with bank accounts
 */
export function useBankAccounts(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...bankAccountsQueryOptions(),
    enabled: enabled ?? isAuthenticated,
  });
}

/**
 * Hook to get statement statistics.
 *
 * Returns aggregate statistics about runs and downloads.
 *
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with statistics
 */
export function useStatementStats(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...statementStatsQueryOptions(),
    enabled: enabled ?? isAuthenticated,
  });
}

/**
 * Convenience hook that combines all statement dashboard functionality.
 *
 * Provides comprehensive statement data along with loading states,
 * making it easy to build UI components for the statements dashboard.
 *
 * @returns Object with statement data, loading states, and helper functions
 */
export function useStatementsDashboard() {
  const queryClient = useQueryClient();
  const latestRunQuery = useLatestStatementRun();
  const runsQuery = useStatementRuns(10);
  const statementsQuery = useStatements(50);
  const accountsQuery = useBankAccounts();
  const statsQuery = useStatementStats();

  // Extract data with null/empty fallbacks
  const latestRun: StatementRunData | null = latestRunQuery.data?.success
    ? latestRunQuery.data.data
    : null;

  const runs: StatementRunData[] = runsQuery.data?.success ? runsQuery.data.data || [] : [];

  const statements: StatementData[] = statementsQuery.data?.success
    ? statementsQuery.data.data || []
    : [];

  const accounts: BankAccountData[] = accountsQuery.data?.success
    ? accountsQuery.data.data || []
    : [];

  const stats: StatementStatsData | null = statsQuery.data?.success ? statsQuery.data.data : null;

  // Helper to get status display info
  const getStatusInfo = (status: StatementRunStatus | null) => {
    switch (status) {
      case 'running':
        return { label: 'Running', color: 'blue' as const, icon: 'loader' };
      case 'completed':
        return { label: 'Completed', color: 'green' as const, icon: 'check' };
      case 'failed':
        return { label: 'Failed', color: 'red' as const, icon: 'x' };
      case 'mfa_required':
        return { label: 'MFA Required', color: 'yellow' as const, icon: 'key' };
      default:
        return { label: 'Unknown', color: 'gray' as const, icon: 'help' };
    }
  };

  // Helper to format bank names
  const formatBankName = (bank: string) => {
    const names: Record<string, string> = {
      chase: 'Chase',
      bofa: 'Bank of America',
      'wells-fargo': 'Wells Fargo',
      'capital-one': 'Capital One',
      amex: 'American Express',
    };
    return names[bank] || bank;
  };

  // Refresh function to invalidate all statement queries
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['statement-runs'] });
    queryClient.invalidateQueries({ queryKey: ['statements'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['statement-stats'] });
  };

  return {
    // Data
    latestRun,
    runs,
    statements,
    accounts,
    stats,

    // Status helpers
    hasRuns: runs.length > 0,
    hasStatements: statements.length > 0,
    hasAccounts: accounts.length > 0,
    isRunning: latestRun?.status === 'running',

    // Query states
    isLoading:
      latestRunQuery.isLoading ||
      runsQuery.isLoading ||
      statementsQuery.isLoading ||
      accountsQuery.isLoading ||
      statsQuery.isLoading,
    isError:
      latestRunQuery.isError ||
      runsQuery.isError ||
      statementsQuery.isError ||
      accountsQuery.isError ||
      statsQuery.isError,
    error:
      latestRunQuery.data?.error ||
      runsQuery.data?.error ||
      statementsQuery.data?.error ||
      accountsQuery.data?.error ||
      statsQuery.data?.error,

    // Helper functions
    getStatusInfo,
    formatBankName,

    // Actions
    refresh,
    refetchLatestRun: latestRunQuery.refetch,
    refetchRuns: runsQuery.refetch,
    refetchStatements: statementsQuery.refetch,
    refetchAccounts: accountsQuery.refetch,
    refetchStats: statsQuery.refetch,
  };
}

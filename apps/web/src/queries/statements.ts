import { queryOptions } from "@tanstack/react-query";
import {
  getStatementRunsFn,
  getLatestStatementRunFn,
  getStatementsFn,
  getBankAccountsFn,
  getStatementStatsFn,
} from "~/fn/statements";

/**
 * Query options for fetching statement run history.
 * Returns a paginated list of past automation runs.
 *
 * @param limit Maximum number of runs to return (default: 20)
 */
export const statementRunsQueryOptions = (limit?: number) =>
  queryOptions({
    queryKey: ["statement-runs", { limit }],
    queryFn: () => getStatementRunsFn({ data: { limit } }),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

/**
 * Query options for fetching the latest statement run.
 * Returns the most recent run regardless of status.
 */
export const latestStatementRunQueryOptions = () =>
  queryOptions({
    queryKey: ["statement-runs", "latest"],
    queryFn: () => getLatestStatementRunFn(),
    staleTime: 1000 * 60 * 1, // 1 minute - check frequently for running status
  });

/**
 * Query options for fetching all downloaded statements.
 * Returns statements with their associated bank account information.
 *
 * @param limit Maximum number of statements to return (default: 100)
 */
export const statementsQueryOptions = (limit?: number) =>
  queryOptions({
    queryKey: ["statements", { limit }],
    queryFn: () => getStatementsFn({ data: { limit } }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

/**
 * Query options for fetching all bank accounts.
 * Returns configured bank accounts for the user.
 */
export const bankAccountsQueryOptions = () =>
  queryOptions({
    queryKey: ["bank-accounts"],
    queryFn: () => getBankAccountsFn(),
    staleTime: 1000 * 60 * 10, // 10 minutes - accounts change infrequently
  });

/**
 * Query options for fetching statement statistics.
 * Returns aggregate statistics about runs and downloads.
 */
export const statementStatsQueryOptions = () =>
  queryOptions({
    queryKey: ["statement-stats"],
    queryFn: () => getStatementStatsFn(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

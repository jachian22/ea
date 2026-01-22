import { queryOptions } from "@tanstack/react-query";
import {
  getLatestBriefFn,
  getTodaysBriefFn,
  getBriefHistoryFn,
  getBriefByDateFn,
} from "~/fn/daily-brief";

/**
 * Query options for fetching the latest daily brief.
 * Returns the most recent brief regardless of date.
 */
export const latestBriefQueryOptions = () =>
  queryOptions({
    queryKey: ["daily-brief", "latest"],
    queryFn: () => getLatestBriefFn(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

/**
 * Query options for fetching today's daily brief.
 * Returns null if today's brief hasn't been generated yet.
 */
export const todaysBriefQueryOptions = () =>
  queryOptions({
    queryKey: ["daily-brief", "today"],
    queryFn: () => getTodaysBriefFn(),
    staleTime: 1000 * 60 * 2, // 2 minutes - check more frequently for today's brief
  });

/**
 * Query options for fetching brief history.
 * Returns a paginated list of past briefs (most recent first).
 *
 * @param limit Maximum number of briefs to return (default: 30)
 */
export const briefHistoryQueryOptions = (limit?: number) =>
  queryOptions({
    queryKey: ["daily-brief", "history", { limit }],
    queryFn: () => getBriefHistoryFn({ data: { limit } }),
    staleTime: 1000 * 60 * 10, // 10 minutes - history changes less frequently
  });

/**
 * Query options for fetching a specific brief by date.
 *
 * @param briefDate The date in YYYY-MM-DD format
 */
export const briefByDateQueryOptions = (briefDate: string) =>
  queryOptions({
    queryKey: ["daily-brief", "date", briefDate],
    queryFn: () => getBriefByDateFn({ data: { briefDate } }),
    staleTime: 1000 * 60 * 30, // 30 minutes - past briefs are immutable
  });

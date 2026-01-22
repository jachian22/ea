import { queryOptions } from "@tanstack/react-query";
import {
  getActionTypesFn,
  getActionTypesByCategoryFn,
  getAuthoritySettingsFn,
  getPendingApprovalsFn,
  getPendingApprovalCountFn,
  getActionLogsFn,
  getActionStatsFn,
} from "~/fn/authority";
import type { ActionCategory, ActionLogStatus } from "~/db/schema";

/**
 * Query options for fetching all action types
 */
export const actionTypesQueryOptions = () =>
  queryOptions({
    queryKey: ["authority", "action-types"],
    queryFn: () => getActionTypesFn(),
    staleTime: 1000 * 60 * 60, // 1 hour - action types rarely change
  });

/**
 * Query options for fetching action types by category
 */
export const actionTypesByCategoryQueryOptions = (category: ActionCategory) =>
  queryOptions({
    queryKey: ["authority", "action-types", "category", category],
    queryFn: () => getActionTypesByCategoryFn({ data: { category } }),
    staleTime: 1000 * 60 * 60, // 1 hour
  });

/**
 * Query options for fetching user authority settings
 */
export const authoritySettingsQueryOptions = () =>
  queryOptions({
    queryKey: ["authority", "settings"],
    queryFn: () => getAuthoritySettingsFn(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

/**
 * Query options for fetching pending approvals
 */
export const pendingApprovalsQueryOptions = (limit?: number) =>
  queryOptions({
    queryKey: ["authority", "pending", { limit }],
    queryFn: () => getPendingApprovalsFn({ data: { limit } }),
    staleTime: 1000 * 30, // 30 seconds - refresh frequently
    refetchInterval: 1000 * 60, // Refetch every minute
  });

/**
 * Query options for fetching pending approval count
 */
export const pendingApprovalCountQueryOptions = () =>
  queryOptions({
    queryKey: ["authority", "pending-count"],
    queryFn: () => getPendingApprovalCountFn(),
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Refetch every minute
  });

/**
 * Query options for fetching action logs
 */
export const actionLogsQueryOptions = (limit?: number, status?: ActionLogStatus) =>
  queryOptions({
    queryKey: ["authority", "logs", { limit, status }],
    queryFn: () => getActionLogsFn({ data: { limit, status } }),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

/**
 * Query options for fetching action statistics
 */
export const actionStatsQueryOptions = (sinceDays?: number) =>
  queryOptions({
    queryKey: ["authority", "stats", { sinceDays }],
    queryFn: () => getActionStatsFn({ data: sinceDays ? { sinceDays } : undefined }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

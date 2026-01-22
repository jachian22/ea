import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  actionTypesQueryOptions,
  authoritySettingsQueryOptions,
  pendingApprovalsQueryOptions,
  pendingApprovalCountQueryOptions,
  actionLogsQueryOptions,
  actionStatsQueryOptions,
} from '~/queries/authority';
import {
  updateAuthoritySettingFn,
  bulkUpdateAuthoritySettingsFn,
  initializeAuthorityFn,
  disableAllAutomationFn,
  enableConservativeAutomationFn,
  approveActionFn,
  rejectActionFn,
  batchApproveActionsFn,
  batchRejectActionsFn,
  reverseActionFn,
  submitFeedbackFn,
} from '~/fn/authority';
import { authClient } from '~/lib/auth-client';
import { getErrorMessage } from '~/utils/error';
import type {
  ActionType,
  AuthoritySetting,
  ActionLog,
  AuthorityLevel,
  ActionLogStatus,
  UserFeedback,
  AuthorityConditions,
} from '~/db/schema';

// Type for standard server function response
type ServerFnResponse<T = unknown> = {
  success: boolean;
  data?: T | null;
  error?: string | null;
};

// Type for batch operations response
type BatchOperationResponse = ServerFnResponse<{
  approved?: number;
  rejected?: number;
}>;

// ============================================================================
// Action Types
// ============================================================================

/**
 * Hook to get all available action types
 */
export function useActionTypes() {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...actionTypesQueryOptions(),
    enabled: isAuthenticated,
  });
}

// ============================================================================
// Authority Settings
// ============================================================================

/**
 * Hook to get user's authority settings
 */
export function useAuthoritySettings() {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...authoritySettingsQueryOptions(),
    enabled: isAuthenticated,
  });
}

/**
 * Hook to update a single authority setting
 */
export function useUpdateAuthoritySetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      actionTypeName: string;
      authorityLevel: AuthorityLevel;
      conditions?: AuthorityConditions;
    }) => updateAuthoritySettingFn({ data }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Setting updated', {
          description: 'Authority setting has been updated.',
        });
        queryClient.invalidateQueries({ queryKey: ['authority', 'settings'] });
      } else {
        toast.error(result.error || 'Failed to update setting');
      }
    },
    onError: (error) => {
      toast.error('Failed to update setting', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to bulk update authority settings
 */
export function useBulkUpdateAuthoritySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      updates: Array<{
        actionTypeId: string;
        authorityLevel: AuthorityLevel;
        conditions?: AuthorityConditions;
      }>
    ) => bulkUpdateAuthoritySettingsFn({ data: { updates } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Settings updated', {
          description: 'Authority settings have been updated.',
        });
        queryClient.invalidateQueries({ queryKey: ['authority', 'settings'] });
      } else {
        toast.error(result.error || 'Failed to update settings');
      }
    },
    onError: (error) => {
      toast.error('Failed to update settings', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to initialize authority settings for a new user
 */
export function useInitializeAuthority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => initializeAuthorityFn(),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['authority'] });
      }
    },
  });
}

/**
 * Hook to disable all automation
 */
export function useDisableAllAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => disableAllAutomationFn(),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Automation disabled', {
          description: 'All automation has been disabled.',
        });
        queryClient.invalidateQueries({ queryKey: ['authority', 'settings'] });
      } else {
        toast.error(result.error || 'Failed to disable automation');
      }
    },
    onError: (error) => {
      toast.error('Failed to disable automation', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to enable conservative automation
 */
export function useEnableConservativeAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => enableConservativeAutomationFn(),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Automation enabled', {
          description: 'Conservative automation defaults have been enabled.',
        });
        queryClient.invalidateQueries({ queryKey: ['authority', 'settings'] });
      } else {
        toast.error(result.error || 'Failed to enable automation');
      }
    },
    onError: (error) => {
      toast.error('Failed to enable automation', {
        description: getErrorMessage(error),
      });
    },
  });
}

// ============================================================================
// Pending Approvals / Action Logs
// ============================================================================

/**
 * Hook to get pending approvals
 */
export function usePendingApprovals(limit?: number) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...pendingApprovalsQueryOptions(limit),
    enabled: isAuthenticated,
  });
}

/**
 * Hook to get pending approval count
 */
export function usePendingApprovalCount() {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...pendingApprovalCountQueryOptions(),
    enabled: isAuthenticated,
  });
}

/**
 * Hook to get action logs
 */
export function useActionLogs(limit?: number, status?: ActionLogStatus) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...actionLogsQueryOptions(limit, status),
    enabled: isAuthenticated,
  });
}

/**
 * Hook to get action statistics
 */
export function useActionStats(sinceDays?: number) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...actionStatsQueryOptions(sinceDays),
    enabled: isAuthenticated,
  });
}

// ============================================================================
// Action Mutations
// ============================================================================

/**
 * Hook to approve an action
 */
export function useApproveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { actionLogId: string; editedContent?: string }) =>
      approveActionFn({ data }),
    onSuccess: (rawResult) => {
      const result = rawResult as ServerFnResponse;
      if (result.success) {
        toast.success('Action approved');
        queryClient.invalidateQueries({ queryKey: ['authority', 'pending'] });
        queryClient.invalidateQueries({ queryKey: ['authority', 'logs'] });
        queryClient.invalidateQueries({ queryKey: ['authority', 'pending-count'] });
      } else {
        toast.error(result.error || 'Failed to approve action');
      }
    },
    onError: (error) => {
      toast.error('Failed to approve action', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to reject an action
 */
export function useRejectAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { actionLogId: string; reason?: string }) => rejectActionFn({ data }),
    onSuccess: (rawResult) => {
      const result = rawResult as ServerFnResponse;
      if (result.success) {
        toast.success('Action rejected');
        queryClient.invalidateQueries({ queryKey: ['authority', 'pending'] });
        queryClient.invalidateQueries({ queryKey: ['authority', 'logs'] });
        queryClient.invalidateQueries({ queryKey: ['authority', 'pending-count'] });
      } else {
        toast.error(result.error || 'Failed to reject action');
      }
    },
    onError: (error) => {
      toast.error('Failed to reject action', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to batch approve actions
 */
export function useBatchApproveActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (actionLogIds: string[]) => batchApproveActionsFn({ data: { actionLogIds } }),
    onSuccess: (rawResult) => {
      const result = rawResult as BatchOperationResponse;
      if (result.success && result.data) {
        toast.success('Actions approved', {
          description: (result.data.approved || 0) + ' actions approved',
        });
        queryClient.invalidateQueries({ queryKey: ['authority', 'pending'] });
        queryClient.invalidateQueries({ queryKey: ['authority', 'logs'] });
        queryClient.invalidateQueries({ queryKey: ['authority', 'pending-count'] });
      } else {
        toast.error(result.error || 'Failed to approve actions');
      }
    },
    onError: (error) => {
      toast.error('Failed to approve actions', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to batch reject actions
 */
export function useBatchRejectActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { actionLogIds: string[]; reason?: string }) =>
      batchRejectActionsFn({ data }),
    onSuccess: (rawResult) => {
      const result = rawResult as BatchOperationResponse;
      if (result.success && result.data) {
        toast.success('Actions rejected', {
          description: (result.data.rejected || 0) + ' actions rejected',
        });
        queryClient.invalidateQueries({ queryKey: ['authority', 'pending'] });
        queryClient.invalidateQueries({ queryKey: ['authority', 'logs'] });
        queryClient.invalidateQueries({ queryKey: ['authority', 'pending-count'] });
      } else {
        toast.error(result.error || 'Failed to reject actions');
      }
    },
    onError: (error) => {
      toast.error('Failed to reject actions', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to reverse an action
 */
export function useReverseAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { actionLogId: string; reason?: string }) => reverseActionFn({ data }),
    onSuccess: (rawResult) => {
      const result = rawResult as ServerFnResponse;
      if (result.success) {
        toast.success('Action reversed');
        queryClient.invalidateQueries({ queryKey: ['authority', 'logs'] });
      } else {
        toast.error(result.error || 'Failed to reverse action');
      }
    },
    onError: (error) => {
      toast.error('Failed to reverse action', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to submit feedback for an action
 */
export function useSubmitFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { actionLogId: string; feedback: UserFeedback }) =>
      submitFeedbackFn({ data }),
    onSuccess: (rawResult) => {
      const result = rawResult as ServerFnResponse;
      if (result.success) {
        toast.success('Feedback submitted', {
          description: 'Thank you for your feedback!',
        });
        queryClient.invalidateQueries({ queryKey: ['authority', 'logs'] });
      } else {
        toast.error(result.error || 'Failed to submit feedback');
      }
    },
    onError: (error) => {
      toast.error('Failed to submit feedback', {
        description: getErrorMessage(error),
      });
    },
  });
}

// ============================================================================
// Convenience Hook
// ============================================================================

// Type aliases for query responses
type ActionTypesResponse = ServerFnResponse<ActionType[]>;
type AuthoritySettingsResponse = ServerFnResponse<
  Array<AuthoritySetting & { actionType: ActionType }>
>;
type PendingApprovalsResponse = ServerFnResponse<Array<ActionLog & { actionType: ActionType }>>;
type PendingCountResponse = ServerFnResponse<{ count: number }>;
type ActionStatsResponse = ServerFnResponse<{
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}>;

/**
 * Convenience hook that combines authority functionality
 */
export function useAuthority() {
  const queryClient = useQueryClient();
  const actionTypesQuery = useActionTypes();
  const settingsQuery = useAuthoritySettings();
  const pendingQuery = usePendingApprovals();
  const pendingCountQuery = usePendingApprovalCount();
  const statsQuery = useActionStats(30); // Last 30 days

  const updateSettingMutation = useUpdateAuthoritySetting();
  const approveActionMutation = useApproveAction();
  const rejectActionMutation = useRejectAction();
  const batchApproveMutation = useBatchApproveActions();
  const batchRejectMutation = useBatchRejectActions();
  const submitFeedbackMutation = useSubmitFeedback();
  const disableAllMutation = useDisableAllAutomation();
  const enableConservativeMutation = useEnableConservativeAutomation();

  // Cast the query data to expected types
  const actionTypesData = actionTypesQuery.data as ActionTypesResponse | undefined;
  const settingsData = settingsQuery.data as AuthoritySettingsResponse | undefined;
  const pendingData = pendingQuery.data as PendingApprovalsResponse | undefined;
  const pendingCountData = pendingCountQuery.data as PendingCountResponse | undefined;
  const statsData = statsQuery.data as ActionStatsResponse | undefined;

  // Extract data with null fallbacks
  const actionTypes: ActionType[] =
    actionTypesData?.success && actionTypesData.data ? actionTypesData.data : [];

  const settings: Array<AuthoritySetting & { actionType: ActionType }> =
    settingsData?.success && settingsData.data ? settingsData.data : [];

  const pendingActions: Array<ActionLog & { actionType: ActionType }> =
    pendingData?.success && pendingData.data ? pendingData.data : [];

  const pendingCount =
    pendingCountData?.success && pendingCountData.data ? pendingCountData.data.count : 0;

  const stats = statsData?.success ? statsData.data : null;

  // Refresh all authority data
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['authority'] });
  };

  return {
    // Data
    actionTypes,
    settings,
    pendingActions,
    pendingCount,
    stats,

    // Loading states
    isLoading: actionTypesQuery.isLoading || settingsQuery.isLoading,
    isLoadingPending: pendingQuery.isLoading,
    isLoadingStats: statsQuery.isLoading,

    // Error states
    isError: actionTypesQuery.isError || settingsQuery.isError,
    error: actionTypesQuery.error || settingsQuery.error,

    // Actions
    updateSetting: updateSettingMutation.mutate,
    approveAction: approveActionMutation.mutate,
    rejectAction: rejectActionMutation.mutate,
    batchApprove: batchApproveMutation.mutate,
    batchReject: batchRejectMutation.mutate,
    submitFeedback: submitFeedbackMutation.mutate,
    disableAll: disableAllMutation.mutate,
    enableConservative: enableConservativeMutation.mutate,

    // Action states
    isUpdatingSetting: updateSettingMutation.isPending,
    isApprovingAction: approveActionMutation.isPending,
    isRejectingAction: rejectActionMutation.isPending,
    isBatchApproving: batchApproveMutation.isPending,
    isBatchRejecting: batchRejectMutation.isPending,

    // Refresh
    refresh,
  };
}

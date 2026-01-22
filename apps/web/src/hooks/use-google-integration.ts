import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { googleIntegrationStatusQueryOptions } from '~/queries/google-integration';
import {
  initiateGoogleAuthFn,
  disconnectGoogleIntegrationFn,
  type GoogleIntegrationStatus,
} from '~/fn/google-auth';
import { authClient } from '~/lib/auth-client';
import { getErrorMessage } from '~/utils/error';

/**
 * Hook to get the current user's Google integration status.
 *
 * Returns information about whether Google is connected, the associated email,
 * and whether reauthorization is needed.
 *
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with Google integration status
 */
export function useGoogleIntegrationStatus(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...googleIntegrationStatusQueryOptions(),
    enabled: enabled ?? isAuthenticated,
  });
}

/**
 * Hook to initiate Google OAuth connection flow.
 *
 * When the mutation succeeds, it redirects the user to Google's consent screen.
 * After authorization, Google will redirect back to our callback URL.
 *
 * @returns Mutation for initiating Google OAuth flow
 */
export function useConnectGoogle() {
  return useMutation({
    mutationFn: initiateGoogleAuthFn,
    onSuccess: (result) => {
      if (result.success && result.data?.authUrl) {
        // Redirect to Google's OAuth consent screen
        window.location.href = result.data.authUrl;
      } else {
        toast.error(result.error || 'Failed to initiate Google connection');
      }
    },
    onError: (error) => {
      toast.error('Failed to connect Google account', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to disconnect Google integration.
 *
 * This will revoke the OAuth tokens and remove the integration from the database.
 * The user will need to reconnect if they want to use Google features again.
 *
 * @returns Mutation for disconnecting Google integration
 */
export function useDisconnectGoogle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectGoogleIntegrationFn,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Google account disconnected successfully');
        // Invalidate the status query to reflect the disconnected state
        queryClient.invalidateQueries({
          queryKey: ['google-integration'],
        });
        // Also invalidate daily briefs since they depend on Google integration
        queryClient.invalidateQueries({
          queryKey: ['daily-brief'],
        });
      } else {
        toast.error(result.error || 'Failed to disconnect Google account');
      }
    },
    onError: (error) => {
      toast.error('Failed to disconnect Google account', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Convenience hook that combines all Google integration functionality.
 *
 * Provides the integration status along with connect/disconnect actions,
 * making it easy to build UI components for managing Google integration.
 *
 * @returns Object with status data, loading states, and action functions
 */
export function useGoogleIntegration() {
  const statusQuery = useGoogleIntegrationStatus();
  const connectMutation = useConnectGoogle();
  const disconnectMutation = useDisconnectGoogle();

  // Extract status data with sensible defaults
  const status: GoogleIntegrationStatus = statusQuery.data?.success
    ? statusQuery.data.data
    : {
        hasIntegration: false,
        isConnected: false,
        googleEmail: null,
        scope: null,
        lastSyncedAt: null,
        connectedAt: null,
        needsReauthorization: false,
      };

  return {
    // Status data
    status,
    isConnected: status.isConnected,
    googleEmail: status.googleEmail,
    needsReauthorization: status.needsReauthorization,
    connectedAt: status.connectedAt,
    lastSyncedAt: status.lastSyncedAt,

    // Query state
    isLoading: statusQuery.isLoading,
    isError: statusQuery.isError || statusQuery.data?.success === false,
    error: statusQuery.data?.error || statusQuery.error?.message,

    // Actions
    connect: connectMutation.mutate,
    disconnect: disconnectMutation.mutate,

    // Action states
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,

    // Refetch function for manual refresh
    refetch: statusQuery.refetch,
  };
}

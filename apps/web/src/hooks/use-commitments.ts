import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  commitmentsQueryOptions,
  commitmentByIdQueryOptions,
  commitmentStatsQueryOptions,
} from "~/queries/commitments";
import {
  createCommitmentFn,
  updateCommitmentFn,
  deleteCommitmentFn,
} from "~/fn/commitments";
import { authClient } from "~/lib/auth-client";
import { getErrorMessage } from "~/utils/error";
import type { CommitmentStatus } from "~/db/schema";

/**
 * Hook to get commitments with a specific filter
 */
export function useCommitments(
  filter: "all" | "open" | "user_owes" | "they_owe" | "due_today" | "overdue" | "upcoming" = "open"
) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...commitmentsQueryOptions(filter),
    enabled: isAuthenticated,
  });
}

/**
 * Hook to get a specific commitment by ID
 */
export function useCommitment(id: string) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...commitmentByIdQueryOptions(id),
    enabled: isAuthenticated && !!id,
  });
}

/**
 * Hook to get commitment statistics
 */
export function useCommitmentStats() {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...commitmentStatsQueryOptions(),
    enabled: isAuthenticated,
  });
}

/**
 * Hook to create a new commitment
 */
export function useCreateCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      description: string;
      direction: "user_owes" | "they_owe";
      personEmail?: string;
      personName?: string;
      dueDate?: string;
      priority?: "high" | "medium" | "low";
      createReminders?: boolean;
    }) => createCommitmentFn({ data }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Commitment created", {
          description: "Your commitment has been added.",
        });
        queryClient.invalidateQueries({ queryKey: ["commitments"] });
      } else {
        toast.error(result.error || "Failed to create commitment");
      }
    },
    onError: (error) => {
      toast.error("Failed to create commitment", {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to update a commitment
 */
export function useUpdateCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id: string;
      description?: string;
      dueDate?: string | null;
      priority?: "high" | "medium" | "low";
      status?: CommitmentStatus;
      completionEvidence?: string;
    }) => updateCommitmentFn({ data }),
    onSuccess: (result, variables) => {
      if (result.success) {
        if (variables.status === "completed") {
          toast.success("Commitment completed!", {
            description: "Great job following through.",
          });
        } else {
          toast.success("Commitment updated");
        }
        queryClient.invalidateQueries({ queryKey: ["commitments"] });
      } else {
        toast.error(result.error || "Failed to update commitment");
      }
    },
    onError: (error) => {
      toast.error("Failed to update commitment", {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Hook to delete a commitment
 */
export function useDeleteCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCommitmentFn({ data: { id } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Commitment deleted");
        queryClient.invalidateQueries({ queryKey: ["commitments"] });
      } else {
        toast.error(result.error || "Failed to delete commitment");
      }
    },
    onError: (error) => {
      toast.error("Failed to delete commitment", {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Convenience hook for commitment management with all CRUD operations
 */
export function useCommitmentManagement() {
  const queryClient = useQueryClient();
  const statsQuery = useCommitmentStats();
  const openCommitmentsQuery = useCommitments("open");
  const dueTodayQuery = useCommitments("due_today");
  const overdueQuery = useCommitments("overdue");

  const createMutation = useCreateCommitment();
  const updateMutation = useUpdateCommitment();
  const deleteMutation = useDeleteCommitment();

  return {
    // Data
    stats: statsQuery.data?.success ? statsQuery.data.data : null,
    openCommitments: openCommitmentsQuery.data?.success
      ? openCommitmentsQuery.data.data
      : [],
    dueToday: dueTodayQuery.data?.success ? dueTodayQuery.data.data : [],
    overdue: overdueQuery.data?.success ? overdueQuery.data.data : [],

    // Loading states
    isLoadingStats: statsQuery.isLoading,
    isLoadingOpen: openCommitmentsQuery.isLoading,
    isLoadingDueToday: dueTodayQuery.isLoading,
    isLoadingOverdue: overdueQuery.isLoading,

    // Error states
    error:
      statsQuery.error ||
      openCommitmentsQuery.error ||
      dueTodayQuery.error ||
      overdueQuery.error,

    // Actions
    createCommitment: createMutation.mutate,
    createCommitmentAsync: createMutation.mutateAsync,
    updateCommitment: updateMutation.mutate,
    updateCommitmentAsync: updateMutation.mutateAsync,
    deleteCommitment: deleteMutation.mutate,
    deleteCommitmentAsync: deleteMutation.mutateAsync,

    // Action states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Refresh
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
    },
  };
}

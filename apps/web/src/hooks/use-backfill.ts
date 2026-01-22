import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "~/lib/auth-client";
import {
  startBackfillJobFn,
  getBackfillJobsFn,
  getActiveBackfillJobFn,
  getBackfillJobByIdFn,
  pauseBackfillJobFn,
  resumeBackfillJobFn,
  deleteBackfillJobFn,
} from "~/fn/backfill";
import type { BackfillSourceType } from "~/db/schema";

// ============================================================================
// Query Keys
// ============================================================================

export const backfillKeys = {
  all: ["backfill"] as const,
  jobs: () => [...backfillKeys.all, "jobs"] as const,
  activeJob: () => [...backfillKeys.all, "active"] as const,
  job: (id: string) => [...backfillKeys.all, "job", id] as const,
};

// ============================================================================
// Get Backfill Jobs
// ============================================================================

export function useBackfillJobs(options?: { limit?: number }, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: backfillKeys.jobs(),
    queryFn: () => getBackfillJobsFn({ data: options }),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: 1000 * 30, // 30 seconds
  });
}

// ============================================================================
// Get Active Backfill Job
// ============================================================================

export function useActiveBackfillJob(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: backfillKeys.activeJob(),
    queryFn: () => getActiveBackfillJobFn(),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: 1000 * 10, // 10 seconds - refresh frequently for progress
    refetchInterval: (query) => {
      // Auto-refresh while job is running
      const data = query.state.data;
      if (data?.success && data.data?.status === "running") {
        return 5000; // 5 seconds
      }
      return false;
    },
  });
}

// ============================================================================
// Get Backfill Job by ID
// ============================================================================

export function useBackfillJob(id: string, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: backfillKeys.job(id),
    queryFn: () => getBackfillJobByIdFn({ data: { id } }),
    enabled: (enabled ?? true) && isAuthenticated && !!id,
    staleTime: 1000 * 10, // 10 seconds
    refetchInterval: (query) => {
      // Auto-refresh while job is running
      const data = query.state.data;
      if (data?.success && data.data?.status === "running") {
        return 5000; // 5 seconds
      }
      return false;
    },
  });
}

// ============================================================================
// Start Backfill Job
// ============================================================================

export function useStartBackfill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      sourceType: BackfillSourceType;
      startDate: string;
      endDate: string;
      saveCommitments?: boolean;
      minCommitmentConfidence?: number;
    }) => startBackfillJobFn({ data }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Backfill job started");
        queryClient.invalidateQueries({ queryKey: backfillKeys.all });
      } else {
        toast.error("Failed to start backfill", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to start backfill", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// ============================================================================
// Pause Backfill Job
// ============================================================================

export function usePauseBackfill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pauseBackfillJobFn({ data: { id } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Backfill job paused");
        queryClient.invalidateQueries({ queryKey: backfillKeys.all });
      } else {
        toast.error("Failed to pause backfill", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to pause backfill", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// ============================================================================
// Resume Backfill Job
// ============================================================================

export function useResumeBackfill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resumeBackfillJobFn({ data: { id } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Backfill job resumed");
        queryClient.invalidateQueries({ queryKey: backfillKeys.all });
      } else {
        toast.error("Failed to resume backfill", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to resume backfill", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// ============================================================================
// Delete Backfill Job
// ============================================================================

export function useDeleteBackfill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBackfillJobFn({ data: { id } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Backfill job deleted");
        queryClient.invalidateQueries({ queryKey: backfillKeys.all });
      } else {
        toast.error("Failed to delete backfill", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to delete backfill", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

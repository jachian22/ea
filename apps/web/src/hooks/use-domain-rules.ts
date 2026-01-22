import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "~/lib/auth-client";
import {
  createDomainRuleFn,
  getDomainRulesFn,
  updateDomainRuleFn,
  deleteDomainRuleFn,
  bulkCreateDomainRulesFn,
} from "~/fn/domain-rules";
import type { DomainRuleType, PersonDomain } from "~/db/schema";

// ============================================================================
// Query Keys
// ============================================================================

export const domainRulesKeys = {
  all: ["domain-rules"] as const,
  list: () => [...domainRulesKeys.all, "list"] as const,
};

// ============================================================================
// Get Domain Rules
// ============================================================================

export function useDomainRules(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: domainRulesKeys.list(),
    queryFn: () => getDomainRulesFn(),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================================================
// Create Domain Rule
// ============================================================================

export function useCreateDomainRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      ruleType: DomainRuleType;
      pattern: string;
      domain: PersonDomain;
      priority?: number;
    }) => createDomainRuleFn({ data }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Domain rule created");
        queryClient.invalidateQueries({ queryKey: domainRulesKeys.all });
      } else {
        toast.error("Failed to create domain rule", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to create domain rule", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// ============================================================================
// Update Domain Rule
// ============================================================================

export function useUpdateDomainRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id: string;
      pattern?: string;
      domain?: PersonDomain;
      priority?: number;
    }) => updateDomainRuleFn({ data }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Domain rule updated");
        queryClient.invalidateQueries({ queryKey: domainRulesKeys.all });
      } else {
        toast.error("Failed to update domain rule", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to update domain rule", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// ============================================================================
// Delete Domain Rule
// ============================================================================

export function useDeleteDomainRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteDomainRuleFn({ data: { id } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Domain rule deleted");
        queryClient.invalidateQueries({ queryKey: domainRulesKeys.all });
      } else {
        toast.error("Failed to delete domain rule", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to delete domain rule", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// ============================================================================
// Bulk Create Domain Rules
// ============================================================================

export function useBulkCreateDomainRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      rules: Array<{
        ruleType: DomainRuleType;
        pattern: string;
        domain: PersonDomain;
        priority?: number;
      }>
    ) => bulkCreateDomainRulesFn({ data: { rules } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`${result.data?.length || 0} domain rules created`);
        queryClient.invalidateQueries({ queryKey: domainRulesKeys.all });
      } else {
        toast.error("Failed to create domain rules", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to create domain rules", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

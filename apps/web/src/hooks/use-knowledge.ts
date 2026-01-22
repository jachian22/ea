import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '~/lib/auth-client';
import {
  getPersonContextFn,
  searchKnowledgeFn,
  getCommitmentsDashboardFn,
  getPeopleByDomainFn,
  getFollowUpRadarFn,
  getRelationshipsFn,
  getKnowledgeSummaryFn,
} from '~/fn/knowledge';
import type { PersonDomain, RelationType } from '~/db/schema';

// ============================================================================
// Query Keys
// ============================================================================

export const knowledgeKeys = {
  all: ['knowledge'] as const,
  personContext: (personId: string) => [...knowledgeKeys.all, 'person', personId] as const,
  search: (query: string) => [...knowledgeKeys.all, 'search', query] as const,
  commitmentsDashboard: () => [...knowledgeKeys.all, 'commitments-dashboard'] as const,
  peopleByDomain: (domain: PersonDomain) =>
    [...knowledgeKeys.all, 'people-by-domain', domain] as const,
  followUpRadar: (daysThreshold?: number) =>
    [...knowledgeKeys.all, 'follow-up-radar', daysThreshold ?? 30] as const,
  relationships: (relationType?: RelationType) =>
    [...knowledgeKeys.all, 'relationships', relationType ?? 'all'] as const,
  summary: () => [...knowledgeKeys.all, 'summary'] as const,
};

// ============================================================================
// Get Person Context (Full Dossier)
// ============================================================================

export function usePersonContext(personId: string, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: knowledgeKeys.personContext(personId),
    queryFn: () => getPersonContextFn({ data: { personId } }),
    enabled: (enabled ?? true) && isAuthenticated && !!personId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

// ============================================================================
// Search Knowledge Graph
// ============================================================================

export function useSearchKnowledge(query: string, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: knowledgeKeys.search(query),
    queryFn: () => searchKnowledgeFn({ data: { query, limit: 20 } }),
    enabled: (enabled ?? true) && isAuthenticated && query.length >= 2,
    staleTime: 1000 * 60 * 1, // 1 minute
  });
}

// ============================================================================
// Get Commitments Dashboard
// ============================================================================

export function useCommitmentsDashboard(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: knowledgeKeys.commitmentsDashboard(),
    queryFn: () => getCommitmentsDashboardFn(),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

// ============================================================================
// Get People by Domain
// ============================================================================

export function usePeopleByDomain(domain: PersonDomain, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: knowledgeKeys.peopleByDomain(domain),
    queryFn: () => getPeopleByDomainFn({ data: { domain, limit: 50 } }),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================================================
// Get Follow-Up Radar
// ============================================================================

export function useFollowUpRadar(
  options?: { daysThreshold?: number; limit?: number },
  enabled?: boolean
) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: knowledgeKeys.followUpRadar(options?.daysThreshold),
    queryFn: () => getFollowUpRadarFn({ data: options }),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================================================
// Get Relationships
// ============================================================================

export function useRelationships(relationType?: RelationType, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: knowledgeKeys.relationships(relationType),
    queryFn: () => getRelationshipsFn({ data: relationType ? { relationType } : undefined }),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================================================
// Get Knowledge Summary
// ============================================================================

export function useKnowledgeSummary(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: knowledgeKeys.summary(),
    queryFn: () => getKnowledgeSummaryFn(),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================================================
// Invalidation Helpers
// ============================================================================

export function useInvalidateKnowledge() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.all }),
    invalidatePersonContext: (personId: string) =>
      queryClient.invalidateQueries({
        queryKey: knowledgeKeys.personContext(personId),
      }),
    invalidateSearch: () =>
      queryClient.invalidateQueries({
        queryKey: [...knowledgeKeys.all, 'search'],
      }),
    invalidateCommitmentsDashboard: () =>
      queryClient.invalidateQueries({
        queryKey: knowledgeKeys.commitmentsDashboard(),
      }),
    invalidateSummary: () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.summary() }),
  };
}

import { queryOptions } from '@tanstack/react-query';
import { getCommitmentsFn, getCommitmentByIdFn, getCommitmentStatsFn } from '~/fn/commitments';

/**
 * Query options for fetching commitments with filters
 */
export const commitmentsQueryOptions = (
  filter: 'all' | 'open' | 'user_owes' | 'they_owe' | 'due_today' | 'overdue' | 'upcoming' = 'open'
) =>
  queryOptions({
    queryKey: ['commitments', filter],
    queryFn: () => getCommitmentsFn({ data: { filter } }),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

/**
 * Query options for fetching a specific commitment
 */
export const commitmentByIdQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['commitments', 'detail', id],
    queryFn: () => getCommitmentByIdFn({ data: { id } }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

/**
 * Query options for fetching commitment statistics
 */
export const commitmentStatsQueryOptions = () =>
  queryOptions({
    queryKey: ['commitments', 'stats'],
    queryFn: () => getCommitmentStatsFn(),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

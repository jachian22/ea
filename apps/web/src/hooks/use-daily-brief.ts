import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  latestBriefQueryOptions,
  todaysBriefQueryOptions,
  briefHistoryQueryOptions,
  briefByDateQueryOptions,
} from '~/queries/daily-brief';
import { generateBriefFn } from '~/fn/daily-brief';
import { authClient } from '~/lib/auth-client';
import { getErrorMessage } from '~/utils/error';
import type {
  CalendarEventData,
  EmailData,
  DailyBriefStatus,
  WeatherBriefData,
  EnrichedBriefData,
} from '~/db/schema';

/**
 * Brief data returned from queries
 */
export interface DailyBriefData {
  id: string;
  briefDate: string;
  status: DailyBriefStatus;
  briefContent: string | null;
  calendarEvents: CalendarEventData[] | null;
  emails: EmailData[] | null;
  // Weather is optional for backwards compatibility with older briefs
  weather?: WeatherBriefData | null;
  // AI-enriched content from Discord bot (optional)
  enrichedContent?: EnrichedBriefData | null;
  enrichedAt?: Date | null;
  totalEvents: string | null;
  totalEmails: string | null;
  emailsNeedingResponse: string | null;
  generatedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Brief summary data returned from history queries
 */
export interface DailyBriefSummary {
  id: string;
  briefDate: string;
  status: DailyBriefStatus;
  totalEvents: string | null;
  totalEmails: string | null;
  emailsNeedingResponse: string | null;
  generatedAt: Date | null;
  createdAt: Date;
}

/**
 * Hook to get the latest daily brief for the current user.
 *
 * Returns the most recent brief regardless of date, useful for
 * displaying the current brief on the dashboard.
 *
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with the latest brief
 */
export function useLatestBrief(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...latestBriefQueryOptions(),
    enabled: enabled ?? isAuthenticated,
  });
}

/**
 * Hook to get today's daily brief for the current user.
 *
 * Returns the brief specifically for today's date, useful for
 * checking if today's brief has been generated.
 *
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with today's brief
 */
export function useTodaysBrief(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...todaysBriefQueryOptions(),
    enabled: enabled ?? isAuthenticated,
  });
}

/**
 * Hook to get brief history for the current user.
 *
 * Returns a paginated list of past briefs (most recent first),
 * useful for viewing historical briefs.
 *
 * @param limit - Maximum number of briefs to return (default: 30)
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with brief history
 */
export function useBriefHistory(limit?: number, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...briefHistoryQueryOptions(limit),
    enabled: enabled ?? isAuthenticated,
  });
}

/**
 * Hook to get a specific brief by date.
 *
 * @param briefDate - The date in YYYY-MM-DD format
 * @param enabled - Whether to enable the query (defaults to true when user is authenticated)
 * @returns Query result with the brief for the specified date
 */
export function useBriefByDate(briefDate: string, enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    ...briefByDateQueryOptions(briefDate),
    enabled: (enabled ?? isAuthenticated) && !!briefDate,
  });
}

/**
 * Hook to manually generate/regenerate a daily brief.
 *
 * This triggers a fresh brief generation, fetching the latest
 * calendar events and emails from Google.
 *
 * @returns Mutation for generating a brief
 */
export function useGenerateBrief() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options?: { timeZone?: string }) => generateBriefFn({ data: options }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Brief generated successfully', {
          description: 'Your daily brief has been updated with the latest information.',
        });
        // Invalidate all brief-related queries to refresh the data
        queryClient.invalidateQueries({ queryKey: ['daily-brief'] });
      } else {
        toast.error(result.error || 'Failed to generate brief');
      }
    },
    onError: (error) => {
      toast.error('Failed to generate brief', {
        description: getErrorMessage(error),
      });
    },
  });
}

/**
 * Convenience hook that combines all daily brief functionality.
 *
 * Provides the latest brief data along with generation actions,
 * making it easy to build UI components for displaying and managing briefs.
 *
 * @returns Object with brief data, loading states, and action functions
 */
export function useDailyBrief() {
  const queryClient = useQueryClient();
  const latestBriefQuery = useLatestBrief();
  const todaysBriefQuery = useTodaysBrief();
  const generateMutation = useGenerateBrief();

  // Extract the latest brief data with null fallback
  const latestBrief: DailyBriefData | null = latestBriefQuery.data?.success
    ? latestBriefQuery.data.data
    : null;

  // Extract today's brief data with null fallback
  const todaysBrief: DailyBriefData | null = todaysBriefQuery.data?.success
    ? todaysBriefQuery.data.data
    : null;

  // Helper to check if the latest brief is from today
  const isLatestBriefFromToday = (): boolean => {
    if (!latestBrief) return false;
    const today = new Date().toISOString().split('T')[0];
    return latestBrief.briefDate === today;
  };

  // Helper to get parsed statistics
  const getStats = (brief: DailyBriefData | null) => {
    if (!brief) {
      return {
        totalEvents: 0,
        totalEmails: 0,
        emailsNeedingResponse: 0,
      };
    }
    return {
      totalEvents: parseInt(brief.totalEvents || '0', 10),
      totalEmails: parseInt(brief.totalEmails || '0', 10),
      emailsNeedingResponse: parseInt(brief.emailsNeedingResponse || '0', 10),
    };
  };

  // Refresh function to invalidate all brief queries
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['daily-brief'] });
  };

  return {
    // Brief data
    latestBrief,
    todaysBrief,

    // Status helpers
    hasBrief: latestBrief !== null,
    hasTodaysBrief: todaysBrief !== null,
    isLatestBriefFromToday: isLatestBriefFromToday(),
    briefStatus: latestBrief?.status ?? null,

    // Parsed statistics for the latest brief
    stats: getStats(latestBrief),
    todaysStats: getStats(todaysBrief),

    // Calendar, email, and weather data
    calendarEvents: latestBrief?.calendarEvents ?? [],
    emails: latestBrief?.emails ?? [],
    weather: latestBrief?.weather ?? null,

    // Brief content
    briefContent: latestBrief?.briefContent ?? null,

    // Enriched content from Discord bot
    enrichedContent: latestBrief?.enrichedContent ?? null,
    isEnriched: latestBrief?.enrichedAt != null,
    enrichedAt: latestBrief?.enrichedAt ?? null,

    // Error message if generation failed
    errorMessage: latestBrief?.errorMessage ?? null,

    // Query states
    isLoading: latestBriefQuery.isLoading || todaysBriefQuery.isLoading,
    isLoadingLatest: latestBriefQuery.isLoading,
    isLoadingTodays: todaysBriefQuery.isLoading,
    isError:
      latestBriefQuery.isError ||
      todaysBriefQuery.isError ||
      latestBriefQuery.data?.success === false ||
      todaysBriefQuery.data?.success === false,
    error:
      latestBriefQuery.data?.error ||
      todaysBriefQuery.data?.error ||
      latestBriefQuery.error?.message ||
      todaysBriefQuery.error?.message,

    // Actions
    generateBrief: generateMutation.mutate,
    generateBriefAsync: generateMutation.mutateAsync,

    // Action states
    isGenerating: generateMutation.isPending,

    // Refresh function for manual refresh
    refresh,
    refetchLatest: latestBriefQuery.refetch,
    refetchTodays: todaysBriefQuery.refetch,
  };
}

/**
 * Hook to get brief history with pagination support.
 *
 * Useful for building a brief history view with load more functionality.
 *
 * @param initialLimit - Initial number of briefs to load (default: 30)
 * @returns Object with history data, loading states, and pagination helpers
 */
export function useBriefHistoryWithPagination(initialLimit: number = 30) {
  const historyQuery = useBriefHistory(initialLimit);

  // Extract history data with empty array fallback
  const briefs: DailyBriefSummary[] = historyQuery.data?.success
    ? historyQuery.data.data || []
    : [];

  return {
    // Brief history data
    briefs,

    // Query states
    isLoading: historyQuery.isLoading,
    isError: historyQuery.isError || historyQuery.data?.success === false,
    error: historyQuery.data?.error || historyQuery.error?.message,

    // Pagination helpers
    hasMore: briefs.length >= initialLimit,

    // Refresh
    refetch: historyQuery.refetch,
  };
}

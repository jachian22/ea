import { queryOptions } from "@tanstack/react-query";
import { getGoogleIntegrationStatusFn } from "~/fn/google-auth";

/**
 * Query options for fetching Google integration status.
 * Used to determine if the user has connected their Google account
 * and whether it needs reauthorization.
 */
export const googleIntegrationStatusQueryOptions = () =>
  queryOptions({
    queryKey: ["google-integration", "status"],
    queryFn: () => getGoogleIntegrationStatusFn(),
    staleTime: 1000 * 60 * 5, // 5 minutes - status doesn't change often
  });

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authClient } from '~/lib/auth-client';
import {
  getPrivacySettingsFn,
  updatePrivacySettingsFn,
  setCloudAIPermissionFn,
  addExcludedDomainFn,
  removeExcludedDomainFn,
  addExcludedPersonFn,
  removeExcludedPersonFn,
  addExcludedEmailDomainFn,
  removeExcludedEmailDomainFn,
  addRedactPatternFn,
  removeRedactPatternFn,
  getRedactionPatternSuggestionsFn,
} from '~/fn/privacy';
import type { PersonDomain } from '~/db/schema';

// ============================================================================
// Query Keys
// ============================================================================

export const privacyKeys = {
  all: ['privacy'] as const,
  settings: () => [...privacyKeys.all, 'settings'] as const,
  suggestions: () => [...privacyKeys.all, 'suggestions'] as const,
};

// ============================================================================
// Get Privacy Settings
// ============================================================================

export function usePrivacySettings(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: privacyKeys.settings(),
    queryFn: () => getPrivacySettingsFn(),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================================================
// Update Privacy Settings
// ============================================================================

export function useUpdatePrivacySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      allowCloudAI?: boolean;
      excludedDomains?: PersonDomain[];
      excludedPersonIds?: string[];
      excludedEmailDomains?: string[];
      redactPatterns?: string[];
    }) => updatePrivacySettingsFn({ data }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Privacy settings updated');
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to update privacy settings', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to update privacy settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Toggle Cloud AI Permission
// ============================================================================

export function useSetCloudAIPermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (allow: boolean) => setCloudAIPermissionFn({ data: { allow } }),
    onSuccess: (result, allow) => {
      if (result.success) {
        toast.success(allow ? 'Cloud AI enabled' : 'Cloud AI disabled');
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to update cloud AI permission', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to update cloud AI permission', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Add Excluded Domain
// ============================================================================

export function useAddExcludedDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domain: PersonDomain) => addExcludedDomainFn({ data: { domain } }),
    onSuccess: (result, domain) => {
      if (result.success) {
        toast.success(`'${domain}' domain excluded from cloud AI`);
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to add excluded domain', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to add excluded domain', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Remove Excluded Domain
// ============================================================================

export function useRemoveExcludedDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domain: PersonDomain) => removeExcludedDomainFn({ data: { domain } }),
    onSuccess: (result, domain) => {
      if (result.success) {
        toast.success(`'${domain}' domain no longer excluded`);
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to remove excluded domain', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to remove excluded domain', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Add Excluded Person
// ============================================================================

export function useAddExcludedPerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personId: string) => addExcludedPersonFn({ data: { personId } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Person excluded from cloud AI');
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to add excluded person', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to add excluded person', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Remove Excluded Person
// ============================================================================

export function useRemoveExcludedPerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personId: string) => removeExcludedPersonFn({ data: { personId } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Person no longer excluded');
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to remove excluded person', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to remove excluded person', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Add Excluded Email Domain
// ============================================================================

export function useAddExcludedEmailDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailDomain: string) => addExcludedEmailDomainFn({ data: { emailDomain } }),
    onSuccess: (result, emailDomain) => {
      if (result.success) {
        toast.success(`'${emailDomain}' excluded from cloud AI`);
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to add excluded email domain', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to add excluded email domain', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Remove Excluded Email Domain
// ============================================================================

export function useRemoveExcludedEmailDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailDomain: string) => removeExcludedEmailDomainFn({ data: { emailDomain } }),
    onSuccess: (result, emailDomain) => {
      if (result.success) {
        toast.success(`'${emailDomain}' no longer excluded`);
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to remove excluded email domain', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to remove excluded email domain', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Add Redact Pattern
// ============================================================================

export function useAddRedactPattern() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pattern: string) => addRedactPatternFn({ data: { pattern } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Redaction pattern added');
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to add redaction pattern', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to add redaction pattern', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Remove Redact Pattern
// ============================================================================

export function useRemoveRedactPattern() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pattern: string) => removeRedactPatternFn({ data: { pattern } }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Redaction pattern removed');
        queryClient.invalidateQueries({ queryKey: privacyKeys.all });
      } else {
        toast.error('Failed to remove redaction pattern', {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to remove redaction pattern', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Get Redaction Pattern Suggestions
// ============================================================================

export function useRedactionPatternSuggestions(enabled?: boolean) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: privacyKeys.suggestions(),
    queryFn: () => getRedactionPatternSuggestionsFn(),
    enabled: (enabled ?? true) && isAuthenticated,
    staleTime: Infinity, // Static data, never stale
  });
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocation = {
  origin: 'http://localhost:3000',
  href: '',
};
vi.stubGlobal('window', { location: mockLocation });

describe('Auth Client', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    mockLocation.href = '';
  });

  describe('signInWithGoogle', () => {
    it('should redirect to Google OAuth endpoint', async () => {
      const { signInWithGoogle } = await import('../../src/lib/auth-client');

      signInWithGoogle();

      expect(mockLocation.href).toBe('http://localhost:3000/api/auth/google');
    });

    it('should include redirect parameter when provided', async () => {
      const { signInWithGoogle } = await import('../../src/lib/auth-client');

      signInWithGoogle('/dashboard/settings');

      expect(mockLocation.href).toBe(
        'http://localhost:3000/api/auth/google?redirect=%2Fdashboard%2Fsettings'
      );
    });

    it('should handle special characters in redirect URL', async () => {
      const { signInWithGoogle } = await import('../../src/lib/auth-client');

      signInWithGoogle('/search?q=test&foo=bar');

      const url = new URL(mockLocation.href);
      expect(url.searchParams.get('redirect')).toBe('/search?q=test&foo=bar');
    });
  });

  describe('signOut', () => {
    it('should call sign-out endpoint with POST', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { signOut } = await import('../../src/lib/auth-client');
      await signOut();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/sign-out', {
        method: 'POST',
        credentials: 'include',
      });
    });

    it('should handle sign-out errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { signOut } = await import('../../src/lib/auth-client');
      await signOut(); // Should not throw

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getSession', () => {
    it('should fetch session from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: '123', name: 'Test' } }),
      });

      const { getSession } = await import('../../src/lib/auth-client');
      const session = await getSession();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/session', {
        credentials: 'include',
      });
      expect(session?.user?.id).toBe('123');
    });

    it('should return cached session on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: '123' } }),
      });

      const { getSession } = await import('../../src/lib/auth-client');

      await getSession();
      await getSession();
      await getSession();

      // Should only fetch once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return null user on API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const { getSession } = await import('../../src/lib/auth-client');
      const session = await getSession();

      expect(session?.user).toBeNull();
    });

    it('should handle network errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { getSession } = await import('../../src/lib/auth-client');
      const session = await getSession();

      expect(session?.user).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('clearSessionCache', () => {
    it('should clear the session cache', async () => {
      // First, populate the cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: '123' } }),
      });

      const { getSession, clearSessionCache } = await import('../../src/lib/auth-client');

      await getSession();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clear cache
      clearSessionCache();

      // Setup new mock for next fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: '456' } }),
      });

      // Next call should fetch again
      const session = await getSession();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(session?.user?.id).toBe('456');
    });
  });

  describe('Fetch deduplication', () => {
    it('should deduplicate concurrent fetch calls', async () => {
      let resolvePromise: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(fetchPromise);

      const { getSession, clearSessionCache } = await import('../../src/lib/auth-client');
      clearSessionCache();

      // Start multiple concurrent fetches
      const promise1 = getSession();
      const promise2 = getSession();
      const promise3 = getSession();

      // Resolve the fetch
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'shared' } }),
      });

      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      // All should get the same result
      expect(result1?.user?.id).toBe('shared');
      expect(result2?.user?.id).toBe('shared');
      expect(result3?.user?.id).toBe('shared');

      // But fetch should only be called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe('authClient compatibility object', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    mockLocation.href = '';
  });

  it('should export useSession function', async () => {
    const { authClient } = await import('../../src/lib/auth-client');
    expect(typeof authClient.useSession).toBe('function');
  });

  it('should export getSession function', async () => {
    const { authClient } = await import('../../src/lib/auth-client');
    expect(typeof authClient.getSession).toBe('function');
  });

  it('should export signOut function', async () => {
    const { authClient } = await import('../../src/lib/auth-client');
    expect(typeof authClient.signOut).toBe('function');
  });

  it('should export signIn.social function', async () => {
    const { authClient } = await import('../../src/lib/auth-client');
    expect(typeof authClient.signIn.social).toBe('function');
  });

  it('signIn.social should call signInWithGoogle for google provider', async () => {
    const { authClient } = await import('../../src/lib/auth-client');

    authClient.signIn.social({ provider: 'google' });

    expect(mockLocation.href).toBe('http://localhost:3000/api/auth/google');
  });

  it('signIn.social should ignore non-google providers', async () => {
    const { authClient } = await import('../../src/lib/auth-client');

    authClient.signIn.social({ provider: 'github' });

    expect(mockLocation.href).toBe('');
  });
});

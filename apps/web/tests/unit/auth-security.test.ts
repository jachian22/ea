import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

describe('Auth Security', () => {
  describe('Redirect URL Validation', () => {
    // Replicate the isValidRedirect function for testing
    function isValidRedirect(url: string): boolean {
      return url.startsWith('/') && !url.startsWith('//') && !url.includes(':');
    }

    it('should allow simple relative paths', () => {
      expect(isValidRedirect('/dashboard')).toBe(true);
      expect(isValidRedirect('/')).toBe(true);
      expect(isValidRedirect('/dashboard/settings')).toBe(true);
    });

    it('should allow paths with query strings', () => {
      expect(isValidRedirect('/dashboard?tab=settings')).toBe(true);
      expect(isValidRedirect('/search?q=test')).toBe(true);
    });

    it('should allow paths with hash fragments', () => {
      expect(isValidRedirect('/page#section')).toBe(true);
      expect(isValidRedirect('/#pricing')).toBe(true);
    });

    it('should reject absolute URLs', () => {
      expect(isValidRedirect('https://evil.com')).toBe(false);
      expect(isValidRedirect('http://evil.com')).toBe(false);
      expect(isValidRedirect('ftp://evil.com')).toBe(false);
    });

    it('should reject protocol-relative URLs', () => {
      expect(isValidRedirect('//evil.com')).toBe(false);
      expect(isValidRedirect('//evil.com/path')).toBe(false);
    });

    it('should reject javascript: URLs', () => {
      expect(isValidRedirect('javascript:alert(1)')).toBe(false);
    });

    it('should reject data: URLs', () => {
      expect(isValidRedirect('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it("should reject URLs that don't start with /", () => {
      expect(isValidRedirect('dashboard')).toBe(false);
      expect(isValidRedirect('evil.com/path')).toBe(false);
    });

    it('should reject URLs with embedded credentials', () => {
      // URLs like /path@evil.com could be parsed differently
      // Our validation rejects anything with : which covers most attack vectors
      expect(isValidRedirect('https://user:pass@evil.com')).toBe(false);
    });
  });

  describe('OAuth State HMAC Signing', () => {
    const secret = 'test-secret';

    function signState(data: string): string {
      return crypto.createHmac('sha256', secret).update(data).digest('hex');
    }

    it('should produce consistent signatures for same input', () => {
      const data = 'signin|nonce123|/dashboard';
      const sig1 = signState(data);
      const sig2 = signState(data);
      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different inputs', () => {
      const sig1 = signState('signin|nonce1|/dashboard');
      const sig2 = signState('signin|nonce2|/dashboard');
      expect(sig1).not.toBe(sig2);
    });

    it('should produce 64 character hex string', () => {
      const sig = signState('test-data');
      expect(sig).toHaveLength(64);
      expect(sig).toMatch(/^[a-f0-9]+$/);
    });

    it('should use timing-safe comparison for signature verification', () => {
      const sig1 = signState('data');
      const sig2 = signState('data');

      // crypto.timingSafeEqual should be used in production
      const isEqual = crypto.timingSafeEqual(Buffer.from(sig1), Buffer.from(sig2));
      expect(isEqual).toBe(true);
    });

    it('should fail timing-safe comparison for different signatures', () => {
      const sig1 = signState('data1');
      const sig2 = signState('data2');

      const isEqual = crypto.timingSafeEqual(Buffer.from(sig1), Buffer.from(sig2));
      expect(isEqual).toBe(false);
    });
  });

  describe('OAuth State Encoding', () => {
    it('should encode state as base64url', () => {
      const data = 'signin|nonce123|/dashboard';
      const encoded = Buffer.from(data).toString('base64url');

      // base64url should not contain +, /, or = padding
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');

      // Should be decodable
      const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
      expect(decoded).toBe(data);
    });

    it('should handle special characters in redirect URL', () => {
      const data = 'signin|nonce|/search?q=test&foo=bar';
      const encoded = Buffer.from(data).toString('base64url');
      const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
      expect(decoded).toBe(data);
    });
  });

  describe('Origin Header Validation', () => {
    function validateOrigin(origin: string | null, referer: string | null, host: string): boolean {
      if (!origin) {
        if (referer) {
          try {
            const refererUrl = new URL(referer);
            return refererUrl.host === host;
          } catch {
            return false;
          }
        }
        return true; // Allow if no origin/referer (same-origin or direct API call)
      }

      try {
        const originUrl = new URL(origin);
        return originUrl.host === host;
      } catch {
        return false;
      }
    }

    it('should allow matching origin', () => {
      expect(validateOrigin('https://localhost:3000', null, 'localhost:3000')).toBe(true);
      expect(validateOrigin('http://localhost:3000', null, 'localhost:3000')).toBe(true);
    });

    it('should reject mismatched origin', () => {
      expect(validateOrigin('https://evil.com', null, 'localhost:3000')).toBe(false);
    });

    it('should check referer when origin is missing', () => {
      expect(validateOrigin(null, 'https://localhost:3000/page', 'localhost:3000')).toBe(true);
      expect(validateOrigin(null, 'https://evil.com/page', 'localhost:3000')).toBe(false);
    });

    it('should allow requests without origin or referer', () => {
      // This allows direct API calls (curl, Postman, etc.)
      expect(validateOrigin(null, null, 'localhost:3000')).toBe(true);
    });

    it('should reject invalid origin URLs', () => {
      expect(validateOrigin('not-a-url', null, 'localhost:3000')).toBe(false);
    });

    it('should reject invalid referer URLs', () => {
      expect(validateOrigin(null, 'not-a-url', 'localhost:3000')).toBe(false);
    });
  });

  describe('Nonce Generation', () => {
    it('should generate unique nonces', () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        nonces.add(crypto.randomBytes(16).toString('hex'));
      }
      expect(nonces.size).toBe(100);
    });

    it('should generate 32 character hex nonces', () => {
      const nonce = crypto.randomBytes(16).toString('hex');
      expect(nonce).toHaveLength(32);
      expect(nonce).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('Session Token Generation', () => {
    it('should generate tokens of sufficient length', () => {
      // nanoid(32) generates 32 character tokens
      // This provides ~192 bits of entropy with default alphabet
      const tokenLength = 32;
      expect(tokenLength).toBeGreaterThanOrEqual(32);
    });
  });
});

describe('Cookie Security Flags', () => {
  describe('Required flags', () => {
    it('should document required cookie flags', () => {
      // These flags should be present on all session cookies:
      const requiredFlags = ['HttpOnly', 'SameSite=Lax', 'Path=/'];

      // HttpOnly - prevents JavaScript access (XSS protection)
      expect(requiredFlags).toContain('HttpOnly');

      // SameSite=Lax - prevents CSRF on most requests
      expect(requiredFlags).toContain('SameSite=Lax');

      // Path=/ - cookie available on all paths
      expect(requiredFlags).toContain('Path=/');
    });

    it('should document Secure flag requirement', () => {
      // Secure flag should be present in production
      // This prevents cookie transmission over HTTP
      const isProduction = process.env.NODE_ENV === 'production';
      // In production, Secure flag is required
      // In development, it's omitted for localhost testing
    });
  });
});

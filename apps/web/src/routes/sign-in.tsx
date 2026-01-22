import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { signInWithGoogle } from '~/lib/auth-client';
import { Button } from '~/components/ui/button';
import { LogIn, Shield, Calendar, Mail } from 'lucide-react';

type SignInSearchParams = {
  redirect?: string;
  error?: string;
};

export const Route = createFileRoute('/sign-in')({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): SignInSearchParams => {
    return {
      redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
      error: typeof search.error === 'string' ? search.error : undefined,
    };
  },
});

function RouteComponent() {
  const { redirect, error } = Route.useSearch();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    signInWithGoogle(redirect || '/dashboard');
  };

  return (
    <div className="container mx-auto relative min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left side - branding */}
      <aside
        className="relative hidden h-full flex-col bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-12 text-slate-800 dark:text-white lg:flex border-r border-border overflow-hidden"
        aria-label="Executive Assistant branding"
        role="complementary"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/8 via-indigo-600/6 to-purple-600/4 dark:from-blue-600/6 dark:to-indigo-600/4" />
        <div className="absolute top-32 right-32 h-48 w-48 rounded-full bg-gradient-to-br from-blue-400/15 to-indigo-400/10 dark:from-blue-400/12 dark:to-indigo-400/8 blur-2xl animate-pulse" />
        <div className="absolute bottom-32 left-32 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-400/10 to-blue-400/8 dark:from-indigo-400/8 dark:to-blue-400/6 blur-xl" />

        <header className="relative z-20 flex items-center text-xl font-semibold">
          <div
            className="mr-4 rounded-xl bg-gradient-to-br from-blue-500/25 to-indigo-500/20 p-3 backdrop-blur-sm border border-blue-200/30 dark:border-white/20 shadow-lg"
            aria-hidden="true"
          >
            <LogIn className="h-6 w-6 text-blue-600 dark:text-blue-200" />
          </div>
          <h1 className="bg-gradient-to-r from-slate-800 via-blue-700 to-indigo-700 dark:from-white dark:via-blue-50 dark:to-indigo-50 bg-clip-text text-transparent font-bold">
            Executive Assistant
          </h1>
        </header>

        <main className="relative z-20 flex-1 flex flex-col justify-center">
          <div className="space-y-8 text-center">
            <h2 className="text-4xl font-bold leading-tight bg-gradient-to-r from-slate-800 via-blue-700 to-indigo-700 dark:from-white dark:via-blue-50 dark:to-indigo-50 bg-clip-text text-transparent">
              Your AI-Powered Daily Brief
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-lg opacity-75 max-w-md mx-auto">
              Get intelligent summaries of your emails and calendar, delivered fresh every morning.
            </p>

            <div className="flex justify-center space-x-8 pt-8" role="region" aria-label="Features">
              <div className="text-center">
                <div className="mx-auto mb-2 rounded-lg bg-blue-500/10 p-3 w-fit">
                  <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Gmail
                </div>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-2 rounded-lg bg-indigo-500/10 p-3 w-fit">
                  <Calendar className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Calendar
                </div>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-2 rounded-lg bg-purple-500/10 p-3 w-fit">
                  <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Secure
                </div>
              </div>
            </div>
          </div>
        </main>

        <footer className="relative z-20 mt-auto opacity-60">
          <div className="text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sign in with your Google account to get started
            </p>
          </div>
        </footer>
      </aside>

      {/* Right side - sign in */}
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight animate-fadeInUp">Welcome</h1>
            <p className="text-sm text-muted-foreground animate-fadeInUp animation-delay-100">
              Sign in with your Google account to continue
            </p>
          </div>

          <div className="grid gap-6">
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button
              variant="outline"
              type="button"
              disabled={isLoading}
              onClick={handleGoogleSignIn}
              className="w-full h-12 text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] border-muted-foreground/20 hover:border-muted-foreground/40"
            >
              {isLoading ? (
                <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              {isLoading ? 'Signing in...' : 'Continue with Google'}
            </Button>

            <p className="text-xs text-center text-muted-foreground px-4">
              By signing in, you agree to grant read-only access to your Gmail and Calendar for
              generating your daily briefs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

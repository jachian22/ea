import { useState } from 'react';
import { Loader2, Mail, Calendar, AlertTriangle, Check, Link2Off, RefreshCw } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { useGoogleIntegration } from '~/hooks/use-google-integration';

/**
 * Google Integration Card Component
 *
 * Displays the current status of the user's Google integration and provides
 * connect/disconnect functionality. Shows:
 * - Connection status (connected/disconnected)
 * - Connected Google email address
 * - Last sync timestamp
 * - Re-authorization warnings when needed
 * - Connect/Disconnect action buttons with confirmation dialogs
 */
export function GoogleIntegrationCard() {
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const {
    status,
    isConnected,
    googleEmail,
    needsReauthorization,
    connectedAt,
    lastSyncedAt,
    isLoading,
    isError,
    error,
    connect,
    disconnect,
    isConnecting,
    isDisconnecting,
    refetch,
  } = useGoogleIntegration();

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(new Date(date));
  };

  const handleConnect = () => {
    // Server function doesn't require data, but TanStack mutation expects an argument
    connect({ data: undefined });
  };

  const handleDisconnect = () => {
    // Server function doesn't require data, but TanStack mutation expects an argument
    disconnect({ data: undefined });
    setShowDisconnectDialog(false);
  };

  // Loading state skeleton
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-6 w-48 bg-muted rounded animate-pulse" />
              <div className="h-4 w-72 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-6 w-24 bg-muted rounded-full animate-pulse" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-10 w-32 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Google Integration
              </CardTitle>
              <CardDescription>
                Connect your Google account to access Gmail and Calendar features
              </CardDescription>
            </div>
            <Badge variant="destructive">Error</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  Failed to load integration status
                </p>
                <p className="text-sm text-destructive/80">{error || 'Please try again later.'}</p>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={() => refetch()} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="flex -space-x-1">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                Google Integration
              </CardTitle>
              <CardDescription>
                Connect your Google account to enable Gmail and Calendar features for your daily
                brief
              </CardDescription>
            </div>
            {isConnected && !needsReauthorization && (
              <Badge variant="default" className="bg-green-600 hover:bg-green-600/80">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            {isConnected && needsReauthorization && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Needs Reauthorization
              </Badge>
            )}
            {!isConnected && <Badge variant="secondary">Disconnected</Badge>}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Connected state */}
          {isConnected && !needsReauthorization && (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Connected Email</p>
                    <p className="text-sm text-muted-foreground">{googleEmail}</p>
                  </div>
                </div>

                {connectedAt && (
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Connected Since</p>
                      <p className="text-sm text-muted-foreground">{formatDate(connectedAt)}</p>
                    </div>
                  </div>
                )}

                {lastSyncedAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Last Synced</p>
                      <p className="text-sm text-muted-foreground">{formatDate(lastSyncedAt)}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">
                  Your Google account is connected. The daily brief will include your calendar
                  events and important emails.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="destructive"
                  onClick={() => setShowDisconnectDialog(true)}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Disconnecting...
                    </>
                  ) : (
                    <>
                      <Link2Off className="h-4 w-4" />
                      Disconnect
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Needs reauthorization state */}
          {isConnected && needsReauthorization && (
            <>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Reauthorization Required</p>
                    <p className="text-sm text-destructive/80">
                      Your Google authorization has expired or was revoked. Please reconnect your
                      account to continue using Gmail and Calendar features.
                    </p>
                  </div>
                </div>
              </div>

              {googleEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Previously Connected</p>
                    <p className="text-sm text-muted-foreground">{googleEmail}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="destructive"
                  onClick={() => setShowDisconnectDialog(true)}
                  disabled={isConnecting || isDisconnecting}
                >
                  <Link2Off className="h-4 w-4" />
                  Disconnect
                </Button>
                <Button onClick={handleConnect} disabled={isConnecting}>
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Reconnect Google'
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Disconnected state */}
          {!isConnected && (
            <>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">
                  Connect your Google account to unlock your personalized daily brief. We'll
                  securely access your Gmail and Calendar to summarize your day's priorities.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">What you'll get:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-600" />
                    Today's calendar events with meeting details
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-600" />
                    Important emails from the past 24 hours
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-600" />
                    Personalized morning brief delivered daily
                  </li>
                </ul>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleConnect} disabled={isConnecting}>
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      Connect Google Account
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Disconnect confirmation dialog */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your Google integration and stop your daily brief from including
              Gmail and Calendar data. You can reconnect at any time.
              {googleEmail && (
                <span className="block mt-2 font-medium text-foreground">
                  Connected account: {googleEmail}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

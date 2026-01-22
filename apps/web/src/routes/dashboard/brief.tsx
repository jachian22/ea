import { createFileRoute, Link } from "@tanstack/react-router";
import { Page } from "~/components/Page";
import { AppBreadcrumb } from "~/components/AppBreadcrumb";
import { DailyBriefCard } from "~/components/DailyBriefCard";
import { assertAuthenticatedFn } from "~/fn/guards";
import { useBriefHistory, type DailyBriefSummary } from "~/hooks/use-daily-brief";
import { useGoogleIntegration } from "~/hooks/use-google-integration";
import { Home, Sun, Calendar, Mail, Clock, Settings, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export const Route = createFileRoute("/dashboard/brief")({
  component: BriefPage,
  beforeLoad: async () => {
    await assertAuthenticatedFn();
  },
});

/**
 * Brief History Section
 *
 * Shows recent brief history with quick navigation to past briefs.
 */
function BriefHistorySection() {
  const historyQuery = useBriefHistory(7);

  const briefs: DailyBriefSummary[] = historyQuery.data?.success
    ? historyQuery.data.data || []
    : [];

  const formatBriefDate = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const briefDate = new Date(dateString + "T00:00:00");
    briefDate.setHours(0, 0, 0, 0);

    if (briefDate.getTime() === today.getTime()) {
      return "Today";
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (briefDate.getTime() === yesterday.getTime()) {
      return "Yesterday";
    }

    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(briefDate);
  };

  const getStatusBadge = (status: DailyBriefSummary["status"]) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-600/80 text-xs">
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-xs">
            Failed
          </Badge>
        );
      case "generating":
      case "pending":
        return (
          <Badge variant="secondary" className="text-xs">
            In Progress
          </Badge>
        );
      default:
        return null;
    }
  };

  if (historyQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Briefs</CardTitle>
          <CardDescription>Your brief history from the past week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-muted rounded-lg animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (briefs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Briefs</CardTitle>
          <CardDescription>Your brief history from the past week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No brief history yet</p>
            <p className="text-xs mt-1">
              Generate your first brief to start tracking your daily summaries
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Briefs</CardTitle>
        <CardDescription>Your brief history from the past week</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {briefs.map((brief) => (
            <div
              key={brief.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-900/10 flex items-center justify-center">
                  <Sun className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    {formatBriefDate(brief.briefDate)}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {brief.totalEvents || "0"} events
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {brief.totalEmails || "0"} emails
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(brief.status)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Quick Actions Section
 *
 * Provides quick links to related settings and actions.
 */
function QuickActionsSection() {
  const { isConnected, needsReauthorization } = useGoogleIntegration();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
        <CardDescription>Manage your daily brief settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Link to="/dashboard/settings">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Settings className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">Google Integration</p>
                <p className="text-xs text-muted-foreground">
                  {isConnected
                    ? needsReauthorization
                      ? "Needs reconnection"
                      : "Connected and syncing"
                    : "Connect your Google account"}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {!isConnected && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Connect your Google account to enable daily briefs with your
              calendar events and emails.
            </p>
            <Link to="/dashboard/settings">
              <Button variant="outline" size="sm" className="mt-2">
                Go to Settings
              </Button>
            </Link>
          </div>
        )}

        {needsReauthorization && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm text-destructive">
              Your Google authorization has expired. Please reconnect your
              account to continue receiving daily briefs.
            </p>
            <Link to="/dashboard/settings">
              <Button variant="outline" size="sm" className="mt-2">
                Reconnect Account
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Daily Brief Page
 *
 * Main page for viewing and managing daily briefs.
 * Shows the current brief and recent history.
 */
function BriefPage() {
  return (
    <Page>
      <AppBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard", icon: Home },
          { label: "Daily Brief", icon: Sun },
        ]}
      />

      <div className="mt-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Sun className="h-8 w-8 text-amber-500" />
            Daily Brief
          </h1>
          <p className="text-muted-foreground mt-2">
            Your personalized morning summary of today's schedule and important
            emails
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Brief Card - Takes 2 columns on large screens */}
          <div className="lg:col-span-2">
            <DailyBriefCard />
          </div>

          {/* Sidebar - History and Quick Actions */}
          <div className="space-y-6">
            <QuickActionsSection />
            <BriefHistorySection />
          </div>
        </div>
      </div>
    </Page>
  );
}

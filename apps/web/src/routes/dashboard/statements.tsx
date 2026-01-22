import { createFileRoute, Link } from "@tanstack/react-router";
import { Page } from "~/components/Page";
import { AppBreadcrumb } from "~/components/AppBreadcrumb";
import { assertAuthenticatedFn } from "~/fn/guards";
import {
  useStatementsDashboard,
  type StatementRunData,
  type StatementData,
  type BankAccountData,
} from "~/hooks/use-statements";
import {
  Home,
  FileText,
  RefreshCw,
  Check,
  X,
  Clock,
  Key,
  Building2,
  CreditCard,
  Wallet,
  FolderOpen,
  AlertCircle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import type { StatementRunStatus } from "~/db/schema";

export const Route = createFileRoute("/dashboard/statements")({
  component: StatementsPage,
  beforeLoad: async () => {
    await assertAuthenticatedFn();
  },
});

/**
 * Get icon for account type
 */
function getAccountIcon(accountType: string) {
  switch (accountType.toLowerCase()) {
    case "credit":
      return CreditCard;
    case "checking":
      return Wallet;
    case "savings":
      return Building2;
    default:
      return Wallet;
  }
}

/**
 * Format relative time for recent timestamps
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

/**
 * Status Badge Component
 */
function StatusBadge({ status }: { status: StatementRunStatus }) {
  switch (status) {
    case "running":
      return (
        <Badge
          variant="secondary"
          className="bg-blue-500/10 text-blue-600 border-blue-500/20"
        >
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    case "completed":
      return (
        <Badge
          variant="secondary"
          className="bg-green-500/10 text-green-600 border-green-500/20"
        >
          <Check className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="secondary"
          className="bg-red-500/10 text-red-600 border-red-500/20"
        >
          <X className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case "mfa_required":
      return (
        <Badge
          variant="secondary"
          className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
        >
          <Key className="h-3 w-3 mr-1" />
          MFA Required
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          Unknown
        </Badge>
      );
  }
}

/**
 * Stats Overview Section
 */
function StatsOverview() {
  const { stats, isLoading } = useStatementsDashboard();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-12 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const statCards = [
    {
      label: "Total Runs",
      value: stats.totalRuns,
      icon: RefreshCw,
      color: "text-blue-500",
    },
    {
      label: "Successful",
      value: stats.successfulRuns,
      icon: Check,
      color: "text-green-500",
    },
    {
      label: "Failed",
      value: stats.failedRuns,
      icon: X,
      color: "text-red-500",
    },
    {
      label: "Statements",
      value: stats.totalStatementsDownloaded,
      icon: FileText,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
              <stat.icon className={`h-8 w-8 ${stat.color} opacity-50`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Latest Run Card
 */
function LatestRunCard() {
  const { latestRun, isLoading, formatBankName } = useStatementsDashboard();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Latest Run</CardTitle>
          <CardDescription>Most recent automation run</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!latestRun) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Latest Run</CardTitle>
          <CardDescription>Most recent automation run</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No runs yet</p>
            <p className="text-xs mt-1">
              Run the bank-statements CLI to start downloading statements
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const banksProcessed = latestRun.banksProcessed || {};
  const bankNames = Object.keys(banksProcessed);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Latest Run</CardTitle>
            <CardDescription>
              {formatRelativeTime(latestRun.startedAt)}
            </CardDescription>
          </div>
          <StatusBadge status={latestRun.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Stats Row */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>
                {latestRun.statementsDownloaded ?? 0} statements downloaded
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{bankNames.length} banks processed</span>
            </div>
          </div>

          {/* Banks Processed */}
          {bankNames.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Banks Processed
              </p>
              <div className="flex flex-wrap gap-2">
                {bankNames.map((bank) => {
                  const bankResult = banksProcessed[bank];
                  const isSuccess = bankResult?.status === "success";
                  return (
                    <Badge
                      key={bank}
                      variant="outline"
                      className={
                        isSuccess
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-red-500/30 bg-red-500/5"
                      }
                    >
                      {isSuccess ? (
                        <Check className="h-3 w-3 mr-1 text-green-500" />
                      ) : (
                        <X className="h-3 w-3 mr-1 text-red-500" />
                      )}
                      {formatBankName(bank)}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error Message */}
          {latestRun.errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">
                  {latestRun.errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Run History Section
 */
function RunHistorySection() {
  const { runs, isLoading, formatBankName } = useStatementsDashboard();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run History</CardTitle>
          <CardDescription>Previous automation runs</CardDescription>
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

  if (runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run History</CardTitle>
          <CardDescription>Previous automation runs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No run history yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Run History</CardTitle>
        <CardDescription>Previous automation runs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {runs.map((run) => {
            const banksProcessed = run.banksProcessed || {};
            const bankCount = Object.keys(banksProcessed).length;

            return (
              <div
                key={run.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <RefreshCw className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {formatRelativeTime(run.startedAt)}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {run.statementsDownloaded ?? 0} statements
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {bankCount} banks
                      </span>
                    </div>
                  </div>
                </div>
                <StatusBadge status={run.status} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Recent Statements Section
 */
function RecentStatementsSection() {
  const { statements, isLoading, formatBankName } = useStatementsDashboard();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Statements</CardTitle>
          <CardDescription>Recently downloaded statements</CardDescription>
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

  if (statements.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Statements</CardTitle>
          <CardDescription>Recently downloaded statements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No statements downloaded yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Statements</CardTitle>
        <CardDescription>Recently downloaded statements</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {statements.slice(0, 10).map((stmt) => {
            const AccountIcon = getAccountIcon(stmt.account.accountType);
            return (
              <div
                key={stmt.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-900/10 flex items-center justify-center">
                    <AccountIcon className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {formatBankName(stmt.account.bank)} -{" "}
                      {stmt.account.accountType} ****{stmt.account.last4}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stmt.statementDate}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatRelativeTime(stmt.downloadedAt)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Bank Accounts Section
 */
function BankAccountsSection() {
  const { accounts, isLoading, formatBankName } = useStatementsDashboard();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bank Accounts</CardTitle>
          <CardDescription>Configured accounts for automation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-14 bg-muted rounded-lg animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bank Accounts</CardTitle>
          <CardDescription>Configured accounts for automation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No accounts configured yet</p>
            <p className="text-xs mt-1">
              Accounts will appear here after running the CLI
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Bank Accounts</CardTitle>
        <CardDescription>Configured accounts for automation</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {accounts.map((account) => {
            const AccountIcon = getAccountIcon(account.accountType);
            return (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <AccountIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {formatBankName(account.bank)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.accountType} ****{account.last4}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    account.isEnabled
                      ? "border-green-500/30 bg-green-500/5 text-green-600"
                      : "border-gray-500/30 bg-gray-500/5 text-gray-600"
                  }
                >
                  {account.isEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Quick Actions Section
 */
function QuickActionsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
        <CardDescription>Manage your statement automation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Link to="/dashboard/settings">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">Discord Settings</p>
                <p className="text-xs text-muted-foreground">
                  Configure notification webhook
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            Run <code className="bg-blue-500/20 px-1 rounded">bank-statements</code> in your terminal to download statements automatically.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Statements Dashboard Page
 */
function StatementsPage() {
  const { refresh, isLoading } = useStatementsDashboard();

  return (
    <Page>
      <AppBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard", icon: Home },
          { label: "Bank Statements", icon: FileText },
        ]}
      />

      <div className="mt-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              Bank Statements
            </h1>
            <p className="text-muted-foreground mt-2">
              Track your automated bank statement downloads
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="mb-6">
          <StatsOverview />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Latest Run and History */}
          <div className="lg:col-span-2 space-y-6">
            <LatestRunCard />
            <RecentStatementsSection />
          </div>

          {/* Right Column - Quick Actions and Accounts */}
          <div className="space-y-6">
            <QuickActionsSection />
            <BankAccountsSection />
            <RunHistorySection />
          </div>
        </div>
      </div>
    </Page>
  );
}

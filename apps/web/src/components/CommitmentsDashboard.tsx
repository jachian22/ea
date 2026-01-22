import { format, formatDistanceToNow, isAfter, isBefore, addDays } from 'date-fns';
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  User,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { ScrollArea } from '~/components/ui/scroll-area';
import { useCommitmentsDashboard } from '~/hooks/use-knowledge';
import type { Commitment, CommitmentPriority } from '~/db/schema';

const PRIORITY_COLORS: Record<CommitmentPriority, string> = {
  high: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300',
  medium:
    'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300',
};

interface CommitmentWithPerson extends Commitment {
  person?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

export function CommitmentsDashboard() {
  const { data: dashboardResponse, isLoading } = useCommitmentsDashboard();
  const dashboard = dashboardResponse?.success ? dashboardResponse.data : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckCircle className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground">No commitments data available</p>
        </CardContent>
      </Card>
    );
  }

  const overdueByMe = dashboard.overduePromisesByMe || [];
  const overdueToMe = dashboard.overduePromisesToMe || [];
  const upcomingByMe = dashboard.upcomingPromisesByMe || [];
  const upcomingToMe = dashboard.upcomingPromisesToMe || [];

  const totalOverdue = overdueByMe.length + overdueToMe.length;
  const totalUpcoming = upcomingByMe.length + upcomingToMe.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Commitments</h2>
          <p className="text-muted-foreground">Track promises made and received</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          title="Overdue - You Owe"
          count={overdueByMe.length}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant="danger"
        />
        <SummaryCard
          title="Overdue - They Owe"
          count={overdueToMe.length}
          icon={<Clock className="h-4 w-4" />}
          variant="warning"
        />
        <SummaryCard
          title="Upcoming - You Owe"
          count={upcomingByMe.length}
          icon={<ArrowUpRight className="h-4 w-4" />}
          variant="default"
        />
        <SummaryCard
          title="Upcoming - They Owe"
          count={upcomingToMe.length}
          icon={<ArrowDownLeft className="h-4 w-4" />}
          variant="default"
        />
      </div>

      {/* Main Content */}
      <Tabs defaultValue="you-owe" className="space-y-4">
        <TabsList>
          <TabsTrigger value="you-owe" className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" />
            You Owe
            {overdueByMe.length + upcomingByMe.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5">
                {overdueByMe.length + upcomingByMe.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="they-owe" className="flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4" />
            They Owe You
            {overdueToMe.length + upcomingToMe.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5">
                {overdueToMe.length + upcomingToMe.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="you-owe" className="space-y-4">
          {overdueByMe.length > 0 && (
            <CommitmentSection title="Overdue" commitments={overdueByMe} variant="danger" />
          )}
          {upcomingByMe.length > 0 && (
            <CommitmentSection title="Upcoming" commitments={upcomingByMe} variant="default" />
          )}
          {overdueByMe.length === 0 && upcomingByMe.length === 0 && (
            <EmptyState message="No pending commitments you owe" />
          )}
        </TabsContent>

        <TabsContent value="they-owe" className="space-y-4">
          {overdueToMe.length > 0 && (
            <CommitmentSection title="Overdue" commitments={overdueToMe} variant="warning" />
          )}
          {upcomingToMe.length > 0 && (
            <CommitmentSection title="Upcoming" commitments={upcomingToMe} variant="default" />
          )}
          {overdueToMe.length === 0 && upcomingToMe.length === 0 && (
            <EmptyState message="No pending commitments owed to you" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  title,
  count,
  icon,
  variant,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  variant: 'default' | 'danger' | 'warning';
}) {
  const bgColor =
    variant === 'danger'
      ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
      : variant === 'warning'
        ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
        : '';

  const textColor =
    variant === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : variant === 'warning'
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-foreground';

  return (
    <Card className={bgColor}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className={textColor}>{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${textColor}`}>{count}</div>
      </CardContent>
    </Card>
  );
}

function CommitmentSection({
  title,
  commitments,
  variant,
}: {
  title: string;
  commitments: CommitmentWithPerson[];
  variant: 'default' | 'danger' | 'warning';
}) {
  const titleColor =
    variant === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : variant === 'warning'
        ? 'text-yellow-600 dark:text-yellow-400'
        : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className={`text-base ${titleColor}`}>
          {title} ({commitments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {commitments.map((commitment) => (
          <CommitmentItem key={commitment.id} commitment={commitment} />
        ))}
      </CardContent>
    </Card>
  );
}

function CommitmentItem({ commitment }: { commitment: CommitmentWithPerson }) {
  const isOverdue =
    commitment.dueDate &&
    isBefore(new Date(commitment.dueDate), new Date()) &&
    commitment.status === 'pending';

  const isDueSoon =
    commitment.dueDate &&
    isAfter(new Date(commitment.dueDate), new Date()) &&
    isBefore(new Date(commitment.dueDate), addDays(new Date(), 3));

  return (
    <div
      className={`rounded-md border p-4 ${
        isOverdue
          ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10'
          : isDueSoon
            ? 'border-yellow-300 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-900/10'
            : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">{commitment.description}</p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {/* Person */}
            {commitment.person && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {commitment.person.name || commitment.person.email}
              </div>
            )}

            {/* Due Date */}
            {commitment.dueDate && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {isOverdue ? (
                  <span className="text-red-600 dark:text-red-400">
                    {formatDistanceToNow(new Date(commitment.dueDate), { addSuffix: true })}
                  </span>
                ) : (
                  <span>Due {format(new Date(commitment.dueDate), 'MMM d, yyyy')}</span>
                )}
              </div>
            )}

            {/* Source */}
            {commitment.sourceType && (
              <Badge variant="outline" className="text-xs">
                {commitment.sourceType}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Priority */}
          {commitment.priority && commitment.priority !== 'medium' && (
            <Badge className={PRIORITY_COLORS[commitment.priority as CommitmentPriority]}>
              {commitment.priority}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
        <p className="text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

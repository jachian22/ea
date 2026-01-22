import { useState } from 'react';
import {
  Check,
  Clock,
  AlertTriangle,
  ChevronRight,
  User,
  Calendar,
  MoreHorizontal,
  Trash2,
  Edit2,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import type { Commitment, Person } from '~/db/schema';

export type CommitmentWithPerson = Commitment & {
  person: Pick<Person, 'id' | 'name' | 'email' | 'company' | 'domain'> | null;
};

interface CommitmentCardProps {
  commitment: CommitmentWithPerson;
  onStatusChange?: (
    id: string,
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  ) => void;
  onEdit?: (commitment: CommitmentWithPerson) => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
}

/**
 * Commitment Card Component
 *
 * Displays a single commitment with:
 * - Description and person info
 * - Due date and overdue status
 * - Status badge and quick actions
 */
export function CommitmentCard({
  commitment,
  onStatusChange,
  onEdit,
  onDelete,
  compact = false,
}: CommitmentCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const isOverdue =
    commitment.dueDate &&
    commitment.dueDate < new Date() &&
    commitment.status !== 'completed' &&
    commitment.status !== 'cancelled';

  const daysUntilDue = commitment.dueDate
    ? Math.ceil((commitment.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const formatDueDate = (date: Date | null) => {
    if (!date) return null;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = () => {
    switch (commitment.status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'in_progress':
        return (
          <Badge variant="default" className="bg-blue-600 hover:bg-blue-600/80">
            In Progress
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-600/80">
            <Check className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return null;
    }
  };

  const getPriorityBadge = () => {
    switch (commitment.priority) {
      case 'high':
        return <Badge variant="destructive">High Priority</Badge>;
      case 'medium':
        return null; // Don't show for medium
      case 'low':
        return <Badge variant="outline">Low Priority</Badge>;
      default:
        return null;
    }
  };

  const getDirectionLabel = () => {
    return commitment.direction === 'user_owes' ? 'You owe' : 'They owe you';
  };

  const handleStatusChange = async (
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  ) => {
    if (!onStatusChange) return;
    setIsUpdating(true);
    try {
      await onStatusChange(commitment.id, status);
    } finally {
      setIsUpdating(false);
    }
  };

  const personDisplay = commitment.person
    ? commitment.person.name || commitment.person.email
    : null;

  if (compact) {
    return (
      <div
        className={`flex items-center justify-between p-3 rounded-lg border ${
          isOverdue ? 'border-destructive/50 bg-destructive/5' : 'border-border/50 bg-muted/30'
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {commitment.direction === 'user_owes' ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground rotate-180" />
            )}
            <p className="font-medium text-sm truncate">{commitment.description}</p>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            {personDisplay && (
              <>
                <User className="h-3 w-3" />
                <span>{personDisplay}</span>
              </>
            )}
            {commitment.dueDate && (
              <>
                <span>•</span>
                <Calendar className="h-3 w-3" />
                <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                  {isOverdue
                    ? `${Math.abs(daysUntilDue!)} days overdue`
                    : daysUntilDue === 0
                      ? 'Due today'
                      : daysUntilDue === 1
                        ? 'Due tomorrow'
                        : `Due ${formatDueDate(commitment.dueDate)}`}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOverdue && <AlertTriangle className="h-4 w-4 text-destructive" />}
          {getStatusBadge()}
        </div>
      </div>
    );
  }

  return (
    <Card className={isOverdue ? 'border-destructive/50' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{commitment.description}</CardTitle>
            {personDisplay && (
              <CardDescription className="flex items-center gap-1 mt-1">
                <User className="h-3 w-3" />
                {getDirectionLabel()}: {personDisplay}
                {commitment.person?.company && (
                  <span className="text-muted-foreground"> at {commitment.person.company}</span>
                )}
              </CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {commitment.status !== 'completed' && (
                <DropdownMenuItem
                  onClick={() => handleStatusChange('completed')}
                  disabled={isUpdating}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Mark Complete
                </DropdownMenuItem>
              )}
              {commitment.status === 'pending' && (
                <DropdownMenuItem
                  onClick={() => handleStatusChange('in_progress')}
                  disabled={isUpdating}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Start Working
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(commitment)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(commitment.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {getStatusBadge()}
            {getPriorityBadge()}
            {isOverdue && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {Math.abs(daysUntilDue!)} days overdue
              </Badge>
            )}
          </div>
          {commitment.dueDate && !isOverdue && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {daysUntilDue === 0
                ? 'Due today'
                : daysUntilDue === 1
                  ? 'Due tomorrow'
                  : `Due ${formatDueDate(commitment.dueDate)}`}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Commitment List Component
 *
 * Displays a list of commitments grouped by direction
 */
interface CommitmentListProps {
  commitments: CommitmentWithPerson[];
  onStatusChange?: (
    id: string,
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  ) => void;
  onEdit?: (commitment: CommitmentWithPerson) => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
  showEmpty?: boolean;
  emptyMessage?: string;
}

export function CommitmentList({
  commitments,
  onStatusChange,
  onEdit,
  onDelete,
  compact = false,
  showEmpty = true,
  emptyMessage = 'No commitments found',
}: CommitmentListProps) {
  if (commitments.length === 0 && showEmpty) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {commitments.map((commitment) => (
        <CommitmentCard
          key={commitment.id}
          commitment={commitment}
          onStatusChange={onStatusChange}
          onEdit={onEdit}
          onDelete={onDelete}
          compact={compact}
        />
      ))}
    </div>
  );
}

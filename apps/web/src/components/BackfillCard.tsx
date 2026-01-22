import { useState } from "react";
import { format, subMonths } from "date-fns";
import {
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Calendar,
  Mail,
  Users,
  MessageSquare,
  CheckCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import { Switch } from "~/components/ui/switch";
import { Slider } from "~/components/ui/slider";
import {
  useActiveBackfillJob,
  useStartBackfill,
  usePauseBackfill,
  useResumeBackfill,
  useDeleteBackfill,
} from "~/hooks/use-backfill";
import type { BackfillSourceType, BackfillJob } from "~/db/schema";

interface BackfillCardProps {
  onComplete?: () => void;
}

export function BackfillCard({ onComplete }: BackfillCardProps) {
  const [sourceType, setSourceType] = useState<BackfillSourceType>("all");
  const [dateRange, setDateRange] = useState("3"); // months
  const [saveCommitments, setSaveCommitments] = useState(true);
  const [minConfidence, setMinConfidence] = useState([0.7]);

  const { data: activeJob, isLoading: isLoadingJob } = useActiveBackfillJob();
  const startBackfill = useStartBackfill();
  const pauseBackfill = usePauseBackfill();
  const resumeBackfill = useResumeBackfill();
  const deleteBackfill = useDeleteBackfill();

  const job = activeJob?.success ? activeJob.data : null;

  const handleStart = () => {
    const months = parseInt(dateRange);
    const endDate = new Date();
    const startDate = subMonths(endDate, months);

    startBackfill.mutate({
      sourceType,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      saveCommitments,
      minCommitmentConfidence: minConfidence[0],
    });
  };

  const handlePause = () => {
    if (job?.id) {
      pauseBackfill.mutate(job.id);
    }
  };

  const handleResume = () => {
    if (job?.id) {
      resumeBackfill.mutate(job.id);
    }
  };

  const handleDelete = () => {
    if (job?.id) {
      deleteBackfill.mutate(job.id, {
        onSuccess: () => onComplete?.(),
      });
    }
  };

  if (isLoadingJob) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Show active job status
  if (job) {
    return <BackfillJobStatus job={job} onPause={handlePause} onResume={handleResume} onDelete={handleDelete} />;
  }

  // Show configuration form
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Knowledge Graph Backfill
        </CardTitle>
        <CardDescription>
          Process historical emails and calendar events to build your knowledge graph
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Source Type */}
        <div className="space-y-2">
          <Label>Data Source</Label>
          <Select value={sourceType} onValueChange={(v) => setSourceType(v as BackfillSourceType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  All Sources
                </div>
              </SelectItem>
              <SelectItem value="gmail">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Gmail Only
                </div>
              </SelectItem>
              <SelectItem value="calendar">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Calendar Only
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="space-y-2">
          <Label>Date Range</Label>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 1 month</SelectItem>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
              <SelectItem value="24">Last 2 years</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Commitment Detection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Detect Commitments</Label>
              <p className="text-sm text-muted-foreground">
                Extract promises and action items from emails
              </p>
            </div>
            <Switch checked={saveCommitments} onCheckedChange={setSaveCommitments} />
          </div>

          {saveCommitments && (
            <div className="space-y-2 pl-4 border-l-2 border-muted">
              <Label className="text-sm">
                Minimum Confidence: {Math.round(minConfidence[0] * 100)}%
              </Label>
              <Slider
                value={minConfidence}
                onValueChange={setMinConfidence}
                min={0.5}
                max={1}
                step={0.05}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Higher values = fewer but more accurate commitments
              </p>
            </div>
          )}
        </div>

        {/* Start Button */}
        <Button
          onClick={handleStart}
          disabled={startBackfill.isPending}
          className="w-full"
        >
          {startBackfill.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Start Backfill
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

interface BackfillJobStatusProps {
  job: BackfillJob;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}

function BackfillJobStatus({ job, onPause, onResume, onDelete }: BackfillJobStatusProps) {
  const progress = job.progress || { processed: 0, total: 0 };
  const progressPercent = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;

  const getStatusIcon = () => {
    switch (job.status) {
      case "running":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case "paused":
        return <Pause className="h-5 w-5 text-yellow-500" />;
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <RefreshCw className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (job.status) {
      case "running":
        return "Processing...";
      case "paused":
        return "Paused";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      default:
        return "Pending";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon()}
            Backfill {getStatusText()}
          </CardTitle>
          <div className="flex items-center gap-2">
            {job.status === "running" && (
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="h-4 w-4" />
              </Button>
            )}
            {job.status === "paused" && (
              <Button variant="outline" size="sm" onClick={onResume}>
                <Play className="h-4 w-4" />
              </Button>
            )}
            {(job.status === "completed" || job.status === "failed") && (
              <Button variant="outline" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          {job.sourceType === "all"
            ? "Gmail & Calendar"
            : job.sourceType === "gmail"
            ? "Gmail"
            : "Calendar"}{" "}
          • {format(new Date(job.startDate), "MMM d, yyyy")} -{" "}
          {format(new Date(job.endDate), "MMM d, yyyy")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>
              {progress.processed} / {progress.total || "?"}
            </span>
          </div>
          <Progress value={progressPercent} />
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {job.personsCreated || 0}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">People</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {job.interactionsCreated || 0}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Interactions</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {job.commitmentsDetected || 0}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Commitments</p>
          </div>
        </div>

        {/* Error Message */}
        {job.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {job.error}
          </div>
        )}

        {/* Timing */}
        {job.startedAt && (
          <div className="text-xs text-muted-foreground">
            Started: {format(new Date(job.startedAt), "MMM d, yyyy h:mm a")}
            {job.completedAt && (
              <>
                {" "}
                • Completed:{" "}
                {format(new Date(job.completedAt), "MMM d, yyyy h:mm a")}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

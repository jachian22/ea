import { useState, useEffect } from 'react';
import {
  Loader2,
  Mail,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Clock,
  Users,
  MapPin,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  Inbox,
  CheckCircle2,
  MessageSquare,
  Info,
  Sun,
  CloudRain,
  Wind,
  Droplets,
  Thermometer,
  Sparkles,
  Lightbulb,
  MessagesSquare,
  Tag,
} from 'lucide-react';
import { CalendarTimeline } from '~/components/CalendarTimeline';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { useDailyBrief } from '~/hooks/use-daily-brief';
import { useGoogleIntegration } from '~/hooks/use-google-integration';
import type { CalendarEventData, EmailData, EnrichedBriefData } from '~/db/schema';

/**
 * Daily Brief Card Component
 *
 * Displays the user's morning brief including:
 * - Today's calendar events with times, attendees, and meeting links
 * - Important emails from the past 24 hours categorized by action status
 * - Summary statistics
 * - Brief generation controls
 */
export function DailyBriefCard() {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showAllEmails, setShowAllEmails] = useState(false);
  // Track mounted state to avoid hydration mismatch
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    latestBrief,
    hasBrief,
    isLatestBriefFromToday,
    briefStatus,
    stats,
    calendarEvents,
    emails,
    weather,
    briefContent,
    enrichedContent,
    isEnriched,
    errorMessage,
    isLoading,
    isError,
    error,
    generateBrief,
    isGenerating,
    refetchLatest,
  } = useDailyBrief();

  const { isConnected, isLoading: isIntegrationLoading } = useGoogleIntegration();

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(new Date(date));
  };

  const formatBriefDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const getActionStatusBadge = (status: EmailData['actionStatus']) => {
    switch (status) {
      case 'needs_response':
        return (
          <Badge variant="destructive" className="text-xs">
            Needs Response
          </Badge>
        );
      case 'awaiting_reply':
        return (
          <Badge
            variant="secondary"
            className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
          >
            Awaiting Reply
          </Badge>
        );
      case 'fyi':
        return (
          <Badge variant="secondary" className="text-xs">
            FYI
          </Badge>
        );
      default:
        return null;
    }
  };

  const getImportanceBadge = (importance: EmailData['importance']) => {
    switch (importance) {
      case 'high':
        return (
          <Badge variant="destructive" className="text-xs">
            High Priority
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant="outline" className="text-xs">
            Medium
          </Badge>
        );
      default:
        return null;
    }
  };

  const handleGenerateBrief = () => {
    generateBrief({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  };

  // Display events (limited unless expanded)
  const displayedEvents = showAllEvents ? calendarEvents : calendarEvents.slice(0, 3);
  const hasMoreEvents = calendarEvents.length > 3;

  // Display emails (limited unless expanded)
  const displayedEmails = showAllEmails ? emails : emails.slice(0, 5);
  const hasMoreEmails = emails.length > 5;

  // Group emails by action status
  const emailsByStatus = {
    needs_response: emails.filter((e) => e.actionStatus === 'needs_response'),
    awaiting_reply: emails.filter((e) => e.actionStatus === 'awaiting_reply'),
    fyi: emails.filter((e) => e.actionStatus === 'fyi'),
    none: emails.filter((e) => e.actionStatus === 'none'),
  };

  // Loading state skeleton - also show while mounting to avoid hydration mismatch
  if (!isMounted || isLoading || isIntegrationLoading) {
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
          <div className="h-24 w-full bg-muted rounded animate-pulse" />
          <div className="h-32 w-full bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  // Not connected state - prompt to connect Google
  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-amber-500" />
                Daily Brief
              </CardTitle>
              <CardDescription>
                Your personalized morning summary of calendar events and emails
              </CardDescription>
            </div>
            <Badge variant="secondary">Not Available</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Connect your Google account to receive your daily brief
            </p>
            <p className="text-xs text-muted-foreground">
              Go to Settings to connect your Gmail and Calendar
            </p>
          </div>
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
                Daily Brief
              </CardTitle>
              <CardDescription>Your personalized morning summary</CardDescription>
            </div>
            <Badge variant="destructive">Error</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Failed to load your brief</p>
                <p className="text-sm text-destructive/80">
                  {error || 'Please try generating a new brief.'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetchLatest()} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={handleGenerateBrief} disabled={isGenerating} className="flex-1">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Generate New Brief
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No brief yet state
  if (!hasBrief) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-amber-500" />
                Daily Brief
              </CardTitle>
              <CardDescription>
                Your personalized morning summary of calendar events and emails
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 text-center mb-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-900/10 flex items-center justify-center mb-4">
              <Sun className="h-8 w-8 text-amber-500" />
            </div>
            <p className="text-sm font-medium mb-1">No brief generated yet</p>
            <p className="text-xs text-muted-foreground">
              Generate your first daily brief to see your calendar and important emails
            </p>
          </div>
          <div className="flex justify-center">
            <Button onClick={handleGenerateBrief} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Brief...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Generate Today's Brief
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Brief failed to generate
  if (briefStatus === 'failed') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-amber-500" />
                Daily Brief
              </CardTitle>
              <CardDescription>
                {latestBrief?.briefDate
                  ? formatBriefDate(latestBrief.briefDate)
                  : 'Your personalized morning summary'}
              </CardDescription>
            </div>
            <Badge variant="destructive">Generation Failed</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Brief generation failed</p>
                <p className="text-sm text-destructive/80">
                  {errorMessage || 'There was an error generating your brief. Please try again.'}
                </p>
              </div>
            </div>
          </div>
          <Button onClick={handleGenerateBrief} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Retry Generation
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Brief is generating
  if (briefStatus === 'generating' || briefStatus === 'pending') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-amber-500" />
                Daily Brief
              </CardTitle>
              <CardDescription>
                {latestBrief?.briefDate
                  ? formatBriefDate(latestBrief.briefDate)
                  : 'Your personalized morning summary'}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-sm font-medium">Generating your brief...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Fetching your calendar events and analyzing your emails
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Successfully generated brief
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" />
              Daily Brief
            </CardTitle>
            <CardDescription>
              {latestBrief?.briefDate
                ? formatBriefDate(latestBrief.briefDate)
                : 'Your personalized morning summary'}
              {!isLatestBriefFromToday && latestBrief?.briefDate && (
                <span className="text-amber-600 dark:text-amber-400 ml-2">(Not today's brief)</span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isEnriched && (
              <Badge
                variant="secondary"
                className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                AI Enriched
              </Badge>
            )}
            {isLatestBriefFromToday ? (
              <Badge variant="default" className="bg-green-600 hover:bg-green-600/80">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Up to Date
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Clock className="h-3 w-3 mr-1" />
                Outdated
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Weather Card */}
        {weather && (
          <div className="bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-sky-200 dark:border-sky-800">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Thermometer className="h-5 w-5 text-sky-500" />
                  <span className="text-2xl font-bold">{weather.temperature}°F</span>
                  {weather.feelsLike && Math.abs(weather.feelsLike - weather.temperature) >= 3 && (
                    <span className="text-sm text-muted-foreground">
                      (feels like {weather.feelsLike}°F)
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-sky-700 dark:text-sky-300">
                  {weather.condition}
                </p>
                <p className="text-xs text-muted-foreground">{weather.locationName}</p>
              </div>
              <div className="text-right space-y-1 text-xs text-muted-foreground">
                {weather.humidity !== undefined && (
                  <div className="flex items-center justify-end gap-1">
                    <Droplets className="h-3 w-3" />
                    <span>{weather.humidity}%</span>
                  </div>
                )}
                {weather.windSpeed !== undefined && (
                  <div className="flex items-center justify-end gap-1">
                    <Wind className="h-3 w-3" />
                    <span>{weather.windSpeed} mph</span>
                  </div>
                )}
                {weather.precipitationProbability !== undefined &&
                  weather.precipitationProbability > 0 && (
                    <div className="flex items-center justify-end gap-1">
                      <CloudRain className="h-3 w-3" />
                      <span>{weather.precipitationProbability}%</span>
                    </div>
                  )}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-sky-200 dark:border-sky-700">
              <p className="text-sm text-sky-700 dark:text-sky-300">
                <span className="font-medium">Recommendation:</span> {weather.recommendation}
              </p>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <Calendar className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{stats.totalEvents}</p>
            <p className="text-xs text-muted-foreground">
              {stats.totalEvents === 1 ? 'Event' : 'Events'} Today
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <Mail className="h-5 w-5 mx-auto mb-1 text-indigo-500" />
            <p className="text-2xl font-bold">{stats.totalEmails}</p>
            <p className="text-xs text-muted-foreground">
              {stats.totalEmails === 1 ? 'Email' : 'Emails'}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <MessageSquare className="h-5 w-5 mx-auto mb-1 text-rose-500" />
            <p className="text-2xl font-bold">{stats.emailsNeedingResponse}</p>
            <p className="text-xs text-muted-foreground">Need Response</p>
          </div>
        </div>

        {/* AI Insights (if enriched) */}
        {isEnriched && enrichedContent && (
          <div className="space-y-4">
            {/* Day Summary */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span className="font-semibold text-sm text-purple-700 dark:text-purple-300">
                  AI Summary
                </span>
              </div>
              <p className="text-sm text-foreground">{enrichedContent.daySummary}</p>
            </div>

            {/* Key Conversations (Highlights) */}
            {enrichedContent.conversations.highlights.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold text-sm">Key Conversations</span>
                </div>
                <div className="space-y-2">
                  {enrichedContent.conversations.highlights.slice(0, 3).map((highlight, idx) => (
                    <div
                      key={highlight.threadId || idx}
                      className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800"
                    >
                      <p className="font-medium text-sm">{highlight.subject}</p>
                      <p className="text-xs text-muted-foreground mt-1">{highlight.whyImportant}</p>
                      {highlight.suggestedResponse && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                          <span className="font-medium">Suggested:</span>{' '}
                          {highlight.suggestedResponse}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Topic Groups */}
            {enrichedContent.conversations.byTopic.length > 0 && (
              <Accordion type="single" collapsible>
                <AccordionItem value="topics" className="border-none">
                  <AccordionTrigger className="py-2 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-indigo-500" />
                      <span className="font-semibold text-sm">Conversations by Topic</span>
                      <Badge variant="secondary" className="ml-2">
                        {enrichedContent.conversations.byTopic.length} topics
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      {enrichedContent.conversations.byTopic.map((topicGroup, idx) => (
                        <div key={topicGroup.topic || idx} className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                            {topicGroup.topic} ({topicGroup.threads.length})
                          </p>
                          {topicGroup.threads.map((thread, threadIdx) => (
                            <div
                              key={thread.threadId || threadIdx}
                              className="bg-muted/30 rounded-lg p-3 border border-border/50"
                            >
                              <p className="font-medium text-sm">{thread.subject}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {thread.narrative}
                              </p>
                              {thread.suggestedAction && (
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">
                                  <span className="font-medium">Action:</span>{' '}
                                  {thread.suggestedAction}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* Calendar Insights */}
            {enrichedContent.calendarInsights && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-sm text-blue-700 dark:text-blue-300">
                    Calendar Insights
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  {enrichedContent.calendarInsights.busyPeriods.length > 0 && (
                    <p>
                      <span className="font-medium">Busy:</span>{' '}
                      {enrichedContent.calendarInsights.busyPeriods.join(', ')}
                    </p>
                  )}
                  {enrichedContent.calendarInsights.focusTimeAvailable.length > 0 && (
                    <p>
                      <span className="font-medium">Focus time:</span>{' '}
                      {enrichedContent.calendarInsights.focusTimeAvailable.join(', ')}
                    </p>
                  )}
                  {enrichedContent.calendarInsights.keyMeetings.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium mb-1">Key meetings:</p>
                      {enrichedContent.calendarInsights.keyMeetings.map((meeting, idx) => (
                        <p key={idx} className="text-muted-foreground">
                          <span className="font-medium">{meeting.title}:</span> {meeting.why}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Brief Content (if available and not enriched) */}
        {briefContent && !isEnriched && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-sm whitespace-pre-wrap">{briefContent}</p>
            </div>
          </div>
        )}

        {/* Calendar Timeline */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            <span className="font-semibold">Today's Schedule</span>
            <Badge variant="secondary" className="ml-2">
              {stats.totalEvents}
            </Badge>
          </div>
          <CalendarTimeline events={calendarEvents} />
        </div>

        {/* Emails Section */}
        <Accordion type="single" collapsible defaultValue="emails">
          <AccordionItem value="emails" className="border-none">
            <AccordionTrigger className="py-2 hover:no-underline">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-indigo-500" />
                <span className="font-semibold">Important Emails</span>
                <Badge variant="secondary" className="ml-2">
                  {stats.totalEmails}
                </Badge>
                {stats.emailsNeedingResponse > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {stats.emailsNeedingResponse} need response
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {emails.length === 0 ? (
                <div className="bg-muted/30 rounded-lg p-4 text-center">
                  <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No important emails in the past 24 hours. Inbox zero!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Needs Response section */}
                  {emailsByStatus.needs_response.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-destructive uppercase tracking-wide">
                        Needs Your Response ({emailsByStatus.needs_response.length})
                      </p>
                      {emailsByStatus.needs_response
                        .slice(0, showAllEmails ? undefined : 3)
                        .map((email) => (
                          <EmailItem
                            key={email.id}
                            email={email}
                            getActionStatusBadge={getActionStatusBadge}
                            getImportanceBadge={getImportanceBadge}
                          />
                        ))}
                    </div>
                  )}

                  {/* Awaiting Reply section */}
                  {emailsByStatus.awaiting_reply.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                        Awaiting Reply ({emailsByStatus.awaiting_reply.length})
                      </p>
                      {emailsByStatus.awaiting_reply
                        .slice(0, showAllEmails ? undefined : 2)
                        .map((email) => (
                          <EmailItem
                            key={email.id}
                            email={email}
                            getActionStatusBadge={getActionStatusBadge}
                            getImportanceBadge={getImportanceBadge}
                          />
                        ))}
                    </div>
                  )}

                  {/* FYI section */}
                  {emailsByStatus.fyi.length > 0 && showAllEmails && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        For Your Information ({emailsByStatus.fyi.length})
                      </p>
                      {emailsByStatus.fyi.map((email) => (
                        <EmailItem
                          key={email.id}
                          email={email}
                          getActionStatusBadge={getActionStatusBadge}
                          getImportanceBadge={getImportanceBadge}
                        />
                      ))}
                    </div>
                  )}

                  {hasMoreEmails && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllEmails(!showAllEmails)}
                      className="w-full"
                    >
                      {showAllEmails ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Show All {emails.length} Emails
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Generation Info & Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {latestBrief?.generatedAt ? `Generated ${formatDate(latestBrief.generatedAt)}` : ''}
          </p>
          <Button variant="outline" size="sm" onClick={handleGenerateBrief} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Refresh Brief
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Calendar Event Item Component
 */
function CalendarEventItem({
  event,
  formatTime,
}: {
  event: CalendarEventData;
  formatTime: (iso: string) => string;
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{event.title}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {event.isAllDay ? (
              <span>All Day</span>
            ) : (
              <span>
                {formatTime(event.startTime)} - {formatTime(event.endTime)}
              </span>
            )}
          </div>
          {event.location && (
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span className="truncate">
                {event.attendees.length} {event.attendees.length === 1 ? 'attendee' : 'attendees'}
              </span>
            </div>
          )}
        </div>
        {event.meetingLink && (
          <a
            href={event.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Button variant="outline" size="sm">
              <LinkIcon className="h-3 w-3 mr-1" />
              Join
            </Button>
          </a>
        )}
      </div>
      {event.description && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{event.description}</p>
      )}
    </div>
  );
}

/**
 * Email Item Component
 */
function EmailItem({
  email,
  getActionStatusBadge,
  getImportanceBadge,
}: {
  email: EmailData;
  getActionStatusBadge: (status: EmailData['actionStatus']) => React.ReactNode;
  getImportanceBadge: (importance: EmailData['importance']) => React.ReactNode;
}) {
  const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm truncate">{email.subject}</p>
            {getImportanceBadge(email.importance)}
            {getActionStatusBadge(email.actionStatus)}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="font-medium">{email.from.name || email.from.email}</span>
            <span>•</span>
            <span>{formatRelativeTime(email.receivedAt)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{email.snippet}</p>
        </div>
        {!email.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />}
      </div>
    </div>
  );
}

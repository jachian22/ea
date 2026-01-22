import { useMemo, useState, useEffect } from 'react';
import { Clock, MapPin, LinkIcon, Users } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { CalendarEventData } from '~/db/schema';

interface CalendarTimelineProps {
  events: CalendarEventData[];
  startHour?: number;
  endHour?: number;
  /** Hide events marked as "free" (transparent) */
  hideFreeEvents?: boolean;
}

/**
 * Calendar Timeline Component
 *
 * Displays events in a vertical timeline format with hour markers.
 * Gives a quick "at a glance" view of the day's schedule.
 */
export function CalendarTimeline({
  events,
  startHour = 7,
  endHour = 20,
  hideFreeEvents = true,
}: CalendarTimelineProps) {
  const hours = useMemo(() => {
    const result = [];
    for (let h = startHour; h <= endHour; h++) {
      result.push(h);
    }
    return result;
  }, [startHour, endHour]);

  // Use client-side only state for current time to avoid hydration mismatch
  const [currentTime, setCurrentTime] = useState<{ hour: number; minutes: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    setCurrentTime({ hour: now.getHours(), minutes: now.getMinutes() });
  }, []);

  const currentHour = currentTime?.hour ?? 0;
  const currentMinutes = currentTime?.minutes ?? 0;

  // Filter out "free" events if requested (these are self-notes/reminders)
  const filteredEvents = useMemo(() => {
    if (!hideFreeEvents) return events;
    return events.filter((e) => e.transparency !== 'transparent');
  }, [events, hideFreeEvents]);

  // Separate all-day events from timed events
  const allDayEvents = filteredEvents.filter((e) => e.isAllDay);
  const timedEvents = filteredEvents.filter((e) => !e.isAllDay);

  const formatHour = (hour: number) => {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    if (hour < 12) return `${hour}am`;
    return `${hour - 12}pm`;
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getEventPosition = (event: CalendarEventData) => {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    const timelineStartMinutes = startHour * 60;
    const timelineEndMinutes = endHour * 60;
    const totalMinutes = timelineEndMinutes - timelineStartMinutes;

    const top = ((startMinutes - timelineStartMinutes) / totalMinutes) * 100;
    const height = ((endMinutes - startMinutes) / totalMinutes) * 100;

    return {
      top: `${Math.max(0, top)}%`,
      height: `${Math.min(height, 100 - top)}%`,
      minHeight: '2.5rem',
    };
  };

  const getCurrentTimePosition = () => {
    const currentMinutesTotal = currentHour * 60 + currentMinutes;
    const timelineStartMinutes = startHour * 60;
    const timelineEndMinutes = endHour * 60;
    const totalMinutes = timelineEndMinutes - timelineStartMinutes;

    const position = ((currentMinutesTotal - timelineStartMinutes) / totalMinutes) * 100;
    return `${position}%`;
  };

  const isCurrentTimeVisible =
    currentTime !== null && currentHour >= startHour && currentHour <= endHour;

  if (filteredEvents.length === 0) {
    return (
      <div className="bg-muted/30 rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">No meetings scheduled for today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="space-y-1.5 pb-2 border-b border-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            All Day
          </p>
          {allDayEvents.map((event) => (
            <div
              key={event.id}
              className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded px-2 py-1 text-sm font-medium"
            >
              {event.title}
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="relative flex">
        {/* Hour labels */}
        <div className="w-12 flex-shrink-0">
          {hours.map((hour) => (
            <div key={hour} className="h-12 flex items-start justify-end pr-2">
              <span className="text-xs text-muted-foreground -mt-1.5">{formatHour(hour)}</span>
            </div>
          ))}
        </div>

        {/* Timeline grid + events */}
        <div className="flex-1 relative border-l border-border/50">
          {/* Hour lines */}
          {hours.map((hour) => (
            <div key={hour} className="h-12 border-b border-border/30" />
          ))}

          {/* Current time indicator */}
          {isCurrentTimeVisible && (
            <div
              className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
              style={{ top: getCurrentTimePosition() }}
            >
              <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
              <div className="flex-1 h-px bg-red-500" />
            </div>
          )}

          {/* Events */}
          <div className="absolute inset-0 pl-1 pr-2">
            {timedEvents.map((event) => {
              const position = getEventPosition(event);
              return (
                <div
                  key={event.id}
                  className="absolute left-1 right-2 bg-gradient-to-r from-blue-500/90 to-blue-600/90 dark:from-blue-600/90 dark:to-blue-700/90 rounded-md shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
                  style={position}
                >
                  <div className="p-1.5 h-full flex flex-col">
                    <p className="text-xs font-medium text-white truncate">{event.title}</p>
                    <p className="text-[10px] text-white/80">
                      {formatTime(event.startTime)} - {formatTime(event.endTime)}
                    </p>
                    {event.meetingLink && (
                      <a
                        href={event.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[10px] text-white/90 hover:text-white underline">
                          Join
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Event details below timeline */}
      {timedEvents.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Details
          </p>
          {timedEvents.map((event) => (
            <div
              key={`detail-${event.id}`}
              className="flex items-center justify-between gap-2 text-sm py-1"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground w-16 flex-shrink-0">
                  {formatTime(event.startTime)}
                </span>
                <span className="font-medium truncate">{event.title}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {event.attendees && event.attendees.length > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {event.attendees.length}
                  </span>
                )}
                {event.meetingLink && (
                  <a href={event.meetingLink} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                      <LinkIcon className="h-3 w-3 mr-1" />
                      Join
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

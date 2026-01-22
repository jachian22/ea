// Shared type definitions

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: string[];
  location?: string;
  meetingLink?: string;
}

export interface Email {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  date: Date;
  isUnread: boolean;
  labels: string[];
}

export interface DailyBrief {
  id: string;
  oduserId: string;
  date: Date;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  calendarEvents: CalendarEvent[];
  emails: Email[];
  enrichedContent?: string;
  statistics?: BriefStatistics;
  createdAt: Date;
  updatedAt: Date;
}

export interface BriefStatistics {
  totalEvents: number;
  totalEmails: number;
  emailsNeedingResponse: number;
  highPriorityItems: number;
}

export interface EnrichmentResult {
  summary: string;
  priorities: string[];
  actionItems: string[];
  insights: string[];
}

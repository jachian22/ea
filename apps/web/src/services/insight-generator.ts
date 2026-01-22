/**
 * Insight Generator Service
 *
 * Generates proactive insights from the knowledge graph that can be
 * surfaced via notifications or daily briefs.
 *
 * Insight types:
 * - Stale contacts (people you haven't contacted recently)
 * - Overdue commitments (both directions)
 * - Upcoming commitments requiring attention
 * - Meeting prep reminders
 * - Follow-up opportunities
 */

import {
  findStaleContacts,
  findHighImportancePersons,
  type PersonDossier,
} from '~/data-access/persons';
import {
  findOverdueCommitments,
  findCommitmentsDueToday,
  findUpcomingCommitments,
  type CommitmentWithPerson,
} from '~/data-access/commitments';
import { findTodaysMeetingBriefings } from '~/data-access/meeting-briefings';
import type { Person, Commitment, MeetingBriefing } from '~/db/schema';

// ============================================================================
// Types
// ============================================================================

export type InsightType =
  | 'stale_contact'
  | 'commitment_overdue_you_owe'
  | 'commitment_overdue_they_owe'
  | 'commitment_due_today'
  | 'commitment_due_soon'
  | 'meeting_prep_needed'
  | 'follow_up_opportunity'
  | 'vip_no_recent_contact';

export type InsightUrgency = 'low' | 'medium' | 'high' | 'critical';

export interface Insight {
  type: InsightType;
  urgency: InsightUrgency;
  title: string;
  description: string;
  entityType: 'person' | 'commitment' | 'meeting';
  entityId: string;
  relatedPerson?: {
    id: string;
    name: string | null;
    email: string;
  };
  actionSuggestion?: string;
  metadata?: Record<string, unknown>;
}

export interface InsightSummary {
  generatedAt: Date;
  totalInsights: number;
  byUrgency: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  insights: Insight[];
}

// ============================================================================
// Insight Generation
// ============================================================================

/**
 * Generate all insights for a user
 */
export async function generateInsights(
  userId: string,
  options: {
    includeStaleContacts?: boolean;
    staleDaysThreshold?: number;
    upcomingDays?: number;
    limit?: number;
  } = {}
): Promise<InsightSummary> {
  const {
    includeStaleContacts = true,
    staleDaysThreshold = 30,
    upcomingDays = 7,
    limit = 50,
  } = options;

  const insights: Insight[] = [];

  // Gather insights in parallel for efficiency
  const [
    overdueCommitments,
    dueTodayCommitments,
    upcomingCommitments,
    staleContacts,
    vipContacts,
    todayMeetings,
  ] = await Promise.all([
    findOverdueCommitments(userId),
    findCommitmentsDueToday(userId),
    findUpcomingCommitments(userId, upcomingDays),
    includeStaleContacts ? findStaleContacts(userId, staleDaysThreshold, 20) : Promise.resolve([]),
    findHighImportancePersons(userId, 80, 10),
    findTodaysMeetingBriefings(userId),
  ]);

  // Process overdue commitments (critical/high urgency)
  for (const commitment of overdueCommitments) {
    const isYouOwe = commitment.direction === 'user_owes';
    const daysOverdue = commitment.dueDate
      ? Math.floor((Date.now() - commitment.dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    insights.push({
      type: isYouOwe ? 'commitment_overdue_you_owe' : 'commitment_overdue_they_owe',
      urgency: daysOverdue > 7 ? 'critical' : 'high',
      title: isYouOwe
        ? `Overdue: You owe ${getPersonName(commitment)}`
        : `Overdue: ${getPersonName(commitment)} owes you`,
      description: commitment.description,
      entityType: 'commitment',
      entityId: commitment.id,
      relatedPerson: getPersonInfo(commitment),
      actionSuggestion: isYouOwe
        ? 'Complete this commitment or communicate about the delay'
        : 'Follow up to check on status',
      metadata: { daysOverdue },
    });
  }

  // Process commitments due today (high urgency)
  for (const commitment of dueTodayCommitments) {
    const isYouOwe = commitment.direction === 'user_owes';

    insights.push({
      type: 'commitment_due_today',
      urgency: 'high',
      title: `Due today: ${commitment.description.substring(0, 50)}${commitment.description.length > 50 ? '...' : ''}`,
      description: isYouOwe
        ? `You need to complete this for ${getPersonName(commitment)}`
        : `${getPersonName(commitment)} should deliver this today`,
      entityType: 'commitment',
      entityId: commitment.id,
      relatedPerson: getPersonInfo(commitment),
      actionSuggestion: isYouOwe
        ? 'Prioritize completing this today'
        : 'Check if they need a reminder',
    });
  }

  // Process upcoming commitments (medium urgency)
  for (const commitment of upcomingCommitments.slice(0, 10)) {
    const isYouOwe = commitment.direction === 'user_owes';
    const daysUntilDue = commitment.dueDate
      ? Math.ceil((commitment.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    insights.push({
      type: 'commitment_due_soon',
      urgency: daysUntilDue <= 2 ? 'high' : 'medium',
      title: `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}: ${commitment.description.substring(0, 40)}...`,
      description: isYouOwe
        ? `You promised this to ${getPersonName(commitment)}`
        : `${getPersonName(commitment)} promised this to you`,
      entityType: 'commitment',
      entityId: commitment.id,
      relatedPerson: getPersonInfo(commitment),
      metadata: { daysUntilDue },
    });
  }

  // Process stale contacts (low/medium urgency)
  if (includeStaleContacts) {
    for (const person of staleContacts) {
      const daysSinceContact = person.lastContactAt
        ? Math.floor((Date.now() - person.lastContactAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      const isVip = (person.importanceScore || 0) >= 70;

      insights.push({
        type: isVip ? 'vip_no_recent_contact' : 'stale_contact',
        urgency: isVip ? 'medium' : 'low',
        title: `No contact in ${daysSinceContact} days: ${person.name || person.email}`,
        description: person.company
          ? `${person.role || 'Contact'} at ${person.company}`
          : person.domain || 'Contact',
        entityType: 'person',
        entityId: person.id,
        relatedPerson: {
          id: person.id,
          name: person.name,
          email: person.email,
        },
        actionSuggestion: 'Consider reaching out to maintain the relationship',
        metadata: { daysSinceContact, importanceScore: person.importanceScore },
      });
    }
  }

  // Process meetings needing prep (medium urgency)
  for (const meeting of todayMeetings) {
    if (meeting.status === 'pending' || meeting.status === 'generating') {
      insights.push({
        type: 'meeting_prep_needed',
        urgency: 'medium',
        title: `Meeting prep: ${meeting.meetingTitle}`,
        description: `Briefing ${meeting.status === 'generating' ? 'being generated' : 'not yet generated'}`,
        entityType: 'meeting',
        entityId: meeting.id,
        actionSuggestion: 'Review meeting briefing before the meeting',
        metadata: {
          meetingTime: meeting.meetingStartTime?.toISOString(),
          attendeeCount: meeting.attendees?.length || 0,
        },
      });
    }
  }

  // Sort by urgency
  const urgencyOrder: Record<InsightUrgency, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  insights.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  // Limit results
  const limitedInsights = insights.slice(0, limit);

  // Calculate summary
  const byUrgency = {
    critical: limitedInsights.filter((i) => i.urgency === 'critical').length,
    high: limitedInsights.filter((i) => i.urgency === 'high').length,
    medium: limitedInsights.filter((i) => i.urgency === 'medium').length,
    low: limitedInsights.filter((i) => i.urgency === 'low').length,
  };

  return {
    generatedAt: new Date(),
    totalInsights: limitedInsights.length,
    byUrgency,
    insights: limitedInsights,
  };
}

/**
 * Generate a quick summary of urgent items
 */
export async function generateUrgentSummary(userId: string): Promise<{
  overdueYouOwe: number;
  overdueTheyOwe: number;
  dueToday: number;
  meetingsNeedingPrep: number;
  criticalInsights: Insight[];
}> {
  const [overdueCommitments, dueTodayCommitments, todayMeetings]: [
    Commitment[],
    Commitment[],
    MeetingBriefing[],
  ] = await Promise.all([
    findOverdueCommitments(userId),
    findCommitmentsDueToday(userId),
    findTodaysMeetingBriefings(userId),
  ]);

  const overdueYouOwe = overdueCommitments.filter(
    (c: Commitment) => c.direction === 'user_owes'
  ).length;
  const overdueTheyOwe = overdueCommitments.filter(
    (c: Commitment) => c.direction === 'they_owe'
  ).length;
  const meetingsNeedingPrep = todayMeetings.filter(
    (m: MeetingBriefing) => m.status === 'pending' || m.status === 'generating'
  ).length;

  // Generate critical insights only
  const criticalInsights: Insight[] = [];

  // Add severely overdue commitments
  for (const commitment of overdueCommitments) {
    const daysOverdue = commitment.dueDate
      ? Math.floor((Date.now() - commitment.dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (daysOverdue > 7 && commitment.direction === 'user_owes') {
      criticalInsights.push({
        type: 'commitment_overdue_you_owe',
        urgency: 'critical',
        title: `OVERDUE ${daysOverdue}d: ${commitment.description.substring(0, 40)}...`,
        description: `You owe this to ${getPersonName(commitment)}`,
        entityType: 'commitment',
        entityId: commitment.id,
        relatedPerson: getPersonInfo(commitment),
      });
    }
  }

  return {
    overdueYouOwe,
    overdueTheyOwe,
    dueToday: dueTodayCommitments.length,
    meetingsNeedingPrep,
    criticalInsights: criticalInsights.slice(0, 5),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

type CommitmentLike = Commitment | CommitmentWithPerson;

function getPersonName(commitment: CommitmentLike): string {
  if ('person' in commitment && commitment.person) {
    const person = commitment.person as { name?: string | null; email?: string | null };
    if (person.name) return person.name;
    if (person.email) return person.email;
  }
  return 'someone';
}

function getPersonInfo(
  commitment: CommitmentLike
): { id: string; name: string | null; email: string } | undefined {
  if ('person' in commitment && commitment.person) {
    const person = commitment.person as {
      id?: string;
      name?: string | null;
      email?: string | null;
    };
    if (person.id) {
      return {
        id: person.id,
        name: person.name || null,
        email: person.email || '',
      };
    }
  }
  return undefined;
}

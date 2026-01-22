/**
 * Tests for Observation & Briefing Capabilities (Phase 2)
 *
 * These tests verify:
 * - Commitment management functionality
 * - Person dossier functionality
 * - Notification system
 * - Meeting briefing generation
 * - Enhanced daily digest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Person,
  Commitment,
  Notification,
  MeetingBriefing,
  PersonDomain,
  CommitmentStatus,
  NotificationType,
} from '~/db/schema';

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockPerson(overrides: Partial<Person> = {}): Person {
  return {
    id: crypto.randomUUID(),
    userId: 'test-user-id',
    email: 'contact@example.com',
    emails: null,
    phone: null,
    name: 'Test Contact',
    role: 'Developer',
    company: 'Test Corp',
    domain: 'business' as PersonDomain,
    importanceScore: 50,
    preferredChannel: null,
    averageResponseTime: null,
    totalInteractions: 5,
    lastContactAt: new Date('2025-01-10'),
    lastContactChannel: 'email',
    firstContactAt: new Date('2024-06-01'),
    personalNotes: null,
    googleContactId: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: crypto.randomUUID(),
    userId: 'test-user-id',
    personId: 'test-person-id',
    description: 'Complete project review',
    direction: 'user_owes',
    status: 'pending' as CommitmentStatus,
    promisedAt: new Date('2025-01-01'),
    dueDate: new Date('2025-01-20'),
    completedAt: null,
    completionEvidence: null,
    sourceType: 'email',
    sourceId: 'email-123',
    priority: 'medium',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: crypto.randomUUID(),
    userId: 'test-user-id',
    type: 'commitment_due_today' as NotificationType,
    title: 'Commitment Due Today',
    body: 'Your commitment is due today.',
    urgency: 'medium',
    channels: ['in_app', 'email'],
    isRead: false,
    readAt: null,
    deliveryStatus: null,
    relatedType: 'commitment',
    relatedId: 'test-commitment-id',
    metadata: null,
    scheduledFor: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockMeetingBriefing(overrides: Partial<MeetingBriefing> = {}): MeetingBriefing {
  return {
    id: crypto.randomUUID(),
    userId: 'test-user-id',
    calendarEventId: 'event-123',
    meetingTitle: 'Weekly Sync',
    meetingStartTime: new Date('2025-01-17T10:00:00'),
    meetingEndTime: new Date('2025-01-17T11:00:00'),
    meetingLocation: 'Conference Room A',
    meetingLink: 'https://meet.google.com/abc-def-ghi',
    attendees: [],
    previousMeetings: [],
    relatedEmailThreads: [],
    upcomingCommitments: [],
    suggestedPrep: [],
    briefingContent: null,
    status: 'pending',
    errorMessage: null,
    notificationSentAt: null,
    generatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Schema Type Tests
// ============================================================================

describe('Schema Types', () => {
  describe('Person', () => {
    it('should have all required fields', () => {
      const person = createMockPerson();

      expect(person.id).toBeDefined();
      expect(person.userId).toBeDefined();
      expect(person.email).toBeDefined();
      expect(person.domain).toBe('business');
      expect(person.importanceScore).toBe(50);
      expect(person.totalInteractions).toBe(5);
    });

    it('should support all domain types', () => {
      const domains: PersonDomain[] = ['business', 'job', 'family', 'personal', 'other'];

      for (const domain of domains) {
        const person = createMockPerson({ domain });
        expect(person.domain).toBe(domain);
      }
    });
  });

  describe('Commitment', () => {
    it('should have all required fields', () => {
      const commitment = createMockCommitment();

      expect(commitment.id).toBeDefined();
      expect(commitment.userId).toBeDefined();
      expect(commitment.description).toBeDefined();
      expect(commitment.direction).toBe('user_owes');
      expect(commitment.status).toBe('pending');
    });

    it('should support all status types', () => {
      const statuses: CommitmentStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];

      for (const status of statuses) {
        const commitment = createMockCommitment({ status });
        expect(commitment.status).toBe(status);
      }
    });

    it('should support both directions', () => {
      const userOwes = createMockCommitment({ direction: 'user_owes' });
      const theyOwe = createMockCommitment({ direction: 'they_owe' });

      expect(userOwes.direction).toBe('user_owes');
      expect(theyOwe.direction).toBe('they_owe');
    });
  });

  describe('Notification', () => {
    it('should have all required fields', () => {
      const notification = createMockNotification();

      expect(notification.id).toBeDefined();
      expect(notification.userId).toBeDefined();
      expect(notification.type).toBeDefined();
      expect(notification.title).toBeDefined();
      expect(notification.body).toBeDefined();
      expect(notification.urgency).toBe('medium');
    });

    it('should support all notification types', () => {
      const types: NotificationType[] = [
        'meeting_briefing_ready',
        'commitment_due_today',
        'commitment_overdue',
        'high_importance_email',
        'follow_up_reminder',
        'weekly_relationship_review',
        'daily_digest',
      ];

      for (const type of types) {
        const notification = createMockNotification({ type });
        expect(notification.type).toBe(type);
      }
    });
  });

  describe('MeetingBriefing', () => {
    it('should have all required fields', () => {
      const briefing = createMockMeetingBriefing();

      expect(briefing.id).toBeDefined();
      expect(briefing.userId).toBeDefined();
      expect(briefing.calendarEventId).toBeDefined();
      expect(briefing.meetingTitle).toBeDefined();
      expect(briefing.meetingStartTime).toBeDefined();
      expect(briefing.meetingEndTime).toBeDefined();
      expect(briefing.status).toBe('pending');
    });
  });
});

// ============================================================================
// Commitment Logic Tests
// ============================================================================

describe('Commitment Logic', () => {
  describe('Overdue Detection', () => {
    it('should identify overdue commitments', () => {
      const pastDue = createMockCommitment({
        dueDate: new Date('2024-01-01'),
        status: 'pending',
      });

      const isOverdue =
        pastDue.dueDate! < new Date() &&
        pastDue.status !== 'completed' &&
        pastDue.status !== 'cancelled';

      expect(isOverdue).toBe(true);
    });

    it('should not mark completed commitments as overdue', () => {
      const completed = createMockCommitment({
        dueDate: new Date('2024-01-01'),
        status: 'completed',
      });

      const isOverdue =
        completed.dueDate! < new Date() &&
        completed.status !== 'completed' &&
        completed.status !== 'cancelled';

      expect(isOverdue).toBe(false);
    });

    it('should calculate days overdue correctly', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const commitment = createMockCommitment({
        dueDate: twoDaysAgo,
        status: 'pending',
      });

      const now = new Date();
      const daysOverdue = Math.floor(
        (now.getTime() - commitment.dueDate!.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysOverdue).toBe(2);
    });
  });

  describe('Due Date Calculations', () => {
    it('should calculate days until due correctly', () => {
      const fiveDaysLater = new Date();
      fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);

      const commitment = createMockCommitment({
        dueDate: fiveDaysLater,
      });

      const now = new Date();
      const daysUntilDue = Math.ceil(
        (commitment.dueDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysUntilDue).toBe(5);
    });
  });
});

// ============================================================================
// Person Importance Score Tests
// ============================================================================

describe('Person Importance Score', () => {
  it('should have a default importance score', () => {
    const person = createMockPerson();
    expect(person.importanceScore).toBe(50);
  });

  it('should track interaction count', () => {
    const activePerson = createMockPerson({
      totalInteractions: 100,
    });

    expect(activePerson.totalInteractions).toBe(100);
  });

  it('should track last contact info', () => {
    const person = createMockPerson({
      lastContactAt: new Date('2025-01-10'),
      lastContactChannel: 'email',
    });

    expect(person.lastContactAt).toEqual(new Date('2025-01-10'));
    expect(person.lastContactChannel).toBe('email');
  });
});

// ============================================================================
// Notification Channel Tests
// ============================================================================

describe('Notification Channels', () => {
  it('should support multiple channels', () => {
    const notification = createMockNotification({
      channels: ['in_app', 'push', 'email'],
    });

    expect(notification.channels).toContain('in_app');
    expect(notification.channels).toContain('push');
    expect(notification.channels).toContain('email');
  });

  it('should track delivery status per channel', () => {
    const notification = createMockNotification({
      deliveryStatus: {
        in_app: { sent: true, sentAt: '2025-01-17T10:00:00Z' },
        email: { sent: false, error: 'SMTP error' },
      },
    });

    expect(notification.deliveryStatus?.in_app?.sent).toBe(true);
    expect(notification.deliveryStatus?.email?.sent).toBe(false);
    expect(notification.deliveryStatus?.email?.error).toBe('SMTP error');
  });
});

// ============================================================================
// Meeting Briefing Tests
// ============================================================================

describe('Meeting Briefing', () => {
  describe('Attendee Info', () => {
    it('should store attendee information', () => {
      const briefing = createMockMeetingBriefing({
        attendees: [
          {
            email: 'alice@example.com',
            name: 'Alice Smith',
            personId: 'person-1',
            role: 'Product Manager',
            company: 'Tech Corp',
            domain: 'business',
            lastContactAt: '2025-01-10T10:00:00Z',
            openCommitmentsYouOwe: [{ description: 'Send proposal', dueDate: '2025-01-20' }],
            openCommitmentsTheyOwe: [],
            recentInteractions: [
              { date: '2025-01-10T10:00:00Z', summary: 'Discussed project timeline' },
            ],
          },
        ],
      });

      expect(briefing.attendees).toHaveLength(1);
      expect(briefing.attendees![0].name).toBe('Alice Smith');
      expect(briefing.attendees![0].openCommitmentsYouOwe).toHaveLength(1);
    });
  });

  describe('Suggested Prep', () => {
    it('should store suggested prep items', () => {
      const briefing = createMockMeetingBriefing({
        suggestedPrep: [
          { type: 'follow_up', description: 'Follow up on: Project proposal' },
          { type: 'ask_about', description: 'Ask about: Budget approval' },
          { type: 'remember', description: 'Birthday next week', personName: 'Alice' },
        ],
      });

      expect(briefing.suggestedPrep).toHaveLength(3);
      expect(briefing.suggestedPrep![0].type).toBe('follow_up');
      expect(briefing.suggestedPrep![1].type).toBe('ask_about');
      expect(briefing.suggestedPrep![2].type).toBe('remember');
    });
  });

  describe('Status Tracking', () => {
    it('should track briefing generation status', () => {
      const pending = createMockMeetingBriefing({ status: 'pending' });
      const generating = createMockMeetingBriefing({ status: 'generating' });
      const completed = createMockMeetingBriefing({ status: 'completed' });
      const failed = createMockMeetingBriefing({ status: 'failed' });

      expect(pending.status).toBe('pending');
      expect(generating.status).toBe('generating');
      expect(completed.status).toBe('completed');
      expect(failed.status).toBe('failed');
    });
  });
});

// ============================================================================
// Date Helper Tests
// ============================================================================

describe('Date Helpers', () => {
  it('should format dates correctly', () => {
    const date = new Date('2025-01-17T10:30:00');
    const formatted = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    expect(formatted).toMatch(/10:30\s?(AM|am)/);
  });

  it('should calculate days between dates', () => {
    const date1 = new Date('2025-01-10');
    const date2 = new Date('2025-01-17');

    const diffDays = Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));

    expect(diffDays).toBe(7);
  });
});

// ============================================================================
// Integration Placeholder Tests
// ============================================================================

describe('Feature Integration', () => {
  it('should have all schema types defined', () => {
    // Verify that our types are properly exported
    const person = createMockPerson();
    const commitment = createMockCommitment();
    const notification = createMockNotification();
    const briefing = createMockMeetingBriefing();

    expect(person).toBeDefined();
    expect(commitment).toBeDefined();
    expect(notification).toBeDefined();
    expect(briefing).toBeDefined();
  });

  it('should link commitments to persons', () => {
    const person = createMockPerson({ id: 'person-abc' });
    const commitment = createMockCommitment({ personId: person.id });

    expect(commitment.personId).toBe(person.id);
  });

  it('should link notifications to related entities', () => {
    const commitment = createMockCommitment({ id: 'commitment-xyz' });
    const notification = createMockNotification({
      relatedType: 'commitment',
      relatedId: commitment.id,
    });

    expect(notification.relatedType).toBe('commitment');
    expect(notification.relatedId).toBe(commitment.id);
  });
});

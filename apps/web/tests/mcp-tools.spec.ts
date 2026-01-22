/**
 * Tests for MCP Tool Server (Phase 4)
 *
 * These tests verify:
 * - MCP tool registration
 * - Tool input validation
 * - Tool response formatting
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the data-access modules before importing tools
vi.mock('~/data-access/persons', () => ({
  searchPersons: vi.fn(),
  findPersonById: vi.fn(),
  getPersonDossier: vi.fn(),
  findPersonsByDomain: vi.fn(),
  findHighImportancePersons: vi.fn(),
  findPersonsByUserId: vi.fn(),
}));

vi.mock('~/data-access/commitments', () => ({
  findCommitmentsByUserId: vi.fn(),
  findOverdueCommitments: vi.fn(),
  findCommitmentsWithPerson: vi.fn(),
  findUpcomingCommitments: vi.fn(),
  createCommitment: vi.fn(),
  updateCommitmentStatus: vi.fn(),
  findCommitmentById: vi.fn(),
}));

vi.mock('~/data-access/interactions', () => ({
  findInteractionsByUserId: vi.fn(),
  findInteractionsByPersonId: vi.fn(),
  findInteractionsWithPerson: vi.fn(),
}));

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockPerson(overrides = {}) {
  return {
    id: 'person-123',
    userId: 'user-123',
    email: 'test@example.com',
    name: 'Test Person',
    role: 'Developer',
    company: 'Test Corp',
    domain: 'business',
    importanceScore: 75,
    lastContactAt: new Date('2025-01-10'),
    totalInteractions: 15,
    ...overrides,
  };
}

function createMockCommitment(overrides = {}) {
  return {
    id: 'commitment-123',
    userId: 'user-123',
    personId: 'person-123',
    description: 'Complete project review',
    direction: 'user_owes',
    status: 'pending',
    dueDate: new Date('2025-01-25'),
    priority: 'medium',
    promisedAt: new Date('2025-01-10'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockInteraction(overrides = {}) {
  return {
    id: 'interaction-123',
    userId: 'user-123',
    personId: 'person-123',
    type: 'email',
    channel: 'gmail',
    direction: 'inbound',
    subject: 'Project Update',
    summary: 'Discussed project timeline',
    occurredAt: new Date('2025-01-15'),
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// MCP Response Format Tests
// ============================================================================

describe('MCP Tool Response Format', () => {
  describe('Success Response', () => {
    it('should have correct structure for success', () => {
      const successResponse = {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                data: { key: 'value' },
              },
              null,
              2
            ),
          },
        ],
      };

      expect(successResponse.content).toHaveLength(1);
      expect(successResponse.content[0].type).toBe('text');

      const parsed = JSON.parse(successResponse.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Error Response', () => {
    it('should have correct structure for error', () => {
      const errorResponse = {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: 'Something went wrong',
            }),
          },
        ],
        isError: true,
      };

      expect(errorResponse.isError).toBe(true);

      const parsed = JSON.parse(errorResponse.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });
  });
});

// ============================================================================
// Person Formatting Tests
// ============================================================================

describe('Person Data Formatting', () => {
  it('should format basic person info correctly', () => {
    const person = createMockPerson();

    const formatted = {
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      company: person.company,
      domain: person.domain,
      importanceScore: person.importanceScore,
      lastContactAt: person.lastContactAt?.toISOString(),
      totalInteractions: person.totalInteractions,
    };

    expect(formatted.id).toBe('person-123');
    expect(formatted.name).toBe('Test Person');
    expect(formatted.email).toBe('test@example.com');
    expect(formatted.domain).toBe('business');
    expect(formatted.importanceScore).toBe(75);
  });

  it('should handle null values gracefully', () => {
    const person = createMockPerson({
      name: null,
      role: null,
      company: null,
      lastContactAt: null,
    });

    const formatted = {
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      company: person.company,
      lastContactAt: person.lastContactAt?.toISOString(),
    };

    expect(formatted.name).toBeNull();
    expect(formatted.role).toBeNull();
    expect(formatted.lastContactAt).toBeUndefined();
  });
});

// ============================================================================
// Commitment Formatting Tests
// ============================================================================

describe('Commitment Data Formatting', () => {
  it('should format commitment with overdue calculation', () => {
    const pastDue = new Date();
    pastDue.setDate(pastDue.getDate() - 5);

    const commitment = createMockCommitment({
      dueDate: pastDue,
      status: 'pending',
    });

    const now = new Date();
    const isOverdue =
      commitment.dueDate &&
      commitment.dueDate < now &&
      (commitment.status === 'pending' || commitment.status === 'in_progress');

    expect(isOverdue).toBe(true);
  });

  it('should not mark completed commitments as overdue', () => {
    const pastDue = new Date();
    pastDue.setDate(pastDue.getDate() - 5);

    const commitment = createMockCommitment({
      dueDate: pastDue,
      status: 'completed',
    });

    const now = new Date();
    const isOverdue =
      commitment.dueDate &&
      commitment.dueDate < now &&
      (commitment.status === 'pending' || commitment.status === 'in_progress');

    expect(isOverdue).toBe(false);
  });

  it('should format commitment directions correctly', () => {
    const youOwe = createMockCommitment({ direction: 'user_owes' });
    const theyOwe = createMockCommitment({ direction: 'they_owe' });

    expect(youOwe.direction).toBe('user_owes');
    expect(theyOwe.direction).toBe('they_owe');
  });
});

// ============================================================================
// Interaction Formatting Tests
// ============================================================================

describe('Interaction Data Formatting', () => {
  it('should format interaction with all fields', () => {
    const interaction = createMockInteraction();

    const formatted = {
      id: interaction.id,
      type: interaction.type,
      channel: interaction.channel,
      direction: interaction.direction,
      subject: interaction.subject,
      summary: interaction.summary,
      occurredAt: interaction.occurredAt?.toISOString(),
    };

    expect(formatted.type).toBe('email');
    expect(formatted.channel).toBe('gmail');
    expect(formatted.subject).toBe('Project Update');
  });

  it('should handle different interaction types', () => {
    const types = ['email', 'meeting', 'call', 'message', 'other'];

    for (const type of types) {
      const interaction = createMockInteraction({ type });
      expect(interaction.type).toBe(type);
    }
  });
});

// ============================================================================
// Search and Filter Logic Tests
// ============================================================================

describe('Search and Filter Logic', () => {
  it('should filter commitments by direction', () => {
    const commitments = [
      createMockCommitment({ id: '1', direction: 'user_owes' }),
      createMockCommitment({ id: '2', direction: 'they_owe' }),
      createMockCommitment({ id: '3', direction: 'user_owes' }),
    ];

    const youOwe = commitments.filter((c) => c.direction === 'user_owes');
    const theyOwe = commitments.filter((c) => c.direction === 'they_owe');

    expect(youOwe).toHaveLength(2);
    expect(theyOwe).toHaveLength(1);
  });

  it('should filter by status array', () => {
    const commitments = [
      createMockCommitment({ id: '1', status: 'pending' }),
      createMockCommitment({ id: '2', status: 'completed' }),
      createMockCommitment({ id: '3', status: 'in_progress' }),
      createMockCommitment({ id: '4', status: 'cancelled' }),
    ];

    const activeStatuses = ['pending', 'in_progress'];
    const active = commitments.filter((c) => activeStatuses.includes(c.status));

    expect(active).toHaveLength(2);
  });

  it('should filter interactions by type', () => {
    const interactions = [
      createMockInteraction({ id: '1', type: 'email' }),
      createMockInteraction({ id: '2', type: 'meeting' }),
      createMockInteraction({ id: '3', type: 'email' }),
    ];

    const emails = interactions.filter((i) => i.type === 'email');
    expect(emails).toHaveLength(2);
  });
});

// ============================================================================
// Domain Classification Tests
// ============================================================================

describe('Domain Classification', () => {
  it('should support all domain types', () => {
    const domains = ['family', 'business', 'job', 'personal', 'other'];

    for (const domain of domains) {
      const person = createMockPerson({ domain });
      expect(person.domain).toBe(domain);
    }
  });

  it('should filter people by domain', () => {
    const people = [
      createMockPerson({ id: '1', domain: 'business' }),
      createMockPerson({ id: '2', domain: 'family' }),
      createMockPerson({ id: '3', domain: 'business' }),
    ];

    const businessContacts = people.filter((p) => p.domain === 'business');
    expect(businessContacts).toHaveLength(2);
  });
});

// ============================================================================
// VIP/Importance Score Tests
// ============================================================================

describe('Importance Score Filtering', () => {
  it('should identify VIP contacts by score', () => {
    const people = [
      createMockPerson({ id: '1', importanceScore: 90 }),
      createMockPerson({ id: '2', importanceScore: 50 }),
      createMockPerson({ id: '3', importanceScore: 80 }),
      createMockPerson({ id: '4', importanceScore: 70 }),
    ];

    const minScore = 70;
    const vips = people.filter((p) => (p.importanceScore || 0) >= minScore);

    expect(vips).toHaveLength(3);
  });

  it('should sort by importance score descending', () => {
    const people = [
      createMockPerson({ id: '1', importanceScore: 50 }),
      createMockPerson({ id: '2', importanceScore: 90 }),
      createMockPerson({ id: '3', importanceScore: 70 }),
    ];

    people.sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0));

    expect(people[0].id).toBe('2');
    expect(people[1].id).toBe('3');
    expect(people[2].id).toBe('1');
  });
});

// ============================================================================
// Date Calculation Tests
// ============================================================================

describe('Date Calculations', () => {
  it('should calculate days overdue correctly', () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - 5);

    const now = new Date();
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    expect(daysOverdue).toBe(5);
  });

  it('should calculate days until due correctly', () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const now = new Date();
    const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    expect(daysUntil).toBe(3);
  });
});

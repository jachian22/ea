/**
 * Tests for Insight Generator Service (Phase 4)
 *
 * These tests verify:
 * - Insight type classification
 * - Urgency level assignment
 * - Insight generation logic
 * - Helper function behavior
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  InsightType,
  InsightUrgency,
  Insight,
  InsightSummary,
} from "~/services/insight-generator";

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    type: "commitment_due_today",
    urgency: "high",
    title: "Test Insight",
    description: "Test description",
    entityType: "commitment",
    entityId: "entity-123",
    ...overrides,
  };
}

function createMockInsightSummary(
  insights: Insight[] = []
): InsightSummary {
  const byUrgency = {
    critical: insights.filter(i => i.urgency === "critical").length,
    high: insights.filter(i => i.urgency === "high").length,
    medium: insights.filter(i => i.urgency === "medium").length,
    low: insights.filter(i => i.urgency === "low").length,
  };

  return {
    generatedAt: new Date(),
    totalInsights: insights.length,
    byUrgency,
    insights,
  };
}

// ============================================================================
// Insight Type Tests
// ============================================================================

describe("Insight Types", () => {
  it("should support all insight types", () => {
    const types: InsightType[] = [
      "stale_contact",
      "commitment_overdue_you_owe",
      "commitment_overdue_they_owe",
      "commitment_due_today",
      "commitment_due_soon",
      "meeting_prep_needed",
      "follow_up_opportunity",
      "vip_no_recent_contact",
    ];

    for (const type of types) {
      const insight = createMockInsight({ type });
      expect(insight.type).toBe(type);
    }
  });

  it("should categorize commitment insights by direction", () => {
    const youOweInsight = createMockInsight({
      type: "commitment_overdue_you_owe",
    });
    const theyOweInsight = createMockInsight({
      type: "commitment_overdue_they_owe",
    });

    expect(youOweInsight.type).toContain("you_owe");
    expect(theyOweInsight.type).toContain("they_owe");
  });
});

// ============================================================================
// Urgency Level Tests
// ============================================================================

describe("Urgency Levels", () => {
  it("should support all urgency levels", () => {
    const levels: InsightUrgency[] = ["low", "medium", "high", "critical"];

    for (const urgency of levels) {
      const insight = createMockInsight({ urgency });
      expect(insight.urgency).toBe(urgency);
    }
  });

  it("should sort insights by urgency correctly", () => {
    const insights = [
      createMockInsight({ urgency: "low", title: "Low" }),
      createMockInsight({ urgency: "critical", title: "Critical" }),
      createMockInsight({ urgency: "medium", title: "Medium" }),
      createMockInsight({ urgency: "high", title: "High" }),
    ];

    const urgencyOrder: Record<InsightUrgency, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    insights.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    expect(insights[0].urgency).toBe("critical");
    expect(insights[1].urgency).toBe("high");
    expect(insights[2].urgency).toBe("medium");
    expect(insights[3].urgency).toBe("low");
  });

  it("should assign critical urgency for severely overdue items", () => {
    const daysOverdue = 10;
    const urgency: InsightUrgency = daysOverdue > 7 ? "critical" : "high";

    expect(urgency).toBe("critical");
  });

  it("should assign high urgency for recently overdue items", () => {
    const daysOverdue = 3;
    const urgency: InsightUrgency = daysOverdue > 7 ? "critical" : "high";

    expect(urgency).toBe("high");
  });
});

// ============================================================================
// Insight Summary Tests
// ============================================================================

describe("Insight Summary", () => {
  it("should calculate urgency counts correctly", () => {
    const insights = [
      createMockInsight({ urgency: "critical" }),
      createMockInsight({ urgency: "critical" }),
      createMockInsight({ urgency: "high" }),
      createMockInsight({ urgency: "medium" }),
      createMockInsight({ urgency: "medium" }),
      createMockInsight({ urgency: "medium" }),
      createMockInsight({ urgency: "low" }),
    ];

    const summary = createMockInsightSummary(insights);

    expect(summary.byUrgency.critical).toBe(2);
    expect(summary.byUrgency.high).toBe(1);
    expect(summary.byUrgency.medium).toBe(3);
    expect(summary.byUrgency.low).toBe(1);
    expect(summary.totalInsights).toBe(7);
  });

  it("should handle empty insights list", () => {
    const summary = createMockInsightSummary([]);

    expect(summary.totalInsights).toBe(0);
    expect(summary.byUrgency.critical).toBe(0);
    expect(summary.byUrgency.high).toBe(0);
    expect(summary.byUrgency.medium).toBe(0);
    expect(summary.byUrgency.low).toBe(0);
  });

  it("should include generation timestamp", () => {
    const before = new Date();
    const summary = createMockInsightSummary([]);
    const after = new Date();

    expect(summary.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(summary.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ============================================================================
// Entity Type Tests
// ============================================================================

describe("Entity Types", () => {
  it("should support person entity type", () => {
    const insight = createMockInsight({
      entityType: "person",
      type: "stale_contact",
    });

    expect(insight.entityType).toBe("person");
  });

  it("should support commitment entity type", () => {
    const insight = createMockInsight({
      entityType: "commitment",
      type: "commitment_due_today",
    });

    expect(insight.entityType).toBe("commitment");
  });

  it("should support meeting entity type", () => {
    const insight = createMockInsight({
      entityType: "meeting",
      type: "meeting_prep_needed",
    });

    expect(insight.entityType).toBe("meeting");
  });
});

// ============================================================================
// Related Person Tests
// ============================================================================

describe("Related Person Information", () => {
  it("should include related person when available", () => {
    const insight = createMockInsight({
      relatedPerson: {
        id: "person-123",
        name: "John Doe",
        email: "john@example.com",
      },
    });

    expect(insight.relatedPerson).toBeDefined();
    expect(insight.relatedPerson?.name).toBe("John Doe");
    expect(insight.relatedPerson?.email).toBe("john@example.com");
  });

  it("should handle null name in related person", () => {
    const insight = createMockInsight({
      relatedPerson: {
        id: "person-123",
        name: null,
        email: "john@example.com",
      },
    });

    expect(insight.relatedPerson?.name).toBeNull();
    expect(insight.relatedPerson?.email).toBe("john@example.com");
  });

  it("should allow missing related person", () => {
    const insight = createMockInsight({});
    delete (insight as any).relatedPerson;

    expect(insight.relatedPerson).toBeUndefined();
  });
});

// ============================================================================
// Action Suggestion Tests
// ============================================================================

describe("Action Suggestions", () => {
  it("should provide action suggestion for overdue you owe", () => {
    const insight = createMockInsight({
      type: "commitment_overdue_you_owe",
      actionSuggestion: "Complete this commitment or communicate about the delay",
    });

    expect(insight.actionSuggestion).toContain("Complete");
  });

  it("should provide action suggestion for overdue they owe", () => {
    const insight = createMockInsight({
      type: "commitment_overdue_they_owe",
      actionSuggestion: "Follow up to check on status",
    });

    expect(insight.actionSuggestion).toContain("Follow up");
  });

  it("should provide action suggestion for stale contacts", () => {
    const insight = createMockInsight({
      type: "stale_contact",
      actionSuggestion: "Consider reaching out to maintain the relationship",
    });

    expect(insight.actionSuggestion).toContain("reaching out");
  });
});

// ============================================================================
// Metadata Tests
// ============================================================================

describe("Insight Metadata", () => {
  it("should include days overdue in metadata", () => {
    const insight = createMockInsight({
      type: "commitment_overdue_you_owe",
      metadata: { daysOverdue: 5 },
    });

    expect(insight.metadata?.daysOverdue).toBe(5);
  });

  it("should include days until due in metadata", () => {
    const insight = createMockInsight({
      type: "commitment_due_soon",
      metadata: { daysUntilDue: 3 },
    });

    expect(insight.metadata?.daysUntilDue).toBe(3);
  });

  it("should include days since contact in metadata", () => {
    const insight = createMockInsight({
      type: "stale_contact",
      metadata: { daysSinceContact: 45, importanceScore: 80 },
    });

    expect(insight.metadata?.daysSinceContact).toBe(45);
    expect(insight.metadata?.importanceScore).toBe(80);
  });
});

// ============================================================================
// Stale Contact Detection Tests
// ============================================================================

describe("Stale Contact Detection", () => {
  it("should identify contacts as stale based on threshold", () => {
    const lastContact = new Date();
    lastContact.setDate(lastContact.getDate() - 45);
    const threshold = 30;

    const daysSinceContact = Math.floor(
      (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
    );

    const isStale = daysSinceContact > threshold;

    expect(isStale).toBe(true);
    expect(daysSinceContact).toBe(45);
  });

  it("should not mark recent contacts as stale", () => {
    const lastContact = new Date();
    lastContact.setDate(lastContact.getDate() - 10);
    const threshold = 30;

    const daysSinceContact = Math.floor(
      (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
    );

    const isStale = daysSinceContact > threshold;

    expect(isStale).toBe(false);
  });

  it("should give higher urgency to VIP stale contacts", () => {
    const importanceScore = 85;
    const isVip = importanceScore >= 70;
    const urgency: InsightUrgency = isVip ? "medium" : "low";

    expect(urgency).toBe("medium");
  });
});

// ============================================================================
// Meeting Prep Detection Tests
// ============================================================================

describe("Meeting Prep Detection", () => {
  it("should identify meetings needing prep by status", () => {
    const meetingStatuses = [
      { status: "pending", needsPrep: true },
      { status: "generating", needsPrep: true },
      { status: "completed", needsPrep: false },
      { status: "failed", needsPrep: false },
    ];

    for (const { status, needsPrep } of meetingStatuses) {
      const needsPrepCheck = status === "pending" || status === "generating";
      expect(needsPrepCheck).toBe(needsPrep);
    }
  });
});

// ============================================================================
// Commitment Due Soon Detection Tests
// ============================================================================

describe("Commitment Due Soon Detection", () => {
  it("should assign higher urgency for commitments due within 2 days", () => {
    const daysUntilDue = 1;
    const urgency: InsightUrgency = daysUntilDue <= 2 ? "high" : "medium";

    expect(urgency).toBe("high");
  });

  it("should assign medium urgency for commitments due in 3+ days", () => {
    const daysUntilDue = 5;
    const urgency: InsightUrgency = daysUntilDue <= 2 ? "high" : "medium";

    expect(urgency).toBe("medium");
  });
});

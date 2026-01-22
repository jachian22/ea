import { eq } from "drizzle-orm";
import { database } from "~/db";
import {
  actionType,
  type ActionType,
  type CreateActionTypeData,
  type UpdateActionTypeData,
  type ActionCategory,
  type RiskLevel,
  type AuthorityLevel,
} from "~/db/schema";

/**
 * Built-in action types that should be seeded on first run
 */
export const BUILT_IN_ACTION_TYPES: CreateActionTypeData[] = [
  {
    name: "decline_spam_meeting",
    category: "calendar",
    description: "Automatically decline obvious spam meeting invites from unknown senders",
    riskLevel: "low",
    defaultAuthorityLevel: "full_auto",
    reversible: true,
  },
  {
    name: "decline_low_priority_meeting",
    category: "calendar",
    description: "Decline meeting invites that conflict with focus time or have low priority",
    riskLevel: "medium",
    defaultAuthorityLevel: "draft_approve",
    reversible: true,
  },
  {
    name: "reschedule_meeting",
    category: "calendar",
    description: "Propose rescheduling a meeting to a better time",
    riskLevel: "medium",
    defaultAuthorityLevel: "draft_approve",
    reversible: true,
  },
  {
    name: "protect_focus_time",
    category: "calendar",
    description: "Automatically protect focus time blocks by declining conflicts",
    riskLevel: "low",
    defaultAuthorityLevel: "full_auto",
    reversible: true,
  },
  {
    name: "reply_routine_email",
    category: "email",
    description: "Draft and send replies to routine emails (scheduling, acknowledgments)",
    riskLevel: "medium",
    defaultAuthorityLevel: "draft_approve",
    reversible: false,
  },
  {
    name: "reply_decline_request",
    category: "email",
    description: "Draft a polite decline to a request",
    riskLevel: "high",
    defaultAuthorityLevel: "ask_first",
    reversible: false,
  },
  {
    name: "follow_up_nudge",
    category: "email",
    description: "Send a follow-up email to nudge someone who hasn't responded",
    riskLevel: "low",
    defaultAuthorityLevel: "draft_approve",
    reversible: false,
  },
  {
    name: "snooze_commitment",
    category: "task",
    description: "Snooze a commitment reminder to a later time",
    riskLevel: "low",
    defaultAuthorityLevel: "full_auto",
    reversible: true,
  },
  {
    name: "complete_commitment",
    category: "task",
    description: "Mark a commitment as completed",
    riskLevel: "medium",
    defaultAuthorityLevel: "ask_first",
    reversible: true,
  },
  {
    name: "delegate_task",
    category: "task",
    description: "Delegate a task to someone else",
    riskLevel: "high",
    defaultAuthorityLevel: "ask_first",
    reversible: false,
  },
];

/**
 * Create a new action type
 */
export async function createActionType(
  data: CreateActionTypeData
): Promise<ActionType> {
  const [newActionType] = await database
    .insert(actionType)
    .values(data)
    .returning();

  return newActionType;
}

/**
 * Find an action type by ID
 */
export async function findActionTypeById(
  id: string
): Promise<ActionType | null> {
  const [result] = await database
    .select()
    .from(actionType)
    .where(eq(actionType.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find an action type by name
 */
export async function findActionTypeByName(
  name: string
): Promise<ActionType | null> {
  const [result] = await database
    .select()
    .from(actionType)
    .where(eq(actionType.name, name))
    .limit(1);

  return result || null;
}

/**
 * Find all action types
 */
export async function findAllActionTypes(): Promise<ActionType[]> {
  return database.select().from(actionType);
}

/**
 * Find action types by category
 */
export async function findActionTypesByCategory(
  category: ActionCategory
): Promise<ActionType[]> {
  return database
    .select()
    .from(actionType)
    .where(eq(actionType.category, category));
}

/**
 * Find action types by risk level
 */
export async function findActionTypesByRiskLevel(
  riskLevel: RiskLevel
): Promise<ActionType[]> {
  return database
    .select()
    .from(actionType)
    .where(eq(actionType.riskLevel, riskLevel));
}

/**
 * Update an action type
 */
export async function updateActionType(
  id: string,
  data: UpdateActionTypeData
): Promise<ActionType | null> {
  const [updated] = await database
    .update(actionType)
    .set(data)
    .where(eq(actionType.id, id))
    .returning();

  return updated || null;
}

/**
 * Delete an action type
 */
export async function deleteActionType(id: string): Promise<boolean> {
  const [deleted] = await database
    .delete(actionType)
    .where(eq(actionType.id, id))
    .returning();

  return deleted !== undefined;
}

/**
 * Seed the built-in action types if they don't exist
 */
export async function seedBuiltInActionTypes(): Promise<{
  created: number;
  existing: number;
}> {
  let created = 0;
  let existing = 0;

  for (const builtInType of BUILT_IN_ACTION_TYPES) {
    const existingType = await findActionTypeByName(builtInType.name);
    if (existingType) {
      existing++;
    } else {
      await createActionType(builtInType);
      created++;
    }
  }

  return { created, existing };
}

/**
 * Get the default authority level for an action type
 */
export async function getDefaultAuthorityLevel(
  actionTypeName: string
): Promise<AuthorityLevel | null> {
  const type = await findActionTypeByName(actionTypeName);
  return type?.defaultAuthorityLevel || null;
}

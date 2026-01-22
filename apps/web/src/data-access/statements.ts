import { eq, and, desc, sql } from 'drizzle-orm';
import { database } from '~/db';
import {
  bankAccount,
  bankStatement,
  statementRun,
  type BankAccount,
  type CreateBankAccountData,
  type UpdateBankAccountData,
  type BankStatement,
  type CreateBankStatementData,
  type StatementRun,
  type CreateStatementRunData,
  type UpdateStatementRunData,
  type StatementRunStatus,
  type BanksProcessedData,
} from '~/db/schema';

// ============================================================================
// Bank Account Operations
// ============================================================================

/**
 * Create a new bank account
 */
export async function createBankAccount(data: CreateBankAccountData): Promise<BankAccount> {
  const [newAccount] = await database.insert(bankAccount).values(data).returning();

  return newAccount;
}

/**
 * Find a bank account by ID
 */
export async function findBankAccountById(id: string): Promise<BankAccount | null> {
  const [result] = await database.select().from(bankAccount).where(eq(bankAccount.id, id)).limit(1);

  return result || null;
}

/**
 * Find bank accounts by user ID
 */
export async function findBankAccountsByUserId(userId: string): Promise<BankAccount[]> {
  const results = await database
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.userId, userId))
    .orderBy(bankAccount.bank, bankAccount.accountType);

  return results;
}

/**
 * Find a bank account by user, bank, account type, and last4
 */
export async function findBankAccountByDetails(
  userId: string,
  bank: string,
  accountType: string,
  last4: string
): Promise<BankAccount | null> {
  const [result] = await database
    .select()
    .from(bankAccount)
    .where(
      and(
        eq(bankAccount.userId, userId),
        eq(bankAccount.bank, bank),
        eq(bankAccount.accountType, accountType),
        eq(bankAccount.last4, last4)
      )
    )
    .limit(1);

  return result || null;
}

/**
 * Update a bank account
 */
export async function updateBankAccount(
  id: string,
  data: UpdateBankAccountData
): Promise<BankAccount | null> {
  const [updated] = await database
    .update(bankAccount)
    .set(data)
    .where(eq(bankAccount.id, id))
    .returning();

  return updated || null;
}

/**
 * Upsert a bank account - create if not exists, update if exists
 */
export async function upsertBankAccount(
  userId: string,
  bank: string,
  accountType: string,
  last4: string,
  nickname?: string
): Promise<BankAccount> {
  const existing = await findBankAccountByDetails(userId, bank, accountType, last4);

  if (existing) {
    if (nickname && nickname !== existing.nickname) {
      const updated = await updateBankAccount(existing.id, { nickname });
      return updated!;
    }
    return existing;
  }

  return createBankAccount({
    userId,
    bank,
    accountType,
    last4,
    nickname,
  });
}

/**
 * Delete a bank account
 */
export async function deleteBankAccount(id: string): Promise<boolean> {
  const [deleted] = await database.delete(bankAccount).where(eq(bankAccount.id, id)).returning();

  return deleted !== undefined;
}

// ============================================================================
// Bank Statement Operations
// ============================================================================

/**
 * Create a new bank statement record
 */
export async function createBankStatement(data: CreateBankStatementData): Promise<BankStatement> {
  const [newStatement] = await database.insert(bankStatement).values(data).returning();

  return newStatement;
}

/**
 * Find a bank statement by ID
 */
export async function findBankStatementById(id: string): Promise<BankStatement | null> {
  const [result] = await database
    .select()
    .from(bankStatement)
    .where(eq(bankStatement.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find statements by bank account ID
 */
export async function findStatementsByBankAccountId(
  bankAccountId: string
): Promise<BankStatement[]> {
  const results = await database
    .select()
    .from(bankStatement)
    .where(eq(bankStatement.bankAccountId, bankAccountId))
    .orderBy(desc(bankStatement.statementDate));

  return results;
}

/**
 * Find all statements for a user (across all accounts)
 */
export async function findStatementsByUserId(
  userId: string,
  limit: number = 100
): Promise<(BankStatement & { account: BankAccount })[]> {
  const results = await database
    .select({
      id: bankStatement.id,
      bankAccountId: bankStatement.bankAccountId,
      statementDate: bankStatement.statementDate,
      filePath: bankStatement.filePath,
      fileSize: bankStatement.fileSize,
      downloadedAt: bankStatement.downloadedAt,
      account: bankAccount,
    })
    .from(bankStatement)
    .innerJoin(bankAccount, eq(bankStatement.bankAccountId, bankAccount.id))
    .where(eq(bankAccount.userId, userId))
    .orderBy(desc(bankStatement.statementDate))
    .limit(limit);

  return results;
}

/**
 * Find a statement by account and date
 */
export async function findStatementByAccountAndDate(
  bankAccountId: string,
  statementDate: string
): Promise<BankStatement | null> {
  const [result] = await database
    .select()
    .from(bankStatement)
    .where(
      and(
        eq(bankStatement.bankAccountId, bankAccountId),
        eq(bankStatement.statementDate, statementDate)
      )
    )
    .limit(1);

  return result || null;
}

/**
 * Upsert a bank statement - create if not exists, update if exists
 */
export async function upsertBankStatement(
  bankAccountId: string,
  statementDate: string,
  filePath: string,
  fileSize?: number
): Promise<BankStatement> {
  const existing = await findStatementByAccountAndDate(bankAccountId, statementDate);

  if (existing) {
    const [updated] = await database
      .update(bankStatement)
      .set({
        filePath,
        fileSize,
        downloadedAt: new Date(),
      })
      .where(eq(bankStatement.id, existing.id))
      .returning();
    return updated;
  }

  return createBankStatement({
    bankAccountId,
    statementDate,
    filePath,
    fileSize,
  });
}

/**
 * Get statement counts by bank for a user
 */
export async function getStatementCountsByBank(
  userId: string
): Promise<{ bank: string; count: number }[]> {
  const results = await database
    .select({
      bank: bankAccount.bank,
      count: sql<number>`count(${bankStatement.id})::int`,
    })
    .from(bankStatement)
    .innerJoin(bankAccount, eq(bankStatement.bankAccountId, bankAccount.id))
    .where(eq(bankAccount.userId, userId))
    .groupBy(bankAccount.bank);

  return results;
}

// ============================================================================
// Statement Run Operations
// ============================================================================

/**
 * Create a new statement run
 */
export async function createStatementRun(data: CreateStatementRunData): Promise<StatementRun> {
  const [newRun] = await database.insert(statementRun).values(data).returning();

  return newRun;
}

/**
 * Find a statement run by ID
 */
export async function findStatementRunById(id: string): Promise<StatementRun | null> {
  const [result] = await database
    .select()
    .from(statementRun)
    .where(eq(statementRun.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find statement runs by user ID
 */
export async function findStatementRunsByUserId(
  userId: string,
  limit: number = 20
): Promise<StatementRun[]> {
  const results = await database
    .select()
    .from(statementRun)
    .where(eq(statementRun.userId, userId))
    .orderBy(desc(statementRun.startedAt))
    .limit(limit);

  return results;
}

/**
 * Find the latest statement run for a user
 */
export async function findLatestStatementRun(userId: string): Promise<StatementRun | null> {
  const [result] = await database
    .select()
    .from(statementRun)
    .where(eq(statementRun.userId, userId))
    .orderBy(desc(statementRun.startedAt))
    .limit(1);

  return result || null;
}

/**
 * Update a statement run
 */
export async function updateStatementRun(
  id: string,
  data: UpdateStatementRunData
): Promise<StatementRun | null> {
  const [updated] = await database
    .update(statementRun)
    .set(data)
    .where(eq(statementRun.id, id))
    .returning();

  return updated || null;
}

/**
 * Update the status of a statement run
 */
export async function updateStatementRunStatus(
  id: string,
  status: StatementRunStatus,
  errorMessage?: string
): Promise<StatementRun | null> {
  const updateData: UpdateStatementRunData = {
    status,
    errorMessage: status === 'failed' ? errorMessage : null,
    completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
  };

  return updateStatementRun(id, updateData);
}

/**
 * Complete a statement run with results
 */
export async function completeStatementRun(
  id: string,
  data: {
    status: StatementRunStatus;
    statementsDownloaded: number;
    banksProcessed: BanksProcessedData;
    errorMessage?: string;
  }
): Promise<StatementRun | null> {
  return updateStatementRun(id, {
    status: data.status,
    statementsDownloaded: data.statementsDownloaded,
    banksProcessed: data.banksProcessed,
    errorMessage: data.errorMessage,
    completedAt: new Date(),
  });
}

/**
 * Find running statement runs for a user (shouldn't normally happen)
 */
export async function findRunningStatementRuns(userId: string): Promise<StatementRun[]> {
  const results = await database
    .select()
    .from(statementRun)
    .where(and(eq(statementRun.userId, userId), eq(statementRun.status, 'running')));

  return results;
}

/**
 * Get statistics for a user's statement runs
 */
export async function getStatementRunStats(userId: string): Promise<{
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalStatementsDownloaded: number;
}> {
  const results = await database
    .select({
      status: statementRun.status,
      count: sql<number>`count(*)::int`,
      totalStatements: sql<number>`coalesce(sum(${statementRun.statementsDownloaded}), 0)::int`,
    })
    .from(statementRun)
    .where(eq(statementRun.userId, userId))
    .groupBy(statementRun.status);

  let totalRuns = 0;
  let successfulRuns = 0;
  let failedRuns = 0;
  let totalStatementsDownloaded = 0;

  for (const row of results) {
    totalRuns += row.count;
    totalStatementsDownloaded += row.totalStatements;
    if (row.status === 'completed') {
      successfulRuns = row.count;
    } else if (row.status === 'failed') {
      failedRuns = row.count;
    }
  }

  return {
    totalRuns,
    successfulRuns,
    failedRuns,
    totalStatementsDownloaded,
  };
}

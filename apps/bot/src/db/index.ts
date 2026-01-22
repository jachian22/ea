import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * PostgreSQL connection pool with proper resource management
 */
export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  // Connection pool limits
  max: 10, // Maximum number of clients in the pool
  min: 2, // Minimum number of idle clients
  // Timeouts
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established
  // Allow explicit release
  allowExitOnIdle: false,
});

// Log pool errors to prevent unhandled rejections
pool.on('error', (err) => {
  console.error('[Database] Unexpected pool error:', err);
});

export const database = drizzle(pool, { logger: false });

/**
 * Gracefully close the database connection pool
 */
export async function closeDatabase(): Promise<void> {
  console.log('[Database] Closing connection pool...');
  await pool.end();
  console.log('[Database] Connection pool closed');
}

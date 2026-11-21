import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';
import { createMockDb } from './mock.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

const dbUrl = (process.env.DATABASE_URL || '').trim();
const sqlHost = (process.env.SQL_HOST || '').trim();
const sqlDbName = (process.env.SQL_DB_NAME || '').trim();
const sqlUser = (process.env.SQL_USER || '').trim();

const hasDatabaseConfig = Boolean(dbUrl || (sqlHost && sqlDbName && sqlUser));

const useSslForConnectionString = Boolean(
  dbUrl &&
    (process.env.DATABASE_SSL === 'true' ||
      dbUrl.includes('supabase.co') ||
      dbUrl.includes('supabase.com') ||
      dbUrl.includes('sslmode=require'))
);

let mockDbInstance: NodePgDatabase<typeof schema> | null = null;
let pgDbInstance: NodePgDatabase<typeof schema> | null = null;
let activeDb: NodePgDatabase<typeof schema>;
let cloudDbConnected = false;
let postgresUnreachable = !hasDatabaseConfig;
let lastFailedProbeAt = 0;
let loggedFallbackWarning = false;
let lastDbError: string | null = hasDatabaseConfig
  ? null
  : 'PostgreSQL database environment variables are not configured.';

function getMockDb(): NodePgDatabase<typeof schema> {
  if (!mockDbInstance) {
    mockDbInstance = createMockDb() as NodePgDatabase<typeof schema>;
  }
  return mockDbInstance;
}

export const createPool = () => {
  if (!hasDatabaseConfig || postgresUnreachable) return undefined;
  if (!global._postgresPool) {
    global._postgresPool = new Pool(
      dbUrl
        ? {
            connectionString: dbUrl,
            ssl: useSslForConnectionString ? { rejectUnauthorized: false } : undefined,
            max: 10,
            connectionTimeoutMillis: 5000,
          }
        : {
            host: sqlHost,
            user: sqlUser,
            password: process.env.SQL_PASSWORD,
            database: sqlDbName,
            max: 10,
            connectionTimeoutMillis: 5000,
          }
    );

    global._postgresPool.on('error', (err) => {
      console.warn('Idle SQL pool client warning:', err?.message || err);
    });
  }
  return global._postgresPool;
};

export function isCloudDatabaseConfigured(): boolean {
  return hasDatabaseConfig;
}

export function isCloudDbReady(): boolean {
  return hasDatabaseConfig && cloudDbConnected && !postgresUnreachable;
}

export function getLastDbError(): string | null {
  return lastDbError;
}

export async function verifyCloudDatabaseConnection(force = false): Promise<boolean> {
  if (!hasDatabaseConfig) {
    cloudDbConnected = false;
    postgresUnreachable = true;
    activeDb = getMockDb();
    lastDbError = 'DATABASE_URL or SQL_HOST is not configured.';
    return false;
  }

  if (postgresUnreachable && !force && Date.now() - lastFailedProbeAt < 15_000) {
    return false;
  }

  postgresUnreachable = false;
  const pool = createPool();
  if (!pool) {
    cloudDbConnected = false;
    postgresUnreachable = true;
    activeDb = getMockDb();
    lastDbError = 'PostgreSQL connection pool could not be initialized.';
    return false;
  }

  try {
    await pool.query('SELECT 1');
    if (!pgDbInstance) {
      pgDbInstance = drizzle(pool, { schema });
    }
    activeDb = pgDbInstance;
    cloudDbConnected = true;
    postgresUnreachable = false;
    loggedFallbackWarning = false;
    lastDbError = null;
    return true;
  } catch (err: any) {
    const errMsg = err?.message || 'Unable to connect to PostgreSQL.';
    cloudDbConnected = false;
    postgresUnreachable = true;
    lastFailedProbeAt = Date.now();
    lastDbError = errMsg;
    activeDb = getMockDb();
    pgDbInstance = null;

    if (global._postgresPool) {
      const deadPool = global._postgresPool;
      global._postgresPool = undefined;
      deadPool.end().catch(() => {});
    }

    if (!loggedFallbackWarning) {
      loggedFallbackWarning = true;
      console.warn(
        `[NexusTekFusion] PostgreSQL unreachable (${errMsg}) — using in-memory fallback database.`
      );
    }
    return false;
  }
}

if (hasDatabaseConfig) {
  const pool = createPool();
  if (pool) {
    pgDbInstance = drizzle(pool, { schema });
    activeDb = pgDbInstance;
    cloudDbConnected = false;
  } else {
    activeDb = getMockDb();
    cloudDbConnected = false;
  }
} else {
  console.warn(
    '[NexusTekFusion] DATABASE_URL not configured — using in-memory fallback database until PostgreSQL is connected.'
  );
  activeDb = getMockDb();
  cloudDbConnected = false;
}

const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const target = activeDb as any;
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export { db };

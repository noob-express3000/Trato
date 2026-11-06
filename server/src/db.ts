import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const db = createClient({
  url: config.TURSO_DATABASE_URL,
  authToken: config.TURSO_AUTH_TOKEN
});

export function splitSqlStatements(sql: string): string[] {
  const lines = sql.split('\n');
  const out: string[] = [];
  let buffer = '';
  let inTrigger = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^CREATE TRIGGER/i.test(trimmed)) inTrigger = true;
    buffer += `${line}\n`;
    if (inTrigger) {
      if (/END;\s*$/i.test(trimmed)) {
        out.push(buffer.trim());
        buffer = '';
        inTrigger = false;
      }
      continue;
    }
    if (trimmed.endsWith(';')) {
      out.push(buffer.trim());
      buffer = '';
    }
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out;
}

export async function bootstrapDb() {
  await db.execute('PRAGMA foreign_keys = ON');
  const schemaPath = path.resolve(process.cwd(), 'src/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    await db.execute(statement);
  }
  await ensureUsersTableShape();
}

async function ensureUsersTableShape() {
  const tableInfo = await db.execute('PRAGMA table_info(users)');
  const columns = new Map(
    (tableInfo.rows as any[]).map((row) => [String(row.name), Number(row.notnull)])
  );
  if (columns.size === 0) return;

  const needsMigration =
    !columns.has('provider') ||
    !columns.has('provider_user_id') ||
    columns.get('password_hash') === 1;

  if (!needsMigration) {
    await db.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_identity ON users(provider, provider_user_id) WHERE provider_user_id IS NOT NULL"
    );
    return;
  }

  await db.execute('PRAGMA foreign_keys = OFF');
  await db.execute('BEGIN IMMEDIATE');
  try {
    await db.execute('ALTER TABLE users RENAME TO users_legacy');
    await db.execute(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        provider TEXT NOT NULL DEFAULT 'local',
        provider_user_id TEXT,
        business_name TEXT NOT NULL,
        local_currency TEXT NOT NULL DEFAULT 'USD',
        created_at TEXT NOT NULL
      )
    `);
    await db.execute(`
      INSERT INTO users (id, email, password_hash, provider, provider_user_id, business_name, local_currency, created_at)
      SELECT id, email, password_hash, 'local', NULL, business_name, local_currency, created_at
      FROM users_legacy
    `);
    await db.execute('DROP TABLE users_legacy');
    await db.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_identity ON users(provider, provider_user_id) WHERE provider_user_id IS NOT NULL"
    );
    await db.execute('COMMIT');
  } catch (error) {
    await db.execute('ROLLBACK');
    throw error;
  } finally {
    await db.execute('PRAGMA foreign_keys = ON');
  }
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  await db.execute('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    await db.execute('COMMIT');
    return result;
  } catch (error) {
    await db.execute('ROLLBACK');
    throw error;
  }
}

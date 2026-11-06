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
  const columns = await db.execute("PRAGMA table_info('users')");
  if (!columns.rows.some((column) => String((column as { name?: string }).name) === 'google_sub')) {
    await db.execute('ALTER TABLE users ADD COLUMN google_sub TEXT');
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)');
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

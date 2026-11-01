import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

const url = 'file::memory:';
const client = createClient({ url });

function splitSqlStatements(sql: string): string[] {
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

beforeAll(async () => {
  const schema = fs.readFileSync(path.resolve(process.cwd(), 'src/schema.sql'), 'utf8');
  for (const statement of splitSqlStatements(schema)) {
    await client.execute(statement);
  }
  await client.execute("INSERT INTO users (id, email, password_hash, business_name, local_currency, created_at) VALUES ('u1', 'a@b.com', 'x', 'Biz', 'USD', '2024-01-01T00:00:00.000Z')");
  await client.execute("INSERT INTO jobs (id, user_id, title, client_name, client_email, share_token, created_at) VALUES ('j1', 'u1', 't', 'c', 'c@e.com', 'tok', '2024-01-01T00:00:00.000Z')");
  await client.execute("INSERT INTO job_events (job_id, type, payload, actor, created_at) VALUES ('j1', 'JOB_CREATED', '{\"quote_usd_cents\":100}', 'contractor', '2024-01-01T00:00:00.000Z')");
});

afterAll(async () => {
  await client.close();
});

describe('job_events append-only', () => {
  it('rejects update and delete', async () => {
    await expect(client.execute("UPDATE job_events SET type='X' WHERE id=1")).rejects.toThrow();
    await expect(client.execute('DELETE FROM job_events WHERE id=1')).rejects.toThrow();
  });
});

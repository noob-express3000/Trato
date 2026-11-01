CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  business_name TEXT NOT NULL,
  local_currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  paypal_invoice_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('contractor','client','paypal','system')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, id);

CREATE TRIGGER IF NOT EXISTS job_events_no_update BEFORE UPDATE ON job_events
BEGIN SELECT RAISE(ABORT, 'job_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS job_events_no_delete BEFORE DELETE ON job_events
BEGIN SELECT RAISE(ABORT, 'job_events is append-only'); END;

CREATE TABLE IF NOT EXISTS processed_webhooks (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);

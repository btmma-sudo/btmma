-- Separate, private student portal. Apply to LIVE_TRIAL_DB only after review.
-- No existing trial, seminar, or registration tables are modified.
CREATE TABLE IF NOT EXISTS portal_accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS portal_students (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES portal_accounts(id),
  display_name TEXT NOT NULL,
  program TEXT NOT NULL,
  belt_rank TEXT NOT NULL DEFAULT 'Beginner',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_portal_students_account ON portal_students(account_id);
CREATE TABLE IF NOT EXISTS portal_lessons (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  program TEXT NOT NULL,
  stream_uid TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
);
CREATE TABLE IF NOT EXISTS portal_lesson_access (
  account_id TEXT NOT NULL REFERENCES portal_accounts(id),
  lesson_id TEXT NOT NULL REFERENCES portal_lessons(id),
  PRIMARY KEY (account_id, lesson_id)
);
-- Access is explicit per household. No lesson is published by default.

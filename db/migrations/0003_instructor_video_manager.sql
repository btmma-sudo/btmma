-- Instructor-only video library management (after 0002_student_portal.sql).
-- Additive changes to portal_* tables only; no trial, seminar, or billing changes.
CREATE TABLE IF NOT EXISTS portal_staff (
  account_id TEXT PRIMARY KEY REFERENCES portal_accounts(id),
  can_upload INTEGER NOT NULL DEFAULT 0 CHECK (can_upload IN (0,1)),
  can_publish INTEGER NOT NULL DEFAULT 0 CHECK (can_publish IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- All permissions start OFF; grant by verified account ID with manual D1 admin SQL.
ALTER TABLE portal_lessons ADD COLUMN belt_level TEXT NOT NULL DEFAULT 'All Levels';
ALTER TABLE portal_lessons ADD COLUMN created_by TEXT;
ALTER TABLE portal_lessons ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_lessons ADD COLUMN upload_status TEXT NOT NULL DEFAULT 'legacy';
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_lessons_stream_uid ON portal_lessons(stream_uid);
CREATE INDEX IF NOT EXISTS idx_portal_lessons_program_rank ON portal_lessons(published, program, belt_level);

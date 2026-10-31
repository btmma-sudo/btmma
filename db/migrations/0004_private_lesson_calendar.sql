-- Standalone private-lesson calendar. Apply to LIVE_TRIAL_DB only after 0002 and 0003.
-- All instructor management starts OFF. Grant permission to Coach David's
-- verified portal account explicitly in Cloudflare D1 before publishing slots:
-- UPDATE portal_staff SET can_manage_private_lessons=1 WHERE account_id='<verified-coach-account-id>';
ALTER TABLE portal_staff ADD COLUMN can_manage_private_lessons INTEGER NOT NULL DEFAULT 0
  CHECK (can_manage_private_lessons IN (0,1));

CREATE TABLE IF NOT EXISTS private_lesson_slots (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  local_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes IN (30,45,60,90)),
  is_open INTEGER NOT NULL DEFAULT 1 CHECK(is_open IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(local_date,local_time)
);
CREATE INDEX IF NOT EXISTS idx_private_slots_calendar ON private_lesson_slots(local_date,local_time,is_open);

CREATE TABLE IF NOT EXISTS private_lesson_bookings (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES private_lesson_slots(id),
  contact_name TEXT NOT NULL,
  student_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  program TEXT NOT NULL,
  goals TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Supports a cancelled appointment being rebooked without deleting its history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_private_active_slot ON private_lesson_bookings(slot_id) WHERE status='confirmed';
CREATE INDEX IF NOT EXISTS idx_private_bookings_status ON private_lesson_bookings(status, created_at);

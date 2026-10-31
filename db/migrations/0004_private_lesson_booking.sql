-- Private lessons only. Do not change trial checkout, seminar registrations, or portal tables.
-- Apply to the existing LIVE_TRIAL_DB before enabling private lessons.
-- No available dates are seeded: Coach David opens only the slots he can teach.
CREATE TABLE IF NOT EXISTS private_lesson_slots (
  id TEXT PRIMARY KEY,
  lesson_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (30,45,60,90)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','closed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  program TEXT,
  student_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  booked_at TEXT,
  UNIQUE (lesson_date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_private_lesson_date_status
  ON private_lesson_slots (lesson_date, status, start_time);

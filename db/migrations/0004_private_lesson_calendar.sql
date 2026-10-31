-- Standalone private-lesson calendar. This migration is staged; apply to LIVE_TRIAL_DB
-- only after existing portal migrations 0002 and 0003.
-- Instructor access starts OFF. Grant only to Coach David's verified portal account.
ALTER TABLE portal_staff ADD COLUMN can_manage_private_lessons INTEGER NOT NULL DEFAULT 0
  CHECK (can_manage_private_lessons IN (0,1));

-- Coach releases individual 30-minute blocks, which students can combine into
-- either a 30-minute or 60-minute appointment. Each block can only be used once.
CREATE TABLE IF NOT EXISTS private_lesson_slots (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  local_time TEXT NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1 CHECK(is_open IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(local_date,local_time)
);
CREATE INDEX IF NOT EXISTS idx_private_slots_calendar ON private_lesson_slots(local_date,local_time,is_open);

CREATE TABLE IF NOT EXISTS private_lesson_bookings (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES private_lesson_slots(id),
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes IN (30,60)),
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
CREATE INDEX IF NOT EXISTS idx_private_bookings_status ON private_lesson_bookings(status,created_at);

-- One unique claim per booked half-hour. On cancellation these rows are deleted
-- in the same D1 transaction as the booking status change, freeing the time.
CREATE TABLE IF NOT EXISTS private_lesson_booking_blocks (
  slot_id TEXT PRIMARY KEY REFERENCES private_lesson_slots(id),
  booking_id TEXT NOT NULL REFERENCES private_lesson_bookings(id)
);
CREATE INDEX IF NOT EXISTS idx_private_blocks_booking ON private_lesson_booking_blocks(booking_id);
CREATE TRIGGER IF NOT EXISTS private_block_must_be_open
BEFORE INSERT ON private_lesson_booking_blocks
BEGIN
  SELECT CASE WHEN NOT EXISTS
    (SELECT 1 FROM private_lesson_slots WHERE id=NEW.slot_id AND is_open=1)
    THEN RAISE(ABORT,'Private lesson block not open') END;
END;

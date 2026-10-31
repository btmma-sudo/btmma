-- Birthday-party inquiries and confirmed deposit reservations; independent of trial checkout.
CREATE TABLE IF NOT EXISTS birthday_party_requests (
  id TEXT PRIMARY KEY,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  birthday_name TEXT NOT NULL,
  age_group TEXT NOT NULL,
  guests INTEGER NOT NULL CHECK(guests BETWEEN 1 AND 75),
  package_interest TEXT NOT NULL,
  preferred_date TEXT NOT NULL,
  preferred_time TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','approved','checkout_open','deposit_paid','cancelled')),
  total_cents INTEGER,
  deposit_cents INTEGER,
  stripe_session_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_birthday_party_requests_date ON birthday_party_requests(preferred_date,preferred_time,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_birthday_party_confirmed_slot
ON birthday_party_requests(preferred_date,preferred_time)
WHERE status IN ('approved','checkout_open','deposit_paid');

-- Atomic two-hour availability protection (four 30-minute blocks per approved party).
-- Pricing rules are server-owned: $350 for up to 15 kids; $10 for each additional child.
CREATE TABLE IF NOT EXISTS birthday_party_confirmed_blocks (
  local_date TEXT NOT NULL,
  local_time TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES birthday_party_requests(id),
  PRIMARY KEY(local_date, local_time)
);

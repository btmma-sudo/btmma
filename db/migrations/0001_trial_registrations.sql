-- Burning Tree $29 trial checkout state (Cloudflare D1).
-- Apply only after provisioning the D1 database; no live checkout is enabled.
-- One student may have one reserved or completed $29 trial.
-- Canonical student_key must be assigned after identity review; never rely on
-- email alone. Store only a keyed HMAC identifier, not student PII.
CREATE TABLE IF NOT EXISTS trial_registrations (
  id TEXT PRIMARY KEY,
  airtable_record_id TEXT NOT NULL UNIQUE,
  student_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved', 'checkout_open', 'paid', 'cancelled', 'manual_review')),
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trial_registrations_state ON trial_registrations(state);

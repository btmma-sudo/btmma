-- Apply ONLY to LIVE_TRIAL_DB. No existing tables changed.
CREATE TABLE IF NOT EXISTS school_push_devices (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES portal_accounts(id),
 endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS school_push_devices_account ON school_push_devices(account_id);
CREATE TABLE IF NOT EXISTS school_announcements (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES portal_accounts(id),
 audience TEXT NOT NULL CHECK(audience IN ('school','test')),
 title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS school_push_deliveries (
 announcement_id TEXT NOT NULL REFERENCES school_announcements(id),
 device_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','processing','accepted','expired','failed','skipped')),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(announcement_id,device_id)
);
CREATE INDEX IF NOT EXISTS school_delivery_pending ON school_push_deliveries(announcement_id,status);

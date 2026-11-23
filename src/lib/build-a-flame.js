// Isolated Build a Flame workshop checkout. Never uses trial, seminar or portal rows.
export const FLAME_SOURCE = "btmma_build_a_flame_2026_v1";
export const FLAME_PRICE_CENTS = 5000;
export const FLAME_DATE = "2026-12-05";
export const FLAME_DEADLINE = Date.parse("2026-11-30T05:00:00Z"); // Nov 29, 11:59 PM EST.
export const FLAME_DURATION_MINUTES = 60;
export const FLAME_SESSIONS = ["one"];

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store", "x-content-type-options": "nosniff"
  } });
}
const clean = (v, max = 120) => typeof v === "string" ? v.trim().slice(0, max + 1) : "";
const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

// Confirmed single 60-minute workshop, Saturday December 5, 2026 (Eastern Time).
export function flameTimes(_env) {
  return { one: { time: "11:45", label: "Saturday, December 5 • 11:45 AM–12:45 PM ET" } };
}
export function checkoutReady(env) {
  return env.BUILD_A_FLAME_REGISTRATION_ENABLED === "true" &&
    !!env.LIVE_TRIAL_DB && !!env.TURNSTILE_SECRET_KEY &&
    /^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || ""));
}
export function normalizeSubmission(data) {
  const guardian = clean(data?.guardianName);
  const email = clean(data?.email, 254).toLowerCase();
  const phone = clean(data?.phone, 30);
  const session = clean(data?.session, 10);
  const children = Array.isArray(data?.children) ? data.children.map(c => ({
    name: clean(c?.name, 100), age: Number(c?.age)
  })) : [];
  const token = clean(data?.turnstileToken, 2500);
  if (guardian.length < 2 || guardian.length > 120 || /[<>\r\n]/.test(guardian) ||
      !validEmail(email) || !/^[+()\-. \d]{7,30}$/.test(phone) ||
      !FLAME_SESSIONS.includes(session) ||
      children.length < 1 || children.length > 6 ||
      children.some(c => c.name.length < 2 || c.name.length > 100 ||
        /[<>\r\n]/.test(c.name) || !Number.isInteger(c.age) || c.age < 1 || c.age > 17) ||
      data?.guardianConsent !== true || token.length < 5 ||
      token.length > 2500)
    return null;
  return { guardian, email, phone, session, children, qty: children.length, token };
}

const SQL = [
  "CREATE TABLE IF NOT EXISTS flame_workshop_registrations (id TEXT PRIMARY KEY, session_id TEXT NOT NULL CHECK(session_id IN ('one')), guardian_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, children_json TEXT NOT NULL, qty INTEGER NOT NULL CHECK(qty BETWEEN 1 AND 6), amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'held' CHECK(status IN ('held','checkout_open','paid','released')), stripe_session_id TEXT UNIQUE, stripe_payment_intent_id TEXT, hold_until INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS idx_flame_registration_status ON flame_workshop_registrations(status,created_at)"
];
export async function ensureFlameSchema(db) {
  for (const sql of SQL) await db.prepare(sql).run();
}
// Each guardian receives a distinct registration. There is NO overall workshop
// attendance cap; the per-checkout child-count limit is only for manageable entry.
export async function createFlameRegistration(db, registration, id, now) {
  const result = await db.prepare(
    "INSERT INTO flame_workshop_registrations (id,session_id,guardian_name,email,phone,children_json,qty,amount_cents,status,hold_until) " +
    "VALUES (?,?,?,?,?,?,?,?,'held',?)"
  ).bind(id, registration.session, registration.guardian, registration.email,
    registration.phone, JSON.stringify(registration.children),
    registration.qty, registration.qty * FLAME_PRICE_CENTS,
    now + 42 * 60).run();
  return result.meta?.changes === 1;
}
async function loadStripe(env, stripeId) {
  if (!/^cs_live_[A-Za-z0-9_]{10,180}$/.test(stripeId || "")) throw Error("Invalid Stripe checkout reference");
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(stripeId), {
    headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }
  });
  if (!r.ok) throw Error("Stripe checkout verification unavailable");
  return r.json();
}
// Fail closed if an expired hold might actually have been paid.
// Only release after Stripe certifies the checkout expired without payment.
export async function reconcileFlamePayment(env, sessionId) {
  if (!env.LIVE_TRIAL_DB || !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")))
    throw Error("Payment verification is not configured");
  const session = await loadStripe(env, sessionId);
  const m = session.metadata || {};
  if (m.btmma_source !== FLAME_SOURCE || !/^[a-f0-9-]{36}$/i.test(m.registration_id || ""))
    throw Error("Unrecognized workshop checkout");
  const row = await env.LIVE_TRIAL_DB.prepare(
    "SELECT * FROM flame_workshop_registrations WHERE id=? AND stripe_session_id=?"
  ).bind(m.registration_id, sessionId).first();
  if (!row) throw Error("Workshop reservation not found");
  if (session.livemode !== true || session.mode !== "payment" ||
      session.currency !== "usd" || session.client_reference_id !== row.id ||
      session.amount_total !== row.qty * FLAME_PRICE_CENTS ||
      Number(m.child_count) !== row.qty || m.session_id !== row.session_id ||
      m.event_date !== FLAME_DATE || row.amount_cents !== row.qty * FLAME_PRICE_CENTS)
    throw Error("Workshop checkout does not match the saved registration");
  if (session.payment_status !== "paid")
    return { confirmed: false, pending: true, session: row.session_id };
  await env.LIVE_TRIAL_DB.prepare(
    "UPDATE flame_workshop_registrations SET status='paid', stripe_payment_intent_id=?,paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND stripe_session_id=? AND status IN ('held','checkout_open','paid')"
  ).bind(typeof session.payment_intent === "string" ? session.payment_intent : null, row.id, sessionId).run();
  const updated = await env.LIVE_TRIAL_DB.prepare(
    "SELECT status FROM flame_workshop_registrations WHERE id=?"
  ).bind(row.id).first();
  if (updated?.status !== "paid") throw Error("Paid checkout requires manual registration reconciliation");
  return { confirmed: true, quantity: row.qty, session: row.session_id, amountCents: row.amount_cents };
}

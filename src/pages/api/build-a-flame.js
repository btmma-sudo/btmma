import {
  FLAME_SOURCE, FLAME_DATE, FLAME_CAPACITY, FLAME_PRICE_CENTS, FLAME_DEADLINE,
  FLAME_SESSIONS, flameTimes, checkoutReady, json, normalizeSubmission,
  ensureFlameSchema, seatsRemaining, holdFlameSeats, sweepFlameHolds,
  reconcileFlamePayment
} from "../../lib/build-a-flame.js";

export const prerender = false;
const secondsNow = () => Math.floor(Date.now() / 1000);
const deadlinePassed = () => Date.now() >= FLAME_DEADLINE;

async function turnstileVerified(env, request, token) {
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.set("remoteip", ip);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body
  });
  return result.ok && (await result.json()).success === true;
}
export async function GET({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  if (sessionId) {
    try {
      await ensureFlameSchema(env.LIVE_TRIAL_DB);
      const verified = await reconcileFlamePayment(env, sessionId);
      return json(verified);
    } catch (error) {
      console.error("Flame payment confirmation error", String(error).slice(0, 160));
      return json({ confirmed: false, error: "Payment verification is temporarily unavailable. Keep your Stripe receipt; contact 410-218-0894 before paying again." }, 503);
    }
  }
  const times = flameTimes(env);
  const ready = checkoutReady(env) && !deadlinePassed();
  const sessions = FLAME_SESSIONS.map(id => ({
    id, label: times?.[id]?.label || (id === "one" ? "Session 1 — time to be confirmed" : "Session 2 — time to be confirmed"),
    remaining: null
  }));
  if (env.LIVE_TRIAL_DB) {
    try {
      await ensureFlameSchema(env.LIVE_TRIAL_DB);
      if (ready) await sweepFlameHolds(env);
      for (const s of sessions) s.remaining = await seatsRemaining(env.LIVE_TRIAL_DB, s.id);
    } catch (error) {
      console.error("Flame inventory unavailable", String(error).slice(0, 160));
      return json({ ready: false, closed: true, sessions,
        message: "Registration is temporarily unavailable. Please call 410-218-0894." });
    }
  }
  return json({ ready, closed: deadlinePassed(), eventDate: FLAME_DATE,
    pricePerChildCents: FLAME_PRICE_CENTS, maxPerSession: FLAME_CAPACITY,
    sessions, message: deadlinePassed() ? "Online registration closed on November 29." :
      ready ? "" : "Online registration is being prepared. Session times will be announced before payment opens." });
}
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return json({ error: "Please register through the Burning Tree website." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return json({ error: "Invalid registration form." }, 415);
  if (Number(request.headers.get("content-length") || 0) > 6500)
    return json({ error: "Registration details are too long." }, 413);
  if (!checkoutReady(env))
    return json({ error: "Registration is being configured. No charge has been made. Call 410-218-0894." }, 503);
  if (deadlinePassed())
    return json({ error: "Registration closed November 29. Please call the studio." }, 409);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Invalid registration details." }, 400); }
  const row = normalizeSubmission(input);
  if (!row) return json({ error: "Please check the guardian details, child names and ages, and consent before continuing." }, 400);
  try {
    if (!await turnstileVerified(env, request, row.token))
      return json({ error: "Please complete the security check and try again." }, 403);
  } catch {
    return json({ error: "Security check unavailable. No charge has been made." }, 503);
  }

  try {
    await ensureFlameSchema(env.LIVE_TRIAL_DB);
    await sweepFlameHolds(env);
  } catch (error) {
    console.error("Flame reservation setup error", String(error).slice(0, 140));
    return json({ error: "Could not verify available seats. No payment was started. Please call 410-218-0894." }, 503);
  }
  const id = crypto.randomUUID();
  const now = secondsNow();
  let held;
  try { held = await holdFlameSeats(env.LIVE_TRIAL_DB, row, id, now); }
  catch { return json({ error: "Could not reserve seats. No payment was started." }, 503); }
  if (!held) return json({ error: "This session does not have enough open seats for the number of children selected. Try the other session." }, 409);

  const price = row.qty * FLAME_PRICE_CENTS;
  const params = new URLSearchParams({
    mode: "payment",
    "allowed_payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(FLAME_PRICE_CENTS),
    "line_items[0][price_data][product_data][name]": "Build a Flame — Confidence & Emotional Strength Workshop — " + flameTimes(env)[row.session].label,
    "line_items[0][quantity]": String(row.qty),
    client_reference_id: id,
    customer_email: row.email,
    expires_at: String(now + 35 * 60),
    "metadata[btmma_source]": FLAME_SOURCE,
    "metadata[registration_id]": id,
    "metadata[event_date]": FLAME_DATE,
    "metadata[session_id]": row.session,
    "metadata[child_count]": String(row.qty),
    "payment_intent_data[metadata][btmma_source]": FLAME_SOURCE,
    "payment_intent_data[metadata][registration_id]": id,
    success_url: origin + "/build-a-flame/?checkout=success&session_id={CHECKOUT_SESSION_ID}#confirmation",
    cancel_url: origin + "/build-a-flame/?checkout=cancelled#registration"
  });
  let stripe;
  try {
    stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": "btmma-build-a-flame-v1-" + id
      },
      body: params
    });
  } catch {
    // Unknown network state: retain the hold for reconciliation, never risk overselling.
    return json({ error: "Checkout connection interrupted. No payment was confirmed. Please contact 410-218-0894 before trying again." }, 503);
  }
  if (!stripe.ok) {
    let diagnostic = {};
    try { diagnostic = await stripe.json(); } catch {}
    console.error("Flame Stripe checkout rejected", stripe.status, String(diagnostic?.error?.code || "").slice(0, 70));
    if (stripe.status < 500) {
      await env.LIVE_TRIAL_DB.prepare("UPDATE flame_workshop_registrations SET status='released',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='held'").bind(id).run();
    }
    return json({ error: "Secure checkout is temporarily unavailable. No charge has been made. Call 410-218-0894." }, 503);
  }
  const checkout = await stripe.json();
  if (checkout.livemode !== true || !/^cs_live_/.test(checkout.id || "") ||
      !/^https:\/\/checkout\.stripe\.com\//.test(checkout.url || "") ||
      checkout.amount_total !== price) {
    // Keep the hold. Stripe could have created a chargeable session; staff must review.
    return json({ error: "Checkout could not be verified. Call 410-218-0894 before paying again." }, 503);
  }
  const saved = await env.LIVE_TRIAL_DB.prepare(
    "UPDATE flame_workshop_registrations SET status='checkout_open', stripe_session_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='held' AND stripe_session_id IS NULL"
  ).bind(checkout.id, id).run();
  if (saved.meta?.changes !== 1)
    return json({ error: "Your reservation requires verification. Please contact the studio before trying again." }, 503);
  return json({ url: checkout.url, reserved: true, quantity: row.qty, session: row.session });
}

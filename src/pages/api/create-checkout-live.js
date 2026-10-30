// Isolated LIVE Stripe Checkout. Disabled until the complete live registration
// reservation, verification and fulfillment workflows are ready.
export const prerender = false;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
async function sign(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  // Fail closed. The UI has no live payment button and this gate is unset.
  if (env.LIVE_CHECKOUT_ENABLED !== "true") return json({ error: "Live checkout is not yet available." }, 503);
  if (!env.LIVE_TRIAL_DB || !env.STRIPE_LIVE_WEBHOOK_SECRET ||
      !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")))
    return json({ error: "Live checkout is not configured." }, 503);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const grant = input?.grant;
  if (typeof grant !== "string" || grant.length > 500) return json({ error: "Registration approval required." }, 403);
  const [recordId, expiry, mac] = grant.split(".");
  if (!/^rec[A-Za-z0-9]+$/.test(recordId || "") || !/^\d{13}$/.test(expiry || "") ||
      !/^[a-f0-9]{64}$/.test(mac || "") || Number(expiry) < Date.now() ||
      Number(expiry) > Date.now() + 16 * 60 * 1000) return json({ error: "Registration approval expired." }, 403);
  const expected = await sign(env.STRIPE_LIVE_WEBHOOK_SECRET, recordId + "." + expiry);
  if (mac !== expected) return json({ error: "Invalid registration approval." }, 403);
  const row = await env.LIVE_TRIAL_DB.prepare("SELECT id, state, stripe_session_id FROM trial_registrations WHERE airtable_record_id = ?")
    .bind(recordId).first();
  if (!row || !["reserved", "checkout_open"].includes(row.state))
    return json({ error: "Student registration requires review." }, 409);
  if (row.stripe_session_id) {
    const verified = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(row.stripe_session_id), {
      headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }
    });
    if (!verified.ok) return json({ error: "Could not verify existing checkout." }, 503);
    const session = await verified.json();
    if (session.livemode === true && session.mode === "payment" && session.currency === "usd" && session.amount_total === 2900 && session.client_reference_id === row.id && session.status === "open" && session.payment_status !== "paid" && session.url)
      return json({ url: session.url });
    return json({ error: "Existing checkout requires review." }, 409);
  }
  const claim = await env.LIVE_TRIAL_DB.prepare(
    "UPDATE trial_registrations SET state='checkout_open', updated_at=CURRENT_TIMESTAMP WHERE id=? AND stripe_session_id IS NULL AND (state='reserved' OR (state='checkout_open' AND updated_at < datetime('now', '-60 seconds')))"
  ).bind(row.id).run();
  if (claim.meta?.changes !== 1) return json({ error: "Checkout already being prepared." }, 409);
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: "payment",
    // API version 2026-09-30.endive+ no longer accepts payment_method_types.
    // Filter Stripe's eligible methods to card while preserving supported wallets.
    // Cash App remains a separate, manually verified payment flow.
    "allowed_payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": "2900",
    "line_items[0][price_data][product_data][name]": "Burning Tree $29 New Student Special",
    "line_items[0][quantity]": "1",
    client_reference_id: row.id,
    "metadata[btmma_source]": "btmma_29_trial_live_v1",
    success_url: origin + "/29-trial/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/29-trial/?checkout=cancelled"
  });
  // Pre-fill email from the approved student record to avoid entering it twice.
  if (env.AIRTABLE_API_TOKEN && env.AIRTABLE_BASE_ID) {
    try {
      const contactResponse = await fetch(
        "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) +
        "/tblZCXEuRKXiPZlc7/" + encodeURIComponent(recordId),
        { headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN } }
      );
      if (contactResponse.ok) {
        const studentRecord = await contactResponse.json();
        const email = studentRecord?.fields?.Email;
        if (typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254)
          params.set("customer_email", email);
      }
    } catch { /* Stripe collects an email when auto-fill is unavailable. */ }
  }
  let result;
  try {
    result = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": "btmma-live-trial-v2-" + row.id
      },
      body: params
    });
  } catch { return json({ error: "Stripe Checkout is temporarily unavailable." }, 503); }
  if (!result.ok) {
    // Stripe supplies a machine-readable error code and a request ID. Report
    // only tightly sanitized diagnostics: never return Stripe credentials,
    // raw customer data, or the complete Stripe error payload to the browser.
    const stripeBody = await result.json().catch(() => ({}));
    const stripeError = stripeBody?.error || {};
    const safe = value => String(value || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 72);
    const type = safe(stripeError.type);
    const code = safe(stripeError.code) || (result.status === 403 ? "permission_denied" : "stripe_request_failed");
    const param = safe(stripeError.param);
    const requestId = safe(result.headers.get("request-id"));
    // Stripe sometimes returns only a human-readable message (no error.code).
    // Redact potential credentials, contact emails, IDs and URLs before sharing
    // a short diagnostic with the student or displaying it to studio staff.
    const safeMessage = String(stripeError.message || "")
      .replace(/(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]+/gi, "[redacted key]")
      .replace(/whsec_[A-Za-z0-9_-]+/gi, "[redacted secret]")
      .replace(/[A-Za-z0-9_.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted email]")
      .replace(/\b(?:acct|cus|pi|cs|req|price|prod|pm)_[A-Za-z0-9_-]{8,}\b/g, "[redacted reference]")
      .replace(/https?:\/\/[^\s]+/g, "[redacted URL]")
      .replace(/[\r\n\t]/g, " ")
      .slice(0, 240);
    console.error("Live Stripe checkout rejected", {
      status: result.status, type, code, param, requestId, message: safeMessage
    });
    await env.LIVE_TRIAL_DB.prepare(
      "UPDATE trial_registrations SET state='reserved', updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='checkout_open' AND stripe_session_id IS NULL"
    ).bind(row.id).run();
    // This reference tells staff which API request to inspect in Stripe Logs.
    const reason = type === "idempotency_error" ? "idempotency" :
      result.status === 401 ? "authentication" :
      result.status === 403 ? "permissions" :
      result.status === 429 ? "rate limit" :
      result.status >= 500 ? "Stripe service" : "configuration";
    return json({
      error: "Secure $29 checkout could not be opened (" + reason +
        "; HTTP: " + result.status + "; type: " + (type || "unknown") +
        "; code: " + code + (param ? "; parameter: " + param : "") +
        (requestId ? "; request: " + requestId : "") +
        "). " + (safeMessage ? "Stripe response: " + safeMessage + ". " : "") +
        "Please call (202) 368-4395 for assistance.",
      errorCode: code,
      stripeRequestId: requestId || null
    }, 503);
  }
  const session = await result.json();
  if (session.livemode !== true || !session.id?.startsWith("cs_live_") || !session.url)
    return json({ error: "Invalid live checkout response." }, 503);
  const saved = await env.LIVE_TRIAL_DB.prepare(
    "UPDATE trial_registrations SET stripe_session_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='checkout_open' AND stripe_session_id IS NULL"
  ).bind(session.id, row.id).run();
  if (saved.meta?.changes !== 1) return json({ error: "Checkout reconciliation needed." }, 503);
  return json({ url: session.url });
}

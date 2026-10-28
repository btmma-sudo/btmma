// Server-only Stripe Checkout session creator. Requires a signed eligibility grant.
// Test mode only. The browser never supplies the price or student identity.
export const prerender = false;
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
async function signature(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (!env.TRIAL_DB || !env.STRIPE_SECRET_KEY?.startsWith("sk_test_") || !env.STRIPE_WEBHOOK_SECRET)
    return json({ error: "Test checkout is not configured." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const grant = body?.grant;
  if (typeof grant !== "string" || grant.length > 500) return json({ error: "Registration approval required." }, 403);
  const [recordId, expires, mac] = grant.split(".");
  if (!/^rec[A-Za-z0-9]+$/.test(recordId || "") || !/^\d{10,13}$/.test(expires || "") ||
      !/^[a-f0-9]{64}$/.test(mac || "") || Number(expires) < Date.now() || Number(expires) > Date.now() + 16 * 60 * 1000)
    return json({ error: "Registration approval expired. Please register again." }, 403);
  const expected = await signature(env.STRIPE_WEBHOOK_SECRET, recordId + "." + expires);
  if (expected !== mac) return json({ error: "Invalid registration approval." }, 403);
  const row = await env.TRIAL_DB.prepare("SELECT id, state, stripe_session_id FROM trial_registrations WHERE airtable_record_id = ?").bind(recordId).first();
  if (!row || row.state === "paid" || row.state === "manual_review" || row.state === "cancelled")
    return json({ error: "Please contact the studio to verify this student's trial." }, 409);
  if (row.stripe_session_id) {
    const existing = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(row.stripe_session_id), {
      headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY }
    });
    if (!existing.ok) return json({ error: "Could not verify existing checkout. Please contact the studio." }, 503);
    const session = await existing.json();
    if (session.status === "open" && session.url && session.payment_status !== "paid")
      return json({ url: session.url });
    return json({ error: "This registration already has a checkout session. Please contact the studio." }, 409);
  }
  const claim = await env.TRIAL_DB.prepare("UPDATE trial_registrations SET state = 'checkout_open', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'reserved' AND stripe_session_id IS NULL")
    .bind(row.id).run();
  if (claim.meta?.changes !== 1) return json({ error: "Checkout is being prepared. Please try again shortly." }, 409);
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": "2900",
    "line_items[0][price_data][product_data][name]": "Burning Tree $29 New Student Special",
    "line_items[0][quantity]": "1",
    client_reference_id: row.id,
    success_url: origin + "/29-trial/?checkout=success",
    cancel_url: origin + "/29-trial/?checkout=cancelled"
  });
  let response;
  try {
    response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": "btmma-trial-" + row.id },
      body: params
    });
  } catch { return json({ error: "Stripe checkout is temporarily unavailable. Please contact the studio." }, 503); }
  if (!response.ok) {
    console.error("Stripe checkout creation failed", { status: response.status });
    return json({ error: "Unable to create checkout. Please contact the studio." }, 503);
  }
  const session = await response.json();
  if (!session.id?.startsWith("cs_test_") || !session.url) return json({ error: "Invalid Stripe checkout response." }, 503);
  await env.TRIAL_DB.prepare("UPDATE trial_registrations SET stripe_session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'checkout_open' AND stripe_session_id IS NULL")
    .bind(session.id, row.id).run();
  return json({ url: session.url });
}

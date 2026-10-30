// Isolated live payment webhook. Public live checkout is not enabled.
// Only reconcile signed, paid, verified checkout sessions tied to LIVE_TRIAL_DB.
export const prerender = false;
const reply = (message, status) => new Response(JSON.stringify({ message }), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
const encoder = new TextEncoder();
const constantTimeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (!env.STRIPE_LIVE_WEBHOOK_SECRET || !env.LIVE_TRIAL_DB || !env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID || !/^((sk|rk)_live_)/.test(String(env.STRIPE_LIVE_SECRET_KEY))) return reply("Webhook not configured", 503);
  const signature = request.headers.get("stripe-signature") || "";
  const timestamp = signature.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const signatures = signature.split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300 || signatures.length === 0) {
    return reply("Invalid webhook signature", 400);
  }
  const body = await request.text();
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.STRIPE_LIVE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp + "." + body)));
  const expected = Array.from(mac, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const verified = signatures.some((value) => /^[0-9a-f]{64}$/i.test(value) &&
    constantTimeEqual(encoder.encode(value.toLowerCase()), encoder.encode(expected)));
  if (!verified) return reply("Invalid webhook signature", 400);
  let event;
  try { event = JSON.parse(body); } catch { return reply("Invalid JSON", 400); }
  if (typeof event.id !== "string" || !event.id.startsWith("evt_")) return reply("Invalid event", 400);
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(event.type)) return reply("Ignored", 200);
  if (event.livemode !== true || !/^((sk|rk)_live_)/.test(String(env.STRIPE_LIVE_SECRET_KEY))) return reply("Live key required", 503);
  // Account-level webhook also receives Checkout from unrelated Stripe products.
  // Only this enrollment integration's signed Stripe events are ours.
  if (event.data?.object?.metadata?.btmma_source !== "btmma_29_trial_live_v1")
    return reply("Ignored unrelated checkout", 200);
  const sessionId = event.data?.object?.id;
  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_live_")) return reply("Invalid session", 400);
  // Only sessions reserved through the live student-specific checkout flow are eligible.
  const row = await env.LIVE_TRIAL_DB.prepare("SELECT id, airtable_record_id, state FROM trial_registrations WHERE stripe_session_id = ?").bind(sessionId).first();
  if (!row) return reply("Unrecognized checkout session", 503);
  const already = await env.LIVE_TRIAL_DB.prepare("SELECT event_id FROM stripe_webhook_events WHERE event_id = ?").bind(event.id).first();
  if (already) return reply("Already processed", 200);
  // Re-fetch from Stripe: never trust a browser redirect or unsigned session metadata.
  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId), {
    headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }
  });
  if (!stripeResponse.ok) return reply("Stripe verification unavailable", 503);
  const session = await stripeResponse.json();
  if (session.livemode !== true || session.mode !== "payment" ||
      session.currency !== "usd" || session.amount_total !== 2900 ||
      session.client_reference_id !== row.id) return reply("Session mismatch", 503);
  if (event.type === "checkout.session.async_payment_failed") {
    // Do not release the reservation automatically; staff must reconcile failed/late payments.
    await env.LIVE_TRIAL_DB.prepare("UPDATE trial_registrations SET state = 'manual_review', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state != 'paid'").bind(row.id).run();
  } else {
    if (session.payment_status !== "paid") return reply("Awaiting payment", 503);
    if (row.state !== "paid") {
      const url = "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/tblZCXEuRKXiPZlc7/" + encodeURIComponent(row.airtable_record_id);
      const current = await fetch(url, { headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN } });
      if (!current.ok) return reply("Airtable verification unavailable", 503);
      const student = await current.json();
      // Resolve canonical Airtable field IDs instead of relying on visible labels.
      // The existing checkbox may be spelled "Trial" or "Trail" in the base.
      const schemaResponse = await fetch(
        "https://api.airtable.com/v0/meta/bases/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/tables",
        { headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN } }
      );
      if (!schemaResponse.ok) {
        console.error("Airtable schema lookup failed", { status: schemaResponse.status });
        return reply("Airtable field lookup unavailable", 503);
      }
      const schema = await schemaResponse.json();
      const leadTable = schema.tables?.find(t => t.id === "tblZCXEuRKXiPZlc7");
      const paymentField = leadTable?.fields?.find(f => f.name.trim().toLowerCase() === "payment status");
      const checkoutSessionField = leadTable?.fields?.find(f => f.name.trim().toLowerCase() === "stripe checkout session id" && f.type === "singleLineText");
      const trialField = leadTable?.fields?.find(f =>
        /29/.test(f.name) && /tr(?:ia|ai)l/i.test(f.name) && /used/i.test(f.name)
      );
      if (!paymentField || !trialField || trialField.type !== "checkbox") {
        console.error("Airtable fulfillment fields not found", {
          paymentStatusFound: Boolean(paymentField),
          trialCheckboxFound: Boolean(trialField),
          trialFieldType: trialField?.type || "missing"
        });
        return reply("Airtable payment fields require review", 503);
      }
      if (student.fields?.[trialField.name] && student.fields?.[paymentField.name] !== "Paid")
        return reply("Student requires manual review", 503);
      const updated = await fetch(url, {
        method: "PATCH",
        headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { [trialField.id]: true, [paymentField.id]: "Paid", ...(checkoutSessionField ? { [checkoutSessionField.id]: sessionId } : {}) }, typecast: false })
      });
      if (!updated.ok) {
        let airtableError = {};
        try { airtableError = await updated.json(); } catch {}
        const type = airtableError?.error?.type;
        const detail = airtableError?.error?.message;
        console.error("Airtable payment update rejected", {
          status: updated.status,
          type: typeof type === "string" ? type.slice(0, 100) : "unknown",
          detail: typeof detail === "string" ? detail.slice(0, 300) : "unavailable"
        });
        return reply("Airtable update rejected: HTTP " + updated.status + "; type=" + (typeof type === "string" ? type.slice(0, 80) : "unknown") + "; field=" + (typeof detail === "string" ? detail.match(/(?:field|column)\s+[\x27\x22]?([\w $-]{1,60})/i)?.[1] || "not specified" : "unknown"), 503);
      }
      const paidUpdate = await env.LIVE_TRIAL_DB.prepare("UPDATE trial_registrations SET state = 'paid', stripe_payment_intent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stripe_session_id = ?")
        .bind(typeof session.payment_intent === "string" ? session.payment_intent : null, row.id, sessionId).run();
      if (paidUpdate.meta?.changes !== 1) return reply("Payment reconciliation pending", 503);
    }
  }
  await env.LIVE_TRIAL_DB.prepare("INSERT OR IGNORE INTO stripe_webhook_events (event_id, event_type) VALUES (?, ?)")
    .bind(event.id, event.type).run();
  return reply("Processed", 200);
}

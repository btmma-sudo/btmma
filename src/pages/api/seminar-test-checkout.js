import {
  SEMINAR_QA_TICKETS, SEMINAR_QA_SOURCE, SEMINAR_QA_EMAIL,
  seminarQaAirtable, seminarQaEnabled
} from "../../lib/seminar-test-checkout.js";
export const prerender = false;
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
export async function GET({ locals }) {
  const env = locals?.runtime?.env ?? {};
  return reply({ testOnly: true, ready: seminarQaEnabled(env) && Boolean(env.TURNSTILE_SECRET_KEY) });
}
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (!seminarQaEnabled(env) || !env.TURNSTILE_SECRET_KEY)
    return reply({ error: "The separate seminar test mode is not configured. No payment was attempted." }, 503);
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin)
    return reply({ error: "Start your test from the Burning Tree test page." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 3500)
    return reply({ error: "Test request too long." }, 413);
  let input;
  try { input = await request.json(); }
  catch { return reply({ error: "Invalid test request." }, 400); }
  const eventKey = typeof input?.event === "string" ? input.event : "";
  const ticketKey = typeof input?.ticket === "string" ? input.ticket : "";
  const event = SEMINAR_QA_TICKETS[eventKey];
  const ticket = event?.tickets[ticketKey];
  const count = input?.attendeeCount;
  if (!event || !ticket || !Number.isInteger(count) || count < 1 || count > 6)
    return reply({ error: "Select a valid seminar, ticket and simulated attendee count (1–6)." }, 400);
  const token = input?.turnstileToken;
  if (typeof token !== "string" || token.length < 5 || token.length > 2500)
    return reply({ error: "Complete the human verification first." }, 400);
  try {
    const data = new FormData();
    data.set("secret", env.TURNSTILE_SECRET_KEY);
    data.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) data.set("remoteip", ip);
    const validated = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: data
    });
    const verdict = validated.ok ? await validated.json() : null;
    if (!verdict?.success)
      return reply({ error: "Human verification expired or failed. Please retry." }, 403);
  } catch { return reply({ error: "Human verification service is unavailable." }, 503); }
  const total = ticket.cents * count;
  let record;
  try {
    const saved = await seminarQaAirtable(env, "", "POST", {
      records: [{ fields: {
        "Test Registration": "SEMINAR-TEST-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
        "Seminar": event.title + " (TEST ONLY)",
        "Ticket": ticket.title,
        "Test Email": SEMINAR_QA_EMAIL,
        "Simulated Attendee Names": Array.from({ length: count }, (_, i) => "Test Attendee " + (i + 1)).join("\n"),
        "Attendee Count": count,
        "Amount (Simulated)": total / 100,
        "Payment Status": "Awaiting test checkout",
        "Created At": new Date().toISOString(),
        "Notes": "Synthetic checkout only. No real attendance, paid seat, or signed seminar waiver. Live seminar records must not be modified."
      }}]
    });
    record = saved.records?.[0];
    if (!/^rec[A-Za-z0-9]{10,30}$/.test(record?.id || ""))
      throw new Error("Test record missing");
  } catch {
    return reply({ error: "Could not create the test registration in Airtable. No payment was attempted." }, 503);
  }
  const params = new URLSearchParams({
    mode: "payment",
    "allowed_payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(ticket.cents),
    "line_items[0][price_data][product_data][name]": "TEST ONLY — " + event.title + " — " + ticket.title,
    "line_items[0][quantity]": String(count),
    customer_email: SEMINAR_QA_EMAIL,
    client_reference_id: record.id,
    "metadata[btmma_source]": SEMINAR_QA_SOURCE,
    "metadata[event]": eventKey,
    "metadata[ticket]": ticketKey,
    "metadata[attendee_count]": String(count),
    "metadata[test_record_id]": record.id,
    success_url: origin + "/seminar-payment-test/?qa_checkout=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/seminar-payment-test/?qa_checkout=cancelled"
  });
  try {
    const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": "btmma-seminar-test-" + record.id
      },
      body: params
    });
    if (!stripe.ok) {
      console.error("Seminar QA Stripe checkout rejected", stripe.status);
      return reply({ error: "Could not create a Stripe test checkout. No real payment was attempted." }, 503);
    }
    const session = await stripe.json();
    if (!/^cs_test_[A-Za-z0-9_]+$/.test(session.id || "") || session.livemode !== false ||
        !/^https:\/\/checkout\.stripe\.com\//.test(session.url || ""))
      return reply({ error: "Stripe did not return a verified TEST checkout." }, 503);
    await seminarQaAirtable(env, "/" + encodeURIComponent(record.id), "PATCH", {
      fields: { "Payment Status": "Test checkout opened", "Stripe Test Session ID": session.id }
    });
    return reply({ testOnly: true, checkoutUrl: session.url });
  } catch {
    return reply({ error: "Test checkout could not be completed. No live payment was attempted." }, 503);
  }
}

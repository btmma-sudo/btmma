import { pnoQaEnabled, pnoQaAirtable, PNO_QA_SOURCE, PNO_QA_CENTS } from "../../lib/parents-night-out-qa.js";
export const prerender = false;
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
export async function GET({ locals }) {
  const env = locals?.runtime?.env ?? {};
  return reply({
    testOnly: true,
    ready: pnoQaEnabled(env) && Boolean(env.TURNSTILE_SECRET_KEY),
    message: "Test checkout is separate from live customer payments."
  });
}
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (!pnoQaEnabled(env) || !env.TURNSTILE_SECRET_KEY)
    return reply({ error: "Stripe test checkout has not been enabled in Cloudflare. No charge was attempted." }, 503);
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin)
    return reply({ error: "Submit the test from the Burning Tree website." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 3000)
    return reply({ error: "Test request too large." }, 413);
  let data;
  try { data = await request.json(); } catch { return reply({ error: "Invalid test request." }, 400); }
  const count = Number(data?.childCount);
  const token = data?.turnstileToken;
  if (!Number.isInteger(count) || count < 1 || count > 6)
    return reply({ error: "Choose 1–6 simulated children." }, 400);
  if (typeof token !== "string" || token.length < 5 || token.length > 2500)
    return reply({ error: "Complete the security check before test checkout." }, 400);
  try {
    const body = new FormData();
    body.set("secret", env.TURNSTILE_SECRET_KEY);
    body.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) body.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const checked = response.ok ? await response.json() : null;
    if (!checked?.success) return reply({ error: "Security check failed." }, 403);
  } catch { return reply({ error: "Security verification unavailable." }, 503); }
  let record;
  try {
    const created = await pnoQaAirtable(env, "", "POST", { records: [{
      fields: {
        "Test Registration": "PNO-TEST-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
        "Event": "Parents Night Out (TEST ONLY)",
        "Test Email": "pno-qa@example.com",
        "Child Count": count,
        "Amount (Simulated)": count * PNO_QA_CENTS / 100,
        "Payment Status": "Awaiting test checkout",
        "Test Created": new Date().toISOString(),
        "Notes": "Fake/simulated registration. Not a real seat, paid admission, or revenue."
      }
    }] });
    record = created.records?.[0];
    if (!/^rec[A-Za-z0-9]{10,30}$/.test(record?.id || ""))
      throw new Error("Test record not saved");
  } catch {
    return reply({ error: "Airtable test record could not be created. No test checkout started." }, 503);
  }
  const params = new URLSearchParams({
    mode: "payment",
    "allowed_payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(PNO_QA_CENTS),
    "line_items[0][price_data][product_data][name]": "TEST ONLY — Parents Night Out $35 per child (simulated)",
    "line_items[0][quantity]": String(count),
    customer_email: "pno-qa@example.com",
    client_reference_id: record.id,
    "metadata[btmma_source]": PNO_QA_SOURCE,
    "metadata[test_record_id]": record.id,
    "metadata[child_count]": String(count),
    success_url: origin + "/parents-night-out-test/?qa_checkout=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/parents-night-out-test/?qa_checkout=cancelled"
  });
  try {
    const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.STRIPE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": "btmma-pno-test-" + record.id
      },
      body: params
    });
    if (!stripe.ok) {
      console.error("Stripe QA checkout creation failed", stripe.status);
      return reply({ error: "Stripe test-mode session could not be created. No real charge occurred." }, 503);
    }
    const session = await stripe.json();
    if (session.livemode !== false || !/^cs_test_[A-Za-z0-9_]+$/.test(session.id || "") ||
        !/^https:\/\/checkout\.stripe\.com\//.test(session.url || ""))
      return reply({ error: "Stripe did not return an authenticated test-only checkout." }, 503);
    await pnoQaAirtable(env, "/" + encodeURIComponent(record.id), "PATCH", {
      fields: { "Payment Status": "Test checkout opened", "Stripe Test Session ID": session.id }
    });
    return reply({ testOnly: true, checkoutUrl: session.url });
  } catch {
    return reply({ error: "Test checkout is unavailable. No real charge occurred." }, 503);
  }
}

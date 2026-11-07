import { PNO_TABLE, PNO_SOURCE, PNO_UNIT_CENTS, PNO_EVENT, pnoAirtable } from "../../lib/parents-night-out.js";
export const prerender = false;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const val = (v, max = 120) => typeof v === "string" ? v.trim().slice(0, max + 1) : "";
const goodName = s => s.length >= 2 && s.length <= 120 && !/[<>\r\n]/.test(s);
const goodPhone = s => /^[+()\-. \d]{7,30}$/.test(s);
const CLOSE_AT = Date.parse("2026-11-20T23:00:00Z"); // 6 PM Eastern, November 20.

export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return json({ error: "Please register using the Burning Tree website." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 8500)
    return json({ error: "Your form is too long." }, 413);
  if (Date.now() >= CLOSE_AT)
    return json({ error: "Online registration for November 20 has closed. Contact the studio with questions." }, 409);
  if (env.LIVE_CHECKOUT_ENABLED !== "true" ||
      !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")) ||
      !env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_TOKEN || !env.TURNSTILE_SECRET_KEY)
    return json({ error: "Secure event registration is currently unavailable. Call or text 410-218-0894." }, 503);

  let form;
  try { form = await request.json(); }
  catch { return json({ error: "Invalid registration details." }, 400); }

  const guardian = val(form?.guardian);
  const email = val(form?.email, 254).toLowerCase();
  const phone = val(form?.phone, 30);
  const emergencyContact = val(form?.emergencyContact);
  const emergencyPhone = val(form?.emergencyPhone, 30);
  const pickup = val(form?.pickup);
  const notes = val(form?.careNotes, 500);
  const children = form?.children;
  if (!goodName(guardian) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 || !goodPhone(phone) ||
      !goodName(emergencyContact) || !goodPhone(emergencyPhone) ||
      !goodName(pickup) || notes.length > 500 || /[<>]/.test(notes) ||
      !Array.isArray(children) || children.length < 1 || children.length > 6 ||
      form?.consent !== true ||
      children.some(c => !goodName(val(c?.name, 120)) ||
        !Number.isInteger(c?.age) || c.age < 1 || c.age > 17))
    return json({ error: "Please complete the guardian, child, emergency-contact, and pickup details and confirm guardian authorization." }, 400);
  const names = children.map(c => c.name.trim());
  if (new Set(names.map(n => n.toLowerCase())).size !== names.length)
    return json({ error: "Please enter each child only once." }, 400);

  const token = val(form?.turnstileToken, 2500);
  if (token.length < 5 || token.length > 2500)
    return json({ error: "Please complete the security check." }, 400);
  try {
    const payload = new FormData();
    payload.set("secret", env.TURNSTILE_SECRET_KEY);
    payload.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) payload.set("remoteip", ip);
    const verified = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: payload
    });
    const check = verified.ok ? await verified.json() : null;
    if (!check?.success) return json({ error: "Security check failed or expired. Please try again." }, 403);
  } catch { return json({ error: "The security check is temporarily unavailable." }, 503); }

  // Always create the private registration first; do not send a customer to a
  // payment page unless all guardian and emergency details are saved in Airtable.
  const total = children.length * PNO_UNIT_CENTS;
  let record;
  try {
    const saved = await pnoAirtable(env, "", "POST", { records: [{ fields: {
      Registration: "PNO-2026-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      Event: PNO_EVENT,
      "Event Date": "2026-11-20",
      "Guardian Name": guardian,
      "Guardian Email": email,
      "Guardian Phone": phone,
      "Children and Ages": children.map(c => c.name.trim() + " — age " + c.age).join("\n"),
      "Child Count": children.length,
      "Emergency Contact": emergencyContact,
      "Emergency Phone": emergencyPhone,
      "Authorized Pickup": pickup,
      "Care Notes": notes,
      "Guardian Consent": true,
      "Total Due": total / 100,
      "Payment Status": "Awaiting checkout",
      "Payment Method": "Stripe card / wallet",
      "Registered At": new Date().toISOString()
    }}] });
    record = saved.records?.[0];
    if (!/^rec[A-Za-z0-9]{10,30}$/.test(record?.id || ""))
      throw new Error("Missing saved registration");
  } catch {
    return json({ error: "We could not save your event registration, and no payment was started. Please try again." }, 503);
  }

  const params = new URLSearchParams({
    mode: "payment",
    "allowed_payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(PNO_UNIT_CENTS),
    "line_items[0][price_data][product_data][name]": "Parents' Night Out — November 20, 2026 — 6–9 PM (per child)",
    "line_items[0][quantity]": String(children.length),
    customer_email: email,
    client_reference_id: record.id,
    "metadata[btmma_source]": PNO_SOURCE,
    "metadata[registration_id]": record.id,
    "metadata[child_count]": String(children.length),
    "payment_intent_data[metadata][btmma_source]": PNO_SOURCE,
    "payment_intent_data[metadata][registration_id]": record.id,
    success_url: origin + "/seminars/?pno_checkout=success&session_id={CHECKOUT_SESSION_ID}#parents-night-out-registration",
    cancel_url: origin + "/seminars/?pno_checkout=cancelled#parents-night-out-registration"
  });
  try {
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": "btmma-pno-" + record.id },
      body: params
    });
    if (!stripeResponse.ok) {
      const detail = await stripeResponse.json().catch(() => ({}));
      console.error("Parents Night Out Stripe create failed", stripeResponse.status, detail?.error?.code || "");
      return json({ error: "Your registration is saved, but checkout could not open. No payment was taken. Contact 410-218-0894 before resubmitting." }, 503);
    }
    const session = await stripeResponse.json();
    if (session.livemode !== true || !/^cs_live_/.test(session.id || "") ||
        !/^https:\/\/checkout\.stripe\.com\//.test(session.url || ""))
      return json({ error: "Checkout could not be verified. Please call 410-218-0894 before paying." }, 503);

    await pnoAirtable(env, "/" + encodeURIComponent(record.id), "PATCH", {
      fields: { "Payment Status": "Pending payment", "Stripe Checkout Session ID": session.id }
    });
    return json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Parents Night Out checkout setup failed", String(err).slice(0, 140));
    return json({ error: "Your registration may be saved but checkout is not ready. Contact 410-218-0894 before trying to pay again." }, 503);
  }
}

// Separate private-coaching checkout; deliberately does not touch the $29 trial or seminar systems.
export const prerender = false;

const PACKAGES = Object.freeze({
  basic: { name: "Basic", sessions: 4, cents: 24900 },
  advanced: { name: "Advanced", sessions: 6, cents: 39900 },
  elite: { name: "Elite", sessions: 8, cents: 49900 },
  mastery: { name: "Mastery", sessions: 10, cents: 79900 }
});
const TABLE = "tbl426qWjMZgEH1ss";
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const value = (v, limit = 120) => typeof v === "string" ? v.trim().slice(0, limit + 1) : "";

async function airtable(env, path, method, body) {
  const r = await fetch("https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" + TABLE + path, {
    method,
    headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!r.ok) throw new Error("Airtable order request failed " + r.status);
  return r.json();
}
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return json({ error: "Please register using the Burning Tree website." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 5000)
    return json({ error: "Form submission is too long." }, 413);
  if (env.LIVE_CHECKOUT_ENABLED !== "true" || !env.AIRTABLE_BASE_ID ||
      !env.AIRTABLE_API_TOKEN || !env.TURNSTILE_SECRET_KEY)
    return json({ error: "Private lesson registration is temporarily unavailable. Please text 410-218-0894." }, 503);

  let data;
  try { data = await request.json(); } catch { return json({ error: "Invalid registration details." }, 400); }
  const pack = Object.hasOwn(PACKAGES, data?.package) ? PACKAGES[data.package] : null;
  const method = data?.paymentMethod;
  const student = value(data?.studentName);
  const contact = value(data?.contactName);
  const email = value(data?.email, 254);
  const phone = value(data?.phone, 30);
  const martialArt = value(data?.martialArt, 70);
  const goals = value(data?.goals, 600);
  const preferred = value(data?.preferredTime, 240);
  const token = value(data?.turnstileToken, 2500);
  if (!pack || !["card", "apple", "cashapp", "zelle"].includes(method))
    return json({ error: "Choose a package and payment option." }, 400);
  if (student.length < 2 || student.length > 120 || /[<>\r\n]/.test(student) ||
      contact.length < 2 || contact.length > 120 || /[<>\r\n]/.test(contact) ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^[+()\- .\d]{7,30}$/.test(phone) ||
      !["Kenpo Karate", "Muay Thai", "Wing Chun", "Self-Defense", "Competition Prep", "Not sure yet"].includes(martialArt) ||
      goals.length > 600 || /[<>]/.test(goals) || preferred.length > 240 || /[<>]/.test(preferred))
    return json({ error: "Check the student, contact, program and schedule details." }, 400);
  if (token.length < 5 || token.length > 2500)
    return json({ error: "Please complete the security check before selecting payment." }, 400);

  // Turnstile is verified before any record is created or payment attempted.
  try {
    const form = new FormData();
    form.set("secret", env.TURNSTILE_SECRET_KEY);
    form.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) form.set("remoteip", ip);
    const checked = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const proof = checked.ok ? await checked.json() : null;
    if (!proof?.success) return json({ error: "Security check expired or failed. Please try again." }, 403);
  } catch { return json({ error: "Security verification is unavailable. Try again shortly." }, 503); }

  if (["apple", "card"].includes(method) &&
      !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")))
    return json({ error: "Secure card checkout is not configured. Please text 410-218-0894." }, 503);

  const manual = method === "cashapp" || method === "zelle";
  const orderName = "Private " + pack.name + " — " + student;
  let record;
  try {
    const created = await airtable(env, "", "POST", { records: [{ fields: {
      "Order": orderName,
      "Student Name": student,
      "Contact Name": contact,
      "Contact Email": email,
      "Contact Phone": phone,
      "Package": pack.name,
      "Sessions": pack.sessions,
      "Amount": pack.cents / 100,
      "Martial Art": martialArt,
      "Goals and Schedule": (goals ? "Goals: " + goals + "\n" : "") + (preferred ? "Preferred times: " + preferred : ""),
      "Payment Method": method === "cashapp" ? "Cash App" : method === "zelle" ? "Zelle" : "Stripe card/Apple Pay",
      "Payment Status": manual ? "Awaiting manual verification" : "Awaiting checkout",
      "Order Notes": manual ? "Do not mark paid until Coach David verifies the transfer. Customer must text receipt to 410-218-0894." : "Stripe payment must be verified against the live Checkout Session."
    }}] });
    record = created.records?.[0];
    if (!/^rec[A-Za-z0-9]+$/.test(record?.id || "")) throw new Error("Missing order");
  } catch (error) {
    console.error("Private coaching order save failed", String(error).slice(0, 100));
    return json({ error: "We could not save your request. No payment has started; please text 410-218-0894." }, 503);
  }

  if (manual) return json({
    saved: true, pending: true, orderId: record.id,
    paymentMethod: method, package: pack.name, amount: pack.cents / 100,
    message: "Your request is saved. Payment will be confirmed manually after we verify your receipt."
  });

  const params = new URLSearchParams({
    mode: "payment",
    "allowed_payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(pack.cents),
    "line_items[0][price_data][product_data][name]": "Burning Tree Private Coaching — " + pack.name + " (" + pack.sessions + " × 60-minute sessions)",
    "line_items[0][quantity]": "1",
    customer_email: email,
    client_reference_id: record.id,
    "metadata[btmma_source]": "btmma_private_coaching_v1",
    "metadata[order_id]": record.id,
    "metadata[package]": data.package,
    "metadata[sessions]": String(pack.sessions),
    "payment_intent_data[metadata][btmma_source]": "btmma_private_coaching_v1",
    "payment_intent_data[metadata][order_id]": record.id,
    success_url: origin + "/private-lessons/?checkout=success&session_id={CHECKOUT_SESSION_ID}#payment-result",
    cancel_url: origin + "/private-lessons/?checkout=cancelled#booking"
  });
  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: {
        Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": "btmma-private-v1-" + record.id
      }, body: params
    });
    if (!r.ok) {
      const detail = await r.json().catch(() => ({}));
      console.error("Private coaching Stripe issue", r.status, String(detail?.error?.code || "").slice(0, 60));
      return json({ error: "Your request was saved, but secure checkout could not start. Do not send a second request; please text 410-218-0894.", orderId: record.id }, 503);
    }
    const session = await r.json();
    if (session.livemode !== true || !/^cs_live_/.test(session.id || "") ||
        !/^https:\/\/checkout\.stripe\.com\//.test(session.url || ""))
      return json({ error: "Checkout could not be verified. Contact Coach David before making another payment.", orderId: record.id }, 503);
    try {
      await airtable(env, "/" + record.id, "PATCH", { fields: {
        "Payment Status": "Checkout started", "Stripe Session ID": session.id
      } });
    } catch (error) {
      console.error("Private coaching Stripe session record sync pending", String(error).slice(0, 80));
    }
    return json({ saved: true, url: session.url });
  } catch {
    return json({ error: "Checkout connection failed. Your request is saved; text 410-218-0894 before trying again.", orderId: record.id }, 503);
  }
}

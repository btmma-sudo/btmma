// Standalone donations for Burning Tree seminar supporters.
// Deliberately does not issue seminar tickets, reserve seats, create $29 leads,
// change seminar waiver status, or touch any preexisting Stripe webhooks.
export const prerender = false;
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const purposes = {
  general: "Support Burning Tree Mixed Martial Arts",
  united: "Support United by Purpose fundraising",
  nerve: "Support Striking a Nerve seminar"
};
const MIN_CENTS = 500;
const MAX_CENTS = 500000;

export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (env.LIVE_CHECKOUT_ENABLED !== "true" ||
      !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")) ||
      !env.TURNSTILE_SECRET_KEY)
    return reply({ error: "Online card donations are unavailable. Please contact Coach David at 410-218-0894." }, 503);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return reply({ error: "Please donate from the Burning Tree website." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 3000)
    return reply({ error: "Donation request is too long." }, 413);
  let input;
  try { input = await request.json(); }
  catch { return reply({ error: "Invalid donation request." }, 400); }
  const cents = input?.amountCents;
  const purpose = input?.purpose;
  const name = typeof input?.donorName === "string" ? input.donorName.trim() : "";
  const email = typeof input?.donorEmail === "string" ? input.donorEmail.trim() : "";
  if (!Number.isSafeInteger(cents) || cents < MIN_CENTS || cents > MAX_CENTS ||
      typeof purpose !== "string" || !Object.hasOwn(purposes, purpose))
    return reply({ error: "Choose a donation between $5 and $5,000 and a supported purpose." }, 400);
  if (name.length > 100 || /[<>\r\n]/.test(name) ||
      email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    return reply({ error: "Please correct the donor name or email address." }, 400);
  const token = typeof input?.turnstileToken === "string" ? input.turnstileToken : "";
  if (token.length < 5 || token.length > 2500)
    return reply({ error: "Please complete the donation security check." }, 400);
  try {
    const verify = new FormData();
    verify.set("secret", env.TURNSTILE_SECRET_KEY);
    verify.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) verify.set("remoteip", ip);
    const checked = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: verify
    });
    const result = checked.ok ? await checked.json() : null;
    if (!result?.success) return reply({ error: "Security check failed or expired. Please try again." }, 403);
  } catch {
    return reply({ error: "The security service is unavailable. Please try again." }, 503);
  }
  const base = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: "payment",
    "allowed_payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": "Burning Tree supporter contribution — " + purposes[purpose],
    "line_items[0][quantity]": "1",
    client_reference_id: "btmma_donation_" + crypto.randomUUID(),
    "metadata[btmma_source]": "btmma_seminar_donation_live_v1",
    "metadata[purpose]": purpose,
    "metadata[donation_cents]": String(cents),
    "metadata[donor_name]": name || "Not provided",
    "payment_intent_data[metadata][btmma_source]": "btmma_seminar_donation_live_v1",
    "payment_intent_data[metadata][purpose]": purpose,
    success_url: base + "/seminars/?donation=success&donation_session_id={CHECKOUT_SESSION_ID}#donate",
    cancel_url: base + "/seminars/?donation=cancelled#donate"
  });
  if (email) params.set("customer_email", email);
  try {
    const result = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });
    if (!result.ok) {
      const body = await result.json().catch(() => ({}));
      console.error("Donation Stripe Checkout failed", {
        status: result.status, code: String(body?.error?.code || "").slice(0, 60)
      });
      return reply({ error: "Secure donation checkout is unavailable. Please contact Coach David at 410-218-0894." }, 503);
    }
    const session = await result.json();
    if (!session.livemode || !/^cs_live_/.test(session.id || "") ||
        !/^https:\/\/checkout\.stripe\.com\//.test(session.url || ""))
      return reply({ error: "Could not verify the donation checkout. Please contact the studio." }, 503);
    return reply({ url: session.url });
  } catch {
    return reply({ error: "Could not connect to secure donation checkout. Please try again." }, 503);
  }
}

// Verify supporter donations directly against Stripe. Never treat a browser
// redirect, Cash App selection, or Zelle choice as evidence of payment.
export const prerender = false;
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const purposes = ["general", "united", "nerve"];
export async function GET({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_live_[A-Za-z0-9_]{10,180}$/.test(id))
    return reply({ confirmed: false, error: "Invalid donation payment reference." }, 400);
  if (!/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")))
    return reply({ confirmed: false, error: "Donation verification is unavailable." }, 503);
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }
    });
    if (!res.ok) return reply({ confirmed: false, error: "Stripe could not verify this donation." }, 503);
    const session = await res.json();
    const meta = session.metadata || {};
    const cents = Number(meta.donation_cents);
    if (session.livemode !== true || session.mode !== "payment" ||
        meta.btmma_source !== "btmma_seminar_donation_live_v1" ||
        !purposes.includes(meta.purpose) ||
        !Number.isSafeInteger(cents) || cents < 500 || cents > 500000 ||
        session.currency !== "usd" || session.amount_total !== cents ||
        !String(session.client_reference_id || "").startsWith("btmma_donation_"))
      return reply({ confirmed: false, error: "This is not a valid Burning Tree donation." }, 400);
    if (session.payment_status !== "paid")
      return reply({ confirmed: false, pending: true });
    return reply({ confirmed: true, amountCents: cents, purpose: meta.purpose });
  } catch {
    return reply({ confirmed: false, error: "Donation payment verification is temporarily unavailable." }, 503);
  }
}

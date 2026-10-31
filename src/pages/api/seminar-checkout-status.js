// Read-only confirmation; the browser never decides whether payment succeeded.
export const prerender = false;
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const prices = {
  united: { general: 5000, supporter: 7500, sponsor: 10000 },
  nerve: { day1: 10000, day2: 10000, both: 19000 }
};
export async function GET({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const sessionId = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_live_[A-Za-z0-9_]{10,180}$/.test(sessionId))
    return reply({ confirmed: false, error: "Invalid checkout reference." }, 400);
  if (!/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")))
    return reply({ confirmed: false, error: "Payment verification is unavailable." }, 503);
  try {
    const result = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId), {
      headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }
    });
    if (!result.ok) return reply({ confirmed: false, error: "Unable to check this payment." }, 503);
    const session = await result.json();
    const metadata = session.metadata || {};
    const quantity = Number(metadata.attendee_count);
    const unit = prices[metadata.event]?.[metadata.ticket];
    if (session.livemode !== true || session.mode !== "payment" ||
        metadata.btmma_source !== "btmma_seminar_live_v1" ||
        !Number.isInteger(quantity) || quantity < 1 || quantity > 6 ||
        !unit || session.currency !== "usd" || session.amount_total !== unit * quantity)
      return reply({ confirmed: false, error: "This checkout does not match a Burning Tree seminar registration." }, 400);
    if (session.payment_status !== "paid")
      return reply({ confirmed: false, pending: true });
    return reply({
      confirmed: true,
      event: metadata.event,
      ticket: metadata.ticket,
      quantity,
      amount: unit * quantity
    });
  } catch {
    return reply({ confirmed: false, error: "Payment verification could not be completed." }, 503);
  }
}

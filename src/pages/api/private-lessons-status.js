// Read and reconcile a private-coaching Checkout Session; payment is never inferred from a redirect.
export const prerender = false;
const prices = {
  basic: { name: "Basic", cents: 24900, sessions: 4 },
  advanced: { name: "Advanced", cents: 39900, sessions: 6 },
  elite: { name: "Elite", cents: 49900, sessions: 8 },
  mastery: { name: "Mastery", cents: 79900, sessions: 10 }
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return json({ confirmed: false, error: "Please check payment through the Burning Tree website." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 1000)
    return json({ confirmed: false, error: "Invalid payment reference." }, 413);
  let input;
  try { input = await request.json(); } catch { return json({ confirmed: false, error: "Invalid request." }, 400); }
  const id = input?.sessionId;
  if (typeof id !== "string" || !/^cs_live_[A-Za-z0-9_]{10,180}$/.test(id))
    return json({ confirmed: false, error: "Invalid checkout reference." }, 400);
  if (!/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")) ||
      !env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID)
    return json({ confirmed: false, error: "Payment verification is temporarily unavailable." }, 503);
  try {
    const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }
    });
    if (!stripe.ok) return json({ confirmed: false, error: "Could not verify this Stripe receipt." }, 503);
    const session = await stripe.json();
    const meta = session.metadata || {};
    const pack = Object.hasOwn(prices, meta.package) ? prices[meta.package] : null;
    const orderId = meta.order_id;
    if (!pack || session.livemode !== true || session.mode !== "payment" ||
        session.currency !== "usd" || session.amount_total !== pack.cents ||
        meta.btmma_source !== "btmma_private_coaching_v1" ||
        Number(meta.sessions) !== pack.sessions ||
        !/^rec[A-Za-z0-9]+$/.test(orderId || "") ||
        session.client_reference_id !== orderId) {
      return json({ confirmed: false, error: "This is not a valid Burning Tree private lesson checkout." }, 400);
    }
    if (session.payment_status !== "paid") return json({ confirmed: false, pending: true });

    // Confirm the order and its amount before updating the separate Airtable order table.
    const url = "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) +
      "/tbl426qWjMZgEH1ss/" + encodeURIComponent(orderId);
    let recorded = false;
    const existing = await fetch(url, { headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN } });
    if (existing.ok) {
      const record = await existing.json();
      if (record.fields?.Package === pack.name &&
          Number(record.fields?.Amount) === pack.cents / 100 &&
          (!record.fields?.["Stripe Session ID"] || record.fields["Stripe Session ID"] === id)) {
        const patch = await fetch(url, {
          method: "PATCH",
          headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: {
            "Payment Status": "Verified paid", "Stripe Session ID": id,
            "Order Notes": "Verified with Stripe live Checkout Session " + id + ". Schedule 60-minute private coaching sessions directly with Coach David."
          } })
        });
        recorded = patch.ok;
      }
    }
    if (!recorded) console.warn("Private coaching payment confirmed by Stripe but Airtable sync is pending.");
    return json({
      confirmed: true, recorded, package: pack.name,
      sessions: pack.sessions, amount: pack.cents / 100
    });
  } catch {
    return json({ confirmed: false, error: "Payment verification is temporarily unavailable. Keep your Stripe receipt and contact Coach David." }, 503);
  }
}

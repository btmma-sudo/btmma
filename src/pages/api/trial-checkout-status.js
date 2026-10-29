// Verify the exact paid Checkout Session through Stripe and the local reservation.
// Do not trust the return URL itself, and do not expose personal information.
export const prerender = false;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type":"application/json", "cache-control":"no-store" }
});
export async function GET({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const id = new URL(request.url).searchParams.get("session_id");
  if (!id || !/^cs_live_[A-Za-z0-9_]+$/.test(id) || id.length > 256)
    return json({ error:"Invalid checkout reference." },400);
  if (!env.LIVE_TRIAL_DB || !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")))
    return json({ error:"Payment verification is unavailable." },503);
  let row;
  try {
    row = await env.LIVE_TRIAL_DB.prepare("SELECT id, state FROM trial_registrations WHERE stripe_session_id = ?")
      .bind(id).first();
  } catch { return json({ error:"Payment verification is unavailable." },503); }
  if (!row) return json({ error:"Checkout not found." },404);
  let response;
  try {
    response = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }
    });
  } catch { return json({ error:"Payment verification is unavailable." },503); }
  if (!response.ok) return json({ error:"Payment verification is unavailable." },503);
  const stripe = await response.json();
  if (stripe.livemode !== true || stripe.mode !== "payment" ||
      stripe.currency !== "usd" || stripe.amount_total !== 2900 ||
      stripe.client_reference_id !== row.id ||
      stripe.metadata?.btmma_source !== "btmma_29_trial_live_v1")
    return json({ error:"Checkout does not match this registration." },409);
  if (stripe.payment_status === "paid")
    return json({ status:row.state === "paid" ? "confirmed" : "processing" });
  return json({ status:"pending" });
}

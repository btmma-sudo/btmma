// Live webhook: verify authentic Stripe requests, but do NOT acknowledge
// payment fulfillment until a separate live database and reconciliation exist.
export const prerender = false;
const encoder = new TextEncoder();
const reply = (status, message) => new Response(JSON.stringify({ message }), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
function equal(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}
export async function POST({ request, locals }) {
  const secret = locals?.runtime?.env?.STRIPE_LIVE_WEBHOOK_SECRET;
  if (typeof secret !== "string" || !secret.startsWith("whsec_")) return reply(503, "Live webhook not configured");
  const header = request.headers.get("stripe-signature") || "";
  const pieces = header.split(",").map(p => p.trim());
  const timestamp = pieces.find(p => p.startsWith("t="))?.slice(2);
  const digests = pieces.filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  const seconds = Number(timestamp);
  if (!/^\d{10,}$/.test(timestamp || "") ||
      !Number.isSafeInteger(seconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300 ||
      digests.length === 0) return reply(400, "Invalid Stripe signature");
  const body = await request.text();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp + "." + body)));
  const expected = encoder.encode(Array.from(bytes, x => x.toString(16).padStart(2, "0")).join(""));
  if (!digests.some(d => /^[0-9a-f]{64}$/i.test(d) && equal(encoder.encode(d.toLowerCase()), expected)))
    return reply(400, "Invalid Stripe signature");
  let event;
  try { event = JSON.parse(body); } catch { return reply(400, "Invalid JSON"); }
  if (event?.livemode !== true || typeof event.id !== "string" || !event.id.startsWith("evt_"))
    return reply(400, "Invalid live event");
  // Fail closed: Stripe will retry legitimate events until live fulfillment is deployed.
  console.warn("Verified live Stripe event; fulfillment not enabled", { eventId: event.id, type: event.type });
  return reply(503, "Live payment fulfillment is not enabled");
}
export async function GET() { return reply(405, "Webhook requires POST"); }

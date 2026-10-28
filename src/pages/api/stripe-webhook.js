// Stripe webhook receiver. Test-mode integration is not yet enabled.
// Never acknowledge a valid payment as processed until student-specific
// fulfillment is implemented, otherwise Stripe will not retry it.
export const prerender = false;
const reply = (message, status) => new Response(JSON.stringify({ message }), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
const encoder = new TextEncoder();
const constantTimeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (!env.STRIPE_WEBHOOK_SECRET || !env.TRIAL_DB) return reply("Webhook not configured", 503);
  const signature = request.headers.get("stripe-signature") || "";
  const timestamp = signature.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const signatures = signature.split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300 || signatures.length === 0) {
    return reply("Invalid webhook signature", 400);
  }
  const body = await request.text();
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp + "." + body)));
  const expected = Array.from(mac, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const verified = signatures.some((value) => /^[0-9a-f]{64}$/i.test(value) &&
    constantTimeEqual(encoder.encode(value.toLowerCase()), encoder.encode(expected)));
  if (!verified) return reply("Invalid webhook signature", 400);
  let event;
  try { event = JSON.parse(body); } catch { return reply("Invalid JSON", 400); }
  if (typeof event.id !== "string" || !event.id.startsWith("evt_")) return reply("Invalid event", 400);
  // The endpoint is deliberately fail-closed: do not mark an event processed,
  // mark a trial used, or return 2xx before payment-to-student fulfillment exists.
  console.warn("Stripe webhook received before fulfillment enabled", { type: event.type, id: event.id });
  return reply("Payment fulfillment not yet enabled", 503);
}

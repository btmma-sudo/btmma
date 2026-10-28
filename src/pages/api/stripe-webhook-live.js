// Separate LIVE Stripe webhook destination.
// Intentionally not accepting payments as fulfilled until live-mode validation,
// a separate live registration store and idempotent Airtable fulfillment are ready.
// Never return 2xx for unprocessed Stripe events.
export const prerender = false;
const respond = (status, message) => new Response(JSON.stringify({ message }), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" }
});
export async function POST() {
  return respond(503, "Live payment fulfillment is not enabled");
}
export async function GET() {
  return respond(405, "Webhook requires POST");
}

import { reconcilePnoQa } from "../../lib/parents-night-out-qa.js";
export const prerender = false;
export async function GET({ request, locals }) {
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_test_[A-Za-z0-9_]{10,180}$/.test(id))
    return new Response(JSON.stringify({ confirmed: false, error: "Invalid test checkout." }), { status: 400, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  try {
    const status = await reconcilePnoQa(locals?.runtime?.env ?? {}, id);
    return new Response(JSON.stringify(status), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (err) {
    console.error("Test checkout verification failed", String(err).slice(0,140));
    return new Response(JSON.stringify({ confirmed: false, error: "Could not verify the simulated payment. Check Stripe test mode and Airtable Test Registrations." }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
}

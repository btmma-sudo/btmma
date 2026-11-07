import { reconcilePnoPayment } from "../../lib/parents-night-out.js";
export const prerender = false;
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
export async function GET({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const sessionId = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_live_[A-Za-z0-9_]{10,180}$/.test(sessionId))
    return reply({ confirmed: false, error: "Invalid checkout reference." }, 400);
  try {
    const result = await reconcilePnoPayment(env, sessionId);
    return reply(result);
  } catch (e) {
    console.error("Parents Night Out payment status could not be reconciled", String(e).slice(0, 140));
    return reply({ confirmed: false, error: "Payment verification is temporarily unavailable. Keep your Stripe receipt and call 410-218-0894 before paying again." }, 503);
  }
}

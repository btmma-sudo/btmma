import { reconcileSeminarQa } from "../../lib/seminar-test-checkout.js";
export const prerender = false;
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
export async function GET({ request, locals }) {
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_test_[A-Za-z0-9_]{10,180}$/.test(id))
    return reply({ confirmed: false, error: "Invalid Stripe test checkout reference." }, 400);
  try {
    return reply(await reconcileSeminarQa(locals?.runtime?.env ?? {}, id));
  } catch (e) {
    console.error("Seminar test payment verification failed", String(e).slice(0, 160));
    return reply({ confirmed: false, error: "Test payment could not be verified. Keep the test session reference." }, 503);
  }
}

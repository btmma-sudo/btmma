// Live student eligibility stays OFF until the separate payment launch gate is enabled.
// Reuse the sandbox-tested eligibility logic, while swapping ONLY the isolated
// D1 reservation binding and HMAC approval secret. Never write to test D1 here.
import { POST as checkRegistration } from "./trial-eligibility.js";

export const prerender = false;
const respond = (status, error) => new Response(JSON.stringify({ success: false, error }), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});

export async function POST({ request, locals }) {
  const env = locals?.runtime?.env;
  // This must be enabled only after live checkout and webhook are launch-ready.
  if (env?.LIVE_CHECKOUT_ENABLED !== "true")
    return respond(503, "Live registration and checkout are not enabled yet.");
  if (!env?.LIVE_TRIAL_DB || !env?.STRIPE_LIVE_WEBHOOK_SECRET ||
      !/^(sk|rk)_live_/.test(String(env?.STRIPE_LIVE_SECRET_KEY || "")))
    return respond(503, "Live registration is not configured.");

  const liveEnv = {
    ...env,
    TRIAL_DB: env.LIVE_TRIAL_DB,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_LIVE_WEBHOOK_SECRET
  };
  const liveLocals = { ...locals, runtime: { ...locals.runtime, env: liveEnv } };
  return checkRegistration({ request, locals: liveLocals });
}

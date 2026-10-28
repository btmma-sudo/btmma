// Live student eligibility stays OFF until the separate payment launch gate is enabled.
// Reuse the sandbox-tested eligibility logic, while swapping ONLY the isolated
// D1 reservation binding and HMAC approval secret. Never write to test D1 here.
import { POST as checkRegistration } from "./trial-eligibility.js";

export const prerender = false;
const respond = (status, error) => new Response(JSON.stringify({ success: false, error }), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});

// Read-only checks. Never expose credentials, student data or registration IDs.
export async function GET({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const locked = env.LIVE_CHECKOUT_ENABLED !== "true";
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (!locked || new URL(request.url).searchParams.get("check") !== "readiness") {
    return new Response(JSON.stringify({ liveRegistration: locked ? "locked" : "enabled" }), { headers });
  }
  let database = "needs_attention";
  try {
    const rows = await env.LIVE_TRIAL_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('trial_registrations', 'stripe_webhook_events')"
    ).all();
    const names = new Set((rows.results || []).map(row => row.name));
    if (names.has("trial_registrations") && names.has("stripe_webhook_events")) database = "ready";
  } catch {
    console.warn("Live database readiness check failed");
  }
  const checks = {
    liveDatabase: database,
    stripeKeyConfigured: /^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")),
    webhookSecretConfigured: String(env.STRIPE_LIVE_WEBHOOK_SECRET || "").startsWith("whsec_"),
    airtableConfigured: Boolean(env.AIRTABLE_API_TOKEN && env.AIRTABLE_BASE_ID),
    turnstileConfigured: Boolean(env.TURNSTILE_SECRET_KEY)
  };
  // Read-only calls test whether the live key is actually accepted and
  // whether Airtable's payment fields still match the fulfillment handler.
  // Never expose API responses, records, customer data, or secrets.
  const [stripeCheck, airtableCheck] = await Promise.all([
    (async () => {
      if (!checks.stripeKeyConfigured) return "not_configured";
      try {
        const response = await fetch("https://api.stripe.com/v1/checkout/sessions?limit=1", {
          headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }
        });
        return response.ok ? "ready" : response.status === 401 ? "key_rejected"
          : response.status === 403 ? "permissions_required" : "unavailable";
      } catch { return "unavailable"; }
    })(),
    (async () => {
      if (!checks.airtableConfigured) return "not_configured";
      try {
        const response = await fetch(
          "https://api.airtable.com/v0/meta/bases/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/tables",
          { headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN } }
        );
        if (!response.ok) return "unavailable";
        const data = await response.json();
        const table = data.tables?.find(t => t.id === "tblZCXEuRKXiPZlc7");
        const payment = table?.fields?.find(f => f.name.trim().toLowerCase() === "payment status");
        const trial = table?.fields?.find(f => /29/.test(f.name) && /tr(?:ia|ai)l/i.test(f.name) && /used/i.test(f.name));
        const hasPaidChoice = payment?.type === "singleSelect" &&
          payment.options?.choices?.some(choice => choice.name === "Paid");
        return trial?.type === "checkbox" && hasPaidChoice ? "ready" : "needs_review";
      } catch { return "unavailable"; }
    })()
  ]);
  checks.liveStripeSessionRead = stripeCheck;
  checks.airtableFulfillmentFields = airtableCheck;
  return new Response(JSON.stringify({ liveRegistration: "locked", checks }), { headers });
}

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
    STRIPE_WEBHOOK_SECRET: env.STRIPE_LIVE_WEBHOOK_SECRET,
    TRIAL_REGISTRATION_CONTEXT: "live"
  };
  const liveLocals = { ...locals, runtime: { ...locals.runtime, env: liveEnv } };
  return checkRegistration({ request, locals: liveLocals });
}

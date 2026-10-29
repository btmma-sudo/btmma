// Direct Cash App is separate from Stripe. Selecting it requests manual
// payment verification; it must NEVER mark a trial paid automatically.
export const prerender = false;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

async function validGrant(secret, grant) {
  if (typeof grant !== "string" || grant.length > 500) return null;
  const [recordId, expiry, mac] = grant.split(".");
  const now = Date.now();
  if (!/^rec[A-Za-z0-9]+$/.test(recordId || "") ||
      !/^\d{13}$/.test(expiry || "") || !/^[a-f0-9]{64}$/.test(mac || "") ||
      Number(expiry) < now || Number(expiry) > now + 16 * 60 * 1000) return null;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {
    name: "HMAC", hash: "SHA-256"
  }, false, ["sign"]);
  const expected = hex(new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, encoder.encode(recordId + "." + expiry)
  )));
  if (expected !== mac) return null;
  return recordId;
}

async function notePendingPayment(env, recordId) {
  if (!env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID) return false;
  const url = "https://api.airtable.com/v0/" +
    encodeURIComponent(env.AIRTABLE_BASE_ID) +
    "/tblZCXEuRKXiPZlc7/" + encodeURIComponent(recordId);
  const headers = { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN };
  const lookup = await fetch(url, { headers });
  if (!lookup.ok) return false;
  const data = await lookup.json();
  const existing = typeof data.fields?.["Additional Notes"] === "string"
    ? data.fields["Additional Notes"] : "";
  const flag = "Cash App direct payment selected: $29 to $BTMMA. PENDING verification in Cash App. Do not mark Paid until personally verified.";
  if (existing.includes(flag)) return true;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { "Additional Notes": (existing ? existing + "\n" : "") + flag }, typecast: false })
  });
  return response.ok;
}

export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (env.LIVE_CHECKOUT_ENABLED !== "true" || !env.LIVE_TRIAL_DB ||
      typeof env.STRIPE_LIVE_WEBHOOK_SECRET !== "string")
    return json({ error: "Cash App registration is not available. Please contact the studio." }, 503);
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request." }, 400); }
  const recordId = await validGrant(env.STRIPE_LIVE_WEBHOOK_SECRET, body?.grant);
  if (!recordId) return json({ error: "Registration approval expired. Please contact the studio." }, 403);
  const row = await env.LIVE_TRIAL_DB.prepare(
    "SELECT id, state, stripe_session_id FROM trial_registrations WHERE airtable_record_id = ?"
  ).bind(recordId).first();
  if (!row || row.stripe_session_id ||
      !["reserved", "manual_review"].includes(row.state))
    return json({ error: "This registration already has a payment method selected. Please contact the studio." }, 409);

  // The conditional update prevents choosing Cash App after Stripe checkout starts.
  if (row.state === "reserved") {
    const updated = await env.LIVE_TRIAL_DB.prepare(
      "UPDATE trial_registrations SET state = 'manual_review', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'reserved' AND stripe_session_id IS NULL"
    ).bind(row.id).run();
    if (updated.meta?.changes !== 1)
      return json({ error: "Payment selection needs review. Please contact the studio." }, 409);
  }
  try {
    if (!(await notePendingPayment(env, recordId)))
      console.warn("Cash App manual verification note needs follow-up");
  } catch {
    console.warn("Cash App manual verification note could not be saved");
  }

  // Selecting Cash App is not evidence that the customer has sent payment.
  return json({
    success: true,
    cashtag: "$BTMMA",
    paymentUrl: "https://cash.app/pay/link/tvqncp9q",
    amount: 29,
    state: "pending_manual_verification"
  });
}

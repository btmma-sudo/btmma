// Dedicated $29 trial Zelle option; no changes to Stripe or Cash App paths.
// Zelle sends to Coach David's enrolled mobile: 410-218-0894.
// Selecting this option NEVER means that a payment was received or a trial was paid.
export const prerender = false;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const textEncoder = new TextEncoder();
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const NOTE = "Zelle direct $29 trial payment selected: recipient mobile 410-218-0894 (Coach David). PENDING manual bank verification. Do not mark Paid without verifying the received bank transfer.";

async function validGrant(secret, grant) {
  if (typeof grant !== "string" || grant.length > 500) return null;
  const [recordId, expiry, mac, extra] = grant.split(".");
  const now = Date.now();
  if (extra !== undefined || !/^rec[A-Za-z0-9]+$/.test(recordId || "") ||
      !/^\d{13}$/.test(expiry || "") || !/^[a-f0-9]{64}$/.test(mac || "") ||
      Number(expiry) < now || Number(expiry) > now + 16 * 60 * 1000) return null;
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const computed = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key,
    textEncoder.encode(recordId + "." + expiry))));
  // Constant-time compare of the fixed-length grant signature.
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) mismatch |= computed.charCodeAt(i) ^ mac.charCodeAt(i);
  return mismatch === 0 ? recordId : null;
}

async function getAirtableRecord(env, recordId) {
  if (!env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID) return null;
  const url = "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) +
    "/tblZCXEuRKXiPZlc7/" + encodeURIComponent(recordId);
  const headers = { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN };
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) return null;
  const record = await response.json();
  return { url, headers, record };
}

async function notePending(env, existingRecord) {
  const current = typeof existingRecord.record.fields?.["Additional Notes"] === "string"
    ? existingRecord.record.fields["Additional Notes"] : "";
  if (current.includes(NOTE)) return true;
  // Do not silently substitute Zelle when a different manual method was already chosen.
  if (current.includes("Cash App direct payment selected:")) return false;
  const updated = await fetch(existingRecord.url, {
    method: "PATCH",
    headers: { ...existingRecord.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: {
      "Additional Notes": (current ? current + "\n" : "") + NOTE
    }, typecast: false })
  });
  return updated.ok;
}

export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (env.LIVE_CHECKOUT_ENABLED !== "true" || !env.LIVE_TRIAL_DB ||
      typeof env.STRIPE_LIVE_WEBHOOK_SECRET !== "string" ||
      !env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID)
    return json({ error: "Zelle selection is currently unavailable. Contact Coach David at (410) 218-0894." }, 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Please use the Burning Tree registration page." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 1500)
    return json({ error: "Request too large." }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const recordId = await validGrant(env.STRIPE_LIVE_WEBHOOK_SECRET, body?.grant);
  if (!recordId) return json({ error: "Registration approval expired. Please verify eligibility again." }, 403);

  const row = await env.LIVE_TRIAL_DB.prepare(
    "SELECT id, state, stripe_session_id FROM trial_registrations WHERE airtable_record_id = ?"
  ).bind(recordId).first();
  if (!row || row.stripe_session_id || !["reserved", "manual_review"].includes(row.state))
    return json({ error: "This registration already has a payment method or needs staff review. Please contact Coach David." }, 409);

  let record;
  try { record = await getAirtableRecord(env, recordId); } catch { /* fail closed */ }
  if (!record) return json({ error: "Could not verify this registration in Airtable. No payment method was selected." }, 503);
  const fields = record.record.fields || {};
  const notes = typeof fields["Additional Notes"] === "string" ? fields["Additional Notes"] : "";
  const alreadyZelle = notes.includes(NOTE);
  if (notes.includes("Cash App direct payment selected:") ||
      row.state === "manual_review" && !alreadyZelle ||
      fields["Payment Status"] === "Paid" || fields["$29 Trail Used"] === true)
    return json({ error: "This registration is already being handled. Contact Coach David before sending payment." }, 409);

  // Atomic claim: never offer Zelle instructions after Stripe checkout has started.
  if (row.state === "reserved") {
    const updated = await env.LIVE_TRIAL_DB.prepare(
      "UPDATE trial_registrations SET state='manual_review', updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='reserved' AND stripe_session_id IS NULL"
    ).bind(row.id).run();
    if (updated.meta?.changes !== 1)
      return json({ error: "Payment method selection needs review. Contact Coach David." }, 409);
  }

  try {
    if (!(await notePending(env, record)))
      return json({ error: "Zelle selection needs staff review. Do not send money until speaking with Coach David." }, 503);
  } catch {
    return json({ error: "Zelle selection could not be recorded. Do not send money yet; contact Coach David." }, 503);
  }
  return json({
    success: true,
    state: "pending_manual_verification",
    amount: 29,
    recipientPhone: "410-218-0894",
    paymentMethod: "zelle"
  });
}

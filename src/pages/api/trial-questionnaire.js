// Step 3 of the $29 trial: questionnaire access is unlocked only after
// server-verified payment. No changes to existing Stripe or manual-payment flows.
export const prerender = false;
const LEADS_TABLE = "tblZCXEuRKXiPZlc7";
const QUESTIONNAIRE_FIELD = "fldvaLLNiB7iSpeoP";
const QUESTIONS = {
  q1: "What interests you about martial arts?",
  q2: "What motivated you to look into martial arts right now?",
  q3: "What is your top goal for the next 6–12 months?",
  q4: "If we helped you or your child accomplish ONE thing, what would make the biggest difference?",
  q5: "Have you or your child trained before?",
  q6: "Are there any specific areas you would like help with?",
  q7: "What has prevented you from starting martial arts before?",
  q8: "How important is earning a black belt?",
  q9: "What is most important to you in choosing a martial arts school?",
  q10: "What would make you feel confident Burning Tree is the right fit?",
  q11: "Are other family members interested in training?",
  q12: "Anything instructors should know before the first class? (Do not include medical details.)",
  // Program interest is already captured in Step 1; never ask it twice.
  q14: "How often would you like to train?",
  q15: "Which days are convenient?",
  q16: "Which membership options would you like to discuss AFTER the two-class trial?",
  q17: "If the first class goes well, when might you begin?",
  q18: "Would you like to review membership options?",
  q19: "How did you hear about us?"
};
const EXTRAS = {
  q5Details: "Prior style and training duration",
  q11Count: "Number of additional family members",
  q19Referrer: "Referred by",
  q19Other: "Other referral source",
  preferredFirstClass: "Preferred first class date or time",
  contactPermission: "Permission to contact about registration and trial scheduling"
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const safe = (value, max = 650) => typeof value === "string"
  ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max) : "";
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const encoder = new TextEncoder();
async function verifyAccess(secret, token) {
  if (typeof token !== "string" || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "qt1") return null;
  const [, recordId, expiry, mac] = parts;
  const now = Date.now();
  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId || "") ||
      !/^\d{13}$/.test(expiry || "") || !/^[0-9a-f]{64}$/.test(mac || "") ||
      Number(expiry) < now || Number(expiry) > now + 31 * 86400000) return null;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key,
    encoder.encode("btmma-questionnaire-v1|" + recordId + "|" + expiry))));
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  return different === 0 ? recordId : null;
}
function buildQuestionnaire(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const answered = Object.entries(QUESTIONS)
    .map(([key, question]) => ({ key, question, answer: safe(raw[key]) }));
  const extras = Object.entries(EXTRAS)
    .map(([key, label]) => ({ label, answer: safe(raw[key], 160) }))
    .filter(x => x.answer);
  // Prevent empty submissions; no private health information is required.
  if (!answered.some(x => x.answer) || !answered.find(x => x.key === "q3")?.answer) return null;
  return [
    "BURNING TREE MIXED MARTIAL ARTS — POST-PAYMENT NEW STUDENT QUESTIONNAIRE",
    "Submitted: " + new Date().toISOString(),
    "Step 1 already captured student name, date of birth, contact details and selected program.",
    "This form is for first-class preparation, not a membership agreement.",
    "",
    ...answered.map(x => x.key.slice(1) + ". " + x.question + "\n" + (x.answer || "(not answered)") + "\n"),
    ...extras.map(x => x.label + ": " + x.answer)
  ].join("\n").slice(0, 18000);
}
async function getLead(env, recordId) {
  const response = await fetch("https://api.airtable.com/v0/" +
    encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" + LEADS_TABLE + "/" +
    encodeURIComponent(recordId), {
      headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN },
      cache: "no-store"
    });
  if (!response.ok) throw new Error("Lead lookup failed");
  return await response.json();
}
async function verifiedPayment(env, row, lead, sessionId) {
  if (row.stripe_session_id) {
    if (sessionId && row.stripe_session_id !== sessionId) return false;
    if (row.state === "paid") return true; // Signed Stripe webhook already reconciled payment.
    // Checkout can return ahead of the webhook. Validate directly with Stripe.
    if (!/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || ""))) return false;
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions/" +
      encodeURIComponent(row.stripe_session_id), {
        headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }
      });
    if (!response.ok) throw new Error("Stripe payment check unavailable");
    const session = await response.json();
    return session.livemode === true && session.mode === "payment" &&
      session.amount_total === 2900 && session.currency === "usd" &&
      session.client_reference_id === row.id &&
      session.metadata?.btmma_source === "btmma_29_trial_live_v1" &&
      session.payment_status === "paid";
  }
  // Cash App / Zelle are not paid on selection: only staff-verification in Airtable unlocks Step 3.
  const notes = typeof lead.fields?.["Additional Notes"] === "string"
    ? lead.fields["Additional Notes"] : "";
  return row.state === "manual_review" && lead.fields?.["Payment Status"] === "Paid" &&
    /(?:Cash App direct payment selected:|Zelle direct \$29 trial payment selected:)/.test(notes);
}
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (!env.LIVE_TRIAL_DB || !env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID ||
      !env.STRIPE_LIVE_WEBHOOK_SECRET)
    return json({ error: "Questionnaire service temporarily unavailable." }, 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Invalid website origin." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 24000)
    return json({ error: "Questionnaire too large." }, 413);
  let input;
  try { input = await request.json(); }
  catch { return json({ error: "Invalid questionnaire request." }, 400); }
  const action = input?.action;
  if (!["status", "submit"].includes(action))
    return json({ error: "Invalid request." }, 400);
  let row;
  const accessRecordId = await verifyAccess(env.STRIPE_LIVE_WEBHOOK_SECRET, input?.accessToken);
  const sessionId = typeof input?.sessionId === "string" &&
    /^cs_live_[A-Za-z0-9_]{10,240}$/.test(input.sessionId) ? input.sessionId : null;
  if (!accessRecordId && !sessionId) return json({ error: "Secure registration reference required." }, 403);
  try {
    // A Stripe return may coexist with an older student's saved token.
    // Prefer the independently verifiable Checkout session in that case.
    row = sessionId
      ? await env.LIVE_TRIAL_DB.prepare("SELECT id, state, airtable_record_id, stripe_session_id FROM trial_registrations WHERE stripe_session_id=?").bind(sessionId).first()
      : await env.LIVE_TRIAL_DB.prepare("SELECT id, state, airtable_record_id, stripe_session_id FROM trial_registrations WHERE airtable_record_id=?").bind(accessRecordId).first();
  } catch { return json({ error: "Unable to verify registration." }, 503); }
  if (!row || (sessionId && row.stripe_session_id !== sessionId) ||
      (!sessionId && accessRecordId && row.airtable_record_id !== accessRecordId))
    return json({ error: "Registration could not be verified." }, 403);
  try {
    const lead = await getLead(env, row.airtable_record_id);
    const paid = await verifiedPayment(env, row, lead, sessionId);
    if (!paid) return action === "submit"
      ? json({ error: "Step 3 opens only after the $29 payment is verified." }, 403)
      : json({ paid: false, completed: false });
    const completed = Boolean(lead.fields?.["Enrollment Questionnaire"]);
    if (action === "status") return json({ paid: true, completed });
    const text = buildQuestionnaire(input?.answers);
    if (!text) return json({ error: "Please tell us your main goal (question 3) and answer at least one question." }, 400);
    if (completed) return json({ success: true, completed: true });
    const response = await fetch("https://api.airtable.com/v0/" +
      encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" + LEADS_TABLE + "/" +
      encodeURIComponent(row.airtable_record_id), {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + env.AIRTABLE_API_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields: { [QUESTIONNAIRE_FIELD]: text }, typecast: false })
      });
    if (!response.ok) throw new Error("Airtable questionnaire write failed");
    return json({ success: true, completed: true });
  } catch (e) {
    console.error("Post-payment questionnaire service error", {
      reason: e instanceof Error ? e.message.slice(0, 100) : "unknown"
    });
    return json({ error: "We could not verify payment or save the questionnaire. Please try again or contact Coach David." }, 503);
  }
}

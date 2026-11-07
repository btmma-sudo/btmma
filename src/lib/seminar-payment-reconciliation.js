// Reconcile live seminar tickets independently of $29 trials, donations and
// Parents' Night Out. The Stripe webhook signature is verified by the caller.
export const SEMINAR_SOURCE = "btmma_seminar_live_v1";
const WAIVER_TABLE = "tblEOTe4nc6B2DY2d";
const PRICES = {
  united: { general: 5000, supporter: 7500, sponsor: 10000 },
  nerve: { day1: 10000, day2: 10000, both: 19000 }
};
const validSessionId = id => /^cs_live_[A-Za-z0-9_]{10,180}$/.test(id || "");
const validGroupId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "");
const canonicalNames = names => names.map(v => v.trim().toLowerCase()).sort();

async function airtable(env, path, init) {
  const url = "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) +
    "/" + WAIVER_TABLE + path;
  const result = await fetch(url, {
    ...init,
    headers: {
      Authorization: "Bearer " + env.AIRTABLE_API_TOKEN,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  if (!result.ok) {
    console.error("Seminar Airtable reconciliation failed", { status: result.status });
    throw new Error("Seminar registration reconciliation is temporarily unavailable.");
  }
  return result.json();
}

export async function reconcileSeminarPayment(env, sessionId, failed = false) {
  if (!validSessionId(sessionId) || !env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID ||
      !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")))
    throw new Error("Seminar payment verification is unavailable.");

  const response = await fetch(
    "https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId),
    { headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY } }
  );
  if (!response.ok) throw new Error("Stripe seminar verification is unavailable.");
  const session = await response.json();
  const meta = session.metadata || {};
  const attendeeCount = Number(meta.attendee_count);
  const unitPrice = PRICES[meta.event]?.[meta.ticket];
  const groupId = meta.waiver_group_id;
  const attendeeNames = typeof meta.attendee_names === "string" ?
    meta.attendee_names.split(" | ").map(n => n.trim()) : [];
  if (session.id !== sessionId || session.livemode !== true || session.mode !== "payment" ||
      session.currency !== "usd" || meta.btmma_source !== SEMINAR_SOURCE ||
      !unitPrice || !Number.isInteger(attendeeCount) || attendeeCount < 1 || attendeeCount > 6 ||
      session.amount_total !== unitPrice * attendeeCount ||
      !String(session.client_reference_id || "").startsWith("seminar_") ||
      !validGroupId(groupId) || !meta.waiver_version ||
      attendeeNames.length !== attendeeCount ||
      attendeeNames.some(name => name.length < 2 || name.length > 75))
    throw new Error("Stripe checkout does not match a signed Burning Tree seminar registration.");

  const where = "{Group ID}='" + groupId + "'";
  const query = "?pageSize=10&filterByFormula=" + encodeURIComponent(where);
  const result = await airtable(env, query);
  const waivers = result.records;
  const email = String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
  if (result.offset || !Array.isArray(waivers) || waivers.length !== attendeeCount || !email ||
      waivers.some(row => row.fields?.Seminar !== meta.event ||
        row.fields?.Ticket !== meta.ticket ||
        row.fields?.["Group ID"] !== groupId ||
        String(row.fields?.["Contact Email"] || "").trim().toLowerCase() !== email ||
        row.fields?.["Waiver Version"] !== meta.waiver_version ||
        row.fields?.["Electronic Consent"] !== true ||
        row.fields?.["Acknowledged Risks"] !== true ||
        !row.fields?.["Waiver Full Text"] || !row.fields?.["Electronic Signature"]) ||
      JSON.stringify(canonicalNames(waivers.map(r => String(r.fields.Attendee || "")))) !==
        JSON.stringify(canonicalNames(attendeeNames)))
    throw new Error("Stripe payment and signed seminar waiver records do not match.");

  const paidValue = "Paid via Stripe: " + sessionId;
  const statuses = waivers.map(row => String(row.fields?.["Checkout Status"] || ""));
  if (statuses.some(status => /^paid\b/i.test(status) && status !== paidValue))
    throw new Error("Seminar registration is already marked paid under a different payment.");

  if (session.payment_status === "paid") {
    const updates = waivers.filter(row => row.fields?.["Checkout Status"] !== paidValue)
      .map(row => ({ id: row.id, fields: { "Checkout Status": paidValue } }));
    if (updates.length) {
      const updated = await airtable(env, "", {
        method: "PATCH", body: JSON.stringify({ records: updates, typecast: false })
      });
      if (!Array.isArray(updated.records) || updated.records.length !== updates.length)
        throw new Error("Seminar payment reconciliation was incomplete.");
    }
    return { confirmed: true, attendeeCount, amountCents: unitPrice * attendeeCount };
  }

  if (failed) {
    const failedValue = "Stripe payment failed: " + sessionId;
    const updates = waivers.filter(row => row.fields?.["Checkout Status"] !== failedValue)
      .map(row => ({ id: row.id, fields: { "Checkout Status": failedValue } }));
    if (updates.length) await airtable(env, "", {
      method: "PATCH", body: JSON.stringify({ records: updates, typecast: false })
    });
    return { confirmed: false, failed: true, attendeeCount };
  }

  return { confirmed: false, pending: true, attendeeCount };
}

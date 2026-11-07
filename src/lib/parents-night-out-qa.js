// QA-only Stripe sandbox reconciliation. NEVER writes to real Event Registrations.
export const PNO_QA_TABLE = "tblzQKM47646oqRET";
export const PNO_QA_SOURCE = "btmma_pno_stripe_test_v1";
export const PNO_QA_CENTS = 3500;

export const pnoQaEnabled = env =>
  env.PNO_TEST_CHECKOUT_ENABLED === "true" &&
  /^sk_test_[A-Za-z0-9_]+$/.test(String(env.STRIPE_SECRET_KEY || "")) &&
  Boolean(env.AIRTABLE_API_TOKEN && env.AIRTABLE_BASE_ID);

export async function pnoQaAirtable(env, suffix = "", method = "GET", fields = undefined) {
  const response = await fetch(
    "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" +
    PNO_QA_TABLE + suffix,
    { method, headers: {
      "Authorization": "Bearer " + env.AIRTABLE_API_TOKEN,
      "Content-Type": "application/json"
    }, ...(fields ? { body: JSON.stringify(fields) } : {}) }
  );
  if (!response.ok) throw new Error("Unable to check the test-only Airtable record.");
  return response.json();
}

export async function reconcilePnoQa(env, sessionId) {
  if (!pnoQaEnabled(env) || !/^cs_test_[A-Za-z0-9_]{10,180}$/.test(sessionId || ""))
    throw new Error("Test-mode verification is unavailable.");
  const checked = await fetch(
    "https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId),
    { headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY } }
  );
  if (!checked.ok) throw new Error("Stripe test payment cannot be verified.");
  const session = await checked.json();
  const meta = session.metadata || {};
  const count = Number(meta.child_count);
  const recordId = meta.test_record_id;
  if (session.id !== sessionId || session.livemode !== false ||
      session.mode !== "payment" || session.currency !== "usd" ||
      !/^rec[A-Za-z0-9]{10,30}$/.test(recordId || "") ||
      meta.btmma_source !== PNO_QA_SOURCE || !Number.isInteger(count) ||
      count < 1 || count > 6 || session.amount_total !== count * PNO_QA_CENTS ||
      session.client_reference_id !== recordId)
    throw new Error("This is not a valid Parents Night Out test payment.");
  const record = await pnoQaAirtable(env, "/" + encodeURIComponent(recordId));
  const fields = record.fields || {};
  if (fields.Event !== "Parents Night Out (TEST ONLY)" ||
      fields["Stripe Test Session ID"] !== sessionId ||
      Number(fields["Child Count"]) !== count ||
      Math.round(Number(fields["Amount (Simulated)"]) * 100) !== count * PNO_QA_CENTS)
    throw new Error("The test payment does not match its test-only Airtable record.");
  if (session.payment_status === "paid") {
    if (fields["Payment Status"] !== "TEST PAID") {
      await pnoQaAirtable(env, "/" + encodeURIComponent(recordId), "PATCH", {
        fields: {
          "Payment Status": "TEST PAID",
          "Stripe Test Payment Intent ID": String(session.payment_intent || ""),
          "Test Confirmed": new Date().toISOString()
        }
      });
    }
    return { confirmed: true, testOnly: true, count, amountCents: count * PNO_QA_CENTS };
  }
  return { confirmed: false, pending: true, testOnly: true, count };
}

// Stripe TEST MODE ONLY. Never use live seminar waivers, real registrations or live payment records.
export const SEMINAR_QA_TABLE = "tbluOzsgn6viooYxN";
export const SEMINAR_QA_SOURCE = "btmma_seminar_stripe_test_v1";
export const SEMINAR_QA_EMAIL = "seminar-payment-test@example.com";
export const SEMINAR_QA_TICKETS = Object.freeze({
  united: Object.freeze({
    title: "United by Purpose",
    date: "November 15, 2026",
    tickets: Object.freeze({
      general: Object.freeze({ title: "General Admission", cents: 5000 }),
      supporter: Object.freeze({ title: "Community Supporter", cents: 7500 }),
      sponsor: Object.freeze({ title: "Flame Sponsor", cents: 10000 })
    })
  }),
  nerve: Object.freeze({
    title: "Striking a Nerve",
    date: "November 21–22, 2026",
    tickets: Object.freeze({
      day1: Object.freeze({ title: "Day 1 — Kenpo (Nov 21)", cents: 10000 }),
      day2: Object.freeze({ title: "Day 2 — Martial Arts (Nov 22)", cents: 10000 }),
      both: Object.freeze({ title: "Both Days", cents: 19000 })
    })
  })
});
export const seminarQaEnabled = env =>
  env.SEMINAR_TEST_CHECKOUT_ENABLED === "true" &&
  /^sk_test_[A-Za-z0-9_-]+$/.test(String(env.STRIPE_SECRET_KEY || "")) &&
  Boolean(env.AIRTABLE_API_TOKEN && env.AIRTABLE_BASE_ID);

export async function seminarQaAirtable(env, path = "", method = "GET", data) {
  const url = "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" + SEMINAR_QA_TABLE + path;
  const r = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN, "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  if (!r.ok) {
    console.error("Seminar QA Airtable failure", { method, status: r.status });
    throw new Error("Could not save or verify seminar TEST registration.");
  }
  return r.json();
}
export async function reconcileSeminarQa(env, id, failed = false) {
  if (!seminarQaEnabled(env) || !/^cs_test_[A-Za-z0-9_]{10,180}$/.test(id || ""))
    throw new Error("Seminar test payment verification is unavailable.");
  const stripeResult = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY }
  });
  if (!stripeResult.ok) throw new Error("Could not verify seminar test payment with Stripe.");
  const session = await stripeResult.json();
  const meta = session.metadata || {};
  const event = SEMINAR_QA_TICKETS[meta.event];
  const ticket = event?.tickets[meta.ticket];
  const count = Number(meta.attendee_count);
  const recordId = meta.test_record_id;
  const email = String(session.customer_details?.email || session.customer_email || "").toLowerCase();
  if (session.id !== id || session.livemode !== false ||
      session.mode !== "payment" || session.currency !== "usd" ||
      meta.btmma_source !== SEMINAR_QA_SOURCE ||
      !event || !ticket || !/^rec[A-Za-z0-9]{10,30}$/.test(recordId || "") ||
      !Number.isInteger(count) || count < 1 || count > 6 ||
      session.amount_total !== ticket.cents * count ||
      session.client_reference_id !== recordId || email !== SEMINAR_QA_EMAIL)
    throw new Error("Stripe session does not match an approved seminar test payment.");
  const record = await seminarQaAirtable(env, "/" + encodeURIComponent(recordId));
  const f = record.fields || {};
  if (f.Seminar !== event.title + " (TEST ONLY)" || f.Ticket !== ticket.title ||
      f["Stripe Test Session ID"] !== id ||
      Number(f["Attendee Count"]) !== count ||
      String(f["Test Email"] || "").toLowerCase() !== SEMINAR_QA_EMAIL ||
      Math.round(Number(f["Amount (Simulated)"]) * 100) !== count * ticket.cents)
    throw new Error("Test payment and test-only Airtable record do not match.");
  if (session.payment_status === "paid") {
    if (f["Payment Status"] !== "TEST PAID") {
      await seminarQaAirtable(env, "/" + encodeURIComponent(recordId), "PATCH", {
        fields: {
          "Payment Status": "TEST PAID",
          "Stripe Test Payment Intent ID": typeof session.payment_intent === "string" ? session.payment_intent : "",
          "Confirmed At": new Date().toISOString()
        }
      });
    }
    return { confirmed: true, testOnly: true, event: meta.event, ticket: meta.ticket, count, amountCents: ticket.cents * count };
  }
  if (failed && f["Payment Status"] !== "TEST PAID") {
    await seminarQaAirtable(env, "/" + encodeURIComponent(recordId), "PATCH", {
      fields: { "Payment Status": "TEST FAILED" }
    });
    return { confirmed: false, failed: true, testOnly: true, event: meta.event, ticket: meta.ticket, count };
  }
  return { confirmed: false, pending: true, testOnly: true, event: meta.event, ticket: meta.ticket, count };
}

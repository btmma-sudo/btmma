import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSeminarPayment } from "../src/lib/seminar-payment-reconciliation.js";

const sessionId = "cs_live_abcdefghijklmnop";
const groupId = "8bb4e1a4-03a2-44e3-8f68-c763c8275ce3";
const env = {
  AIRTABLE_BASE_ID: "appFAKEFAKEFAKE00",
  AIRTABLE_API_TOKEN: "fake-airtable-key",
  STRIPE_LIVE_SECRET_KEY: "sk_live_fake-key"
};
const baseSession = () => ({
  id: sessionId,
  livemode: true,
  mode: "payment",
  currency: "usd",
  amount_total: 5000,
  payment_status: "paid",
  client_reference_id: "seminar_example",
  customer_details: { email: "guardian@example.com" },
  metadata: {
    btmma_source: "btmma_seminar_live_v1",
    event: "united",
    ticket: "general",
    attendee_count: "1",
    attendee_names: "Test Student",
    waiver_group_id: groupId,
    waiver_version: "test-v1"
  }
});
const baseWaiver = () => ({
  id: "recABCDEFGHIJKLMN",
  fields: {
    "Group ID": groupId,
    Seminar: "united",
    Ticket: "general",
    Attendee: "Test Student",
    "Contact Email": "guardian@example.com",
    "Waiver Version": "test-v1",
    "Electronic Consent": true,
    "Acknowledged Risks": true,
    "Waiver Full Text": "Testing signed waiver",
    "Electronic Signature": "Test Student",
    "Checkout Status": "Awaiting seminar payment verification"
  }
});
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function runMock(session, waiver, callback) {
  const previousFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    if (address.startsWith("https://api.stripe.com/v1/checkout/sessions/"))
      return response(session);
    if (address.startsWith("https://api.airtable.com/v0/")) {
      if (options.method === "PATCH") {
        const payload = JSON.parse(options.body);
        writes.push(payload);
        return response({ records: payload.records.map(r => ({ id: r.id })) });
      }
      return response({ records: [waiver] });
    }
    throw new Error("Unexpected request: " + address);
  };
  try {
    return await callback(writes);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("verified paid seminar sets Airtable waiver payment status", async () => {
  await runMock(baseSession(), baseWaiver(), async writes => {
    const result = await reconcileSeminarPayment(env, sessionId);
    assert.deepEqual(result, { confirmed: true, attendeeCount: 1, amountCents: 5000 });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].records[0].fields["Checkout Status"], "Paid via Stripe: " + sessionId);
  });
});

test("repeated paid event leaves already reconciled waivers unchanged", async () => {
  const waiver = baseWaiver();
  waiver.fields["Checkout Status"] = "Paid via Stripe: " + sessionId;
  await runMock(baseSession(), waiver, async writes => {
    assert.equal((await reconcileSeminarPayment(env, sessionId)).confirmed, true);
    assert.equal(writes.length, 0);
  });
});

test("unpaid session cannot mark waiver paid", async () => {
  const session = baseSession();
  session.payment_status = "unpaid";
  await runMock(session, baseWaiver(), async writes => {
    const result = await reconcileSeminarPayment(env, sessionId);
    assert.equal(result.pending, true);
    assert.equal(writes.length, 0);
  });
});

test("reject price tampering and do not write to Airtable", async () => {
  const session = baseSession();
  session.amount_total = 1;
  await runMock(session, baseWaiver(), async writes => {
    await assert.rejects(reconcileSeminarPayment(env, sessionId), /does not match/);
    assert.equal(writes.length, 0);
  });
});

test("do not overwrite a waiver previously marked paid elsewhere", async () => {
  const waiver = baseWaiver();
  waiver.fields["Checkout Status"] = "Paid via Zelle";
  await runMock(baseSession(), waiver, async writes => {
    await assert.rejects(reconcileSeminarPayment(env, sessionId), /different payment/);
    assert.equal(writes.length, 0);
  });
});

test("failed asynchronous payment records failure but not a paid status", async () => {
  const session = baseSession();
  session.payment_status = "unpaid";
  await runMock(session, baseWaiver(), async writes => {
    const result = await reconcileSeminarPayment(env, sessionId, true);
    assert.equal(result.failed, true);
    assert.equal(writes.length, 1);
    assert.match(writes[0].records[0].fields["Checkout Status"], /^Stripe payment failed:/);
  });
});

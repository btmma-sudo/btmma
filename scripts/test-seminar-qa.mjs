import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSeminarQa, SEMINAR_QA_TICKETS, SEMINAR_QA_SOURCE, SEMINAR_QA_EMAIL, SEMINAR_QA_TABLE } from "../src/lib/seminar-test-checkout.js";

const env = {
  SEMINAR_TEST_CHECKOUT_ENABLED: "true",
  AIRTABLE_BASE_ID: "appFAKEFAKEFAKE00",
  AIRTABLE_API_TOKEN: "fake-token",
  STRIPE_SECRET_KEY: "sk_test_fake"
};
const ref = "cs_test_abcdefghijklmnop";
const registration = "recABCDEFGHIJKLMN";
const resp = (x, status=200) => new Response(JSON.stringify(x), {status,headers:{"content-type":"application/json"}});
const scenario = (event,ticket,count=1) => {
  const e=SEMINAR_QA_TICKETS[event];
  const t=e.tickets[ticket];
  return {
    session: {
      id: ref, livemode: false, mode: "payment", currency: "usd",
      payment_status: "paid",
      amount_total: t.cents * count, client_reference_id: registration,
      customer_details: { email: SEMINAR_QA_EMAIL },
      metadata: {
        btmma_source: SEMINAR_QA_SOURCE, event, ticket, attendee_count: String(count),
        test_record_id: registration
      },
      payment_intent: "pi_TESTPAYER123456789"
    },
    row: { id:registration, fields: {
      Seminar: e.title + " (TEST ONLY)", Ticket: t.title,
      "Test Email": SEMINAR_QA_EMAIL, "Stripe Test Session ID": ref,
      "Attendee Count": count, "Amount (Simulated)": t.cents * count / 100,
      "Payment Status": "Test checkout opened"
    } }
  };
};
async function mock(payload, action) {
  const prior=globalThis.fetch;
  const writes=[], addresses=[];
  globalThis.fetch=async (url,opts={})=>{
    const address=String(url);
    addresses.push(address);
    if(address.startsWith("https://api.stripe.com/v1/checkout/sessions/"))return resp(payload.session);
    if(address.startsWith("https://api.airtable.com/v0/")) {
      assert.ok(address.includes("/"+SEMINAR_QA_TABLE+"/"),"Write must use seminar QA table ONLY");
      if(opts.method==="PATCH"){
        const data=JSON.parse(opts.body);
        writes.push(data);
        payload.row.fields={...payload.row.fields,...data.fields};
        return resp({id:registration,fields:payload.row.fields});
      }
      return resp(payload.row);
    }
    throw Error("Unexpected endpoint "+address);
  };
  try { return await action(writes,addresses); }
  finally {globalThis.fetch=prior;}
}
test("United by Purpose General Admission test paid and idempotent",async()=>{
  const data=scenario("united","general");
  await mock(data,async(writes)=>{
    assert.deepEqual(await reconcileSeminarQa(env,ref),{
      confirmed:true,testOnly:true,event:"united",ticket:"general",count:1,amountCents:5000
    });
    assert.equal(writes.length,1);
    assert.equal(writes[0].fields["Payment Status"],"TEST PAID");
    await reconcileSeminarQa(env,ref);
    assert.equal(writes.length,1,"Retry must not duplicate the write");
  });
});
test("Striking a Nerve both-days test paid at $190",async()=>{
  await mock(scenario("nerve","both"),async writes=>{
    const actual=await reconcileSeminarQa(env,ref);
    assert.equal(actual.confirmed,true);
    assert.equal(actual.amountCents,19000);
    assert.equal(writes.length,1);
    assert.equal(writes[0].fields["Payment Status"],"TEST PAID");
  });
});
test("Other test ticket prices match the live catalog",()=>{
  assert.equal(SEMINAR_QA_TICKETS.united.tickets.supporter.cents,7500);
  assert.equal(SEMINAR_QA_TICKETS.united.tickets.sponsor.cents,10000);
  assert.equal(SEMINAR_QA_TICKETS.nerve.tickets.day1.cents,10000);
  assert.equal(SEMINAR_QA_TICKETS.nerve.tickets.day2.cents,10000);
});
test("Unpaid checkout does not mark test record paid",async()=>{
  const s=scenario("united","general");
  s.session.payment_status="unpaid";
  await mock(s,async writes=>{
    assert.equal((await reconcileSeminarQa(env,ref)).pending,true);
    assert.equal(writes.length,0);
  });
});
test("Reject mismatched amount and never touch Airtable",async()=>{
  const s=scenario("nerve","both");
  s.session.amount_total=1;
  await mock(s,async(writes,urls)=>{
    await assert.rejects(reconcileSeminarQa(env,ref),/does not match/);
    assert.equal(writes.length,0);
    assert.equal(urls.filter(x=>x.includes("airtable.com")).length,0);
  });
});
test("Reject live Stripe sessions from test payment endpoint",async()=>{
  const s=scenario("united","general");
  s.session.livemode=true;
  await mock(s,async writes=>{
    await assert.rejects(reconcileSeminarQa(env,ref),/does not match/);
    assert.equal(writes.length,0);
  });
});

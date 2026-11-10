import test from "node:test";
import assert from "node:assert/strict";
import {trustedHostedInvoiceUrl,verifiedFamilyInvoices,verifiedAutopay} from "../src/lib/student-portal-tuition.js";
import {TUITION_BILLING_RELEASED} from "../src/lib/tuition-billing-launch.js";

const customer = "cus_abc123";
const invoice = {
  livemode:true, customer, currency:"usd", status:"open", amount_remaining:18900,
  number:"BT-001", due_date:1794441600,
  hosted_invoice_url:"https://invoice.stripe.com/i/acct_123/in_456?s=ap"
};

test("billing cannot launch just by setting an environment flag", () => {
  assert.equal(TUITION_BILLING_RELEASED,false);
});
test("matching live open invoice has a secure Pay Now destination", () => {
  const rows=verifiedFamilyInvoices([invoice],customer);
  assert.equal(rows.length,1);
  assert.equal(rows[0].balance,"$189.00");
  assert.equal(rows[0].payNowUrl, invoice.hosted_invoice_url);
});
test("other households, test invoices, and wrong currency are excluded", () => {
  assert.deepEqual(verifiedFamilyInvoices([
    {...invoice,customer:"cus_someoneelse"},
    {...invoice,livemode:false},
    {...invoice,currency:"eur"}
  ],customer),[]);
});
test("paid and draft invoices cannot present Pay Now", () => {
  assert.equal(verifiedFamilyInvoices([{...invoice,status:"paid"}],customer)[0].payNowUrl,"");
  assert.equal(verifiedFamilyInvoices([{...invoice,status:"draft"}],customer)[0].payNowUrl,"");
  assert.equal(verifiedFamilyInvoices([{...invoice,amount_remaining:0}],customer)[0].payNowUrl,"");
});
test("only Stripe's HTTPS invoice host is allowed", () => {
  const unsafe=[
    "http://invoice.stripe.com/i/123",
    "https://invoice.stripe.com.evil.test/i/123",
    "https://invoice.stripe.com@evil.test/i/123",
    "https://invoice.stripe.com:444/i/123",
    "javascript:alert(1)",
    "https://invoice.stripe.com/other/123"
  ];
  unsafe.forEach(url=>assert.equal(trustedHostedInvoiceUrl(url),""));
});
test("no AutoPay badge for other households, test mode or monthly prices", () => {
  const active={livemode:true,customer,status:"active",collection_method:"charge_automatically",
    items:{data:[{price:{recurring:{interval:"week",interval_count:4}},
      current_period_end:1794441600}]}};
  assert.equal(verifiedAutopay([active],customer).active,true);
  assert.equal(verifiedAutopay([{...active,customer:"cus_other"}],customer).active,false);
  assert.equal(verifiedAutopay([{...active,livemode:false}],customer).active,false);
  assert.equal(verifiedAutopay([{...active,collection_method:"send_invoice"}],customer).active,false);
  assert.equal(verifiedAutopay([{...active,pause_collection:{behavior:"void"}}],customer).active,false);
  assert.equal(verifiedAutopay([{...active,items:{data:[{price:{recurring:{interval:"month",interval_count:1}}}]} }],customer).active,false);
});

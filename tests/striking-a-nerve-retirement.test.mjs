import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POST as ticketPOST } from "../src/pages/api/seminar-checkout.js";
import { POST as waiverPOST } from "../src/pages/api/seminar-waiver-sign.js";
import { POST as testTicketPOST } from "../src/pages/api/seminar-test-checkout.js";
import { POST as donationPOST } from "../src/pages/api/seminar-donation-checkout.js";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const origin = "https://burningtreemma.com";
const env = {
  LIVE_CHECKOUT_ENABLED: "true",
  STRIPE_LIVE_SECRET_KEY: "sk_live_SIMULATED",
  STRIPE_SECRET_KEY: "sk_test_SIMULATED",
  SEMINAR_TEST_CHECKOUT_ENABLED: "true",
  AIRTABLE_API_TOKEN: "simulated",
  AIRTABLE_BASE_ID: "simulated",
  TURNSTILE_SECRET_KEY: "simulated"
};
const makeRequest = (path, data) => new Request(origin + path, {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify(data)
});
test("Events page retains Build a Flame and donations, not the retired seminar funnel", async () => {
  const page = await read("src/pages/seminars.astro");
  assert.match(page, /id="build-a-flame"/);
  assert.match(page, /href="\/build-a-flame\/"/);
  assert.match(page, /<SeminarDonations \/>/);
  assert.doesNotMatch(page, /Striking a Nerve|striking-a-nerve|event=nerve/i);
  assert.doesNotMatch(page, /id="seminar-form"|id="seminar-ticket"|id="registration-result"/);
  assert.doesNotMatch(page, /\/api\/seminar-checkout|\/api\/seminar-waiver-sign/);
  assert.match(page, /object-fit:\s*contain/);
});
test("Retired public test funnel redirects to current Events page", async () => {
  const page = await read("src/pages/seminar-payment-test.astro");
  assert.match(page, /Astro\.redirect\("\/seminars\/", 301\)/);
  assert.doesNotMatch(page, /<form|Striking a Nerve/i);
});
test("Only general school donations offered, without retired seminar option", async () => {
  const form = await read("src/components/SeminarDonations.astro");
  const api = await read("src/pages/api/seminar-donation-checkout.js");
  assert.match(form, /value="general"/);
  assert.doesNotMatch(form, /Striking a Nerve|value="nerve"/);
  assert.doesNotMatch(api, /nerve:\s*"/);
});
test("Live ticket API rejects direct retired event requests before reaching Stripe", async () => {
  const request = makeRequest("/api/seminar-checkout", { event: "nerve", ticket: "day1" });
  const res = await ticketPOST({ request, locals: { runtime: { env } } });
  assert.equal(res.status, 410);
  assert.match((await res.json()).error, /removed/);
});
test("Retired event cannot accept new electronic waiver signatures", async () => {
  const request = makeRequest("/api/seminar-waiver-sign", { event: "nerve", ticket: "day1" });
  const res = await waiverPOST({ request, locals: { runtime: { env } } });
  assert.equal(res.status, 410);
});
test("Retired event cannot create test checkout sessions", async () => {
  const request = makeRequest("/api/seminar-test-checkout", { event: "nerve", ticket: "day1" });
  const res = await testTicketPOST({ request, locals: { runtime: { env } } });
  assert.equal(res.status, 410);
});
test("Retired event cannot receive new dedicated donation checkout", async () => {
  const request = makeRequest("/api/seminar-donation-checkout", { amountCents: 2500, purpose: "nerve" });
  const res = await donationPOST({ request, locals: { runtime: { env } } });
  assert.equal(res.status, 400);
});
test("Historical Stripe confirmation and signed waiver data are preserved", async () => {
  const status = await read("src/pages/api/seminar-checkout-status.js");
  const donationStatus = await read("src/pages/api/seminar-donation-status.js");
  const reconcile = await read("src/lib/seminar-payment-reconciliation.js");
  const waivers = await read("src/data/seminar-waivers.js");
  assert.match(status, /nerve:\s*\{/);
  assert.match(donationStatus, /"nerve"/);
  assert.match(reconcile, /nerve:\s*\{/);
  assert.match(waivers, /nerve:\s*\{/);
});

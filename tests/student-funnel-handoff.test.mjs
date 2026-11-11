import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sendInquiryAcknowledgement } from "../src/lib/inquiry-acknowledgement.js";

const recordId = "recABCDEFGHIJKLMN";
const env = { RESEND_API_KEY: "test_secret_not_live" };

test("inquiries without a verified email, record or Resend key send nothing", async () => {
  const prior = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true }; };
  try {
    assert.equal(await sendInquiryAcknowledgement({}, { email: "parent@example.com", recordId }), false);
    assert.equal(await sendInquiryAcknowledgement(env, { email: "not-an-email", recordId }), false);
    assert.equal(await sendInquiryAcknowledgement(env, { email: "parent@example.com", recordId: "unknown" }), false);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = prior; }
});

test("the receipt email sends once per Airtable record, without creating a booking", async () => {
  const prior = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200 };
  };
  try {
    assert.equal(await sendInquiryAcknowledgement(env, { email: "parent@example.com", recordId }), true);
    assert.equal(captured.url, "https://api.resend.com/emails");
    assert.equal(captured.options.headers["Idempotency-Key"], "btmma-inquiry-received/" + recordId);
    const payload = JSON.parse(captured.options.body);
    assert.equal(payload.to[0], "parent@example.com");
    assert.match(payload.text, /your-first-class\//);
    assert.match(payload.text, /does not book a class or create a paid membership/);
    assert.doesNotMatch(payload.text, /Stripe|card number|automatic tuition/i);
  } finally { globalThis.fetch = prior; }
});

test("email rejection does not imply that a welcome email was sent", async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403 });
  try {
    assert.equal(await sendInquiryAcknowledgement(env, { email: "parent@example.com", recordId }), false);
  } finally { globalThis.fetch = prior; }
});

test("funnel handoff routes and consent protections remain in place", () => {
  const leadForm = readFileSync(new URL("../src/components/LeadForm.astro", import.meta.url), "utf8");
  const trial = readFileSync(new URL("../src/lib/trial-confirmation.js", import.meta.url), "utf8");
  const receiptRoute = readFileSync(new URL("../src/pages/verify-turnstile.ts", import.meta.url), "utf8");
  const firstClass = readFileSync(new URL("../src/pages/your-first-class.astro", import.meta.url), "utf8");
  assert.match(leadForm, /data-inquiry-next/);
  assert.match(leadForm, /status\.dataset\.state = "success";[\s\S]{0,130}nextStep/);
  assert.match(receiptRoute, /if \(emailAccepted\)/);
  assert.match(receiptRoute, /\[FIELDS\.welcomeEmailSent\]: true/);
  assert.match(receiptRoute, /smsConsent = !isClassHelp/);
  assert.match(trial, /your-first-class\//);
  assert.match(firstClass, /\$29/);
});

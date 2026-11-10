import test from "node:test";
import assert from "node:assert/strict";
import {videoConnectionStatus,videoConfig} from "../src/lib/instructor-video-manager.js";

const accountId="8e02c7d83617c031226f11bf37def965";
const cloudflareToken="valid-private-stream-token-for-offline-test-only";
const check=(id,token)=>videoConnectionStatus({
  STUDENT_PORTAL_STREAM_ACCOUNT_ID:id,
  STUDENT_PORTAL_STREAM_API_TOKEN:token
});

test("private upload readiness refuses missing or malformed production Stream account ID",()=>{
  assert.equal(videoConnectionStatus(undefined).code,"account_id_missing");
  assert.equal(check("",cloudflareToken).code,"account_id_missing");
  assert.equal(check("not-an-account-id",cloudflareToken).code,"account_id_invalid");
  assert.equal(check(accountId+" ",cloudflareToken).code,"account_id_invalid");
});
test("upload cannot become enabled with a missing, incomplete or Resend email API key",()=>{
  assert.equal(check(accountId,undefined).code,"token_missing");
  assert.equal(check(accountId,"short").code,"token_invalid");
  assert.equal(check(accountId,cloudflareToken+" ").code,"token_invalid");
  assert.equal(check(accountId,"re_resend_email_token_not_for_stream").code,"wrong_token_provider");
  assert.equal(videoConfig({STUDENT_PORTAL_STREAM_ACCOUNT_ID:accountId,STUDENT_PORTAL_STREAM_API_TOKEN:"re_resend_email_token_not_for_stream"}),false);
});
test("configuration readiness preserves private tokens and reports only a safe status",()=>{
  const status=check(accountId,cloudflareToken);
  assert.equal(status.ready,true);
  assert.equal(status.code,"configured");
  assert.equal(videoConfig({
    STUDENT_PORTAL_STREAM_ACCOUNT_ID:accountId,
    STUDENT_PORTAL_STREAM_API_TOKEN:cloudflareToken
  }),true);
  for(const sample of [
    check(accountId,"re_private-dont-log-this-token"),
    check(accountId,cloudflareToken+" "),
    status
  ]){
    const display=JSON.stringify(sample);
    assert.ok(!display.includes(cloudflareToken));
    assert.ok(!display.includes("re_private-dont-log-this-token"));
  }
});

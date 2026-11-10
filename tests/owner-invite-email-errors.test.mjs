import test from "node:test";
import assert from "node:assert/strict";
import {classifyOwnerInviteEmailFailure} from "../src/lib/owner-invite-email-errors.js";

test("Resend error mapping explains the relevant configuration issue without exposing provider details",()=>{
  assert.match(classifyOwnerInviteEmailFailure(401,{name:"invalid_api_key"}).message,/API key.*401/);
  assert.match(classifyOwnerInviteEmailFailure(403,{name:"validation_error"}).message,/Resend Logs.*domain.*permissions/i);
  assert.match(classifyOwnerInviteEmailFailure(422,{name:"validation_error"}).message,/sender.*422/i);
  assert.match(classifyOwnerInviteEmailFailure(429,{}).message,/429/);
  assert.match(classifyOwnerInviteEmailFailure(503,{}).message,/503/);
});
test("untrusted provider error fields cannot leak user email, token, HTML or arbitrary error text",()=>{
  const secret="private-setup-token-1234";
  const details=classifyOwnerInviteEmailFailure(403,{
    name:"validation_error<script>alert(1)</script>",
    message:"Token="+secret+", user=hybridkenpokarate@gmail.com",
    body:{secret}
  });
  assert.equal(details.code,"unknown");
  assert.doesNotMatch(JSON.stringify(details),/Token=|hybridkenpokarate@gmail.com|<script>|private-setup-token/);
  assert.match(details.message,/HTTP 403/);
});

// Focused security tests for private household authentication.
// No live Cloudflare, account, email, or Stripe data are accessed.
import test from "node:test";
import assert from "node:assert/strict";
import {createHmac, pbkdf2Sync, randomBytes} from "node:crypto";
import {PORTAL_PASSWORD_PBKDF2_ITERATIONS} from "../src/lib/student-portal-password-policy.js";
import {
  getPortalEnv, checkPassword, createSessionCookie,
  clearSessionCookie, getPortalAccount, validSameOrigin
} from "../src/lib/student-portal-auth.js";

const id="11111111-2222-4333-8444-555555555555";
const sessionSecret="long-test-session-secret-at-least-32-characters";
const fakeAccount={id,display_name:"Example Family",email:"test@example.invalid",session_version:1,stripe_customer_id:null};
const databaseFor=account=>({
  prepare(sql) {
    assert.match(sql,/WHERE id=\? AND active=1/);
    return {bind(key) { assert.equal(key,id);return {async first(){return account;}}; }};
  }
});
const env={STUDENT_PORTAL_ENABLED:"true",STUDENT_PORTAL_SESSION_SECRET:sessionSecret,LIVE_TRIAL_DB:databaseFor(fakeAccount)};
const requestFor=cookie=>new Request("https://burningtreemma.com/student-portal/",{headers:{cookie}});
function expiredCookie(){
  const payload=Buffer.from(JSON.stringify({id,v:1,exp:100})).toString("base64url");
  const signature=createHmac("sha256",sessionSecret).update(payload).digest("hex");
  return "btmma_student_session="+payload+"."+signature;
}

test("portal config fails closed when runtime flag, secret, or database is missing",()=>{
  assert.equal(getPortalEnv({runtime:{env:{...env,STUDENT_PORTAL_ENABLED:"false"}}}),null);
  assert.equal(getPortalEnv({runtime:{env:{...env,STUDENT_PORTAL_SESSION_SECRET:"short"}}}),null);
  assert.equal(getPortalEnv({runtime:{env:{...env,LIVE_TRIAL_DB:null}}}),null);
  assert.ok(getPortalEnv({runtime:{env}}));
});
test("PBKDF2 hash verification accepts the right private password",async()=>{
  const password="very-long-guardian-password", salt=randomBytes(16);
  const hash=pbkdf2Sync(password,salt,PORTAL_PASSWORD_PBKDF2_ITERATIONS,32,"sha256").toString("hex");
  assert.equal(await checkPassword(password,salt.toString("hex"),hash),true);
  assert.equal(await checkPassword("incorrect-guardian-password",salt.toString("hex"),hash),false);
});
test("a signed session authenticates only the matching active household",async()=>{
  const cookie=await createSessionCookie(env,fakeAccount);
  assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await getPortalAccount(requestFor(cookie),env))?.id,id);
  assert.equal(await getPortalAccount(requestFor(cookie),{...env,LIVE_TRIAL_DB:databaseFor(null)}),null);
});
test("forged, expired and invalidated sessions never identify a household",async()=>{
  const cookie=await createSessionCookie(env,fakeAccount);
  const tampered=cookie.replace(/([a-f0-9]); Path=/,(_,digit)=> (digit==="f"?"e":"f")+"; Path=");
  assert.notEqual(tampered,cookie);
  assert.equal(await getPortalAccount(requestFor(tampered),env),null);
  assert.equal(await getPortalAccount(requestFor(expiredCookie()),env),null);
  assert.equal(await getPortalAccount(requestFor(cookie),{...env,LIVE_TRIAL_DB:databaseFor({...fakeAccount,session_version:2})}),null);
  assert.equal(await getPortalAccount(requestFor("btmma_student_session=abc.def"),env),null);
});
test("sign-out invalidates only the household session cookie",()=>{
  assert.match(clearSessionCookie(),/^btmma_student_session=; Path=\/; Max-Age=0;/);
});
test("portal mutation requires the actual same origin",()=>{
  const url="https://burningtreemma.com/api/student-portal/login";
  assert.equal(validSameOrigin(new Request(url,{headers:{origin:"https://burningtreemma.com"}})),true);
  assert.equal(validSameOrigin(new Request(url,{headers:{origin:"https://evil.example"}})),false);
  assert.equal(validSameOrigin(new Request(url)),false);
});

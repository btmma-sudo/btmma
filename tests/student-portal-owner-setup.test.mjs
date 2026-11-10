import test from "node:test";
import assert from "node:assert/strict";
import {
  OWNER_EMAIL,OWNER_INVITE_ACTION,ownerInviteSchema,
  validOwnerToken,validOwnerPassword,generateOwnerToken,
  digestToken,passwordDigest,firstOwnerNotYetPresent
} from "../src/lib/student-portal-owner-setup.js";
import {validPortalChallenge} from "../src/lib/student-portal-turnstile.js";
import {checkPassword} from "../src/lib/student-portal-auth.js";
import {POST as complete} from "../src/pages/api/student-portal/owner-setup/complete.js";
import {POST as requestInvite} from "../src/pages/api/student-portal/owner-setup/request.js";

const domain="https://burningtreemma.com";
const credentials={STUDENT_PORTAL_ENABLED:"true",
  STUDENT_PORTAL_SESSION_SECRET:"test-secret-not-used-in-production-and-at-least-32",
  TURNSTILE_SECRET_KEY:"fake_turnstile_secret",STUDENT_PORTAL_RESEND_API_KEY:"fake_portal_resend_key"};
function queryDb(ticket){
  const db={statements:[],batchCalls:0,
    prepare(sql){
      this.statements.push(sql);
      return {
        bind(...args){return{first:async()=>null,run:async()=>({success:true,meta:{changes:1}})};},
        first:async()=>{
          if(sql.includes("portal_owner_setup_challenges"))return ticket||null;
          return null;
        },
        run:async()=>({success:true,meta:{changes:1}})
      };
    },
    batch:async statements=>{
      db.batchCalls+=1;
      assert.equal(statements.length,3);
      return Array.from({length:3},()=>({success:true,meta:{changes:1}}));
    }
  };
  return db;
}
const locals=db=>({runtime:{env:{...credentials,LIVE_TRIAL_DB:db}}});

test("owner destination is the approved exact mailbox; challenge is separately scoped",()=>{
  assert.equal(OWNER_EMAIL,"hybridkenpokarate@gmail.com");
  assert.equal(validPortalChallenge({success:true,hostname:"burningtreemma.com",action:OWNER_INVITE_ACTION},
    domain+"/api/student-portal/owner-setup/request",OWNER_INVITE_ACTION),true);
  assert.equal(validPortalChallenge({success:true,hostname:"burningtreemma.com",action:"student_portal_login"},
    domain+"/api/student-portal/owner-setup/request",OWNER_INVITE_ACTION),false);
});
test("owner tokens use 32 cryptographic random bytes, hashed at rest",async()=>{
  const a=generateOwnerToken(),b=generateOwnerToken();
  assert.ok(validOwnerToken(a));
  assert.notEqual(a,b);
  assert.ok(/^[a-f0-9]{64}$/.test(await digestToken(a)));
  assert.notEqual(await digestToken(a),a);
  assert.equal(validOwnerToken("not-a-token"),false);
});
test("setup passwords use the same PBKDF2 format as the normal portal login",async()=>{
  assert.equal(validOwnerPassword("short"),false);
  assert.equal(validOwnerPassword("a".repeat(12)),true);
  assert.equal(validOwnerPassword("a\n".repeat(6)),false);
  const pw="unique-safe-test-owner-password-123";
  const result=await passwordDigest(pw);
  assert.match(result.salt,/^[a-f0-9]{32}$/);
  assert.match(result.hash,/^[a-f0-9]{64}$/);
  assert.equal(await checkPassword(pw,result.salt,result.hash),true);
  assert.equal(await checkPassword("not-the-password",result.salt,result.hash),false);
});
test("setup schema adds only a separate private challenge table",()=>{
  assert.match(ownerInviteSchema,/CREATE TABLE IF NOT EXISTS portal_owner_setup_challenges/);
  assert.doesNotMatch(ownerInviteSchema,/DROP|DELETE|ALTER|STRIPE|trial_registrations/i);
});
test("existing owner email or an existing publisher blocks first-owner bootstrap",async()=>{
  const db={prepare(sql){
    return{bind(){return{first:async()=>({found:1})};},first:async()=>({found:1})};
  }};
  assert.equal(await firstOwnerNotYetPresent(db),false);
});
test("expired or malformed invite is rejected before any database mutation",async()=>{
  const db=queryDb({token_hash:"a".repeat(64),expires_at:100,used_at:null});
  const body={token:"b".repeat(64),password:"new-unique-owner-password-123"};
  const request=new Request(domain+"/api/student-portal/owner-setup/complete",{
    method:"POST",headers:{"Origin":domain,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const response=await complete({request,locals:locals(db)});
  assert.equal(response.status,403);
  assert.equal(db.batchCalls,0);
});
test("one verified invite creates a staff account transaction and issues secure login cookie",async()=>{
  const token=generateOwnerToken(),hash=await digestToken(token);
  const db=queryDb({token_hash:hash,expires_at:Math.floor(Date.now()/1000)+600,used_at:null});
  const request=new Request(domain+"/api/student-portal/owner-setup/complete",{
    method:"POST",headers:{"Origin":domain,"Content-Type":"application/json"},
    body:JSON.stringify({token,password:"unique-safe-owner-password-123"})
  });
  const response=await complete({request,locals:locals(db)});
  assert.equal(response.status,200);
  assert.equal(db.batchCalls,1);
  assert.match(response.headers.get("set-cookie")||"",/HttpOnly; Secure; SameSite=Lax/);
  assert.deepEqual(await response.json(),{ok:true,redirect:"/student-portal/"});
});
test("email request only sends the private #token link to the approved owner email",async()=>{
  const db=queryDb();
  const challenge="turnstile-simulated-token";
  let delivered=null;
  let authHeader=null;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async (url,opts)=>{
    if(String(url).includes("turnstile/v0/siteverify"))
      return new Response(JSON.stringify({success:true,hostname:"burningtreemma.com",action:OWNER_INVITE_ACTION}),{
        status:200,headers:{"Content-Type":"application/json"}
      });
    if(String(url).includes("api.resend.com/emails")){
      delivered=JSON.parse(opts.body);
      authHeader=opts.headers?.Authorization;
      return new Response(JSON.stringify({id:"fake-email-id"}),{status:200});
    }
    throw Error("Unexpected network target");
  };
  try{
    const form=new FormData();form.set("cf-turnstile-response",challenge);
    const request=new Request(domain+"/api/student-portal/owner-setup/request",{
      method:"POST",headers:{"Origin":domain},body:form
    });
    const response=await requestInvite({request,locals:locals(db)});
    assert.equal(response.status,200);
    assert.deepEqual(delivered?.to,[OWNER_EMAIL]);
    assert.equal(delivered?.from,"Burning Tree Student Portal <noreply@portal.burningtreemma.com>");
    assert.equal(authHeader,"Bearer fake_portal_resend_key");
    assert.match(delivered.html,/\/student-portal\/setup-owner\/#token=[a-f0-9]{64}/);
    assert.ok(!JSON.stringify(await response.json()).includes("#token="));
  }finally{globalThis.fetch=oldFetch;}
});

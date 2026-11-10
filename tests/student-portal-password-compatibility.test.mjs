import test from "node:test";
import assert from "node:assert/strict";
import {pbkdf2Sync} from "node:crypto";
import {spawnSync} from "node:child_process";
import {PORTAL_PASSWORD_PBKDF2_ITERATIONS as ITERATIONS} from "../src/lib/student-portal-password-policy.js";
import {passwordDigest} from "../src/lib/student-portal-owner-setup.js";
import {checkPassword} from "../src/lib/student-portal-auth.js";

const PASSWORD="unique-secure-test-password-very-long-123";

test("PBKDF2 iteration count stays within Cloudflare Workers Web Crypto ceiling",()=>{
  assert.equal(ITERATIONS,100_000);
  assert.ok(ITERATIONS>0 && ITERATIONS<=100_000);
});

test("Worker owner password hashing and portal login use same capped KDF",async()=>{
  const original=crypto.subtle.deriveBits;
  const captured=[];
  let replaced=false;
  try{
    crypto.subtle.deriveBits=function(algorithm,...args){
      if(algorithm?.name==="PBKDF2"){
        captured.push(algorithm.iterations);
        if(algorithm.iterations>100_000)
          throw new DOMException("Workers: unsupported PBKDF2 iteration count","NotSupportedError");
      }
      return original.call(this,algorithm,...args);
    };
    replaced=crypto.subtle.deriveBits!==original;
    const {salt,hash}=await passwordDigest(PASSWORD);
    assert.equal(await checkPassword(PASSWORD,salt,hash),true);
    assert.equal(await checkPassword("wrong-but-adequately-long",salt,hash),false);
    assert.equal(
      hash,pbkdf2Sync(PASSWORD,Buffer.from(salt,"hex"),ITERATIONS,32,"sha256").toString("hex")
    );
    if(replaced)assert.deepEqual(captured,[100_000,100_000,100_000]);
  }finally {
    if(replaced)crypto.subtle.deriveBits=original;
  }
});

function run(script,...args){
  return spawnSync(process.execPath,[script,...args],{
    encoding:"utf8",timeout:30000,
    env:{...process.env,PORTAL_PASSWORD:PASSWORD}
  });
}
test("staff-only provisioning outputs hash usable by Cloudflare portal login",async()=>{
  const r=run("scripts/provision-student-portal-account.mjs","Verified Guardian","guardian@example.invalid");
  assert.equal(r.status,0,r.stderr);
  const hashMatch=r.stdout.match(/'([0-9a-f]{32})','([0-9a-f]{64})',1\);/);
  assert.ok(hashMatch,"Password salt and hash present");
  assert.equal(await checkPassword(PASSWORD,hashMatch[1],hashMatch[2]),true);
});
test("staff-only password reset outputs hash usable by Cloudflare portal login",async()=>{
  const r=run("scripts/reset-student-portal-password.mjs","guardian@example.invalid");
  assert.equal(r.status,0,r.stderr);
  const hashMatch=r.stdout.match(/password_salt='([0-9a-f]{32})',password_hash='([0-9a-f]{64})'/);
  assert.ok(hashMatch,"Password salt and hash present");
  assert.equal(await checkPassword(PASSWORD,hashMatch[1],hashMatch[2]),true);
});

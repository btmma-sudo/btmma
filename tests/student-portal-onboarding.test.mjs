import test from "node:test";
import assert from "node:assert/strict";
import {validPortalChallenge,PORTAL_TURNSTILE_ACTION} from "../src/lib/student-portal-turnstile.js";
import {spawnSync} from "node:child_process";

const url="https://burningtreemma.com/api/student-portal/login";
const verified={success:true,hostname:"burningtreemma.com",action:PORTAL_TURNSTILE_ACTION};

test("login requires successful siteverify for its canonical hostname and unique action",()=>{
  assert.equal(validPortalChallenge(verified,url),true);
  assert.equal(validPortalChallenge({...verified,success:false},url),false);
  assert.equal(validPortalChallenge({...verified,hostname:"other-site.example"},url),false);
  assert.equal(validPortalChallenge({...verified,action:"trial_signup"},url),false);
  assert.equal(validPortalChallenge({...verified,action:""},url),false);
  assert.equal(validPortalChallenge(null,url),false);
  assert.equal(validPortalChallenge(verified,"http://burningtreemma.com/api/student-portal/login"),false);
  assert.equal(validPortalChallenge(verified,"https://example.org/api/student-portal/login"),false);
  assert.equal(validPortalChallenge(verified,"garbled url"),false);
});

const run=(...args)=>spawnSync(process.execPath,["scripts/add-student-to-portal.mjs",...args],{encoding:"utf8"});
test("approved student script outputs only targeted, family-scoped SQL and no external actions",()=>{
  const r=run("guardian@example.invalid","Ava O'Connor","American Kenpo Karate","Yellow Belt");
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/INSERT INTO portal_students/);
  assert.match(r.stdout,/a.email='guardian@example.invalid' AND a.active=1/);
  assert.match(r.stdout,/Ava O''Connor/);
  assert.match(r.stdout,/INSERT OR IGNORE INTO portal_lesson_access/);
  assert.match(r.stdout,/l.published=1/);
  assert.match(r.stdout,/s.active=1/);
  assert.match(r.stdout,/l.belt_level='All Levels'/);
  assert.match(r.stdout,/matching_student_count/);
  assert.doesNotMatch(r.stdout,/\bDELETE\b|\bDROP\b|\bUPDATE\b/i);
});

test("student onboarding rejects program/rank overreach and invalid identities",()=>{
  for(const args of [
    ["guardian@example.invalid","Ava","American Kenpo Karate","All Levels"],
    ["guardian@example.invalid","Ava","Unsafe Unknown Program","Yellow Belt"],
    ["guardian@example.invalid","Ava","American Kenpo Karate","Purple-Striped Unknown Belt"],
    ["not-an-email","Ava","American Kenpo Karate","Yellow Belt"],
    ["guardian@example.invalid","x","American Kenpo Karate","Yellow Belt"]
  ]){
    const r=run(...args);
    assert.notEqual(r.status,0,args.join(" "));
    assert.equal(r.stdout,"");
  }
});

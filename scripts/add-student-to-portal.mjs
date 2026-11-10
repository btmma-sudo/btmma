// PRIVATE staff-only generator: add a verified student's enrollment to a
// previously approved guardian account in Cloudflare D1, without storing
// student details in GitHub, Stripe, Airtable, or this program's environment.
//
// Usage (run on a trusted local machine, not CI):
//   node scripts/add-student-to-portal.mjs 'guardian@example.com' 'Student Name' 'American Kenpo Karate' 'Yellow Belt' > private-student.sql
//
// Verify guardian authorization, enrollment, program and belt OUTSIDE this script.
// This script emits SQL; it never connects to Cloudflare or sends any data.
import {randomUUID} from "node:crypto";
import {PROGRAMS, RANKS, sqlProgram, sqlRank} from "../src/lib/instructor-video-manager.js";

const [, , rawEmail, rawName, rawProgram, rawRank] = process.argv;
const email=String(rawEmail||"").trim().toLowerCase();
const name=String(rawName||"").trim();
const program=String(rawProgram||"").trim();
const rank=String(rawRank||"").trim();
const okEmail=email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const okName=name.length>=2 && name.length<=100 && !/[\x00-\x1f\x7f]/.test(name);
if(!okEmail || !okName || !PROGRAMS.includes(program) || !RANKS.includes(rank) || rank==="All Levels"){
  console.error("Invalid details. Usage: node scripts/add-student-to-portal.mjs 'verified-guardian@example.com' 'Student Name' 'American Kenpo Karate' 'Yellow Belt'");
  console.error("Allowed programs: "+PROGRAMS.join("; "));
  console.error("Allowed student ranks: "+RANKS.filter(x=>x!=="All Levels").join("; "));
  process.exit(1);
}
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const studentId=randomUUID();

console.log("-- PRIVATE GUARDIAN-APPROVED student record. Do not commit or send this SQL.");
console.log("-- Verify the target guardian account and consent. Only proceed if the INSERT creates exactly ONE row.");
console.log("INSERT INTO portal_students (id, account_id, display_name, program, belt_rank, active)");
console.log("SELECT "+[studentId,name,program,rank].map(quote).join(", ")+", 1 FROM portal_accounts a");
console.log("WHERE a.email="+quote(email)+" AND a.active=1;");
console.log("-- Verify the new student is linked to the intended family:");
console.log("SELECT COUNT(*) AS matching_student_count FROM portal_students WHERE id="+quote(studentId)+";");
console.log("-- ONLY AFTER the count is 1, grant already-published lessons for the student's exact program and rank:");
console.log("INSERT OR IGNORE INTO portal_lesson_access (account_id,lesson_id)");
console.log("SELECT DISTINCT s.account_id,l.id FROM portal_students s");
console.log("JOIN portal_accounts a ON a.id=s.account_id AND a.active=1");
console.log("JOIN portal_lessons l ON l.published=1");
console.log("WHERE s.id="+quote(studentId)+" AND s.active=1 AND "+sqlProgram+" AND "+sqlRank+";");
console.log("-- Verify the grants, then securely dispose of the private SQL file.");

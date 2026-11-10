// Staff-only LOCAL utility. Creates SQL to rotate a verified guardian's password.
// Never run this helper in a browser or publish its output. No accounts are changed
// by running it; authorized staff must apply the output through private D1 tooling.
import {pbkdf2Sync, randomBytes} from "node:crypto";

const email=String(process.argv[2] || "").trim().toLowerCase();
const password=process.env.PORTAL_PASSWORD || "";
if (!/^[^\s@]{1,128}@[^\s@]{1,124}\.[^\s@]{2,}$/.test(email) ||
    password.length<12 || password.length>200) {
  console.error("Usage: PORTAL_PASSWORD=<private secret> node scripts/reset-student-portal-password.mjs parent@example.com");
  console.error("Verify the guardian's identity first. Use a new unique password of 12-200 characters.");
  process.exit(1);
}
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const salt=randomBytes(16).toString("hex");
const hash=pbkdf2Sync(password,Buffer.from(salt,"hex"),210000,32,"sha256").toString("hex");
console.log("-- PRIVATE: Verify guardian identity before applying to LIVE_TRIAL_DB; delete this file afterwards.");
console.log("-- Reset the verified household only. Increment session_version to revoke all old sessions.");
console.log("UPDATE portal_accounts SET password_salt="+quote(salt)+",password_hash="+quote(hash)+
  ",session_version=session_version+1,failed_attempts=0,locked_until=0 WHERE email="+quote(email)+" AND active=1;");
console.log("-- Confirm exactly one row was updated before providing credentials through a secure channel.");

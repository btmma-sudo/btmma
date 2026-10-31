// Staff-only local helper: generate a new household account as SQL.
// Do not commit the generated SQL or put a password in command-line arguments.
import {pbkdf2Sync,randomBytes,randomUUID} from "node:crypto";
const [, , nameArg, emailArg] = process.argv;
const password = process.env.PORTAL_PASSWORD || "";
const name = String(nameArg || "").trim();
const email = String(emailArg || "").trim().toLowerCase();
if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12 || password.length > 200) {
  console.error("Usage: PORTAL_PASSWORD=<private secret> node scripts/provision-student-portal-account.mjs 'Family display name' 'parent@example.com'");
  console.error("Use a different strong password for each family, at least 12 characters.");
  process.exit(1);
}
const quote = s => "'" + s.replaceAll("'","''") + "'";
const id = randomUUID();
const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password,Buffer.from(salt,"hex"),210000,32,"sha256").toString("hex");
console.log("-- Apply to D1 LIVE_TRIAL_DB after 0002_student_portal.sql, using a secure local SQL file.");
console.log("-- Account ID: "+id);
console.log("INSERT INTO portal_accounts (id,display_name,email,password_salt,password_hash,active) VALUES (" +
  [quote(id),quote(name),quote(email),quote(salt),quote(hash),"1"].join(",") + ");");
console.log("-- Then add a student to portal_students, assign approved lessons through portal_lesson_access,");
console.log("-- and link the matching live Stripe customer ID only after confirming ownership.");

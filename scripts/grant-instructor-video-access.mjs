// Prints a targeted D1 statement for an EXISTING, verified staff account.
// Never share account passwords or execute access grants for unverified people.
// node scripts/grant-instructor-video-access.mjs owner@burningtreemma.com
const raw = String(process.argv[2] || "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || raw.length > 254) {
  console.error("Provide the verified email address of an existing portal account.");
  process.exit(1);
}
const quoted = "'" + raw.replaceAll("'", "''") + "'";
console.log("-- Review the target account BEFORE executing. Only staff approved by the owner.");
console.log("-- This grants both uploading and publishing. Revocation: UPDATE portal_staff SET active=0 WHERE account_id=(SELECT id FROM portal_accounts WHERE email="+quoted+");");
console.log("INSERT INTO portal_staff (account_id,can_upload,can_publish,active) SELECT id,1,1,1 FROM portal_accounts WHERE email="+quoted+" AND active=1 ON CONFLICT(account_id) DO UPDATE SET can_upload=1,can_publish=1,active=1;");

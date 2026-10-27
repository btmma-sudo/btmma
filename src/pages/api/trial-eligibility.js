// Cloudflare Pages Function: server-side eligibility precheck.
// Requires AIRTABLE_API_TOKEN, AIRTABLE_BASE_ID and TURNSTILE_SECRET_KEY.
// This is a precheck only; it deliberately does not create a payment session.
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
export const prerender = false;
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const required = ["AIRTABLE_API_TOKEN", "AIRTABLE_BASE_ID", "TURNSTILE_SECRET_KEY"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    return json({ success: false, error: "Registration verification is not available yet. Missing Worker settings: " + missing.join(", ") + ". Please contact the studio." }, 503);
  }
  let data;
  try { data = await request.json(); } catch { return json({ success: false, error: "Invalid registration." }, 400); }
  const { studentType, studentName, studentAge, guardianName, email, phone, programInterest, turnstileToken } = data || {};
  const age = Number(studentAge);
  if (!["minor", "adult"].includes(studentType) || typeof studentName !== "string" || studentName.trim().length < 2 ||
      studentName.length > 120 || !Number.isInteger(age) || age < 3 || age > 110 ||
      (studentType === "minor" && (!guardianName || typeof guardianName !== "string" || guardianName.trim().length < 2)) ||
      (studentType === "adult" && age < 18) || (studentType === "minor" && age >= 18) ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof phone !== "string" || phone.trim().length < 7 || phone.length > 40 ||
      !["Kenpo Karate", "Muay Thai", "Wing Chun"].includes(programInterest) ||
      typeof turnstileToken !== "string" || !turnstileToken) {
    return json({ success: false, error: "Please complete all required fields correctly." }, 400);
  }
  const verification = new FormData();
  verification.set("secret", env.TURNSTILE_SECRET_KEY);
  verification.set("response", turnstileToken);
  verification.set("remoteip", request.headers.get("CF-Connecting-IP") || "");
  let turnstile;
  try {
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: verification });
    turnstile = await result.json();
  } catch { return json({ success: false, error: "Security verification is temporarily unavailable." }, 503); }
  if (!turnstile.success) return json({ success: false, error: "Please complete the security check again." }, 403);
  const contactEmail = normalize(email);
  // Search only records belonging to the payer/contact email; siblings can share an email.
  const formula = 'LOWER({Email}) = "' + contactEmail.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  const params = new URLSearchParams({ filterByFormula: formula, pageSize: "100" });
  let offset;
  try {
    do {
      if (offset) params.set("offset", offset); else params.delete("offset");
      const response = await fetch("https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/tblZCXEuRKXiPZlc7?" + params, {
        headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN }
      });
      if (!response.ok) {
        let details = {};
        try { details = await response.json(); } catch {}
        const airtableType = String(details?.error?.type || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 60);
        const requestId = response.headers.get("x-airtable-request-id") || "";
        // Independently verify the token itself; do not disclose credentials or record data.
        let tokenStatus = "unavailable";
        let tokenHasReadScope = null;
        let reportedScopes = "not_provided";
        try {
          const identity = await fetch("https://api.airtable.com/v0/meta/whoami", {
            headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN }
          });
          tokenStatus = identity.ok ? "valid" : "HTTP_" + identity.status;
          if (identity.ok) {
            const identityData = await identity.json();
            if (Array.isArray(identityData.scopes)) {
              reportedScopes = "provided";
              tokenHasReadScope = identityData.scopes.includes("data.records:read");
            }
          }
        } catch {}
        // Check whether the configured token can enumerate the expected base.
        let baseListStatus = "unavailable";
        let expectedBaseVisible = null;
        try {
          const listResponse = await fetch("https://api.airtable.com/v0/meta/bases", {
            headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN }
          });
          baseListStatus = "HTTP_" + listResponse.status;
          if (listResponse.ok) {
            let listData = await listResponse.json();
            expectedBaseVisible = Array.isArray(listData.bases) && listData.bases.some((base) => base.id === env.AIRTABLE_BASE_ID);
            let nextOffset = listData.offset;
            for (let page = 0; nextOffset && !expectedBaseVisible && page < 20; page++) {
              const next = await fetch("https://api.airtable.com/v0/meta/bases?offset=" + encodeURIComponent(nextOffset), {
                headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN }
              });
              if (!next.ok) { baseListStatus = "HTTP_" + next.status; expectedBaseVisible = null; break; }
              listData = await next.json();
              expectedBaseVisible = Array.isArray(listData.bases) && listData.bases.some((base) => base.id === env.AIRTABLE_BASE_ID);
              nextOffset = listData.offset;
            }
            if (nextOffset && !expectedBaseVisible) expectedBaseVisible = null;
          }
        } catch {}
        // Probe base visibility separately from record-reading permission.
        // Never return Airtable credentials, record contents, or personal information.
        let baseMetadataStatus = "unavailable";
        let tableMetadataStatus = "unavailable";
        let baseMetadataErrorType = "";
        let tableMetadataErrorType = "";
        try {
          const baseMetadata = await fetch(
            "https://api.airtable.com/v0/meta/bases/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/tables",
            { headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN } }
          );
          baseMetadataStatus = "HTTP_" + baseMetadata.status;
          if (!baseMetadata.ok) {
            const errorBody = await baseMetadata.json().catch(() => ({}));
            baseMetadataErrorType = String(errorBody?.error?.type || "").replace(/[^A-Z0-9_]/gi, "").slice(0, 60);
          } else {
            const metadata = await baseMetadata.json();
            const matchedTable = Array.isArray(metadata.tables)
              ? metadata.tables.find((table) => table.id === "tblZCXEuRKXiPZlc7")
              : null;
            tableMetadataStatus = matchedTable ? "found" : "not_found";
          }
        } catch {}
        // A table-specific 403 with a valid token can mean the base isn't
        // included in token resources, or that the token lacks record-read scope.
        // Metadata access is a separate scope and its denial is not proof
        // that record access should be denied.
        const permissionHint = tokenStatus !== "valid" ? "token_invalid" :
          tokenHasReadScope === false ? "missing_record_read_scope" :
          baseMetadataStatus === "HTTP_200" && tableMetadataStatus === "found"
            ? "base_and_table_visible_check_record_scope" :
          baseMetadataStatus === "HTTP_403"
            ? "metadata_scope_or_base_access_unconfirmed" :
          "verify_token_base_access_and_table";
        const baseIdShapeValid = /^app[A-Za-z0-9]{14}$/.test(String(env.AIRTABLE_BASE_ID || ""));
        console.error("Trial Airtable identity diagnostics", { tokenStatus, tokenHasReadScope, baseIdShapeValid, baseListStatus, expectedBaseVisible, baseMetadataStatus, tableMetadataStatus, permissionHint });
        console.error("Trial eligibility Airtable failure", {
          status: response.status,
          type: airtableType,
          requestId,
          baseIdPresent: Boolean(env.AIRTABLE_BASE_ID),
          tokenPresent: Boolean(env.AIRTABLE_API_TOKEN)
        });
        return json({
          success: false,
          error: "Airtable verification failed (HTTP " + response.status + ", code " + airtableType + "). Please contact the studio.",
          diagnosticCode: airtableType,
          diagnostics: { tokenStatus, tokenHasReadScope, reportedScopes, baseIdShapeValid, table: "Leads", airtableHttpStatus: response.status, baseListStatus, expectedBaseVisible, baseMetadataStatus, tableMetadataStatus, baseMetadataErrorType, tableMetadataErrorType, permissionHint }
        }, 503);
      }
      const page = await response.json();
      for (const record of page.records || []) {
        const fields = record.fields || {};
        // Existing records without a Student Name cannot safely be cleared automatically.
        if (!fields["Student Name"] && (fields["$29 Trial Used"] || fields["Payment Status"] === "Paid")) {
          return json({ success: true, eligible: false, message: "Please contact the studio so we can verify this student's trial eligibility." });
        }
        if (normalize(fields["Student Name"]) === normalize(studentName) &&
            (fields["$29 Trial Used"] || fields["Payment Status"] === "Paid")) {
          return json({ success: true, eligible: false, message: "Please contact the studio about this student's trial eligibility." });
        }
      }
      offset = page.offset;
    } while (offset);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "AIRTABLE_AUTH" ? "Airtable token authentication failed. Please contact the studio." :
      code === "AIRTABLE_ACCESS" ? "Airtable token needs permission to read the Leads table. Please contact the studio." :
      code === "AIRTABLE_BASE_OR_TABLE" ? "Airtable base or Leads table was not found. Please contact the studio." :
      "We couldn't verify eligibility right now. Please contact the studio.";
    return json({ success: false, error: message }, 503);
  }
  // Do not return a public Stripe Payment Link: this precheck cannot lock eligibility.
  return json({ success: true, eligible: true, message: "Student details verified. Online checkout is being connected. Please contact the studio to complete registration." });
}

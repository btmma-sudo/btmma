// Cloudflare Pages Function: server-side eligibility precheck.
// Requires AIRTABLE_API_TOKEN, AIRTABLE_BASE_ID and TURNSTILE_SECRET_KEY.
// This is a precheck only; it deliberately does not create a payment session.
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
const sameDob = (fields, dob) => fields["Student Date of Birth"] === dob;
async function reserveStudent(db, recordId) {
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) throw new Error("Invalid record ID");
  const existing = await db.prepare("SELECT state FROM trial_registrations WHERE airtable_record_id = ?").bind(recordId).first();
  if (existing) return existing.state === "reserved" || existing.state === "checkout_open";
  await db.prepare("INSERT OR IGNORE INTO trial_registrations (id, airtable_record_id, student_key, state) VALUES (?, ?, ?, 'reserved')")
    .bind(crypto.randomUUID(), recordId, recordId).run();
  const row = await db.prepare("SELECT state FROM trial_registrations WHERE airtable_record_id = ?").bind(recordId).first();
  return row?.state === "reserved";
}
async function checkoutGrant(secret, recordId) {
  if (!secret || !/^rec[A-Za-z0-9]+$/.test(recordId)) return null;
  const expires = String(Date.now() + 10 * 60 * 1000);
  const payload = recordId + "." + expires;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return payload + "." + Array.from(mac, b => b.toString(16).padStart(2, "0")).join("");
}
export const prerender = false;
export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  const required = ["AIRTABLE_API_TOKEN", "AIRTABLE_BASE_ID", "TURNSTILE_SECRET_KEY", "TRIAL_DB", "STRIPE_WEBHOOK_SECRET"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    return json({ success: false, error: "Registration verification is not available yet. Missing Worker settings: " + missing.join(", ") + ". Please contact the studio." }, 503);
  }
  let data;
  try { data = await request.json(); } catch { return json({ success: false, error: "Invalid registration." }, 400); }
  const { studentType, studentName, studentDob, guardianName, email, phone, programInterest, turnstileToken } = data || {};
  // Parse a calendar date strictly; reject impossible and future dates.
  const dobValid = typeof studentDob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(studentDob);
  const dobDate = dobValid ? new Date(studentDob + "T00:00:00Z") : null;
  const today = new Date();
  const birthYear = dobValid ? Number(studentDob.slice(0, 4)) : 0;
  const birthMonth = dobValid ? Number(studentDob.slice(5, 7)) : 0;
  const birthDay = dobValid ? Number(studentDob.slice(8, 10)) : 0;
  const calendarDateValid = dobDate && !Number.isNaN(dobDate.getTime()) &&
    dobDate.getUTCFullYear() === birthYear && dobDate.getUTCMonth() + 1 === birthMonth &&
    dobDate.getUTCDate() === birthDay && dobDate.getTime() <= today.getTime();
  const age = calendarDateValid ? today.getUTCFullYear() - birthYear -
    (today.getUTCMonth() + 1 < birthMonth ||
      (today.getUTCMonth() + 1 === birthMonth && today.getUTCDate() < birthDay) ? 1 : 0) : NaN;
  if (!["minor", "adult"].includes(studentType) || typeof studentName !== "string" || studentName.trim().length < 2 ||
      studentName.length > 120 || !calendarDateValid || !Number.isInteger(age) || age < 3 || age > 110 ||
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
            (sameDob(fields, studentDob) || !fields["Student Date of Birth"]) &&
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
  // Check the student's name across ALL contact emails, not just the payer email.
  // A name match is a manual-review flag, not proof of identity. This remains
  // a read-only precheck; it is NOT sufficient to authorize payment.
  try {
    const escapedName = normalize(studentName).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const nameFormula = 'LOWER({Student Name}) = "' + escapedName + '"';
    const nameParams = new URLSearchParams({ filterByFormula: nameFormula, pageSize: "100" });
    let nameOffset;
    do {
      if (nameOffset) nameParams.set("offset", nameOffset);
      else nameParams.delete("offset");
      const nameResponse = await fetch(
        "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/tblZCXEuRKXiPZlc7?" + nameParams,
        { headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN } }
      );
      if (!nameResponse.ok) {
        console.error("Cross-email trial eligibility lookup failed", { status: nameResponse.status });
        return json({ success: false, error: "We couldn't complete the student eligibility check. Please contact the studio." }, 503);
      }
      const namePage = await nameResponse.json();
      for (const record of namePage.records || []) {
        const fields = record.fields || {};
        if (normalize(fields["Student Name"]) === normalize(studentName) &&
            (sameDob(fields, studentDob) || !fields["Student Date of Birth"]) &&
            (fields["$29 Trial Used"] || fields["Payment Status"] === "Paid")) {
          return json({
            success: true,
            eligible: false,
            message: "A previous trial may be associated with this student name. Please contact the studio to verify eligibility."
          });
        }
      }
      nameOffset = namePage.offset;
    } while (nameOffset);
  } catch {
    return json({ success: false, error: "We couldn't complete the student eligibility check. Please contact the studio." }, 503);
  }
  // Save a registration record only when the user explicitly submits the form.
  // Do not claim this Airtable read-then-create flow prevents concurrent duplicate
  // submissions; a transactional reservation is required before payment.
  // Reuse a prior unpaid registration for the same student/contact combination.
  try {
    const safeName = normalize(studentName).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const safeEmail = contactEmail.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const pendingFilter = 'AND(LOWER({Student Name}) = "' + safeName + '", LOWER({Email}) = "' + safeEmail + '")';
    const existingParams = new URLSearchParams({ filterByFormula: pendingFilter, pageSize: "100" });
    let pendingOffset;
    do {
      if (pendingOffset) existingParams.set("offset", pendingOffset);
      else existingParams.delete("offset");
      const existingResponse = await fetch(
        "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/tblZCXEuRKXiPZlc7?" + existingParams,
        { headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN } }
      );
      if (!existingResponse.ok) throw new Error("pending_lookup_" + existingResponse.status);
      const existingPage = await existingResponse.json();
      for (const record of existingPage.records || []) {
        const fields = record.fields || {};
        if (normalize(fields["Student Name"]) === normalize(studentName) &&
            normalize(fields["Email"]) === contactEmail &&
            sameDob(fields, studentDob) &&
            !fields["$29 Trial Used"] && fields["Payment Status"] !== "Paid") {
          if (!await reserveStudent(env.TRIAL_DB, record.id)) return json({ success: true, eligible: false, message: "Please contact the studio to verify this registration." });
          return json({
            checkoutGrant: await checkoutGrant(env.STRIPE_WEBHOOK_SECRET, record.id),
            success: true, eligible: true, registrationSaved: true,
            message: "Your student registration is already on file. Online payment is not available yet. Please contact the studio to finish enrollment."
          });
        }
      }
      pendingOffset = existingPage.offset;
    } while (pendingOffset);

    const fields = {
      "Name": studentType === "minor" ? guardianName.trim() : studentName.trim(),
      "Student Name": studentName.trim(),
      "Student Date of Birth": studentDob,
      "Email": email.trim()
    };
    // Do not set Student ID: Airtable's Autonumber field assigns it.
    const created = await fetch(
      "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/tblZCXEuRKXiPZlc7",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.AIRTABLE_API_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields, typecast: false })
      }
    );
    if (!created.ok) {
      console.error("Trial registration save failed", { status: created.status });
      return json({ success: false, error: "We verified eligibility but could not save the registration. Please contact the studio." }, 503);
    }
    const saved = await created.json();
    if (!await reserveStudent(env.TRIAL_DB, saved.id)) return json({ success: true, eligible: false, registrationSaved: true, message: "Registration saved. Please contact the studio to verify eligibility." });
    return json({
      checkoutGrant: await checkoutGrant(env.STRIPE_WEBHOOK_SECRET, saved.id),
      success: true, eligible: true, registrationSaved: true,
      message: "Student registration received! Online payment is not available yet. Please contact the studio to complete the $29 offer."
    });
  } catch (error) {
    console.error("Trial registration save unavailable", { reason: error instanceof Error ? error.message.slice(0, 60) : "unknown" });
    return json({ success: false, error: "Registration could not be saved. Please contact the studio." }, 503);
  }
}

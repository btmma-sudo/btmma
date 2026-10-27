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
  if (!env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID || !env.TURNSTILE_SECRET_KEY) {
    return json({ success: false, error: "Registration verification is not available yet. Please contact the studio." }, 503);
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
      const response = await fetch("https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/Leads?" + params, {
        headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN }
      });
      if (!response.ok) throw new Error("Airtable unavailable");
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
  } catch { return json({ success: false, error: "We couldn't verify eligibility right now. Please contact the studio." }, 503); }
  // Do not return a public Stripe Payment Link: this precheck cannot lock eligibility.
  return json({ success: true, eligible: true, message: "Student details verified. Online checkout is being connected. Please contact the studio to complete registration." });
}

export const prerender = false;

import type { APIRoute } from "astro";

// All ordinary website inquiries are saved straight to the existing Leads table.
// The $29 registration/payment endpoints remain separate and unchanged.
const LEADS_TABLE = "tblZCXEuRKXiPZlc7";
const FIELDS = {
  name: "fldmSRB8kxpMhjt5P",
  email: "fldSsUxNCyFjeWBPG",
  phone: "fldEzSs3SetvHjux5",
  program: "fldCgzqIPXX8nn4qu",
  notes: "fld26rGp1uVmo2N0C",
  source: "flddgq6iKdUzousLp",
  stage: "fldkn3uGcmQjOVUpV"
} as const;

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function formText(form: FormData, key: string, maxLength: number): string {
  const raw = form.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, maxLength) : "";
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? {};

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ success: false, error: "Invalid request. Please refresh and try again." }, 400);
  }

  const token = formText(form, "cf-turnstile-response", 4096);
  const email = formText(form, "email", 254);
  const name = formText(form, "fullName", 140);
  const phone = formText(form, "phone", 40);
  const program = formText(form, "programInterest", 120);
  const comments = formText(form, "comments", 3000);
  const source = formText(form, "source", 500) || "/";

  if (!token) {
    return json({ success: false, error: "Please complete the security check and try again." }, 400);
  }
  // Some newsletter/product-interest forms request only an email; standard
  // inquiry forms require name and phone in the browser as well.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      (!name && !program) || (program !== "ChimpmanGi" && !phone)) {
    return json({ success: false, error: "Please complete all required fields correctly." }, 400);
  }

  if (!env.TURNSTILE_SECRET_KEY || !env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID) {
    console.error("Website lead capture is missing server credentials");
    return json({ success: false, error: "The inquiry service is temporarily unavailable. Please call (202) 368-4395." }, 503);
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: String(env.TURNSTILE_SECRET_KEY),
        response: token
      })
    });
    if (!response.ok) throw new Error("Turnstile provider unavailable");
    const verification = await response.json() as { success?: boolean };
    if (!verification.success) {
      return json({ success: false, error: "Security verification failed. Please refresh and try again." }, 403);
    }
  } catch {
    return json({ success: false, error: "Security verification is temporarily unavailable. Please try again." }, 503);
  }

  const fields: Record<string, string> = {
    [FIELDS.name]: name || "Website inquiry",
    [FIELDS.email]: email,
    [FIELDS.source]: source.startsWith("/") ? source : "/",
    [FIELDS.stage]: "New"
  };
  if (phone) fields[FIELDS.phone] = phone;
  if (program) fields[FIELDS.program] = program;
  if (comments) fields[FIELDS.notes] = comments;

  // Only acknowledge success after Airtable confirms creation. Do not forward
  // to the inactive Make webhook (which previously accepted but dropped leads).
  try {
    const response = await fetch(
      "https://api.airtable.com/v0/" + encodeURIComponent(String(env.AIRTABLE_BASE_ID)) + "/" + LEADS_TABLE,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.AIRTABLE_API_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields, typecast: false })
      }
    );
    if (!response.ok) {
      console.error("Website inquiry Airtable save failed", { status: response.status });
      return json({ success: false, error: "We couldn't save your request. Please try again or call (202) 368-4395." }, 502);
    }
    const saved = await response.json() as { id?: string };
    if (!saved.id || !/^rec[A-Za-z0-9]{14}$/.test(saved.id)) {
      console.error("Website inquiry save returned no valid record ID");
      return json({ success: false, error: "We couldn't confirm your request. Please call (202) 368-4395." }, 502);
    }
  } catch {
    console.error("Website inquiry Airtable request failed");
    return json({ success: false, error: "We couldn't send your request. Please try again or call (202) 368-4395." }, 502);
  }

  return json({ success: true }, 200);
};

export const prerender = false;

import type { APIRoute } from "astro";
import { studentAgeGroups } from "../lib/class-help";
import { weeklySchedule } from "../data/schedule";
import { sendOwnerSms } from "../lib/owner-sms.js";
import { sendInquiryAcknowledgement } from "../lib/inquiry-acknowledgement.js";

const transferSources = ["/kids-martial-arts/#transfer-inquiry", "/teens-adults-martial-arts/#transfer-inquiry"];
const trialClassHelpSource = "/29-trial/#help-find-a-class";
const classHelpSources = [
  "/kids-martial-arts/#class-inquiry",
  "/teens-adults-martial-arts/#class-inquiry",
  ...transferSources
];

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
  stage: "fldkn3uGcmQjOVUpV",
  firstLandingPage: "fld5pKyFIc2cHaBGY",
  acquisitionSource: "fldQRK5Sk4DviQPiA",
  acquisitionMedium: "fldoBSwtfIDnQBU4S",
  utmCampaign: "fld6kkeJbxMN5aAKx",
  originalReferrer: "fldUXoAZPEi4NPegv",
  smsConsent: "fldnhZMo4eWpK0hOD",
  smsConsentRecordedAt: "fldewgpFJYCZ4I5oG",
  welcomeEmailSent: "fldjb21fTjrI295aN"
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
  const isClassHelp = formText(form, "inquiryType", 20) === "classHelp";
  const preferredContact = formText(form, "preferredContact", 254);
  const rawStudentAge = form.get("studentAge");
  const studentAge = typeof rawStudentAge === "string" && rawStudentAge.trim()
    ? Number(rawStudentAge)
    : NaN;
  const studentAgeGroup = formText(form, "studentAgeGroup", 40);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const email = isClassHelp
    ? (emailPattern.test(preferredContact) ? preferredContact : "")
    : formText(form, "email", 254);
  const name = formText(form, "fullName", 140);
  const phone = isClassHelp ? (email ? "" : preferredContact) : formText(form, "phone", 40);
  // Only an explicit, optional, checked website opt-in counts as permission.
  const smsConsent = !isClassHelp && phone.length > 0 && formText(form, "smsConsent", 10) === "yes";
  const program = formText(form, "programInterest", 120);
  const comments = formText(form, "comments", 3000);
  const source = formText(form, "source", 500) || "/";
  const requiresExactAge = isClassHelp && !classHelpSources.includes(source);
  const isTransfer = isClassHelp && transferSources.includes(source);
  const trainingExperience = formText(form, "trainingExperience", 140);
  const preferredDay = formText(form, "preferredDay", 20);
  // These fields are untrusted optional client metadata; trim to the CRM's
  // conservative lengths, never trust them for authorization or payment.
  const firstLandingPage = formText(form, "firstLandingPage", 160);
  const acquisitionSource = formText(form, "acquisitionSource", 80);
  const acquisitionMedium = formText(form, "acquisitionMedium", 80);
  const utmCampaign = formText(form, "utmCampaign", 120);
  const originalReferrer = formText(form, "originalReferrer", 160);

  if (!token) {
    return json({ success: false, error: "Please complete the security check and try again." }, 400);
  }
  // Some newsletter/product-interest forms request only an email; standard
  // inquiry forms require name and phone in the browser as well.
  if (isClassHelp) {
    const validPhone = /^[+()0-9. -]+$/.test(phone) && /^\d{10,15}$/.test(phone.replace(/\D/g, ""));
    if (requiresExactAge && !(studentAge >= 0 && studentAge <= 120)) {
      return json({ success: false, error: "Please enter the student’s age in years." }, 400);
    }
    if (!name || (!requiresExactAge && !studentAgeGroups.includes(studentAgeGroup)) || (!email && !validPhone)) {
      return json({ success: false, error: requiresExactAge
        ? "Please enter your name and an email address or callback number."
        : "Please enter your name, an email address or callback number, and the student's age group." }, 400);
    }
  } else if (!emailPattern.test(email) || (!name && !program) || (program !== "ChimpmanGi" && !phone)) {
    return json({ success: false, error: "Please complete all required fields correctly." }, 400);
  }

  if (isTransfer && (!trainingExperience || !(
    preferredDay === "Flexible" || weeklySchedule.some(({ day }) => day === preferredDay)
  ))) {
    return json({ success: false, error: "Please enter the student's current style or belt rank and select a preferred day." }, 400);
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

  const fields: Record<string, string | boolean> = {
    [FIELDS.name]: name || "Website inquiry",
    [FIELDS.source]: isClassHelp
      ? (requiresExactAge ? trialClassHelpSource : source)
      : (source.startsWith("/") ? source : "/"),
    [FIELDS.stage]: "New"
  };
  if (email) fields[FIELDS.email] = email;
  if (phone) fields[FIELDS.phone] = phone;
  if (smsConsent) {
    fields[FIELDS.smsConsent] = true;
    fields[FIELDS.smsConsentRecordedAt] = new Date().toISOString();
  }
  if (isClassHelp) {
    const notes = [
      isTransfer ? "Experienced student inquiry" : "Class inquiry",
      requiresExactAge ? "Student age: " + studentAge + " years" : "Student age group: " + studentAgeGroup,
      "Preferred contact: " + (email ? "Email" : "Phone call")
    ];
    if (isTransfer) {
      notes.push("Current style or belt rank: " + trainingExperience, "Preferred training day: " + preferredDay);
    }
    fields[FIELDS.notes] = notes.join("\n");
  } else {
    if (program) fields[FIELDS.program] = program;
    if (comments) fields[FIELDS.notes] = comments;
  }
  if (firstLandingPage.startsWith("/")) fields[FIELDS.firstLandingPage] = firstLandingPage;
  if (acquisitionSource) fields[FIELDS.acquisitionSource] = acquisitionSource;
  if (acquisitionMedium) fields[FIELDS.acquisitionMedium] = acquisitionMedium;
  if (utmCampaign) fields[FIELDS.utmCampaign] = utmCampaign;
  if (originalReferrer) fields[FIELDS.originalReferrer] = originalReferrer;

  // Only acknowledge success after Airtable confirms creation. Do not forward
  // to the inactive Make webhook (which previously accepted but dropped leads).
  let savedRecordId = "";
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
    savedRecordId = saved.id;
  } catch {
    console.error("Website inquiry Airtable request failed");
    return json({ success: false, error: "We couldn't send your request. Please try again or call (202) 368-4395." }, 502);
  }

  // Follow up with an acknowledgment only for an actual saved, valid email.
  // Provider failures never erase an accepted lead or claim an email was sent.
  const [emailAccepted] = await Promise.all([
    email ? sendInquiryAcknowledgement(env, { email, recordId: savedRecordId }) : Promise.resolve(false),
    sendOwnerSms(env, "inquiry").then(() => false)
  ]);
  if (emailAccepted) {
    try {
      const updated = await fetch(
        "https://api.airtable.com/v0/" + encodeURIComponent(String(env.AIRTABLE_BASE_ID)) +
          "/" + LEADS_TABLE + "/" + encodeURIComponent(savedRecordId),
        {
          method: "PATCH",
          headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { [FIELDS.welcomeEmailSent]: true }, typecast: false })
        }
      );
      if (!updated.ok) console.warn("Inquiry email accepted but CRM sent marker was not updated", { status: updated.status });
    } catch { console.warn("Inquiry sent marker unavailable"); }
  }
  return json({ success: true }, 200);
};

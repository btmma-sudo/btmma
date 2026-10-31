// Separate, audit-friendly seminar e-signatures; never touches the $29 trial or Leads.
import { SEMINAR_WAIVERS } from "../../data/seminar-waivers.js";
export const prerender = false;
const TABLE = "tblEOTe4nc6B2DY2d";
const respond = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const validName = s => typeof s === "string" && s.trim().length >= 2 && s.trim().length <= 120 && !/[<>\r\n]/.test(s);
const validEmail = s => typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const acceptedTicket = {
  united: ["general", "supporter", "sponsor"],
  nerve: ["day1", "day2", "both"]
};
const signatureDigest = async str => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)));
  return Array.from(bytes, v => v.toString(16).padStart(2, "0")).join("");
};
const closedAt = { united: { general: "2026-11-15T19:00:00Z", supporter: "2026-11-15T19:00:00Z", sponsor: "2026-11-15T19:00:00Z" },
  nerve: { day1: "2026-11-21T17:00:00Z", day2: "2026-11-22T17:00:00Z", both: "2026-11-21T17:00:00Z" } };

export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (!env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID || !env.TURNSTILE_SECRET_KEY)
    return respond({ error: "Seminar e-signatures are temporarily unavailable. Please contact the studio." }, 503);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return respond({ error: "Please submit this waiver from the Burning Tree website." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 22000)
    return respond({ error: "The waiver submission is too long." }, 413);
  let body;
  try { body = await request.json(); } catch { return respond({ error: "Invalid submission." }, 400); }
  const event = body?.event, ticket = body?.ticket;
  if (!acceptedTicket[event]?.includes(ticket)) return respond({ error: "Choose a valid seminar and ticket." }, 400);
  if (Date.now() >= Date.parse(closedAt[event][ticket])) return respond({ error: "Online registration has closed." }, 409);
  const contact = body?.contactName?.trim(), email = body?.email?.trim(), phone = body?.phone?.trim();
  if (!validName(contact) || !validEmail(email) || typeof phone !== "string" || !/^[+()\-. \d]{7,30}$/.test(phone))
    return respond({ error: "Provide a valid contact name, email, and phone." }, 400);
  const signatures = body?.attendees;
  if (!Array.isArray(signatures) || signatures.length < 1 || signatures.length > 6)
    return respond({ error: "One signed waiver is required for each attendee (up to six)." }, 400);
  const seen = new Set();
  for (const item of signatures) {
    if (!validName(item?.name) || !validName(item?.signer) || !validName(item?.signature) ||
        item.signer.trim() !== item.signature.trim() ||
        typeof item.minor !== "boolean" || item.acceptedRisks !== true || item.electronicConsent !== true ||
        (item.minor && item.relationship !== "Parent or legal guardian") ||
        (!item.minor && (item.relationship !== "Adult attendee" || item.signer.trim().toLowerCase() !== item.name.trim().toLowerCase())))
      return respond({ error: "Every attendee needs their own valid risk acknowledgment and electronic signature. A guardian must sign for a minor." }, 400);
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) return respond({ error: "Please enter each attendee only once." }, 400);
    seen.add(key);
  }
  const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  if (token.length < 5 || token.length > 2500) return respond({ error: "Complete the security check to sign." }, 400);
  try {
    const form = new FormData();
    form.set("secret", env.TURNSTILE_SECRET_KEY);
    form.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) form.set("remoteip", ip);
    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const verdict = verification.ok ? await verification.json() : null;
    if (!verdict?.success) return respond({ error: "Security check expired or failed. Please try again." }, 403);
  } catch {
    return respond({ error: "The security check is unavailable. Please try again." }, 503);
  }
  const groupId = crypto.randomUUID();
  const signedAt = new Date().toISOString();
  const waiver = SEMINAR_WAIVERS[event];
  const records = await Promise.all(signatures.map(async (entry, i) => {
    const digest = await signatureDigest(JSON.stringify({
      groupId, signedAt, event, ticket, version: waiver.version, text: waiver.body,
      name: entry.name.trim(), signer: entry.signer.trim(), minor: entry.minor, email
    }));
    return { fields: {
      "Waiver Record": groupId + "-" + (i + 1),
      "Group ID": groupId,
      "Seminar": event,
      "Ticket": ticket,
      "Attendee": entry.name.trim(),
      "Minor": entry.minor,
      "Signer Name": entry.signer.trim(),
      "Signer Capacity": entry.relationship,
      "Electronic Signature": entry.signature.trim(),
      "Electronic Consent": true,
      "Acknowledged Risks": true,
      "Signed At UTC": signedAt,
      "Waiver Version": waiver.version,
      "Waiver Full Text": waiver.heading + "\n" + waiver.event + "\n\n" + waiver.body,
      "Contact Email": email,
      "Contact Phone": phone,
      "Checkout Status": "Awaiting seminar payment verification",
      "Record Digest": digest
    }};
  }));
  let result;
  try {
    const res = await fetch("https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" + TABLE, {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.AIRTABLE_API_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ records, typecast: false })
    });
    if (!res.ok) {
      console.error("Seminar e-signature storage failed", { status: res.status });
      return respond({ error: "Your signatures could not be saved. Do not send payment yet; please try again or contact the studio." }, 503);
    }
    result = await res.json();
  } catch { return respond({ error: "Your signatures could not be saved. Please try again." }, 503); }
  if (result?.records?.length !== records.length) {
    console.error("Seminar e-signature record count mismatch");
    return respond({ error: "Signatures need staff review. Please contact the studio before paying." }, 503);
  }
  return respond({
    saved: true, groupId, signedAt, waiverVersion: waiver.version,
    attendeeCount: records.length
  });
}

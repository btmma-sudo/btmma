// Dedicated event checkout: deliberately separate from the $29 student-trial system.
export const prerender = false;
const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

// Prices are server-owned cents, never accepted from the browser.
const EVENTS = {
  united: {
    name: "United by Purpose — November 15, 2026",
    tickets: {
      general: { name: "General Admission", cents: 5000 },
      supporter: { name: "Community Supporter", cents: 7500 },
      sponsor: { name: "Flame Sponsor", cents: 10000 }
    },
    deadline: "2026-11-15T19:00:00Z" // 2 PM Eastern — matches the official seminar flyer
  },
  nerve: {
    name: "Striking a Nerve — November 21–22, 2026",
    tickets: {
      day1: { name: "Day 1 — Kenpo (Nov 21)", cents: 10000, deadline: "2026-11-21T17:00:00Z" },
      day2: { name: "Day 2 — Martial Arts (Nov 22)", cents: 10000, deadline: "2026-11-22T17:00:00Z" },
      both: { name: "Both Days (Nov 21–22)", cents: 19000, deadline: "2026-11-21T17:00:00Z" }
    }
  }
};

export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};
  if (env.LIVE_CHECKOUT_ENABLED !== "true" ||
      !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")) ||
      !env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID) {
    return response({ error: "Seminar registration is being configured. Please call (202) 368-4395." }, 503);
  }
  if (request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin)
    return response({ error: "Please register from the Burning Tree website." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 5000)
    return response({ error: "Registration form is too long." }, 413);
  let input;
  try { input = await request.json(); } catch { return response({ error: "Invalid form submission." }, 400); }

  const event = EVENTS[input?.event];
  const ticket = event?.tickets[input?.ticket];
  if (!event || !ticket) return response({ error: "Please select a valid seminar and ticket." }, 400);
  const deadline = ticket.deadline || event.deadline;
  if (Date.now() >= Date.parse(deadline)) return response({ error: "Online registration for this session has closed. Please contact the studio." }, 409);

  const contactName = typeof input.contactName === "string" ? input.contactName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const attendeeText = typeof input.attendees === "string" ? input.attendees : "";
  const attendees = attendeeText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!contactName || contactName.length > 120 || /[<>\r\n]/.test(contactName) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !/^[+()\- .\d]{7,30}$/.test(phone) ||
      attendees.length < 1 || attendees.length > 6 ||
      attendees.some(name => name.length < 2 || name.length > 75 || /[<>\r\n]/.test(name))) {
    return response({ error: "Enter a valid contact name, email, phone, and one attendee name per seat (up to 6)." }, 400);
  }
  // Every attendee must have a separately saved electronic signature
  // before a seminar checkout session can be created.
  const waiverGroupId = typeof input.waiverGroupId === "string" ? input.waiverGroupId : "";
  if (!/^[a-f0-9-]{36}$/i.test(waiverGroupId))
    return response({ error: "Sign each attendee's seminar waiver before choosing payment." }, 403);
  let signedRecords;
  try {
    const where = "{Group ID}='" + waiverGroupId + "'";
    const url = "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) +
      "/tblEOTe4nc6B2DY2d?filterByFormula=" + encodeURIComponent(where) + "&pageSize=10";
    const saved = await fetch(url, { headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN } });
    if (!saved.ok) return response({ error: "Signed waiver records could not be checked. Please contact the studio." }, 503);
    const data = await saved.json();
    signedRecords = data?.records;
  } catch { return response({ error: "Waiver verification is temporarily unavailable." }, 503); }
  if (!Array.isArray(signedRecords) || signedRecords.length !== attendees.length ||
      signedRecords.some(r => r.fields?.Seminar !== input.event || r.fields?.Ticket !== input.ticket ||
        String(r.fields?.["Contact Email"] || "").toLowerCase() !== email.toLowerCase() ||
        r.fields?.["Electronic Consent"] !== true || r.fields?.["Acknowledged Risks"] !== true ||
        typeof r.fields?.["Electronic Signature"] !== "string" || !r.fields?.["Waiver Full Text"] ||
        !r.fields?.["Waiver Version"])) {
    return response({ error: "The payment details do not match the signed waivers. Please review and sign again." }, 409);
  }
  const signedNames = signedRecords.map(r => String(r.fields.Attendee).trim().toLowerCase()).sort();
  const expectedNames = attendees.map(n => n.toLowerCase()).sort();
  if (JSON.stringify(signedNames) !== JSON.stringify(expectedNames))
    return response({ error: "The attendee names no longer match the signed waivers. Please review and sign again." }, 409);

  const origin = new URL(request.url).origin;
  const quantity = attendees.length;
  const params = new URLSearchParams({
    mode: "payment",
    "allowed_payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(ticket.cents),
    "line_items[0][price_data][product_data][name]": event.name + " — " + ticket.name,
    "line_items[0][quantity]": String(quantity),
    customer_email: email,
    client_reference_id: "seminar_" + crypto.randomUUID(),
    "metadata[btmma_source]": "btmma_seminar_live_v1",
    "metadata[event]": input.event,
    "metadata[ticket]": input.ticket,
    "metadata[attendee_count]": String(quantity),
    "metadata[attendee_names]": attendees.join(" | "),
    "metadata[contact_name]": contactName,
    "metadata[contact_phone]": phone,
    "metadata[waiver_group_id]": waiverGroupId,
    "metadata[waiver_version]": signedRecords[0].fields["Waiver Version"],
    "payment_intent_data[metadata][btmma_source]": "btmma_seminar_live_v1",
    "payment_intent_data[metadata][event]": input.event,
    "payment_intent_data[metadata][ticket]": input.ticket,
    success_url: origin + "/seminars/?checkout=success&session_id={CHECKOUT_SESSION_ID}#registration-result",
    cancel_url: origin + "/seminars/?checkout=cancelled#registration"
  });
  try {
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });
    if (!stripeResponse.ok) {
      const diagnostic = await stripeResponse.json().catch(() => ({}));
      console.error("Seminar Stripe Checkout error", { status: stripeResponse.status, code: String(diagnostic?.error?.code || "").slice(0, 80) });
      return response({ error: "Secure checkout is temporarily unavailable. Please contact the studio at (202) 368-4395." }, 503);
    }
    const session = await stripeResponse.json();
    if (session.livemode !== true || !/^cs_live_/.test(session.id || "") || !/^https:\/\/checkout\.stripe\.com\//.test(session.url || ""))
      return response({ error: "Checkout could not be verified. Please contact the studio." }, 503);
    return response({ url: session.url });
  } catch {
    return response({ error: "Could not connect to secure checkout. Please try again." }, 503);
  }
}

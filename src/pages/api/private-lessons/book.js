import {
  bookingEnv, bookingJson, isFutureSlot, PRIVATE_LESSON_PROGRAMS,
  appointmentLabel, escapeHtml, sendBookingEmail
} from "../../../lib/private-lesson-booking.js";
import { validSameOrigin } from "../../../lib/student-portal-auth.js";

export const prerender = false;

export async function GET({ url, locals }) {
  const env = bookingEnv(locals);
  if (!env) return bookingJson({ enabled: false, slots: [] });
  const enabled = env.PRIVATE_LESSON_BOOKINGS_ENABLED === "true";
  if (!enabled) return bookingJson({ enabled: false, slots: [] });

  const month = url.searchParams.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return bookingJson({ error: "Choose a valid month." }, 400);
  }
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  try {
    const query = await env.LIVE_TRIAL_DB.prepare(
      "SELECT id,lesson_date,start_time,duration_minutes FROM private_lesson_slots " +
      "WHERE status='open' AND lesson_date BETWEEN ? AND ? ORDER BY lesson_date,start_time LIMIT 300"
    ).bind(month + "-01", month + "-" + String(last).padStart(2, "0")).all();
    const slots = (query.results || []).filter(s => isFutureSlot(s.lesson_date, s.start_time))
      .map(s => ({ id: s.id, date: s.lesson_date, time: s.start_time, duration: s.duration_minutes }));
    return bookingJson({ enabled: true, slots });
  } catch {
    return bookingJson({ error: "The calendar is temporarily unavailable." }, 503);
  }
}

export async function POST({ request, locals }) {
  const env = bookingEnv(locals);
  if (!env || env.PRIVATE_LESSON_BOOKINGS_ENABLED !== "true")
    return bookingJson({ error: "Private lesson booking is not open yet." }, 503);
  if (!validSameOrigin(request) ||
    !(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json") ||
    Number(request.headers.get("content-length") || 0) > 7000)
    return bookingJson({ error: "Invalid booking request." }, 403);
  let body;
  try {
    const raw = await request.text();
    body = raw.length <= 7000 ? JSON.parse(raw) : null;
  } catch { body = null; }
  if (!body || Array.isArray(body) || typeof body !== "object")
    return bookingJson({ error: "Invalid booking information." }, 400);

  const id = String(body.slotId || "");
  const program = String(body.program || "");
  const contactName = String(body.contactName || "").trim();
  const studentName = String(body.studentName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const notes = String(body.notes || "").trim();
  const token = String(body.turnstileToken || "");
  if (!/^[a-f0-9-]{36}$/i.test(id) || !PRIVATE_LESSON_PROGRAMS.includes(program) ||
    contactName.length < 2 || contactName.length > 100 ||
    studentName.length < 2 || studentName.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
    phone.length < 7 || phone.length > 30 || !/^[0-9+()\-. \s]+$/.test(phone) ||
    notes.length > 500) {
    return bookingJson({ error: "Please check your name, contact information, and lesson selection." }, 400);
  }
  if (!env.TURNSTILE_SECRET_KEY || token.length < 5 || token.length > 2048)
    return bookingJson({ error: "Please complete the security check." }, 403);
  try {
    const challenge = new FormData();
    challenge.set("secret", env.TURNSTILE_SECRET_KEY);
    challenge.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) challenge.set("remoteip", ip);
    const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: challenge
    });
    const result = check.ok ? await check.json() : null;
    if (!result?.success || result.hostname !== new URL(request.url).hostname)
      return bookingJson({ error: "Security check expired. Please complete it again." }, 403);
  } catch {
    return bookingJson({ error: "The security check is unavailable. Please try again." }, 503);
  }

  const db = env.LIVE_TRIAL_DB;
  let slot;
  try {
    slot = await db.prepare(
      "SELECT id,lesson_date,start_time,duration_minutes,status " +
      "FROM private_lesson_slots WHERE id=?"
    ).bind(id).first();
  } catch { return bookingJson({ error: "Booking is temporarily unavailable." }, 503); }
  if (!slot || slot.status !== "open" || !isFutureSlot(slot.lesson_date, slot.start_time))
    return bookingJson({ error: "That appointment is no longer available. Please choose another time." }, 409);

  try {
    // Atomic single-row compare-and-swap. Only one visitor can claim an open slot.
    const updated = await db.prepare(
      "UPDATE private_lesson_slots SET status='booked',program=?,student_name=?,contact_name=?," +
      "contact_email=?,contact_phone=?,notes=?,booked_at=CURRENT_TIMESTAMP " +
      "WHERE id=? AND status='open'"
    ).bind(program, studentName, contactName, email, phone, notes, id).run();
    if (updated.meta?.changes !== 1)
      return bookingJson({ error: "That appointment was just booked. Choose another available time." }, 409);
  } catch {
    return bookingJson({ error: "Could not reserve that appointment. Please try another time." }, 503);
  }

  const label = appointmentLabel(slot.lesson_date, slot.start_time, slot.duration_minutes);
  const fields = [
    ["Appointment", label], ["Martial art", program], ["Student", studentName],
    ["Contact", contactName], ["Email", email], ["Phone", phone], ["Notes", notes || "None"]
  ];
  const rows = fields.map(pair => "<tr><td style='padding:8px;color:#555'>" +
    escapeHtml(pair[0]) + "</td><td style='padding:8px'>" + escapeHtml(pair[1]) + "</td></tr>").join("");
  const baseHtml = "<div style='font-family:Arial,sans-serif;max-width:650px;margin:auto'>" +
    "<img src='https://burningtreemma.com/images/logo.png' alt='Burning Tree MMA' width='56'>" +
    "<h2>Burning Tree Private Lesson</h2><table>" + rows + "</table>" +
    "<p>10210 S Dolfield Rd, Owings Mills, MD 21117</p>" +
    "<p>Questions or changes? Call/text Coach David at 410-218-0894.</p></div>";
  const ownerTo = String(env.PRIVATE_LESSON_NOTIFICATION_EMAIL || "info@burningtreemma.com").trim();
  const [ownerSent, studentSent] = await Promise.all([
    sendBookingEmail(env, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerTo) ? [ownerTo] : [],
      "New private lesson: " + label, baseHtml),
    sendBookingEmail(env, [email], "Private lesson booked — Burning Tree MMA", baseHtml)
  ]);
  // Mail delivery is best effort; the confirmed database reservation is authoritative.
  return bookingJson({
    ok: true,
    slotId: id,
    appointment: label,
    emailSent: studentSent,
    ownerNotified: ownerSent
  });
}

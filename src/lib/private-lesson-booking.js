// Standalone private lesson booking helpers. This feature is independent of trial checkout.
export const PRIVATE_LESSON_PROGRAMS = Object.freeze([
  "American Kenpo Karate",
  "Muay Thai",
  "Wing Chun",
  "Women's Self-Defense / Sanuces",
  "Leadership",
  "General Private Coaching"
]);
export const PRIVATE_LESSON_DURATIONS = Object.freeze([30, 45, 60, 90]);
export const PRIVATE_LESSON_TIME_ZONE = "America/New_York";

export function bookingEnv(locals) {
  const env = locals?.runtime?.env ?? {};
  return env.LIVE_TRIAL_DB ? env : null;
}

export function bookingJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
export function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function isValidTime(s) {
  return typeof s === "string" && /^([01]\d|2[0-3]):(00|15|30|45)$/.test(s);
}
export function easternStamp(instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PRIVATE_LESSON_TIME_ZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  }).formatToParts(instant);
  const x = Object.fromEntries(parts.map(v => [v.type, v.value]));
  return x.year + "-" + x.month + "-" + x.day + "T" + x.hour + ":" + x.minute;
}
export function isFutureSlot(date, time, minimumNoticeHours = 24) {
  if (!isValidDate(date) || !isValidTime(time)) return false;
  const now = Date.now();
  const earliest = easternStamp(new Date(now + minimumNoticeHours * 3600000));
  const limit = easternStamp(new Date(now + 90 * 86400000)).slice(0, 10);
  return date + "T" + time >= earliest && date <= limit;
}
export function minuteOfDay(time) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
export function appointmentLabel(date, time, duration) {
  const dt = new Date(date + "T12:00:00Z");
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: PRIVATE_LESSON_TIME_ZONE, weekday: "long", month: "long",
    day: "numeric", year: "numeric"
  }).format(dt);
  const h = Number(time.slice(0, 2));
  return day + " at " + (h % 12 || 12) + ":" + time.slice(3, 5) +
    (h < 12 ? " AM" : " PM") + " Eastern (" + duration + " minutes)";
}
export function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
}
export async function sendBookingEmail(env, recipients, subject, html) {
  if (!env.RESEND_API_KEY || recipients.length === 0) return false;
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Burning Tree Mixed Martial Arts <noreply@burningtreemma.com>",
        to: recipients,
        subject,
        html
      })
    });
    return result.ok;
  } catch {
    return false;
  }
}

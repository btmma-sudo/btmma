import { authorizedInstructor, canPost, readJson } from "../../../lib/instructor-video-manager.js";
import {
  bookingJson, isValidDate, isValidTime, isFutureSlot, minuteOfDay,
  PRIVATE_LESSON_DURATIONS, easternStamp
} from "../../../lib/private-lesson-booking.js";

export const prerender = false;
const invalid = (error, status = 400) => bookingJson({ ok: false, error }, status);
const startMinuteSql = "(CAST(substr(start_time,1,2) AS INTEGER)*60 + CAST(substr(start_time,4,2) AS INTEGER))";

async function owner(request, locals) {
  const staff = await authorizedInstructor(request, locals);
  return staff?.staff?.can_publish === 1 ? staff : null;
}

export async function GET({ request, locals }) {
  const staff = await owner(request, locals);
  if (!staff) return invalid("Not found.", 404);
  try {
    const today = easternStamp(new Date()).slice(0, 10);
    const result = await staff.env.LIVE_TRIAL_DB.prepare(
      "SELECT id,lesson_date,start_time,duration_minutes,status,program,student_name," +
      "contact_name,contact_email,contact_phone,notes,booked_at " +
      "FROM private_lesson_slots WHERE lesson_date >= ? " +
      "ORDER BY lesson_date,start_time LIMIT 400"
    ).bind(today).all();
    return bookingJson({ ok: true, slots: result.results || [],
      publicBookingEnabled: staff.env.PRIVATE_LESSON_BOOKINGS_ENABLED === "true" });
  } catch {
    return invalid("The scheduling table is not installed or temporarily unavailable.", 503);
  }
}

export async function POST({ request, locals }) {
  const staff = await owner(request, locals);
  if (!staff) return invalid("Not found.", 404);
  if (!canPost(request)) return invalid("Invalid request.", 403);
  const data = await readJson(request);
  const action = data?.action;
  const db = staff.env.LIVE_TRIAL_DB;
  if (!["open", "close", "reopen"].includes(action)) return invalid("Invalid action.");
  if (action === "close" || action === "reopen") {
    const id = String(data.id || "");
    if (!/^[a-f0-9-]{36}$/i.test(id)) return invalid("Invalid slot.");
    if (action === "close") {
      try {
        const result = await db.prepare(
          "UPDATE private_lesson_slots SET status='closed' WHERE id=? AND status='open'"
        ).bind(id).run();
        return result.meta?.changes === 1 ? bookingJson({ ok: true }) :
          invalid("Only an unbooked, open appointment can be closed.", 409);
      } catch { return invalid("Could not close that appointment.", 503); }
    }
    try {
      const existing = await db.prepare(
        "SELECT id,lesson_date,start_time,duration_minutes,status FROM private_lesson_slots WHERE id=?"
      ).bind(id).first();
      if (!existing || existing.status !== "closed" ||
        !isFutureSlot(existing.lesson_date, existing.start_time))
        return invalid("That appointment cannot be reopened.", 409);
      const st = minuteOfDay(existing.start_time);
      const end = st + existing.duration_minutes;
      const conflict = await db.prepare(
        "SELECT id FROM private_lesson_slots WHERE lesson_date=? AND status IN ('open','booked') " +
        "AND id<>? AND " + startMinuteSql + " < ? AND " +
        startMinuteSql + " + duration_minutes > ? LIMIT 1"
      ).bind(existing.lesson_date, id, end, st).first();
      if (conflict) return invalid("That time overlaps another appointment.", 409);
      const result = await db.prepare(
        "UPDATE private_lesson_slots SET status='open' WHERE id=? AND status='closed'"
      ).bind(id).run();
      return result.meta?.changes === 1 ? bookingJson({ ok: true }) :
        invalid("The appointment could not be reopened.", 409);
    } catch { return invalid("Could not reopen that appointment.", 503); }
  }

  const date = data?.date;
  const time = data?.time;
  const duration = Number(data?.duration);
  if (!isValidDate(date) || !isValidTime(time) ||
    !PRIVATE_LESSON_DURATIONS.includes(duration) ||
    !isFutureSlot(date, time) || minuteOfDay(time) + duration > 24 * 60)
    return invalid("Choose a valid appointment in the next 90 days with at least 24 hours' notice.");

  const start = minuteOfDay(time);
  const end = start + duration;
  try {
    // Check for overlapping active bookings in the same INSERT statement.
    const result = await db.prepare(
      "INSERT INTO private_lesson_slots(id,lesson_date,start_time,duration_minutes,status,created_by) " +
      "SELECT ?,?,?,?,'open',? WHERE NOT EXISTS ( " +
        "SELECT 1 FROM private_lesson_slots WHERE lesson_date=? " +
        "AND status IN ('open','booked') AND " + startMinuteSql + " < ? " +
        "AND " + startMinuteSql + " + duration_minutes > ?)"
    ).bind(crypto.randomUUID(), date, time, duration, staff.account.id, date, end, start).run();
    return result.meta?.changes === 1 ? bookingJson({ ok: true }) :
      invalid("That time overlaps an existing open or booked lesson.", 409);
  } catch {
    return invalid("That start time already exists or the appointment database is unavailable.", 409);
  }
}

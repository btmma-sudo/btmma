import {
 authorizedInstructor, canPost, readJson, refuse, privateJson, streamDetails,
 sqlProgram, sqlRank
} from "../../../lib/instructor-video-manager.js";

export const prerender = false;
export async function POST({request,locals}) {
  const staff = await authorizedInstructor(request,locals);
  if (!staff) return refuse("Not found.",404);
  if (!canPost(request)) return refuse("Invalid request.",403);
  const body = await readJson(request);
  const id = body?.id;
  const action = body?.action;
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id) ||
      !["status","publish","unpublish"].includes(action)) return refuse("Invalid lesson action.");
  const db=staff.env.LIVE_TRIAL_DB;
  let lesson;
  try {
    lesson = await db.prepare(
      "SELECT id,stream_uid,published,upload_status FROM portal_lessons WHERE id=?"
    ).bind(id).first();
  } catch { return refuse("The lesson database is unavailable.",503); }
  if (!lesson) return refuse("Lesson not found.",404);
  if (action === "status") {
    const info = await streamDetails(staff.env,lesson.stream_uid);
    if (!info) return refuse("The upload is not available yet. Try again after uploading.",502);
    const status = info.status?.state || "processing";
    try {
      await db.prepare("UPDATE portal_lessons SET upload_status=? WHERE id=?")
        .bind(String(status).slice(0,32),id).run();
    } catch { return refuse("Could not update video status.",503); }
    return privateJson({ok:true,status,ready:info.readyToStream===true && info.requireSignedURLs===true});
  }
  if (staff.staff.can_publish !== 1) return refuse("Publishing access is required.",403);
  if (action === "unpublish") {
    try {
      await db.batch([
        db.prepare("UPDATE portal_lessons SET published=0 WHERE id=?").bind(id),
        db.prepare("DELETE FROM portal_lesson_access WHERE lesson_id=?").bind(id)
      ]);
      return privateJson({ok:true,published:false,assigned:0});
    } catch { return refuse("Could not unpublish the lesson.",503); }
  }
  const info=await streamDetails(staff.env,lesson.stream_uid);
  if (!info || info.readyToStream !== true || info.requireSignedURLs !== true ||
      info.status?.state !== "ready") {
    return refuse("The video must finish processing and require signed URLs before publishing.",409);
  }
  if (lesson.published === 1) return refuse("This lesson is already published.",409);
  try {
    // Grants are restricted to ACTIVE students matching both selected program
    // and EXACT belt rank (or All Levels) and active family accounts.
    // Batch runs atomically in Cloudflare D1. No public visibility is toggled.
    await db.batch([
      db.prepare("DELETE FROM portal_lesson_access WHERE lesson_id=?").bind(id),
      db.prepare(`INSERT OR IGNORE INTO portal_lesson_access(account_id,lesson_id)
        SELECT DISTINCT s.account_id,l.id FROM portal_students s
        JOIN portal_accounts a ON a.id=s.account_id AND a.active=1
        JOIN portal_lessons l ON l.id=?
        WHERE s.active=1 AND ${sqlProgram} AND ${sqlRank}`).bind(id),
      db.prepare("UPDATE portal_lessons SET published=1,upload_status='ready' WHERE id=? AND published=0").bind(id)
    ]);
    const count=await db.prepare(
      "SELECT COUNT(*) AS count FROM portal_lesson_access WHERE lesson_id=?"
    ).bind(id).first();
    return privateJson({ok:true,published:true,assigned:count?.count ?? 0});
  } catch { return refuse("Could not publish the lesson or assign eligible students.",503); }
}

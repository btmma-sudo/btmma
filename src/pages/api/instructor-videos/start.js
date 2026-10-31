import {
  authorizedInstructor, canPost, readJson, refuse, privateJson,
  validLesson, videoConfig, uploadUrlValid
} from "../../../lib/instructor-video-manager.js";

export const prerender = false;

export async function POST({ request, locals }) {
  const staff = await authorizedInstructor(request, locals);
  if (!staff || staff.staff.can_upload !== 1) return refuse("Not found.", 404);
  if (!canPost(request)) return refuse("Invalid upload request.", 403);
  const body = await readJson(request);
  const lesson = validLesson(body);
  const bytes = body?.size;
  if (!lesson || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 190 * 1024 * 1024 ||
      !["video/mp4", "video/quicktime", "video/webm"].includes(body?.type)) {
    return refuse("Choose an MP4, MOV, or WebM video under 190 MB, and complete the lesson fields.");
  }
  if (!videoConfig(staff.env)) return refuse("Cloudflare Stream is not connected yet.", 503);
  const id = crypto.randomUUID();
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" +
    staff.env.STUDENT_PORTAL_STREAM_ACCOUNT_ID + "/stream/direct_upload";
  let details;
  try {
    const resp = await fetch(endpoint, {
      method:"POST",
      headers:{"Authorization":"Bearer " + staff.env.STUDENT_PORTAL_STREAM_API_TOKEN,
        "Content-Type":"application/json"},
      body:JSON.stringify({
        maxDurationSeconds: 1800,
        expiry:new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        requireSignedURLs:true,
        allowedOrigins:["burningtreemma.com"],
        meta:{name:lesson.title,portalLessonId:id}
      })
    });
    const result = resp.ok ? await resp.json() : null;
    if (!result?.success) return refuse("Unable to prepare the private video upload.", 502);
    details = result.result;
    if (!/^[a-f0-9]{32}$/i.test(details?.uid || "") ||
        !uploadUrlValid(details?.uploadURL)) return refuse("Upload destination could not be verified.", 502);
  } catch { return refuse("Video upload service is unavailable.",503); }

  try {
    await staff.env.LIVE_TRIAL_DB.prepare(
      `INSERT INTO portal_lessons
        (id,title,description,program,stream_uid,belt_level,created_by,created_at,upload_status,published)
        VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'pendingupload',0)`
    ).bind(id,lesson.title,lesson.description,lesson.program,details.uid,lesson.rank,staff.account.id).run();
  } catch { return refuse("Unable to save the private lesson draft. No lesson was published.",503); }

  return privateJson({ok:true,id,uploadURL:details.uploadURL,status:"pendingupload"});
}

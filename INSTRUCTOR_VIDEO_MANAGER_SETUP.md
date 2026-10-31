# Burning Tree Instructor Video Manager

Route: `https://burningtreemma.com/instructor-videos/` (private, noindex).
The URL exists but returns HTTP 404 to anyone without an authenticated, manually
authorized staff account. DO NOT create a public instructor registration form.

## Initial activation checklist

**Do not claim uploads or student publishing are operational until all these
conditions have been met and an end-to-end private test succeeds.**

1. Back up Cloudflare D1 `LIVE_TRIAL_DB`; apply `db/migrations/0002_student_portal.sql` if absent, then `db/migrations/0003_instructor_video_manager.sql` exactly once. The latter adds a staff-grants table and lesson metadata only; never modifies trial, seminar or billing tables.
2. Configure `STUDENT_PORTAL_SESSION_SECRET` (random 32+ bytes), `TURNSTILE_SECRET_KEY` and `STUDENT_PORTAL_ENABLED=true` as already documented in `STUDENT_PORTAL_SETUP.md`. The student portal currently may display `STUDENT LOGINS COMING SOON` if these prerequisites are missing.
3. Activate Cloudflare Stream for the studio and create a least-privilege token with **Stream Write + Stream Read** permissions, as required for direct creator uploads and status checks. Set Worker secrets `STUDENT_PORTAL_STREAM_ACCOUNT_ID` (32 hexadecimal characters) and `STUDENT_PORTAL_STREAM_API_TOKEN`. **Never commit API tokens or session secrets to GitHub.**
4. Create a unique, verified household/staff login with `scripts/provision-student-portal-account.mjs` (private, distinct password). After verifying the actual account email and the studio owner's approval, run
   `node scripts/grant-instructor-video-access.mjs staff@example.com`
   to print the grant SQL, then execute the approved SQL in D1 privately. This is intentionally NOT a public self-service privilege grant. Grant only the owner or approved instructors. For upload-only staff grant `can_upload=1, can_publish=0`.
5. Sign in at `/student-portal/` and open `Instructor Video Manager` from the authenticated dashboard, or navigate directly to the staff-only URL.
6. Upload a short **MP4, MOV, or WebM under 190 MB**; choose one program and an EXACT belt rank or `All Levels`. The browser uploads directly to Cloudflare Stream through a short-lived single-use URL, not through the site's server. The API token stays server-side. The upload remains private and unpublished.
7. Click **Check Status** after upload/processing. Click **Publish to Students** only after the processing check confirms `readyToStream=true`, `requireSignedURLs=true` and status `ready`. Publishing creates access grants only for active households with active students matching program and rank. Newly enrolled students may require staff republishing or an assignment reconciliation step: do not assume auto-enrollment.
8. Test in separate instructor and student browsers. Verify wrong-student programs/ranks cannot view the lesson, rank changes and deactivations revoke access on the next request, no public preview sees a video, and Unpublish revokes all access grants. Test mobile layout and failed uploads.
9. In the student portal, confirm short-lived Cloudflare Stream playback tokens work correctly for private lessons. The learner page issues a signed token server-side only for lessons with a current account-specific grant and active program/rank eligibility.
10. Billing remains independent and OFF. Do not enable card fees or overdue charges here.

## Safeguards and known limits
- Instructor authorization checks are performed server-side on **every** page/API request. Every staff grant is separate from a basic family account.
- No videos appear in the public `?preview=1` demonstration. The manager is not linked publicly.
- The direct upload URL is never returned to an unauthorized user.
- The first version accepts files under 190 MB (Cloudflare simple direct upload supports up to 200 MB). Larger or resumable uploads need a separate tus uploader.
- Titles 1–120 characters; descriptions up to 1,000 characters. Allowed programs are controlled by the code. Rank matching is EXACT in this version, or `All Levels`.
- Publishing is idempotent only in the sense that a second attempt returns a conflict and never duplicates a grant. If a video is already published and new students enroll, unpublish then publish again to reassign eligible families, after confirming the audience.
- Removing a student, changing a student's belt rank, or changing their program disqualifies them on the next student dashboard request even if an old grant exists.
- The first 100 most recent lessons are shown for staff management. Uploads that fail remain unpublished; staff can retry using a new draft. Do not re-use the upload URL.
- No staff accounts, password secrets, cloud videos, D1 migration, or API tokens are created automatically by publishing this code.

References:
- Cloudflare direct upload API: https://developers.cloudflare.com/api/resources/stream/subresources/direct_upload/methods/create/
- Direct creator uploads: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
- Video processing details: https://developers.cloudflare.com/api/resources/stream/methods/get/

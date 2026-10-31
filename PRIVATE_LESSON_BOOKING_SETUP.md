# Private Lesson Booking Calendar — Deployment Checklist

## Status
This feature is **staged only**. The booking page and instructor manager are coded, but real bookings stay disabled until the live database migration, staff authorization, time-slot publication, and email test are complete.

Public page: `/private-lessons/`
Private management page: `/private-lesson-manager/` (requires authorized Student Portal login)

## Database
Apply `db/migrations/0004_private_lesson_calendar.sql` to Cloudflare D1 **LIVE_TRIAL_DB** (database `burningtree-live-payments`) only after migrations 0002 and 0003 are already applied.

Example using the Wrangler CLI with the correct Cloudflare account credentials:

```bash
npx wrangler d1 execute burningtree-live-payments --remote --file=db/migrations/0004_private_lesson_calendar.sql
```

Verify table and column existence using Cloudflare D1 before proceeding. Note that D1 ALTER TABLE is not idempotent; do not repeat the same migration after it succeeds.

## Instructor access
Look up Coach David's exact, verified `portal_accounts.id`. Confirm it is the intended personal instructor account, not a parent/student account or another instructor. The permission starts disabled by default.

```sql
UPDATE portal_staff
SET can_manage_private_lessons=1
WHERE account_id='<verified-coach-david-account-id>' AND active=1;
```

Verify that exactly one correct record was updated; other staff accounts must remain at 0. This uses the existing portal authentication and never requires a shared administrator password.

## Open bookings only after testing
1. Sign in to Student Portal as Coach David, then open the Private Lesson Manager.
2. Publish a small number of non-conflicting **time windows**. The instructor chooses a date and the window's ending time; each window publishes 30-minute blocks. Students choose **30 minutes** (one block) or **1 hour** (two consecutive blocks). The public page does **not** sync to Google or Outlook calendars yet.
3. Validate the requested start limits, in **Eastern Time**: Monday–Thursday **8:00 PM or later**; Friday **7:00 PM or later**; Saturday **after 11:30 AM** (first 30-minute opening starts **12:00 PM**); Sundays closed. No fixed ending time is assumed; Coach David sets it each day. Check DST transitions and 30/60-minute selection.
4. Check Cloudflare Turnstile is functioning on the public page.
5. Verify the live `RESEND_API_KEY` and verified sending identity `noreply@burningtreemma.com`. If using a different owner inbox, configure `PRIVATE_LESSON_NOTIFICATION_EMAIL` to an address Coach David can receive.
6. Enable the Cloudflare Worker environment variable `PRIVATE_LESSON_BOOKING_ENABLED=true` only after steps 1-5.
7. Book a test 30-minute lesson and a test 60-minute lesson on separate published windows. Verify D1 contains the correct duration, that a 60-minute booking claims two blocks, that a 30-minute booking makes overlapping 60-minute starts unavailable, that duplicate or overlapping booking attempts fail, and that owner/student emails are sent when configured.
8. Test closing an unbooked slot, cancelling a booked slot, and rebooking after cancellation. The instructor **must personally notify the client** of any cancellation; automatic cancellation messages are not included.
9. Confirm the $29 trial and seminar checkout continue to work.
10. Merge/deploy when ready. Remove test appointments and test availability as appropriate.

### Important boundaries
- No payments are collected by this calendar; private coaching packages remain separate.
- Confirmations only email automatically when Resend is configured and accepts the send. Booking succeeds and is saved even when email delivery is unavailable.
- Private lesson booking information is stored only in the private D1 tables and exposed through the authenticated management API.
- There is a minimum 24-hour booking lead time and maximum 90-day advance window.
- The public calendar lists only coach-published half-hour openings. Day-specific **earliest starts are enforced**, but the instructor chooses the end of each window. No hours are automatically published and Sundays are always unavailable.
- Available appointment lengths: **30 minutes** or **60 minutes** only. One-hour bookings require two adjacent blocks, preventing overlapping lessons.
- Student Portal permissions and all existing $29 promotion, seminar, and payment tables remain untouched.

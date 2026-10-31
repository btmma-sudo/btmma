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
3. Validate the approved **Eastern Time** windows: Monday–Thursday **8:00 PM or later**; Friday **7:00 PM or later**; Saturday **noon–5:00 PM** (first half-hour opening begins after 11:30 AM); Sunday **9:00 AM–2:00 PM** and **4:00–6:00 PM**. Sunday 2–4 PM is blocked. Coach David still controls which portions of each window to publish. Check DST transitions and 30/60-minute selection.
4. Check Cloudflare Turnstile is functioning on the public page.
5. Verify the live `RESEND_API_KEY` and verified sending identity `noreply@burningtreemma.com`. If using a different owner inbox, configure `PRIVATE_LESSON_NOTIFICATION_EMAIL` to an address Coach David can receive.
6. Enable the Cloudflare Worker environment variable `PRIVATE_LESSON_BOOKING_ENABLED=true` only after steps 1-5.
7. Book test 30- and 60-minute lessons. Verify D1 records duration; a 60-minute booking claims two half-hour blocks; overlapping booking attempts fail; and owner/student emails are sent when configured. Test Saturday 4:30 PM (30 minutes allowed, 60 minutes blocked); Sunday 1:30 PM (30 minutes allowed, 60 minutes blocked); Sunday 2–4 PM blocked entirely; Sunday 5:30 PM (30 minutes allowed, 60 minutes blocked); and both endpoints at 5 PM Saturday/6 PM Sunday. Confirm restricted windows cannot be published through the management API.
8. Test closing an unbooked slot, cancelling a booked slot, and rebooking after cancellation. The instructor **must personally notify the client** of any cancellation; automatic cancellation messages are not included.
9. Confirm the $29 trial and seminar checkout continue to work.
10. Merge/deploy when ready. Remove test appointments and test availability as appropriate.

### Important boundaries
- No payments are collected by this calendar; private coaching packages remain separate.
- Confirmations only email automatically when Resend is configured and accepts the send. Booking succeeds and is saved even when email delivery is unavailable.
- Private lesson booking information is stored only in the private D1 tables and exposed through the authenticated management API.
- There is a minimum 24-hour booking lead time and maximum 90-day advance window.
- The public calendar lists only coach-published half-hour openings. The full approved weekday and weekend windows are enforced server-side. Saturday bookings cannot extend past 5 PM; Sundays are 9 AM–2 PM and 4–6 PM, with a blocked 2–4 PM break. No hours are automatically published.
- Available appointment lengths: **30 minutes** or **60 minutes** only. One-hour bookings require two adjacent blocks, preventing overlapping lessons.
- Student Portal permissions and all existing $29 promotion, seminar, and payment tables remain untouched.

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
2. Add a small number of non-conflicting dates/times. The instructor manages open slots manually; the public page does **not** sync to Google or Outlook calendars yet.
3. Confirm the correct Eastern Time and duration, including DST transitions.
4. Check Cloudflare Turnstile is functioning on the public page.
5. Verify the live `RESEND_API_KEY` and verified sending identity `noreply@burningtreemma.com`. If using a different owner inbox, configure `PRIVATE_LESSON_NOTIFICATION_EMAIL` to an address Coach David can receive.
6. Enable the Cloudflare Worker environment variable `PRIVATE_LESSON_BOOKING_ENABLED=true` only after steps 1-5.
7. Book a test slot. Check the saved D1 booking, owner and student emails, and that an identical second booking fails.
8. Test closing an unbooked slot, cancelling a booked slot, and rebooking after cancellation. The instructor **must personally notify the client** of any cancellation; automatic cancellation messages are not included.
9. Confirm the $29 trial and seminar checkout continue to work.
10. Merge/deploy when ready. Remove test appointments and test availability as appropriate.

### Important boundaries
- No payments are collected by this calendar; private coaching packages remain separate.
- Confirmations only email automatically when Resend is configured and accepts the send. Booking succeeds and is saved even when email delivery is unavailable.
- Private lesson booking information is stored only in the private D1 tables and exposed through the authenticated management API.
- There is a minimum 24-hour booking lead time and maximum 90-day advance window.
- The public calendar lists only coach-published slots; there are no invented/default teaching hours.
- Student Portal permissions and all existing $29 promotion, seminar, and payment tables remain untouched.

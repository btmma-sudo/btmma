# Burning Tree Private Lesson Booking — Launch Checklist

## What was built

- Student booking page: /private-lessons/
- Private instructor calendar manager: /instructor-private-lessons/
- Public availability/booking API: /api/private-lessons/book
- Staff scheduling API: /api/private-lessons/manage
- New isolated D1 table: private_lesson_slots
- Links in the site's desktop/mobile navigation and footer.
- Booking disabled by default; no sample appointments or fabricated availability.

All changes are independent of the $29 trial, seminar payments, and current student video access.

## Before enabling public reservations

1. Apply the new SQL migration to **LIVE_TRIAL_DB** only. In this repository, the Cloudflare database is named burningtree-live-payments:
   
   \`\`\`bash
   npx wrangler d1 execute burningtree-live-payments --remote --file=db/migrations/0004_private_lesson_booking.sql
   \`\`\`
   
   Back up/inspect production database first. Do not run the 0001–0003 migration files again by mistake.
2. Sign into the existing Student Portal using the authorized instructor account, with active portal_staff can_publish=1. Its account grants access to /instructor-private-lessons/. No student may manage the calendar.
3. Open test availability. The system publishes only intentionally opened appointments, at least 24 hours out and up to 90 days ahead; choose 30, 45, 60 or 90 minutes. Overlapping appointments are refused.
4. Confirm the existing Cloudflare Turnstile site key used by the $29 form is still active for the live hostname and TURNSTILE_SECRET_KEY exists. The server verifies tokens, once per booking, before changing availability.
5. If email notifications are desired, confirm RESEND_API_KEY and verification of noreply@burningtreemma.com. Set PRIVATE_LESSON_NOTIFICATION_EMAIL to the instructor's working inbox (for example, david@burningtreemma.com). Without verified email, bookings will be saved and displayed in the instructor manager, but email confirmations will not be promised.
6. Set PRIVATE_LESSON_BOOKINGS_ENABLED="true" in the Cloudflare Worker environment (or wrangler.jsonc vars, followed by deployment) **only after the above checks**.
7. Test: open one slot in the manager, check it appears at /private-lessons/, book it using a real email and Turnstile, confirm it disappears from public availability, and confirm it appears as BOOKED in the instructor manager. Confirm email deliveries before advertising automatic email confirmations.
8. Review personal-data handling and cancellation/reschedule policy before wide release. A booked appointment cannot be closed in the first-version manager; instructor handles changes by direct contact.

## Important boundaries

- This calendar does **not** yet sync with Google Calendar/Outlook. Availability is set by the instructor in this manager; do not open times already committed elsewhere. Google Calendar connection is optional and requires a separate integration.
- There is **no online payment** in this initial calendar. No price or payment obligation is implied by reservation; package or single-session payment can be arranged separately.
- No automatic text messages are sent.
- By design, booked contact information is only accessible to an authenticated instructor with can_publish permission. The public endpoint returns only empty available slot IDs, dates, times, and durations.
- Use Coach David's contact number 410-218-0894 for booking questions, without changing the main studio number or other site flows.

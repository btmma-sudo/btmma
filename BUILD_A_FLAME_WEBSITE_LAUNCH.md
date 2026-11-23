# Build a Flame — December 6, 2026: website launch checklist

This registration belongs to the Burning Tree public website, **not GoHighLevel**.
The site is intentionally safe-by-default until two real session start times are supplied.

## Public route and price

- Landing page: https://burningtreemma.com/build-a-flame/
- Program: Build a Flame — Confidence & Emotional Strength Workshop
- Date: Sunday, December 6, 2026
- Exactly two **60-minute** sessions; maximum **12 paid/held child seats per session**
- $50 for each child; one parent or guardian included
- Register and pay by Sunday, November 29, 2026 (11:59 PM Eastern)
- Program promotion includes confidence, emotional regulation, peer pressure, bullying responses, and resilience.

## Configuration before activating registration

In wrangler.jsonc, set these non-secret vars with actual confirmed 24-hour Eastern start times:

"BUILD_A_FLAME_SESSION_1_TIME": "HH:MM",
"BUILD_A_FLAME_SESSION_2_TIME": "HH:MM"

Replace HH:MM with a **real** time (e.g. 09:00, not placeholders). They must be at least 60 minutes apart. No session time was provided as of the draft.

Only after the session times, page rendering, inventory and a safe authorized payment test have been verified, change:

"BUILD_A_FLAME_REGISTRATION_ENABLED": "true"

Existing Cloudflare bindings/secrets required: LIVE_TRIAL_DB, TURNSTILE_SECRET_KEY, STRIPE_LIVE_SECRET_KEY and STRIPE_LIVE_WEBHOOK_SECRET. The existing signed webhook at /api/stripe-webhook-live processes this workshop's paid Stripe events separately from trials and other programs. Stripe secrets never belong in a frontend file or git.

## Registration behavior

1. Guardian enters name, email and phone; selects a session and one to six children, entering each child's name and age.
2. Turnstile validates the form.
3. The server checks and atomically holds the requested number of seats in a **separate D1 table**. No browser-provided price or seat quantity is trusted.
4. Stripe Checkout charges **$50 per child**, accepting cards and supported wallets. Card numbers are never stored on the website.
5. The confirmation page and signed Stripe webhook independently verify paid status with Stripe, then set the registration to paid in D1.
6. Abandoned checkout holds are reconciled with Stripe before they are released; payment verification failures keep booking closed rather than risking overselling.
7. After November 29, new online workshop checkouts are disabled.

## Required prelaunch acceptance tests

- Both selected session labels show the verified local time; session 2 does not overlap session 1.
- Page works on mobile and desktop and the Events-page call-to-action points to it.
- A safe, authorized Stripe payment test produces **paid** and confirmed status in D1, not just an apparent successful redirect.
- Attempting 13 child seats in one session never succeeds, even via concurrent requests.
- A failed, abandoned or cancelled checkout does not create a paid registration.
- No cross-contamination of $29 trial, student portal, private lessons, seminars or existing Stripe webhooks.
- Use only a QR code that resolves to the VERIFIED public registration URL (no stale flyer QR).
- Obtain/record parental waiver acknowledgement before physical participation.
- Check the existing event schedule for conflicts.

## Registration confirmations and reminders (drafts for owner review)

**No new automatic emails or reminders are turned on by this pull request.** The payment confirmation appears on screen, and Stripe can issue its own receipt according to existing Stripe settings. Owner must review and approve any additional notification copy before it is activated.

Proposed confirmation email:
Subject: You're registered — Build a Flame, December 6

Thank you for registering for Build a Flame at Burning Tree Mixed Martial Arts. Your payment has been verified and your child's seat is confirmed for your selected December 6 session. One parent or guardian is included. Please arrive a few minutes early at 10210 S. Dolfield Rd., Suite C, Owings Mills, MD 21117. Questions? Call or text 410-218-0894. One Tree. One Family.

Proposed 24-hour reminder:
Your Build a Flame workshop is tomorrow, December 6. We look forward to seeing you at Burning Tree Mixed Martial Arts. Please arrive a few minutes before your confirmed session start time. Questions? 410-218-0894.

Proposed reminder for unpaid inquiries:
Your Build a Flame registration is not confirmed until payment is verified. The registration deadline is November 29, and each session has just 12 child seats. For help, call or text 410-218-0894.

## Owner operating notes

To review registrations, read the Cloudflare D1 table flame_workshop_registrations. A row is confirmed only when status='paid'; Stripe is the authoritative payment processor. Sensitive child and parent details are stored server-side, not in the public page or checkout session metadata.

### QR link
https://burningtreemma.com/build-a-flame/

Do not distribute a QR code until the domain page and payment flow have been verified.

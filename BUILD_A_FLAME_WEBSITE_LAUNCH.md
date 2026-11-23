# Build a Flame — Saturday, December 5, 2026: website launch checklist

This workshop registration belongs to the Burning Tree public website, not GoHighLevel.

## Confirmed event

- Public registration address, after publication: https://burningtreemma.com/build-a-flame/
- **Saturday, December 5, 2026 · 11:45 AM–12:45 PM Eastern Time**
- **One 60-minute session**, with a hard limit of **12 paid or held child seats total**
- **$50 per child**, with one parent or guardian included at no extra charge
- **Register and pay by Sunday, November 29, 2026 (11:59 PM Eastern)**
- Confidence, emotional regulation, safe responses to bullying, peer pressure, resilience and self-respect

## Safe launch gate

The new workshop registration remains OFF in wrangler.jsonc:

`"BUILD_A_FLAME_REGISTRATION_ENABLED": "false"`

Unlike an earlier draft, **there are no missing or required session-time variables**. The one confirmed Saturday workshop time is set in `src/lib/build-a-flame.js`.

Only after successfully checking the live production infrastructure, seat inventory and the secure checkout flow, flip the flag to `"true"`. Do not expose a chargeable checkout beforehand.

Existing Cloudflare production bindings/secrets required: LIVE_TRIAL_DB, TURNSTILE_SECRET_KEY, STRIPE_LIVE_SECRET_KEY and STRIPE_LIVE_WEBHOOK_SECRET. The existing signed webhook at `/api/stripe-webhook-live` reconciles workshop payments separately from trials, seminars and other products.

## Registration process

1. Parent or guardian enters name, phone, email, and one to six children's names and ages. All registrations are for the single December 5 workshop.
2. The server verifies Cloudflare Turnstile and validates the data.
3. A dedicated Cloudflare D1 table atomically reserves the selected child seats, blocking the thirteenth child even under concurrent demand.
4. Stripe Checkout takes **$50 per child** (card and supported wallets), with no card details stored on this website.
5. A Stripe-signed webhook and the success page independently verify payment directly with Stripe before recording status `paid`.
6. Abandoned, expired and failed checkouts remain unconfirmed; pending sessions are verified before seats are released.
7. New online registration closes automatically at the November 29 deadline.

## Before activating payments

- [ ] Review mobile and desktop appearance, branding, copy, and Saturday December 5, 11:45–12:45 EST wording.
- [ ] Confirm Cloudflare Workers production deployment and live D1 and Turnstile secrets are healthy.
- [ ] Verify Stripe checkout can open and a safe authorized payment test is correctly reconciled in D1.
- [ ] Test sold-out and competing reservations: a thirteenth seat cannot be issued.
- [ ] Confirm no interactions with $29 trial, private lessons, women's defense, student portal or seminar checkouts.
- [ ] Confirm child-safety and participation waiver procedure before children attend.
- [ ] Review and approve confirmation and reminder copy before enabling sending.
- [ ] **Correct the earlier flyer: it presently advertises Sunday December 6 and two sessions.** Replace it with Saturday December 5, 11:45–12:45, one session; don't circulate the old QR until the production destination is verified.

## Owner-review notification drafts — NOT enabled

**Confirmation email subject:** Your Build a Flame registration — Saturday, December 5

Thank you for registering for Build a Flame at Burning Tree Mixed Martial Arts. Your payment has been verified and your child's seat is confirmed for Saturday, December 5, from 11:45 AM to 12:45 PM. One parent or guardian is included. Please arrive a few minutes early at 10210 S. Dolfield Rd., Suite C, Owings Mills, MD 21117. Questions? Call or text 410-218-0894. One Tree. One Family.

**24-hour reminder:** Your Build a Flame workshop is tomorrow, Saturday, December 5, from 11:45 AM to 12:45 PM. Please arrive a few minutes early at Burning Tree Mixed Martial Arts. Questions? 410-218-0894.

**Unpaid registration reminder:** The Build a Flame registration and payment deadline is November 29, and only 12 child seats are available. Payment must be verified to confirm a seat. For help, call or text 410-218-0894.

No new automatic emails or text reminders are enabled by this PR. Parent and child details are stored server-side, not exposed in checkout session metadata.

Review the dedicated `flame_workshop_registrations` table in Cloudflare D1. Only rows with `status='paid'` are confirmed.

# Private Student Portal — deployment and security checklist

This is a **review branch**, not a live student portal. It does not alter the
existing $29 special, seminar checkouts, webhook handlers, or recurring tuition
agreements. The portal deliberately **does not add** a 3% card surcharge or
$50 late fee. Payments default **OFF**.

## Privacy and accounts

- Route: `/student-portal/`. Every request is rendered server-side, not a
  static password-hidden page. No public self-registration.
- One distinct password-protected account per parent/household; guardians
  control accounts for minor students.
- Passwords are salted PBKDF2-SHA256 (210,000 iterations), never stored as
  plain text. Session cookies are signed, HttpOnly, Secure, SameSite=Lax,
  expire after 12 hours and can be invalidated by increasing session_version.
- Login requires Cloudflare Turnstile and locks an account for 15 minutes
  after seven failed attempts. Configure Cloudflare WAF/rate limiting for the
  login endpoint before launch (to reduce password spraying).
- D1 access is restricted to the account ID from a server-verified signed
  session. Cloudflare Stream videos must be configured with
  `requireSignedURLs=true`; unsigned videos are never linked.
- Student pages have no marketing pixels, public analytics, or public SEO.
  Security headers explicitly disable indexing and browser caching.
- Never create student accounts by copying enrollment details automatically;
  confirm guardian access, privacy and approval first.

## Infrastructure prerequisites (do not skip)

1. Deploy only after review and test on a staging environment. The Astro
   Cloudflare adapter already supports on-demand routes via prerender=false.
2. Create/apply `db/migrations/0002_student_portal.sql` to the existing
   `LIVE_TRIAL_DB` database ONLY after confirming backups. The migration
   creates *new* portal_* tables and does not change current workflows.
3. Set a random 32+ character Cloudflare Worker secret
   `STUDENT_PORTAL_SESSION_SECRET`. Existing `TURNSTILE_SECRET_KEY` is also
   required. Do not put secrets in `wrangler.jsonc` or GitHub.
4. For each family, prepare a distinct password privately. Run locally:
   `PORTAL_PASSWORD='use-a-private-password' node scripts/provision-student-portal-account.mjs 'Family display name' 'parent@example.com' > family-account.sql`.
   Avoid terminal history; ideally set PORTAL_PASSWORD via a secret manager
   instead of typing it on command lines. Treat the generated SQL as sensitive.
   Apply it privately with D1 admin tooling, then delete the file securely.
5. Add authorized students to `portal_students` manually. Publish videos
   by inserting a valid Stream UID in `portal_lessons`, setting
   `published=1`, and assigning the lesson specifically to approved
   households in `portal_lesson_access`.
6. In Cloudflare Stream, enable `requireSignedURLs` for every lesson.
   Set secrets `STUDENT_PORTAL_STREAM_ACCOUNT_ID` and
   `STUDENT_PORTAL_STREAM_API_TOKEN` (least-privilege Stream token).
   The portal requests short-lived signed viewing tokens server-side.
   Until credentials/videos are present, no video URLs are exposed.
7. For tuition, establish Stripe **live** customer records and confirmed
   membership invoices/subscriptions *outside* this new portal. Store the
   correct `cus_...` ID on each household, after manual verification.
   This portal **does not** create subscriptions or invoices.
8. Create a dedicated Stripe customer portal configuration permitting
   **invoice/payment-method access only**; disable cancel subscription,
   subscription switching and all other account changes not permitted under
   the membership agreement. Store its `bpc_...` ID as secret variable
   `STUDENT_PORTAL_STRIPE_PORTAL_CONFIGURATION_ID`.
9. Set `STUDENT_PORTAL_PAYMENTS_ENABLED=true` **only after** testing
   authorized account access, incorrect account isolation, receipts,
   billing-account matching, failed checkout, refund, payment updates,
   and any fees with a real billing expert and Maryland counsel.
10. Test login, logout, lockout, cookie forgery, expired sessions, WAF,
    Stream private-video leakage, mobile layout and Stripe customer access.
    Rotate credentials for affected users if a password was ever shared.

## Payment policy — compliance hold

Do not apply a blanket 3% to card checkout: U.S. debit/prepaid card surcharges
are prohibited by card-network rules; Visa's credit cap is the lesser of 3%
or cost of acceptance, and notice/disclosure obligations apply.
The default Stripe-hosted Billing Portal cannot safely infer a special 3%
credit-only fee from this app's standalone total; use an approved
processor-compatible surcharge workflow or legally vetted pricing approach.

Maryland Commercial Law §14-1315 generally sets a consumer-contract late fee
under one option at the greater of $5 or 10% of the overdue monthly payment,
with timing generally 15 days after the bill is rendered (or due date if no
bill is rendered). Other specific restrictions may apply. A $50 late fee after
five days must **not** be applied automatically without legal advice. Grace
period reminders may be sent after five days without adding fees. Contract
language and each family's applicable terms must be confirmed in advance.

References:
- https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=gcl&section=14-1315
- https://usa.visa.com/dam/VCOM/global/support-legal/documents/merchant-surcharging-considerations-and-requirements.pdf
- https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
- https://support.stripe.com/questions/billing-customer-portal

## Live readiness

No student account, video, subscription, invoice, payment, or Stripe Billing
configuration has been created in live services by this branch. The private
dashboard is only **code staged for review**. Do not describe as deployed.

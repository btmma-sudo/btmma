# Private Student Portal — deployment and security checklist

The public Student Portal landing page and **sample dashboard preview** are
currently available. Private family sign-in remains fail-closed until Cloudflare
D1 migrations, account records, session secret, Turnstile and login protections
are verified. `STUDENT_PORTAL_RELEASED=true` and `STUDENT_PORTAL_ENABLED=true`
allow the public login route to render but are **not sufficient** to activate
family accounts. This does not alter existing $29 trial, seminars, events,
website checkouts, or membership agreements.

Tuition actions have **two additional locks**:
`TUITION_BILLING_RELEASED=false` in source and
`STUDENT_PORTAL_PAYMENTS_ENABLED=false` at runtime. Both remain OFF during
testing. The new four-week prices are inactive. This portal never automatically
adds a blanket 3% card surcharge or a $50 late fee.

## Current Cloudflare setup verified on November 10, 2026

- Installed D1 migration `0002_student_portal.sql`: four dedicated
  `portal_*` tables confirmed in production.
- Installed `0003_instructor_video_manager.sql` table and video lesson
  columns; `portal_staff` present with zero assigned privileges.
  Verify both associated indexes (`idx_portal_lessons_stream_uid`,
  `idx_portal_lessons_program_rank`) before the first instructor upload;
  column verification alone does not verify indexes.
- Cloudflare encrypted secret `STUDENT_PORTAL_SESSION_SECRET` is present;
  `TURNSTILE_SECRET_KEY` is also configured.
- The real family email/password sign-in form is shown publicly. This does
  **not** mean that a family account or staff account exists.
- A Free-tier Cloudflare WAF rate-limit rule was created: for
  `POST /api/student-portal/login`, more than 10 requests within
  10 seconds from the same IP are blocked for 10 seconds. The application
  also performs per-account 7-failure/15-minute lockout.
- Cloudflare Stream hosts **no private videos** and the Worker lacks
  `STUDENT_PORTAL_STREAM_ACCOUNT_ID` and
  `STUDENT_PORTAL_STREAM_API_TOKEN`. Video upload/playback remains unavailable.
- `STUDENT_PORTAL_PAYMENTS_ENABLED=false`, and the separate code billing
  release lock is false. Do not enable live tuition collections.

## Cloudflare password hashing incident — November 10, 2026

**Cause confirmed:** The private owner password form failed at the
`password_hash` stage before the D1 account-creation batch.
Cloudflare's workerd rejects PBKDF2 requests exceeding **100,000**
iterations with `NotSupportedError`, but owner password creation,
normal family login verification, and private staff helper scripts were
configured for 210,000. This was a runtime incompatibility, not a
wrong password, Resend issue, or Cloudflare Turnstile problem.

**Repair:** All password creation, checking, staff provisioning,
password reset, and security tests now share one constant:
`PORTAL_PASSWORD_PBKDF2_ITERATIONS=100000`, the platform's current
supported ceiling. PBKDF2-SHA256 still uses a cryptographically
random 16-byte salt and a 32-byte derived hash; the portal also
requires long unique passwords, per-account lockout, Turnstile and
WAF login rate limiting. Do not silently raise the iteration count
without a tested migration and alternate KDF implementation.

Previously generated **unapplied** SQL files from the older local
scripts may contain 210,000-iteration hashes and must be **regenerated**.
If a household was provisioned manually with those earlier scripts,
its password must be reset using the repaired script before it can
log in. Never expose credentials, hashes or authentication tokens in
GitHub or chat.

Once the repaired website deployment passes tests, the owner should
request a **fresh** 15-minute invitation and set the account password
privately. The failed previous attempt did not reach the D1 batch.
Always verify owner login and logout on the actual website before
inviting families. Live tuition charges remain disabled.

## First owner account — email-verified, no password in chat

The first owner/instructor account is reserved for
`hybridkenpokarate@gmail.com`. The canonical owner setup page is
`https://burningtreemma.com/student-portal/setup-owner/`.

**Verified Student Portal sending subdomain:** On November 10, the owner
confirmed `portal.burningtreemma.com` is verified in the CURRENT Resend
team. The primary `burningtreemma.com` domain belongs to a DIFFERENT
Resend team and its ownership must not be transferred just to send owner
invitation emails. The Student Portal alone now sends through
`Burning Tree Student Portal <noreply@portal.burningtreemma.com>`.
All other website mail senders and Resend settings are unchanged.

**Required private deployment setting:** In the Resend team where
`portal.burningtreemma.com` is verified, create a NEW API key authorized
to **send email** from that subdomain. In Cloudflare Dashboard →
Workers & Pages → `burningtreemma` → Production → Settings →
Variables and secrets, add the encrypted **Secret**
`STUDENT_PORTAL_RESEND_API_KEY` with that newly issued key as its value.
Do not share the key in chat, GitHub or screenshots. Do not overwrite
the existing `RESEND_API_KEY` key: other website forms rely on it.
The setup request fails closed without this dedicated secret.
Save/deploy the secret as appropriate, keeping
`STUDENT_PORTAL_PAYMENTS_ENABLED=false` and all other settings unchanged.
Only after the secret is configured should the owner retry requesting an
invitation. No need for TinyFish or screenshots.

**Email delivery troubleshooting:** If the setup form displays a delivery
error after Turnstile succeeds, Resend rejected the server's email request;
it does NOT mean that a password was set or a real owner login exists.
The website displays only a safe HTTP status (for example 401, 403,
422, 429), and an optional sanitized provider code; it NEVER exposes
the invite token, API key, provider request body, or recipient metadata.
Resend's **Logs → Errors** page can identify a rejected POST /emails
request. A 401 points to the API key, a 403 often means sending-domain
verification or key permission restrictions, 400/422 points to sender
or request validation, and 429 means rate limiting. Verify that
`portal.burningtreemma.com` is in **Resend → Domains** of the
same team that issued `STUDENT_PORTAL_RESEND_API_KEY`. Do not send any
keys, complete token-bearing links, or raw log request bodies through
chat. The email failure path invalidates its one-time token and clears
its pending cooldown so a new email can be requested after fixing
the provider.

The owner clicks **Email My Setup Link** and completes Turnstile. The server
sends a 15-minute one-time token through the newly verified
`noreply@portal.burningtreemma.com` Resend sender. Tokens are generated from Web
Crypto's secure random generator, hashed before D1 storage, delivered
only to the approved email, and placed in a URL **fragment** so that opening
the link does not send it in an HTTP GET or ordinary referrer.
The browser removes the fragment on load, then sends the token and chosen
password through HTTPS POST to complete setup. Passwords are stored only as
salted PBKDF2-SHA256 hashes and are never sent in email or chat.

The separate `portal_owner_setup_challenges` table is created
idempotently when an eligible request is made. Setup email requests have
a 10-minute server-enforced cooldown. First-owner setup stops permanently
once that email account exists or any active publisher has been granted
staff permissions. Owner and publisher creation and token consumption are
executed as an atomic Cloudflare D1 batch. The first owner signs in with
a 12-hour HttpOnly, Secure, SameSite=Lax cookie.

This endpoint **does not** change `STUDENT_PORTAL_PAYMENTS_ENABLED=false`,
create Stripe objects, enroll a family automatically, modify trial or seminar
payments, or allow public self-registration. An owner should have MFA enabled
on the recipient Google account. Check for successful email delivery and test
owner login/logout once before onboarding any other families.

## Staff onboarding without browser automation

Until a staff admin interface is explicitly approved, private household
account provisioning is done via staff-only local scripts and Cloudflare D1
Console. No screenshots or browser agent are needed to **generate** the SQL.
A privileged person must still verify the guardian, authorize a membership
and apply generated SQL to the correct production D1 database.

1. For a verified owner/staff member, run
   `PORTAL_PASSWORD=<secret from secure environment> node scripts/provision-student-portal-account.mjs 'Approved staff display name' 'verified_staff@example.com' > private-account.sql`
   on a trusted computer, then apply it to the portal database privately.
   Passwords must be unique and delivered securely. Do not share secrets in
   GitHub, chat, screenshots, or email. A named staff member must be authorized
   by the owner; no public enrollment is allowed.
2. AFTER verifying the account exists, run
   `node scripts/grant-instructor-video-access.mjs 'verified_staff@example.com' > private-grant.sql`
   and explicitly approve/apply the privilege grant to `portal_staff`.
   Staff access is not automatically granted on account creation.
3. To add a student to an approved active guardian's account and grant only
   previously published lessons matching the exact program/belt:
   `node scripts/add-student-to-portal.mjs 'guardian@example.com' 'Student Name' 'American Kenpo Karate' 'Yellow Belt' > private-student.sql`
   then apply the first `INSERT`, verify it added exactly one student,
   and only then apply the scoped lesson-access `INSERT`. Never import all
   trial leads as students without guardian confirmation.
4. For a verified password reset, use
   `scripts/reset-student-portal-password.mjs` to generate the private
   session-revoking SQL and deliver the new password privately.
5. Validate one real guardian sign-in, one staff sign-in, logout, wrong
   password, account lockout, Turnstile, and cross-household separation
   before sending invitations to families.

**Siteverify caveat:** Cloudflare Turnstile analytics may say "Siteverify
isn't being called" while nobody has submitted this particular login form.
The login API already calls server-side Siteverify. The hardened login
also checks for a valid response from the canonical
`burningtreemma.com` hostname and the unique
`student_portal_login` action; it still requires a genuine real-login
test. Never rely on a dashboard analytics warning to determine whether
the application's server code validates challenges.

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

1. The public portal page is enabled, but individual account sign-in is fail-closed until setup is complete. Do not onboard families before verifying migration, authentication, rate limiting, and privacy. The Astro
   Cloudflare adapter already supports on-demand routes via prerender=false.
2. Create/apply `db/migrations/0002_student_portal.sql` to the existing
   `LIVE_TRIAL_DB` database ONLY after confirming backups. The migration
   creates *new* portal_* tables and does not change current workflows.
3. Set a random 32+ character Cloudflare Worker secret
   `STUDENT_PORTAL_SESSION_SECRET`. Existing `TURNSTILE_SECRET_KEY` is also
   required. Do not put secrets in `wrangler.jsonc` or GitHub.
4. For each **consenting, verified guardian** prepare a distinct password privately. Run locally:
   `PORTAL_PASSWORD='use-a-private-password' node scripts/provision-student-portal-account.mjs 'Family display name' 'parent@example.com' > family-account.sql`.
   Avoid terminal history; ideally set PORTAL_PASSWORD via a secret manager
   instead of typing it on command lines. Treat the generated SQL as sensitive.
   Apply it privately with D1 admin tooling, then delete the file securely.
   To reset a verified guardian password and revoke existing sessions, run
   `PORTAL_PASSWORD='<new-private-password>' node scripts/reset-student-portal-password.mjs 'parent@example.com' > private-reset.sql`
   on a trusted staff machine. Never email or commit SQL, passwords or hashes;
   verify the guardian's identity and deliver temporary credentials privately.
   A self-service reset flow is not enabled.
5. Add guardian-approved students to `portal_students` manually, then
   attach approved lessons only to verified active households. Existing
   published lessons must be assigned to newly onboarded students as part of
   provisioning; simply adding a student does not automatically grant access.
   Instructors can publish videos using `/instructor-videos/` only after
   verified staff access is granted in `portal_staff` and Stream is ready.
   Never grant lesson access to a household just because it submitted a lead.
6. In Cloudflare Stream, enable `requireSignedURLs` for every lesson.
   Set secrets `STUDENT_PORTAL_STREAM_ACCOUNT_ID` and
   `STUDENT_PORTAL_STREAM_API_TOKEN` (least-privilege Stream token).
   The portal requests short-lived signed viewing tokens server-side.
   Until credentials/videos are present, no video URLs are exposed.
7. For tuition, establish Stripe **live** customer records and confirmed
   membership invoices/subscriptions *outside* this new portal. Store the
   correct `cus_...` ID on each household, after manual verification.
   This portal **does not** create subscriptions or invoices.
8. A dedicated Stripe customer portal configuration has been created in the live
   account, but its use by the student portal is **disabled**. Confirm it permits
   **invoice/payment-method access only**; disable cancel subscription,
   subscription switching and all other account changes not permitted under
   the membership agreement. Store its `bpc_...` ID as secret variable
   `STUDENT_PORTAL_STRIPE_PORTAL_CONFIGURATION_ID` (non-secret config ID).
9. Set `STUDENT_PORTAL_PAYMENTS_ENABLED=true` and explicitly release the
   separate code lock `TUITION_BILLING_RELEASED=true` **only after** testing
   authorized account access, incorrect account isolation, receipts,
   billing-account matching, failed checkout, refund, payment updates,
   and any fees with a real billing expert and Maryland counsel.
10. Run `npm run test:portal`, `npm run check` and `npm run build`.
    Test real login, logout, lockout, cookie forgery, expired sessions,
    Cloudflare WAF limits, private-video leakage, mobile layout, and one
    household's inability to view any other household's student or billing.
    Offline unit tests cannot substitute for a live Cloudflare integration
    and sandbox Stripe transaction test.
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

No student account, video, subscription, invoice, or payment has been created by this staged rollout. A restricted, noncharging live Stripe Billing Portal configuration has been created, but its student-portal connection remains disabled. See `TUITION_BILLING_28_DAY_ROLLOUT.md` for the 28-day AutoPay/Pay Now staging checklist. The public student login page is open, while family login is disabled until verified session secret and database migration are configured. Stripe billing is OFF. Never publish lessons or billing details before confirming privacy and ownership. No 3% card or $50 late fees are implemented.

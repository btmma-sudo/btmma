# Burning Tree — 28-day AutoPay and Pay Now rollout

**Status: STAGED / NO LIVE TUITION BILLING.** Do not merge or change release locks until the checklist below has been reviewed. This repository does **not** create Stripe subscriptions or collect tuition automatically.

## Current safe state

- Dedicated **live** Stripe Customer Portal configuration created: `bpc_1Ua5rRDFqxIwgzLY4UIJCYov`.
  Invoice history and payment-method updates are enabled. Subscription
  cancellation, plan switching, customer detail edits and public Stripe login
  are disabled. The configuration itself does not bill any customer.
- The student website runtime setting remains `STUDENT_PORTAL_PAYMENTS_ENABLED=false`.
- The separate code release lock `TUITION_BILLING_RELEASED=false` remains in
  `src/lib/tuition-billing-launch.js`; **both** locks are required to expose
  household-specific billing.
- No tuition subscription was created or modified by this rollout. Existing
  $29 trial, seminars, events, or birthday checkouts are unchanged.
- A guardian with an approved account, session and linked Stripe customer ID
  will eventually be able to see their own live invoice history, verified
  **four-week AutoPay status**, a **Pay Now** link for any remaining balance
  on an eligible open USD invoice, and a Stripe-hosted **Manage AutoPay &
  Payment Method** page. Pay Now uses Stripe's existing
  `hosted_invoice_url`; the website never captures card details.
- The invoice links are displayed only when the matching logged-in household
  owns the invoice and Stripe confirms it is a **live** invoice. Portal payment
  access remains hidden while disabled.

## Tuition plans to configure in Stripe after policy approval

- Legacy tuition base plan: **$150.00 USD, recurring every 4 weeks**.
- New enrollment base plan: **$189.00 USD, recurring every 4 weeks**.
- In Stripe: `recurring.interval = "week"`,
  `recurring.interval_count = 4`; **not** calendar monthly.
- The connected Stripe account already contains **monthly** $150 and $189
  recurring prices. Those prices have `interval=month` and **must not** be
  reused as four-week prices. Create separate approved `week/4` prices after
  tax and consumer disclosures are confirmed.
- A 28-day plan normally bills **13 times per 364 days**. Clearly explain this
  annualized difference to families in the signed membership agreement.
- Existing written commitments, agreed discounts, multiple-student pricing,
  special packages and billing transition dates take precedence. Do not create
  or change an individual subscription based solely on their portal profile.
- Stripe price/product objects are not yet created: first confirm whether the
  studio collects sales tax, VAT or GST, the correct product tax treatment and
  whether prices should be tax-inclusive or exclusive.

## Before any live billing — required order

1. Confirm the legality and wording of the 28-day transition, renewal
   authorization, taxes, cancellation terms, card fees and late fees.
   **Do not automatically add** the legacy blanket 3% card fee or $50/5-day
   late fee. Debit/prepaid-card surcharges are restricted by network rules,
   and Maryland law restricts certain consumer late fees.
2. Verify live-site privacy controls: student account migration and backups,
   household-specific credentials, Turnstile, rate limiting, session signing,
   WAF, and logged-in data isolation. No public student account self-signup.
3. In a **Stripe sandbox**, create two four-week prices and test an automatic
   collection subscription with a test customer, consent and simulated card.
   Test recurring invoices at the **correct four-week intervals**, retry
   behavior, saved card changes, duplicate protection, failed payments, and
   paid/unpaid status.
4. Test an **open, finalized** USD test invoice with `hosted_invoice_url`.
   Ensure Pay Now opens only that household's invoice and payment changes
   reflect in the portal; test both success and failure.
5. Test account isolation and security: a logged-in family cannot view
   another family's invoice, card, video, Stripe customer or hosted URL.
   Verify responses are non-cacheable and not indexed.
6. Confirm cancellation restrictions and billing portal configuration.
   Stripe's billing portal **must not** let customers change tuition, remove
   agreed contractual restrictions, or cancel without review.
7. After written approval, create the live Stripe tuition products/prices,
   assign an authorized household Stripe customer, obtain explicit
   recurring-charge consent and store an approved payment method. Do **not**
   create a second subscription if a family already has one elsewhere.
   Verify the amount, discount, timing and first billing date with the family.
8. Verify test checkout, Stripe notifications/receipts, webhook event handling,
   invoice paid/unpaid reconciliation, refund flow and failed collection
   recovery before enabling any live charge. Keep the live tuition path
   disabled throughout this pilot.
9. Only after signoff: deliberately change
   `TUITION_BILLING_RELEASED=true` in a reviewed deployment **and**
   `STUDENT_PORTAL_PAYMENTS_ENABLED=true` in Cloudflare. Never change one
   flag to bypass the other. Enable family access **only** after verified
   customer mapping and authorized live subscription setup.

## Verification without charges

- Run `npm run test:tuition` (pure, local tests; no Stripe API calls).
- Run `npm run check` and `npm run build`.
- Confirm the Stripe live account has **no new tuition subscriptions** while
  staging. Stripe billing portal configuration creation is noncharging.
- The existing $29 trial and event checkout/webhook handlers are untouched.

Docs:
- https://docs.stripe.com/api/prices/create
- https://docs.stripe.com/api/invoices/object
- https://docs.stripe.com/customer-management
- https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=gcl&section=14-1315

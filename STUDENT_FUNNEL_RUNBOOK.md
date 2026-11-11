# Burning Tree Student Funnel — staff handoff and launch safety

This document describes the existing website and Airtable workflows. It is not a membership agreement and does not authorize a charge.

## 1. Website inquiry (no payment)
- Standard and class-help forms submit to `/verify-turnstile`; Turnstile validation and a successful Airtable Leads write are required before the browser shows success.
- Lead CRM: **Leads** in **Lead CRM**, with `Stage = New`. The website records the contact details, program/source where available, and first-touch attribution.
- The owner receives an SMS notification if Twilio is configured. A *transactional receipt email* is attempted only when a valid contact email and the existing Resend key are available. The `Welcome Email Sent` checkbox is set only when Resend accepts the email, not when mail is guaranteed to reach the inbox.
- After a successful submission, the page offers the optional $29 registration and first-class guide. Completing the inquiry itself does not schedule a class, charge money, or enroll a member.
- SMS marketing requires explicit SMS consent; never interpret a phone number or general inquiry as SMS consent.

## 2. $29 trial registration and payment
- The `/29-trial/` flow collects one student at a time, validates eligibility, records a preferred **request** for a first-class time, and offers the existing payment methods.
- Do not interpret a preferred class as a confirmed reservation. Coach David confirms it after payment verification.
- Card / Apple Pay: only a verified Stripe live session and signed webhook can mark the $29 trial paid. Manual Cash App and Zelle transfers require staff verification; selecting a payment method does **not** make the trial paid.
- Existing checkout code, 3% tuition policy, and live payment settings must not be altered as part of a funnel copy change.
- The paid-trial email links to the goals questionnaire and first-class guide. A $29 trial is never counted as full-time enrollment.

## 3. Confirm the first class (staff step)
- Check the lead's payment status, program, and requested class in Lead CRM. Contact the family to confirm an actual class slot.
- If using SMS, honor the stored SMS consent/opt-out values and the distinction between service messages and marketing.
- Record the actual attended date in **Leads → First Class Attended Date** only after the student has attended. Do not use a scheduled appointment or a no-show as attendance.
- In **Trial Conversion Pipeline**, use one row per real trial prospect (CRM Lead Record ID), log the first and second trial outcomes, and assign the next personal follow-up.

## 4. From trial to paid member (staff step)
- Discuss ongoing class placement and the current contract after the two introductory classes. Do not imply that a trial automatically converts to a membership.
- Verify that a membership agreement has actually been accepted and the membership payment has actually been received before setting **Full-Time Enrollment Confirmed** and **Full-Time Enrollment Date** in Leads.
- Update the **Student Tuition Roster** only with verified recurring tuition and payment evidence. Do not invent attendance, charge history or verified tuition from lead stages like `Signed` alone.
- Family/student portal access is provisioned separately and privately after the owner portal is verified; public trial checkout is not a student portal account.

## 5. Release / QA checklist
- Run `node --test tests/student-funnel-handoff.test.mjs`, `npm run check` and `npm run build`; the GitHub PR also triggers these checks.
- Check the browser: submit a test inquiry and confirm it is saved in Airtable; verify the no-charge success prompt; verify the first-class guide link.
- Check Resend's acceptance or rejection and confirm the CRM Welcome Email Sent field reflects acceptance; do not mark it sent on failure.
- Run the $29 registration and checkout tests in approved test configuration without a real charge. Check Zelle / Cash App *pending* behavior and Stripe webhook reconciliation.
- Confirm a coach can track **scheduled → attended → signed membership** without converting unpaid trials into paid members.
- Keep `STUDENT_PORTAL_PAYMENTS_ENABLED=false` and the code-side tuition release lock off until the separate tuition rollout is approved and tested.

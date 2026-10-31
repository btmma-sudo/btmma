# Digital contract signing — staging configuration

This branch adds a mobile-friendly, unlisted /contracts/ landing page without changing the $29 enrollment route or other existing pages. It does NOT accept signatures or collect personal information. Do not advertise/print the QR until signing provider links are configured, tested, and the site changes are deployed.

## Required configuration before launch
1. Confirm legally reviewed, current contract versions for: Main Parent/Monthly, Six-Month, Eighteen-Month. Do not rewrite pricing, cancellation, notice, or early-exit provisions in the website page; exact terms must be in the complete signable documents.
2. Maryland self-defense/health-club agreement requirements need an appropriate Notice of Consumer Rights, registration and bond status disclosures, and applicable cancellation rights. The electronic signing consent must be conspicuous and separate. Have a Maryland attorney or the Maryland AG Health Club Unit verify the currently approved form and correct notice, particularly because earlier drafts removed some of those disclosures. See https://oag.maryland.gov/i-need-to/Pages/health-clubs.aspx and https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcl&section=21-104.
3. Use a dedicated electronic-signature provider with audit log and tamper-evident completed PDF (e.g., Jotform Sign or DocuSign). Configure signer role for parent/legal guardian or adult member, separate optional electronic-record consent, timestamps, required initials/checkboxes and completed-PDF delivery to both signer and verified Burning Tree recipient email. Configure owner co-signature if the finalized contract requires it.
4. Only after signed documents work end-to-end, set HTTPS signing URLs in the deployment environment:
   - PUBLIC_CONTRACT_MAIN_SIGN_URL
   - PUBLIC_CONTRACT_SIX_MONTH_SIGN_URL
   - PUBLIC_CONTRACT_EIGHTEEN_MONTH_SIGN_URL
5. Do not put credit card numbers or CVV into signed agreements, email, browser local storage, GitHub, or Airtable; use the existing Stripe Checkout setup separately.
6. Store executed documents and audit logs privately, with least-privilege access and a retention policy; do not expose them in website public assets or public Airtable links. Link CRM data to submission/status without exposing signed contracts to public users.
7. Test one signing flow on a phone, receive both PDF emails, verify filled contract/initials, test all 3 plan links, verify failure and resubmission flows, and only then merge and deploy. After deployed, the single QR target is https://burningtreemma.com/contracts/ .

## Notes
The page intentionally shows an unavailable status if any provider URL is not configured. No payment or signature is taken by this Astro route. Email delivery and audit trail must be configured and proven within the signing provider. This staging branch leaves main site navigation untouched until launch readiness.

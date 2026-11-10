// A second, code-reviewed safety lock, independent of Cloudflare runtime settings.
// Keep OFF until portal authentication, individual subscription consent, tax and
// fee review, Stripe test-mode billing, and household-isolation checks all pass.
// This does not create any subscription or initiate a charge.
export const TUITION_BILLING_RELEASED = false;

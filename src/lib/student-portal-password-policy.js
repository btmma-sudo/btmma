// Cloudflare workerd currently rejects PBKDF2 deriveBits above 100,000
// iterations with NotSupportedError. Keep ALL account creation, login,
// staff provisioning and password-reset paths on the same exact cost.
//
// In Worker-based auth, a higher cost requires a separate supported KDF
// service and an explicitly versioned/migrated password scheme; do not
// quietly increase this value while Workers enforce the 100,000 ceiling.
// Use long unique passwords, rate limiting and Turnstile in addition.
export const PORTAL_PASSWORD_PBKDF2_ITERATIONS=100_000;

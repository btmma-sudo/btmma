// Verify that the Turnstile token belongs to the actual student-login form.
// The backend's siteverify success response must match both the hostname and
// explicit action. Never accept a token copied from an unrelated public form.
export const PORTAL_TURNSTILE_ACTION = "student_portal_login";

export function validPortalChallenge(result, requestUrl) {
  if (!result || result.success !== true || result.action !== PORTAL_TURNSTILE_ACTION)
    return false;
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" &&
      url.hostname === "burningtreemma.com" &&
      result.hostname === url.hostname;
  } catch {
    return false;
  }
}

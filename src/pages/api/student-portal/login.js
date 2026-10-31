import { getPortalEnv, checkPassword, createSessionCookie, secureHeaders, validSameOrigin } from "../../../lib/student-portal-auth.js";
export const prerender = false;
function redirect(url, cookie) {
  const headers = secureHeaders({ Location: url });
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(null, { status: 303, headers });
}
export async function POST({request, locals}) {
  const env = getPortalEnv(locals);
  if (!env || !env.TURNSTILE_SECRET_KEY) return new Response("Student login is not configured.", {status:503, headers:secureHeaders()});
  if (!validSameOrigin(request)) return new Response("Invalid request.", {status:403, headers:secureHeaders()});
  if (Number(request.headers.get("content-length") || 0) > 5000)
    return new Response("Request too large.", {status:413, headers:secureHeaders()});
  let form;
  try { form = await request.formData(); } catch { return redirect("/student-portal/?error=invalid"); }
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const token = String(form.get("cf-turnstile-response") || "");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12 || password.length > 200 || token.length < 5 || token.length > 2500)
    return redirect("/student-portal/?error=invalid");
  try {
    const body = new FormData();
    body.set("secret", env.TURNSTILE_SECRET_KEY);
    body.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) body.set("remoteip", ip);
    const verified = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {method:"POST", body});
    const verifyData = verified.ok ? await verified.json() : null;
    if (!verifyData?.success) return redirect("/student-portal/?error=security");
  } catch { return redirect("/student-portal/?error=security"); }
  const db = env.LIVE_TRIAL_DB;
  try {
    const account = await db.prepare(
      "SELECT id, email, password_salt, password_hash, failed_attempts, locked_until, session_version FROM portal_accounts WHERE email=? AND active=1"
    ).bind(email).first();
    // Do not disclose whether the email exists. Require Turnstile and lock failed accounts.
    if (!account || account.locked_until > Math.floor(Date.now()/1000))
      return redirect("/student-portal/?error=invalid");
    const valid = await checkPassword(password, account.password_salt, account.password_hash);
    if (!valid) {
      const next = Math.max(0, account.failed_attempts) + 1;
      await db.prepare("UPDATE portal_accounts SET failed_attempts=?, locked_until=? WHERE id=?")
        .bind(next >= 7 ? 0 : next, next >= 7 ? Math.floor(Date.now()/1000) + 900 : 0, account.id).run();
      return redirect("/student-portal/?error=invalid");
    }
    await db.prepare("UPDATE portal_accounts SET failed_attempts=0, locked_until=0 WHERE id=?").bind(account.id).run();
    return redirect("/student-portal/", await createSessionCookie(env, account));
  } catch {
    return new Response("Student login is temporarily unavailable.", {status:503, headers:secureHeaders()});
  }
}

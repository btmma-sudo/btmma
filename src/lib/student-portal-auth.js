// Isolated student-portal authentication. Never use shared passwords.
const enc = new TextEncoder();
const hex = bytes => [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
const unhex = value => new Uint8Array((value.match(/.{2}/g) || []).map(x => parseInt(x, 16)));
const base64url = value => btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromBase64url = value => atob(value.replace(/-/g, "+").replace(/_/g, "/"));
const cookieName = "btmma_student_session";
const maxAge = 12 * 60 * 60;

export function getPortalEnv(locals) {
  const env = locals?.runtime?.env ?? {};
  // Fail closed until launch is explicitly approved in Cloudflare.
  if (env.STUDENT_PORTAL_ENABLED !== "true") return null;
  if (!env.LIVE_TRIAL_DB || typeof env.STUDENT_PORTAL_SESSION_SECRET !== "string" ||
    env.STUDENT_PORTAL_SESSION_SECRET.length < 32) return null;
  return env;
}
async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign", "verify"]);
  return { key, signature: hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)))) };
}
export async function checkPassword(password, salt, expected) {
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: unhex(salt), iterations: 210000, hash: "SHA-256"
  }, key, 256));
  const target = unhex(expected);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= derived[i] ^ target[i];
  return diff === 0;
}
export async function createSessionCookie(env, account) {
  const payload = base64url(JSON.stringify({ id: account.id, v: account.session_version, exp: Math.floor(Date.now()/1000) + maxAge }));
  const {signature} = await hmac(env.STUDENT_PORTAL_SESSION_SECRET, payload);
  return cookieName + "=" + payload + "." + signature + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; Secure; SameSite=Lax";
}
export function clearSessionCookie() {
  return cookieName + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}
export async function getPortalAccount(request, env) {
  if (!env) return null;
  const all = request.headers.get("cookie") || "";
  const raw = all.split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  if (!raw || raw.length > 800) return null;
  const [payload, sig, extra] = raw.split(".");
  if (extra || !/^[A-Za-z0-9_-]{1,400}$/.test(payload || "") || !/^[a-f0-9]{64}$/.test(sig || "")) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(env.STUDENT_PORTAL_SESSION_SECRET), {name:"HMAC", hash:"SHA-256"}, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, unhex(sig), enc.encode(payload));
  if (!valid) return null;
  let data;
  try { data = JSON.parse(fromBase64url(payload)); } catch { return null; }
  if (typeof data?.id !== "string" || !/^[a-f0-9-]{36}$/.test(data.id) ||
      !Number.isInteger(data.exp) || data.exp <= Date.now()/1000 ||
      !Number.isInteger(data.v)) return null;
  const account = await env.LIVE_TRIAL_DB.prepare(
    "SELECT id, display_name, email, session_version, stripe_customer_id FROM portal_accounts WHERE id=? AND active=1"
  ).bind(data.id).first();
  return account && account.session_version === data.v ? account : null;
}
export function secureHeaders(headers = {}) {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    ...headers
  };
}
export function validSameOrigin(request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

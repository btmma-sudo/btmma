import { getPortalEnv, getPortalAccount, secureHeaders, validSameOrigin } from "./student-portal-auth.js";

export const PROGRAMS = Object.freeze([
  "American Kenpo Karate", "Muay Thai", "Wing Chun",
  "Leadership Training", "Women's Self-Defense / Sanuces"
]);
export const RANKS = Object.freeze([
  "All Levels", "Beginner", "White Belt", "Yellow Belt", "Orange Belt",
  "Purple Belt", "Blue Belt", "Green Belt", "Brown Belt", "Black Belt"
]);
const map = {
  "American Kenpo Karate": "kenpo",
  "Muay Thai": "muay",
  "Wing Chun": "wing",
  "Leadership Training": "leadership",
  "Women's Self-Defense / Sanuces": "sanuces"
};
export const sqlProgram = `(
  (l.program='American Kenpo Karate' AND instr(lower(s.program),'kenpo')>0) OR
  (l.program='Muay Thai' AND instr(lower(s.program),'muay')>0) OR
  (l.program='Wing Chun' AND instr(lower(s.program),'wing')>0) OR
  (l.program='Leadership Training' AND instr(lower(s.program),'leadership')>0) OR
  (l.program='Women''s Self-Defense / Sanuces' AND (
    instr(lower(s.program),'sanuces')>0 OR instr(lower(s.program),'self-defense')>0 OR instr(lower(s.program),'self defense')>0
  ))
)`;
export const sqlRank = "(l.belt_level='All Levels' OR lower(trim(s.belt_rank))=lower(trim(l.belt_level)))";

// Report only which credential is missing or malformed. Never expose the
// token itself, its length, or any other secret in the instructor UI.
export function videoConnectionStatus(env) {
  const accountId=String(env?.STUDENT_PORTAL_STREAM_ACCOUNT_ID || "").trim();
  const token=env?.STUDENT_PORTAL_STREAM_API_TOKEN;
  if (!accountId) return {ready:false,code:"account_id_missing",
    message:"The Cloudflare Stream Account ID is missing from the burningtreemma Worker's production settings."};
  if (!/^[a-f0-9]{32}$/i.test(accountId)) return {ready:false,code:"account_id_invalid",
    message:"The Cloudflare Stream Account ID must be exactly 32 hexadecimal characters. Check the value saved in Worker production settings."};
  if (typeof token!=="string" || !token.trim()) return {ready:false,code:"token_missing",
    message:"The Cloudflare Stream API token is missing. Add STUDENT_PORTAL_STREAM_API_TOKEN as an encrypted Secret in Worker production settings."};
  if (/^re_/i.test(token.trim())) return {ready:false,code:"wrong_token_provider",
    message:"A Resend email API key appears to have been entered instead of a Cloudflare Stream token. Replace only the Stream secret with the Cloudflare token."};
  if (token.length<=16) return {ready:false,code:"token_invalid",
    message:"The Cloudflare Stream API token appears incomplete. Recheck the encrypted Stream secret in Worker production settings."};
  return {ready:true,code:"configured",message:"Stream configuration is present. Uploading a private test video will verify the connection."};
}
export function videoConfig(env) {
  return videoConnectionStatus(env).ready;
}
export async function authorizedInstructor(request, locals) {
  const env = getPortalEnv(locals);
  if (!env) return null;
  const account = await getPortalAccount(request, env);
  if (!account) return null;
  try {
    const staff = await env.LIVE_TRIAL_DB.prepare(
      "SELECT can_upload,can_publish FROM portal_staff WHERE account_id=? AND active=1"
    ).bind(account.id).first();
    if (!staff || !(staff.can_upload === 1 || staff.can_publish === 1)) return null;
    return { env, account, staff };
  } catch { return null; }
}
export function privateJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: secureHeaders({ "Content-Type": "application/json; charset=utf-8" })
  });
}
export function refuse(message, status = 400) { return privateJson({ ok:false, error: message },status); }
export function canPost(request) {
  return validSameOrigin(request) && Number(request.headers.get("content-length") || 0) <= 16000 &&
    (request.headers.get("content-type") || "").toLowerCase().startsWith("application/json");
}
export async function readJson(request) {
  try {
    const data = await request.text();
    if (data.length > 12000) return null;
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
export function validLesson(data) {
  const title = String(data?.title ?? "").trim();
  const description = String(data?.description ?? "").trim();
  const program = String(data?.program ?? "");
  const rank = String(data?.belt_level ?? "");
  if (!title || title.length > 120 || description.length > 1000 ||
    !PROGRAMS.includes(program) || !RANKS.includes(rank)) return null;
  return { title, description, program, rank };
}
export async function streamDetails(env, uid) {
  if (!videoConfig(env) || !/^[a-f0-9]{32}$/i.test(String(uid))) return null;
  const url = "https://api.cloudflare.com/client/v4/accounts/" +
    env.STUDENT_PORTAL_STREAM_ACCOUNT_ID + "/stream/" + uid;
  try {
    const resp = await fetch(url, {
      headers: { "Authorization": "Bearer " + env.STUDENT_PORTAL_STREAM_API_TOKEN }
    });
    if (!resp.ok) return null;
    const body = await resp.json();
    if (!body?.success || body.result?.uid !== uid) return null;
    return body.result;
  } catch { return null; }
}
export function uploadUrlValid(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "upload.videodelivery.net" &&
      url.username === "" && url.password === "" && url.port === "";
  } catch { return false; }
}

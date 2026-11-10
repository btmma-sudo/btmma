// One-time first-owner enrollment. The only destination is the verified
// address selected by Burning Tree's owner. Neither the token nor password
// is written to GitHub, analytics, or a Worker environment variable.
import {PORTAL_PASSWORD_PBKDF2_ITERATIONS} from "./student-portal-password-policy.js";

export const OWNER_EMAIL = "hybridkenpokarate@gmail.com";
export const OWNER_DISPLAY_NAME = "Coach David";
export const OWNER_INVITE_ACTION = "student_portal_owner_invite";
export const OWNER_COOLDOWN_SECONDS = 10 * 60;
export const OWNER_INVITE_LIFETIME_SECONDS = 15 * 60;
const encoder = new TextEncoder();
export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("");

export const ownerInviteSchema = "CREATE TABLE IF NOT EXISTS portal_owner_setup_challenges (" +
  "id TEXT PRIMARY KEY CHECK(id='first-owner'), " +
  "token_hash TEXT NOT NULL, requested_at INTEGER NOT NULL, " +
  "expires_at INTEGER NOT NULL, used_at INTEGER)";

export async function digestToken(token) {
  const raw=await crypto.subtle.digest("SHA-256",encoder.encode(token));
  return hex(new Uint8Array(raw));
}
export function generateOwnerToken() {
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}
export function validOwnerToken(token) {
  return typeof token==="string" && /^[a-f0-9]{64}$/.test(token);
}
export function validOwnerPassword(password) {
  return typeof password==="string" && password.length>=12 && password.length<=200 &&
    !/[\u0000-\u001f\u007f]/.test(password);
}
export async function passwordDigest(password) {
  const salt=new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const digest=await crypto.subtle.deriveBits(
    {name:"PBKDF2",salt,iterations:PORTAL_PASSWORD_PBKDF2_ITERATIONS,hash:"SHA-256"},key,256
  );
  return {salt:hex(salt),hash:hex(new Uint8Array(digest))};
}
// Never guess whether a prior owner is authorized. A first-owner grant can
// only happen if no other member has publishing privileges or this email.
export async function firstOwnerNotYetPresent(db) {
  const exists=await db.prepare(
    "SELECT 1 AS found FROM portal_accounts WHERE email=? LIMIT 1"
  ).bind(OWNER_EMAIL).first();
  if (exists) return false;
  const staff=await db.prepare(
    "SELECT 1 AS found FROM portal_staff WHERE active=1 AND can_publish=1 LIMIT 1"
  ).first();
  return !staff;
}

// Isolated private lesson scheduling; no $29 trial or seminar billing changes.
import {getPortalEnv,getPortalAccount,secureHeaders,validSameOrigin} from "./student-portal-auth.js";

export const PROGRAMS = ["American Kenpo Karate","Muay Thai","Wing Chun","Self-Defense","Leadership","Not sure yet"];
export const DURATIONS = [30,60];
export const STEP_MINUTES = 30;
const ZONE = "America/New_York";
const et = new Intl.DateTimeFormat("en-US", {timeZone:ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
export const json = (value,status=200) => new Response(JSON.stringify(value),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
export const adminJson = (value,status=200) => new Response(JSON.stringify(value),{
  status,headers:secureHeaders({"Content-Type":"application/json; charset=utf-8"})
});
export const envForBookings = locals => {
  const env=locals?.runtime?.env||{};
  return env.LIVE_TRIAL_DB && env.PRIVATE_LESSON_BOOKING_ENABLED==="true" ? env : null;
};
function easternParts(date) {
  const parts = Object.fromEntries(et.formatToParts(date).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return {date:parts.year+"-"+parts.month+"-"+parts.day,time:parts.hour+":"+parts.minute};
}
export function validDate(s) {
  if(typeof s!=="string"|| !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s+"T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===s;
}
export function validTime(s) {return typeof s==="string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);}
export function minutes(time) {return Number(time.slice(0,2))*60+Number(time.slice(3,5));}
export function clock(mins) {return String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");}
// Monday-Thursday from 8 PM, Friday from 7 PM, Saturdays after 11:30 AM
// (first 30-minute interval begins at noon). No Sundays.
export function startOfPrivateHours(day) {
  if(!validDate(day)) return null;
  const dayOfWeek=new Date(day+"T12:00:00Z").getUTCDay();
  if(dayOfWeek>=1 && dayOfWeek<=4) return 20*60;
  if(dayOfWeek===5) return 19*60;
  if(dayOfWeek===6) return 12*60;
  return null;
}
export function allowedHalfHour(day,time) {
  const minimum=startOfPrivateHours(day);
  return minimum!==null && validTime(time) &&
    minutes(time)>=minimum && minutes(time)%STEP_MINUTES===0 &&
    minutes(time)+STEP_MINUTES<=24*60;
}
export function futureDateTime(day,time) {
  if(!validDate(day)||!validTime(time)) return false;
  const earliest=easternParts(new Date(Date.now()+24*3600000));
  const latest=easternParts(new Date(Date.now()+90*24*3600000));
  return day+"T"+time >= earliest.date+"T"+earliest.time &&
    day <= latest.date;
}
export function safeString(v,max) {return typeof v==="string" ? v.trim().slice(0,max+1) : "";}
export function validName(v) {return v.length>=2 && v.length<=120 && !/[<>\r\n]/.test(v);}
export async function adminAccess(request,locals) {
  const env=getPortalEnv(locals);
  if(!env) return null;
  const account=await getPortalAccount(request,env);
  if(!account) return null;
  try {
    const staff=await env.LIVE_TRIAL_DB.prepare(
      "SELECT can_manage_private_lessons FROM portal_staff WHERE account_id=? AND active=1"
    ).bind(account.id).first();
    return staff?.can_manage_private_lessons===1 ? {env,account} : null;
  } catch{return null;}
}
export async function verifyTurnstile(env,request,token) {
  if(!env.TURNSTILE_SECRET_KEY||typeof token!=="string"||token.length<5||token.length>2500) return false;
  try {
    const form=new FormData();
    form.set("secret",env.TURNSTILE_SECRET_KEY);
    form.set("response",token);
    const ip=request.headers.get("cf-connecting-ip");
    if(ip) form.set("remoteip",ip);
    const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
    const verdict=response.ok?await response.json():null;
    return verdict?.success===true;
  } catch {return false;}
}
export function canWrite(request,size=9000) {
  return validSameOrigin(request) &&
    (request.headers.get("content-type")||"").toLowerCase().startsWith("application/json") &&
    Number(request.headers.get("content-length")||0)<=size;
}
export async function readBody(request) {
  try {const raw=await request.text();return raw.length<=9000?JSON.parse(raw):null;} catch{return null;}
}
export function escapeHtml(v) {return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

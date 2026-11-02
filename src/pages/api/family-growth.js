// Family referrals and former-student reactivation requests.
// This endpoint records inquiries only. It never confirms enrollment, grants free tuition,
// changes pricing, enrolls a student, or sends automated marketing messages.
export const prerender = false;
const REFERRAL_TABLE = "tbl9t1m6orAYElMlT";
const RETURN_TABLE = "tbl87H7amhse4Yw4s";
const PROGRAMS = new Set(["American Kenpo Karate", "Muay Thai", "Wing Chun", "Women's Self-Defense / Sanuces", "Not sure yet"]);
const answer = (value, status=200) => new Response(JSON.stringify(value), {
  status, headers: {"content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff"}
});
const trim = (v,n=120) => typeof v==="string" ? v.trim().slice(0,n+1) : "";
const mail = v => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) && v.length<=254;
const phone = v => /^[+()\-. \d]{7,30}$/.test(v);
const safe = v => typeof v==="string" && !/[<>\r\n]/.test(v);
const escapeHtml = v => String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
async function verify(env, request, token) {
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {method:"POST",body});
  return res.ok && (await res.json()).success===true;
}
async function writeAirtable(env, table, fields) {
  const url = "https://api.airtable.com/v0/"+encodeURIComponent(env.AIRTABLE_BASE_ID)+"/"+table;
  const res = await fetch(url, {
    method:"POST",
    headers:{"Authorization":"Bearer "+env.AIRTABLE_API_TOKEN,"content-type":"application/json"},
    body:JSON.stringify({records:[{fields}]})
  });
  if (!res.ok) throw new Error("Airtable save "+res.status);
  const data = await res.json();
  const id = data?.records?.[0]?.id;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id||"")) throw new Error("Airtable missing saved ID");
  return id;
}
async function notifyStaff(env, info, id) {
  if (!env.RESEND_API_KEY) return;
  const to = String(env.FAMILY_GROWTH_NOTIFICATION_EMAIL||env.CORPORATE_WORKSHOP_NOTIFICATION_EMAIL||"hybridkenpokarare@gmail.com").trim();
  if (!mail(to)) return;
  const details = Object.entries(info).map(([k,v])=>"<p><strong>"+escapeHtml(k)+":</strong> "+escapeHtml(v)+"</p>").join("");
  try {
    const r=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"content-type":"application/json"},
      body:JSON.stringify({
        from:"Burning Tree MMA <noreply@burningtreemma.com>",
        to:[to],
        subject:"Family Growth Inquiry — "+info["Request type"],
        html:"<h2>Burning Tree Family Growth Inquiry</h2>"+details+
          "<p>Airtable record: "+escapeHtml(id)+". Please personally review eligibility, consent, and prior records before taking any next action. No payment or reward was processed.</p>"
      })
    });
    if (!r.ok) console.warn("Family growth notification email was not accepted");
  } catch (e) {
    console.error("Family growth notification unavailable",String(e).slice(0,80));
  }
}
export async function POST({request,locals}) {
  const origin = request.headers.get("origin");
  if (origin && origin!==new URL(request.url).origin) return answer({error:"Please use the Burning Tree website form."},403);
  if (request.headers.get("content-type")?.split(";")[0]!=="application/json") return answer({error:"Invalid form format."},415);
  if (Number(request.headers.get("content-length")||0)>7000) return answer({error:"Your message is too long."},413);
  const env=locals?.runtime?.env??{};
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_TOKEN || !env.TURNSTILE_SECRET_KEY)
    return answer({error:"Online requests are temporarily unavailable. Please call or text 410-218-0894."},503);
  let payload;
  try { payload=await request.json(); } catch { return answer({error:"Please check your information and try again."},400); }
  if (!payload || typeof payload!=="object" || Array.isArray(payload)) return answer({error:"Invalid form."},400);
  const kind=payload.kind, token=trim(payload.turnstileToken,2500);
  if (!["referral","returning"].includes(kind) || payload.contactPermission!==true ||
      payload.adultContact!==true || token.length<5 || token.length>2500)
    return answer({error:"Please confirm you are an adult or guardian, request contact, and complete the security check."},400);
  const student=trim(payload.studentName,120), contact=trim(payload.contactName,120);
  const email=trim(payload.email,254).toLowerCase(), number=trim(payload.phone,30);
  const program=trim(payload.program,80), notes=trim(payload.notes,450);
  if (student.length<2 || contact.length<2 || !safe(student) || !safe(contact) ||
      !mail(email) || !phone(number) || !PROGRAMS.has(program) ||
      notes.length>450 || /[<>\r]/.test(notes))
    return answer({error:"Please check your name, contact information, and class interest."},400);
  const referrer=trim(payload.referrerName,120), referrerStudent=trim(payload.referrerStudent,120);
  const timing=trim(payload.returnTiming,70);
  if (kind==="referral" && (referrer.length<2 || !safe(referrer) || !safe(referrerStudent)))
    return answer({error:"Please enter the name of the Burning Tree family who referred you."},400);
  if (kind==="returning" && (!["As soon as possible","Within a month","Exploring options"].includes(timing)))
    return answer({error:"Please select when you are considering returning."},400);
  try {
    if (!(await verify(env,request,token))) return answer({error:"Security verification expired. Please complete it again."},403);
  } catch { return answer({error:"Security check is temporarily unavailable."},503); }
  const reference="BT-"+(kind==="referral"?"REF":"BACK")+"-"+crypto.randomUUID().slice(0,12).toUpperCase();
  const today=new Date().toISOString().slice(0,10);
  const summary="Website request "+reference+
    "\nContact / guardian: "+contact+
    "\nProgram interest: "+program+
    "\nNotes: "+(notes||"None")+
    "\nSubmitted by adult/guardian with permission to reply. This is not general SMS marketing consent."+
    "\nEnrollment, returning-student eligibility, and rewards remain unverified.";
  let fields, table, notification;
  if (kind==="referral") {
    table=REFERRAL_TABLE;
    fields={
      "Referring Family":referrer,
      "Referrer Student":referrerStudent,
      "Referred Prospect / Student":student,
      "Referral Received":today,
      "Referral Status":"Unverified",
      "Reward Tracking":"Not Due",
      "Unique Referral ID":reference,
      "Referred Contact Email":email,
      "Referred Contact Phone":number,
      "Contact Permission":true,
      "Verification / Notes":summary
    };
    notification={"Request type":"New family referral",Referrer:referrer,"Referred student":student,"Contact / guardian":contact,Email:email,Phone:number,Program:program,Notes:notes||"None"};
  } else {
    table=RETURN_TABLE;
    fields={
      "Student / Former Student":student,
      "Relationship":"Unverified",
      "Risk / Opportunity":"Reactivation",
      "Reactivation Offer":"None",
      "Outreach Result":"Not Reviewed",
      "Program Interest":program,
      "Requested Return Timing":timing,
      "Contact Email":email,
      "Contact Phone":number,
      "Contact Permission":true,
      "Notes":summary
    };
    notification={"Request type":"Former-student return request",Student:student,"Contact / guardian":contact,Email:email,Phone:number,Program:program,Timing:timing,Notes:notes||"None"};
  }
  try {
    const recordId=await writeAirtable(env,table,fields);
    await notifyStaff(env,notification,recordId);
    return answer({ok:true,reference,message:kind==="referral"?
      "Thank you! We received your referral inquiry. A coach will follow up. Any referral reward is subject to verification.":
      "Thank you! We received your welcome-back request. A coach will verify eligibility and contact you about returning."});
  } catch(e) {
    console.error("Family growth inquiry save error",String(e).slice(0,100));
    return answer({error:"We could not save your request. Please call or text 410-218-0894; do not submit repeatedly."},503);
  }
}

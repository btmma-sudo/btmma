// Studio rental inquiries are separate from classes, birthday parties, and $29 enrollments.
// A request is never a confirmed booking and no charges are initiated here.
export const prerender = false;
const CRM_TABLE = "tblZCXEuRKXiPZlc7";
const EVENT_TYPES = ["Martial arts training","Fitness or wellness class","Seminar or workshop","Community meeting","Private group event","Other"];
const DURATIONS = ["1 hour","2 hours","3 hours","4 hours","6 hours","8 hours","Custom / discuss"];
const TIME_OPTIONS = ["Morning","Afternoon","Evening","Flexible"];
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const clean=(v,max=120)=>typeof v==="string"?v.trim().slice(0,max+1):"";
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
function validDate(value){
  if(!value)return true; // Flexible dates are allowed.
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+"T12:00:00Z");
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value&&
    +date>Date.now()-86400000&&+date<Date.now()+366*86400000;
}
async function verifyTurnstile(env,request,token){
  const form=new FormData();
  form.set("secret",env.TURNSTILE_SECRET_KEY);
  form.set("response",token);
  const ip=request.headers.get("cf-connecting-ip");
  if(ip)form.set("remoteip",ip);
  const result=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
  if(!result.ok)return false;
  return (await result.json()).success===true;
}
async function saveCrmLead(env,info,reference){
  if(!env.AIRTABLE_BASE_ID||!env.AIRTABLE_API_TOKEN)return false;
  const summary=[
    "Rental reference: "+reference,
    "Rental purpose: "+info.purpose,
    "Group size: "+info.guests,
    "Requested date: "+(info.date||"Flexible"),
    "Time preference: "+info.time,
    "Rental duration: "+info.duration,
    "Organization: "+(info.organization||"Not specified"),
    "Details: "+(info.notes||"None")
  ].join("\n");
  const fields={
    "Name":info.name,
    "Email":info.email,
    "Phone Number":info.phone,
    "Lead Source":"Studio Rental Website",
    "Stage":"Studio Rental Inquiry",
    "Program Of Interest":"Studio Space Rental",
    "Additional Notes":summary
  };
  const r=await fetch("https://api.airtable.com/v0/"+encodeURIComponent(env.AIRTABLE_BASE_ID)+"/"+CRM_TABLE,{
    method:"POST",
    headers:{"Authorization":"Bearer "+env.AIRTABLE_API_TOKEN,"Content-Type":"application/json"},
    body:JSON.stringify({records:[{fields}],typecast:true})
  });
  if(!r.ok)throw Error("CRM sync "+r.status);
  const payload=await r.json();
  return !!payload.records?.[0]?.id;
}
async function notifyStaff(env,info,reference,crmSynced){
  if(!env.RESEND_API_KEY)return false;
  const recipient=String(env.STUDIO_RENTAL_NOTIFICATION_EMAIL||env.CORPORATE_WORKSHOP_NOTIFICATION_EMAIL||"hybridkenpokarare@gmail.com").trim();
  if(!emailPattern.test(recipient))return false;
  const details={Reference:reference,"Contact name":info.name,"Organization":info.organization||"Not supplied",Email:info.email,Phone:info.phone,"Event type":info.purpose,"Group size":info.guests,"Preferred date":info.date||"Flexible","Preferred time":info.time,"Duration":info.duration,Notes:info.notes||"None","Airtable CRM":crmSynced?"Synced":"Review required"};
  const body="<h2>New Studio Rental Inquiry</h2>"+Object.entries(details).map(([k,v])=>"<p><strong>"+esc(k)+":</strong> "+esc(v)+"</p>").join("")+"<p>This is an inquiry only. Confirm pricing, availability, capacity, and rental terms before accepting or charging a deposit.</p>";
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({from:"Burning Tree MMA <noreply@burningtreemma.com>",to:[recipient],subject:"New Studio Rental Request — "+reference,html:body})});
  return r.ok;
}
export async function POST({request,locals}){
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return json({error:"Submit the form from the Burning Tree website."},403);
  if(request.headers.get("content-type")?.split(";")[0]!=="application/json")return json({error:"Invalid request format."},415);
  if(Number(request.headers.get("content-length")||0)>9000)return json({error:"Your message is too long."},413);
  const env=locals?.runtime?.env??{};
  if(!env.LIVE_TRIAL_DB||!env.TURNSTILE_SECRET_KEY)return json({error:"Online rental inquiries are temporarily unavailable. Please call or text 410-218-0894."},503);
  let data;
  try{data=await request.json();}catch{return json({error:"Please review your information and try again."},400);}
  if(!data||typeof data!=="object"||Array.isArray(data))return json({error:"Invalid form."},400);
  const info={
    name:clean(data.name,120),email:clean(data.email,254).toLowerCase(),
    phone:clean(data.phone,30),organization:clean(data.organization,120),
    purpose:clean(data.purpose,80),guests:Number(data.guests),
    date:clean(data.date,10),time:clean(data.time,40),
    duration:clean(data.duration,40),notes:clean(data.notes,1000)
  };
  const token=clean(data.turnstileToken,2500);
  if(info.name.length<2||info.name.length>120||!emailPattern.test(info.email)||info.email.length>254||
     !/^[+()\-. \d]{7,30}$/.test(info.phone)||info.organization.length>120||
     !EVENT_TYPES.includes(info.purpose)||!Number.isInteger(info.guests)||info.guests<1||info.guests>999||
     !validDate(info.date)||!TIME_OPTIONS.includes(info.time)||!DURATIONS.includes(info.duration)||
     info.notes.length>1000||Object.values(info).some(v=>typeof v==="string"&&/[<>\r]/.test(v))||
     token.length<5||token.length>2500){
    return json({error:"Please check your contact information, group size, rental details, and security check."},400);
  }
  try{
    if(!(await verifyTurnstile(env,request,token)))return json({error:"Security verification expired. Please complete it again."},403);
  }catch{return json({error:"Security verification could not be completed. Try again."},503);}
  const reference="STUDIO-"+crypto.randomUUID().slice(0,8).toUpperCase();
  try{
    const db=env.LIVE_TRIAL_DB;
    await db.prepare("CREATE TABLE IF NOT EXISTS studio_rental_inquiries (reference TEXT PRIMARY KEY, contact_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, organization TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL, group_size INTEGER NOT NULL, preferred_date TEXT NOT NULL DEFAULT '', preferred_time TEXT NOT NULL, duration TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new_inquiry', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
    await db.prepare("INSERT INTO studio_rental_inquiries (reference,contact_name,email,phone,organization,purpose,group_size,preferred_date,preferred_time,duration,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(reference,info.name,info.email,info.phone,info.organization,info.purpose,info.guests,info.date,info.time,info.duration,info.notes).run();
  }catch(e){
    console.error("Studio rental save failed",String(e).slice(0,120));
    return json({error:"We could not save your inquiry. Please call or text 410-218-0894."},503);
  }
  let crmSynced=false;
  try{crmSynced=await saveCrmLead(env,info,reference);}catch(e){console.error("Studio rental CRM sync failed",String(e).slice(0,100));}
  try{
    const emailed=await notifyStaff(env,info,reference,crmSynced);
    if(!emailed)console.warn("Studio rental notification email was not sent; inquiry retained in database.");
  }catch(e){console.error("Studio rental notification failed",String(e).slice(0,100));}
  return json({ok:true,reference,message:"Your studio rental inquiry was received. We'll contact you to review pricing and availability. No booking or payment has been made."});
}

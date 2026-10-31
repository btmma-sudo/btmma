// Independent corporate workshop inquiry flow. No payment is collected here.
// The $29 trial, seminar and private-coaching checkouts are untouched.
export const prerender = false;
const TABLE = "tblFwkhYKzcc6cFoi";
const CRM_LEADS_TABLE = "tblZCXEuRKXiPZlc7";
const PACKAGES = Object.freeze({
  essential: {name:"Essential Workshop",price:350,limit:10},
  empowerment:{name:"Corporate Empowerment",price:500,limit:20},
  ultimate:{name:"Ultimate Safety Experience",price:750,limit:25}
});
const TYPES=["Corporate office","Healthcare","School or college","Church or community group","Apartment or residential","Other"];
const LOCATIONS=["At our organization","Burning Tree studio","Discuss options"];
const PAYMENTS=["Request invoice","Card / Apple Pay","Cash App","Zelle","Discuss with Coach David"];
const respond=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const clean=(v,n=120)=>typeof v==="string"?v.trim().slice(0,n+1):"";
const safeText=v=>!/[<>\r\n]/.test(v);
const escape=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
async function saveToCrmLeads(env,fields,corporateId){
  // The main Airtable Leads table is also the CRM. Keep a distinct corporate
  // stage so the existing Stage=New $29 trial email drips do not trigger.
  const summary=[
    "Organization: "+fields["Organization"],
    "Workshop: "+fields["Package"]+" — $"+fields["Price"],
    "Participants: "+fields["Participants"],
    "Preferred date: "+(fields["Preferred Date"]||"Not specified"),
    "Preferred time: "+(fields["Preferred Time"]||"Not specified"),
    "Location: "+fields["Location"],
    "Organization type: "+fields["Organization Type"],
    "Payment preference: "+fields["Payment Preference"],
    "Notes: "+(fields["Goals and Notes"]||"Not provided"),
    "Corporate request reference: "+corporateId
  ].join("\n");
  const crmFields={
    "Name":fields["Contact Name"],
    "Phone Number":fields["Contact Phone"],
    "Email":fields["Contact Email"],
    "Lead Source":"Corporate Workshop Website",
    "Stage":"Corporate Inquiry",
    "Program Of Interest":"Corporate & Group Self-Defense",
    "Additional Notes":summary
  };
  const response=await fetch("https://api.airtable.com/v0/"+
    encodeURIComponent(env.AIRTABLE_BASE_ID)+"/"+CRM_LEADS_TABLE,{
    method:"POST",
    headers:{Authorization:"Bearer "+env.AIRTABLE_API_TOKEN,"Content-Type":"application/json"},
    body:JSON.stringify({records:[{fields:crmFields}],typecast:true})
  });
  if(!response.ok)throw new Error("CRM sync failed "+response.status);
  const data=await response.json(),id=data.records?.[0]?.id;
  if(!/^rec[A-Za-z0-9]+$/.test(id||""))throw new Error("CRM did not return a record ID");
  return id;
}
async function notify(env,fields,id){
  if(!env.RESEND_API_KEY)return;
  const recipient=String(env.CORPORATE_WORKSHOP_NOTIFICATION_EMAIL||"hybridkenpokarare@gmail.com").trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))return;
  const line=Object.entries(fields).map(([k,v])=>"<p><strong>"+escape(k)+":</strong> "+escape(v)+"</p>").join("");
  try{await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({from:"Burning Tree MMA <noreply@burningtreemma.com>",to:[recipient],subject:"New Corporate Workshop Request: "+fields["Organization"],html:"<h2>New Corporate Workshop Inquiry</h2>"+line+"<p>Airtable reference: "+escape(id)+"</p><p>Please contact the organizer to confirm availability and payment before booking.</p>"})});}catch{}
}
export async function POST({request,locals}){
  const env=locals?.runtime?.env??{};
  const origin=new URL(request.url).origin;
  if(request.headers.get("origin")&&request.headers.get("origin")!==origin)return respond({error:"Submit your request from the Burning Tree website."},403);
  if(request.headers.get("content-type")?.split(";")[0]!=="application/json")return respond({error:"Invalid request format."},415);
  if(Number(request.headers.get("content-length")||0)>7000)return respond({error:"Form is too long."},413);
  if(!env.AIRTABLE_BASE_ID||!env.AIRTABLE_API_TOKEN||!env.TURNSTILE_SECRET_KEY)return respond({error:"Workshop requests are temporarily unavailable. Please call or text 410-218-0894."},503);
  let data;
  try{data=await request.json();}catch{return respond({error:"Please check the form and try again."},400);}
  const pack=Object.hasOwn(PACKAGES,data?.package)?PACKAGES[data.package]:null;
  const organization=clean(data?.organization,120),contact=clean(data?.contact,120),email=clean(data?.email,254).toLowerCase(),phone=clean(data?.phone,30);
  const participants=Number(data?.participants),date=clean(data?.preferredDate,10),time=clean(data?.preferredTime,100),notes=clean(data?.notes,700);
  const type=clean(data?.organizationType,60),location=clean(data?.location,50),payment=clean(data?.paymentPreference,60),token=clean(data?.turnstileToken,2500);
  if(!pack||organization.length<2||organization.length>120||contact.length<2||contact.length>120||
     !safeText(organization)||!safeText(contact)||!safeText(time)||!safeText(type)||!safeText(location)||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||
     !/^[+()\-. \d]{7,30}$/.test(phone)||!Number.isInteger(participants)||participants<1||participants>pack.limit||
     !TYPES.includes(type)||!LOCATIONS.includes(location)||!PAYMENTS.includes(payment)||
     (date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))||(date&&!Number.isFinite(Date.parse(date+"T12:00:00Z")))||
     notes.length>700||/[<>]/.test(notes)||token.length<5||token.length>2500)
    return respond({error:"Check the package, organization, contact, group size, and security check."},400);
  try{
    const form=new FormData();form.set("secret",env.TURNSTILE_SECRET_KEY);form.set("response",token);
    const ip=request.headers.get("cf-connecting-ip");if(ip)form.set("remoteip",ip);
    const check=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
    const proof=check.ok?await check.json():null;
    if(!proof?.success)return respond({error:"Security verification expired. Complete the check again."},403);
  }catch{return respond({error:"Security verification is unavailable. Try again shortly."},503);}
  const fields={
    "Request":"Corporate "+pack.name+" — "+organization,
    "Organization":organization,"Contact Name":contact,"Contact Email":email,"Contact Phone":phone,
    "Package":pack.name,"Price":pack.price,"Participants":participants,
    "Preferred Time":time,"Location":location,"Organization Type":type,
    "Goals and Notes":notes,"Payment Preference":payment,"Status":"New inquiry",
    "Received At":new Date().toISOString()
  };
  if(date)fields["Preferred Date"]=date;
  try{
    const res=await fetch("https://api.airtable.com/v0/"+encodeURIComponent(env.AIRTABLE_BASE_ID)+"/"+TABLE,{
      method:"POST",headers:{Authorization:"Bearer "+env.AIRTABLE_API_TOKEN,"Content-Type":"application/json"},
      body:JSON.stringify({records:[{fields}]})
    });
    if(!res.ok)throw new Error("Save failed "+res.status);
    const payload=await res.json(),id=payload.records?.[0]?.id;
    if(!/^rec[A-Za-z0-9]+$/.test(id||""))throw new Error("No record returned");
    let crmId=null;
    try{
      crmId=await saveToCrmLeads(env,fields,id);
    }catch(crmError){
      // The corporate request is already safely saved; do not make the
      // customer resubmit and create a duplicate when the CRM is unavailable.
      console.error("Corporate CRM lead sync failed",String(crmError).slice(0,120));
    }
    await notify(env,{...fields,"CRM Lead Sync":crmId?"Saved in Leads ("+crmId+")":"Needs manual CRM reconciliation"},id);
    return respond({ok:true,reference:id,message:"Your workshop request was received. We will contact you to confirm the date, location, and payment arrangement. No payment has been taken."});
  }catch(e){
    console.error("Corporate workshop inquiry save failed",String(e).slice(0,100));
    return respond({error:"We could not save your workshop request. No payment was taken. Please call or text 410-218-0894."},503);
  }
}

// Birthday party inquiry -> staff approval -> secure Stripe deposit.
// Does not share registration records or pricing logic with $29 trials.
export const prerender = false;
const SOURCE = "btmma_birthday_deposit_v1";
const TABLE = "tblZCXEuRKXiPZlc7";
const KEY = "STRIPE_LIVE_WEBHOOK_SECRET";
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const choices = ["Martial Arts Games", "Team Challenges", "Custom Celebration"];
const times = ["12:00","13:30","14:30","16:00"];
// Source of truth: two-hour party, $350 up to 15 children, $10 per extra child.
const PARTY_DURATION_MINUTES = 120;
const partyPriceCents = guests =>
  Number.isInteger(guests) && guests >= 1 && guests <= 75
    ? 35000 + Math.max(0, guests - 15) * 1000
    : null;
const json = (v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const html = (v,s=200)=>new Response(v,{status:s,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"}});
const esc = s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const str=(v,max=120)=>typeof v==="string"?v.trim().slice(0,max+1):"";
const hex=b=>Array.from(b,n=>n.toString(16).padStart(2,"0")).join("");
async function signature(env,msg){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env[KEY]),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("birthday-party-v1|"+msg))));
}
async function verified(env,msg,provided){
  if(!/^[0-9a-f]{64}$/.test(provided||""))return false;
  const expected=await signature(env,msg);
  let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^provided.charCodeAt(i);
  return diff===0;
}
function envReady(env){return !!(env.LIVE_TRIAL_DB && typeof env[KEY]==="string" && env[KEY].length>24);}

const PARTY_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS birthday_party_requests (id TEXT PRIMARY KEY, contact_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, birthday_name TEXT NOT NULL, age_group TEXT NOT NULL, guests INTEGER NOT NULL CHECK(guests BETWEEN 1 AND 75), package_interest TEXT NOT NULL, preferred_date TEXT NOT NULL, preferred_time TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','checkout_open','deposit_paid','cancelled')), total_cents INTEGER, deposit_cents INTEGER, stripe_session_id TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, approved_at TEXT, paid_at TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_birthday_party_requests_date ON birthday_party_requests(preferred_date,preferred_time,status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_birthday_party_confirmed_slot ON birthday_party_requests(preferred_date,preferred_time) WHERE status IN ('approved','checkout_open','deposit_paid')"
];
// Standalone idempotent first-use initialization. Never alter the $29 tables.
async function ensurePartySchema(db) {
  await db.prepare(PARTY_SCHEMA[0]).run();
  await db.prepare(PARTY_SCHEMA[1]).run();
  await db.prepare(PARTY_SCHEMA[2]).run();
}

function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return false;
  const d=new Date(value+"T12:00:00Z");
  return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===value&&
    +d>Date.now()+24*3600*1000&&+d<Date.now()+185*86400*1000&&[0,6].includes(d.getUTCDay());
}
function fromRequest(request){
  const origin=request.headers.get("origin");
  return (!origin||origin===new URL(request.url).origin)&&request.headers.get("content-type")?.split(";")[0]==="application/json"&&Number(request.headers.get("content-length")||0)<8000;
}
async function send(env,to,subject,body){
  if(!env.RESEND_API_KEY||!emailRe.test(to))return false;
  try{
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({from:"Burning Tree MMA <noreply@burningtreemma.com>",to:[to],subject,html:body})});
    return r.ok;
  }catch{return false;}
}
async function saveLead(env,row){
  if(!env.AIRTABLE_API_TOKEN||!env.AIRTABLE_BASE_ID)return false;
  try{
    const fields={"Name":row.contact_name,"Email":row.email,"Phone Number":row.phone,
      "Lead Source":"Birthday Party Website","Stage":"Birthday Party Inquiry","Program Of Interest":"Birthday Parties",
      "Additional Notes":"Party ref: "+row.id+"\nChild: "+row.birthday_name+"\nGuests: "+row.guests+
        "\nFormat: "+row.package_interest+"\nDate requested: "+row.preferred_date+" at "+row.preferred_time+
        "\nAge: "+row.age_group+"\nDuration: 2 hours\nTotal: $"+(partyPriceCents(row.guests)/100).toFixed(2)+"\nNotes: "+row.notes};
    const r=await fetch("https://api.airtable.com/v0/"+encodeURIComponent(env.AIRTABLE_BASE_ID)+"/"+TABLE,{method:"POST",
      headers:{"Authorization":"Bearer "+env.AIRTABLE_API_TOKEN,"Content-Type":"application/json"},
      body:JSON.stringify({records:[{fields}],typecast:true})});
    return r.ok;
  }catch{return false;}
}
async function verifyCaptcha(env,request,token){
  if(!env.TURNSTILE_SECRET_KEY||!str(token,2500))return false;
  const form=new FormData();form.set("secret",env.TURNSTILE_SECRET_KEY);form.set("response",token);
  const ip=request.headers.get("cf-connecting-ip");if(ip)form.set("remoteip",ip);
  const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
  return r.ok&&(await r.json()).success===true;
}
function dollars(value){
  if(typeof value!=="string"||!/^\d{1,5}(\.\d{1,2})?$/.test(value))return null;
  const [a,b=""]=value.split(".");const cents=Number(a)*100+Number(b.padEnd(2,"0"));
  return Number.isSafeInteger(cents)?cents:null;
}
function staffPage(row,auth,error=""){
 const title="Burning Tree — Review birthday party";
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title>'+
 '<style>body{font:16px system-ui;background:#121212;color:#fff;max-width:640px;padding:26px;margin:auto;line-height:1.5}h1{color:#ff6868}label{display:block;margin:14px 0}input{display:block;padding:12px;width:100%;box-sizing:border-box;background:#252525;color:white;border:1px solid #aaa}button{background:#c82027;border:0;color:#fff;font-size:16px;font-weight:bold;padding:14px 22px;cursor:pointer}aside{color:#ffd3d3}</style></head><body><h1>Birthday Party Request</h1>'+
 '<p><b>Contact:</b> '+esc(row.contact_name)+' — '+esc(row.email)+'<br><b>Phone:</b> '+esc(row.phone)+
 '<br><b>Birthday child:</b> '+esc(row.birthday_name)+' ('+esc(row.age_group)+')<br><b>Guests:</b> '+row.guests+
 '<br><b>Activities:</b> '+esc(row.package_interest)+'<br><b>Duration:</b> 2 hours<br><b>Calculated total:</b> 
 '<br><b>Notes:</b> '+esc(row.notes||"None")+'<br><b>Current status:</b> '+esc(row.status)+'</p>'+
 (error?'<aside>'+esc(error)+'</aside>':"")+
 (row.status==="requested" ? '<h2>Confirm this date and deposit</h2><p>Only confirm after checking the studio calendar and group capacity. The 2-hour party price is calculated automatically ($350 for up to 15 children, then $10 for each extra child). Enter the deposit to collect after approval.</p>'+
 '<form method="post" action="/api/birthday-party"><input type="hidden" name="action" value="approve"><input type="hidden" name="ref" value="'+esc(row.id)+'"><input type="hidden" name="auth" value="'+esc(auth)+'">'+
 '<p><b>Fixed party total:</b> $ '+(partyPriceCents(row.guests)/100).toFixed(2)+'</p>'+
 '<label>Deposit to collect now (USD)<input name="deposit" type="text" inputmode="decimal" placeholder="e.g. 50.00" required></label>'+
 '<button type="submit">Confirm Date & Send Secure Deposit Link</button></form>' :
 '<p>The request is no longer awaiting approval. Contact the family directly for changes.</p>')+
 '<p><a href="https://burningtreemma.com/birthday-parties/" style="color:#ffcaca">View birthday party page</a></p></body></html>';
}
export async function GET({request,locals}){
 const env=locals?.runtime?.env??{};
 if(!envReady(env))return json({error:"Birthday party reservations are being configured."},503);
 try { await ensurePartySchema(env.LIVE_TRIAL_DB); } catch { return json({error:"Birthday party database is not ready."},503); }
 const u=new URL(request.url),action=u.searchParams.get("action"),ref=u.searchParams.get("ref")||"",auth=u.searchParams.get("auth")||"";
 if(action==="readiness")return json({ready:!!(env.RESEND_API_KEY&&env.TURNSTILE_SECRET_KEY&&env.AIRTABLE_API_TOKEN&&env.AIRTABLE_BASE_ID),notificationsConfigured:!!env.RESEND_API_KEY,crmConfigured:!!(env.AIRTABLE_API_TOKEN&&env.AIRTABLE_BASE_ID)});
 if(action==="review"){
   if(!/^[a-f0-9-]{36}$/i.test(ref)||!await verified(env,"staff|"+ref,auth))return html("<h1>Invalid or expired approval link.</h1>",403);
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE id=?").bind(ref).first();
   return row?html(staffPage(row,auth)):html("<h1>Request not found.</h1>",404);
 }
 if(action==="booking"){
   if(!/^[a-f0-9-]{36}$/i.test(ref))return json({error:"Invalid booking reference."},400);
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE id=?").bind(ref).first();
   if(!row||!row.deposit_cents||!await verified(env,"pay|"+ref+"|"+row.deposit_cents,auth))return json({error:"No confirmed deposit offer was found."},403);
   return json({ok:true,ref,status:row.status,date:row.preferred_date,time:row.preferred_time,
      package:row.package_interest,durationMinutes:PARTY_DURATION_MINUTES,depositCents:row.deposit_cents,totalCents:row.total_cents});
 }
 if(action==="status"){
   const sessionId=u.searchParams.get("session_id")||"";
   if(!/^cs_live_[\w]{10,180}$/.test(sessionId)||!/^(sk|rk)_live_/.test(env.STRIPE_LIVE_SECRET_KEY||""))return json({confirmed:false,error:"Invalid payment reference."},400);
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE stripe_session_id=?").bind(sessionId).first();
   if(!row)return json({confirmed:false,error:"Unknown birthday deposit."},404);
   const check=await fetch("https://api.stripe.com/v1/checkout/sessions/"+encodeURIComponent(sessionId),{headers:{Authorization:"Bearer "+env.STRIPE_LIVE_SECRET_KEY}});
   if(!check.ok)return json({confirmed:false,error:"Could not verify payment."},503);
   const session=await check.json();
   if(session.livemode!==true||session.mode!=="payment"||session.client_reference_id!==row.id||
      session.metadata?.btmma_source!==SOURCE||session.currency!=="usd"||session.amount_total!==row.deposit_cents)
     return json({confirmed:false,error:"Payment verification failed."},409);
   if(session.payment_status!=="paid")return json({confirmed:false,pending:true});
   await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET status='deposit_paid',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('approved','checkout_open','deposit_paid')").bind(row.id).run();
   return json({confirmed:true,date:row.preferred_date,time:row.preferred_time,depositCents:row.deposit_cents});
 }
 return json({error:"Unknown request."},404);
}
export async function POST({request,locals}){
 const env=locals?.runtime?.env??{};
 if(!envReady(env))return json({error:"Birthday party reservations are being configured. Text 410-218-0894."},503);
 try { await ensurePartySchema(env.LIVE_TRIAL_DB); } catch { return json({error:"Birthday party database is not ready. Text 410-218-0894."},503); }
 const contentType=request.headers.get("content-type")?.split(";")[0];
 const origin=request.headers.get("origin");
 if(origin&&origin!==new URL(request.url).origin)return json({error:"Use the Burning Tree website to submit."},403);
 if(Number(request.headers.get("content-length")||0)>8000)return json({error:"Request is too long."},413);
 if(contentType==="application/x-www-form-urlencoded"){
   const data=await request.formData();
   if(data.get("action")!=="approve")return html("<h1>Unsupported action.</h1>",400);
   const ref=str(data.get("ref"),40),auth=str(data.get("auth"),100);
   if(!/^[a-f0-9-]{36}$/i.test(ref)||!await verified(env,"staff|"+ref,auth))return html("<h1>Invalid approval link.</h1>",403);
   const deposit=dollars(str(data.get("deposit"),20));
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE id=?").bind(ref).first();
   if(!row)return html("<h1>Request not found.</h1>",404);
   const total=partyPriceCents(row.guests);
   if(!total||!deposit||deposit>total)return html(staffPage(row,auth,"Please enter a positive deposit amount, not more than the calculated party total."),400);
   if(!validDate(row.preferred_date))return html(staffPage(row,auth,"This date is now outside the booking window."),409);
   try{
     const result=await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET status='approved',total_cents=?,deposit_cents=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='requested'").bind(total,deposit,ref).run();
     if(result.meta?.changes!==1)return html("<h1>Already reviewed.</h1>",409);
   }catch{return html(staffPage(row,auth,"Date and time have already been confirmed for another party, or the database is unavailable."),409);}
   const payToken=await signature(env,"pay|"+ref+"|"+deposit);
   const url=new URL("/birthday-parties/",request.url);url.searchParams.set("ref",ref);url.searchParams.set("pay",payToken);
   const sent=await send(env,row.email,"Your Burning Tree birthday party date is confirmed",
     "<h2>Your birthday party date has been approved!</h2><p>Hello "+esc(row.contact_name)+",</p><p>We have confirmed <b>"+esc(row.preferred_date)+
     " at "+esc(row.preferred_time)+" Eastern</b> for your <b>2-hour birthday celebration</b> with "+row.guests+" children.</p><p>Confirmed total: <b>$"+(total/100).toFixed(2)+
     "</b>. Deposit due now: <b>$"+(deposit/100).toFixed(2)+"</b>.</p><p><a href='"+esc(url.href)+
     "'>Pay your deposit securely with Burning Tree MMA</a></p><p>Your reservation is not deposit-paid until secure checkout is completed. Questions? Text 410-218-0894.</p>");
   return html("<!doctype html><html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='font:16px system-ui;background:#181818;color:white;padding:30px'><h1>Date confirmed</h1><p>"+(sent?"A secure deposit link was emailed to the family.":"The date was saved, but the email could not be delivered. Please copy and send this secure link manually:")+"</p><p><a style='color:#ffb5b5;word-break:break-all' href='"+esc(url.href)+"'>"+esc(url.href)+"</a></p><p>Deposit: $"+(deposit/100).toFixed(2)+". Do not share the approval link.</p></body></html>");
 }
 if(contentType!=="application/json")return json({error:"Invalid form submission."},415);
 let data;try{data=await request.json();}catch{return json({error:"Invalid form submission."},400);}
 if(data?.action==="request"&&!env.RESEND_API_KEY)return json({error:"Reservations need email and CRM notifications. Please use the contact form below or text 410-218-0894."},503);
 if(data?.action==="request"){
   const row={id:crypto.randomUUID(),contact_name:str(data.name),email:str(data.email,254).toLowerCase(),phone:str(data.phone,30),
     birthday_name:str(data.childName),age_group:str(data.ageGroup,40),guests:Number(data.guests),
     package_interest:str(data.package,50),preferred_date:str(data.date,10),preferred_time:str(data.time,10),notes:str(data.notes,700)};
   if(row.contact_name.length<2||row.contact_name.length>120||row.birthday_name.length<2||row.birthday_name.length>120||
      !emailRe.test(row.email)||!/^[-+()\d .]{7,30}$/.test(row.phone)||!["4–6","7–9","10–12","13+"].includes(row.age_group)||
      !Number.isInteger(row.guests)||row.guests<1||row.guests>75||!choices.includes(row.package_interest)||
      !validDate(row.preferred_date)||!times.includes(row.preferred_time)||
      (new Date(row.preferred_date+"T12:00:00Z").getUTCDay()===0 && !["14:30","16:00"].includes(row.preferred_time))||row.notes.length>700||
      [row.contact_name,row.birthday_name,row.notes].some(s=>/[<>]/.test(s)))
     return json({error:"Please check the child, contact, party size, Saturday/Sunday date, and time."},400);
   try{if(!await verifyCaptcha(env,request,data.turnstileToken))return json({error:"Security check expired. Please try again."},403);}catch{return json({error:"Security check is unavailable. Please try again."},503);}
   try{
     await env.LIVE_TRIAL_DB.prepare("INSERT INTO birthday_party_requests (id,contact_name,email,phone,birthday_name,age_group,guests,package_interest,preferred_date,preferred_time,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(row.id,row.contact_name,row.email,row.phone,row.birthday_name,row.age_group,row.guests,row.package_interest,row.preferred_date,row.preferred_time,row.notes).run();
   }catch{return json({error:"The request could not be saved. Please text 410-218-0894."},503);}
   const crmSaved=await saveLead(env,row);
   const review=new URL("/api/birthday-party",request.url);
   review.searchParams.set("action","review");review.searchParams.set("ref",row.id);
   review.searchParams.set("auth",await signature(env,"staff|"+row.id));
   const notifyTo=str(env.BIRTHDAY_PARTY_NOTIFICATION_EMAIL||"hybridkenpokarare@gmail.com",254);
   await send(env,notifyTo,"New birthday party request — "+row.preferred_date,
      "<h2>New Burning Tree Birthday Party Inquiry</h2><p>Contact: "+esc(row.contact_name)+
      "<br>Email: "+esc(row.email)+"<br>Phone: "+esc(row.phone)+"<br>Birthday child: "+esc(row.birthday_name)+
      "<br>Age group: "+esc(row.age_group)+"<br>Guest count: "+row.guests+"<br>Duration: 2 hours<br>Party total: $"+(partyPriceCents(row.guests)/100).toFixed(2)+"<br>Party interest: "+esc(row.package_interest)+
      "<br>Requested date: "+esc(row.preferred_date)+" at "+esc(row.preferred_time)+" Eastern"+
      "<br>Notes: "+esc(row.notes)+"<br>Airtable CRM: "+(crmSaved?"Saved":"Needs reconciliation")+"</p>"+
      "<p><a href='"+esc(review.href)+"'>Review date, set package price and deposit, and approve</a></p>"+
      "<p>Do not send this private approval link to the customer.</p>");
   await send(env,row.email,"We received your Burning Tree birthday party request",
     "<h2>Thanks for thinking of Burning Tree!</h2><p>We received your request for "+esc(row.preferred_date)+
     " at "+esc(row.preferred_time)+" Eastern for a 2-hour birthday party. Estimated price for "+row.guests+" children: $"+(partyPriceCents(row.guests)/100).toFixed(2)+". This is a request, not a confirmed reservation. We will check availability and confirm the deposit before providing a secure payment link.</p>"+
     "<p>Questions? Text 410-218-0894.</p>");
   return json({ok:true,reference:row.id,totalCents:partyPriceCents(row.guests),durationMinutes:PARTY_DURATION_MINUTES,message:"Your two-hour birthday party date request was received. We will confirm availability and the deposit before any payment is requested. No payment has been taken."});
 }
 if(data?.action==="checkout"){
   const ref=str(data.ref,40),grant=str(data.pay,100);
   if(!/^[a-f0-9-]{36}$/i.test(ref)||!/^(sk|rk)_live_/.test(env.STRIPE_LIVE_SECRET_KEY||"")||env.LIVE_CHECKOUT_ENABLED!=="true")
     return json({error:"Secure deposits are being configured."},503);
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE id=?").bind(ref).first();
   if(!row||!row.deposit_cents||!await verified(env,"pay|"+ref+"|"+row.deposit_cents,grant)||!["approved","checkout_open"].includes(row.status))
     return json({error:"This date must be approved before paying a deposit."},403);
   if(row.stripe_session_id){
     const check=await fetch("https://api.stripe.com/v1/checkout/sessions/"+encodeURIComponent(row.stripe_session_id),{headers:{Authorization:"Bearer "+env.STRIPE_LIVE_SECRET_KEY}});
     if(!check.ok)return json({error:"Could not verify the existing deposit checkout."},503);
     const old=await check.json();
     if(old.status==="open"&&old.payment_status!=="paid"&&old.metadata?.btmma_source===SOURCE&&old.amount_total===row.deposit_cents&&old.client_reference_id===ref&&old.url)
       return json({url:old.url});
     return json({error:"This deposit checkout needs review. Please contact the studio."},409);
   }
   const claim=await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET status='checkout_open',updated_at=CURRENT_TIMESTAMP WHERE id=? AND stripe_session_id IS NULL AND (status='approved' OR (status='checkout_open' AND updated_at<datetime('now','-90 seconds')))").bind(ref).run();
   if(claim.meta?.changes!==1)return json({error:"Another checkout is being prepared. Please try again shortly."},409);
   const origin=new URL(request.url).origin;
   const params=new URLSearchParams({
     mode:"payment","allowed_payment_method_types[0]":"card",
     "line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":String(row.deposit_cents),
     "line_items[0][price_data][product_data][name]":"Burning Tree Birthday Party — Confirmed Deposit",
     "line_items[0][quantity]":"1",customer_email:row.email,client_reference_id:ref,
     "metadata[btmma_source]":SOURCE,"metadata[booking_id]":ref,
     "payment_intent_data[metadata][btmma_source]":SOURCE,
     success_url:origin+"/birthday-parties/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
     cancel_url:origin+"/birthday-parties/?ref="+encodeURIComponent(ref)+"&pay="+encodeURIComponent(grant)+"&checkout=cancelled"
   });
   let result,session;
   try{
     result=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:"Bearer "+env.STRIPE_LIVE_SECRET_KEY,"Content-Type":"application/x-www-form-urlencoded"},body:params});
     if(!result.ok)throw Error("Stripe checkout error "+result.status);
     session=await result.json();
   }catch{
     await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET status='approved' WHERE id=? AND status='checkout_open' AND stripe_session_id IS NULL").bind(ref).run();
     return json({error:"Checkout is temporarily unavailable. No payment was taken."},503);
   }
   if(session.livemode!==true||!/^cs_live_/.test(session.id||"")||!/^https:\/\/checkout\.stripe\.com\//.test(session.url||""))
     return json({error:"The secure checkout could not be verified."},503);
   const saved=await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET stripe_session_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='checkout_open' AND stripe_session_id IS NULL").bind(session.id,ref).run();
   if(saved.meta?.changes!==1)return json({error:"Payment requires studio review. Please do not retry."},409);
   return json({url:session.url});
 }
 return json({error:"Unknown action."},400);
}
+(partyPriceCents(row.guests)/100).toFixed(2)+'<br><b>Requested:</b> '+esc(row.preferred_date)+' at '+esc(row.preferred_time)+' Eastern'+
 '<br><b>Notes:</b> '+esc(row.notes||"None")+'<br><b>Current status:</b> '+esc(row.status)+'</p>'+
 (error?'<aside>'+esc(error)+'</aside>':"")+
 (row.status==="requested" ? '<h2>Confirm this date, price and deposit</h2><p>Only confirm after you have checked the studio calendar. The family will receive a payment link AFTER approval. Enter the final agreed package price and deposit amount.</p>'+
 '<form method="post" action="/api/birthday-party"><input type="hidden" name="action" value="approve"><input type="hidden" name="ref" value="'+esc(row.id)+'"><input type="hidden" name="auth" value="'+esc(auth)+'">'+
 '<label>Total price (USD)<input name="total" type="text" inputmode="decimal" placeholder="e.g. 250.00" required></label>'+
 '<label>Deposit to collect now (USD)<input name="deposit" type="text" inputmode="decimal" placeholder="e.g. 50.00" required></label>'+
 '<button type="submit">Confirm Date & Send Secure Deposit Link</button></form>' :
 '<p>The request is no longer awaiting approval. Contact the family directly for changes.</p>')+
 '<p><a href="https://burningtreemma.com/birthday-parties/" style="color:#ffcaca">View birthday party page</a></p></body></html>';
}
export async function GET({request,locals}){
 const env=locals?.runtime?.env??{};
 if(!envReady(env))return json({error:"Birthday party reservations are being configured."},503);
 try { await ensurePartySchema(env.LIVE_TRIAL_DB); } catch { return json({error:"Birthday party database is not ready."},503); }
 const u=new URL(request.url),action=u.searchParams.get("action"),ref=u.searchParams.get("ref")||"",auth=u.searchParams.get("auth")||"";
 if(action==="readiness")return json({ready:!!(env.RESEND_API_KEY&&env.TURNSTILE_SECRET_KEY&&env.AIRTABLE_API_TOKEN&&env.AIRTABLE_BASE_ID),notificationsConfigured:!!env.RESEND_API_KEY,crmConfigured:!!(env.AIRTABLE_API_TOKEN&&env.AIRTABLE_BASE_ID)});
 if(action==="review"){
   if(!/^[a-f0-9-]{36}$/i.test(ref)||!await verified(env,"staff|"+ref,auth))return html("<h1>Invalid or expired approval link.</h1>",403);
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE id=?").bind(ref).first();
   return row?html(staffPage(row,auth)):html("<h1>Request not found.</h1>",404);
 }
 if(action==="booking"){
   if(!/^[a-f0-9-]{36}$/i.test(ref))return json({error:"Invalid booking reference."},400);
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE id=?").bind(ref).first();
   if(!row||!row.deposit_cents||!await verified(env,"pay|"+ref+"|"+row.deposit_cents,auth))return json({error:"No confirmed deposit offer was found."},403);
   return json({ok:true,ref,status:row.status,date:row.preferred_date,time:row.preferred_time,
      package:row.package_interest,depositCents:row.deposit_cents,totalCents:row.total_cents});
 }
 if(action==="status"){
   const sessionId=u.searchParams.get("session_id")||"";
   if(!/^cs_live_[\w]{10,180}$/.test(sessionId)||!/^(sk|rk)_live_/.test(env.STRIPE_LIVE_SECRET_KEY||""))return json({confirmed:false,error:"Invalid payment reference."},400);
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE stripe_session_id=?").bind(sessionId).first();
   if(!row)return json({confirmed:false,error:"Unknown birthday deposit."},404);
   const check=await fetch("https://api.stripe.com/v1/checkout/sessions/"+encodeURIComponent(sessionId),{headers:{Authorization:"Bearer "+env.STRIPE_LIVE_SECRET_KEY}});
   if(!check.ok)return json({confirmed:false,error:"Could not verify payment."},503);
   const session=await check.json();
   if(session.livemode!==true||session.mode!=="payment"||session.client_reference_id!==row.id||
      session.metadata?.btmma_source!==SOURCE||session.currency!=="usd"||session.amount_total!==row.deposit_cents)
     return json({confirmed:false,error:"Payment verification failed."},409);
   if(session.payment_status!=="paid")return json({confirmed:false,pending:true});
   await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET status='deposit_paid',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('approved','checkout_open','deposit_paid')").bind(row.id).run();
   return json({confirmed:true,date:row.preferred_date,time:row.preferred_time,depositCents:row.deposit_cents});
 }
 return json({error:"Unknown request."},404);
}
export async function POST({request,locals}){
 const env=locals?.runtime?.env??{};
 if(!envReady(env))return json({error:"Birthday party reservations are being configured. Text 410-218-0894."},503);
 try { await ensurePartySchema(env.LIVE_TRIAL_DB); } catch { return json({error:"Birthday party database is not ready. Text 410-218-0894."},503); }
 const contentType=request.headers.get("content-type")?.split(";")[0];
 const origin=request.headers.get("origin");
 if(origin&&origin!==new URL(request.url).origin)return json({error:"Use the Burning Tree website to submit."},403);
 if(Number(request.headers.get("content-length")||0)>8000)return json({error:"Request is too long."},413);
 if(contentType==="application/x-www-form-urlencoded"){
   const data=await request.formData();
   if(data.get("action")!=="approve")return html("<h1>Unsupported action.</h1>",400);
   const ref=str(data.get("ref"),40),auth=str(data.get("auth"),100);
   if(!/^[a-f0-9-]{36}$/i.test(ref)||!await verified(env,"staff|"+ref,auth))return html("<h1>Invalid approval link.</h1>",403);
   const total=dollars(str(data.get("total"),20)),deposit=dollars(str(data.get("deposit"),20));
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE id=?").bind(ref).first();
   if(!row)return html("<h1>Request not found.</h1>",404);
   if(!total||!deposit||deposit>total||total>2000000)return html(staffPage(row,auth,"Please enter valid positive prices. Deposit cannot exceed the total."),400);
   if(!validDate(row.preferred_date))return html(staffPage(row,auth,"This date is now outside the booking window."),409);
   try{
     const result=await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET status='approved',total_cents=?,deposit_cents=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='requested'").bind(total,deposit,ref).run();
     if(result.meta?.changes!==1)return html("<h1>Already reviewed.</h1>",409);
   }catch{return html(staffPage(row,auth,"Date and time have already been confirmed for another party, or the database is unavailable."),409);}
   const payToken=await signature(env,"pay|"+ref+"|"+deposit);
   const url=new URL("/birthday-parties/",request.url);url.searchParams.set("ref",ref);url.searchParams.set("pay",payToken);
   const sent=await send(env,row.email,"Your Burning Tree birthday party date is confirmed",
     "<h2>Your birthday party date has been approved!</h2><p>Hello "+esc(row.contact_name)+",</p><p>We have confirmed <b>"+esc(row.preferred_date)+
     " at "+esc(row.preferred_time)+" Eastern</b> for your birthday celebration.</p><p>Confirmed total: <b>$"+(total/100).toFixed(2)+
     "</b>. Deposit due now: <b>$"+(deposit/100).toFixed(2)+"</b>.</p><p><a href='"+esc(url.href)+
     "'>Pay your deposit securely with Burning Tree MMA</a></p><p>Your reservation is not deposit-paid until secure checkout is completed. Questions? Text 410-218-0894.</p>");
   return html("<!doctype html><html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='font:16px system-ui;background:#181818;color:white;padding:30px'><h1>Date confirmed</h1><p>"+(sent?"A secure deposit link was emailed to the family.":"The date was saved, but the email could not be delivered. Please copy and send this secure link manually:")+"</p><p><a style='color:#ffb5b5;word-break:break-all' href='"+esc(url.href)+"'>"+esc(url.href)+"</a></p><p>Deposit: $"+(deposit/100).toFixed(2)+". Do not share the approval link.</p></body></html>");
 }
 if(contentType!=="application/json")return json({error:"Invalid form submission."},415);
 let data;try{data=await request.json();}catch{return json({error:"Invalid form submission."},400);}
 if(data?.action==="request"&&!env.RESEND_API_KEY)return json({error:"Reservations need email and CRM notifications. Please use the contact form below or text 410-218-0894."},503);
 if(data?.action==="request"){
   const row={id:crypto.randomUUID(),contact_name:str(data.name),email:str(data.email,254).toLowerCase(),phone:str(data.phone,30),
     birthday_name:str(data.childName),age_group:str(data.ageGroup,40),guests:Number(data.guests),
     package_interest:str(data.package,50),preferred_date:str(data.date,10),preferred_time:str(data.time,10),notes:str(data.notes,700)};
   if(row.contact_name.length<2||row.contact_name.length>120||row.birthday_name.length<2||row.birthday_name.length>120||
      !emailRe.test(row.email)||!/^[-+()\d .]{7,30}$/.test(row.phone)||!["4–6","7–9","10–12","13+"].includes(row.age_group)||
      !Number.isInteger(row.guests)||row.guests<1||row.guests>75||!choices.includes(row.package_interest)||
      !validDate(row.preferred_date)||!times.includes(row.preferred_time)||
      (new Date(row.preferred_date+"T12:00:00Z").getUTCDay()===0 && !["14:30","16:00"].includes(row.preferred_time))||row.notes.length>700||
      [row.contact_name,row.birthday_name,row.notes].some(s=>/[<>]/.test(s)))
     return json({error:"Please check the child, contact, party size, Saturday/Sunday date, and time."},400);
   try{if(!await verifyCaptcha(env,request,data.turnstileToken))return json({error:"Security check expired. Please try again."},403);}catch{return json({error:"Security check is unavailable. Please try again."},503);}
   try{
     await env.LIVE_TRIAL_DB.prepare("INSERT INTO birthday_party_requests (id,contact_name,email,phone,birthday_name,age_group,guests,package_interest,preferred_date,preferred_time,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(row.id,row.contact_name,row.email,row.phone,row.birthday_name,row.age_group,row.guests,row.package_interest,row.preferred_date,row.preferred_time,row.notes).run();
   }catch{return json({error:"The request could not be saved. Please text 410-218-0894."},503);}
   const crmSaved=await saveLead(env,row);
   const review=new URL("/api/birthday-party",request.url);
   review.searchParams.set("action","review");review.searchParams.set("ref",row.id);
   review.searchParams.set("auth",await signature(env,"staff|"+row.id));
   const notifyTo=str(env.BIRTHDAY_PARTY_NOTIFICATION_EMAIL||"hybridkenpokarare@gmail.com",254);
   await send(env,notifyTo,"New birthday party request — "+row.preferred_date,
      "<h2>New Burning Tree Birthday Party Inquiry</h2><p>Contact: "+esc(row.contact_name)+
      "<br>Email: "+esc(row.email)+"<br>Phone: "+esc(row.phone)+"<br>Birthday child: "+esc(row.birthday_name)+
      "<br>Age group: "+esc(row.age_group)+"<br>Guest count: "+row.guests+"<br>Party interest: "+esc(row.package_interest)+
      "<br>Requested date: "+esc(row.preferred_date)+" at "+esc(row.preferred_time)+" Eastern"+
      "<br>Notes: "+esc(row.notes)+"<br>Airtable CRM: "+(crmSaved?"Saved":"Needs reconciliation")+"</p>"+
      "<p><a href='"+esc(review.href)+"'>Review date, set package price and deposit, and approve</a></p>"+
      "<p>Do not send this private approval link to the customer.</p>");
   await send(env,row.email,"We received your Burning Tree birthday party request",
     "<h2>Thanks for thinking of Burning Tree!</h2><p>We received your request for "+esc(row.preferred_date)+
     " at "+esc(row.preferred_time)+" Eastern. This is a request, not a confirmed reservation. We will check availability and confirm your party price and deposit before providing a secure payment link.</p>"+
     "<p>Questions? Text 410-218-0894.</p>");
   return json({ok:true,reference:row.id,message:"Your preferred date request was received. We will confirm availability and pricing before any deposit is requested. No payment has been taken."});
 }
 if(data?.action==="checkout"){
   const ref=str(data.ref,40),grant=str(data.pay,100);
   if(!/^[a-f0-9-]{36}$/i.test(ref)||!/^(sk|rk)_live_/.test(env.STRIPE_LIVE_SECRET_KEY||"")||env.LIVE_CHECKOUT_ENABLED!=="true")
     return json({error:"Secure deposits are being configured."},503);
   const row=await env.LIVE_TRIAL_DB.prepare("SELECT * FROM birthday_party_requests WHERE id=?").bind(ref).first();
   if(!row||!row.deposit_cents||!await verified(env,"pay|"+ref+"|"+row.deposit_cents,grant)||!["approved","checkout_open"].includes(row.status))
     return json({error:"This date must be approved before paying a deposit."},403);
   if(row.stripe_session_id){
     const check=await fetch("https://api.stripe.com/v1/checkout/sessions/"+encodeURIComponent(row.stripe_session_id),{headers:{Authorization:"Bearer "+env.STRIPE_LIVE_SECRET_KEY}});
     if(!check.ok)return json({error:"Could not verify the existing deposit checkout."},503);
     const old=await check.json();
     if(old.status==="open"&&old.payment_status!=="paid"&&old.metadata?.btmma_source===SOURCE&&old.amount_total===row.deposit_cents&&old.client_reference_id===ref&&old.url)
       return json({url:old.url});
     return json({error:"This deposit checkout needs review. Please contact the studio."},409);
   }
   const claim=await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET status='checkout_open',updated_at=CURRENT_TIMESTAMP WHERE id=? AND stripe_session_id IS NULL AND (status='approved' OR (status='checkout_open' AND updated_at<datetime('now','-90 seconds')))").bind(ref).run();
   if(claim.meta?.changes!==1)return json({error:"Another checkout is being prepared. Please try again shortly."},409);
   const origin=new URL(request.url).origin;
   const params=new URLSearchParams({
     mode:"payment","allowed_payment_method_types[0]":"card",
     "line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":String(row.deposit_cents),
     "line_items[0][price_data][product_data][name]":"Burning Tree Birthday Party — Confirmed Deposit",
     "line_items[0][quantity]":"1",customer_email:row.email,client_reference_id:ref,
     "metadata[btmma_source]":SOURCE,"metadata[booking_id]":ref,
     "payment_intent_data[metadata][btmma_source]":SOURCE,
     success_url:origin+"/birthday-parties/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
     cancel_url:origin+"/birthday-parties/?ref="+encodeURIComponent(ref)+"&pay="+encodeURIComponent(grant)+"&checkout=cancelled"
   });
   let result,session;
   try{
     result=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:"Bearer "+env.STRIPE_LIVE_SECRET_KEY,"Content-Type":"application/x-www-form-urlencoded"},body:params});
     if(!result.ok)throw Error("Stripe checkout error "+result.status);
     session=await result.json();
   }catch{
     await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET status='approved' WHERE id=? AND status='checkout_open' AND stripe_session_id IS NULL").bind(ref).run();
     return json({error:"Checkout is temporarily unavailable. No payment was taken."},503);
   }
   if(session.livemode!==true||!/^cs_live_/.test(session.id||"")||!/^https:\/\/checkout\.stripe\.com\//.test(session.url||""))
     return json({error:"The secure checkout could not be verified."},503);
   const saved=await env.LIVE_TRIAL_DB.prepare("UPDATE birthday_party_requests SET stripe_session_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='checkout_open' AND stripe_session_id IS NULL").bind(session.id,ref).run();
   if(saved.meta?.changes!==1)return json({error:"Payment requires studio review. Please do not retry."},409);
   return json({url:session.url});
 }
 return json({error:"Unknown action."},400);
}

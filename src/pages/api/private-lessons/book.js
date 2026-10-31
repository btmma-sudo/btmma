import {
  envForBookings,json,PROGRAMS,futureDateTime,canWrite,readBody,validName,safeString,
  verifyTurnstile,escapeHtml
} from "../../../lib/private-lessons.js";
export const prerender=false;
const validEmail=v=>v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validPhone=v=>v.length>=7&&v.length<=30&&/^[+()\-. \d]+$/.test(v);
async function sendEmail(env,to,subject,html){
  if(!env.RESEND_API_KEY) return false;
  try{
    const r=await fetch("https://api.resend.com/emails",{
      method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({
        from:"Burning Tree MMA <noreply@burningtreemma.com>",
        to:[to],subject,html
      })
    });
    return r.ok;
  }catch{return false;}
}
export async function POST({request,locals}) {
  const env=envForBookings(locals);
  if(!env) return json({ok:false,error:"Private lesson booking is not open yet. Call or text (410) 218-0894."},503);
  if(!canWrite(request)) return json({ok:false,error:"Invalid booking request."},403);
  const body=await readBody(request);
  const slotId=body?.slotId;
  const name=safeString(body?.contactName,120);
  const student=safeString(body?.studentName,120);
  const email=safeString(body?.email,254).toLowerCase();
  const phone=safeString(body?.phone,30);
  const program=body?.program;
  const goals=safeString(body?.goals,500);
  if(typeof slotId!=="string"||!/^[a-f0-9-]{36}$/i.test(slotId)||!validName(name)||!validName(student)||
     !validEmail(email)||!validPhone(phone)||!PROGRAMS.includes(program)||goals.length>500)
    return json({ok:false,error:"Please complete all required information."},400);
  if(!await verifyTurnstile(env,request,body?.turnstileToken))
    return json({ok:false,error:"Security check expired. Complete it again and retry."},403);
  const db=env.LIVE_TRIAL_DB;
  let slot;
  try {
    slot=await db.prepare(
      "SELECT id,local_date AS date,local_time AS time,duration_minutes AS duration FROM private_lesson_slots WHERE id=? AND is_open=1"
    ).bind(slotId).first();
  } catch {return json({ok:false,error:"Booking is temporarily unavailable."},503);}
  if(!slot||!futureDateTime(slot.date,slot.time))
    return json({ok:false,error:"That time is no longer available. Please choose another."},409);
  const id=crypto.randomUUID();
  try{
    // One atomic INSERT ... SELECT backed by a partial unique index.
    // A second concurrent request cannot claim the same active slot.
    const result=await db.prepare(
      `INSERT INTO private_lesson_bookings(id,slot_id,contact_name,student_name,email,phone,program,goals,status)
       SELECT ?,id,?,?,?,?,?,?,'confirmed' FROM private_lesson_slots
       WHERE id=? AND is_open=1 AND NOT EXISTS
         (SELECT 1 FROM private_lesson_bookings WHERE slot_id=? AND status='confirmed')`
    ).bind(id,name,student,email,phone,program,goals,slotId,slotId).run();
    if(result.meta?.changes!==1) return json({ok:false,error:"That appointment was just booked. Choose another time."},409);
  }catch(e){
    if(/UNIQUE|constraint/i.test(String(e))) return json({ok:false,error:"That appointment was just booked. Choose another time."},409);
    return json({ok:false,error:"We could not save the booking. Please try again."},503);
  }
  const dateTime=slot.date+" at "+slot.time+" ET";
  const details=`<p><b>Private lesson:</b> ${escapeHtml(dateTime)} (${slot.duration} minutes)</p>
    <p><b>Student:</b> ${escapeHtml(student)}<br/><b>Contact:</b> ${escapeHtml(name)}<br/>
    <b>Phone:</b> ${escapeHtml(phone)}<br/><b>Email:</b> ${escapeHtml(email)}<br/>
    <b>Program:</b> ${escapeHtml(program)}</p><p><b>Goals:</b> ${escapeHtml(goals||"Not supplied")}</p>
    <p><b>Booking reference:</b> ${escapeHtml(id)}</p>`;
  const ownerEmail=String(env.PRIVATE_LESSON_NOTIFICATION_EMAIL||"david@burningtreemma.com").trim();
  const emails=await Promise.all([
    sendEmail(env,email,"Your private lesson at Burning Tree MMA",
      `<h2>Your Private Lesson Is Scheduled</h2><p>Hello ${escapeHtml(name)},</p><p>Your session is confirmed at Burning Tree MMA, 10210 S Dolfield Rd, Owings Mills, MD 21117.</p>${details}<p>Questions? Text or call Coach David at (410) 218-0894. Booking does not collect payment.</p>`),
    validEmail(ownerEmail)?sendEmail(env,ownerEmail,"New private lesson booking – "+dateTime,
      `<h2>New Private Lesson Appointment</h2>${details}<p>View and manage bookings in the Instructor Private Lesson Manager.</p>`):Promise.resolve(false)
  ]);
  return json({ok:true,bookingId:id,date:slot.date,time:slot.time,duration:slot.duration,emailSent:emails[0]});
}

import {
  envForBookings,json,PROGRAMS,DURATIONS,futureDateTime,allowedHalfHour,clock,minutes,
  canWrite,readBody,validName,safeString,verifyTurnstile,escapeHtml
} from "../../../lib/private-lessons.js";
export const prerender=false;
const validEmail=v=>v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validPhone=v=>v.length>=7&&v.length<=30&&/^[+()\-. \d]+$/.test(v);
async function sendEmail(env,to,subject,html){
  if(!env.RESEND_API_KEY) return false;
  try {
    const r=await fetch("https://api.resend.com/emails",{
      method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({from:"Burning Tree MMA <noreply@burningtreemma.com>",to:[to],subject,html})
    });
    return r.ok;
  } catch{return false;}
}
export async function POST({request,locals}) {
  const env=envForBookings(locals);
  if(!env) return json({ok:false,error:"Private lesson booking is not open yet. Call or text (410) 218-0894."},503);
  if(!canWrite(request)) return json({ok:false,error:"Invalid booking request."},403);
  const body=await readBody(request);
  const slotId=body?.slotId;
  const duration=body?.duration;
  const name=safeString(body?.contactName,120);
  const student=safeString(body?.studentName,120);
  const email=safeString(body?.email,254).toLowerCase();
  const phone=safeString(body?.phone,30);
  const program=body?.program;
  const goals=safeString(body?.goals,500);
  if(typeof slotId!=="string"||!/^[a-f0-9-]{36}$/i.test(slotId)||!DURATIONS.includes(duration)||
     !validName(name)||!validName(student)||!validEmail(email)||!validPhone(phone)||
     !PROGRAMS.includes(program)||goals.length>500)
    return json({ok:false,error:"Please choose a 30-minute or 1-hour lesson and complete all required fields."},400);
  if(!await verifyTurnstile(env,request,body?.turnstileToken))
    return json({ok:false,error:"Security check expired. Complete it again and retry."},403);
  const db=env.LIVE_TRIAL_DB;
  let slot;
  try {
    slot=await db.prepare(
      "SELECT id,local_date AS date,local_time AS time FROM private_lesson_slots WHERE id=? AND is_open=1"
    ).bind(slotId).first();
  } catch {return json({ok:false,error:"Booking is temporarily unavailable."},503);}
  if(!slot||!futureDateTime(slot.date,slot.time)||!allowedHalfHour(slot.date,slot.time)||
     minutes(slot.time)+duration>1440)
    return json({ok:false,error:"That time is no longer available. Please choose another."},409);

  let secondBlock=null;
  if(duration===60) {
    const nextTime=clock(minutes(slot.time)+30);
    try {
      secondBlock=await db.prepare(
        "SELECT id FROM private_lesson_slots WHERE local_date=? AND local_time=? AND is_open=1"
      ).bind(slot.date,nextTime).first();
    } catch{return json({ok:false,error:"Booking is temporarily unavailable."},503);}
    if(!secondBlock||!allowedHalfHour(slot.date,nextTime))
      return json({ok:false,error:"A full hour is not available at that start time. Select a different time or 30 minutes."},409);
  }
  const id=crypto.randomUUID();
  try {
    // Cloudflare D1 batch is transactional. The unique block PK prevents an
    // overlapping 30- or 60-minute lesson even under concurrent requests.
    // The trigger disallows claiming blocks that staff have since closed.
    const statements=[
      db.prepare(
        `INSERT INTO private_lesson_bookings
         (id,slot_id,duration_minutes,contact_name,student_name,email,phone,program,goals,status)
         VALUES (?,?,?,?,?,?,?,?,?,'confirmed')`
      ).bind(id,slot.id,duration,name,student,email,phone,program,goals),
      db.prepare("INSERT INTO private_lesson_booking_blocks(slot_id,booking_id) VALUES (?,?)")
        .bind(slot.id,id)
    ];
    if(secondBlock) statements.push(
      db.prepare("INSERT INTO private_lesson_booking_blocks(slot_id,booking_id) VALUES (?,?)")
        .bind(secondBlock.id,id)
    );
    await db.batch(statements);
  } catch(e) {
    if(/UNIQUE|constraint|block not open|FOREIGN KEY/i.test(String(e)))
      return json({ok:false,error:"That lesson time has just been taken or closed. Choose another available time."},409);
    return json({ok:false,error:"We could not save the booking. Please try again."},503);
  }
  const dateTime=slot.date+" at "+slot.time+" Eastern";
  const details=`<p><b>Private lesson:</b> ${escapeHtml(dateTime)} (${duration} minutes)</p>
    <p><b>Student:</b> ${escapeHtml(student)}<br/><b>Contact:</b> ${escapeHtml(name)}<br/>
    <b>Phone:</b> ${escapeHtml(phone)}<br/><b>Email:</b> ${escapeHtml(email)}<br/>
    <b>Program:</b> ${escapeHtml(program)}</p><p><b>Goals:</b> ${escapeHtml(goals||"Not supplied")}</p>
    <p><b>Booking reference:</b> ${escapeHtml(id)}</p>`;
  const ownerEmail=String(env.PRIVATE_LESSON_NOTIFICATION_EMAIL||"david@burningtreemma.com").trim();
  const emails=await Promise.all([
    sendEmail(env,email,"Your "+duration+"-minute private lesson at Burning Tree MMA",
      `<h2>Your Private Lesson Is Scheduled</h2><p>Hello ${escapeHtml(name)},</p><p>Your session is confirmed at Burning Tree MMA, 10210 S Dolfield Rd, Owings Mills, MD 21117.</p>${details}<p>Questions? Text or call Coach David at (410) 218-0894. Booking does not collect payment.</p>`),
    validEmail(ownerEmail)?sendEmail(env,ownerEmail,"New "+duration+"-minute private lesson – "+dateTime,
      `<h2>New Private Lesson Appointment</h2>${details}<p>View bookings in the Instructor Private Lesson Manager.</p>`):Promise.resolve(false)
  ]);
  return json({ok:true,bookingId:id,date:slot.date,time:slot.time,duration,emailSent:emails[0]});
}

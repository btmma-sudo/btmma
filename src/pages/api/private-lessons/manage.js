import {
  adminAccess,adminJson,canWrite,readBody,validDate,validTime,
  futureDateTime,minutes,DURATIONS
} from "../../../lib/private-lessons.js";
export const prerender=false;
export async function GET({request,locals}) {
  const staff=await adminAccess(request,locals);
  if(!staff) return adminJson({ok:false,error:"Not found."},404);
  try {
    const [slots,bookings]=await Promise.all([
      staff.env.LIVE_TRIAL_DB.prepare(`SELECT s.id,s.local_date AS date,s.local_time AS time,s.duration_minutes AS duration,s.is_open AS isOpen,
        EXISTS (SELECT 1 FROM private_lesson_bookings b WHERE b.slot_id=s.id AND b.status='confirmed') AS booked
        FROM private_lesson_slots s WHERE s.local_date >= date('now','-1 day') ORDER BY s.local_date,s.local_time LIMIT 500`).all(),
      staff.env.LIVE_TRIAL_DB.prepare(`SELECT b.id,b.slot_id AS slotId,b.contact_name AS contactName,b.student_name AS studentName,
        b.email,b.phone,b.program,b.goals,b.status,b.created_at AS bookedAt,
        s.local_date AS date,s.local_time AS time,s.duration_minutes AS duration
        FROM private_lesson_bookings b JOIN private_lesson_slots s ON b.slot_id=s.id
        WHERE s.local_date >= date('now','-7 days') ORDER BY s.local_date,s.local_time LIMIT 500`).all()
    ]);
    return adminJson({ok:true,slots:slots.results||[],bookings:bookings.results||[]});
  }catch{return adminJson({ok:false,error:"Apply the private-lesson database migration to finish setup."},503);}
}
export async function POST({request,locals}) {
  const staff=await adminAccess(request,locals);
  if(!staff) return adminJson({ok:false,error:"Not found."},404);
  if(!canWrite(request)) return adminJson({ok:false,error:"Invalid request."},403);
  const body=await readBody(request), db=staff.env.LIVE_TRIAL_DB;
  try{
    if(body?.action==="add"){
      const {date,time,duration}=body;
      if(!validDate(date)||!validTime(time)||!DURATIONS.includes(duration)||
         !futureDateTime(date,time)||minutes(time)+duration>1440)
        return adminJson({ok:false,error:"Choose a future time at least 24 hours out and within 90 days."},400);
      const start=minutes(time), end=start+duration;
      const existing=await db.prepare("SELECT local_time,duration_minutes FROM private_lesson_slots WHERE local_date=? AND is_open=1")
        .bind(date).all();
      if((existing.results||[]).some(s=>start<minutes(s.local_time)+s.duration_minutes && minutes(s.local_time)<end))
        return adminJson({ok:false,error:"This time overlaps another open or booked slot."},409);
      await db.prepare(
        "INSERT INTO private_lesson_slots(id,local_date,local_time,duration_minutes,created_by) VALUES (?,?,?,?,?)"
      ).bind(crypto.randomUUID(),date,time,duration,staff.account.id).run();
      return adminJson({ok:true});
    }
    if(body?.action==="close"){
      const id=body.slotId;
      if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id)) return adminJson({ok:false,error:"Invalid slot."},400);
      const r=await db.prepare(`UPDATE private_lesson_slots SET is_open=0 WHERE id=? AND is_open=1
         AND NOT EXISTS(SELECT 1 FROM private_lesson_bookings WHERE slot_id=? AND status='confirmed')`).bind(id,id).run();
      return r.meta?.changes===1?adminJson({ok:true}):adminJson({ok:false,error:"A booked session cannot be removed. Cancel the booking first."},409);
    }
    if(body?.action==="cancel"){
      const id=body.bookingId;
      if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id)) return adminJson({ok:false,error:"Invalid booking."},400);
      const r=await db.prepare("UPDATE private_lesson_bookings SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='confirmed'")
        .bind(id).run();
      return r.meta?.changes===1?adminJson({ok:true,message:"Booking cancelled. Contact the student directly to notify them."}):adminJson({ok:false,error:"Booking not found or already cancelled."},409);
    }
    return adminJson({ok:false,error:"Unknown action."},400);
  }catch{return adminJson({ok:false,error:"Could not update the calendar. Confirm that database setup is complete."},503);}
}

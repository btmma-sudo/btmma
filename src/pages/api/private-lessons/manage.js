import {
  adminAccess,adminJson,canWrite,readBody,validDate,validTime,
  futureDateTime,minutes,clock,allowedPublishWindow
} from "../../../lib/private-lessons.js";
export const prerender=false;
export async function GET({request,locals}) {
  const staff=await adminAccess(request,locals);
  if(!staff) return adminJson({ok:false,error:"Not found."},404);
  try {
    const [slots,bookings]=await Promise.all([
      staff.env.LIVE_TRIAL_DB.prepare(
        `SELECT s.id,s.local_date AS date,s.local_time AS time,s.is_open AS isOpen,
         EXISTS (SELECT 1 FROM private_lesson_booking_blocks bb WHERE bb.slot_id=s.id) AS booked
         FROM private_lesson_slots s WHERE s.local_date>=date('now','-1 day')
         ORDER BY s.local_date,s.local_time LIMIT 1000`
      ).all(),
      staff.env.LIVE_TRIAL_DB.prepare(
        `SELECT b.id,b.slot_id AS slotId,b.duration_minutes AS duration,
          b.contact_name AS contactName,b.student_name AS studentName,
          b.email,b.phone,b.program,b.goals,b.status,b.created_at AS bookedAt,
          s.local_date AS date,s.local_time AS time
         FROM private_lesson_bookings b JOIN private_lesson_slots s ON b.slot_id=s.id
         WHERE s.local_date >= date('now','-7 days')
         ORDER BY s.local_date,s.local_time LIMIT 500`
      ).all()
    ]);
    return adminJson({ok:true,slots:slots.results||[],bookings:bookings.results||[]});
  }catch{return adminJson({ok:false,error:"Apply the private-lesson database migration to finish setup."},503);}
}
export async function POST({request,locals}) {
  const staff=await adminAccess(request,locals);
  if(!staff) return adminJson({ok:false,error:"Not found."},404);
  if(!canWrite(request)) return adminJson({ok:false,error:"Invalid request."},403);
  const body=await readBody(request), db=staff.env.LIVE_TRIAL_DB;
  try {
    if(body?.action==="publish-window"){
      const {date,startTime,endTime}=body;
      if(!validDate(date)||!validTime(startTime)||!validTime(endTime)||
         !allowedPublishWindow(date,startTime,endTime)||!futureDateTime(date,startTime))
        return adminJson({ok:false,error:"Choose a 30-minute-aligned opening within the approved daily hours, at least 24 hours ahead. Saturday ends at 5 PM; Sunday is 9 AM–2 PM or 4–6 PM."},400);
      const start=minutes(startTime), end=minutes(endTime);
      const statements=[];
      for(let m=start;m<end;m+=30) {
        statements.push(db.prepare(
          `INSERT INTO private_lesson_slots(id,local_date,local_time,created_by)
           VALUES (?,?,?,?)
           ON CONFLICT(local_date,local_time) DO UPDATE SET is_open=1`
        ).bind(crypto.randomUUID(),date,clock(m),staff.account.id));
      }
      await db.batch(statements);
      return adminJson({ok:true,message:"Published "+statements.length+" half-hour openings. Students can choose 30 or 60 minutes when consecutive blocks are free."});
    }
    if(body?.action==="close"){
      const id=body.slotId;
      if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id))
        return adminJson({ok:false,error:"Invalid slot."},400);
      const r=await db.prepare(
        `UPDATE private_lesson_slots SET is_open=0 WHERE id=? AND is_open=1
         AND NOT EXISTS(SELECT 1 FROM private_lesson_booking_blocks WHERE slot_id=?)`
      ).bind(id,id).run();
      return r.meta?.changes===1?adminJson({ok:true}):
        adminJson({ok:false,error:"A booked half-hour cannot be closed. Cancel its booking first."},409);
    }
    if(body?.action==="cancel"){
      const id=body.bookingId;
      if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id))
        return adminJson({ok:false,error:"Invalid booking."},400);
      const booking=await db.prepare("SELECT id FROM private_lesson_bookings WHERE id=? AND status='confirmed'").bind(id).first();
      if(!booking) return adminJson({ok:false,error:"Booking not found or already cancelled."},409);
      await db.batch([
        db.prepare("UPDATE private_lesson_bookings SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='confirmed'").bind(id),
        db.prepare("DELETE FROM private_lesson_booking_blocks WHERE booking_id=?").bind(id)
      ]);
      return adminJson({ok:true,message:"Booking cancelled and time reopened. Please notify the student directly."});
    }
    return adminJson({ok:false,error:"Unknown action."},400);
  }catch{return adminJson({ok:false,error:"Could not update the calendar. Confirm the database is ready and try again."},503);}
}

import {envForBookings,json,futureDateTime} from "../../../lib/private-lessons.js";
export const prerender=false;
export async function GET({locals}) {
  const env=envForBookings(locals);
  if(!env) return json({ok:false,slots:[],error:"Scheduling is not open yet."},503);
  try {
    const rows=await env.LIVE_TRIAL_DB.prepare(
      `SELECT s.id,s.local_date AS date,s.local_time AS time,s.duration_minutes AS duration
       FROM private_lesson_slots s WHERE s.is_open=1
         AND NOT EXISTS (
           SELECT 1 FROM private_lesson_bookings b WHERE b.slot_id=s.id AND b.status='confirmed'
         ) ORDER BY s.local_date,s.local_time LIMIT 500`
    ).all();
    const slots=(rows.results||[]).filter(s=>futureDateTime(s.date,s.time));
    return json({ok:true,slots,timezone:"America/New_York"});
  } catch {return json({ok:false,slots:[],error:"The calendar is being prepared."},503);}
}

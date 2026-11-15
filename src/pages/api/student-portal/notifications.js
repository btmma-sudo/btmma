import { secureHeaders,validSameOrigin } from "../../../lib/student-portal-auth.js";
import { notificationSession,validatedNotice } from "../../../lib/school-notifications.js";
import { validatedSubscription,allowedEndpoint,sendPush } from "../../../lib/school-web-push.js";
export const prerender=false;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:secureHeaders({"Content-Type":"application/json"})});
async function limitedJSON(request){
  if(!request.headers.get("content-type")?.startsWith("application/json")||!request.body) throw Error("Request");
  const reader=request.body.getReader(); let total=0,text=""; const decoder=new TextDecoder();
  for(;;){const {done,value}=await reader.read(); if(done)break; total+=value.byteLength;
    if(total>8192){await reader.cancel();throw Error("Size");}
    text+=decoder.decode(value,{stream:true});}
  return JSON.parse(text+decoder.decode());
}
export async function POST({request,locals}){
  if(!validSameOrigin(request)) return json({error:"Invalid origin"},403);
  try{
    const session=await notificationSession(request,locals);
    if(!session) return json({error:"Sign in or contact the studio."},403);
    const {db,account,owner,config}=session;
    const data=await limitedJSON(request).catch(()=>null);
    if(!data) return json({error:"Invalid request."},400);
    if(data.action==="subscribe"){
      const s=validatedSubscription(data.subscription);
      if(!s)return json({error:"Unsupported push subscription."},400);
      // A device cannot silently move to a different household. Use unsubscribe first.
      await db.prepare("INSERT INTO school_push_devices(id,account_id,endpoint,p256dh,auth) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM school_push_devices WHERE account_id=?)<10 ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth WHERE school_push_devices.account_id=excluded.account_id").bind(crypto.randomUUID(),account.id,s.endpoint,s.p256dh,s.auth,account.id).run();
      const saved=await db.prepare("SELECT 1 FROM school_push_devices WHERE endpoint=? AND account_id=?").bind(s.endpoint,account.id).first();
      return saved?json({ok:true}):json({error:"Device already linked or device limit reached."},409);
    }
    if(data.action==="unsubscribe"){
      if(!allowedEndpoint(data.endpoint))return json({error:"Invalid device."},400);
      await db.prepare("DELETE FROM school_push_devices WHERE endpoint=? AND account_id=?").bind(data.endpoint,account.id).run();
      return json({ok:true});
    }
    if(data.action==="status"){
      if(!allowedEndpoint(data.endpoint))return json({enabled:false});
      return json({enabled:!!await db.prepare("SELECT 1 FROM school_push_devices WHERE endpoint=? AND account_id=?").bind(data.endpoint,account.id).first()});
    }
    if(!owner)return json({error:"Owner approval required."},403);
    if(data.action==="publish"){
      const n=validatedNotice(data);
      if(!n||data.confirm!==true)return json({error:"Review and confirm the announcement."},400);
      const exists=await db.prepare("SELECT id FROM school_announcements WHERE id=? AND owner_id=?").bind(n.id,account.id).first();
      if(exists)return json({id:n.id});
      // School alerts only go to active enrolled households; tests only to the owner.
      const filter=n.audience==="test"?"d.account_id=?":"EXISTS(SELECT 1 FROM portal_students s WHERE s.account_id=d.account_id AND s.active=1)";
      const insert=db.prepare("INSERT INTO school_announcements(id,owner_id,audience,title,body) VALUES(?,?,?,?,?)").bind(n.id,account.id,n.audience,n.title,n.body);
      const sql="INSERT INTO school_push_deliveries(announcement_id,device_id) SELECT ?,d.id FROM school_push_devices d JOIN portal_accounts a ON a.id=d.account_id AND a.active=1 WHERE "+filter;
      const queue=n.audience==="test"?db.prepare(sql).bind(n.id,account.id):db.prepare(sql).bind(n.id);
      await db.batch([insert,queue]);
      return json({id:n.id});
    }
    if(data.action==="deliver"){
      const n=await db.prepare("SELECT * FROM school_announcements WHERE id=? AND owner_id=?").bind(String(data.id||""),account.id).first();
      if(!n)return json({error:"Announcement not found."},404);
      // Atomically claim one device per request to keep free-tier requests small.
      // Ambiguous/abandoned processing is not automatically retried.
      const claim=await db.prepare("UPDATE school_push_deliveries SET status='processing',updated_at=CURRENT_TIMESTAMP WHERE announcement_id=? AND device_id=(SELECT device_id FROM school_push_deliveries WHERE announcement_id=? AND status='pending' LIMIT 1) AND status='pending' RETURNING device_id").bind(n.id,n.id).first();
      if(!claim)return json({done:true});
      const d=await db.prepare("SELECT d.* FROM school_push_devices d JOIN portal_accounts a ON a.id=d.account_id AND a.active=1 WHERE d.id=? AND ( (?='test' AND d.account_id=?) OR (?='school' AND EXISTS(SELECT 1 FROM portal_students s WHERE s.account_id=d.account_id AND s.active=1)))").bind(claim.device_id,n.audience,account.id,n.audience).first();
      let status="skipped";
      if(d){
        try{status=await sendPush(config,d,{title:n.title,body:n.body,id:n.id});}catch{status="failed";}
        if(status==="expired")await db.prepare("DELETE FROM school_push_devices WHERE id=?").bind(d.id).run();
      }
      await db.prepare("UPDATE school_push_deliveries SET status=?,updated_at=CURRENT_TIMESTAMP WHERE announcement_id=? AND device_id=?").bind(status,n.id,claim.device_id).run();
      return json({done:false,status});
    }
    return json({error:"Unknown action."},400);
  }catch{return json({error:"Notifications are unavailable. No automatic retry was made."},503);}
}

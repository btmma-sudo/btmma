import {getPortalEnv,createSessionCookie,secureHeaders,validSameOrigin} from "../../../../lib/student-portal-auth.js";
import {
  OWNER_EMAIL,OWNER_DISPLAY_NAME,validOwnerToken,validOwnerPassword,
  digestToken,passwordDigest,firstOwnerNotYetPresent
} from "../../../../lib/student-portal-owner-setup.js";
export const prerender=false;

const json=(body,status=200,cookie)=>new Response(JSON.stringify(body),{
  status,headers:secureHeaders({
    "Content-Type":"application/json; charset=utf-8",
    ...(cookie?{"Set-Cookie":cookie}:{})
  })
});
const deny=()=>json({ok:false,error:"This setup link is invalid, expired, or already used. Request a new link if needed."},403);

export async function POST({request,locals}){
  const env=getPortalEnv(locals);
  if(!env)return json({ok:false,error:"Owner setup is unavailable."},503);
  if(!validSameOrigin(request)||new URL(request.url).hostname!=="burningtreemma.com")
    return json({ok:false,error:"Invalid request."},403);
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    return json({ok:false,error:"Invalid request."},415);
  if(Number(request.headers.get("content-length")||0)>3500)
    return json({ok:false,error:"Invalid request."},413);
  let data;
  try{
    const raw=await request.text();
    if(raw.length>3500)return deny();
    data=JSON.parse(raw);
  }catch{return deny();}
  const token=data?.token;
  const password=data?.password;
  if(!validOwnerToken(token) || !validOwnerPassword(password))return deny();
  const db=env.LIVE_TRIAL_DB;
  try{
    if(!await firstOwnerNotYetPresent(db))return deny();
    const tokenHash=await digestToken(token);
    const now=Math.floor(Date.now()/1000);
    const ticket=await db.prepare(
      "SELECT token_hash,expires_at,used_at FROM portal_owner_setup_challenges WHERE id='first-owner'"
    ).first();
    if(!ticket||ticket.used_at!=null||ticket.expires_at<=now||
       typeof ticket.token_hash!=="string"||ticket.token_hash.length!==tokenHash.length)return deny();
    let diff=0;
    for(let i=0;i<tokenHash.length;i++)diff|=tokenHash.charCodeAt(i)^ticket.token_hash.charCodeAt(i);
    if(diff!==0)return deny();

    const accountId=crypto.randomUUID();
    const credentials=await passwordDigest(password);
    // Cloudflare D1 db.batch is atomic: no staff privilege is granted without
    // the new owner account and a valid unconsumed email invitation.
    const results=await db.batch([
      db.prepare(
        "INSERT INTO portal_accounts (id,display_name,email,password_salt,password_hash,active) " +
        "SELECT ?,?,?,?, ?,1 FROM portal_owner_setup_challenges c " +
        "WHERE c.id='first-owner' AND c.token_hash=? AND c.used_at IS NULL AND c.expires_at>? " +
        "AND NOT EXISTS(SELECT 1 FROM portal_accounts WHERE email=?)"
      ).bind(accountId,OWNER_DISPLAY_NAME,OWNER_EMAIL,credentials.salt,credentials.hash,
             tokenHash,now,OWNER_EMAIL),
      db.prepare(
        "INSERT INTO portal_staff (account_id,can_upload,can_publish,active) " +
        "SELECT id,1,1,1 FROM portal_accounts WHERE id=? AND email=? AND active=1"
      ).bind(accountId,OWNER_EMAIL),
      db.prepare(
        "UPDATE portal_owner_setup_challenges SET used_at=? " +
        "WHERE id='first-owner' AND token_hash=? AND used_at IS NULL AND expires_at>?"
      ).bind(now,tokenHash,now)
    ]);
    if(results?.length!==3 || results.some(r=>r.success!==true || r.meta?.changes!==1)){
      return deny();
    }
    const cookie=await createSessionCookie(env,{id:accountId,session_version:1});
    return json({ok:true,redirect:"/student-portal/"},200,cookie);
  }catch{
    return json({ok:false,error:"Secure owner setup is temporarily unavailable. No payment was charged."},503);
  }
}

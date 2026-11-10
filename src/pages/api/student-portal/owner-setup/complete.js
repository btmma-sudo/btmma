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
  let stage="owner_preflight";
  try{
    if(!await firstOwnerNotYetPresent(db))return deny();
    stage="verify_token";
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

    stage="password_hash";
    const accountId=crypto.randomUUID();
    const credentials=await passwordDigest(password);
    // Cloudflare D1 db.batch is atomic: no staff privilege is granted without
    // the new owner account and a valid unconsumed email invitation.
    stage="account_transaction";
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
      // The batch transaction has completed; never claim the account was
      // created successfully until we can independently verify it.
      console.error("Student owner setup transaction had unexpected result", {
        stage:"transaction_verification",
        statements:results?.length===3?3:0,
        allSucceeded:results?.every(r=>r.success===true)===true,
        // Changes may not be present on every Cloudflare binding version.
        hasChangeCounts:results?.every(r=>typeof r.meta?.changes==="number")===true
      });
      return json({ok:false,error:"Owner setup could not verify the database update. Please contact the studio before retrying.",code:"transaction_verification"},503);
    }
    stage="session_cookie";
    const cookie=await createSessionCookie(env,{id:accountId,session_version:1});
    return json({ok:true,redirect:"/student-portal/"},200,cookie);
  }catch(exception){
    // Deliberately NEVER log request bodies, password, token, SQL binds,
    // raw database exception strings, stack traces, account ID or email.
    const type=(typeof exception?.name==="string" && /^(TypeError|Error|NotSupportedError|OperationError|DataError|InvalidAccessError|QuotaExceededError)$/.test(exception.name)) ? exception.name : "ServerError";
    console.error("Student owner setup failed", {stage,errorType:type});
    const errorMessages={
      owner_preflight:"Could not verify the owner account. Please contact the studio.",
      verify_token:"Could not verify the owner setup link. Please contact the studio.",
      password_hash:"Could not securely prepare the account password. Please contact the studio.",
      account_transaction:"Could not save the owner account to the database. Please contact the studio.",
      session_cookie:"Owner account saving may have succeeded, but sign-in could not be completed. Please try signing in normally before requesting another link."
    };
    return json({ok:false,error:errorMessages[stage]||"Secure owner setup is temporarily unavailable.",code:stage},503);
  }
}

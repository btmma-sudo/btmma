import {getPortalEnv,secureHeaders,validSameOrigin} from "../../../../lib/student-portal-auth.js";
import {validPortalChallenge} from "../../../../lib/student-portal-turnstile.js";
import {
  OWNER_EMAIL,OWNER_INVITE_ACTION,OWNER_COOLDOWN_SECONDS,
  OWNER_INVITE_LIFETIME_SECONDS,ownerInviteSchema,generateOwnerToken,
  digestToken,firstOwnerNotYetPresent
} from "../../../../lib/student-portal-owner-setup.js";

export const prerender=false;
const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:secureHeaders({"Content-Type":"application/json; charset=utf-8"})
});
const ok=()=>json({ok:true,message:"If this owner account is eligible, a private setup link will arrive at the verified email address."});
const error=(message,status=503)=>json({ok:false,error:message},status);

export async function POST({request,locals}){
  const env=getPortalEnv(locals);
  if(!env || !env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY)
    return error("Owner invitation is not configured.");
  if(!validSameOrigin(request) || new URL(request.url).hostname!=="burningtreemma.com")
    return error("Invalid request.",403);
  if(Number(request.headers.get("content-length")||0)>5000)
    return error("Invalid request.",413);
  let form;
  try{form=await request.formData();}catch{return error("Invalid request.",400);}
  const challenge=String(form.get("cf-turnstile-response")||"");
  if(challenge.length<5||challenge.length>2500)return error("Complete the security check.",400);
  try{
    const data=new FormData();
    data.set("secret",env.TURNSTILE_SECRET_KEY);
    data.set("response",challenge);
    const ip=request.headers.get("cf-connecting-ip");
    if(ip)data.set("remoteip",ip);
    const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
      method:"POST",body:data
    });
    const result=response.ok?await response.json():null;
    if(!validPortalChallenge(result,request.url,OWNER_INVITE_ACTION))
      return error("Complete the security check.",403);
  }catch{return error("The security check is temporarily unavailable.");}

  const db=env.LIVE_TRIAL_DB;
  try{
    if(!await firstOwnerNotYetPresent(db))return ok();
    // This standalone table never changes registration, student, or Stripe data.
    await db.prepare(ownerInviteSchema).run();
    const now=Math.floor(Date.now()/1000);
    const existing=await db.prepare(
      "SELECT requested_at FROM portal_owner_setup_challenges WHERE id='first-owner'"
    ).first();
    if(existing && now-existing.requested_at<OWNER_COOLDOWN_SECONDS)return ok();
    const token=generateOwnerToken();
    const digest=await digestToken(token);
    const saved=await db.prepare(
      "INSERT INTO portal_owner_setup_challenges (id,token_hash,requested_at,expires_at,used_at) " +
      "VALUES ('first-owner',?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET " +
      "token_hash=excluded.token_hash,requested_at=excluded.requested_at," +
      "expires_at=excluded.expires_at,used_at=NULL " +
      "WHERE portal_owner_setup_challenges.requested_at<=?"
    ).bind(digest,now,now+OWNER_INVITE_LIFETIME_SECONDS,now-OWNER_COOLDOWN_SECONDS).run();
    if(saved.meta?.changes!==1)return ok();

    // Put the token after #, so it is NOT sent to Cloudflare, referrers or
    // normal HTTP access logs when the recipient opens the setup page.
    const link="https://burningtreemma.com/student-portal/setup-owner/#token="+token;
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({
        from:"Burning Tree MMA <noreply@burningtreemma.com>",
        to:[OWNER_EMAIL],
        subject:"Your Burning Tree owner portal setup link",
        html:"<p>Someone requested first-owner access to Burning Tree Mixed Martial Arts.</p>" +
          "<p>To set your own password securely, open the following one-time link within 15 minutes:</p>" +
          '<p><a href="'+link+'">Set up my owner account</a></p>' +
          "<p>If you did not request this, ignore this email. No account was created.</p>" +
          "<p>Burning Tree Mixed Martial Arts · One Tree. One Family.</p>"
      })
    });
    if(!response.ok){
      // Make a new request possible after the email service recovers.
      await db.prepare(
        "UPDATE portal_owner_setup_challenges SET requested_at=0,expires_at=0,token_hash='expired' " +
        "WHERE id='first-owner' AND token_hash=?"
      ).bind(digest).run();
      return error("The setup email could not be delivered. Please try again later.");
    }
    return ok();
  }catch{
    return error("Secure owner setup is temporarily unavailable.");
  }
}

import {getPortalEnv,secureHeaders,validSameOrigin} from "../../../../lib/student-portal-auth.js";
import {validPortalChallenge} from "../../../../lib/student-portal-turnstile.js";
import {classifyOwnerInviteEmailFailure} from "../../../../lib/owner-invite-email-errors.js";
import {
  OWNER_EMAIL,OWNER_INVITE_ACTION,OWNER_COOLDOWN_SECONDS,
  OWNER_INVITE_LIFETIME_SECONDS,ownerInviteSchema,generateOwnerToken,
  digestToken,firstOwnerNotYetPresent
} from "../../../../lib/student-portal-owner-setup.js";

export const prerender=false;
const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:secureHeaders({"Content-Type":"application/json; charset=utf-8"})
});
const accepted=()=>json({
  ok:true,sent:true,
  message:"The email service accepted your setup request. Check the approved owner's Inbox and Spam folder."
});
const notSent=()=>json({
  ok:true,sent:false,
  message:"No new setup email was sent. If your owner account is already active, use Student Login. Otherwise, check your earlier setup email or contact the studio."
});
const cooldown=seconds=>json({
  ok:true,sent:false,retryAfterSeconds:seconds,
  message:"No new email was sent. A setup email was requested recently. Try again in about "+
    Math.max(1,Math.ceil(seconds/60))+
    " minute(s). Your earlier setup link can be reused while it is less than 15 minutes old."
});
const error=(message,status=503)=>json({ok:false,error:message},status);

export async function POST({request,locals}){
  const env=getPortalEnv(locals);
  if(!env || !env.TURNSTILE_SECRET_KEY || !env.STUDENT_PORTAL_RESEND_API_KEY)
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
    if(!await firstOwnerNotYetPresent(db))return notSent();
    // This standalone table never changes registration, student, or Stripe data.
    await db.prepare(ownerInviteSchema).run();
    const now=Math.floor(Date.now()/1000);
    const existing=await db.prepare(
      "SELECT requested_at FROM portal_owner_setup_challenges WHERE id='first-owner'"
    ).first();
    if(existing && Number.isFinite(Number(existing.requested_at)) &&
       now-Number(existing.requested_at)<OWNER_COOLDOWN_SECONDS) {
      return cooldown(Math.max(1,Math.min(OWNER_COOLDOWN_SECONDS,
        OWNER_COOLDOWN_SECONDS-(now-Number(existing.requested_at)))));
    }
    const token=generateOwnerToken();
    const digest=await digestToken(token);
    const saved=await db.prepare(
      "INSERT INTO portal_owner_setup_challenges (id,token_hash,requested_at,expires_at,used_at) " +
      "VALUES ('first-owner',?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET " +
      "token_hash=excluded.token_hash,requested_at=excluded.requested_at," +
      "expires_at=excluded.expires_at,used_at=NULL " +
      "WHERE portal_owner_setup_challenges.requested_at<=?"
    ).bind(digest,now,now+OWNER_INVITE_LIFETIME_SECONDS,now-OWNER_COOLDOWN_SECONDS).run();
    if(saved.meta?.changes!==1) {
      // A concurrent invitation may already have been processed; do not
      // claim this request caused a new email to be sent.
      return notSent();
    }

    // Put the token after #, so it is NOT sent to Cloudflare, referrers or
    // normal HTTP access logs when the recipient opens the setup page.
    const link="https://burningtreemma.com/student-portal/setup-owner/#token="+token;
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+env.STUDENT_PORTAL_RESEND_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({
        from:"Burning Tree Student Portal <noreply@portal.burningtreemma.com>",
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
      // Resend rejections used to disappear behind an unhelpful generic error.
      // Record *only* a sanitized status and provider error name, never a
      // setup token, email body, API key, or raw provider response.
      let providerError=null;
      try{
        if((response.headers.get("content-type")||"").includes("application/json"))
          providerError=await response.json();
      }catch{/* Provider error text may not be JSON. */}
      const diagnosis=classifyOwnerInviteEmailFailure(response.status,providerError);
      console.error("Student owner invitation email rejected",{
        provider:"resend",httpStatus:response.status,providerCode:diagnosis.code
      });
      // No token should remain usable when its email was rejected.
      // Reset the cooldown so the owner can retry after fixing the provider.
      await db.prepare(
        "UPDATE portal_owner_setup_challenges SET requested_at=0,expires_at=0,token_hash='expired' " +
        "WHERE id='first-owner' AND token_hash=?"
      ).bind(digest).run();
      return error(diagnosis.message+(diagnosis.code!=="unknown"?" Error code: "+diagnosis.code+".":""));
    }
    return accepted();
  }catch{
    return error("Secure owner setup is temporarily unavailable.");
  }
}

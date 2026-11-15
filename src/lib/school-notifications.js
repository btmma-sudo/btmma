import { getPortalAccount,getPortalEnv } from "./student-portal-auth.js";
import { OWNER_EMAIL } from "./student-portal-owner-setup.js";
import { pushConfig } from "./school-web-push.js";
export async function notificationSession(request,locals) {
  const env=getPortalEnv(locals), config=pushConfig(env);
  if(!config) return null;
  const account=await getPortalAccount(request,env);
  if(!account) return null;
  const db=env.LIVE_TRIAL_DB;
  const owner=account.email.toLowerCase()===OWNER_EMAIL.toLowerCase();
  const active=owner||!!await db.prepare("SELECT 1 FROM portal_students WHERE account_id=? AND active=1 LIMIT 1").bind(account.id).first();
  return active?{db,account,owner,config}:null;
}
export function validatedNotice(data) {
  const title=typeof data?.title==="string"?data.title.trim():"";
  const body=typeof data?.body==="string"?data.body.trim():"";
  return title.length>=1&&title.length<=65&&body.length>=1&&body.length<=300&&
    ["test","school"].includes(data?.audience)&&/^[a-f0-9-]{36}$/.test(data?.id||"")?
    {title,body,audience:data.audience,id:data.id}:null;
}

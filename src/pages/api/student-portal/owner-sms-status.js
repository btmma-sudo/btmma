import { authorizedInstructor, privateJson, refuse } from "../../../lib/instructor-video-manager.js";
import { checkOwnerSmsAuthentication } from "../../../lib/owner-sms.js";
import { OWNER_EMAIL } from "../../../lib/student-portal-owner-setup.js";

export const prerender = false;

export async function GET({ request, locals }) {
  const owner = await authorizedInstructor(request, locals);
  if (owner?.account.email?.toLowerCase() !== OWNER_EMAIL) {
    return refuse("Sign in with the studio owner account to run this check.", 403);
  }
  return privateJson(await checkOwnerSmsAuthentication(owner.env));
}

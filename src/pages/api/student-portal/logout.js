import { clearSessionCookie, secureHeaders, validSameOrigin } from "../../../lib/student-portal-auth.js";
export const prerender = false;
export async function POST({request}) {
  if (!validSameOrigin(request)) return new Response("Invalid request.", {status:403, headers:secureHeaders()});
  return new Response(null, {
    status:303,
    headers: secureHeaders({Location:"/student-portal/", "Set-Cookie":clearSessionCookie()})
  });
}

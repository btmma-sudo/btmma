import {getPortalEnv, getPortalAccount, secureHeaders, validSameOrigin} from "../../../lib/student-portal-auth.js";
export const prerender = false;
const error = (message,status=503) => new Response(message,{status,headers:secureHeaders()});
export async function POST({request,locals}) {
  if (!validSameOrigin(request)) return error("Invalid request.",403);
  const env = getPortalEnv(locals);
  const account = await getPortalAccount(request,env);
  if (!account) return error("Sign in to your student account first.",401);
  // This feature is explicitly opt-in. No automatic card surcharge or late fee
  // is assessed here: Stripe is responsible for existing approved invoices.
  if (env.STUDENT_PORTAL_PAYMENTS_ENABLED !== "true" ||
      !/^bpc_[a-zA-Z0-9]+$/.test(String(env.STUDENT_PORTAL_STRIPE_PORTAL_CONFIGURATION_ID || "")) ||
      !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")) ||
      !/^cus_[A-Za-z0-9]+$/.test(String(account.stripe_customer_id || "")))
    return error("Tuition payments are being connected. Please contact the studio.");
  const params = new URLSearchParams({
    customer: account.stripe_customer_id,
    configuration: env.STUDENT_PORTAL_STRIPE_PORTAL_CONFIGURATION_ID,
    return_url: new URL("/student-portal/",request.url).toString()
  });
  try {
    const reply = await fetch("https://api.stripe.com/v1/billing_portal/sessions",{
      method:"POST",
      headers:{"Authorization":"Bearer "+env.STRIPE_LIVE_SECRET_KEY,"Content-Type":"application/x-www-form-urlencoded"},
      body:params
    });
    if (!reply.ok) return error("Secure tuition checkout is unavailable. Contact the studio.");
    const session = await reply.json();
    if (!/^https:\/\/billing\.stripe\.com\//.test(session.url || ""))
      return error("Tuition checkout could not be verified.");
    return new Response(null,{status:303,headers:secureHeaders({Location:session.url})});
  } catch {
    return error("Unable to connect to tuition checkout. Please try later.");
  }
}

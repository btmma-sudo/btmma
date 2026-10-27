export const prerender = false;
export async function POST() {
  return new Response(JSON.stringify({error: 'Verification service is being configured.'}), {status:503,headers:{'content-type':'application/json'}});
}

export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? {};

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const token = formData.get("cf-turnstile-response");
  if (!token) {
    return json({ error: "Missing verification token. Please refresh and try again." }, 400);
  }

  const secretKey = env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    return json({ error: "Server configuration error. Please contact us directly." }, 500);
  }

  // Verify token with Cloudflare Turnstile
  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: secretKey,
      response: String(token),
    }),
  });

  const verifyData = await verifyRes.json() as { success: boolean };

  if (!verifyData.success) {
    return json({ error: "Verification failed. Please refresh and try again." }, 403);
  }

  // Remove Turnstile token before forwarding to Make.com
  formData.delete("cf-turnstile-response");

  const encodedPayload = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    encodedPayload.set(key, String(value ?? ""));
  }

  const webhookUrl = env.MAKE_WEBHOOK_URL;
  if (!webhookUrl) {
    return json({ error: "Server configuration error. Please contact us directly." }, 500);
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: encodedPayload.toString(),
  });

  return json({ success: true }, 200);
};

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const token = formData.get("cf-turnstile-response");
  if (!token) {
    return json({ error: "Missing verification token. Please refresh and try again." }, 400);
  }

  // Verify token with Cloudflare Turnstile
  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
    }),
  });

  const verifyData = await verifyRes.json();

  if (!verifyData.success) {
    return json({ error: "Verification failed. Please refresh and try again." }, 403);
  }

  // Remove Turnstile token before forwarding to Make.com
  formData.delete("cf-turnstile-response");

  const encodedPayload = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    encodedPayload.set(key, String(value ?? ""));
  }

  await fetch("https://hook.eu2.make.com/7gx96x2faucgmcessddi71c6znfii3ro", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: encodedPayload.toString(),
  });

  return json({ success: true }, 200);
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

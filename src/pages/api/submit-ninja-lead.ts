export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? {};

  const webhookUrl = env.MAKE_WEBHOOK_URL;
  if (!webhookUrl) {
    return json({ error: "Server configuration error." }, 500);
  }

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const payload = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    payload.set(key, String(value ?? ""));
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: payload.toString(),
  });

  return json({ success: true }, 200);
};

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

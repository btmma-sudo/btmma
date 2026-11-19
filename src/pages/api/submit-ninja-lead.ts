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

  // Keep legacy Make.com webhook forms from creating Women's Self-Defense leads.
  // Only inspect inquiry/program metadata; do not use names or contact details.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid request." }, 400);
  }
  const values = Object.entries(body)
    .filter(([key]) => /^(program|programInterest|class|className|classType|preferredClass|course|inquiry|interest|comments|notes|message|source)$/i.test(key))
    .map(([, value]) => String(value ?? "")).join(" ");
  if (/\bsanuces\b|\b(?:women(?:['’]?s)?|womens|ladies)\s*(?:(?:self[\s-]*)?defen[cs]e|classes?|program|training)\b|\/womens-defense\b/i.test(values)) {
    return json({ error: "Women's Self-Defense inquiries and enrollment must go directly to Coach Dana at (667) 335-9592." }, 400);
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

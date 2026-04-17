export const prerender = false;

import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? {};
  const url = new URL(request.url);
  const date = url.searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(JSON.stringify({ error: "Invalid date" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const kv = env.BOOKINGS_KV;
  if (!kv) {
    return new Response(JSON.stringify({ bookedSlots: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { keys } = await kv.list({ prefix: `slot:${date}_` });
    const bookedSlots = (keys as { name: string }[]).map(
      (k) => k.name.split("_")[1]
    );
    return new Response(JSON.stringify({ bookedSlots }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ bookedSlots: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }
};

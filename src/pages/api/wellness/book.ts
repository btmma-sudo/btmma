export const prerender = false;

import type { APIRoute } from "astro";
import { wellnessBooking } from "../../../data/site";

const VALID_SERVICES = wellnessBooking.services as readonly string[];

function getTimeSlots(dateStr: string): string[] {
  const date = new Date(dateStr + "T00:00:00");
  const dow = date.getDay();
  if (dow === 0) return [];
  const slots: string[] = [];
  const endMin = dow === 6 ? 11 * 60 : 17 * 60;
  let t = 9 * 60;
  while (t + 45 <= endMin) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    t += 45;
  }
  return slots;
}

function formatDateTime(dateStr: string, time: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const dayStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dayStr} at ${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function ownerEmail(d: {
  service: string;
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
}): string {
  const dt = formatDateTime(d.date, d.time);
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#004d4d;margin-bottom:16px;">New Wellness Booking</h2>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 8px;color:#666;width:120px;">Service</td>
          <td style="padding:10px 8px;font-weight:600;">${d.service}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 8px;color:#666;">Date & Time</td>
          <td style="padding:10px 8px;font-weight:600;">${dt}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 8px;color:#666;">Name</td>
          <td style="padding:10px 8px;">${d.name}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 8px;color:#666;">Email</td>
          <td style="padding:10px 8px;">${d.email}</td>
        </tr>
        <tr>
          <td style="padding:10px 8px;color:#666;">Phone</td>
          <td style="padding:10px 8px;">${d.phone}</td>
        </tr>
      </table>
    </div>`;
}

function customerEmail(d: {
  service: string;
  date: string;
  time: string;
  name: string;
}): string {
  const dt = formatDateTime(d.date, d.time);
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#004d4d;">Your Booking is Confirmed</h2>
      <p style="color:#444;">Hi ${d.name}, your appointment at Burning Tree MMA has been booked.</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 8px;color:#666;width:120px;">Service</td>
          <td style="padding:10px 8px;font-weight:600;">${d.service}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 8px;color:#666;">Date & Time</td>
          <td style="padding:10px 8px;font-weight:600;">${dt}</td>
        </tr>
        <tr>
          <td style="padding:10px 8px;color:#666;">Duration</td>
          <td style="padding:10px 8px;">45 minutes · ${wellnessBooking.price}</td>
        </tr>
      </table>
      <p style="margin-top:20px;color:#888;font-size:13px;">
        Burning Tree MMA · 10210 S Dolfield Rd, Owings Mills, MD 21117
      </p>
    </div>`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? {};

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { date, time, service, name, email, phone } = body ?? {};

  if (!date || !time || !service || !name || !email || !phone) {
    return new Response(JSON.stringify({ error: "All fields are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!VALID_SERVICES.includes(service)) {
    return new Response(JSON.stringify({ error: "Invalid service" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate at least 3 days ahead
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 3);
  minDate.setHours(0, 0, 0, 0);
  const bookDate = new Date(date + "T00:00:00");
  if (bookDate < minDate) {
    return new Response(
      JSON.stringify({ error: "Date must be at least 3 days from today" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate time slot
  if (!getTimeSlots(date).includes(time)) {
    return new Response(JSON.stringify({ error: "Invalid time slot" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Send emails via Resend
  const resendKey = env.RESEND_API_KEY;
  if (resendKey) {
    const bookingData = { service, date, time, name, email, phone };

    await Promise.allSettled([
      // Owner notification
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Burning Tree MMA <noreply@burningtreemma.com>",
          to: wellnessBooking.notificationEmails,
          subject: `New ${service} Booking – ${formatDateTime(date, time)}`,
          html: ownerEmail(bookingData),
        }),
      }),
      // Customer confirmation
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Burning Tree MMA <noreply@burningtreemma.com>",
          to: [email],
          subject: `Your ${service} Appointment – Burning Tree MMA`,
          html: customerEmail({ service, date, time, name }),
        }),
      }),
    ]);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

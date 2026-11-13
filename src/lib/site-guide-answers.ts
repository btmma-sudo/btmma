import { GET as privateAvailability } from "../pages/api/private-lessons/availability.js";
import { allowedBookingWindow, clock, minutes } from "./private-lessons.js";
import { getPortalAccount, getPortalEnv } from "./student-portal-auth.js";
import { verifiedFamilyInvoices } from "./student-portal-tuition.js";
import { TUITION_BILLING_RELEASED } from "./tuition-billing-launch.js";

const portal = { url: "/student-portal/", label: "Open the Student Portal" };
const coach = { url: "/29-trial/#help-find-a-class", label: "Ask Coach David" };
const lessons = { url: "/private-lessons/#appointment-calendar", label: "Private lesson calendar" };
const parties = { url: "/birthday-parties/#birthday-reservations", label: "Request a birthday party date" };
const word = (value: string, pattern: RegExp) => pattern.test(value);

export async function verifiedGuideAnswer(question: string, topic: string, request: Request, locals: App.Locals) {
  const combined = question + " " + topic;
  const accountQuestion = word(question, /\b(my|our|i|we|me)\b/i);
  const payment = word(question, /\b(payment|paid|charge|charged|invoice|balance|owe|receipt|autopay)\b/i);
  if ((accountQuestion && payment) || word(question, /\b(payment status|outstanding balance|my student record|my belt rank|my child'?s rank|my child'?s record)\b/i)) {
    if (word(combined, /\b(trial|29|zelle|cash app|deposit|seminar|birthday party)\b/i)) {
      return { answer: "Open the registration or payment confirmation link from your email to check your status. For a direct Zelle or Cash App payment, Coach David confirms receipt before your registration is updated.", links: [coach] };
    }
    const env = getPortalEnv(locals);
    const account = await getPortalAccount(request, env);
    if (!account) return { answer: "Sign in to your Student Portal to check household information securely. If your balance or payment isn’t shown there, ask Coach David to verify it.", links: [portal, coach] };
    if (payment) {
      if (!TUITION_BILLING_RELEASED || env.STUDENT_PORTAL_PAYMENTS_ENABLED !== "true" ||
          !/^bpc_[A-Za-z0-9]+$/.test(env.STUDENT_PORTAL_STRIPE_PORTAL_CONFIGURATION_ID ?? "") ||
          !/^(sk|rk)_live_/.test(env.STRIPE_LIVE_SECRET_KEY ?? "") ||
          !/^cus_[A-Za-z0-9]+$/.test(account.stripe_customer_id ?? "")) {
        return { answer: "Online tuition verification isn’t available for this household. Coach David can confirm your exact balance and payment status.", links: [portal, coach] };
      }
      const url = new URL("https://api.stripe.com/v1/invoices");
      url.search = new URLSearchParams({ customer: account.stripe_customer_id, limit: "12" }).toString();
      const result = await fetch(url, { headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY }, signal: AbortSignal.timeout(5000) });
      if (!result.ok) return { answer: "I couldn’t verify your billing history right now.", links: [portal, coach] };
      const data = await result.json();
      const invoices: Array<{ balance: string; status: string }> = verifiedFamilyInvoices(data.data ?? [], account.stripe_customer_id);
      const latest = invoices[0];
      return {
        answer: latest ? "Your latest verified tuition invoice is " + latest.status + ", with a remaining balance of " + latest.balance + ". See your Student Portal for the full invoice list." : "I couldn’t find a verified tuition invoice for your household.",
        links: [portal, coach],
      };
    }
    const rows = await env.LIVE_TRIAL_DB.prepare(
      "SELECT program, belt_rank FROM portal_students WHERE account_id=? AND active=1 ORDER BY display_name LIMIT 12",
    ).bind(account.id).all();
    const training = (rows.results ?? []).map((row: { program?: string; belt_rank?: string }) =>
      [row.program, row.belt_rank].filter(Boolean).join(", "),
    ).filter(Boolean);
    return {
      answer: training.length ? "Your household’s training records show " + training.join("; ") + ". Open the portal to see the student associated with each record." : "I couldn’t find an active student record for this household.",
      links: [portal, coach],
    };
  }

  const availability = word(question, /\b(available|availability|openings?|spots?|seats?|room|full|open|space|capacity|booked|sold out)\b/i)
    || word(question, /\b(can i|can we|when can|is there)\b.*\b(book|schedule|reserve|join|sign up|get in|come|attend)\b/i);
  if (!availability) return;
  if (word(combined, /\b(private lessons?|private sessions?|one.on.one)\b/i)) {
    const calendar = await privateAvailability({ locals });
    if (!calendar.ok) return { answer: "The private lesson calendar isn’t available right now. Coach David can check openings for you.", links: [lessons, coach] };
    const { slots }: { slots: Array<{ date: string; time: string }> } = await calendar.json();
    const blocks = new Set(slots.map(slot => slot.date + " " + slot.time));
    const openings = slots.filter(({ date, time }) =>
      allowedBookingWindow(date, time, 60) && blocks.has(date + " " + clock(minutes(time) + 30)),
    );
    const date = question.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    const weekday = question.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/i)?.[1]?.toLowerCase();
    const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
    const timeLabel = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    const matching = openings.filter(slot =>
      (!date || slot.date === date) && (!weekday || dateLabel.format(new Date(slot.date + "T12:00:00Z")).toLowerCase().startsWith(weekday)),
    );
    const times = matching.slice(0, 3).map(slot =>
      dateLabel.format(new Date(slot.date + "T12:00:00Z")) + " at " + timeLabel.format(new Date(slot.date + "T" + slot.time + ":00Z")),
    );
    return {
      answer: times.length ? "The next published openings " + (date || weekday ? "matching that request are " : "are ") + times.join("; ") + " Eastern. The calendar rechecks the time when you book." : "There are no published 60-minute openings " + (date || weekday ? "matching that request." : "right now."),
      links: [lessons, coach],
    };
  }
  if (word(combined, /\b(birthday|party|parties)\b/i)) {
    return { answer: "Birthday party dates are confirmed by Coach David after checking the studio calendar and group size. Submit your preferred date and time through the party form.", links: [parties] };
  }
  if (word(combined, /\b(seminar|event|parents night out)\b/i)) {
    return { answer: "The event page lists current registration options. Coach David can confirm remaining seats or any last-minute changes.", links: [{ url: "/seminars/", label: "Seminars and events" }, coach] };
  }
  if (word(combined, /\b(studio rental|rent the studio|rent the space)\b/i)) {
    return { answer: "The studio reviews rental requests against the class and event schedule. Send your preferred date and time through the rental page for confirmation.", links: [{ url: "/studio-rental/", label: "Request studio availability" }, coach] };
  }
  if (word(combined, /\b(classes?|program|kenpo|wing chun|muay thai|open mat|seats?|spots?|room|full|capacity)\b/i)) {
    return { answer: "Coach David confirms whether there’s room in a specific class. Send your preferred class and day using Help Me Find a Class.", links: [{ url: "/#weekly-schedule", label: "Weekly class schedule" }, coach] };
  }
}

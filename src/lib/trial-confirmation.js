const day = 86400000;
const encoder = new TextEncoder();

export async function questionnaireAccessToken(secret, recordId, issuedAt = Date.now()) {
  if (!secret || !/^rec[A-Za-z0-9]{14}$/.test(recordId)) return null;
  const expires = String(issuedAt + 30 * day);
  const message = "btmma-questionnaire-v1|" + recordId + "|" + expires;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return "qt1." + recordId + "." + expires + "." +
    Array.from(mac, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function sendTrialConfirmation(env, { recordId, email, paid, issuedAt }) {
  if (!env.RESEND_API_KEY || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "")) return false;
  const referenceTime = Number.isSafeInteger(issuedAt) && issuedAt > Date.now() - 29 * day
    ? issuedAt : Math.floor(Date.now() / day) * day;
  const token = await questionnaireAccessToken(env.STRIPE_LIVE_WEBHOOK_SECRET, recordId, referenceTime);
  if (!token) return false;
  const url = "https://burningtreemma.com/29-trial/?view=goals#goals=" + token;
  const text = [
    paid
      ? "We verified your $29 trial payment for two beginner classes and a free uniform."
      : "We received your trial registration. Coach David will verify your $29 transfer before confirming your class.",
    "Coach David will contact you after payment is verified to confirm your first class. Please wait for his confirmation before coming in.",
    "Please complete your goals questionnaire before class so we can prepare for your visit." +
      (paid ? "" : " The link will open once your payment is verified."),
    url,
    "What to wear, where to go, and what to expect at your first class:",
    "https://burningtreemma.com/your-first-class/",
    "The $29 introductory special does not automatically start an ongoing membership or recurring tuition.",
    "Questions? Call (202) 368-4395.",
    "Coach David\nBurning Tree Mixed Martial Arts\nOne Tree. One Family."
  ].join("\n\n");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "trial-confirmation/" + recordId + "/" + (paid ? "paid" : "manual")
      },
      body: JSON.stringify({
        from: "Burning Tree MMA <noreply@burningtreemma.com>",
        reply_to: "info@burningtreemma.com",
        to: [email],
        subject: paid ? "Your Burning Tree $29 trial payment is verified" : "Your Burning Tree trial registration was received",
        text
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) console.warn("Trial confirmation email rejected", { status: response.status });
    return response.ok;
  } catch {
    console.warn("Trial confirmation email unavailable");
    return false;
  }
}

// Transactional acknowledgment for a saved website inquiry.
// Acknowledging a request is not an enrollment, booking, or marketing subscription.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const recordPattern = /^rec[A-Za-z0-9]{14}$/;

export async function sendInquiryAcknowledgement(env, { email, recordId }) {
  if (!env?.RESEND_API_KEY || !emailPattern.test(String(email || "")) ||
      !recordPattern.test(String(recordId || ""))) return false;

  const body = [
    "Thank you for reaching out to Burning Tree Mixed Martial Arts.",
    "We received your request. Coach David or a member of our team will follow up to help you find the right class.",
    "If you are preparing for a first visit, our guide explains what to wear and what to expect:",
    "https://burningtreemma.com/your-first-class/",
    "Submitting an inquiry does not book a class or create a paid membership.",
    "Questions? Call (202) 368-4395 or reply to this email.",
    "Coach David\nBurning Tree Mixed Martial Arts\nOne Tree. One Family."
  ].join("\n\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "btmma-inquiry-received/" + recordId
      },
      body: JSON.stringify({
        from: "Burning Tree MMA <noreply@burningtreemma.com>",
        reply_to: "info@burningtreemma.com",
        to: [email],
        subject: "We received your Burning Tree inquiry",
        text: body
      }),
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) console.warn("Inquiry acknowledgment not accepted", { status: response.status });
    return response.ok;
  } catch {
    console.warn("Inquiry acknowledgment email unavailable");
    return false;
  }
}

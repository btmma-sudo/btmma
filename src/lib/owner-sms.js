const messages = {
  inquiry: "Burning Tree: New website inquiry saved. Check Lead CRM to follow up.",
  trialPaid: "Burning Tree: A $29 trial payment was confirmed. Check Lead CRM to follow up."
};

export async function sendOwnerSms(env, kind) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, OWNER_SMS_TO } = env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_SMS_FROM || !OWNER_SMS_TO) return;

  try {
    const response = await fetch(
      "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(TWILIO_ACCOUNT_SID) + "/Messages.json",
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ From: TWILIO_SMS_FROM, To: OWNER_SMS_TO, Body: messages[kind] }),
        signal: AbortSignal.timeout(4000)
      }
    );
    if (!response.ok) console.warn("Owner SMS rejected", { kind, status: response.status });
  } catch {
    console.warn("Owner SMS request failed", { kind });
  }
}

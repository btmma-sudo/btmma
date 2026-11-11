const messages = {
  inquiry: "Burning Tree: New website inquiry saved. Check Lead CRM to follow up.",
  trialPaid: "Burning Tree: A $29 trial payment was confirmed. Check Lead CRM to follow up."
};

function twilioCredentials(env) {
  return {
    accountSid: String(env.TWILIO_ACCOUNT_SID ?? "").trim(),
    authToken: String(env.TWILIO_AUTH_TOKEN ?? "").trim()
  };
}

function twilioAccountUrl(accountSid) {
  return "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(accountSid);
}

function twilioAuthorization(accountSid, authToken) {
  return "Basic " + btoa(accountSid + ":" + authToken);
}

async function twilioErrorCode(response) {
  const error = await response.json().catch(() => null);
  return Number.isInteger(error?.code) ? error.code : null;
}

export async function checkOwnerSmsAuthentication(env) {
  const { accountSid, authToken } = twilioCredentials(env);
  const configured = {
    accountSid: /^AC[a-f0-9]{32}$/i.test(accountSid),
    authToken: Boolean(authToken),
    sender: /^\+[1-9]\d{1,14}$/.test(String(env.TWILIO_SMS_FROM ?? "").trim()),
    recipient: /^\+[1-9]\d{1,14}$/.test(String(env.OWNER_SMS_TO ?? "").trim())
  };
  if (!configured.accountSid || !configured.authToken) {
    return { authenticated: false, configured, status: null, twilioCode: null };
  }

  try {
    const response = await fetch(twilioAccountUrl(accountSid) + ".json", {
      headers: { Authorization: twilioAuthorization(accountSid, authToken) },
      redirect: "error",
      signal: AbortSignal.timeout(4000)
    });
    const twilioCode = response.ok ? null : await twilioErrorCode(response);
    return { authenticated: response.ok, configured, status: response.status, twilioCode };
  } catch {
    return { authenticated: false, configured, status: null, twilioCode: null, networkError: true };
  }
}

export async function sendOwnerSms(env, kind) {
  const { accountSid, authToken } = twilioCredentials(env);
  const from = String(env.TWILIO_SMS_FROM ?? "").trim();
  const to = String(env.OWNER_SMS_TO ?? "").trim();
  if (!accountSid || !authToken || !from || !to) return;

  try {
    const response = await fetch(
      twilioAccountUrl(accountSid) + "/Messages.json",
      {
        method: "POST",
        headers: {
          Authorization: twilioAuthorization(accountSid, authToken),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ From: from, To: to, Body: messages[kind] }),
        redirect: "error",
        signal: AbortSignal.timeout(4000)
      }
    );
    if (!response.ok) {
      console.warn("Owner SMS rejected", {
        kind,
        status: response.status,
        twilioCode: await twilioErrorCode(response)
      });
    }
  } catch {
    console.warn("Owner SMS request failed", { kind });
  }
}

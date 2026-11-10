// Safe status-only categorization of Resend API errors.
// Do not include provider request/response bodies, email addresses,
// authentication headers or one-time setup links in browser messages or logs.
export function classifyOwnerInviteEmailFailure(status, provider={}) {
  const code=typeof provider?.name==="string" && /^[a-z][a-z0-9_]{0,48}$/i.test(provider.name)
    ? provider.name.toLowerCase() : "unknown";
  let message;
  if(status===401) {
    message="The email service rejected the configured API key (HTTP 401). The studio needs to review its Resend API key.";
  } else if(status===403){
    message="The email service denied sending (HTTP 403). Check Resend Logs, the verified burningtreemma.com sending domain, and API key permissions.";
  } else if(status===422 || status===400){
    message="The email service rejected the sender or request settings (HTTP "+status+"). Check Resend Logs and sending-domain verification.";
  } else if(status===429){
    message="The email service is rate-limiting messages (HTTP 429). Please retry later.";
  } else if(status>=500 && status<=599){
    message="The email provider is temporarily unavailable (HTTP "+status+"). Please retry later.";
  } else {
    message="The email provider did not accept the setup message (HTTP "+String(Number(status)||"unknown")+"). Check Resend Logs.";
  }
  return {code,message};
}

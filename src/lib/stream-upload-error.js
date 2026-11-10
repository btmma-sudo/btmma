// Give instructors actionable Cloudflare Stream API diagnostics without
// copying provider error messages, URLs, tokens or request bodies into the UI.
// The numeric Cloudflare error code is allowed; raw provider messages are not.
export function streamDirectUploadFailure(status, payload) {
  const httpStatus=Number.isInteger(status) && status>=100 && status<=599 ? status : 0;
  const item=Array.isArray(payload?.errors) ? payload.errors[0] : null;
  const numeric=Number(item?.code);
  const apiCode=(typeof item?.code==="number" || typeof item?.code==="string") &&
    Number.isInteger(numeric) && numeric>=1 && numeric<=999999 ? numeric : null;
  let description;
  switch(httpStatus) {
    case 400:
    case 422:
      description="Cloudflare rejected the video upload request. Check the Stream account's settings and video storage availability.";
      break;
    case 401:
      description="Cloudflare rejected authorization for Stream. Check that the encrypted Stream API token is current and correctly copied.";
      break;
    case 403:
      description="Cloudflare denied Stream access. Ensure the API token has Account → Media → Stream → Edit permission for the same Cloudflare account as your Account ID.";
      break;
    case 402:
    case 409:
    case 413:
      description="Cloudflare did not accept the storage reservation or upload request. Check the Stream plan, available video minutes, and account limits.";
      break;
    case 429:
      description="Cloudflare is limiting Stream API requests. Retry later.";
      break;
    default:
      description=httpStatus>=500
        ? "Cloudflare Stream is temporarily unavailable. Retry later."
        : "Cloudflare Stream rejected the private upload request. Check the token's Stream permissions and video storage plan.";
  }
  const marker="HTTP "+(httpStatus||"unknown")+
    (apiCode!==null?", Cloudflare error code "+apiCode:"");
  return {httpStatus,apiCode,
    message:description+" ("+marker+"). No lesson was published. If the issue persists, share only this HTTP status and numeric error code."};
}

// Pure billing display helpers. Stripe remains the source of truth for invoices.
// No Stripe mutation or collection action is performed by this module.
const usd = new Intl.NumberFormat("en-US", {style:"currency", currency:"USD"});
const date = new Intl.DateTimeFormat("en-US", {
  timeZone:"America/New_York", year:"numeric", month:"short", day:"numeric"
});

export function trustedHostedInvoiceUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "invoice.stripe.com" ||
        url.port || url.username || url.password || !url.pathname.startsWith("/i/"))
      return "";
    return url.toString();
  } catch { return ""; }
}

export function verifiedFamilyInvoices(data, customerId) {
  if (!/^cus_[A-Za-z0-9]+$/.test(String(customerId || "")) || !Array.isArray(data)) return [];
  return data.filter(invoice =>
    invoice && invoice.livemode === true &&
    invoice.customer === customerId &&
    invoice.currency === "usd" &&
    ["draft","open","paid","void","uncollectible"].includes(invoice.status)
  ).slice(0, 12).map(invoice => {
    const remaining = Number(invoice.amount_remaining);
    const cents = Number.isSafeInteger(remaining) && remaining >= 0 ? remaining : 0;
    const due = Number.isSafeInteger(invoice.due_date) && invoice.due_date > 0
      ? date.format(new Date(invoice.due_date * 1000)) : "See invoice";
    return {
      number: String(invoice.number || "Invoice").slice(0, 60),
      due,
      balance: usd.format(cents / 100),
      status: invoice.status,
      // Stripe's hosted URL belongs to this *verified* live household invoice.
      payNowUrl: invoice.status === "open" && cents > 0
        ? trustedHostedInvoiceUrl(invoice.hosted_invoice_url) : ""
    };
  });
}

// Only describe 28-day AutoPay when Stripe actually reports an active,
// correctly configured four-week subscription for the signed-in household.
export function verifiedAutopay(data, customerId) {
  if (!Array.isArray(data) || !/^cus_[A-Za-z0-9]+$/.test(String(customerId || "")))
    return {active:false, nextBillingDate:""};
  const matches = data.filter(subscription =>
    subscription?.livemode === true &&
    subscription.customer === customerId &&
    subscription.status === "active" &&
    Array.isArray(subscription.items?.data) &&
    subscription.items.data.some(item => item.price?.recurring?.interval === "week" &&
      item.price?.recurring?.interval_count === 4)
  );
  const periodEnds = matches.flatMap(s => s.items.data.filter(i =>
    i.price?.recurring?.interval === "week" &&
    i.price?.recurring?.interval_count === 4
  ).map(i => i.current_period_end || s.current_period_end).filter(ts =>
    Number.isSafeInteger(ts) && ts > 0));
  const nextPeriodEnd = periodEnds.length ? Math.min(...periodEnds) : null;
  return {
    active: matches.length > 0,
    nextBillingDate: nextPeriodEnd ? date.format(new Date(nextPeriodEnd * 1000)) : ""
  };
}

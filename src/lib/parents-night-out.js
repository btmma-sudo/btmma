// Parents' Night Out payment reconciliation. Verified Stripe-only changes to a separate Airtable table.
export const PNO_TABLE = "tbli3fUIKIUCv5R2Y";
export const PNO_SOURCE = "btmma_parents_night_out_2026_v1";
export const PNO_UNIT_CENTS = 3500;
export const PNO_EVENT = "Parents' Night Out — November 20, 2026";

export async function pnoAirtable(env, path = "", method = "GET", data = undefined) {
  const result = await fetch(
    "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" + PNO_TABLE + path,
    {
      method,
      headers: { Authorization: "Bearer " + env.AIRTABLE_API_TOKEN, "Content-Type": "application/json" },
      ...(data ? { body: JSON.stringify(data) } : {})
    }
  );
  if (!result.ok) {
    console.error("PNO Airtable operation failed", { method, status: result.status });
    throw new Error("Event registration record could not be verified.");
  }
  return result.json();
}

// Verify authoritative Stripe data AND the record created before checkout.
// Can safely be retried by webhook or confirmation page without double fulfillment.
export async function reconcilePnoPayment(env, sessionId, failed = false) {
  if (!/^cs_live_[A-Za-z0-9_]{10,180}$/.test(sessionId || "") ||
      !env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID ||
      !/^(sk|rk)_live_/.test(String(env.STRIPE_LIVE_SECRET_KEY || "")))
    throw new Error("Payment verification is unavailable.");
  const stripeResponse = await fetch(
    "https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId),
    { headers: { Authorization: "Bearer " + env.STRIPE_LIVE_SECRET_KEY } }
  );
  if (!stripeResponse.ok) throw new Error("Stripe verification is unavailable.");
  const session = await stripeResponse.json();
  const meta = session.metadata || {};
  const recordId = meta.registration_id;
  const count = Number(meta.child_count);
  if (session.livemode !== true || session.mode !== "payment" ||
      session.currency !== "usd" || meta.btmma_source !== PNO_SOURCE ||
      !/^rec[A-Za-z0-9]{10,30}$/.test(recordId || "") ||
      !Number.isInteger(count) || count < 1 || count > 6 ||
      session.client_reference_id !== recordId ||
      session.amount_total !== PNO_UNIT_CENTS * count)
    throw new Error("This payment does not match a Parents' Night Out registration.");

  const record = await pnoAirtable(env, "/" + encodeURIComponent(recordId));
  const fields = record.fields || {};
  if (fields.Event !== PNO_EVENT || fields["Event Date"] !== "2026-11-20" ||
      fields["Stripe Checkout Session ID"] !== sessionId ||
      Number(fields["Child Count"]) !== count ||
      Math.round(Number(fields["Total Due"]) * 100) !== PNO_UNIT_CENTS * count ||
      String(fields["Guardian Email"] || "").toLowerCase() !== String(session.customer_details?.email || session.customer_email || "").toLowerCase())
    throw new Error("Checkout and event registration details do not match.");

  if (session.payment_status === "paid") {
    if (fields["Payment Status"] !== "Paid") {
      await pnoAirtable(env, "/" + encodeURIComponent(recordId), "PATCH", {
        fields: {
          "Payment Status": "Paid",
          "Stripe Payment Intent ID": typeof session.payment_intent === "string" ? session.payment_intent : "",
          "Paid At": new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString()
        }
      });
    }
    return { confirmed: true, count, amountCents: PNO_UNIT_CENTS * count };
  }
  if (failed && fields["Payment Status"] !== "Paid") {
    await pnoAirtable(env, "/" + encodeURIComponent(recordId), "PATCH",
      { fields: { "Payment Status": "Payment failed" } });
  }
  return { confirmed: false, pending: true, count, amountCents: PNO_UNIT_CENTS * count };
}

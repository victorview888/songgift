import { HttpError } from "@/lib/auth/server";
import { recordVerifiedCapture, usdMinor, type Quote } from "@/lib/services/order-operations";

type Environment = Quote["payment_environment"];
type Payload = {
  id?: string; status?: string; links?: { rel?: string; href?: string }[];
  purchase_units?: { custom_id?: string; amount?: { currency_code?: string; value?: string };
    payments?: { captures?: { id?: string; status?: string; final_capture?: boolean; create_time?: string; amount?: { currency_code?: string; value?: string } }[] } }[];
};
function base(environment: Environment) {
  return environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}
async function accessToken(environment: Environment) {
  const clientId = environment === "live" ? process.env.PAYPAL_LIVE_CLIENT_ID : process.env.PAYPAL_CLIENT_ID;
  const secret = environment === "live" ? process.env.PAYPAL_LIVE_CLIENT_SECRET : process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new HttpError(503, "Checkout is temporarily unavailable. Your order is saved.");
  const response = await fetch(base(environment) + "/v1/oauth2/token", {
    method: "POST", headers: { Authorization: "Basic " + Buffer.from(clientId + ":" + secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new HttpError(502, "Payment verification is temporarily unavailable.");
  const data = await response.json();
  if (typeof data.access_token !== "string" || !data.access_token) throw new HttpError(502, "Payment verification is temporarily unavailable.");
  return data.access_token as string;
}
function amountMatches(value: string | undefined, expected: number) {
  try { return typeof value === "string" && usdMinor(value) === expected; } catch { return false; }
}
function assertMatches(payload: Payload, paypalOrderId: string, quote: Quote) {
  const unit = payload.purchase_units?.[0];
  if (payload.id !== paypalOrderId || payload.purchase_units?.length !== 1 || unit?.custom_id !== quote.id || unit.amount?.currency_code !== quote.currency || !amountMatches(unit.amount?.value, quote.quoted_amount_minor)) {
    throw new HttpError(409, "PayPal payment does not match this song order. Your order is saved for review.");
  }
}
function approval(payload: Payload, environment: Environment) {
  const href = payload.links?.find(link => link.rel === "approve" || link.rel === "payer-action")?.href;
  try {
    const url = new URL(href || "");
    const host = environment === "live" ? "www.paypal.com" : "www.sandbox.paypal.com";
    if (url.protocol === "https:" && url.hostname === host && !url.username && !url.password) return url.toString();
  } catch {}
  throw new HttpError(409, "This checkout cannot be reopened. Your order is saved for assistance.");
}
async function readOrder(paypalOrderId: string, quote: Quote, token: string): Promise<Payload> {
  const response = await fetch(base(quote.payment_environment) + "/v2/checkout/orders/" + encodeURIComponent(paypalOrderId), {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new HttpError(502, "Could not verify the PayPal order. Please try again.");
  const payload = await response.json() as Payload;
  assertMatches(payload, paypalOrderId, quote);
  return payload;
}
export async function createPayPalOrder(quote: Quote, urls: { returnUrl: string; cancelUrl: string }, existingId?: string | null) {
  const token = await accessToken(quote.payment_environment);
  if (existingId) {
    const existing = await readOrder(existingId, quote, token);
    if (existing.status === "COMPLETED") return { id: existingId, completed: true };
    return { id: existingId, approvalUrl: approval(existing, quote.payment_environment) };
  }
  const response = await fetch(base(quote.payment_environment) + "/v2/checkout/orders", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Request-Id": "sg-create-" + quote.id },
    body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ custom_id: quote.id, description: "Personalized SongGift song", amount: { currency_code: quote.currency, value: (quote.quoted_amount_minor / 100).toFixed(2) } }],
      application_context: { brand_name: process.env.PAYPAL_BRAND_NAME || "SongGift", user_action: "PAY_NOW", return_url: urls.returnUrl, cancel_url: urls.cancelUrl } }),
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new HttpError(502, "Could not open PayPal checkout. Please try again.");
  const payload = await response.json() as Payload;
  if (!payload.id || payload.id.length > 128) throw new HttpError(502, "Could not open PayPal checkout. Please try again.");
  assertMatches(payload, payload.id, quote);
  if (payload.status === "COMPLETED") return { id: payload.id, completed: true };
  return { id: payload.id, approvalUrl: approval(payload, quote.payment_environment) };
}
export async function capturePayPalOrder(paypalOrderId: string, owner: { userId: string; quote: Quote }) {
  const { quote } = owner;
  const token = await accessToken(quote.payment_environment);
  let payload = await readOrder(paypalOrderId, quote, token);
  if (payload.status !== "COMPLETED") {
    if (payload.status !== "APPROVED") throw new HttpError(409, "Please approve this payment in PayPal first.");
    try {
      await fetch(base(quote.payment_environment) + "/v2/checkout/orders/" + encodeURIComponent(paypalOrderId) + "/capture", {
        method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Request-Id": "sg-capture-" + quote.id },
        body: "{}", cache: "no-store", signal: AbortSignal.timeout(20_000),
      });
    } catch { /* Read the authoritative order after an uncertain network result. */ }
    payload = await readOrder(paypalOrderId, quote, token);
  }
  const captures = payload.purchase_units?.[0]?.payments?.captures;
  const capture = captures?.[0];
  if (payload.status !== "COMPLETED" || captures?.length !== 1 || capture?.status !== "COMPLETED" || capture.final_capture !== true || !capture.id || capture.id.length > 128 ||
      capture.amount?.currency_code !== quote.currency || !amountMatches(capture.amount?.value, quote.quoted_amount_minor) || !capture.create_time || !Number.isFinite(Date.parse(capture.create_time))) {
    throw new HttpError(409, "PayPal payment was not completed with matching capture evidence. Your order is saved for review.");
  }
  await recordVerifiedCapture({ orderId: quote.id, userId: owner.userId, paypalOrderId, captureId: capture.id, environment: quote.payment_environment,
    amountMinor: quote.quoted_amount_minor, currency: quote.currency, occurredAt: new Date(capture.create_time).toISOString() });
  return { orderId: quote.id, paypalOrderId };
}

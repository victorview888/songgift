import "server-only";
import { createHash } from "node:crypto";
import { WaffoPancake, TaxCategory, verifyWebhook } from "@waffo/pancake-ts";
import { HttpError } from "@/lib/http-error";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { usdMinor } from "@/lib/services/order-operations";
import { isOrderId } from "@/lib/supabase/orders";
import { isWaffoConfigured, waffoEnvironment } from "./methods";

type Checkout = {
  id: string; order_id: string; user_id: string; environment: "live" | "sandbox";
  store_id: string; product_id: string; amount_minor: number; currency: string;
  buyer_email: string; success_url: string; state: string;
  checkout_url: string | null; session_id: string | null; expires_at: string;
};
async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseAdmin().rpc(name, params);
  if (error || !data) {
    if (error?.message === "order_not_found") throw new HttpError(404, "Payment order not found.");
    if (["payment_mismatch", "payment_needs_review", "already_paid"].includes(error?.message || "")) throw new HttpError(409, "This payment needs verification. Your order is saved; please check its payment status.");
    throw new HttpError(503, "Payment confirmation is temporarily unavailable. Please try again shortly.");
  }
  return data as T;
}
export function safeWaffoCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && ["pancake.waffo.ai", "checkout.waffo.ai"].includes(url.hostname) && !url.username && !url.password && !url.port) return url.toString();
  } catch {}
  throw new HttpError(502, "Waffo checkout is temporarily unavailable. Your order is saved.");
}
export async function openWaffoCheckout(orderId: string, userId: string, email: string, origin: string) {
  if (!isWaffoConfigured()) throw new HttpError(503, "Waffo is currently unavailable. Please choose another payment method.");
  const site = new URL(process.env.SONGGIFT_SITE_URL || origin);
  if (site.protocol !== "https:") throw new HttpError(503, "Secure checkout is temporarily unavailable.");
  const mode = waffoEnvironment()!;
  const checkout = await rpc<Checkout>("begin_songgift_waffo_checkout", {
    p_order_id: orderId, p_user_id: userId, p_environment: mode === "prod" ? "live" : "sandbox",
    p_store_id: process.env.WAFFO_STORE_ID, p_product_id: process.env.WAFFO_PRODUCT_ID,
    p_email: email, p_success_url: new URL("/lyrics/" + orderId, site.origin).toString(),
  });
  if (checkout.state === "paid") return { alreadyPaid: true, orderId };
  if (checkout.state !== "creating" && checkout.state !== "ready") throw new HttpError(409, "This checkout needs verification. Please check the payment status.");
  if (checkout.checkout_url) return { checkoutUrl: safeWaffoCheckoutUrl(checkout.checkout_url), checkoutId: checkout.id };
  try {
    const client = new WaffoPancake({
      merchantId: process.env.WAFFO_MERCHANT_ID!, privateKey: process.env.WAFFO_PRIVATE_KEY!,
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
    });
    // Reject a subscription product before creating a payment link.
    const product = await client.graphql.query<{ onetimeProduct: { id: string; status: string } | null }>({
      query: "query($id: String!) { onetimeProduct(id: $id) { id status } }", variables: { id: checkout.product_id },
    });
    if (product.errors?.length || product.data?.onetimeProduct?.id !== checkout.product_id || product.data.onetimeProduct.status !== "active") throw new HttpError(503, "This payment option is temporarily unavailable.");
    const success = new URL(checkout.success_url);
    success.searchParams.set("payment", "waffo"); success.searchParams.set("checkout", checkout.id);
    // The documented REST taxIncluded field is not yet declared by SDK 0.28.0.
    const priceSnapshot = { amount: (checkout.amount_minor / 100).toFixed(2), taxIncluded: true, taxCategory: TaxCategory.DigitalGoods };
    const session = await client.checkout.createSession({
      productId: checkout.product_id, currency: checkout.currency,
      priceSnapshot,
      buyerEmail: checkout.buyer_email, successUrl: success.toString(), expiresInSeconds: 3600,
      orderMerchantExternalId: checkout.id, metadata: { songgiftOrderId: checkout.order_id }, allowPromotionCodes: false,
    }, { idempotencyKey: "songgift-waffo-" + checkout.id });
    const url = safeWaffoCheckoutUrl(session.checkoutUrl), expires = Date.parse(session.expiresAt);
    if (!session.sessionId || !Number.isFinite(expires) || expires <= Date.now()) throw new HttpError(502, "This checkout has expired. Please try again.");
    const bound = await rpc<Checkout>("bind_songgift_waffo_checkout", { p_checkout_id: checkout.id, p_user_id: userId, p_session_id: session.sessionId, p_url: url, p_expires_at: session.expiresAt });
    if (bound.state === "paid") return { alreadyPaid: true, orderId };
    if (bound.state !== "ready") throw new HttpError(409, "This checkout needs verification. Please check the payment status.");
    return { checkoutUrl: url, checkoutId: checkout.id };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // The provider may have accepted a request whose response was lost. The saved
    // checkout ID and SDK idempotency key stay the same on a retry.
    throw new HttpError(503, "Waffo checkout is temporarily unavailable. Your order is saved; please try again.");
  }
}

function field(value: unknown, pattern = /^[A-Za-z0-9_-]{5,128}$/) {
  if (typeof value !== "string" || !pattern.test(value)) throw new HttpError(400, "Invalid payment event.");
  return value;
}
export async function handleWaffoWebhook(raw: string, signature: string) {
  const mode = waffoEnvironment();
  if (!mode) throw new HttpError(503, "Payment notifications are temporarily unavailable.");
  let event;
  try {
    event = verifyWebhook<Record<string, unknown>>(raw, signature, {
      environment: mode, ...(process.env.WAFFO_WEBHOOK_PUBLIC_KEY ? { publicKey: process.env.WAFFO_WEBHOOK_PUBLIC_KEY } : {}),
    });
  } catch { throw new HttpError(401, "Invalid payment signature."); }
  if (event.mode !== mode) throw new HttpError(400, "Payment environment mismatch.");
  if (!["order.completed", "refund.succeeded"].includes(event.eventType)) return { outcome: "ignored" };
  const data = event.data;
  // This endpoint may receive other products from the same merchant store.
  if (!data?.orderMerchantExternalId || !isOrderId(String(data.orderMerchantExternalId))) return { outcome: "ignored" };
  const refund = event.eventType === "refund.succeeded";
  if ((refund ? data.refundStatus : data.paymentStatus) !== "succeeded" || (!refund && data.orderStatus !== "completed")) throw new HttpError(400, "Payment has not completed.");
  const amount = refund ? data.refundedAmount : data.chargedAmount;
  // Missing authoritative amounts never fall back to a quote or deprecated total.
  if (typeof amount !== "string" || data.currency !== "USD") throw new HttpError(400, "Payment amount needs verification.");
  const occurredAt = new Date(event.timestamp);
  if (!Number.isFinite(occurredAt.getTime())) throw new HttpError(400, "Invalid payment timestamp.");
  return rpc<{ outcome: string; replayed?: boolean }>("record_songgift_waffo_event", {
    p_checkout_id: String(data.orderMerchantExternalId), p_environment: mode === "prod" ? "live" : "sandbox",
    p_store_id: field(event.storeId), p_event_type: event.eventType, p_event_id: field(event.eventId),
    p_payload_hash: createHash("sha256").update(raw).digest("hex"), p_payment_id: field(data.paymentId),
    p_provider_order_id: field(data.orderId), p_amount_minor: usdMinor(amount), p_currency: data.currency,
    p_occurred_at: occurredAt.toISOString(),
  });
}

export async function waffoPaymentStatus(orderId: string, userId: string, checkoutId: string) {
  if (!isOrderId(orderId) || !isOrderId(checkoutId)) throw new HttpError(404, "Payment order not found.");
  const db = getSupabaseAdmin();
  const checkout = await db.from("waffo_checkouts").select("id,state,expires_at").eq("id", checkoutId).eq("order_id", orderId).eq("user_id", userId).maybeSingle();
  if (checkout.error) throw new HttpError(503, "Payment confirmation is temporarily unavailable.");
  if (!checkout.data) throw new HttpError(404, "Payment order not found.");
  const order = await db.from("song_orders").select("paid_at,status").eq("id", orderId).eq("user_id", userId).maybeSingle();
  if (order.error || !order.data) throw new HttpError(503, "Payment confirmation is temporarily unavailable.");
  const transactions = await db.from("payment_transactions").select("transaction_type,amount_minor").eq("order_id", orderId).eq("provider", "waffo");
  if (transactions.error || !transactions.data) throw new HttpError(503, "Payment confirmation is temporarily unavailable.");
  const captured = transactions.data.find(t => t.transaction_type === "capture")?.amount_minor;
  const refunded = transactions.data.filter(t => t.transaction_type === "refund").reduce((sum, t) => sum + t.amount_minor, 0);
  const state = captured && refunded >= captured ? "refunded" : ["creating", "ready"].includes(checkout.data.state) && Date.parse(checkout.data.expires_at) <= Date.now() ? "expired" : checkout.data.state;
  return { orderId, state, paid: state === "paid" && !!order.data.paid_at };
}

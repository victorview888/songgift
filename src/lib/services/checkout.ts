import "server-only";
import type { User } from "@supabase/supabase-js";
import { HttpError } from "@/lib/http-error";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isOrderId } from "@/lib/supabase/orders";
import { prepareOrderQuote, type Quote } from "./order-operations";

export type PaymentOrder = {
  id: string; paypal_order_id: string | null; paid_at: string | null; quoted_at: string | null;
  quoted_amount_minor: number | null; currency: string | null; payment_environment: string | null; price_version: string | null;
};
export const paymentColumns = "id,paypal_order_id,paid_at,quoted_at,quoted_amount_minor,currency,payment_environment,price_version";
export async function getPaymentOrder(id: string, userId: string, byPayPal = false): Promise<PaymentOrder> {
  if ((!byPayPal && !isOrderId(id)) || !id || id.length > 128) throw new HttpError(404, "Payment order not found.");
  const { data, error } = await getSupabaseAdmin().from("song_orders").select(paymentColumns).eq(byPayPal ? "paypal_order_id" : "id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(503, "Checkout records are temporarily unavailable.");
  if (!data) throw new HttpError(404, "Payment order not found.");
  return data as PaymentOrder;
}
export function storedQuote(order: PaymentOrder): Quote {
  if (!order.quoted_at || !Number.isSafeInteger(order.quoted_amount_minor) || order.quoted_amount_minor! <= 0 || order.currency !== "USD" ||
      !order.price_version || !["live", "sandbox"].includes(order.payment_environment || "")) {
    throw new HttpError(409, "This historical checkout needs payment verification. Your order is saved for assistance.");
  }
  return { id: order.id, quoted_at: order.quoted_at, quoted_amount_minor: order.quoted_amount_minor!, currency: "USD", payment_environment: order.payment_environment as Quote["payment_environment"], price_version: order.price_version };
}
export async function checkoutQuote(order: PaymentOrder, user: Pick<User, "id" | "email" | "email_confirmed_at">) {
  return order.quoted_at ? storedQuote(order) : prepareOrderQuote(order.id, user);
}
export function publicPrice(quote: Quote) {
  return { currencyCode: quote.currency, value: (quote.quoted_amount_minor / 100).toFixed(2) };
}

import "server-only";
import { HttpError } from "@/lib/http-error";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isOrderId } from "@/lib/supabase/orders";
import type { CustomerPayment, CustomerPaymentsPage } from "@/lib/types/payments";

const columns = "id,title,recipient_name,created_at,paid_at,quoted_amount_minor,currency,payment_environment,quoted_at,payment_transactions(id,provider,transaction_type,external_id,environment,amount_minor,currency,occurred_at)";
type Row = {
  id: string; title: string | null; recipient_name: string; created_at: string; paid_at: string | null;
  quoted_amount_minor: number | null; currency: string | null; payment_environment: "sandbox" | "live" | null; quoted_at: string | null;
  payment_transactions: { id: string; provider: "paypal" | "waffo"; transaction_type: "capture" | "refund"; external_id: string; environment: "sandbox" | "live"; amount_minor: number; currency: string; occurred_at: string }[];
};
function project(row: Row): CustomerPayment {
  return {
    orderId: row.id, title: row.title, recipientName: row.recipient_name, createdAt: row.created_at, paidAt: row.paid_at,
    quote: row.quoted_amount_minor !== null && row.currency && row.payment_environment && row.quoted_at ? { amountMinor: row.quoted_amount_minor, currency: row.currency, environment: row.payment_environment, quotedAt: row.quoted_at } : null,
    transactions: row.payment_transactions.slice(0, 50).map(t => ({ id: t.id, provider: t.provider, type: t.transaction_type, externalId: t.external_id, environment: t.environment, amountMinor: t.amount_minor, currency: t.currency, occurredAt: t.occurred_at })),
    historyTruncated: row.payment_transactions.length > 50,
  };
}
function baseQuery(userId: string) {
  // Always constrain the privileged read to the verified account. No stories,
  // lyrics, fees, provider payloads or admin notes enter this projection.
  return getSupabaseAdmin().from("song_orders").select(columns, { count: "exact" }).eq("user_id", userId)
    .order("occurred_at", { referencedTable: "payment_transactions", ascending: false })
    .order("id", { referencedTable: "payment_transactions", ascending: false }).limit(51, { referencedTable: "payment_transactions" });
}
export async function listCustomerPayments(userId: string, pageValue: string | null): Promise<CustomerPaymentsPage> {
  if (pageValue !== null && (!/^\d{1,5}$/.test(pageValue) || Number(pageValue) > 10000)) throw new HttpError(400, "Please choose a valid payment-history page.");
  const page = Number(pageValue || 0), pageSize = 10;
  const result = await baseQuery(userId).or("paid_at.not.is.null,quoted_at.not.is.null")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
  if (result.error || !result.data || result.count === null) throw new HttpError(503, "Your payment records are temporarily unavailable. Please try again.");
  return { orders: (result.data as unknown as Row[]).map(project), total: result.count, page, pageSize };
}
export async function getCustomerPayment(userId: string, id: string): Promise<CustomerPayment> {
  if (!isOrderId(id)) throw new HttpError(404, "Order payment record not found.");
  const result = await baseQuery(userId).eq("id", id).maybeSingle();
  if (result.error) throw new HttpError(503, "Your payment record is temporarily unavailable. Please try again.");
  if (!result.data) throw new HttpError(404, "Order payment record not found.");
  return project(result.data as unknown as Row);
}

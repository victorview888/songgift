import "server-only";
import { HttpError } from "@/lib/http-error";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
export async function assertPayPalCaptureAllowed(orderId: string, userId: string) {
  const db = getSupabaseAdmin();
  const order = await db.from("song_orders").select("id,paid_at").eq("id", orderId).eq("user_id", userId).maybeSingle();
  if (order.error || !order.data) throw new HttpError(503, "Payment verification is temporarily unavailable.");
  if (!order.data.paid_at) return;
  const capture = await db.from("payment_transactions").select("provider").eq("order_id", orderId).eq("transaction_type", "capture").maybeSingle();
  if (capture.error) throw new HttpError(503, "Payment verification is temporarily unavailable.");
  if (capture.data?.provider === "waffo") throw new HttpError(409, "This song was already paid for with Waffo. Please return to your song instead of paying again.");
}

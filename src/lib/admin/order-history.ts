import "server-only";
import { HttpError } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertAdminOrderId } from "./order-detail";

export type PaymentRecord = { id: string; provider: string; environment: string; transaction_type: "capture" | "refund"; external_id: string; amount_minor: number; currency: string; fee_minor: number | null; occurred_at: string };
export type JobRecord = { id: string; attempt_no: number; environment: string; provider: string; model: string; provider_job_id: string | null; state: string; poll_count: number; error_code: string | null; final_asset_id: string | null; started_at: string; completed_at: string | null };
export type EventRecord = { id: string; event_type: string; actor_type: string; actor_id: string | null; reference_id: string | null; state: string | null; created_at: string };
export type AuditRecord = { id: string; actor_user_id: string; action: string; target_type: string; target_id: string; result: string; reason_code: string | null; error_code: string | null; created_at: string; completed_at: string | null };
export type OrderHistory = {
  quote: { amountMinor: number; currency: string; environment: string; priceVersion: string; quotedAt: string } | null;
  payments: PaymentRecord[]; jobs: JobRecord[]; events: EventRecord[]; audit: AuditRecord[];
  truncated: { payments: boolean; jobs: boolean; events: boolean; audit: boolean };
};

// Each API/page must authorize before entering. No raw provider payload, job
// lease, submission token, Storage capability or freely supplied note is read.
export async function getAdminOrderHistory(id: string): Promise<OrderHistory> {
  assertAdminOrderId(id);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("song_orders").select("id,quoted_amount_minor,currency,payment_environment,price_version,quoted_at,payment_transactions(id,provider,environment,transaction_type,external_id,amount_minor,currency,fee_minor,occurred_at),generation_jobs(id,attempt_no,environment,provider,model,provider_job_id,state,poll_count,error_code,final_asset_id,started_at,completed_at),order_events(id,event_type,actor_type,actor_id,reference_id,state,created_at)")
    .eq("id", id)
    .order("occurred_at", { referencedTable: "payment_transactions", ascending: false }).order("id", { referencedTable: "payment_transactions", ascending: false }).limit(51, { referencedTable: "payment_transactions" })
    .order("started_at", { referencedTable: "generation_jobs", ascending: false }).order("id", { referencedTable: "generation_jobs", ascending: false }).limit(51, { referencedTable: "generation_jobs" })
    .order("created_at", { referencedTable: "order_events", ascending: false }).order("id", { referencedTable: "order_events", ascending: false }).limit(51, { referencedTable: "order_events" }).maybeSingle();
  if (error) throw new HttpError(503, "订单处理记录暂时不可用。");
  if (!data) throw new HttpError(404, "订单不存在。");
  const audit = await db.from("admin_audit_logs").select("id,actor_user_id,action,target_type,target_id,result,reason_code,error_code,created_at,completed_at").eq("order_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
  if (audit.error) throw new HttpError(503, "订单处理记录暂时不可用。");
  const row = data as unknown as { quoted_amount_minor: number | null; currency: string | null; payment_environment: string | null; price_version: string | null; quoted_at: string | null; payment_transactions: PaymentRecord[]; generation_jobs: JobRecord[]; order_events: EventRecord[] };
  const records = audit.data as AuditRecord[];
  return {
    quote: row.quoted_amount_minor !== null && row.currency && row.payment_environment && row.price_version && row.quoted_at ? { amountMinor: row.quoted_amount_minor, currency: row.currency, environment: row.payment_environment, priceVersion: row.price_version, quotedAt: row.quoted_at } : null,
    payments: row.payment_transactions.slice(0, 50), jobs: row.generation_jobs.slice(0, 50), events: row.order_events.slice(0, 50), audit: records.slice(0, 50),
    truncated: { payments: row.payment_transactions.length > 50, jobs: row.generation_jobs.length > 50, events: row.order_events.length > 50, audit: records.length > 50 },
  };
}

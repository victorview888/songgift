// Outbox/lease/backoff workflow adapted from ShrimpReel (MIT),
// e1447714d61eb67af653c931e917dce7b63012b0/src/server/email.ts.
// License: third-party/shrimpreel/LICENSE. Supabase/Resend/song semantics adapted.
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/http-error";
import { MailDeliveryError, notificationConfig, sendSongReadyEmail } from "@/lib/email";

type MailRow = { id: string; job_id: string; order_id: string; user_id: string; to_email: string; recipient_name: string; template: string;
  status: string; attempts: number; lease_token: string | null; from_email: string; site_origin: string; dedupe_key: string };
export async function deliveryRpc<T>(name: string, params: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await getSupabaseAdmin().rpc(name, params);
  if (error) throw new HttpError(503, "交付处理记录暂时不可用。");
  return data as T | null;
}
async function recipient(orderId: string): Promise<{ userId: string | null; email: string | null }> {
  const db = getSupabaseAdmin();
  const order = await db.from("song_orders").select("id,user_id").eq("id", orderId).maybeSingle();
  if (order.error || !order.data) throw new HttpError(503, "通知收件人暂时无法核实。");
  const userId = order.data.user_id as string | null;
  if (!userId) return { userId, email: null };
  const identity = await db.auth.admin.getUserById(userId);
  if (identity.error && identity.error.status !== 404) throw new HttpError(503, "通知收件人暂时无法核实。");
  const user = identity.data.user;
  return { userId, email: user?.id === userId && user.email_confirmed_at && user.email && !("banned_until" in user && typeof user.banned_until === "string" && Date.parse(user.banned_until) > Date.now()) ? user.email : null };
}
export async function enqueueReadyNotification(jobId: string) {
  const job = await getSupabaseAdmin().from("generation_jobs").select("id,order_id,state,environment").eq("id", jobId).maybeSingle();
  if (job.error) throw new HttpError(503, "通知事件暂时不可用。");
  if (!job.data || job.data.state !== "completed" || job.data.environment !== "production") return;
  const to = await recipient(job.data.order_id);
  await deliveryRpc("enqueue_songgift_notification", { p_job_id: jobId, p_user_id: to.userId, p_to_email: to.email });
}
export async function queueReadyNotifications(deadline: number) {
  const rows = await deliveryRpc<{ id: string }[]>("list_songgift_notification_candidates", { p_limit: 20 });
  let failures = 0;
  for (const row of rows || []) {
    if (Date.now() >= deadline) break;
    try { await enqueueReadyNotification(row.id); } catch { failures++; }
  }
  return failures;
}
export async function sendDueNotifications(deadline: number) {
  const config = notificationConfig();
  if (!config) return 0; // Preserve pending notices and their retry budget until configured.
  const rows = await deliveryRpc<{ id: string }[]>("list_due_songgift_notifications", { p_limit: 5 });
  let processed = 0;
  for (const row of rows || []) {
    if (Date.now() >= deadline) break;
    const claimed = await deliveryRpc<MailRow>("claim_songgift_notification", { p_id: row.id, p_from_email: config.from, p_site_origin: config.siteOrigin });
    if (!claimed?.lease_token) continue;
    processed++;
    let status = "pending", messageId: string | null = null, errorCode: string | null = "temporary";
    try {
      const current = await recipient(claimed.order_id);
      if (current.userId !== claimed.user_id || current.email !== claimed.to_email) { status = "skipped"; errorCode = "recipient_changed"; }
      else {
        messageId = await sendSongReadyEmail({ to: claimed.to_email, recipientName: claimed.recipient_name, from: claimed.from_email,
          songUrl: claimed.site_origin + "/song/" + claimed.order_id, idempotencyKey: claimed.dedupe_key });
        status = "sent"; errorCode = null;
      }
    } catch (error) {
      if (error instanceof MailDeliveryError) { errorCode = error.code; status = error.retryable ? "pending" : error.code === "provider_conflict" ? "needs_review" : "failed"; }
    }
    await deliveryRpc("settle_songgift_notification", { p_id: claimed.id, p_lease_token: claimed.lease_token, p_status: status, p_message_id: messageId, p_error_code: errorCode });
  }
  return processed;
}
export async function getOrderNotifications(orderId: string) {
  const { data, error } = await getSupabaseAdmin().from("song_notification_outbox").select("id,status,attempts,error_code,created_at,next_attempt_at,sent_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(5);
  if (error) throw new HttpError(503, "通知记录暂时不可用。");
  return data as { id: string; status: string; attempts: number; error_code: string | null; created_at: string; next_attempt_at: string; sent_at: string | null }[];
}

import "server-only";
import type { User } from "@supabase/supabase-js";
import { HttpError } from "@/lib/http-error";
import type { AdminIdentity } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { songPriceUsdForEmail } from "@/lib/pricing";
import { assertAdminOrderId } from "@/lib/admin/order-detail";
import type { MusicGenerationInput } from "@/lib/types/song";

export type JobState = "submitting" | "queued" | "processing" | "storing" | "completed" | "failed" | "needs_review";
export type JobError = "submission_unknown" | "provider_failed" | "query_failed" | "storage_failed";
export type GenerationJob = {
  id: string; order_id: string; provider: string; model: string; environment: "production" | "test";
  provider_job_id: string | null; state: JobState; lease_token?: string | null; lease_expires_at: string | null;
  input_snapshot: MusicGenerationInput | null; final_asset_id?: string | null; error_code?: JobError | null;
};
export type Quote = { id: string; quoted_amount_minor: number; currency: "USD"; payment_environment: "sandbox" | "live"; price_version: string; quoted_at: string };
export type AdminOperationAction = "payment.reconcile" | "generation.sync" | "generation.resume_storage";
export type AuditResult = "requested" | "succeeded" | "failed" | "needs_review";
type Operation = { id: string; request_id: string; result: AuditResult };

const conflicts = new Set(["payment_needs_review", "quote_immutable", "legacy_payment_needs_review", "payment_mismatch", "capture_conflict", "submission_conflict", "generation_needs_review", "stale_lease", "job_busy", "job_not_recoverable", "storage_must_resume", "asset_mismatch", "operation_conflict", "operation_already_finished", "output_conflict", "generation_input_immutable"]);
async function operationRpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseAdmin().rpc(name, params);
  if (error || !data) {
    if (error?.message === "payment_required") throw new HttpError(402, "Please complete payment before creating your song.");
    if (error?.message === "lyrics_required") throw new HttpError(400, "Please review and save your lyrics first.");
    if (error?.message === "admin_denied") throw new HttpError(403, "管理员权限已失效。");
    if (error && (conflicts.has(error.message) || error.code === "23505")) throw new HttpError(409, "记录状态冲突或结果待确认，请核查原记录后再操作。");
    if (error?.message === "order_not_found" || error?.message === "job_not_found") throw new HttpError(404, "订单或任务不存在。");
    throw new HttpError(503, "订单处理记录暂时不可用，请稍后重试。");
  }
  return data as T;
}

export function usdMinor(value: string) {
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value)) throw new HttpError(503, "订单价格配置无效。");
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > 2147483647) throw new HttpError(503, "订单价格配置无效。");
  return minor;
}

// These primitives do not make provider calls. Integration must use created=true
// as the one-time submission permission; an existing operation is never rerun.
export async function prepareOrderQuote(orderId: string, user: Pick<User, "id" | "email" | "email_confirmed_at">): Promise<Quote> {
  assertAdminOrderId(orderId);
  if (!user.email_confirmed_at) throw new HttpError(401, "Please sign in to continue.");
  const row = await operationRpc<Quote>("prepare_songgift_checkout", {
    p_order_id: orderId, p_user_id: user.id, p_amount_minor: usdMinor(songPriceUsdForEmail(user.email)),
    p_environment: (process.env.PAYPAL_ENVIRONMENT || "sandbox").toLowerCase(), p_price_version: "songgift-usd-v1",
  });
  // Do not forward the RPC's full song_orders composite outside this service.
  return { id: row.id, quoted_amount_minor: row.quoted_amount_minor, currency: row.currency, payment_environment: row.payment_environment, price_version: row.price_version, quoted_at: row.quoted_at };
}

export async function recordVerifiedCapture(input: { orderId: string; userId: string; paypalOrderId: string; captureId: string; environment: "sandbox" | "live"; amountMinor: number; currency: "USD"; occurredAt: string }) {
  const recorded = await operationRpc<{ id: string; review_required?: boolean }>("record_songgift_paypal_capture_checked", { p_order_id: input.orderId, p_user_id: input.userId, p_paypal_order_id: input.paypalOrderId, p_capture_id: input.captureId, p_environment: input.environment, p_amount_minor: input.amountMinor, p_currency: input.currency, p_occurred_at: input.occurredAt });
  if (recorded.review_required) throw new HttpError(409, "Another payment is already recorded. This additional payment is saved for review; please contact support.");
  return recorded;
}
export function reserveGeneration(input: { orderId: string; userId: string; requestId: string; provider: string; model: string; environment: "production" | "test" }) {
  return operationRpc<{ created: boolean; job: GenerationJob }>("reserve_songgift_generation", { p_order_id: input.orderId, p_user_id: input.userId, p_request_id: input.requestId, p_provider: input.provider, p_model: input.model, p_environment: input.environment });
}
export async function bindCheckout(orderId: string, userId: string, paypalOrderId: string) {
  await operationRpc("bind_songgift_checkout", { p_order_id: orderId, p_user_id: userId, p_paypal_order_id: paypalOrderId });
}
export function cacheGenerationOutput(jobId: string, leaseToken: string, output: { audioUrl?: string; audioBase64?: string; mimeType: string }) {
  return operationRpc<GenerationJob>("cache_songgift_job_output", { p_job_id: jobId, p_lease_token: leaseToken, p_audio_url: output.audioUrl || null, p_audio_base64: output.audioBase64 || null, p_mime_type: output.mimeType });
}
export function bindGeneration(input: { jobId: string; leaseToken: string; providerJobId: string | null; state: "queued" | "processing" | "storing" }) {
  return operationRpc<GenerationJob>("bind_songgift_generation", { p_job_id: input.jobId, p_lease_token: input.leaseToken, p_provider_job_id: input.providerJobId, p_state: input.state });
}
export function claimGeneration(jobId: string) {
  return operationRpc<GenerationJob>("claim_songgift_job", { p_job_id: jobId });
}
export function settleGeneration(input: { jobId: string; leaseToken: string; state: Exclude<JobState, "submitting" | "completed">; errorCode: JobError | null }) {
  return operationRpc<GenerationJob>("settle_songgift_job", { p_job_id: input.jobId, p_lease_token: input.leaseToken, p_state: input.state, p_error_code: input.errorCode });
}
export function finishGeneration(jobId: string, leaseToken: string, assetId: string) {
  return operationRpc<GenerationJob>("finish_songgift_generation", { p_job_id: jobId, p_lease_token: leaseToken, p_asset_id: assetId });
}
export function completeGenerationAudio(jobId: string, leaseToken: string, asset: { id: string; storage_bucket: string; storage_path: string; mime_type: string }) {
  return operationRpc<GenerationJob>("complete_songgift_audio", { p_job_id: jobId, p_lease_token: leaseToken, p_asset_id: asset.id, p_storage_bucket: asset.storage_bucket, p_storage_path: asset.storage_path, p_mime_type: asset.mime_type });
}
export function generationStoragePath(orderId: string, jobId: string, mimeType: string) {
  assertAdminOrderId(orderId); assertAdminOrderId(jobId);
  const ext = ({ "audio/wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/flac": "flac", "audio/mp4": "m4a" } as Record<string, string>)[mimeType];
  if (!ext) throw new HttpError(503, "Unsupported audio format.");
  return orderId + "/" + jobId + "/final." + ext;
}
export function beginAdminOperation(input: { requestId: string; admin: AdminIdentity; action: AdminOperationAction; orderId: string; targetId: string; reasonCode: "manual_check" | "recover_delivery" }) {
  return operationRpc<{ created: boolean; operation: Operation }>("begin_songgift_admin_operation", { p_request_id: input.requestId, p_actor_id: input.admin.userId, p_action: input.action, p_order_id: input.orderId, p_target_id: input.targetId, p_reason_code: input.reasonCode });
}
export function finishAdminOperation(input: { requestId: string; admin: AdminIdentity; result: Exclude<AuditResult, "requested">; errorCode: "unavailable" | "conflict" | "unverified" | "provider_failed" | "storage_failed" | null }) {
  return operationRpc<Operation>("finish_songgift_admin_operation", { p_request_id: input.requestId, p_actor_id: input.admin.userId, p_result: input.result, p_error_code: input.errorCode });
}

import "server-only";
import type { User } from "@supabase/supabase-js";
import { requireAdmin, type AdminIdentity } from "@/lib/auth/admin";
import { HttpError } from "@/lib/http-error";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertAdminOrderId } from "./order-detail";
import { paymentColumns, storedQuote, type PaymentOrder } from "@/lib/services/checkout";
import { reconcilePayPalOrder } from "@/lib/paypal";
import { processExistingGeneration } from "@/lib/services/generation";
import { beginAdminOperation, finishAdminOperation, type AdminOperationAction, type AuditResult } from "@/lib/services/order-operations";

export class AuditedOperationError extends HttpError {
  constructor(status: number, message: string, public result: Exclude<AuditResult, "requested">, public requestId: string) { super(status, message); }
}
export function parseAdminOperation(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "请选择处理动作及目标。");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !["action", "requestId", "jobId", "reasonCode"].includes(key))) throw new HttpError(400, "处理参数无效。");
  if (!["payment.reconcile", "generation.sync", "generation.resume_storage"].includes(String(input.action)) || typeof input.requestId !== "string") throw new HttpError(400, "处理动作或请求号无效。");
  assertAdminOrderId(input.requestId);
  const action = input.action as AdminOperationAction;
  const reasonCode = action === "generation.resume_storage" ? "recover_delivery" as const : "manual_check" as const;
  if (input.reasonCode !== reasonCode) throw new HttpError(400, "请选择与动作对应的处理原因。");
  if (action !== "payment.reconcile") {
    if (typeof input.jobId !== "string") throw new HttpError(400, "请选择已有生成任务。");
    assertAdminOrderId(input.jobId);
  }
  return { action, requestId: input.requestId, jobId: input.jobId as string | undefined, reasonCode };
}
export async function runAdminOperation(orderId: string, input: ReturnType<typeof parseAdminOperation>, user: User, admin: AdminIdentity) {
  assertAdminOrderId(orderId);
  const targetId = input.action === "payment.reconcile" ? orderId : input.jobId!;
  // The RPC revalidates Owner/target, and commits the request before external I/O.
  const started = await beginAdminOperation({ requestId: input.requestId, admin, action: input.action, orderId, targetId, reasonCode: input.reasonCode });
  if (!started.created) return { requestId: input.requestId, result: started.operation.result, replayed: true };
  const authorize = async () => { await requireAdmin(user); };
  let result: Exclude<AuditResult, "requested"> = "succeeded";
  let errorCode: "unavailable" | "conflict" | "unverified" | "provider_failed" | "storage_failed" | null = null;
  let failure: unknown;
  try {
    await authorize();
    if (input.action === "payment.reconcile") {
      const order = await getSupabaseAdmin().from("song_orders").select(paymentColumns + ",user_id").eq("id", orderId).maybeSingle();
      if (order.error || !order.data) throw new HttpError(503, "订单付款记录暂时不可用。");
      const row = order.data as unknown as PaymentOrder & { user_id: string | null };
      if (!row.user_id || !row.paypal_order_id) throw new HttpError(409, "缺少可核实的付款引用，请人工核查历史记录。");
      await reconcilePayPalOrder(row.paypal_order_id, { userId: row.user_id, quote: storedQuote(row) }, authorize);
    } else {
      const progress = await processExistingGeneration(targetId, orderId, { authorize, strictBusy: true, storageOnly: input.action === "generation.resume_storage" });
      if (progress.phase === "needs_review" || progress.phase === "failed") { result = "needs_review"; errorCode = progress.phase === "failed" ? "provider_failed" : "unverified"; }
    }
  } catch (error) {
    failure = error;
    result = error instanceof HttpError && error.status === 409 ? "needs_review" : "failed";
    errorCode = error instanceof HttpError && error.status === 409 ? input.action === "payment.reconcile" ? "unverified" : "conflict" : input.action === "generation.resume_storage" ? "storage_failed" : "unavailable";
  }
  await finishAdminOperation({ requestId: input.requestId, admin, result, errorCode });
  if (failure) throw new AuditedOperationError(failure instanceof HttpError ? failure.status : 503, failure instanceof HttpError ? failure.message : "处理暂未完成，请核查审计记录后再操作。", result, input.requestId);
  return { requestId: input.requestId, result, replayed: false };
}

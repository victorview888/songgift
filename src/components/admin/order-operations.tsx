"use client";
// Uses the migrated ShrimpReel operation-area/feedback layout with SongGift actions.
// Source/version and MIT license: docs/admin-template-migration.md.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobRecord } from "@/lib/admin/order-history";
import type { AdminOperationAction } from "@/lib/services/order-operations";

export function AdminOrderOperations({ orderId, jobs, canReconcile }: { orderId: string; jobs: JobRecord[]; canReconcile: boolean }) {
  const router = useRouter();
  const [jobId, setJobId] = useState(jobs[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requests = useRef(new Map<string, string>());
  const selected = jobs.find(job => job.id === jobId);
  async function execute(action: AdminOperationAction) {
    const target = action === "payment.reconcile" ? orderId : jobId;
    if (!target || busy) return;
    const key = action + ":" + target;
    const requestId = requests.current.get(key) || crypto.randomUUID();
    requests.current.set(key, requestId);
    setBusy(true); setMessage("正在处理原记录…");
    try {
      const response = await fetch("/api/admin/orders/" + orderId + "/operations", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, requestId, ...(action !== "payment.reconcile" ? { jobId } : {}), reasonCode: action === "generation.resume_storage" ? "recover_delivery" : "manual_check" }) });
      const data = await response.json();
      if (data.requestId === requestId && ["succeeded", "failed", "needs_review"].includes(data.result)) requests.current.delete(key);
      if (!response.ok) throw new Error(data.error || "处理结果暂不可用，请核查审计记录。");
      if (data.result === "requested") setMessage("该请求已登记，结果尚待核查。再次查询同一请求不会重做处理。");
      else {
        requests.current.delete(key);
        setMessage(data.result === "succeeded" ? "处理已记录，请查看更新后的状态与审计。" : "本次处理需继续核查，请查看审计与任务记录。");
      }
      router.refresh();
    } catch (error) {
      // Keep the request ID after uncertain responses. A retry reads the same audit.
      setMessage(error instanceof Error ? error.message : "处理结果暂不可用，请核查审计记录。");
      router.refresh();
    } finally { setBusy(false); }
  }
  return <section className="admin-card"><h2>原订单处理</h2><p className="admin-order-note">核对原付款、同步已有任务或恢复音频保存。处理原因与结果会写入审计。</p>
    <div className="admin-operation-actions"><button className="admin-button" disabled={busy || !canReconcile} onClick={() => void execute("payment.reconcile")}>核对 PayPal 付款</button><span className="admin-order-note">原因：人工核对。历史报价缺失时需单独核实。</span></div>
    {jobs.length ? <><label className="admin-operation-target">目标生成任务<select value={jobId} disabled={busy} onChange={event => setJobId(event.target.value)}>{jobs.map(job => <option value={job.id} key={job.id}>第 {job.attempt_no} 次 · {job.state} · {job.id}</option>)}</select></label>
      <div className="admin-operation-actions"><button className="admin-button admin-button-quiet" disabled={busy || !selected || ["completed", "failed"].includes(selected.state)} onClick={() => void execute("generation.sync")}>同步原任务</button><button className="admin-button admin-button-quiet" disabled={busy || !selected || !["storing", "needs_review"].includes(selected.state)} onClick={() => void execute("generation.resume_storage")}>恢复音频保存</button></div>
      <p className="admin-order-note">同步原因：人工核对；保存原因：恢复交付。保存操作使用已有结果；源地址过期时请先同步原任务。</p></> : <p className="admin-order-note">尚无已登记任务；历史任务需单独核实后才能恢复。</p>}
    <p className="admin-order-note">重新生成和退款需单独处理。这里的操作沿用原付款或原生成任务。</p>
    {message && <p className="admin-operation-message" role="status">{message}</p>}
  </section>;
}

import type { OrderHistory } from "@/lib/admin/order-history";
import { AdminCard, AdminTimeline, shortDate, Status } from "./ui";

export function recordedMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}
const eventLabels: Record<string, string> = { "quote.created": "订单报价已保存", "payment.captured": "收款流水已登记", "generation.reserved": "生成任务已预留", "generation.bound": "供应商任务引用已保存", "generation.state": "生成任务状态已记录", "generation.completed": "生成任务已完成入库", "admin.requested": "管理员处理请求已记录", "admin.finished": "管理员处理结果已记录" };
const errorLabels: Record<string, string> = { submission_unknown: "提交结果待确认", provider_failed: "供应商报告失败", query_failed: "状态查询失败", storage_failed: "音频保存失败，需恢复保存" };

export function AdminOrderHistory({ history }: { history: OrderHistory }) {
  return <>
    <AdminCard title="已登记支付流水">
      {history.payments.length === 0 ? <p className="admin-order-note">尚无已登记流水；不能据此判断没有付款或退款。</p> : history.payments.map(payment => <article className="admin-asset" key={payment.id}><h3>{payment.transaction_type === "capture" ? "收款" : "退款"} · {recordedMoney(payment.amount_minor, payment.currency)}</h3><dl className="admin-fields"><dt>支付商 / 环境</dt><dd>{payment.provider} / {payment.environment}</dd><dt>外部流水号</dt><dd><code>{payment.external_id}</code></dd><dt>发生时间</dt><dd>{shortDate(payment.occurred_at)}</dd><dt>手续费</dt><dd>{payment.fee_minor === null ? "未核实" : recordedMoney(payment.fee_minor, payment.currency)}</dd></dl></article>)}
      {history.truncated.payments && <p>仅展示最新 50 条流水。</p>}
    </AdminCard>
    <AdminCard title="生成尝试记录">
      {history.jobs.length === 0 ? <p className="admin-order-note">尚无结构化任务历史；上方仍可查看订单原有的最新引用。</p> : history.jobs.map(job => <article className="admin-asset" key={job.id}><h3>第 {job.attempt_no} 次尝试 · <Status value={job.state} /></h3><dl className="admin-fields"><dt>任务号</dt><dd><code>{job.id}</code></dd><dt>供应商 / 模型</dt><dd>{job.provider} / {job.model}</dd><dt>环境</dt><dd>{job.environment}</dd><dt>供应商任务号</dt><dd><code>{job.provider_job_id || "尚未记录"}</code></dd><dt>开始 / 完成</dt><dd>{shortDate(job.started_at)} / {shortDate(job.completed_at)}</dd><dt>处理检查次数</dt><dd>{job.poll_count}</dd><dt>异常</dt><dd>{job.error_code ? errorLabels[job.error_code] || "待核查" : "未记录异常"}</dd></dl></article>)}
      {history.truncated.jobs && <p>仅展示最新 50 次尝试。</p>}
    </AdminCard>
    <AdminCard title="处理事件"><AdminTimeline items={history.events.map(event => ({ key: event.id, at: event.created_at, title: eventLabels[event.event_type] || event.event_type, detail: `${event.actor_type}${event.state ? ` · ${event.state}` : ""}${event.reference_id ? ` · 引用 ${event.reference_id}` : ""}` }))} />{history.events.length === 0 && <p className="admin-order-note">尚无结构化处理事件，不补造历史过程。</p>}{history.truncated.events && <p>仅展示最新 50 条事件。</p>}</AdminCard>
    <AdminCard title="管理员访问与处理记录">{history.audit.length === 0 ? <p className="admin-order-note">尚无记录。</p> : <AdminTimeline items={history.audit.map(a => ({ key: a.id, at: a.created_at, title: a.action, detail: `${a.result} · 管理员 ${a.actor_user_id}${a.reason_code ? ` · ${a.reason_code}` : ""}${a.error_code ? ` · ${a.error_code}` : ""}` }))} />}{history.truncated.audit && <p>仅展示最新 50 条审计记录。</p>}</AdminCard>
  </>;
}

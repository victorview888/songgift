"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/account-provider";
import { categoryLabels } from "@/lib/safety/categories";
import type { ContentReport } from "@/lib/safety/reports";

const labels: Record<string, string> = { received: "待受理", reviewing: "核查中", needs_information: "待补资料", action_taken: "已采取措施", no_violation: "未发现违规" };

function ReportReview({ report, onSaved }: { report: ContentReport; onSaved: () => void }) {
  const [status, setStatus] = useState<string>(report.status === "received" ? "reviewing" : report.status), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const attempt = useRef<{ body: string; id: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const body = JSON.stringify({ status, note, updatedAt: report.updated_at });
    if (attempt.current?.body !== body) attempt.current = { body, id: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/content-reports/" + report.id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body), requestId: attempt.current.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "处理结果未确认，请重试。");
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "处理结果未确认，请重试。"); }
    finally { setBusy(false); }
  }
  return <form className="report-review-form" onSubmit={submit}><fieldset disabled={busy}><label>处理状态<select value={status} onChange={event => setStatus(event.target.value)}>{Object.entries(labels).filter(([value]) => value !== "received").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>核查记录<textarea required minLength={10} maxLength={2000} rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="记录核查依据、已实际采取的措施及通知情况。此记录不自动删除音频或通知举报人。" /></label><button className="admin-button" type="submit">{busy ? "正在保存…" : "保存处理记录"}</button></fieldset>{error && <p role="alert">{error}</p>}</form>;
}

export function ContentReportInbox({ reports, ownerId }: { reports: ContentReport[]; ownerId: string }) {
  const { user, loading } = useAccount(); const router = useRouter(); const [message, setMessage] = useState("");
  if (loading || user?.id !== ownerId) return <p role="status">正在核对当前管理员账号…</p>;
  return <>{message && <p role="status" className="admin-operation-message">{message}</p>}{reports.map(report => <article className="admin-card" key={report.id + report.updated_at}>
    <h2>{categoryLabels[report.category as keyof typeof categoryLabels] || report.category} · {labels[report.status]}</h2>
    <dl className="admin-fields"><dt>举报编号</dt><dd>{report.id}</dd><dt>内容引用</dt><dd className="admin-long-text">{report.content_reference}</dd><dt>收到时间</dt><dd>{new Date(report.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（北京时间）</dd><dt>联系邮箱</dt><dd>{report.contact_email || "未提供"}（未经身份验证）</dd><dt>描述</dt><dd className="admin-long-text"><details><summary>{report.details.slice(0, 90)}{report.details.length > 90 ? "…" : ""}</summary><p>{report.details}</p></details></dd></dl>
    {report.reviews.length > 0 && <details className="admin-long-text"><summary>最近 5 条核查记录</summary>{report.reviews.map((review, i) => <p key={i}><strong>{labels[review.status]}</strong> · {new Date(review.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}<br />{review.note}</p>)}</details>}
    <details className="report-action"><summary>查看或更新处理结果</summary><ReportReview report={report} onSaved={() => { setMessage("处理记录已保存。请按实际处理结果通知相关方。"); router.refresh(); }} /></details>
  </article>)}</>;
}

// Adapted from ShrimpReel, Copyright (c) 2026 qianshuixia, MIT.
// Source/version and full license: docs/admin-template-migration.md,
// third-party/shrimpreel/LICENSE. Next.js/SSR and SongGift semantics adapted here.
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminSignOut } from "@/components/admin-sign-out";

export function AdminShell({ current, children }: { current: "home" | "orders" | "jobs" | "reports" | "radar"; children: ReactNode }) {
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link href="/" className="admin-brand">♪ songgift<span>管理后台</span></Link>
      <nav aria-label="后台导航">
        <Link href="/admin" aria-current={current === "home" ? "page" : undefined}>经营概览</Link>
        <Link href="/admin/orders" aria-current={current === "orders" ? "page" : undefined}>订单列表</Link>
        <Link href="/admin/jobs" aria-current={current === "jobs" ? "page" : undefined}>生成任务</Link>
        <Link href="/admin/reports" aria-current={current === "reports" ? "page" : undefined}>内容举报</Link>
        <Link href="/admin/radar" aria-current={current === "radar" ? "page" : undefined}>市场雷达</Link>
        <Link href="/my-songs">我的歌曲</Link><Link href="/">返回网站</Link>
      </nav>
      <p className="admin-sidebar-note">为每一首歌，<br />做好交付的最后一步。</p>
    </aside>
    <main className="admin-main admin-orders-main">
      <header className="admin-topbar"><span>SongGift / 管理后台</span><AdminSignOut /></header>
      {children}
    </main>
  </div>;
}

export function AdminPage({ title, description, actions, children, readOnly = true, activityLabel = "订单处理" }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; readOnly?: boolean; activityLabel?: string }) {
  return <><header className="admin-page-heading"><div><p className="admin-eyebrow">管理工作区 · {readOnly ? "只读" : activityLabel}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions}</header>{children}</>;
}

export function AdminCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="admin-card"><h2>{title}</h2>{children}</section>;
}

export function LoadState({ loading = false, error, empty = false, children }: { loading?: boolean; error?: string; empty?: boolean; children?: ReactNode }) {
  if (error) return <div className="admin-order-message admin-error" role="alert"><p>{error}</p>{children}</div>;
  if (loading) return <div className="admin-order-message" role="status" aria-live="polite"><span className="admin-spinner" aria-hidden="true" /> 正在加载，请稍候…</div>;
  if (empty) return <div className="admin-order-message"><h2>暂无符合条件的记录</h2>{children}</div>;
  return null;
}

export function FilterSelect({ name, value, options, label }: { name: string; value: string; options: [string, string][]; label: string }) {
  return <label>{label}<select name={name} aria-label={label} defaultValue={value}>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>;
}

export function Pager({ page, totalPages, href, label = "订单分页" }: { page: number; totalPages: number; href: (page: number) => string; label?: string }) {
  return <nav className="admin-pagination" aria-label={label}>
    {page > 1 ? <Link className="admin-button admin-button-quiet" href={href(page - 1)}>上一页</Link> : <span className="admin-button admin-button-quiet" aria-disabled="true">上一页</span>}
    <span>第 {page} 页 / {Math.max(1, totalPages)} 页</span>
    {page < totalPages ? <Link className="admin-button admin-button-quiet" href={href(page + 1)}>下一页</Link> : <span className="admin-button admin-button-quiet" aria-disabled="true">下一页</span>}
  </nav>;
}

const tones: Record<string, string> = { recorded: "ok", delivered: "ok", generating: "progress", processing: "progress", submitting: "progress", queued: "progress", storing: "warn", needs_review: "warn", completed: "ok", failed: "bad" };
const labels: Record<string, string> = { submitting: "提交中", queued: "排队中", processing: "生成中", storing: "待完成音频保存", needs_review: "结果待核查", recorded: "已记录付款", unrecorded: "未记录付款", delivered: "已有最终音频", undelivered: "无最终音频记录", generating: "生成中", failed: "失败", draft: "草稿", lyrics_ready: "歌词已保存", paid: "本地标记已付款", completed: "本地标记已完成" };
export function Status({ value }: { value: string }) {
  return <span className={`admin-order-badge admin-tone-${tones[value] || "muted"}`}>{labels[value] || value}</span>;
}

export function shortDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(value));
}

export function AdminTimeline({ items }: { items: { key: string; at: string; title: string; detail: string }[] }) {
  return <ol className="admin-timeline">{items.map(item => <li key={item.key}><time dateTime={item.at}>{shortDate(item.at)}</time><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ol>;
}

// Layout, Stat and Todo adapted from ShrimpReel admin/index.tsx (MIT).
// Copyright (c) 2026 qianshuixia. See third-party/shrimpreel/LICENSE and
// docs/admin-template-migration.md. Metrics and queries are SongGift-specific.
import Link from "next/link";
import type { AdminOverview } from "@/lib/admin/overview";
import { AdminCard, shortDate } from "./ui";

function Stat({ label, value, hint, href }: { label: string; value: number; hint: string; href: string }) {
  return <Link className="admin-stat-card" href={href} prefetch={false}><span className="admin-stat-label">{label}</span><strong className="admin-stat-value">{new Intl.NumberFormat("zh-CN").format(value)}</strong><span className="admin-stat-hint">{hint}</span><span className="admin-stat-link">查看订单 ↗</span></Link>;
}
function Todo({ label, value, href, attention = false }: { label: string; value: number; href: string; attention?: boolean }) {
  return <Link className="admin-overview-todo" href={href} prefetch={false}><span>{label}</span><strong className={attention && value > 0 ? "admin-count-attention" : ""}>{value}</strong><span aria-hidden="true">↗</span></Link>;
}
export function Overview({ data }: { data: AdminOverview }) {
  const { counts, links } = data;
  return <>
    <div className="admin-overview-grid" data-testid="admin-overview-stats">
      <Stat label="订单总数" value={counts.orders} hint="全部历史订单，包含草稿" href={links.orders} />
      <Stat label="今日新订单" value={counts.createdToday} hint={`${data.day} · 北京时间`} href={links.createdToday} />
      <Stat label="已记录付款" value={counts.paid} hint="本地有付款时间记录的订单" href={links.paid} />
      <Stat label="有最终音频记录" value={counts.withFinalAudio} hint="按订单去重，不按音频条数累加" href={links.withFinalAudio} />
    </div>
    <div className="admin-overview-panels">
      <AdminCard title="生成与交付跟进"><div className="admin-overview-job-grid">
        <Stat label="生成中" value={counts.generating} hint="本地标记生成中，尚无最终音频记录" href={links.generating} />
        <Stat label="待核查异常" value={counts.needsReview} hint="尚无最终音频，且有失败、完成或错误标记" href={links.needsReview} />
      </div><p className="admin-order-note">异常是待核查线索，不代表需要重新生成。生成中与异常可能重叠，数字不相加。</p></AdminCard>
      <AdminCard title="待处理"><Todo label="核查异常订单" value={counts.needsReview} href={links.needsReview} attention /><Todo label="跟进生成中的订单" value={counts.generating} href={links.generating} /><Link className="admin-button admin-button-quiet" href={links.orders}>浏览全部订单</Link></AdminCard>
    </div>
    <AdminCard title="统计口径"><ul className="admin-overview-notes">
      <li>除“今日新订单”外均为全部历史记录；今日按北京时间（UTC+8）的自然日计算。</li>
      <li>付款数来自本地付款时间，不代表实时 PayPal 对账；最终音频数不验证文件可用性或邮件送达。</li>
      <li>待核查异常：没有最终音频，且本地标记失败、标记完成或留有生成错误。</li>
      <li>页面只读取本地记录。统计不自动刷新，可用“刷新统计”重新读取。</li>
    </ul><p className="admin-order-note">最近读取：<time dateTime={data.generatedAt}>{shortDate(data.generatedAt)}</time>（UTC+8）。各项独立查询，记录变化时可能有短暂差异。</p></AdminCard>
  </>;
}

// List composition adapted from ShrimpReel admin/generations.tsx (MIT).
// Copyright (c) 2026 qianshuixia. See docs/admin-template-migration.md and
// third-party/shrimpreel/LICENSE. SongGift query and state semantics differ.
import Link from "next/link";
import { CopyId } from "@/components/admin/copy-id";
import { ArrowIcon } from "@/components/arrow-icon";
import { notFound, redirect } from "next/navigation";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { HttpError } from "@/lib/auth/server";
import { AdminPage, AdminShell, FilterSelect, LoadState, Pager, Status, shortDate } from "@/components/admin/ui";
import { OverviewRefresh } from "@/components/admin/overview-refresh";
import { jobErrors, jobProviders, jobSources, legacyJobStates, recordedJobStates, listAdminJobs, parseJobFilters, type AdminJobList, type JobFilters } from "@/lib/admin/jobs";

export const dynamic = "force-dynamic";
const elapsedText = (seconds: number | null) => {
  if (seconds === null) return "未记录";
  const minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  return days ? `${days} 天 ${hours % 24} 小时` : hours ? `${hours} 小时 ${minutes % 60} 分钟` : minutes ? `${minutes} 分钟` : "不足 1 分钟";
};


export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await getAdminPageAccess();
  if (access.status === 401) redirect("/login?next=%2Fadmin%2Fjobs");
  if (access.status === 403) notFound();
  if (access.status === 503) return <main className="admin-access-message"><h1>暂时无法验证后台访问权限</h1><p>请稍后重试。</p><Link href="/admin/jobs">重新验证</Link></main>;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  if (!params.has("source")) params.set("source", "recorded");
  let filters: JobFilters | undefined;
  let result: AdminJobList | undefined;
  let errorMessage = "";
  try { filters = parseJobFilters(params); result = await listAdminJobs(filters); }
  catch (error) { errorMessage = error instanceof HttpError ? error.message : "任务记录暂时不可用，请稍后重试。"; }
  const recorded = filters?.source === "recorded";
  const pageHref = (page: number) => { const next = new URLSearchParams(params); next.set("page", String(page)); return `/admin/jobs?${next}`; };
  const resetHref = `/admin/jobs?source=${recorded ? "recorded" : "legacy"}`;
  return <AdminShell current="jobs"><AdminPage title="生成任务" description="查找歌曲生成记录与订单任务引用。时间按北京时间（UTC+8）显示，每页 20 条。" actions={<OverviewRefresh label="刷新任务" />}>
    <nav className="admin-job-tabs" aria-label="任务来源">{Object.entries(jobSources).map(([source]) => <Link key={source} prefetch={false} href={`/admin/jobs?source=${source}`} aria-current={(filters?.source || "legacy") === source ? "page" : undefined}>{source === "recorded" ? "当前生成任务" : "历史订单任务"}</Link>)}</nav>
    <p className="admin-order-note">{recorded ? "展示已登记的生成尝试；未接入任务记录的旧流程不会自动出现在这里。" : "展示订单上的最新任务引用，以及本地标记生成中、失败或完成的订单；不能据此还原每次生成尝试。"}切换来源会重置筛选。</p>
    <form key={params.toString()} action="/admin/jobs" method="get" className="admin-order-filters">
      <input type="hidden" name="source" value={recorded ? "recorded" : "legacy"} />
      <FilterSelect name="searchBy" label="搜索字段" value={filters?.searchBy || "orderId"} options={[...(recorded ? [["jobId", "任务 ID"] as [string, string]] : []), ["orderId", "订单号"], ["email", "订单邮箱"], ["providerJobId", "供应商任务引用"]]} />
      <label className="admin-search-field">精确搜索<input type="search" name="q" maxLength={2048} defaultValue={filters?.q || ""} placeholder="输入完整标识或邮箱" /></label>
      <FilterSelect name="state" label="状态" value={filters?.state || "all"} options={Object.entries(recorded ? recordedJobStates : legacyJobStates)} />
      <FilterSelect name="provider" label="供应商" value={filters?.provider || ""} options={[["", "全部"], ...jobProviders.map(provider => [provider, provider] as [string, string])]} />
      {recorded && <FilterSelect name="environment" label="任务环境" value={filters?.environment || ""} options={[["", "全部"], ["production", "production"], ["test", "test"]]} />}
      <label>{recorded ? "预留日期从" : "订单创建日期从"}<input type="date" name="from" defaultValue={filters?.from || ""} /></label>
      <label>至<input type="date" name="to" defaultValue={filters?.to || ""} /></label>
      <label className="admin-job-attention"><input type="checkbox" name="attention" value="1" defaultChecked={filters?.attention || false} />仅待核查异常</label>
      <div className="admin-filter-actions"><button className="admin-button" type="submit">查询</button><Link href={resetHref} className="admin-button admin-button-quiet">重置</Link></div>
    </form>
    <p className="admin-order-note">{recorded ? "待核查包括失败、结果待确认或留有错误码的记录。" : "待核查指没有最终音频，且本地标记失败、标记完成或留有生成错误；日期为订单创建时间，不是任务提交时间。环境和尝试次数未记录时保持未知。"}本页只读取已有数据，不向供应商查询、不重新生成，也不修改订单或保存音频。</p>
    <LoadState error={errorMessage}><p>可刷新重试，或查看另一种任务来源。</p><Link href="/admin/jobs?source=legacy">查看历史订单任务</Link></LoadState>
    {result && <>
      <p className="admin-order-count" role="status">共 {result.total} 条{recorded ? "任务记录" : "订单任务引用"} · 第 {result.page} 页 / {Math.max(1, result.totalPages)} 页</p>
      {result.jobs.length === 0 ? <LoadState empty><p>{result.total ? "此页没有记录。" : ""}可调整筛选或返回第一页；另一来源需单独查看，不将两者相加。</p><Link href={pageHref(1)}>返回第一页</Link></LoadState> : <div className="admin-order-table-wrap"><table className="admin-order-table" data-testid="admin-jobs">
        <caption className="admin-sr-only">{recorded ? "结构化生成任务" : "订单最新任务引用"}，时间为北京时间（UTC+8）</caption>
        <thead><tr><th scope="col">任务 / 订单</th><th scope="col">订单邮箱 / 收礼人</th><th scope="col">状态 / 音频记录</th><th scope="col">供应商 / 模型</th><th scope="col">外部引用 / 尝试</th><th scope="col">异常</th><th scope="col">时间记录</th></tr></thead>
        <tbody>{result.jobs.map(job => <tr key={job.id || job.orderId}>
          <td data-label="任务 / 订单"><strong>{recorded ? "任务 ID" : "订单号"}</strong><code>{(job.id || job.orderId).slice(0, 8).toUpperCase()}</code><details><summary>完整标识</summary><CopyId value={job.id || job.orderId} /></details><Link prefetch={false} href={`/admin/orders/${job.orderId}?back=${encodeURIComponent(pageHref(result.page))}`}>查看订单详情 <ArrowIcon /></Link>{recorded && <details><summary>订单标识</summary><CopyId value={job.orderId} /></details>}</td>
          <td data-label="订单邮箱 / 收礼人">{job.orderEmail || "未记录邮箱"}<small>{job.recipientName}</small></td>
          <td data-label="状态 / 音频记录"><Status value={job.state} /><small><Status value={job.hasFinalAudio ? "delivered" : "undelivered"} /></small></td>
          <td data-label="供应商 / 模型">{job.provider || "未记录"}<small>{job.model || "未记录模型"}</small><small>环境：{job.environment || "未记录"}</small></td>
          <td data-label="外部引用 / 尝试"><details><summary>供应商引用</summary><CopyId value={job.providerJobId || "未记录供应商任务号"} /></details><small>{job.attemptNo === null ? "尝试次数未记录" : `第 ${job.attemptNo} 次尝试`}</small></td>
          <td data-label="异常">{job.errorCode ? jobErrors[job.errorCode] : "未记录错误码"}</td>
          <td data-label="时间记录"><small>{recorded ? "预留" : "订单创建"}：{shortDate(job.recordedAt)}</small><small>记录更新：{shortDate(job.updatedAt)}</small><small>任务完成：{shortDate(job.completedAt)}</small><small>{job.completedAt ? "预留至完成" : "预留后时长"}：{elapsedText(job.elapsedSeconds)}</small></td>
        </tr>)}</tbody>
      </table></div>}
      <Pager page={result.page} totalPages={result.totalPages} href={pageHref} label="任务分页" />
    </>}
  </AdminPage></AdminShell>;
}

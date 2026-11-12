import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPage, AdminShell, LoadState, Pager, shortDate } from "@/components/admin/ui";
import { OverviewRefresh } from "@/components/admin/overview-refresh";
import { radarStatusLabels } from "@/components/admin/radar-report";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { HttpError } from "@/lib/http-error";
import { listRadarReports, radarPage } from "@/lib/radar/store";

export const dynamic = "force-dynamic";
const workflowUrl = "https://github.com/victorview888/songgift/actions/workflows/radar-free.yml";

export default async function RadarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await getAdminPageAccess();
  if (access.status === 401) redirect("/login?next=%2Fadmin%2Fradar");
  if (access.status === 403) notFound();
  if (access.status === 503) return <main className="admin-access-message"><h1>暂时无法验证后台访问权限</h1><p>请稍后重试。</p><Link href="/admin/radar">重新验证</Link></main>;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  let result: Awaited<ReturnType<typeof listRadarReports>> | undefined, errorMessage = "";
  try { result = await listRadarReports(radarPage(params)); }
  catch (error) { errorMessage = error instanceof HttpError ? error.message : "报告暂时不可用，请稍后重试。"; }
  const latest = result?.page === 1 ? result.reports[0] : undefined;
  const stale = latest && result && Date.parse(result.checkedAt) - Date.parse(latest.generated_at) > 36 * 3600000;
  return <AdminShell current="radar"><AdminPage title="市场雷达" description="每日北京时间 09:30 计划采集，实际开始时间可能延迟。报告保留最近 30 天，最多 60 份。" actions={<OverviewRefresh label="刷新报告" />}>
    <p className="admin-order-note">刷新仅重新读取已保存的报告。公开免费来源包括 GitHub、Hugging Face 和已配置站点的 Sitemap；Search Console 未启用。<a href={workflowUrl} target="_blank" rel="noopener noreferrer">查看采集运行 ↗</a></p>
    {stale && <p className="admin-operation-message" role="status">最新报告已超过 36 小时，请查看采集运行是否失败或延迟。</p>}
    <LoadState error={errorMessage}><Link href="/admin/radar">返回第一页并重试</Link></LoadState>
    {result && <><p className="admin-order-count" role="status">共 {result.total} 份报告 · 时间为北京时间（UTC+8）</p>
      {result.reports.length ? <div className="admin-order-table-wrap"><table className="admin-order-table" data-testid="radar-reports"><caption className="admin-sr-only">已保存的市场雷达报告</caption>
        <thead><tr><th scope="col">报告时间</th><th scope="col">采集状态</th><th scope="col">来源 / 失败</th><th scope="col">相关线索</th><th scope="col">查看</th></tr></thead>
        <tbody>{result.reports.map(report => <tr key={report.id}>
          <td data-label="报告时间"><time dateTime={report.generated_at}>{shortDate(report.generated_at)}</time><small>保存：{shortDate(report.created_at)}</small></td>
          <td data-label="采集状态"><span className={`admin-order-badge admin-tone-${report.status === "complete" ? "ok" : report.status === "failed" ? "bad" : "warn"}`}>{radarStatusLabels[report.status]}</span></td>
          <td data-label="来源 / 失败">{report.source_count} 个来源 / {report.error_count} 个失败</td><td data-label="相关线索">{report.item_count} 条</td>
          <td data-label="查看"><Link href={`/admin/radar/${report.id}`} prefetch={false}>查看报告</Link><small><a href={`https://github.com/victorview888/songgift/actions/runs/${report.run_id}/attempts/${report.run_attempt}`} target="_blank" rel="noopener noreferrer">采集日志 ↗</a></small></td>
        </tr>)}</tbody></table></div> : <LoadState empty><p>{result.total ? "此页没有报告，可返回第一页。" : "尚未收到采集报告。首次运行会建立快照基线；报告保存后将在此显示。"}</p><Link href="/admin/radar">返回第一页</Link></LoadState>}
      <Pager page={result.page} totalPages={result.totalPages} href={page => `/admin/radar?page=${page}`} label="雷达报告分页" />
    </>}
  </AdminPage></AdminShell>;
}

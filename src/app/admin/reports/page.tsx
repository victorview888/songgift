import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { AdminPage, AdminShell, LoadState, Pager } from "@/components/admin/ui";
import { ContentReportInbox } from "@/components/admin/content-reports";
import { listContentReports } from "@/lib/safety/reports";

export const dynamic = "force-dynamic";
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await getAdminPageAccess();
  if (access.status === 401) redirect("/login?next=%2Fadmin%2Freports");
  if (access.status === 403) notFound();
  if (access.status === 503) return <main className="admin-access-message"><h1>暂时无法验证管理员权限</h1><Link href="/admin/reports">重试</Link></main>;
  const raw = await searchParams, params = new URLSearchParams();
  for (const key of ["page", "status"]) if (typeof raw[key] === "string") params.set(key, raw[key]);
  let result; let error = "";
  try { result = await listContentReports(params); } catch { error = "举报记录暂时无法读取，请稍后重试。"; }
  return <AdminShell current="reports"><AdminPage title="内容举报" description="优先核查儿童安全与可信威胁；举报邮箱未经验证，不作为账号身份凭据。输入的链接只作文本展示，不自动打开或下载举报材料。" readOnly={false} activityLabel="内容核查">
    <form method="get" className="admin-order-filters"><label>处理状态<select name="status" defaultValue={result?.status || "all"}><option value="all">全部</option><option value="received">待受理</option><option value="reviewing">核查中</option><option value="needs_information">待补资料</option><option value="action_taken">已采取措施</option><option value="no_violation">未发现违规</option></select></label><button className="admin-button" type="submit">查询 / 刷新</button></form>
    <p className="admin-order-note">目标：紧急举报 24 小时内开始核查，其他举报 3 个工作日内开始核查，7 个工作日内提供结论或进展。状态登记不会自动删除音频、封禁账号或发送邮件；实际措施须由 Owner 核实后执行并记录。</p>
    <LoadState error={error} />
    {result && <><p>共 {result.total} 条举报</p>{result.reports.length ? <ContentReportInbox reports={result.reports} ownerId={access.admin.userId} /> : <LoadState empty />}<Pager page={result.page} totalPages={result.totalPages} label="举报分页" href={page => "/admin/reports?" + new URLSearchParams({ page: String(page), status: result.status })} /></>}
  </AdminPage></AdminShell>;
}

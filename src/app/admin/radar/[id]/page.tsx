import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPage, AdminShell, LoadState } from "@/components/admin/ui";
import { RadarReportView, radarStatusLabels } from "@/components/admin/radar-report";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { HttpError } from "@/lib/http-error";
import { getRadarReport } from "@/lib/radar/store";

export const dynamic = "force-dynamic";
export default async function RadarDetail({ params }: { params: Promise<{ id: string }> }) {
  const access = await getAdminPageAccess();
  if (access.status === 401) redirect("/login?next=%2Fadmin%2Fradar");
  if (access.status === 403) notFound();
  if (access.status === 503) return <main className="admin-access-message"><h1>暂时无法验证后台访问权限</h1><p>请稍后重试。</p><Link href="/admin/radar">重新验证</Link></main>;
  let result: Awaited<ReturnType<typeof getRadarReport>> | undefined, errorMessage = "";
  try { result = await getRadarReport((await params).id); }
  catch (error) { if (error instanceof HttpError && error.status === 404) notFound(); errorMessage = "报告暂时不可用，请稍后重试。"; }
  return <AdminShell current="radar"><AdminPage title="雷达报告详情" description={result ? radarStatusLabels[result.status] : undefined} actions={<Link className="admin-button admin-button-quiet" href="/admin/radar">返回报告列表</Link>}>
    <LoadState error={errorMessage}><Link href="/admin/radar">返回列表重试</Link></LoadState>{result && <RadarReportView report={result.report} />}
  </AdminPage></AdminShell>;
}

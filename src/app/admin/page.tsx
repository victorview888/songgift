import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { AdminPage as PageHeading, AdminShell, LoadState } from "@/components/admin/ui";
import { Overview } from "@/components/admin/overview";
import { OverviewRefresh } from "@/components/admin/overview-refresh";
import { getAdminOverview, type AdminOverview } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await getAdminPageAccess();
  if (access.status === 401) redirect("/login?next=%2Fadmin");
  if (access.status === 403) notFound();
  if (access.status === 503) {
    return <main className="admin-access-message"><Link href="/" className="admin-brand">♪ songgift</Link><p className="admin-eyebrow">管理后台</p><h1>暂时无法验证后台访问权限</h1><p>请稍后重试。你的歌曲和订单仍可从个人歌曲库查看。</p><div className="admin-inline-actions"><Link href="/admin" className="admin-button">重新验证</Link><Link href="/my-songs" className="admin-button admin-button-quiet">我的歌曲</Link></div></main>;
  }

  let data: AdminOverview | undefined;
  try { data = await getAdminOverview(); } catch { /* Never replace unavailable metrics with zero. */ }
  return <AdminShell current="home"><PageHeading title="经营概览" description="查看订单、付款记录和歌曲交付进度，点击数字进入对应订单。" actions={<OverviewRefresh />}>
    <p className="admin-overview-identity">{access.admin.email} · Owner</p>
    {data ? <Overview data={data} /> : <LoadState error="经营统计暂时不可用，请稍后刷新。"><p>你的管理员身份已验证，可继续查看订单。</p><Link href="/admin/orders">前往订单列表</Link></LoadState>}
  </PageHeading></AdminShell>;
}

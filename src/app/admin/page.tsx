import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { AdminShell } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await getAdminPageAccess();
  if (access.status === 401) redirect("/login?next=%2Fadmin");
  if (access.status === 403) notFound();
  if (access.status === 503) {
    return <main className="admin-access-message"><Link href="/" className="admin-brand">♪ songgift</Link><p className="admin-eyebrow">管理后台</p><h1>暂时无法验证后台访问权限</h1><p>请稍后重试。你的歌曲和订单仍可从个人歌曲库查看。</p><div className="admin-inline-actions"><Link href="/admin" className="admin-button">重新验证</Link><Link href="/my-songs" className="admin-button admin-button-quiet">我的歌曲</Link></div></main>;
  }

  const { admin } = access;
  return <AdminShell current="home">
      <section className="admin-welcome"><p className="admin-eyebrow">管理工作区</p><h1>后台访问已开启。</h1><p>你的管理员身份已验证。可查询订单摘要；可查看订单详情、故事、歌词与音频记录。</p></section>
      <section className="admin-identity-card" aria-labelledby="admin-identity-title"><div className="admin-identity-icon" aria-hidden="true">✓</div><div><p className="admin-eyebrow">当前账号</p><h2 id="admin-identity-title">{admin.email}</h2><p>所有者 · Owner</p></div><span className="admin-status">访问已授权</span></section>
      <section className="admin-next-card"><div><p className="admin-eyebrow">只读订单查询</p><h2>先让每一笔订单都清晰可查。</h2><p>按订单号、邮箱或 PayPal 号搜索，并按日期、支付及交付记录筛选。</p></div><Link className="admin-button" href="/admin/orders">查看订单</Link></section>
  </AdminShell>;
}

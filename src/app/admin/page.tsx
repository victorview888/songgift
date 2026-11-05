import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { AdminSignOut } from "@/components/admin-sign-out";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await getAdminPageAccess();
  if (access.status === 401) redirect("/login?next=%2Fadmin");
  if (access.status === 403) notFound();
  if (access.status === 503) {
    return <main className="admin-access-message"><Link href="/" className="admin-brand">♪ songgift</Link><p className="admin-eyebrow">管理后台</p><h1>暂时无法验证后台访问权限</h1><p>请稍后重试。你的歌曲和订单仍可从个人歌曲库查看。</p><div className="admin-inline-actions"><Link href="/admin" className="admin-button">重新验证</Link><Link href="/my-songs" className="admin-button admin-button-quiet">我的歌曲</Link></div></main>;
  }

  const { admin } = access;
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link href="/" className="admin-brand">♪ songgift<span>管理后台</span></Link>
      <nav aria-label="后台导航"><Link href="/admin" aria-current="page"><span aria-hidden="true">▦</span> 后台入口</Link><Link href="/my-songs"><span aria-hidden="true">♫</span> 我的歌曲</Link><Link href="/"><span aria-hidden="true">↗</span> 返回网站</Link></nav>
      <p className="admin-sidebar-note">为每一首歌，<br />做好交付的最后一步。</p>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><span>SongGift / 管理后台</span><AdminSignOut /></header>
      <section className="admin-welcome"><p className="admin-eyebrow">管理工作区</p><h1>后台访问已开启。</h1><p>你的管理员身份已验证。订单管理与歌曲交付功能将在这里逐步接入。</p></section>
      <section className="admin-identity-card" aria-labelledby="admin-identity-title"><div className="admin-identity-icon" aria-hidden="true">✓</div><div><p className="admin-eyebrow">当前账号</p><h2 id="admin-identity-title">{admin.email}</h2><p>所有者 · Owner</p></div><span className="admin-status">访问已授权</span></section>
      <section className="admin-next-card"><div><p className="admin-eyebrow">接下来的开发</p><h2>先让每一笔订单都清晰可查。</h2><p>下一步将接入订单列表、订单详情和异常恢复。当前入口用于验证管理员访问权限。</p></div><span className="admin-planned">待接入</span></section>
    </main>
  </div>;
}

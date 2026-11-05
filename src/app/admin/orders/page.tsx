import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { HttpError } from "@/lib/auth/server";
import { AdminSignOut } from "@/components/admin-sign-out";
import { deliveryLabels, listAdminOrders, parseOrderFilters, paymentLabels, providers, type AdminOrderList } from "@/lib/admin/orders";

export const dynamic = "force-dynamic";
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Do not parse filters or read customer data before checking membership.
  const access = await getAdminPageAccess();
  if (access.status === 401) redirect("/login?next=%2Fadmin%2Forders");
  if (access.status === 403) notFound();
  if (access.status === 503) return <main className="admin-access-message"><h1>暂时无法验证后台访问权限</h1><p>请稍后重试。</p><Link href="/admin/orders">重新验证</Link></main>;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  let filters;
  let result: AdminOrderList | undefined;
  let errorMessage = "";
  try {
    filters = parseOrderFilters(params);
    result = await listAdminOrders(filters);
  } catch (error) {
    errorMessage = error instanceof HttpError ? error.message : "订单查询暂时不可用，请稍后重试。";
  }
  const pageHref = (page: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    return `/admin/orders?${next}`;
  };
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link href="/" className="admin-brand">♪ songgift<span>管理后台</span></Link>
      <nav aria-label="后台导航"><Link href="/admin">后台入口</Link><Link href="/admin/orders" aria-current="page">订单列表</Link><Link href="/">返回网站</Link></nav>
      <p className="admin-sidebar-note">只读订单查询<br />不触发付款或歌曲生成</p>
    </aside>
    <main className="admin-main admin-orders-main">
      <header className="admin-topbar"><span>SongGift / 订单列表</span><AdminSignOut /></header>
      <section className="admin-welcome"><p className="admin-eyebrow">订单管理 · 只读</p><h1>每一笔订单，清晰可查。</h1><p>日期按北京时间（UTC+8）筛选，包含结束日期。每页 20 条，按创建时间倒序排列。</p></section>
      <form action="/admin/orders" method="get" className="admin-order-filters">
        <label>搜索字段<select name="searchBy" defaultValue={filters?.searchBy ?? "id"}><option value="id">订单号</option><option value="email">订单邮箱</option><option value="paypal">PayPal 订单号</option></select></label>
        <label className="admin-search-field">精确搜索<input name="q" type="search" maxLength={254} defaultValue={filters?.q ?? ""} placeholder="输入完整订单号或邮箱" /></label>
        <label>创建日期从<input type="date" name="from" defaultValue={filters?.from ?? ""} /></label>
        <label>至<input type="date" name="to" defaultValue={filters?.to ?? ""} /></label>
        <label>支付记录<select name="payment" defaultValue={filters?.payment ?? "all"}>{Object.entries(paymentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>交付记录<select name="delivery" defaultValue={filters?.delivery ?? "all"}>{Object.entries(deliveryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>音乐供应商<select name="provider" defaultValue={filters?.provider ?? ""}><option value="">全部</option>{providers.map(provider => <option key={provider} value={provider}>{provider}</option>)}</select></label>
        <div className="admin-filter-actions"><button className="admin-button" type="submit">查询</button><Link className="admin-button admin-button-quiet" href="/admin/orders">重置</Link></div>
      </form>
      <p className="admin-order-note">支付状态仅依据本地 paid_at，不代表已向 PayPal 对账。最终音频依据资产入库记录，不探测实际文件。历史金额及支付环境尚未记录，均不推算。邮箱为订单记录邮箱。</p>
      {errorMessage && <div className="admin-order-message" role="alert">{errorMessage}<p><Link href="/admin/orders">返回订单列表</Link></p></div>}
      {result && <>
        <div className="admin-order-count" role="status">共 {result.total} 笔订单 · 第 {result.page} 页 / {Math.max(1, result.totalPages)} 页</div>
        {result.orders.length === 0 ? <div className="admin-order-message"><h2>{result.total > 0 ? "此页没有订单" : "没有符合条件的订单"}</h2><p>可调整筛选条件，或返回第一页。</p><Link href={pageHref(1)}>返回第一页</Link></div> : <div className="admin-order-table-wrap"><table className="admin-order-table">
          <caption className="admin-sr-only">订单摘要，所有时间为北京时间（UTC+8）</caption>
          <thead><tr><th scope="col">创建时间 / 订单号</th><th scope="col">用户 / 订单邮箱</th><th scope="col">收礼人 / 场景</th><th scope="col">支付记录</th><th scope="col">交付记录</th><th scope="col">供应商 / 模型</th><th scope="col">金额 / 环境</th></tr></thead>
          <tbody>{result.orders.map(order => <tr key={order.id}>
            <td><time dateTime={order.created_at}>{dateTime(order.created_at)}</time><code>{order.id}</code></td>
            <td>{order.email || "未记录邮箱"}<code>{order.user_id || "未关联用户"}</code></td>
            <td>{order.recipient_name}<small>{order.occasion}</small></td>
            <td><span className="admin-order-badge">{order.paid_at ? "已记录付款" : "未记录付款"}</span><small>{dateTime(order.paid_at)}</small><code>{order.paypal_order_id || "无 PayPal 订单号"}</code></td>
            <td><span className="admin-order-badge">{order.hasFinalAudio ? "已有最终音频" : "无最终音频记录"}</span><small>原始状态：{order.status}</small></td>
            <td>{order.music_provider || "未记录"}<small>{order.music_model || "未记录模型"}</small></td>
            <td>未记录<small>未记录支付环境</small></td>
          </tr>)}</tbody>
        </table></div>}
        <nav className="admin-pagination" aria-label="订单分页">
          {result.page > 1 && <Link className="admin-button admin-button-quiet" href={pageHref(result.page - 1)}>上一页</Link>}
          {result.page < result.totalPages && <Link className="admin-button" href={pageHref(result.page + 1)}>下一页</Link>}
        </nav>
      </>}
    </main>
  </div>;
}

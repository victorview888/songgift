import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { HttpError } from "@/lib/auth/server";
import { AdminPage, AdminShell, FilterSelect, LoadState, Pager, Status, shortDate } from "@/components/admin/ui";
import { deliveryLabels, listAdminOrders, parseOrderFilters, paymentLabels, providers, type AdminOrderList } from "@/lib/admin/orders";

export const dynamic = "force-dynamic";

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
  return <AdminShell current="orders"><AdminPage title="订单列表" description="日期按北京时间（UTC+8）筛选，包含结束日期。每页 20 条，按创建时间倒序排列。">
      <form action="/admin/orders" method="get" className="admin-order-filters">
        <FilterSelect name="searchBy" label="搜索字段" value={filters?.searchBy ?? "id"} options={[["id", "订单号"], ["email", "订单邮箱"], ["paypal", "PayPal 订单号"]]} />
        <label className="admin-search-field">精确搜索<input name="q" type="search" maxLength={254} defaultValue={filters?.q ?? ""} placeholder="输入完整订单号或邮箱" /></label>
        <label>创建日期从<input type="date" name="from" defaultValue={filters?.from ?? ""} /></label>
        <label>至<input type="date" name="to" defaultValue={filters?.to ?? ""} /></label>
        <FilterSelect name="payment" label="支付记录" value={filters?.payment ?? "all"} options={Object.entries(paymentLabels)} />
        <FilterSelect name="delivery" label="交付记录" value={filters?.delivery ?? "all"} options={Object.entries(deliveryLabels)} />
        <FilterSelect name="provider" label="音乐供应商" value={filters?.provider ?? ""} options={[["", "全部"], ...providers.map(provider => [provider, provider] as [string, string])]} />
        <div className="admin-filter-actions"><button className="admin-button" type="submit">查询</button><Link className="admin-button admin-button-quiet" href="/admin/orders">重置</Link></div>
      </form>
      <p className="admin-order-note">支付状态仅依据本地 paid_at，不代表已向 PayPal 对账。最终音频依据资产入库记录，不探测实际文件。历史金额及支付环境尚未记录，均不推算。邮箱为订单记录邮箱。</p>
      <LoadState error={errorMessage}><Link href="/admin/orders">返回订单列表</Link></LoadState>
      {result && <>
        <div className="admin-order-count" role="status">共 {result.total} 笔订单 · 第 {result.page} 页 / {Math.max(1, result.totalPages)} 页</div>
        {result.orders.length === 0 ? <LoadState empty><p>{result.total > 0 ? "此页没有订单。" : ""}可调整筛选条件，或返回第一页。</p><Link href={pageHref(1)}>返回第一页</Link></LoadState> : <div className="admin-order-table-wrap"><table className="admin-order-table">
          <caption className="admin-sr-only">订单摘要，所有时间为北京时间（UTC+8）</caption>
          <thead><tr><th scope="col">创建时间 / 订单号</th><th scope="col">用户 / 订单邮箱</th><th scope="col">收礼人 / 场景</th><th scope="col">支付记录</th><th scope="col">交付记录</th><th scope="col">供应商 / 模型</th><th scope="col">金额 / 环境</th></tr></thead>
          <tbody>{result.orders.map(order => <tr key={order.id}>
            <td data-label="创建时间 / 订单号"><time dateTime={order.created_at}>{shortDate(order.created_at)}</time><code><Link prefetch={false} href={`/admin/orders/${order.id}?back=${encodeURIComponent(pageHref(result.page))}`}>{order.id}</Link></code></td>
            <td data-label="用户 / 订单邮箱">{order.email || "未记录邮箱"}<code>{order.user_id || "未关联用户"}</code></td>
            <td data-label="收礼人 / 场景">{order.recipient_name}<small>{order.occasion}</small></td>
            <td data-label="支付记录"><Status value={order.paid_at ? "recorded" : "unrecorded"} /><small>{shortDate(order.paid_at)}</small><code>{order.paypal_order_id || "无 PayPal 订单号"}</code></td>
            <td data-label="交付记录"><Status value={order.hasFinalAudio ? "delivered" : "undelivered"} /><small>原始状态：{order.status}</small></td>
            <td data-label="供应商 / 模型">{order.music_provider || "未记录"}<small>{order.music_model || "未记录模型"}</small></td>
            <td data-label="金额 / 环境">未记录<small>未记录支付环境</small></td>
          </tr>)}</tbody>
        </table></div>}
        <Pager page={result.page} totalPages={result.totalPages} href={pageHref} />
      </>}
  </AdminPage></AdminShell>;
}

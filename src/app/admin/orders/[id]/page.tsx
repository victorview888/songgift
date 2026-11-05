import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { HttpError } from "@/lib/auth/server";
import { getAdminOrderDetail, type AdminOrderDetail } from "@/lib/admin/order-detail";
import { adminOrdersBackLink } from "@/lib/admin/links";
import { AdminCard, AdminPage, AdminShell, AdminTimeline, LoadState, Status, shortDate } from "@/components/admin/ui";
import { getAdminOrderHistory, type OrderHistory } from "@/lib/admin/order-history";
import { AdminOrderHistory, recordedMoney } from "@/components/admin/order-history";
import { AdminAudioPlayer } from "@/components/admin/audio-player";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getAdminPageAccess();
  if (access.status === 401) {
    const { id } = await params;
    redirect(`/login?next=${encodeURIComponent(`/admin/orders/${encodeURIComponent(id)}`)}`);
  }
  if (access.status === 403) notFound();
  if (access.status === 503) return <main className="admin-access-message"><h1>暂时无法验证后台访问权限</h1><p>请稍后重试。</p><Link href="/admin/orders">返回订单列表</Link></main>;
  const { id } = await params;
  const back = adminOrdersBackLink((await searchParams).back);
  let data: AdminOrderDetail | undefined;
  let unavailable = false;
  try { data = await getAdminOrderDetail(id); }
  catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    unavailable = true;
  }
  if (unavailable || !data) return <AdminShell current="orders"><AdminPage title="订单详情"><LoadState error="订单详情暂时不可用，请稍后重试。"><Link href={back}>返回订单列表</Link></LoadState></AdminPage></AdminShell>;
  let history: OrderHistory | undefined;
  try { history = await getAdminOrderHistory(id); } catch { /* Existing details stay available while the operations schema is unavailable. */ }
  const { order, assets, timeline } = data;
  const captured = history?.payments.find(payment => payment.transaction_type === "capture");
  return <AdminShell current="orders"><AdminPage title="订单详情" description="时间均为北京时间（UTC+8）。本页展示现有记录，不执行支付核对或生成任务查询。" actions={<Link className="admin-button admin-button-quiet" href={back}>← 返回订单列表</Link>}>
    <div className="admin-detail-heading"><code>{order.id}</code><Status value={order.paid_at ? "recorded" : "unrecorded"} /><Status value={data.hasFinalAudio ? "delivered" : "undelivered"} /></div>
    <div className="admin-detail-grid">
      <div className="admin-detail-column">
        <AdminCard title="用户与定制内容"><dl className="admin-fields">
          <dt>订单邮箱</dt><dd>{order.email || "未记录"}</dd><dt>用户 UUID</dt><dd><code>{order.user_id || "未关联用户"}</code></dd>
          <dt>收礼人</dt><dd>{order.recipient_name}</dd><dt>关系</dt><dd>{order.relationship || "未记录"}</dd><dt>场景</dt><dd>{order.occasion}</dd>
          <dt>情绪 / 曲风</dt><dd>{order.mood || "未记录"} / {order.style || "未记录"}</dd>
        </dl><h3>故事</h3><p className="admin-long-text">{order.story}</p></AdminCard>
        <AdminCard title="已保存歌词"><h3>{order.title || "未记录歌名"}</h3><p className="admin-long-text">{order.lyrics_text || "尚无已保存歌词。"}</p><p className="admin-order-note">现有记录不包含独立的歌词确认时间。</p></AdminCard>
        <AdminCard title="音频资产"><p className="admin-order-note">仅在点击播放或下载时签发 60 秒链接，并记录管理员访问。记录存在不代表已实时验证文件；签发记录也不证明已播放或下载完成。</p>
          <LoadState empty={assets.length === 0}><p>尚无音频资产记录。</p></LoadState>
          {data.assetsTruncated && <p role="status">仅展示最新 100 条资产记录。</p>}
          {assets.map(asset => {
            const endpoint = `/api/admin/orders/${order.id}/audio/${asset.id}`;
            return <article className="admin-asset" key={asset.id}><h3>{asset.is_final ? "最终音频" : "其他资产"}</h3><dl className="admin-fields"><dt>资产号</dt><dd><code>{asset.id}</code></dd><dt>供应商 / 模型</dt><dd>{asset.provider} / {asset.model_id}</dd><dt>类型 / 时长</dt><dd>{asset.mime_type} / {asset.duration_seconds === null ? "未记录时长" : `${asset.duration_seconds} 秒`}</dd><dt>登记时间</dt><dd>{shortDate(asset.created_at)}</dd><dt>任务引用</dt><dd><code>{asset.provider_job_id || "未记录"}</code></dd></dl>
              {asset.is_final && <><AdminAudioPlayer src={endpoint} /><a className="admin-button admin-button-quiet" href={`${endpoint}?download=1`} target="_blank" rel="noreferrer">下载音频</a></>}
            </article>;
          })}
        </AdminCard>
      </div>
      <div className="admin-detail-column">
        <AdminCard title="本地支付记录"><dl className="admin-fields"><dt>付款状态</dt><dd><Status value={order.paid_at ? "recorded" : "unrecorded"} /></dd><dt>PayPal 订单号</dt><dd><code>{order.paypal_order_id || "未记录"}</code></dd><dt>付款记录时间</dt><dd>{shortDate(order.paid_at)}</dd><dt>报价 / 已登记收款</dt><dd>{history?.quote ? recordedMoney(history.quote.amountMinor, history.quote.currency) : "未记录"} / {captured ? recordedMoney(captured.amount_minor, captured.currency) : "未核实"}</dd><dt>报价币种 / 环境</dt><dd>{history?.quote ? `${history.quote.currency} / ${history.quote.environment}` : "未记录"}</dd><dt>捕获流水号</dt><dd><code>{captured?.external_id || "未记录"}</code></dd></dl><p className="admin-order-note">不使用当前售价或 Live 配置填补历史数据，也不将本地状态当作 PayPal 对账结果。</p></AdminCard>
        <AdminCard title="当前生成记录"><dl className="admin-fields"><dt>原始状态</dt><dd><Status value={order.status} /></dd><dt>供应商</dt><dd>{order.music_provider || "未记录"}</dd><dt>模型</dt><dd>{order.music_model || "未记录"}</dd><dt>任务引用</dt><dd><code>{order.provider_job_id || "未记录"}</code></dd><dt>订单最后更新</dt><dd>{shortDate(order.updated_at)}</dd></dl><p className="admin-order-note">此卡展示订单原有的最新任务引用；已登记的生成尝试见下方。缺失的历史无法还原，本页不查询供应商或发起新生成。</p></AdminCard>
      </div>
    </div>
    {!history && <p className="admin-order-note" role="status">订单处理记录暂不可用；付款快照、结构化任务与审计记录尚未展示。</p>}
    {history && <AdminOrderHistory history={history} />}
    <AdminCard title="已有记录时间线"><p className="admin-order-note">根据订单创建时间、本地付款时间和资产登记时间排列。缺少歌词确认、供应商完成、邮件发送和历史管理事件记录，不能据此还原完整交付过程。</p><AdminTimeline items={timeline} /></AdminCard>
  </AdminPage></AdminShell>;
}

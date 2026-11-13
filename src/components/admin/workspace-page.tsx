import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminPageAccess } from "@/lib/auth/admin-page";
import { workspaceData, type WorkspaceKind } from "@/lib/admin/workspace";
import {
  AdminShell,
  AdminPage,
  LoadState,
  Pager,
  shortDate,
  FilterSelect,
} from "./ui";
import { OverviewRefresh } from "./overview-refresh";
import { HttpError } from "@/lib/http-error";
const titles = {
  users: "用户管理",
  system: "系统状态",
  audit: "操作审计",
  analytics: "来源与转化",
};
const fields: Record<WorkspaceKind, [string, string][]> = {
  users: [
    ["email", "账户邮箱"],
    ["user_id", "用户 ID"],
    ["verified", "邮箱已验证"],
    ["order_count", "订单数"],
    ["paid_count", "正式收款订单数"],
    ["created_at", "注册时间"],
    ["last_sign_in_at", "最近登录"],
  ],
  audit: [
    ["actor_user_id", "管理员 ID"],
    ["action", "动作"],
    ["order_id", "订单"],
    ["target_type", "对象类型"],
    ["target_id", "对象 ID"],
    ["result", "结果"],
    ["error_code", "错误类别"],
    ["created_at", "时间"],
  ],
  system: [
    ["item", "检查项目"],
    ["state", "状态"],
    ["detail", "说明"],
  ],
  analytics: [
    ["type", "数据类别"],
    ["name", "指标 / 来源"],
    ["events", "事件 / 记录数"],
    ["browsers", "随机浏览器标识数"],
  ],
};
export async function WorkspacePage({
  kind,
  searchParams,
}: {
  kind: WorkspaceKind;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getAdminPageAccess();
  if (access.status === 401)
    redirect("/login?next=" + encodeURIComponent("/admin/" + kind));
  if (access.status === 403) notFound();
  if (access.status === 503)
    return (
      <main className="admin-access-message">
        <h1>暂时无法验证后台权限</h1>
        <Link href={"/admin/" + kind}>重试</Link>
      </main>
    );
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams))
    for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v])
      params.append(k, item);
  let data: Awaited<ReturnType<typeof workspaceData>> | undefined,
    error = "";
  try {
    data = await workspaceData(kind, params);
  } catch (e) {
    error = e instanceof HttpError ? e.message : "记录暂时不可用，请重试。";
  }
  const pageHref = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    return "/admin/" + kind + "?" + next;
  };
  return (
    <AdminShell current={kind}>
      <AdminPage
        title={titles[kind]}
        description="仅当前有效 Owner 可访问。时间按北京时间显示。"
        actions={<OverviewRefresh label="刷新记录" />}
      >
        {kind !== "system" && (
          <form
            key={params.toString()}
            className="admin-order-filters"
            method="get"
            action={"/admin/" + kind}
          >
            {kind === "users" && (
              <>
                <label>
                  邮箱包含 / 完整用户 ID
                  <input
                    name="q"
                    defaultValue={params.get("q") || ""}
                    maxLength={254}
                  />
                </label>
                <label>
                  邮箱验证
                  <select
                    name="verified"
                    defaultValue={params.get("verified") || "all"}
                  >
                    <option value="all">全部</option>
                    <option value="yes">已验证</option>
                    <option value="no">未验证</option>
                  </select>
                </label>
              </>
            )}
            {kind === "audit" && (
              <>
                {[
                  ["actor", "管理员 UUID"],
                  ["order", "订单 UUID"],
                  ["target", "对象 UUID"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      name={key}
                      defaultValue={params.get(key) || ""}
                      maxLength={80}
                    />
                  </label>
                ))}
                <FilterSelect
                  name="action"
                  label="动作"
                  value={params.get("action") || ""}
                  options={[
                    ["", "全部"],
                    ["audio.preview", "试听音频"],
                    ["audio.download", "下载音频"],
                    ["payment.reconcile", "核对付款"],
                    ["generation.sync", "同步任务"],
                    ["generation.resume_storage", "恢复音频保存"],
                  ]}
                />
                <FilterSelect
                  name="result"
                  label="结果"
                  value={params.get("result") || ""}
                  options={[
                    ["", "全部"],
                    ["requested", "待核实"],
                    ["issued", "已发放音频链接"],
                    ["succeeded", "成功"],
                    ["failed", "失败"],
                    ["needs_review", "需人工核查"],
                  ]}
                />
                <FilterSelect
                  name="targetType"
                  label="对象类型"
                  value={params.get("targetType") || ""}
                  options={[
                    ["", "全部"],
                    ["song_asset", "音频资产"],
                    ["song_order", "歌曲订单"],
                    ["generation_job", "生成任务"],
                  ]}
                />
              </>
            )}
            {kind !== "users" && (
              <>
                <label>
                  日期从
                  <input
                    type="date"
                    name="from"
                    defaultValue={params.get("from") || ""}
                  />
                </label>
                <label>
                  至
                  <input
                    type="date"
                    name="to"
                    defaultValue={params.get("to") || ""}
                  />
                </label>
              </>
            )}
            <button className="admin-button" type="submit">
              查询
            </button>
            <Link href={"/admin/" + kind}>重置</Link>
          </form>
        )}
        {kind === "users" && (
          <p className="admin-order-note">
            目录只同步必要的账户字段，不读取密码、会话或用户自填
            metadata。正式收款订单数来自 Live 捕获记录，不推算消费金额。
          </p>
        )}
        {kind === "audit" && (
          <p className="admin-order-note">
            只展示脱敏操作记录，支持动作和结果精确筛选。历史 requested
            表示结果待核实，不能直接当作成功。记录不可编辑或清空。
          </p>
        )}
        {kind === "analytics" && (
          <p className="admin-order-note">
            默认最近 7 天，最多 31
            天。浏览器事件仅来自同意统计的访客，可能缺失或被伪造；正式收款来自
            Live
            捕获账本，交付来自最终音频记录。两类数据窗口和人群不同，不据此直接计算全站转化率。来源归因只覆盖已同意并关联的订单，采用
            30 天统计窗口，过期数据在后续采集时清理。
          </p>
        )}
        <LoadState error={error} />
        {data && (
          <>
            {(kind === "users" || kind === "audit") && (
              <p role="status">共 {data.total} 条记录</p>
            )}
            {data.rows.length ? (
              <div className="admin-order-table-wrap">
                <table className="admin-order-table admin-workspace-table">
                  <caption className="admin-sr-only">
                    {titles[kind]}只读记录
                  </caption>
                  <thead>
                    <tr>
                      {fields[kind].map(([k, l]) => (
                        <th key={k} scope="col">
                          {l}
                        </th>
                      ))}
                      {kind === "users" && <th>关联订单</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, index) => (
                      <tr key={String(row.user_id || row.id || index)}>
                        {fields[kind].map(([key, label]) => (
                          <td key={key} data-label={label}>
                            {kind === "audit" &&
                            key === "order_id" &&
                            typeof row[key] === "string" ? (
                              <Link href={"/admin/orders/" + row[key]}>
                                {row[key]}
                              </Link>
                            ) : key.endsWith("_at") ? (
                              shortDate(row[key] as string)
                            ) : row[key] === null ? (
                              "—"
                            ) : typeof row[key] === "boolean" ? (
                              row[key] ? (
                                "是"
                              ) : (
                                "否"
                              )
                            ) : (
                              String(row[key] ?? "—")
                            )}
                          </td>
                        ))}
                        {kind === "users" && (
                          <td data-label="关联订单">
                            <Link
                              href={
                                "/admin/orders?searchBy=user&q=" +
                                encodeURIComponent(String(row.user_id))
                              }
                            >
                              查看订单
                            </Link>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <LoadState empty />
            )}
            {(kind === "users" || kind === "audit") && (
              <Pager
                page={data.page}
                totalPages={Math.ceil(data.total / 20)}
                href={pageHref}
                label={titles[kind] + "分页"}
              />
            )}
          </>
        )}
      </AdminPage>
    </AdminShell>
  );
}

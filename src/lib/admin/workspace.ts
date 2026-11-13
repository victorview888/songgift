import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/http-error";
export type WorkspaceKind = "users" | "system" | "audit" | "analytics";
export const uuid = (v: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
export function readFilters(params: URLSearchParams) {
  for (const key of params.keys())
    if (params.getAll(key).length > 1)
      throw new HttpError(400, "筛选参数不能重复。");
  const page = params.get("page") || "1";
  if (!/^[1-9]\d{0,3}$/.test(page)) throw new HttpError(400, "页码无效。");
  const q = (params.get("q") || "").trim(),
    verified = params.get("verified") || "all";
  if (q.length > 254 || !["all", "yes", "no"].includes(verified))
    throw new HttpError(400, "搜索条件无效。");
  const date = (key: string) => {
    const v = params.get(key) || "";
    if (
      v &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      throw new HttpError(400, "日期无效。");
    return v;
  };
  const from = date("from"),
    to = date("to");
  if (from && to && from > to) throw new HttpError(400, "日期顺序无效。");
  const actor = params.get("actor") || "",
    order = params.get("order") || "",
    action = params.get("action") || "",
    result = params.get("result") || "";
  const target = params.get("target") || "",
    targetType = params.get("targetType") || "";
  if (
    (actor && !uuid(actor)) ||
    (target && !uuid(target)) ||
    !["", "song_asset", "song_order", "generation_job"].includes(targetType) ||
    (order && !uuid(order)) ||
    ![
      "",
      "audio.preview",
      "audio.download",
      "payment.reconcile",
      "generation.sync",
      "generation.resume_storage",
    ].includes(action) ||
    ![
      "",
      "requested",
      "issued",
      "failed",
      "succeeded",
      "needs_review",
    ].includes(result)
  )
    throw new HttpError(400, "审计筛选无效。");
  return {
    page: Number(page),
    q,
    verified,
    from,
    to,
    actor,
    order,
    action,
    result,
    target,
    targetType,
  };
}
export type WorkspaceRow = Record<string, string | number | boolean | null>;
export async function workspaceData(
  kind: WorkspaceKind,
  params: URLSearchParams,
) {
  const f = readFilters(params),
    db = getSupabaseAdmin();
  if (kind === "users") {
    const { data, error } = await db.rpc("list_songgift_customers", {
      p_page: f.page,
      p_q: f.q,
      p_verified: f.verified,
    });
    if (error || !data)
      throw new HttpError(503, "用户目录暂时不可用，请检查迁移或稍后重试。");
    return {
      rows: data.rows as WorkspaceRow[],
      total: Number(data.total),
      page: f.page,
    };
  }
  if (kind === "audit") {
    let query = db
      .from("admin_audit_logs")
      .select(
        "id,actor_user_id,action,target_type,target_id,order_id,result,reason_code,error_code,created_at,completed_at",
        { count: "exact" },
      );
    for (const [col, val] of [
      ["actor_user_id", f.actor],
      ["order_id", f.order],
      ["action", f.action],
      ["result", f.result],
      ["target_type", f.targetType],
      ["target_id", f.target],
    ])
      if (val) query = query.eq(col, val);
    if (f.from)
      query = query.gte(
        "created_at",
        new Date(f.from + "T00:00:00+08:00").toISOString(),
      );
    if (f.to)
      query = query.lt(
        "created_at",
        new Date(Date.parse(f.to + "T00:00:00+08:00") + 86400000).toISOString(),
      );
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((f.page - 1) * 20, f.page * 20 - 1);
    if (error || count === null)
      throw new HttpError(503, "审计记录暂时不可用。");
    return { rows: data as WorkspaceRow[], total: count, page: f.page };
  }
  if (kind === "analytics") {
    const end = f.to
      ? Date.parse(f.to + "T00:00:00+08:00") + 86400000
      : Date.now();
    const start = f.from
      ? Date.parse(f.from + "T00:00:00+08:00")
      : end - 7 * 86400000;
    if (start >= end || end - start > 31 * 86400000)
      throw new HttpError(400, "统计窗口最多 31 天。");
    const { data, error } = await db.rpc("songgift_usage_report", {
      p_from: new Date(start).toISOString(),
      p_to: new Date(end).toISOString(),
    });
    if (error || !data)
      throw new HttpError(503, "统计暂时不可用，请检查迁移或稍后重试。");
    return {
      rows: [
        ...data.steps.map((r: WorkspaceRow) => ({
          type: "浏览器事件",
          name: r.event,
          events: r.events,
          browsers: r.browsers,
        })),
        ...data.sources.map((r: WorkspaceRow) => ({
          type: "首次来源",
          name: r.source,
          events: r.views,
          browsers: r.browsers,
        })),
        ...data.lastSources.map((r: WorkspaceRow) => ({
          type: "最近来源",
          name: r.source,
          events: r.views,
          browsers: r.browsers,
        })),
        ...data.campaigns.map((r: WorkspaceRow) => ({
          type: "获准活动标签",
          name: r.campaign,
          events: r.events,
          browsers: r.browsers,
        })),
        ...data.attributedSources.map((r: WorkspaceRow) => ({
          type: "归因的真实收款",
          name: r.source,
          events: r.captures,
          browsers: null,
        })),
        {
          type: "服务端事实",
          name: "正式捕获记录",
          events: data.captures,
          browsers: null,
        },
        {
          type: "服务端事实",
          name: "期间有最终音频的订单",
          events: data.delivered,
          browsers: null,
        },
        {
          type: "服务端事实",
          name: "有可用来源归因的捕获记录",
          events: data.attributedCaptures,
          browsers: null,
        },
      ] as WorkspaceRow[],
      total: 0,
      page: 1,
      window: {
        from: new Date(start).toISOString(),
        to: new Date(end).toISOString(),
      },
    };
  }
  const probe = await Promise.allSettled([
    db.from("song_orders").select("id").limit(1),
    db.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET || "songs")
      .list("", { limit: 1 }),
    db
      .from("songgift_maintenance")
      .select(
        "last_started_at,last_finished_at,last_result,jobs_processed,mail_processed",
      )
      .eq("id", true)
      .maybeSingle(),
  ]);
  const state = (i: number) =>
    probe[i].status === "fulfilled" && !probe[i].value.error
      ? "连接成功"
      : "查询失败";
  const maintenance =
    probe[2].status === "fulfilled" && !probe[2].value.error
      ? probe[2].value.data
      : null;
  const lyrics = (process.env.LYRICS_PROVIDER || "deepseek").toLowerCase(),
    music = (process.env.MUSIC_PROVIDER || "musicapi").toLowerCase();
  const configured = (key: string) =>
    process.env[key]?.trim() ? "已配置（未验证调用）" : "未配置";
  return {
    rows: [
      { item: "数据库", state: state(0), detail: "只读连接检查" },
      {
        item: "私有音频存储",
        state: state(1),
        detail: "只列目录，不创建公开链接",
      },
      {
        item: "歌词供应商",
        state:
          lyrics === "mock"
            ? "模拟模式（不会调用供应商）"
            : configured(
                lyrics === "gemini" ? "GEMINI_API_KEY" : "DEEPSEEK_API_KEY",
              ),
        detail: process.env.LYRICS_PROVIDER || "deepseek",
      },
      {
        item: "音乐供应商",
        state:
          music === "mock"
            ? "模拟模式（不会调用供应商）"
            : music === "fal"
              ? configured("FAL_KEY")
              : music === "musicapi"
                ? configured("MUSICAPI_KEY")
                : ["mureka", "mureka_cn", "mureka-cn"].includes(music)
                  ? configured("MUREKA_API_KEY")
                  : process.env.GOOGLE_CLOUD_PROJECT_ID &&
                      (process.env.GOOGLE_ACCESS_TOKEN ||
                        process.env.GOOGLE_LYRIA_ACCESS_TOKEN)
                    ? "已配置（未验证调用）"
                    : "未配置",
        detail: process.env.MUSIC_PROVIDER || "musicapi",
      },
      {
        item: "PayPal",
        state: (
          (process.env.PAYPAL_ENVIRONMENT || "sandbox") === "live"
            ? process.env.PAYPAL_LIVE_CLIENT_ID &&
              process.env.PAYPAL_LIVE_CLIENT_SECRET
            : process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
        )
          ? "已配置（未验证调用）"
          : "未配置",
        detail:
          "环境：" +
          (process.env.PAYPAL_ENVIRONMENT || "sandbox") +
          "；未发起付款",
      },
      {
        item: "歌曲通知（网站配置）",
        state:
          process.env.RESEND_API_KEY && process.env.SONGGIFT_FROM_EMAIL
            ? "已配置（未验证投递）"
            : "未配置",
        detail: "独立维护 Worker 的密钥需另行核对",
      },
      {
        item: "登录邮件",
        state: "由 Supabase SMTP 管理",
        detail: "不与歌曲完成通知混为同一链路",
      },
      {
        item: "维护最近结果",
        state: state(2),
        detail: maintenance?.last_result || "尚无完成结果",
      },
      {
        item: "维护最近开始",
        state: maintenance?.last_started_at || "未记录",
        detail: "不调用维护任务",
      },
      {
        item: "维护最近结束",
        state: maintenance?.last_finished_at || "未记录",
        detail: "记录不代表 Worker 当前启用状态",
      },
      {
        item: "最近处理数量",
        state: maintenance
          ? String(maintenance.jobs_processed) +
            " 任务 / " +
            String(maintenance.mail_processed) +
            " 邮件"
          : "未知",
        detail: "过程统计不等于交付或邮件送达",
      },
      {
        item: "部署版本",
        state: process.env.SONGGIFT_RELEASE_SHA?.slice(0, 12) || "未上报",
        detail: "可通过发布平台提供版本标识",
      },
    ] as WorkspaceRow[],
    total: 0,
    page: 1,
  };
}

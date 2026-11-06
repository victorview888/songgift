import "server-only";
import { HttpError } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { REVIEW_FILTER } from "./order-metrics";

export const JOB_PAGE_SIZE = 20;
export const jobSources = { legacy: "订单任务引用", recorded: "结构化任务记录" };
export const jobProviders = ["fal", "musicapi", "mureka_cn", "google_lyria", "mock"];
export const recordedJobStates = { all: "全部", submitting: "提交中", queued: "排队中", processing: "生成中", storing: "待完成音频保存", completed: "已完成入库", failed: "失败", needs_review: "结果待核查" };
export const legacyJobStates = { all: "全部", generating: "本地标记生成中", failed: "本地标记失败", completed: "本地标记已完成", draft: "草稿（有任务引用）", lyrics_ready: "歌词已保存（有任务引用）", paid: "已付款（有任务引用）" };
export const jobErrors: Record<string, string> = { submission_unknown: "提交结果待确认", provider_failed: "供应商报告失败", query_failed: "状态查询失败", storage_failed: "音频保存失败", legacy_error: "订单留有生成错误，需核查", unknown: "未识别的错误类型，需核查" };
const LEGACY_TASK_FILTER = "provider_job_id.not.is.null,status.in.(generating,failed,completed)";
const RECORDED_ATTENTION_FILTER = "state.in.(failed,needs_review),error_code.not.is.null";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type JobFilters = { source: keyof typeof jobSources; searchBy: "orderId" | "jobId" | "email" | "providerJobId"; q: string; state: string; provider: string; environment: string; attention: boolean; from: string; to: string; page: number };
export function parseJobFilters(params: URLSearchParams): JobFilters {
  const read = (name: string, fallback = "") => {
    if (params.getAll(name).length > 1) throw new HttpError(400, "筛选参数不能重复。");
    return params.get(name)?.trim() || fallback;
  };
  const source = read("source", "legacy"), searchBy = read("searchBy", "orderId"), q = read("q");
  const state = read("state", "all"), provider = read("provider"), environment = read("environment"), attention = read("attention", "0"), page = read("page", "1");
  if (!Object.hasOwn(jobSources, source) || !["orderId", "jobId", "email", "providerJobId"].includes(searchBy) || !Object.hasOwn(source === "recorded" ? recordedJobStates : legacyJobStates, state) || (provider && !jobProviders.includes(provider)) || !["0", "1"].includes(attention)) throw new HttpError(400, "请选择有效的任务筛选条件。");
  if (!/^[1-9]\d{0,5}$/.test(page)) throw new HttpError(400, "页码须为 1 至 999999 的整数。");
  if ((source === "legacy" && (searchBy === "jobId" || environment)) || (environment && !["production", "test"].includes(environment))) throw new HttpError(400, "订单任务引用没有独立任务 ID 或可靠的环境记录。");
  if (q && ((["orderId", "jobId"].includes(searchBy) && !uuid.test(q)) || (searchBy === "email" && (q.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q))) || (searchBy === "providerJobId" && (q.length > 2048 || /[\x00-\x1f\x7f]/.test(q))))) throw new HttpError(400, "请输入完整有效的订单号、任务号、邮箱或供应商任务引用。");
  const date = (name: string) => {
    const value = read(name);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new HttpError(400, "请输入有效日期（YYYY-MM-DD）。");
    return value;
  };
  const from = date("from"), to = date("to");
  if (from && to && from > to) throw new HttpError(400, "开始日期不能晚于结束日期。");
  return { source, searchBy, q, state, provider, environment, attention: attention === "1", from, to, page: Number(page) } as JobFilters;
}

type LegacyRow = { id: string; email: string | null; recipient_name: string; status: string; music_provider: string | null; music_model: string | null; provider_job_id: string | null; generation_error: string | null; created_at: string; updated_at: string; final_assets: { id: string }[] };
type RecordedRow = { id: string; order_id: string; attempt_no: number; environment: string; provider: string; model: string; provider_job_id: string | null; state: string; error_code: string | null; final_asset_id: string | null; started_at: string; updated_at: string; completed_at: string | null; order: { email: string | null; recipient_name: string } };
export type AdminJobSummary = { id: string | null; orderId: string; orderEmail: string | null; recipientName: string; provider: string | null; model: string | null; providerJobId: string | null; state: string; environment: string | null; attemptNo: number | null; errorCode: string | null; hasFinalAudio: boolean; recordedAt: string; updatedAt: string; completedAt: string | null; elapsedSeconds: number | null };
export type AdminJobList = { source: JobFilters["source"]; jobs: AdminJobSummary[]; total: number; page: number; pageSize: number; totalPages: number };

function recordedElapsed(row: RecordedRow) {
  const end = row.completed_at ? Date.parse(row.completed_at) : ["submitting", "queued", "processing", "storing", "needs_review"].includes(row.state) ? Date.now() : NaN;
  const elapsed = end - Date.parse(row.started_at);
  return Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed / 1000) : null;
}

// Current administrator membership must be checked before this privileged read.
// No provider calls, leases, signed links, raw errors or order mutations here.
export async function listAdminJobs(filters: JobFilters): Promise<AdminJobList> {
  const recorded = filters.source === "recorded", db = getSupabaseAdmin();
  let query = recorded
    ? db.from("generation_jobs").select("id,order_id,attempt_no,environment,provider,model,provider_job_id,state,error_code,final_asset_id,started_at,updated_at,completed_at,order:song_orders!inner(email,recipient_name)", { count: "exact" })
    : db.from("song_orders").select("id,email,recipient_name,status,music_provider,music_model,provider_job_id,generation_error,created_at,updated_at,final_assets:song_assets(id)", { count: "exact" }).eq("final_assets.is_final", true).limit(1, { referencedTable: "final_assets" }).or(filters.attention ? `and(or(${LEGACY_TASK_FILTER}),or(${REVIEW_FILTER}))` : LEGACY_TASK_FILTER);
  if (filters.q) {
    if (filters.searchBy === "email") query = query.ilike(recorded ? "order.email" : "email", filters.q.replace(/[\\%_]/g, "\\$&"));
    else query = query.eq(filters.searchBy === "providerJobId" ? "provider_job_id" : recorded && filters.searchBy === "orderId" ? "order_id" : "id", filters.q);
  }
  if (filters.state !== "all") query = query.eq(recorded ? "state" : "status", filters.state);
  if (filters.provider) query = query.eq(recorded ? "provider" : "music_provider", filters.provider);
  if (filters.environment) query = query.eq("environment", filters.environment);
  if (filters.attention) {
    if (recorded) query = query.or(RECORDED_ATTENTION_FILTER);
    // The legacy predicate was grouped once when constructing the query;
    // repeated .or() calls can append duplicate keys in the SDK.
    else query = query.is("final_assets", null);
  }
  const dateColumn = recorded ? "started_at" : "created_at";
  if (filters.from) query = query.gte(dateColumn, new Date(`${filters.from}T00:00:00+08:00`).toISOString());
  if (filters.to) query = query.lt(dateColumn, new Date(Date.parse(`${filters.to}T00:00:00+08:00`) + 86400000).toISOString());
  const start = (filters.page - 1) * JOB_PAGE_SIZE;
  const { data, error, count } = await query.order(dateColumn, { ascending: false }).order("id", { ascending: false }).range(start, start + JOB_PAGE_SIZE - 1);
  if (error || !Array.isArray(data) || count === null || !Number.isSafeInteger(count) || count < 0) throw new HttpError(503, "任务记录暂时不可用，请稍后重试。");
  const jobs: AdminJobSummary[] = recorded
    ? (data as unknown as RecordedRow[]).map(row => ({ id: row.id, orderId: row.order_id, orderEmail: row.order.email, recipientName: row.order.recipient_name, provider: row.provider, model: row.model, providerJobId: row.provider_job_id, state: row.state, environment: row.environment, attemptNo: row.attempt_no, errorCode: row.error_code === null ? null : Object.hasOwn(jobErrors, row.error_code) ? row.error_code : "unknown", hasFinalAudio: row.final_asset_id !== null, recordedAt: row.started_at, updatedAt: row.updated_at, completedAt: row.completed_at, elapsedSeconds: recordedElapsed(row) }))
    : (data as unknown as LegacyRow[]).map(row => ({ id: null, orderId: row.id, orderEmail: row.email, recipientName: row.recipient_name, provider: row.music_provider, model: row.music_model, providerJobId: row.provider_job_id, state: row.status, environment: null, attemptNo: null, errorCode: row.generation_error !== null ? "legacy_error" : null, hasFinalAudio: row.final_assets.length > 0, recordedAt: row.created_at, updatedAt: row.updated_at, completedAt: null, elapsedSeconds: null }));
  return { source: filters.source, jobs, total: count, page: filters.page, pageSize: JOB_PAGE_SIZE, totalPages: Math.ceil(count / JOB_PAGE_SIZE) };
}

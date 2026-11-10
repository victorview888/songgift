import "server-only";
import { createHash, createHmac } from "node:crypto";
import { HttpError } from "@/lib/http-error";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { contentCategories } from "./categories";

export const reportStates = ["received", "reviewing", "needs_information", "action_taken", "no_violation"] as const;
export type ReportState = typeof reportStates[number];
export type ContentReport = { id: string; category: string; content_reference: string; details: string; contact_email: string | null; status: ReportState; created_at: string; updated_at: string; reviews: { status: string; note: string; created_at: string }[] };
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function submitContentReport(request: Request) {
  if (Number(request.headers.get("content-length")) > 16000) throw new HttpError(413, "Please shorten the report.");
  const text = await request.text();
  if (text.length > 16000) throw new HttpError(413, "Please shorten the report.");
  const body = JSON.parse(text);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Please check the report.");
  const category = clean(body.category), reference = clean(body.reference), details = clean(body.details), email = clean(body.email).toLowerCase();
  if (!uuid(body.requestId) || !contentCategories.includes(category as typeof contentCategories[number]) || reference.length < 1 || reference.length > 1000 || details.length < 20 || details.length > 4000 || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) || clean(body.website)) throw new HttpError(400, "Check the category, content reference, description and contact email.");
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new HttpError(503, "Reports are temporarily unavailable. Please try again later.");
  const networkHash = createHmac("sha256", secret).update(request.headers.get("cf-connecting-ip") || "unknown-network").digest("hex");
  const inputHash = createHash("sha256").update(JSON.stringify({ category, reference, details, email })).digest("hex");
  const { data, error } = await getSupabaseAdmin().rpc("submit_songgift_content_report", { p_id: body.requestId, p_category: category, p_reference: reference, p_details: details, p_email: email || null, p_input_hash: inputHash, p_network_hash: networkHash });
  if (error || !data) {
    if (error?.message === "report_rate_limit") throw new HttpError(429, "Too many reports from this connection. Please try again in an hour.");
    if (error?.message === "report_conflict") throw new HttpError(409, "This report reference was already used for different details. Start a new report.");
    throw new HttpError(503, "Your report could not be confirmed. Keep these details and retry with the same reference.");
  }
  return { reference: data.reference as string };
}

export async function listContentReports(params: URLSearchParams) {
  const pageValue = params.get("page") || "1", status = params.get("status") || "all";
  if (!/^[1-9]\d{0,3}$/.test(pageValue) || (status !== "all" && !reportStates.includes(status as ReportState))) throw new HttpError(400, "Invalid report filter.");
  const page = Number(pageValue);
  let query = getSupabaseAdmin().from("content_reports").select("id,category,content_reference,details,contact_email,status,created_at,updated_at,reviews:content_report_reviews(status,note,created_at)", { count: "exact" });
  if (status !== "all") query = query.eq("status", status);
  const { data, error, count } = await query.order("created_at", { ascending: false, referencedTable: "content_report_reviews" }).limit(5, { referencedTable: "content_report_reviews" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error || !data || count === null) throw new HttpError(503, "举报记录暂时无法读取，请重试。");
  return { reports: data as ContentReport[], page, total: count, totalPages: Math.ceil(count / 20), status };
}

export async function reviewContentReport(id: string, actorId: string, body: Record<string, unknown>) {
  const note = clean(body.note), status = clean(body.status);
  if (!uuid(id) || !uuid(body.requestId) || !reportStates.filter(state => state !== "received").includes(status as Exclude<ReportState, "received">) || note.length < 10 || note.length > 2000 || typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt))) throw new HttpError(400, "请选择处理状态并填写 10–2000 字的核查记录。");
  const { data, error } = await getSupabaseAdmin().rpc("review_songgift_content_report", { p_id: id, p_actor_id: actorId, p_status: status, p_note: note, p_request_id: body.requestId, p_expected_updated_at: body.updatedAt });
  if (error || !data) {
    if (error?.message === "admin_denied") throw new HttpError(403, "管理员权限已失效。");
    if (error?.message === "report_not_found") throw new HttpError(404, "举报不存在。");
    if (error?.message === "report_conflict") throw new HttpError(409, "记录已更新或请求内容已变化，请刷新后核对。");
    throw new HttpError(503, "处理结果暂时无法确认，请保留原请求后重试。");
  }
  return data as { id: string; status: ReportState; updatedAt: string };
}

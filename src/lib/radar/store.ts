import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/http-error";
import { assertRadarId, type RadarReport } from "./report";

export async function saveRadarReport(report: RadarReport) {
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
  const { data, error } = await getSupabaseAdmin().rpc("store_songgift_radar_report", { p_report: report, p_hash: hash });
  if (error) throw new HttpError(error.code === "23505" ? 409 : 503, error.code === "23505" ? "相同运行编号已保存其他报告。" : "报告暂时无法保存，请重试。");
  return data as { id: string; duplicate: boolean };
}
export type RadarSummary = { id: string; generated_at: string; created_at: string; status: "complete" | "partial" | "failed"; item_count: number; source_count: number; error_count: number; run_id: string; run_attempt: number };
export function radarPage(params: URLSearchParams) {
  const raw = params.get("page") || "1";
  if (params.getAll("page").length > 1 || !/^[1-9]\d{0,3}$/.test(raw)) throw new HttpError(400, "页码无效。");
  return Number(raw);
}
export async function listRadarReports(page: number) {
  const { data, count, error } = await getSupabaseAdmin().from("radar_reports")
    .select("id,generated_at,created_at,status,item_count,source_count,error_count,run_id,run_attempt", { count: "exact" })
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 10, page * 10 - 1);
  if (error) throw new HttpError(503, "报告列表暂时不可用，请重试。");
  return { reports: (data || []) as RadarSummary[], total: count || 0, page, totalPages: Math.ceil((count || 0) / 10), checkedAt: new Date().toISOString() };
}
export async function getRadarReport(id: string) {
  assertRadarId(id);
  const { data, error } = await getSupabaseAdmin().from("radar_reports").select("id,generated_at,created_at,status,report,run_id,run_attempt").eq("id", id).maybeSingle();
  if (error) throw new HttpError(503, "报告暂时不可用，请重试。");
  if (!data) throw new HttpError(404, "报告不存在或已超过保留期限。");
  return data as { id: string; generated_at: string; created_at: string; status: RadarSummary["status"]; report: RadarReport; run_id: string; run_attempt: number };
}

import "server-only";
import { HttpError } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { overviewWindow, REVIEW_FILTER } from "./order-metrics";

export type AdminOverview = {
  generatedAt: string; day: string; timeZone: "Asia/Shanghai";
  counts: { orders: number; createdToday: number; paid: number; withFinalAudio: number; generating: number; needsReview: number };
  links: { orders: string; createdToday: string; paid: string; withFinalAudio: string; generating: string; needsReview: string };
};

// Caller checks current administrator membership first. Exact HEAD counts read
// no customer rows and need only existing order/asset tables, not new migrations.
export async function getAdminOverview(now = new Date()): Promise<AdminOverview> {
  try {
    const { day, start, end } = overviewWindow(now);
    const db = getSupabaseAdmin();
    const basic = () => db.from("song_orders").select("id", { count: "exact", head: true });
    const undelivered = () => db.from("song_orders").select("id,final_assets:song_assets(id)", { count: "exact", head: true }).eq("final_assets.is_final", true).is("final_assets", null);
    const results = await Promise.all([
      basic(),
      basic().gte("created_at", start).lt("created_at", end),
      basic().not("paid_at", "is", null),
      db.from("song_orders").select("id,final_assets:song_assets!inner(id)", { count: "exact", head: true }).eq("final_assets.is_final", true),
      undelivered().eq("status", "generating"),
      undelivered().or(REVIEW_FILTER),
    ]);
    if (results.some(result => result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count! < 0)) throw new Error("counts_unavailable");
    const [orders, createdToday, paid, withFinalAudio, generating, needsReview] = results.map(result => result.count!);
    return {
      generatedAt: new Date().toISOString(), day, timeZone: "Asia/Shanghai",
      counts: { orders, createdToday, paid, withFinalAudio, generating, needsReview },
      links: { orders: "/admin/orders", createdToday: `/admin/orders?from=${day}&to=${day}`, paid: "/admin/orders?payment=recorded", withFinalAudio: "/admin/orders?delivery=delivered", generating: "/admin/orders?delivery=generating", needsReview: "/admin/orders?delivery=review" },
    };
  } catch {
    throw new HttpError(503, "经营统计暂时不可用，请稍后刷新。");
  }
}

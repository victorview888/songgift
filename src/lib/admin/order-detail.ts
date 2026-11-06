import "server-only";
import { HttpError } from "@/lib/http-error";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isOrderId } from "@/lib/supabase/orders";

export type AdminAsset = {
  id: string; asset_type: string; mime_type: string; duration_seconds: number | null;
  provider: string; model_id: string; provider_job_id: string | null;
  is_final: boolean; created_at: string;
};
export type AdminOrder = {
  id: string; user_id: string | null; email: string | null; recipient_name: string;
  relationship: string | null; occasion: string; story: string; mood: string | null;
  style: string | null; title: string | null; lyrics_text: string | null;
  status: string; paid_at: string | null; paypal_order_id: string | null;
  music_provider: string | null; music_model: string | null; provider_job_id: string | null;
  created_at: string; updated_at: string;
};
export type AdminOrderDetail = {
  order: AdminOrder; assets: AdminAsset[]; assetsTruncated: boolean; hasFinalAudio: boolean;
  timeline: { key: string; at: string; title: string; detail: string }[];
};

export function assertAdminOrderId(id: string) {
  if (!isOrderId(id)) throw new HttpError(404, "订单或音频记录不存在。");
}

// Privileged service; caller must check current membership first. No provider
// calls, audio signing, writes or inferred historical payment values on reads.
export async function getAdminOrderDetail(id: string): Promise<AdminOrderDetail> {
  assertAdminOrderId(id);
  const columns = "id,user_id,email,recipient_name,relationship,occasion,story,mood,style,title,lyrics_text,status,paid_at,paypal_order_id,music_provider,music_model,provider_job_id,created_at,updated_at";
  const { data, error } = await getSupabaseAdmin().from("song_orders")
    .select(`${columns},song_assets(id,asset_type,mime_type,duration_seconds,provider,model_id,provider_job_id,is_final,created_at),final_assets:song_assets(id)`)
    .eq("id", id).eq("final_assets.is_final", true).limit(1, { referencedTable: "final_assets" })
    .order("created_at", { referencedTable: "song_assets", ascending: false })
    .order("id", { referencedTable: "song_assets", ascending: false })
    .limit(101, { referencedTable: "song_assets" }).maybeSingle();
  if (error) throw new HttpError(503, "订单详情暂时不可用，请稍后重试。");
  if (!data) throw new HttpError(404, "订单或音频记录不存在。");
  const { song_assets, final_assets, ...order } = data as unknown as AdminOrder & { song_assets: AdminAsset[]; final_assets: { id: string }[] };
  const assets = song_assets.slice(0, 100);
  // Evidence only: these timestamps do not establish lyric approval, provider
  // completion, capture amount, delivery email, or a full generation history.
  const timeline = [{ key: "created", at: order.created_at, title: "订单创建", detail: "来源：订单创建时间" }];
  if (order.paid_at) timeline.push({ key: "paid", at: order.paid_at, title: "本地记录付款", detail: "来源：paid_at；核实结果见已登记支付流水" });
  for (const asset of assets) timeline.push({ key: asset.id, at: asset.created_at, title: asset.is_final ? "最终音频资产登记" : "音频资产登记", detail: `来源：资产 ${asset.id}；不代表已实时检查 Storage 文件` });
  timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.key.localeCompare(b.key));
  return { order, assets, assetsTruncated: song_assets.length > 100, hasFinalAudio: final_assets.length > 0, timeline };
}

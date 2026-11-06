import { HttpError } from "@/lib/http-error";
import type { AccountOrder } from "@/lib/types/account";
import { getSupabaseAdmin } from "./admin";

export const orderColumns = "id,status,recipient_name,relationship,occasion,story,mood,style,title,lyrics_text,paid_at,created_at,updated_at,provider_job_id,active_generation_job_id,generation_error,song_assets(id,mime_type,created_at,is_final)";
export const isOrderId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

export async function getOwnedOrder(id: string, userId: string): Promise<AccountOrder> {
  if (!isOrderId(id)) throw new HttpError(404, "Song order not found.");
  const { data, error } = await getSupabaseAdmin().from("song_orders").select(orderColumns).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(503, "Your song records are temporarily unavailable.");
  if (!data) throw new HttpError(404, "Song order not found.");
  return { ...data, song_assets: data.song_assets.filter((asset: { is_final: boolean }) => asset.is_final) } as AccountOrder;
}

export async function saveApprovedLyrics(id: string, userId: string, lyrics: string) {
  if (lyrics.trim().length < 20 || lyrics.length > 12000) throw new HttpError(400, "Please enter lyrics between 20 and 12,000 characters.");
  const order = await getOwnedOrder(id, userId);
  if (order.active_generation_job_id || order.provider_job_id || order.song_assets.length || !["draft", "lyrics_ready", "paid"].includes(order.status)) throw new HttpError(409, "This song has already started. Open it from My Songs.");
  const { data, error } = await getSupabaseAdmin().from("song_orders").update({ lyrics_text: lyrics.trim(), updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).is("provider_job_id", null).is("active_generation_job_id", null).in("status", ["draft", "lyrics_ready", "paid"]).select("id").maybeSingle();
  if (error) throw new Error("Could not save approved lyrics: " + error.message);
  if (!data) throw new HttpError(409, "Your song has already started. Open it from My Songs.");
  return order;
}

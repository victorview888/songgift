import "server-only";
import type { AdminIdentity } from "@/lib/auth/admin";
import { HttpError } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertAdminOrderId } from "./order-detail";

// Audit rows contain IDs, action and issuance state only. Never store a signed
// URL, object path, credentials, customer story, request headers or raw errors.
export async function issueAdminAudioLink(input: { orderId: string; assetId: string; download: boolean; admin: AdminIdentity }) {
  assertAdminOrderId(input.orderId);
  assertAdminOrderId(input.assetId);
  const db = getSupabaseAdmin();
  const asset = await db.from("song_assets")
    .select("id,order_id,storage_bucket,storage_path,mime_type")
    .eq("order_id", input.orderId).eq("id", input.assetId).eq("is_final", true).maybeSingle();
  if (asset.error) throw new HttpError(503, "音频查询暂时不可用。");
  if (!asset.data) throw new HttpError(404, "订单或音频记录不存在。");
  const requestId = crypto.randomUUID();
  const audit = await db.from("admin_audit_logs").insert({
    request_id: requestId, actor_user_id: input.admin.userId,
    action: input.download ? "audio.download" : "audio.preview",
    target_type: "song_asset", target_id: input.assetId, order_id: input.orderId, result: "requested",
  });
  if (audit.error) throw new HttpError(503, "无法记录音频访问，请稍后重试。");

  let signedUrl: string;
  try {
    const extension = asset.data.mime_type.includes("wav") ? "wav" : "mp3";
    const signed = await db.storage.from(asset.data.storage_bucket).createSignedUrl(
      asset.data.storage_path, 60, input.download ? { download: `SongGift-${input.orderId}.${extension}` } : undefined,
    );
    if (signed.error || !signed.data?.signedUrl) throw new Error("signing_failed");
    signedUrl = signed.data.signedUrl;
  } catch {
    try { await db.from("admin_audit_logs").update({ result: "failed" }).eq("request_id", requestId); } catch { /* Keep the pending audit row; never release a link. */ }
    throw new HttpError(503, "暂时无法创建音频访问链接。");
  }
  // Release the capability only after the issuance record has been persisted.
  const recorded = await db.from("admin_audit_logs").update({ result: "issued" })
    .eq("request_id", requestId).select("request_id").maybeSingle();
  if (recorded.error || !recorded.data) throw new HttpError(503, "无法记录音频访问，请稍后重试。");
  return signedUrl;
}

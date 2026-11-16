// Bounded scheduled recovery adapted from ShrimpReel (MIT),
// e1447714d61eb67af653c931e917dce7b63012b0/src/server/jobs.ts.
// License: third-party/shrimpreel/LICENSE. Only existing SongGift tasks are processed.
import "server-only";
import { processExistingGeneration } from "./generation";
import { deliveryRpc, queueReadyNotifications, sendDueNotifications } from "./notifications";
import { audioPreviewEnabled } from "@/lib/preview-policy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processAudioPreview, unlockAudioPreview, type AudioPreview } from "./audio-preview";
import { getOwnedOrder } from "@/lib/supabase/orders";

export async function runMaintenance() {
  const lease = await deliveryRpc<{ started: boolean; lease_token?: string }>("begin_songgift_maintenance");
  if (!lease?.started || !lease.lease_token) return { started: false, jobs: 0, mail: 0 };
  const deadline = Date.now() + 90_000;
  let jobs = 0, mail = 0, failed = false;
  try {
    const due = await deliveryRpc<{ id: string; order_id: string }[]>("list_due_songgift_jobs", { p_limit: 3 });
    for (const row of due || []) {
      if (Date.now() >= deadline) break;
      try { await processExistingGeneration(row.id, row.order_id, { automatic: true }); }
      catch { failed = true; }
      jobs++;
    }
    if (audioPreviewEnabled() && Date.now() < deadline) {
      const previews = await getSupabaseAdmin().from("audio_previews").select("*").in("state", ["pending", "submitting", "queued", "processing", "storing", "needs_review"]).order("updated_at").limit(3);
      if (previews.error) failed = true;
      for (const source of previews.data || []) {
        if (Date.now() >= deadline) break;
        try {
          const p = await processAudioPreview(source as AudioPreview);
          if (p.state === "ready" && p.order_id && p.user_id) {
            const order = await getOwnedOrder(p.order_id, p.user_id);
            if (order.paid_at && !order.song_assets.length) await unlockAudioPreview(order, p.user_id);
          }
        } catch { failed = true; }
        jobs++;
      }
    }
    if (Date.now() < deadline && await queueReadyNotifications(deadline) > 0) failed = true;
    if (Date.now() < deadline) mail = await sendDueNotifications(deadline);
  } catch { failed = true; }
  await deliveryRpc("finish_songgift_maintenance", { p_lease_token: lease.lease_token, p_result: failed ? "failed" : "succeeded", p_jobs: jobs, p_mail: mail });
  return { started: true, jobs, mail, result: failed ? "failed" : "succeeded" };
}

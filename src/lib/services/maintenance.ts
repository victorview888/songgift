// Bounded scheduled recovery adapted from ShrimpReel (MIT),
// e1447714d61eb67af653c931e917dce7b63012b0/src/server/jobs.ts.
// License: third-party/shrimpreel/LICENSE. Only existing SongGift tasks are processed.
import "server-only";
import { processExistingGeneration } from "./generation";
import { deliveryRpc, queueReadyNotifications, sendDueNotifications } from "./notifications";

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
    if (Date.now() < deadline && await queueReadyNotifications(deadline) > 0) failed = true;
    if (Date.now() < deadline) mail = await sendDueNotifications(deadline);
  } catch { failed = true; }
  await deliveryRpc("finish_songgift_maintenance", { p_lease_token: lease.lease_token, p_result: failed ? "failed" : "succeeded", p_jobs: jobs, p_mail: mail });
  return { started: true, jobs, mail, result: failed ? "failed" : "succeeded" };
}

import "server-only";
import type { AccountOrder } from "@/lib/types/account";
import type { MusicGenerationResult } from "@/lib/types/song";
import { HttpError } from "@/lib/http-error";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMusicIdentity, getPinnedMusicProvider } from "@/lib/providers/factory";
import { canonicalMime, getJobAsset, getJobOutput, MAX_AUDIO_BYTES, persistJobAudio } from "@/lib/supabase/song-assets";
import { bindGeneration, cacheGenerationOutput, claimGeneration, completeGenerationAudio, reserveGeneration, settleGeneration, type GenerationJob } from "./order-operations";
import { deliveryRpc, enqueueReadyNotification } from "./notifications";

type ProcessingOptions = { authorize?: () => Promise<void>; automatic?: boolean; storageOnly?: boolean; strictBusy?: boolean };
export async function findGenerationJob(id: string, orderId: string): Promise<GenerationJob> {
  const { data, error } = await getSupabaseAdmin().from("generation_jobs").select("id,order_id,provider,model,environment,provider_job_id,state,lease_expires_at,final_asset_id,error_code").eq("id", id).eq("order_id", orderId).maybeSingle();
  if (error) throw new HttpError(503, "Song processing records are temporarily unavailable.");
  if (!data) throw new HttpError(404, "Song generation not found.");
  return data as GenerationJob;
}

async function findJob(orderId: string): Promise<GenerationJob | null> {
  const { data, error } = await getSupabaseAdmin().from("generation_jobs").select("id,order_id,provider,model,environment,provider_job_id,state,lease_expires_at,final_asset_id,error_code").eq("order_id", orderId).order("attempt_no", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new HttpError(503, "Song processing records are temporarily unavailable.");
  return data as GenerationJob | null;
}
function progress(job: GenerationJob) {
  return { orderId: job.order_id, generationJobId: job.id, providerJobId: job.provider_job_id || undefined, provider: job.provider, model: job.model,
    phase: job.state, status: job.state === "completed" ? "completed" : job.state === "failed" ? "failed" : job.state === "needs_review" ? "needs_review" : job.state === "queued" ? "queued" : "processing",
    ...(job.state === "completed" ? { audioUrl: "/api/orders/" + job.order_id + "/audio", persistenceStatus: "saved" } : {}),
    message: job.state === "needs_review" ? "Your order is saved and needs assistance. No new song has been requested." : job.state === "storing" ? "Your song is ready and is being saved." : job.state === "failed" ? "The music service could not complete this song. Your order is saved." : "Your song progress is saved." };
}
async function release(job: GenerationJob, state: "failed" | "storing" | "needs_review" | "queued" | "processing", errorCode: "submission_unknown" | "provider_failed" | "storage_failed" | "query_failed" | null) {
  return settleGeneration({ jobId: job.id, leaseToken: job.lease_token!, state, errorCode });
}
async function store(job: GenerationJob, options: ProcessingOptions = {}) {
  try {
    const asset = await persistJobAudio(job, options.authorize);
    await options.authorize?.();
    const completed = await completeGenerationAudio(job.id, job.lease_token!, asset);
    // Sending is scheduled separately; enqueue failure never rolls back delivery.
    try { await enqueueReadyNotification(completed.id); } catch { console.error("Song notification enqueue unavailable."); }
    return progress(completed);
  } catch (error) {
    // Includes upload, metadata registration and finish-transaction failures.
    // None of these authorizes another provider submission.
    await release(job, "storing", "storage_failed");
    if (error instanceof HttpError && [401, 403].includes(error.status)) throw error;
    throw new HttpError(503, "Your song result is saved for recovery. Please check again shortly.");
  }
}
async function consumeResult(job: GenerationJob, result: MusicGenerationResult, options: ProcessingOptions = {}) {
  if (result.provider !== job.provider || (result.providerJobId && job.provider_job_id && result.providerJobId !== job.provider_job_id)) {
    return progress(await release(job, job.state === "storing" ? "storing" : "needs_review", "query_failed"));
  }
  if (result.status === "failed") return progress(await release(job, job.state === "storing" ? "storing" : "failed", job.state === "storing" ? "storage_failed" : "provider_failed"));
  if (result.status === "completed") {
    if (!result.audioUrl && !result.audioBase64) return progress(await release(job, "needs_review", "query_failed"));
    try {
      const mimeType = canonicalMime(result.mimeType);
      let audioBase64: string | undefined;
      if (result.audioBase64) {
        audioBase64 = result.audioBase64.replace(/^data:[^,]*,/, "").replace(/-/g, "+").replace(/_/g, "/");
        if (audioBase64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) throw new Error("Invalid audio payload.");
      }
      job = await cacheGenerationOutput(job.id, job.lease_token!, { audioUrl: audioBase64 ? undefined : result.audioUrl, audioBase64, mimeType });
    } catch {
      await release(job, "storing", "storage_failed");
      throw new HttpError(503, "Your song needs a result-saving check. No new song will be requested.");
    }
    return store(job, options);
  }
  if (result.status !== "queued" && result.status !== "processing") return progress(await release(job, "needs_review", "query_failed"));
  return progress(await release(job, job.state === "storing" ? "storing" : result.status, job.state === "storing" ? "storage_failed" : null));
}
async function checkJob(original: GenerationJob, options: ProcessingOptions = {}) {
  if (["completed", "failed"].includes(original.state)) return progress(original);
  if (options.storageOnly && !["storing", "needs_review"].includes(original.state)) throw new HttpError(409, "尚无可恢复的音频结果，请先同步原任务。");
  if (!options.automatic && original.lease_expires_at && Date.parse(original.lease_expires_at) > Date.now()) {
    if (options.strictBusy) throw new HttpError(409, "原任务正在处理，请稍后核查。");
    return progress(original);
  }
  await options.authorize?.();
  let job: GenerationJob;
  try {
    const claimed = options.automatic ? await deliveryRpc<GenerationJob>("claim_songgift_automatic_job", { p_job_id: original.id }) : await claimGeneration(original.id);
    if (!claimed) return progress(original);
    job = claimed;
  }
  catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      if (options.strictBusy) throw error;
      const current = await findJob(original.order_id);
      if (current) return progress(current);
    }
    throw error;
  }
  if (!job.lease_token) return progress(job); // Expired submission was marked unknown.
  try {
    if (await getJobAsset(job)) return store({ ...job, state: "storing" }, options);
    const output = await getJobOutput(job.id);
    if (output && (options.storageOnly || !(output.audio_url && job.provider_job_id && job.error_code === "storage_failed"))) {
      if (job.state !== "storing") job = await cacheGenerationOutput(job.id, job.lease_token!, { audioUrl: output.audio_url || undefined, audioBase64: output.audio_base64 || undefined, mimeType: output.mime_type });
      return store(job, options);
    }
  } catch {
    await release(job, job.state === "storing" ? "storing" : "needs_review", job.state === "storing" ? "storage_failed" : "query_failed");
    throw new HttpError(503, "Song recovery is temporarily unavailable.");
  }
  if (options.storageOnly) {
    await release(job, job.state === "storing" ? "storing" : "needs_review", job.state === "storing" ? "storage_failed" : "query_failed");
    throw new HttpError(409, "尚无可恢复的音频结果，请先同步原任务。");
  }
  if (!job.provider_job_id) return progress(await release(job, "needs_review", "submission_unknown"));
  await options.authorize?.();
  let result: MusicGenerationResult;
  try {
    const provider = getPinnedMusicProvider(job);
    if (!provider.getStatus) return progress(await release(job, "needs_review", "query_failed"));
    result = await provider.getStatus(job.provider_job_id);
  } catch {
    return progress(await release(job, job.state === "storing" ? "storing" : "needs_review", job.state === "storing" ? "storage_failed" : "query_failed"));
  }
  return consumeResult(job, result, options);
}
export async function startOrderGeneration(order: AccountOrder, userId: string) {
  if (order.song_assets.length) return { orderId: order.id, status: "completed" };
  const existing = await findJob(order.id);
  if (existing) return checkJob(existing);
  if (order.provider_job_id || ["generating", "failed", "completed"].includes(order.status)) throw new HttpError(409, "This existing song task needs verification. No new song has been requested.");
  if (!order.lyrics_text) throw new HttpError(400, "Please review and save your lyrics first.");
  const identity = getMusicIdentity();
  if (!order.paid_at && identity.provider !== "mock") throw new HttpError(402, "Please complete payment before creating your song.");
  const reserved = await reserveGeneration({ orderId: order.id, userId, requestId: order.id, ...identity });
  if (!reserved.created) return checkJob(reserved.job);
  let job = reserved.job;
  if (!job.lease_token || !job.input_snapshot) throw new HttpError(503, "This song task needs assistance.");
  let result: MusicGenerationResult;
  try { result = await getPinnedMusicProvider(job).generateSong(job.input_snapshot); }
  catch {
    await release(job, "needs_review", "submission_unknown");
    throw new HttpError(502, "We couldn't confirm the song submission. Your order is saved for assistance.");
  }
  // Bind known references before caching/downloading audio, so recovery can query them.
  try {
    if (result.provider !== job.provider) throw new Error("Provider mismatch.");
    if (result.providerJobId || result.status === "completed") {
      const bound = await bindGeneration({ jobId: job.id, leaseToken: job.lease_token!, providerJobId: result.providerJobId || null,
        state: result.status === "completed" ? "storing" : result.status === "processing" ? "processing" : "queued" });
      if (result.status !== "completed") return consumeResult(bound, result);
      job = bound;
    }
  } catch {
    await release(job, "needs_review", "submission_unknown");
    throw new HttpError(503, "The song submission needs verification. Your order is saved.");
  }
  return consumeResult(job, result);
}
export async function checkOrderGeneration(order: AccountOrder, identifier: string) {
  const job = await findJob(order.id);
  if (!job || (identifier !== job.id && identifier !== job.provider_job_id)) throw new HttpError(404, "Song generation not found.");
  return checkJob(job);
}
// Used by administrators and Cron. This entry never reserves or submits a song.
export async function processExistingGeneration(id: string, orderId: string, options: ProcessingOptions) {
  return checkJob(await findGenerationJob(id, orderId), options);
}

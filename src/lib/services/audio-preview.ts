import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMusicIdentity, getPinnedMusicProvider } from "@/lib/providers/factory";
import { HttpError } from "@/lib/http-error";
import { makePreviewClip } from "@/lib/audio/preview-clip";
import { audioPreviewEnabled, previewDailyLimit } from "@/lib/preview-policy";
import { generationStoragePath, type GenerationJob } from "./order-operations";
import { audioMime, MAX_AUDIO_BYTES, sourceBytes } from "@/lib/supabase/song-assets";
import { moderateSongText } from "@/lib/safety/moderation";
import { enqueueReadyNotification } from "./notifications";
import type { MusicGenerationInput, MusicGenerationResult } from "@/lib/types/song";
import type { AccountOrder } from "@/lib/types/account";

export type AudioPreview = {
  id: string; kind: "customer" | "sample"; order_id: string | null; user_id: string | null;
  public_slug: string | null; title: string | null; batch_id: string | null; is_public: boolean;
  provider: string; model: string; environment: string; input_snapshot: MusicGenerationInput;
  provider_job_id: string | null; state: "pending" | "submitting" | "queued" | "processing" | "storing" | "ready" | "failed" | "needs_review";
  error_code: string | null;
  lease_token: string | null; lease_expires_at: string | null; next_check_at: string | null;
  source_url: string | null; source_base64: string | null; mime_type: string | null;
  storage_bucket: string | null; full_path: string | null; clip_path: string | null; clip_seconds: number | null;
  full_sha256: string | null; clip_sha256: string | null;
};
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const MAX_PREVIEW_SOURCE_BYTES = 12 * 1024 * 1024;
const notReady = "Your recording is still being prepared. Your payment is saved; check this order again shortly.";
async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseAdmin().rpc(name, params);
  if (error) {
    if (error.message === "order_not_found") throw new HttpError(404, "Song order not found.");
    if (error.message === "preview_allowance_used") throw new HttpError(409, "Your account has already used its free audio preview. You can still purchase another song.");
    if (error.message === "preview_daily_limit") throw new HttpError(429, "Free audio previews have reached today's limit. Your allowance is unchanged; try another day or purchase your song.");
    if (error.message === "payment_required") throw new HttpError(402, "Please complete payment to unlock the full song.");
    if (error.message === "preview_not_ready") throw new HttpError(409, notReady);
    if (["stale_lease", "preview_order_started", "preview_retry_limit", "preview_mismatch", "generation_input_immutable"].includes(error.message)) throw new HttpError(409, "This recording is already reserved or needs assistance. Check the existing song.");
    throw new HttpError(503, "Audio preview processing is temporarily unavailable.");
  }
  return data as T;
}
export async function findOrderPreview(orderId: string, userId?: string): Promise<AudioPreview | null> {
  let query = getSupabaseAdmin().from("audio_previews").select("*").eq("order_id", orderId).eq("kind", "customer");
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (!audioPreviewEnabled() && ["42P01", "PGRST205"].includes(error.code)) return null;
    throw new HttpError(503, "Your audio preview is temporarily unavailable.");
  }
  return data as AudioPreview | null;
}
async function findPreview(id: string): Promise<AudioPreview> {
  const { data, error } = await getSupabaseAdmin().from("audio_previews").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new HttpError(503, "Your audio preview is temporarily unavailable.");
  return data as AudioPreview;
}
async function settle(p: AudioPreview, state: AudioPreview["state"], fields: Record<string, unknown> = {}) {
  return rpc<AudioPreview>("settle_songgift_preview", { p_preview_id: p.id, p_lease_token: p.lease_token, p_state: state, ...fields });
}
async function saveObject(bucket: string, path: string, bytes: Uint8Array, mime: string) {
  const store = getSupabaseAdmin().storage.from(bucket);
  const { error } = await store.upload(path, Buffer.from(bytes), { contentType: mime, upsert: false });
  if (error) {
    const old = await store.download(path);
    if (old.error || !old.data || old.data.size !== bytes.length || hash(new Uint8Array(await old.data.arrayBuffer())) !== hash(bytes)) throw new Error("Preview storage is unavailable.");
  }
}
async function durableFull(p: AudioPreview): Promise<Uint8Array | null> {
  if (!p.storage_bucket || !p.full_path || !p.full_sha256) return null;
  const { data, error } = await getSupabaseAdmin().storage.from(p.storage_bucket).download(p.full_path);
  if (error || !data || data.size > MAX_PREVIEW_SOURCE_BYTES) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return hash(bytes) === p.full_sha256 ? bytes : null;
}
async function store(p: AudioPreview, recovered?: Uint8Array) {
  try {
    const bytes = recovered || await durableFull(p) || await sourceBytes({ audio_url: p.source_url, audio_base64: p.source_base64, mime_type: p.mime_type || "audio/mpeg" });
    if (bytes.length > MAX_PREVIEW_SOURCE_BYTES) throw new Error("Preview source is too large.");
    const clip = makePreviewClip(bytes), mime = audioMime(bytes);
    if (clip.mime !== mime) throw new Error("Unexpected preview encoding.");
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "songs";
    const fullPath = generationStoragePath(p.order_id || p.id, p.id, mime);
    const clipPath = fullPath.replace(/\/final\./, "/preview.");
    p = await settle(p, "storing", { p_keep_lease: true, p_bucket: bucket, p_full_path: fullPath, p_mime_type: mime, p_full_sha256: hash(bytes) });
    await saveObject(bucket, fullPath, bytes, mime);
    await saveObject(bucket, clipPath, clip.bytes, mime);
    return await settle(p, "ready", { p_bucket: bucket, p_full_path: fullPath, p_clip_path: clipPath,
      p_mime_type: mime, p_clip_seconds: clip.seconds, p_full_sha256: hash(bytes), p_clip_sha256: hash(clip.bytes) });
  } catch {
    await settle(p, "storing", { p_error_code: "storage_failed" });
    throw new HttpError(503, "Your recording is saved for recovery. Check again shortly; no new recording will be requested.");
  }
}
async function consume(p: AudioPreview, result: MusicGenerationResult) {
  if (result.provider !== p.provider || result.providerJobId && p.provider_job_id && result.providerJobId !== p.provider_job_id)
    return settle(p, "needs_review", { p_error_code: "query_failed" });
  if (result.status === "failed") return settle(p, "failed", { p_error_code: "provider_failed", p_provider_job_id: result.providerJobId || p.provider_job_id });
  if (result.status === "queued" || result.status === "processing") {
    if (!result.providerJobId && !p.provider_job_id) return settle(p, "needs_review", { p_error_code: "submission_unknown" });
    return settle(p, result.status, { p_provider_job_id: result.providerJobId || p.provider_job_id });
  }
  if (result.status !== "completed" || !result.audioUrl && !result.audioBase64) return settle(p, "needs_review", { p_error_code: "query_failed" });
  // Cache the source with the original provider ID before attempting any download.
  const stored = await settle(p, "storing", { p_keep_lease: true, p_provider_job_id: result.providerJobId || p.provider_job_id,
    p_source_url: result.audioUrl || null, p_source_base64: result.audioBase64 || null, p_mime_type: result.mimeType || "audio/mpeg" });
  return store(stored);
}
async function submit(p: AudioPreview) {
  try { await moderateSongText(JSON.stringify(p.input_snapshot)); }
  catch (error) { await settle(p, "failed", { p_error_code: "provider_failed" }); throw error; }
  let result: MusicGenerationResult;
  try { result = await getPinnedMusicProvider(p).generateSong(p.input_snapshot); }
  catch (error) {
    if (error instanceof Error && ["ProviderConfigurationError", "ProviderRequestRejectedError"].includes(error.name)) {
      await settle(p, "failed", { p_error_code: "provider_failed" });
      throw new HttpError(503, p.kind === "sample" ? error.message : "The music service could not accept this request. Your free allowance has been restored.");
    }
    await settle(p, "needs_review", { p_error_code: "submission_unknown" });
    throw new HttpError(502, "We could not confirm the submission. Your original request needs checking; it will not be submitted again automatically.");
  }
  return consume(p, result);
}
export async function processAudioPreview(preview: AudioPreview) {
  if (preview.state === "pending" && preview.kind === "sample") {
    const claimed = await rpc<AudioPreview | null>("claim_songgift_demo_submission", { p_preview_id: preview.id, p_batch_id: preview.batch_id });
    return claimed?.lease_token ? submit(claimed) : preview;
  }
  if (["pending", "ready", "failed"].includes(preview.state)) return preview;
  const claimed = await rpc<AudioPreview | null>("claim_songgift_preview", { p_preview_id: preview.id });
  if (!claimed) return findPreview(preview.id);
  if (!claimed.lease_token) return claimed;
  const recovered = await durableFull(claimed);
  if (recovered) return store(claimed, recovered);
  if (claimed.source_base64 || claimed.source_url && !(claimed.error_code === "storage_failed" && claimed.provider_job_id)) return store(claimed);
  if (!claimed.provider_job_id) return settle(claimed, "needs_review", { p_error_code: "submission_unknown" });
  let result: MusicGenerationResult;
  try {
    const provider = getPinnedMusicProvider(claimed);
    if (!provider.getStatus) throw new Error("Provider cannot poll.");
    result = await provider.getStatus(claimed.provider_job_id);
  } catch { return settle(claimed, "needs_review", { p_error_code: "query_failed" }); }
  return consume(claimed, result);
}
export async function startAudioPreview(order: AccountOrder, userId: string) {
  if (!audioPreviewEnabled()) throw new HttpError(503, "Free audio previews are not currently available.");
  const identity = getMusicIdentity();
  if (identity.provider !== "mock" && (identity.provider !== "fal" || !process.env.FAL_KEY?.trim())) throw new HttpError(503, "Audio previews are temporarily unavailable.");
  const reserved = await rpc<{ created: boolean; preview: AudioPreview }>("reserve_songgift_preview", {
    p_order_id: order.id, p_user_id: userId, p_daily_limit: previewDailyLimit(), p_provider: identity.provider, p_model: identity.model, p_environment: identity.environment,
  });
  return reserved.created ? submit(reserved.preview) : processAudioPreview(reserved.preview);
}
export async function previewSummary(order: AccountOrder, userId: string, advance = true) {
  let p = await findOrderPreview(order.id, userId);
  if (p && advance) p = await processAudioPreview(p);
  const { data, error } = await getSupabaseAdmin().from("audio_preview_allowances").select("preview_id").eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(503, "Your free preview allowance is temporarily unavailable.");
  return { enabled: audioPreviewEnabled(), canCreate: audioPreviewEnabled() && !order.paid_at && !data?.preview_id && (!p || p.state === "failed"),
    used: Boolean(data?.preview_id), state: p?.state || null, lyricsLocked: Boolean(p && p.state !== "failed"),
    audioUrl: p?.state === "ready" ? `/api/orders/${order.id}/preview/audio` : null, seconds: p?.clip_seconds ? Number(p.clip_seconds) : null,
    paid: Boolean(order.paid_at) };
}
export async function readPreviewBytes(p: AudioPreview, full = false) {
  if (p.state !== "ready" || !p.storage_bucket || !p.clip_path || !p.full_path) throw new HttpError(404, "Audio preview not found.");
  const path = full ? p.full_path : p.clip_path;
  const { data, error } = await getSupabaseAdmin().storage.from(p.storage_bucket).download(path);
  if (error || !data || data.size > MAX_AUDIO_BYTES) throw new HttpError(503, "Audio is temporarily unavailable.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (hash(bytes) !== (full ? p.full_sha256 : p.clip_sha256) || audioMime(bytes) !== p.mime_type) throw new HttpError(503, "This recording needs a storage check.");
  return bytes;
}
export async function unlockAudioPreview(order: AccountOrder, userId: string): Promise<GenerationJob | null> {
  let p = await findOrderPreview(order.id, userId);
  if (!p) return null;
  if (!order.paid_at) throw new HttpError(402, "Please complete payment to unlock the full song.");
  if (p.state !== "ready") p = await processAudioPreview(p);
  if (p.state !== "ready") throw new HttpError(409, p.state === "failed" || p.state === "needs_review" ? "Your paid order needs assistance with the original recording. Do not pay again." : notReady);
  await readPreviewBytes(p, true);
  const job = await rpc<GenerationJob>("promote_songgift_preview", { p_order_id: order.id, p_user_id: userId });
  try { await enqueueReadyNotification(job.id); } catch { console.error("Preview purchase notification enqueue unavailable."); }
  return job;
}

export async function advanceDemoBatch(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(404, "Demo operation not found.");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: batch, error } = await getSupabaseAdmin().from("audio_demo_batches").select("id,actor_id,expires_at").eq("token_hash", tokenHash).maybeSingle();
  if (error || !batch || Date.parse(batch.expires_at) <= Date.now()) throw new HttpError(404, "Demo operation not found.");
  const actor = await getSupabaseAdmin().from("admin_members").select("user_id").eq("user_id", batch.actor_id).eq("active", true).eq("role", "owner").maybeSingle();
  if (actor.error || !actor.data) throw new HttpError(403, "Demo authorization is no longer active.");
  const result = await getSupabaseAdmin().from("audio_previews").select("*").eq("batch_id", batch.id).eq("kind", "sample").order("created_at").limit(3);
  if (result.error || !result.data) throw new HttpError(503, "Demo tasks are temporarily unavailable.");
  const rows = result.data as AudioPreview[];
  const due = rows.find(p => p.state === "pending") || rows.find(p => !["ready", "failed"].includes(p.state) && (!p.next_check_at || Date.parse(p.next_check_at) <= Date.now()) && (!p.lease_expires_at || Date.parse(p.lease_expires_at) <= Date.now()));
  let updated: AudioPreview | undefined;
  if (due?.state === "pending") {
    const claimed = await rpc<AudioPreview | null>("claim_songgift_demo_submission", { p_preview_id: due.id, p_batch_id: batch.id });
    if (claimed?.lease_token) updated = await submit(claimed);
  } else if (due) updated = await processAudioPreview(due);
  if (updated) rows[rows.findIndex(p => p.id === updated!.id)] = updated;
  return { ready: rows.filter(p => p.state === "ready").length, total: rows.length, pending: rows.some(p => p.state !== "ready" && p.state !== "failed") };
}

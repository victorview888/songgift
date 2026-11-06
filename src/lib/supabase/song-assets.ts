import "server-only";
import { getSupabaseAdmin } from "./admin";
import { generationStoragePath, type GenerationJob } from "@/lib/services/order-operations";

export type CachedAudio = { audio_url: string | null; audio_base64: string | null; mime_type: string };
export type JobAsset = { id: string; storage_bucket: string; storage_path: string; mime_type: string };
export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export function canonicalMime(value?: string) {
  const mime = value?.split(";")[0].trim().toLowerCase() || "audio/mpeg";
  if (["audio/wave", "audio/x-wav"].includes(mime)) return "audio/wav";
  if (["audio/mp3", "audio/x-mpeg"].includes(mime)) return "audio/mpeg";
  if (!["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/mp4"].includes(mime)) throw new Error("Unsupported audio format.");
  return mime;
}
export function audioMime(bytes: Uint8Array): string {
  const head = Buffer.from(bytes.subarray(0, 16));
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error("Invalid audio size.");
  if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WAVE" && bytes.length >= 44) return "audio/wav";
  if (head.toString("ascii", 0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (head.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (head.toString("ascii", 0, 4) === "fLaC") return "audio/flac";
  if (head.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  throw new Error("The music service did not return recognizable audio.");
}
export async function getJobOutput(jobId: string): Promise<CachedAudio | null> {
  const { data, error } = await getSupabaseAdmin().from("generation_job_outputs").select("audio_url,audio_base64,mime_type").eq("job_id", jobId).maybeSingle();
  if (error) throw new Error("Audio recovery source is temporarily unavailable.");
  return data as CachedAudio | null;
}
export async function getJobAsset(job: GenerationJob): Promise<JobAsset | null> {
  const { data, error } = await getSupabaseAdmin().from("song_assets").select("id,storage_bucket,storage_path,mime_type").eq("order_id", job.order_id).eq("generation_job_id", job.id).eq("is_final", true).maybeSingle();
  if (error) throw new Error("Saved audio metadata is temporarily unavailable.");
  return data as JobAsset | null;
}
async function sourceBytes(source: CachedAudio) {
  if (source.audio_base64) {
    if (source.audio_base64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4) throw new Error("Audio is too large.");
    return Buffer.from(source.audio_base64, "base64");
  }
  const url = new URL(source.audio_url || "");
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid audio source.");
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25_000) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length") || 0) > MAX_AUDIO_BYTES) throw new Error("Could not download generated audio.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new Error("Audio is too large.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
async function storedBytes(asset: Pick<JobAsset, "storage_bucket" | "storage_path">) {
  const { data, error } = await getSupabaseAdmin().storage.from(asset.storage_bucket).download(asset.storage_path);
  if (error || !data || data.size > MAX_AUDIO_BYTES) throw new Error("Stored audio is temporarily unavailable.");
  const bytes = Buffer.from(await data.arrayBuffer());
  audioMime(bytes);
  return bytes;
}
export async function persistJobAudio(job: GenerationJob): Promise<JobAsset> {
  const existing = await getJobAsset(job);
  if (existing) {
    await storedBytes(existing); // A metadata row alone is not proof of a durable file.
    return existing;
  }
  const source = await getJobOutput(job.id);
  if (!source) throw new Error("This task has no saved audio source.");
  const bytes = await sourceBytes(source);
  const mime = audioMime(bytes);
  const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "songs";
  const path = generationStoragePath(job.order_id, job.id, mime);
  const db = getSupabaseAdmin();
  const upload = await db.storage.from(storageBucket).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (upload.error) {
    // Only a confirmed duplicate may be reused. Never overwrite or delete on errors.
    if (String(upload.error.statusCode) !== "409" && upload.error.message !== "The resource already exists") throw new Error("Could not save generated audio.");
    const saved = await storedBytes({ storage_bucket: storageBucket, storage_path: path });
    if (!saved.equals(bytes)) throw new Error("Stored audio does not match the original result.");
  }
  // Metadata registration and completion happen in one lease-checked transaction.
  return { id: crypto.randomUUID(), storage_bucket: storageBucket, storage_path: path, mime_type: mime };
}

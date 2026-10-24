import { getSupabaseAdmin } from "./admin";
import type { MusicGenerationResult } from "@/lib/types/song";

const bucket = () => process.env.SUPABASE_STORAGE_BUCKET || "songs";
const signedUrlSeconds = () =>
  Number.parseInt(process.env.SUPABASE_SIGNED_URL_SECONDS || "3600", 10);

export type SongOrderRecord = {
  id: string;
  recipientName: string;
  relationship: string;
  occasion: string;
  story: string;
  mood: string;
  style: string;
  email?: string;
};

function normalizeOrderId(orderId?: string) {
  if (
    orderId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      orderId,
    )
  ) {
    return orderId;
  }
  return crypto.randomUUID();
}

function decodeAudio(audioBase64: string) {
  const raw = audioBase64.includes(",")
    ? audioBase64.split(",")[1]
    : audioBase64;
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

export async function createSongOrder(
  input: SongOrderRecord,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const orderId = normalizeOrderId(input.id);
  const { error } = await supabase.from("song_orders").upsert(
    {
      id: orderId,
      recipient_name: input.recipientName,
      relationship: input.relationship,
      occasion: input.occasion,
      story: input.story,
      mood: input.mood,
      style: input.style,
      email: input.email || null,
      status: "lyrics_ready",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error("Could not create song order: " + error.message);
  }

  return orderId;
}

export async function persistAudioAsset(input: {
  orderId: string;
  provider: string;
  model: string;
  providerJobId?: string;
  mimeType: string;
  audioBase64?: string;
  audioUrl?: string;
}): Promise<{
  assetId: string;
  storagePath: string;
  audioUrl: string;
}> {
  const supabase = getSupabaseAdmin();
  const storageBucket = bucket();
  const assetId = crypto.randomUUID();
  const extension = input.mimeType.includes("wav") ? "wav" : "mp3";
  const storagePath = input.orderId + "/" + assetId + "." + extension;
  let audio: Buffer;
  let mimeType = input.mimeType;

  if (input.audioBase64) {
    audio = decodeAudio(input.audioBase64);
  } else if (input.audioUrl) {
    let remoteUrl: URL;
    try {
      remoteUrl = new URL(input.audioUrl);
    } catch {
      throw new Error("The music provider returned an invalid audio URL.");
    }
    if (remoteUrl.protocol !== "https:") {
      throw new Error("The music provider returned a non-HTTPS audio URL.");
    }

    const response = await fetch(remoteUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not download generated audio: HTTP " + response.status + ".");
    }
    const responseType = response.headers.get("content-type")?.split(";")[0]?.trim();
    if (responseType?.startsWith("audio/")) mimeType = responseType;
    audio = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error("No generated audio was returned by the music provider.");
  }

  const upload = await supabase.storage.from(storageBucket).upload(
    storagePath,
    audio,
    {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    },
  );

  if (upload.error) {
    throw new Error("Could not upload audio to Supabase Storage: " + upload.error.message);
  }

  const { error: assetError } = await supabase.from("song_assets").insert({
    id: assetId,
    order_id: input.orderId,
    asset_type: "final",
    storage_bucket: storageBucket,
    storage_path: storagePath,
    mime_type: mimeType,
    provider: input.provider,
    model_id: input.model,
    provider_job_id: input.providerJobId || null,
    is_final: true,
  });

  if (assetError) {
    await supabase.storage.from(storageBucket).remove([storagePath]);
    throw new Error("Could not record song asset: " + assetError.message);
  }

  const signed = await supabase.storage
    .from(storageBucket)
    .createSignedUrl(storagePath, signedUrlSeconds());

  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(
      "Audio was stored, but a signed URL could not be created: " +
        (signed.error?.message || "unknown error"),
    );
  }

  return {
    assetId,
    storagePath,
    audioUrl: signed.data.signedUrl,
  };
}

export async function persistGeneratedAudio(
  orderId: string,
  result: MusicGenerationResult,
): Promise<MusicGenerationResult> {
  if (!result.audioBase64 && !result.audioUrl) return result;

  const asset = await persistAudioAsset({
    orderId,
    provider: result.provider,
    model: result.model,
    providerJobId: result.providerJobId,
    mimeType: result.mimeType || "audio/mpeg",
    audioBase64: result.audioBase64,
    audioUrl: result.audioUrl,
  });

  return {
    ...result,
    audioBase64: undefined,
    audioUrl: asset.audioUrl,
    assetId: asset.assetId,
    storagePath: asset.storagePath,
    persistenceStatus: "saved",
    message: "Audio uploaded to Supabase Storage and recorded in song_assets.",
  };
}

export async function getPersistedAudioForJob(
  orderId: string,
  providerJobId: string,
): Promise<MusicGenerationResult | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("song_assets")
    .select("id, storage_bucket, storage_path, mime_type, provider, model_id")
    .eq("order_id", orderId)
    .eq("provider_job_id", providerJobId)
    .eq("is_final", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not look up the saved song: " + error.message);
  if (!data) return null;

  const signed = await supabase.storage
    .from(data.storage_bucket)
    .createSignedUrl(data.storage_path, signedUrlSeconds());
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error("Could not create a playback URL for the saved song.");
  }

  return {
    provider: data.provider,
    model: data.model_id,
    status: "completed",
    providerJobId,
    audioUrl: signed.data.signedUrl,
    mimeType: data.mime_type,
    assetId: data.id,
    storagePath: data.storage_path,
    persistenceStatus: "saved",
    message: "Your saved song is ready.",
  };
}

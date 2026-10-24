import type { MusicGenerationInput, MusicGenerationResult } from "@/lib/types/song";
import type { MusicProvider } from "./music-provider";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringValue(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  )?.trim();
}

function statusValue(value: unknown): MusicGenerationResult["status"] {
  const status = typeof value === "string" ? value.toLowerCase() : "";
  if (status.includes("fail") || status.includes("error") || status.includes("cancel")) {
    return "failed";
  }
  if (status.includes("success") || status.includes("complete") || status === "done") {
    return "completed";
  }
  if (status.includes("process") || status.includes("running") || status.includes("generat")) {
    return "processing";
  }
  return "queued";
}

function findAudioUrl(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  for (const key of ["url", "audio_url", "audioUrl", "mp3_url", "download_url"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  for (const key of ["choices", "songs", "audios", "audio", "result", "data", "output"]) {
    const found = findAudioUrl(value[key]);
    if (found) return found;
  }
  return undefined;
}

function findWatermarked(value: unknown): boolean | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["watermarked", "watermark"]) {
    if (typeof value[key] === "boolean") return value[key];
  }
  for (const key of ["choices", "songs", "audios", "audio", "result", "data", "output"]) {
    const found = findWatermarked(value[key]);
    if (found !== undefined) return found;
  }
  return undefined;
}

function resolveAudioUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function buildPrompt(input: MusicGenerationInput) {
  return [
    "Create a complete original personalized song in English.",
    "Song purpose: a heartfelt digital gift for " + (input.occasion || "a meaningful occasion") + ".",
    "Music style: " + (input.style || "warm acoustic pop"),
    "Mood: " + (input.mood || "warm and heartfelt"),
    "Vocal direction: warm, intimate, clear English vocals.",
    "Arrangement: a memorable chorus, emotional verses, a gentle dynamic build, and a satisfying final chorus.",
    "Create an original composition. Do not imitate any real artist, band, song, album, or record label.",
    "Recipient: " + input.recipientName,
    "Story details: " + (input.story || "Create a sincere, universal celebration of this person."),
  ].join("\n\n");
}

export class MurekaCnProvider implements MusicProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.MUREKA_API_KEY || "";
    this.baseUrl = (process.env.MUREKA_API_BASE_URL || "https://api.mureka.cn").replace(/\/$/, "");
    this.model = process.env.MUREKA_MODEL || "auto";
  }

  private assertConfigured() {
    if (this.apiKey) return;
    const error = new Error("Mureka needs MUREKA_API_KEY on the server.");
    error.name = "ProviderConfigurationError";
    throw error;
  }

  private async request(path: string, init?: RequestInit) {
    const response = await fetch(this.baseUrl + path, {
      ...init,
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      const record = asRecord(payload);
      const nestedError = asRecord(record.error);
      const message = stringValue(nestedError.message, record.message, text) || "Unknown Mureka error";
      throw new Error("Mureka request failed (" + response.status + "): " + message.slice(0, 600));
    }
    return asRecord(payload);
  }

  private normalize(payload: JsonRecord, fallbackTaskId?: string): MusicGenerationResult {
    const data = asRecord(payload.data);
    const source = Object.keys(data).length > 0 ? data : payload;
    const taskId = stringValue(source.id, source.task_id, source.taskId, payload.id, fallbackTaskId);
    const rawAudioUrl = findAudioUrl(source);
    const audioUrl = rawAudioUrl ? resolveAudioUrl(rawAudioUrl, this.baseUrl) : undefined;
    const status = statusValue(source.status || payload.status);
    const traceId = stringValue(source.trace_id, source.traceId, payload.trace_id, payload.traceId);

    return {
      provider: "mureka_cn",
      model: stringValue(source.model, payload.model) || this.model,
      status: audioUrl ? "completed" : status,
      providerJobId: taskId,
      audioUrl,
      mimeType: "audio/mpeg",
      watermarked: findWatermarked(source),
      traceId,
      message: audioUrl
        ? "Mureka returned an audio result."
        : status === "failed"
          ? "Mureka failed to generate the song."
          : "Mureka accepted the request. The song is still being generated.",
    };
  }

  async generateSong(input: MusicGenerationInput): Promise<MusicGenerationResult> {
    this.assertConfigured();
    const payload = await this.request("/v1/song/generate", {
      method: "POST",
      body: JSON.stringify({
        lyrics: input.lyricsText,
        model: this.model,
        n: 1,
        prompt: buildPrompt(input),
      }),
    });
    return this.normalize(payload);
  }

  async getStatus(jobId: string): Promise<MusicGenerationResult> {
    this.assertConfigured();
    const payload = await this.request("/v1/song/query/" + encodeURIComponent(jobId));
    return this.normalize(payload, jobId);
  }
}

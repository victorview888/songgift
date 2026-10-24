import type { MusicGenerationInput, MusicGenerationResult } from "@/lib/types/song";
import { buildMusicPrompt } from "@/lib/prompts/music";
import type { MusicProvider } from "./music-provider";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function findAudioBase64(value: unknown): string | undefined {
  if (typeof value === "string") {
    const candidate = value.trim();
    return candidate.length > 100 && /^[A-Za-z0-9+/=_-]+$/.test(candidate)
      ? candidate
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioBase64(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const key of [
    "audio",
    "audioContent",
    "audio_base64",
    "bytes",
    "data",
    "outputs",
    "output",
    "result",
    "content",
  ]) {
    const found = findAudioBase64(value[key]);
    if (found) return found;
  }
  return undefined;
}

function normalizeStatus(value: unknown): MusicGenerationResult["status"] {
  const status = typeof value === "string" ? value.toLowerCase() : "";
  if (status.includes("queue")) return "queued";
  if (status.includes("process") || status.includes("running")) return "processing";
  return "completed";
}

export class GoogleLyriaProvider implements MusicProvider {
  private readonly projectId: string;
  private readonly location: string;
  private readonly model: string;
  private readonly accessToken: string;

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || "";
    this.location = process.env.GOOGLE_CLOUD_LOCATION || "global";
    this.model = process.env.GOOGLE_LYRIA_MODEL || "lyria-3-pro-preview";
    this.accessToken =
      process.env.GOOGLE_LYRIA_ACCESS_TOKEN ||
      process.env.GOOGLE_ACCESS_TOKEN ||
      "";
  }

  private getEndpoint(jobId?: string): string {
    const customEndpoint = process.env.GOOGLE_LYRIA_ENDPOINT;
    const base =
      customEndpoint ||
      "https://aiplatform.googleapis.com/v1beta1/projects/" +
        encodeURIComponent(this.projectId) +
        "/locations/" +
        encodeURIComponent(this.location) +
        "/interactions";
    return jobId ? base + "/" + encodeURIComponent(jobId) : base;
  }

  private assertConfigured() {
    if (this.projectId && this.accessToken) return;
    const error = new Error(
      "Google Lyria needs GOOGLE_CLOUD_PROJECT_ID and GOOGLE_ACCESS_TOKEN (or GOOGLE_LYRIA_ACCESS_TOKEN).",
    );
    error.name = "ProviderConfigurationError";
    throw error;
  }

  async generateSong(
    input: MusicGenerationInput,
  ): Promise<MusicGenerationResult> {
    this.assertConfigured();
    const response = await fetch(this.getEndpoint(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: [{ type: "text", text: buildMusicPrompt(input) }],
      }),
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 600);
      throw new Error("Google Lyria request failed (" + response.status + "): " + details);
    }

    const payload = (await response.json()) as JsonRecord;
    const audioBase64 = findAudioBase64(payload);
    const providerJobId = typeof payload.id === "string" ? payload.id : undefined;
    return {
      provider: "google_lyria",
      model: this.model,
      status: audioBase64 ? "completed" : normalizeStatus(payload.status),
      providerJobId,
      mimeType: "audio/mpeg",
      audioBase64,
      message: audioBase64
        ? "Lyria returned an audio result."
        : "Lyria accepted the request. Poll the provider job for its result.",
    };
  }

  async getStatus(jobId: string): Promise<MusicGenerationResult> {
    this.assertConfigured();
    const response = await fetch(this.getEndpoint(jobId), {
      headers: { Authorization: "Bearer " + this.accessToken },
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 600);
      throw new Error("Google Lyria status request failed (" + response.status + "): " + details);
    }
    const payload = (await response.json()) as JsonRecord;
    const audioBase64 = findAudioBase64(payload);
    return {
      provider: "google_lyria",
      model: this.model,
      status: audioBase64 ? "completed" : normalizeStatus(payload.status),
      providerJobId: jobId,
      mimeType: "audio/mpeg",
      audioBase64,
    };
  }
}

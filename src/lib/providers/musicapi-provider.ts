import type { MusicGenerationInput, MusicGenerationResult } from "@/lib/types/song";
import type { MusicProvider } from "./music-provider";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function nonempty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorMessage(payload: JsonRecord): string {
  return (
    nonempty(payload.message) ||
    nonempty(payload.error) ||
    nonempty(record(payload.error).message) ||
    "Unknown MusicAPI error"
  );
}

export class MusicApiProvider implements MusicProvider {
  private readonly apiKey = process.env.MUSICAPI_KEY || "";
  private readonly baseUrl = (
    process.env.MUSICAPI_BASE_URL || "https://api.musicapi.ai/api/v1"
  ).replace(/\/$/, "");
  private readonly model = process.env.MUSICAPI_MODEL || "sonic-v5";

  private assertConfigured() {
    if (this.apiKey) return;
    const error = new Error("MusicAPI needs MUSICAPI_KEY on the server.");
    error.name = "ProviderConfigurationError";
    throw error;
  }

  private async request(path: string, init?: RequestInit): Promise<{ status: number; data: JsonRecord }> {
    this.assertConfigured();
    const response = await fetch(this.baseUrl + path, {
      ...init,
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("MusicAPI returned a non-JSON response (HTTP " + response.status + ").");
    }
    const data = record(payload);
    if (!response.ok && response.status !== 202) {
      throw new Error(
        "MusicAPI request failed (" + response.status + "): " + errorMessage(data).slice(0, 500),
      );
    }
    return { status: response.status, data };
  }

  async generateSong(input: MusicGenerationInput): Promise<MusicGenerationResult> {
    const { data } = await this.request("/sonic/create", {
      method: "POST",
      body: JSON.stringify({
        task_type: "create_music",
        custom_mode: true,
        mv: this.model,
        prompt: input.lyricsText,
        title: ("A Song for " + input.recipientName).slice(0, 80),
        tags: [input.style, input.mood].filter(Boolean).join(", ").slice(0, 400),
        make_instrumental: false,
      }),
    });
    const taskId = nonempty(data.task_id);
    if (!taskId) throw new Error("MusicAPI accepted the request without a task_id.");
    return {
      provider: "musicapi",
      model: this.model,
      status: "queued",
      providerJobId: taskId,
      message: "MusicAPI is generating your song. The API creates two versions; this site will deliver one.",
    };
  }

  async getStatus(jobId: string): Promise<MusicGenerationResult> {
    const { status, data } = await this.request("/sonic/task/" + encodeURIComponent(jobId));
    if (status === 202) {
      return {
        provider: "musicapi",
        model: this.model,
        status: "processing",
        providerJobId: jobId,
        message: "MusicAPI is still generating the song.",
      };
    }
    if (data.code !== 200) {
      return {
        provider: "musicapi",
        model: this.model,
        status: "failed",
        providerJobId: jobId,
        message: "MusicAPI generation failed: " + errorMessage(data).slice(0, 500),
      };
    }

    const songs = Array.isArray(data.data) ? data.data.map(record) : [];
    const selected = songs.find((song) => nonempty(song.audio_url));
    const audioUrl = selected && nonempty(selected.audio_url);
    if (!audioUrl) {
      return {
        provider: "musicapi",
        model: this.model,
        status: "failed",
        providerJobId: jobId,
        message: "MusicAPI finished without a playable audio URL.",
      };
    }
    return {
      provider: "musicapi",
      model: nonempty(selected.mv) || this.model,
      status: "completed",
      providerJobId: jobId,
      audioUrl,
      mimeType: "audio/mpeg",
      message: "One MusicAPI song is ready. The second generated version was not saved.",
    };
  }
}

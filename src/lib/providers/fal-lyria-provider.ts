import { buildMusicPrompt } from "@/lib/prompts/music";
import type { MusicGenerationInput, MusicGenerationResult } from "@/lib/types/song";
import type { MusicProvider } from "./music-provider";

export const FAL_LYRIA_JOB_PREFIX = "fal-lyria3-pro:";
const MODEL = "fal-ai/lyria3/pro";
// fal queue retrieval URLs use owner/app, excluding the /pro endpoint suffix.
const QUEUE_APP = "https://queue.fal.run/fal-ai/lyria3";
type JsonRecord = Record<string, unknown>;
class FalHttpError extends Error {
  constructor(readonly status: number, message: string, readonly failureDetail = "") { super(message); }
}

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export class FalLyriaProvider implements MusicProvider {
  private readonly key = process.env.FAL_KEY?.trim() || "";

  private async request(url: string, init?: RequestInit): Promise<JsonRecord> {
    if (!this.key) {
      const error = new Error("Lyria 3 Pro on fal needs FAL_KEY on the server.");
      error.name = "ProviderConfigurationError";
      throw error;
    }
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: "Key " + this.key,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      let failureDetail = "";
      if (response.status === 422) {
        // Only bounded error messages, never echoed input, URLs or response bodies.
        try {
          const body = record(await response.json());
          const detail = Array.isArray(body.detail) ? body.detail.map(item => record(item).msg).filter(item => typeof item === "string").join("; ") : typeof body.detail === "string" ? body.detail : "";
          failureDetail = detail.replace(/https?:\/\/[^\s<>"']+/g, "[provider URL]").replace(/[\r\n]+/g, " ").slice(0, 300);
        } catch { /* An invalid diagnostic body does not change failure classification. */ }
      }
      const error = new FalHttpError(response.status,
        response.status === 401 || response.status === 403
          ? "fal rejected the API credentials or model access. Check FAL_KEY and account permissions."
          : response.status === 402
            ? "fal credits are insufficient. Add credits in the fal dashboard."
            : `fal request failed (HTTP ${response.status}).`,
        failureDetail,
      );
      if ([401, 402, 403].includes(response.status)) error.name = "ProviderConfigurationError";
      else if ([400, 404, 422, 429].includes(response.status)) error.name = "ProviderRequestRejectedError";
      throw error;
    }
    return record(await response.json());
  }

  async generateSong(input: MusicGenerationInput): Promise<MusicGenerationResult> {
    const data = await this.request("https://queue.fal.run/" + MODEL, {
      method: "POST",
      body: JSON.stringify({
        prompt: buildMusicPrompt(input) +
          "\n\nSing the approved lyrics above in order. Fit one complete vocal song within three minutes.",
      }),
    });
    if (typeof data.request_id !== "string" || !data.request_id) {
      throw new Error("fal accepted the request without a request ID.");
    }
    return {
      provider: "fal",
      model: MODEL,
      status: "queued",
      providerJobId: FAL_LYRIA_JOB_PREFIX + data.request_id,
      message: "Your song is queued and will be ready shortly.",
    };
  }

  async getStatus(jobId: string): Promise<MusicGenerationResult> {
    if (!jobId.startsWith(FAL_LYRIA_JOB_PREFIX)) throw new Error("Invalid fal song task ID.");
    const requestId = jobId.slice(FAL_LYRIA_JOB_PREFIX.length);
    if (!requestId) throw new Error("Missing fal request ID.");
    const url = QUEUE_APP + "/requests/" + encodeURIComponent(requestId);
    const data = await this.request(url + "/status");
    const base = { provider: "fal", model: MODEL, providerJobId: jobId };
    if (data.status === "IN_QUEUE" || data.status === "IN_PROGRESS") {
      return {
        ...base,
        status: data.status === "IN_QUEUE" ? "queued" : "processing",
        message: "Your song is being generated.",
      };
    }
    if (data.status !== "COMPLETED") throw new Error("fal returned an unknown task status.");
    if (data.error || data.error_type) {
      return { ...base, status: "failed", message: "The music provider could not create this song." };
    }
    let result: JsonRecord;
    try { result = await this.request(url); }
    catch (error) {
      // fal can report COMPLETED without an error field, then return 422 from
      // the result endpoint for a failed execution. This confirms failure of
      // the original task; a status lookup/network/auth error does not.
      if (error instanceof FalHttpError && error.status === 422) {
        return { ...base, status: "failed", message: "The music provider could not create this song.", providerFailure: error.failureDetail || undefined };
      }
      throw error;
    }
    const audio = record(result.audio);
    const audioUrl = typeof result.audio === "string" ? result.audio : audio.url;
    if (typeof audioUrl !== "string" || !audioUrl.startsWith("https://")) {
      return { ...base, status: "failed", message: "The music provider finished without playable audio." };
    }
    return {
      ...base,
      status: "completed",
      audioUrl,
      mimeType: "audio/mpeg",
      watermarked: true,
      message: "Your song is ready.",
    };
  }
}

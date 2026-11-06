import { DeepSeekLyricsProvider } from "./deepseek-lyrics-provider";
import { FalLyriaProvider, FAL_LYRIA_JOB_PREFIX } from "./fal-lyria-provider";
import { GeminiFlashProvider } from "./gemini-flash-provider";
import { GoogleLyriaProvider } from "./google-lyria-provider";
import { MockLyricsProvider } from "./mock-lyrics-provider";
import { MockMusicProvider } from "./mock-music-provider";
import { MusicApiProvider } from "./musicapi-provider";
import { MurekaCnProvider } from "./mureka-cn-provider";
import type { LyricsProvider } from "./lyrics-provider";
import type { MusicProvider } from "./music-provider";
import { HttpError } from "@/lib/auth/server";

function canUseMockFallback() {
  return process.env.ALLOW_MOCK_FALLBACK === "true";
}

export function getLyricsProvider(): LyricsProvider {
  const configured = (process.env.LYRICS_PROVIDER || "deepseek").toLowerCase();
  if (configured === "mock") return new MockLyricsProvider();
  if (configured === "deepseek") return new DeepSeekLyricsProvider();
  if (configured === "gemini") return new GeminiFlashProvider();
  throw new Error(`Unknown lyrics provider: ${configured}`);
}

export function getMusicProvider(jobId?: string): MusicProvider {
  if (jobId?.startsWith(FAL_LYRIA_JOB_PREFIX)) return new FalLyriaProvider();
  const configured = (process.env.MUSIC_PROVIDER || "musicapi").toLowerCase();
  if (configured === "mock") return new MockMusicProvider();
  if (configured === "fal") return new FalLyriaProvider();
  if (configured === "musicapi") return new MusicApiProvider();
  if (configured === "mureka" || configured === "mureka_cn" || configured === "mureka-cn") {
    if (!process.env.MUREKA_API_KEY && canUseMockFallback()) return new MockMusicProvider();
    return new MurekaCnProvider();
  }
  const hasGoogleCredentials =
    Boolean(process.env.GOOGLE_CLOUD_PROJECT_ID) &&
    Boolean(process.env.GOOGLE_ACCESS_TOKEN || process.env.GOOGLE_LYRIA_ACCESS_TOKEN);
  if (!hasGoogleCredentials && canUseMockFallback()) return new MockMusicProvider();
  return new GoogleLyriaProvider();
}

// New jobs store this identity before any paid call. Polls never use defaults.
export function getMusicIdentity() {
  const configured = (process.env.MUSIC_PROVIDER || "musicapi").toLowerCase();
  if (configured === "fal") return { provider: "fal", model: "fal-ai/lyria3/pro", environment: "production" as const };
  if (configured === "musicapi") return { provider: "musicapi", model: process.env.MUSICAPI_MODEL || "sonic-v5", environment: "production" as const };
  if (["mureka", "mureka_cn", "mureka-cn"].includes(configured)) return { provider: "mureka_cn", model: process.env.MUREKA_MODEL || "auto", environment: "production" as const };
  if (["google", "google_lyria", "lyria"].includes(configured)) return { provider: "google_lyria", model: process.env.GOOGLE_LYRIA_MODEL || "lyria-3-pro-preview", environment: "production" as const };
  if (configured === "mock") return { provider: "mock", model: "local-preview", environment: "test" as const };
  throw new HttpError(503, "Song creation is temporarily unavailable.");
}
export function getPinnedMusicProvider(identity: { provider: string; model: string; environment: string }): MusicProvider {
  if (identity.provider === "mock" && identity.environment === "test" && identity.model === "local-preview") return new MockMusicProvider();
  if (identity.environment !== "production") throw new HttpError(409, "This song task needs assistance.");
  if (identity.provider === "fal" && identity.model === "fal-ai/lyria3/pro") return new FalLyriaProvider();
  if (identity.provider === "musicapi") return new MusicApiProvider(identity.model);
  if (identity.provider === "mureka_cn") return new MurekaCnProvider(identity.model);
  if (identity.provider === "google_lyria") return new GoogleLyriaProvider(identity.model);
  throw new HttpError(409, "This song task needs assistance.");
}

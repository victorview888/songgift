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

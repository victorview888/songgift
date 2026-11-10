import "server-only";
import type { SongSample } from "@/components/song-samples";

// Operator-approved public samples only. Never derive marketing media from orders.
export function publicSongSamples(): SongSample[] {
  try {
    const value: unknown = JSON.parse(process.env.SONGGIFT_PUBLIC_SAMPLES || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((sample): sample is SongSample => sample && ["title", "occasion", "style", "url"].every(key => typeof sample[key] === "string" && sample[key].trim().length > 0 && sample[key].length <= 2048) && (/^https:\/\//.test(sample.url) || /^\/samples\/[a-zA-Z0-9_.-]+$/.test(sample.url))).slice(0, 3);
  } catch { return []; }
}

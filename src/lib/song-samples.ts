import "server-only";
import type { SongSample } from "@/components/song-samples";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Operator-approved public samples only. Never derive marketing media from orders.
export async function publicSongSamples(): Promise<SongSample[]> {
  try {
    const value: unknown = JSON.parse(process.env.SONGGIFT_PUBLIC_SAMPLES || "[]");
    if (!Array.isArray(value)) return [];
    const configured = value.filter((sample): sample is SongSample => sample && ["title", "occasion", "style", "url"].every(key => typeof sample[key] === "string" && sample[key].trim().length > 0 && sample[key].length <= 2048) && (/^https:\/\//.test(sample.url) || /^\/samples\/[a-zA-Z0-9_.-]+$/.test(sample.url))).slice(0, 3);
    if (configured.length) return configured;
    const { data, error } = await getSupabaseAdmin().from("audio_previews").select("public_slug,title,input_snapshot").eq("kind", "sample").eq("state", "ready").eq("is_public", true).limit(3);
    if (error || !data) return [];
    return ["birthday-demo", "anniversary-demo", "christmas-demo"].flatMap(slug => {
      const row = data.find(sample => sample.public_slug === slug);
      return row ? [{ title: row.title, occasion: row.input_snapshot.occasion, style: row.input_snapshot.style, url: `/api/samples/${slug}/audio`, demo: true }] : [];
    });
  } catch { return []; }
}

import { NextResponse } from "next/server";
import { getMusicProvider } from "@/lib/providers/factory";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getPersistedAudioForJob, persistGeneratedAudio } from "@/lib/supabase/song-assets";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const orderId = new URL(_request.url).searchParams.get("orderId");
    if (isSupabaseConfigured() && orderId) {
      const saved = await getPersistedAudioForJob(orderId, jobId);
      if (saved) return NextResponse.json(saved);
    }
    const provider = getMusicProvider();
    if (!provider.getStatus) {
      return NextResponse.json(
        { error: "The selected music provider does not support status polling." },
        { status: 501 },
      );
    }
    const result = await provider.getStatus(jobId);
    if ((result.audioBase64 || result.audioUrl) && isSupabaseConfigured() && orderId) {
      return NextResponse.json(await persistGeneratedAudio(orderId, result));
    }
    return NextResponse.json({
      ...result,
      persistenceStatus: result.audioBase64 || result.audioUrl ? "skipped" : undefined,
    });
  } catch (error) {
    const status = error instanceof Error && error.name === "ProviderConfigurationError" ? 503 : 500;
    const message = error instanceof Error ? error.message : "Music status lookup failed.";
    return NextResponse.json({ error: message }, { status });
  }
}

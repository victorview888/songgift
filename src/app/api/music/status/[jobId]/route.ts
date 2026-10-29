import { NextResponse } from "next/server";
import { getMusicProvider } from "@/lib/providers/factory";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getPersistedAudioForJob, getSongOrder, persistGeneratedAudio } from "@/lib/supabase/song-assets";
import { sendSongReadyEmail } from "@/lib/email";

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
    const provider = getMusicProvider(jobId);
    if (!provider.getStatus) {
      return NextResponse.json(
        { error: "The selected music provider does not support status polling." },
        { status: 501 },
      );
    }
    const result = await provider.getStatus(jobId);
    if ((result.audioBase64 || result.audioUrl) && isSupabaseConfigured() && orderId) {
      const saved = await persistGeneratedAudio(orderId, result);
      const order = await getSongOrder(orderId);
      if (order?.email && saved.audioUrl) {
        try {
          const email = await sendSongReadyEmail({ email: order.email, recipientName: order.recipient_name, audioUrl: saved.audioUrl, result: saved });
          return NextResponse.json({ ...saved, emailStatus: email.status });
        } catch (emailError) {
          return NextResponse.json({ ...saved, emailStatus: "failed", emailError: emailError instanceof Error ? emailError.message : "Email delivery failed." });
        }
      }
      return NextResponse.json({ ...saved, emailStatus: "skipped" });
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

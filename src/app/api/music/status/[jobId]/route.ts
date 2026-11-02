import { NextResponse } from "next/server";
import { authRoute, HttpError } from "@/lib/auth/server";
import { getMusicProvider } from "@/lib/providers/factory";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOwnedOrder } from "@/lib/supabase/orders";
import { getPersistedAudioForJob, persistGeneratedAudio } from "@/lib/supabase/song-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return authRoute(request, async ({ user }) => {
    const { jobId } = await context.params;
    const orderId = new URL(request.url).searchParams.get("orderId") || "";
    const order = await getOwnedOrder(orderId, user!.id);
    if (order.provider_job_id !== jobId) throw new HttpError(404, "Song generation not found.");
    const existing = await getPersistedAudioForJob(orderId, jobId);
    if (existing) return NextResponse.json(existing);
    const provider = getMusicProvider(jobId);
    if (!provider.getStatus) throw new HttpError(501, "This song cannot be checked right now.");
    const result = await provider.getStatus(jobId);
    if (result.status === "completed" && (result.audioBase64 || result.audioUrl)) return NextResponse.json(await persistGeneratedAudio(orderId, result));
    if (result.status === "failed") {
      const { error } = await getSupabaseAdmin().from("song_orders").update({ status: "failed", generation_error: "Your song could not be completed.", updated_at: new Date().toISOString() }).eq("id", orderId).eq("user_id", user!.id).eq("provider_job_id", jobId);
      if (error) throw new Error("Could not save generation status: " + error.message);
    }
    return NextResponse.json(result);
  });
}

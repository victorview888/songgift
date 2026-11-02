import { NextResponse } from "next/server";
import { authRoute, HttpError } from "@/lib/auth/server";
import { getMusicProvider } from "@/lib/providers/factory";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOwnedOrder } from "@/lib/supabase/orders";
import { persistGeneratedAudio } from "@/lib/supabase/song-assets";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await request.json();
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const order = await getOwnedOrder(orderId, user!.id);
    if (order.song_assets.length) return NextResponse.json({ orderId, status: "completed" });
    if (order.status === "failed") throw new HttpError(409, "This song could not be completed. Your order is saved for assistance.");
    if (order.provider_job_id) return NextResponse.json({ orderId, status: "queued", providerJobId: order.provider_job_id });
    if (order.status === "generating") throw new HttpError(409, "Your song is already starting. Check its progress in My Songs.");
    if (!order.paid_at && process.env.PAYPAL_REQUIRED !== "false") throw new HttpError(402, "Please complete payment before creating your song.");
    if (!order.lyrics_text) throw new HttpError(400, "Please review and save your lyrics first.");
    const provider = getMusicProvider();
    const db = getSupabaseAdmin();
    // Atomically reserve the order before consuming generation credits.
    const lock = await db.from("song_orders").update({ status: "generating", generation_error: null, updated_at: new Date().toISOString() }).eq("id", orderId).eq("user_id", user!.id).eq("status", order.status).is("provider_job_id", null).select("id").maybeSingle();
    if (lock.error) throw new Error("Could not reserve song generation: " + lock.error.message);
    if (!lock.data) throw new HttpError(409, "Your song is already starting. Open it from My Songs.");
    let result;
    try {
      result = await provider.generateSong({ recipientName: order.recipient_name, occasion: order.occasion, story: order.story, mood: order.mood || "", style: order.style || "", lyricsText: order.lyrics_text, orderId });
    } catch (error) {
      await db.from("song_orders").update({ status: "failed", generation_error: "The music service could not complete this request.", updated_at: new Date().toISOString() }).eq("id", orderId).eq("user_id", user!.id);
      throw new HttpError(502, error instanceof Error && error.name === "ProviderConfigurationError" ? "Song creation is temporarily unavailable. Your order is saved." : "We couldn't start your song. Your order is saved for assistance.");
    }
    const updated = await db.from("song_orders").update({ provider_job_id: result.providerJobId || null, music_provider: result.provider, music_model: result.model, status: result.status === "failed" ? "failed" : "generating", updated_at: new Date().toISOString() }).eq("id", orderId).eq("user_id", user!.id);
    if (updated.error) throw new Error("Could not save generation reference: " + updated.error.message);
    if (result.status === "completed" && (result.audioBase64 || result.audioUrl)) result = await persistGeneratedAudio(orderId, result);
    return NextResponse.json({ ...result, orderId });
  });
}

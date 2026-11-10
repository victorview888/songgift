import { NextResponse } from "next/server";
import { authRoute, HttpError } from "@/lib/auth/server";
import { generateCheckedLyrics } from "@/lib/safety/lyrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOwnedOrder } from "@/lib/supabase/orders";
import { writeStoryLyrics } from "@/lib/services/story-requests";
import { isOrderId } from "@/lib/supabase/orders";
import type { SongStoryInput } from "@/lib/types/song";

export const runtime = "nodejs";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await request.json() as Partial<SongStoryInput> & { clientRequestId?: unknown; draftOwnerId?: unknown };
    const input: SongStoryInput = { recipientName: text(body.recipientName), relationship: text(body.relationship), occasion: text(body.occasion), story: text(body.story), mood: text(body.mood), style: text(body.style), email: user!.email, orderId: text(body.orderId) || crypto.randomUUID() };
    if (!input.recipientName || input.recipientName.length > 100 || !input.occasion || input.occasion.length > 100 || input.relationship.length > 100 || input.mood.length > 100 || input.style.length > 100 || input.story.length < 20 || input.story.length > 8000) throw new HttpError(400, "Please provide a name, occasion, and a story between 20 and 8,000 characters.");
    if (body.clientRequestId !== undefined) {
      if (typeof body.clientRequestId !== "string" || !isOrderId(body.clientRequestId) || body.orderId) throw new HttpError(400, "Please refresh this story and try again.");
      if (body.draftOwnerId !== user!.id) throw new HttpError(409, "Your account changed. Refresh before continuing this saved story.");
      const saved = await writeStoryLyrics(body.clientRequestId, user!.id, input);
      return NextResponse.json(saved, { status: saved.pending ? 202 : 200 });
    }
    if (body.orderId) {
      const existing = await getOwnedOrder(input.orderId!, user!.id);
      const bound = await getSupabaseAdmin().from("song_story_requests").select("order_id").eq("order_id", existing.id).maybeSingle();
      if (bound.error) throw new HttpError(503, "Your story is temporarily unavailable.");
      if (bound.data) throw new HttpError(409, "This saved story already has a writing request. Start a new story to change its details.");
      if (existing.paid_at || existing.provider_job_id || existing.song_assets.length || existing.status !== "lyrics_ready") throw new HttpError(409, "This order has already moved to checkout. Create a new song for a different story.");
    }
    let result;
    try { result = await generateCheckedLyrics(input); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(error instanceof Error && error.name === "ProviderConfigurationError" ? 503 : 502, "We couldn't write your lyrics right now. Please try again."); }
    const record = { user_id: user!.id, recipient_name: input.recipientName, relationship: input.relationship, occasion: input.occasion, story: input.story, mood: input.mood, style: input.style, email: user!.email, title: result.title, lyrics_text: result.lyricsText, status: "lyrics_ready", updated_at: new Date().toISOString() };
    const db = getSupabaseAdmin();
    const saved = body.orderId
      ? await db.from("song_orders").update(record).eq("id", input.orderId!).eq("user_id", user!.id).eq("status", "lyrics_ready").is("paid_at", null).select("id").maybeSingle()
      : await db.from("song_orders").insert({ ...record, id: input.orderId }).select("id").single();
    if (saved.error || !saved.data) throw new Error("Could not save generated lyrics: " + saved.error?.message);
    return NextResponse.json({ ...result, orderId: saved.data.id, persistenceStatus: "saved" });
  });
}

import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/http-error";
import { generateCheckedLyrics } from "@/lib/safety/lyrics";
import type { SongStoryInput } from "@/lib/types/song";

type StoryResult = { start?: boolean; pending?: boolean; blocked?: boolean; orderId: string; leaseToken?: string; title?: string | null; lyricsText?: string };
async function storyRpc(name: string, params: Record<string, unknown>): Promise<StoryResult> {
  const { data, error } = await getSupabaseAdmin().rpc(name, params);
  if (error || !data) {
    if (error?.message === "order_not_found") throw new HttpError(404, "This saved story is not available to your account.");
    if (["story_conflict", "stale_lease"].includes(error?.message || "")) throw new HttpError(409, "This story request has changed. Start a new story to use different details.");
    throw new HttpError(503, "Your saved story is temporarily unavailable. Please try again.");
  }
  return data as StoryResult;
}
export async function writeStoryLyrics(requestId: string, userId: string, input: SongStoryInput) {
  const form = { recipientName: input.recipientName, relationship: input.relationship, occasion: input.occasion, story: input.story, mood: input.mood, style: input.style };
  const hash = createHash("sha256").update(JSON.stringify(form)).digest("hex");
  const reservation = await storyRpc("begin_songgift_story", { p_request_id: requestId, p_user_id: userId, p_input_hash: hash, p_input: form, p_email: input.email || null });
  if (reservation.blocked) throw new HttpError(409, "Your story is saved, but its lyric-writing result needs assistance. Find it in My Songs.");
  if (!reservation.start) return { orderId: reservation.orderId, title: reservation.title, lyricsText: reservation.lyricsText, pending: reservation.pending === true, persistenceStatus: "saved" };
  let result;
  try {
    result = await generateCheckedLyrics({ ...input, orderId: reservation.orderId });
    if (!result.title?.trim() || result.title.length > 200 || typeof result.lyricsText !== "string" || result.lyricsText.length < 20 || result.lyricsText.length > 12000) throw new Error("Invalid lyric result.");
  } catch (error) {
    // Only an explicit later submission retries this known failed attempt, reusing its order.
    await getSupabaseAdmin().rpc("fail_songgift_story", { p_request_id: requestId, p_user_id: userId, p_lease_token: reservation.leaseToken });
    if (error instanceof HttpError) throw error;
    throw new HttpError(error instanceof Error && error.name === "ProviderConfigurationError" ? 503 : 502, "We couldn't write your lyrics right now. Your story is saved; try again when you're ready.");
  }
  const saved = await storyRpc("finish_songgift_story", { p_request_id: requestId, p_user_id: userId, p_lease_token: reservation.leaseToken, p_title: result.title.trim(), p_lyrics: result.lyricsText });
  return { orderId: saved.orderId, title: saved.title, lyricsText: saved.lyricsText, pending: false, persistenceStatus: "saved" };
}

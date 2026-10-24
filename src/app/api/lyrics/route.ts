import { NextResponse } from "next/server";
import { getLyricsProvider } from "@/lib/providers/factory";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import type { SongStoryInput } from "@/lib/types/song";
import { createSongOrder as saveSongOrder } from "@/lib/supabase/song-assets";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<SongStoryInput>;
    const input: SongStoryInput = {
      recipientName: text(body.recipientName),
      relationship: text(body.relationship),
      occasion: text(body.occasion),
      story: text(body.story),
      mood: text(body.mood),
      style: text(body.style),
      email: text(body.email),
      orderId: text(body.orderId) || crypto.randomUUID(),
    };
    if (!input.recipientName || !input.occasion || input.story.length < 20) {
      return NextResponse.json(
        { error: "Please provide a name, occasion, and a story of at least 20 characters." },
        { status: 400 },
      );
    }
    const result = await getLyricsProvider().generateLyrics(input);
    const orderId = isSupabaseConfigured()
      ? await saveSongOrder({
          id: input.orderId || crypto.randomUUID(),
          recipientName: input.recipientName,
          relationship: input.relationship,
          occasion: input.occasion,
          story: input.story,
          mood: input.mood,
          style: input.style,
          email: input.email,
        })
      : input.orderId || crypto.randomUUID();

    return NextResponse.json({
      ...result,
      orderId,
      persistenceStatus: isSupabaseConfigured() ? "saved" : "skipped",
    });
  } catch (error) {
    const status = error instanceof Error && error.name === "ProviderConfigurationError" ? 503 : 500;
    const message = error instanceof Error ? error.message : "Lyrics generation failed.";
    return NextResponse.json({ error: message }, { status });
  }
}

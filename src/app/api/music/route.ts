import { NextResponse } from "next/server";
import { getMusicProvider } from "@/lib/providers/factory";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  createSongOrder,
  getSongOrder,
  persistGeneratedAudio,
} from "@/lib/supabase/song-assets";
import { sendSongReadyEmail } from "@/lib/email";
import type { MusicGenerationInput } from "@/lib/types/song";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<MusicGenerationInput>;
    const input: MusicGenerationInput = {
      recipientName: text(body.recipientName),
      occasion: text(body.occasion),
      story: text(body.story),
      mood: text(body.mood),
      style: text(body.style),
      lyricsText: text(body.lyricsText),
      orderId: text(body.orderId),
    };
    if (!input.recipientName || !input.lyricsText) {
      return NextResponse.json(
        { error: "A recipient name and approved lyrics are required." },
        { status: 400 },
      );
    }
    const orderId = input.orderId || crypto.randomUUID();
    if (process.env.PAYPAL_REQUIRED !== "false") {
      if (!input.orderId || !isSupabaseConfigured()) {
        return NextResponse.json({ error: "Payment must be completed before generating a song." }, { status: 402 });
      }
      const order = await getSongOrder(input.orderId);
      if (!order) return NextResponse.json({ error: "Song order not found." }, { status: 404 });
      if (order.status !== "paid" && order.status !== "generating" && order.status !== "completed") {
        return NextResponse.json({ error: "Payment must be completed before generating a song." }, { status: 402 });
      }
    }
    const result = await getMusicProvider().generateSong(input);

    if (result.status === "failed") {
      return NextResponse.json({
        ...result,
        orderId: input.orderId || undefined,
      });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ...result,
        orderId,
        persistenceStatus: result.audioBase64 || result.audioUrl ? "skipped" : undefined,
        message: result.audioBase64 || result.audioUrl
          ? (result.message || "") +
            " Configure Supabase to persist and serve this audio from Storage."
          : result.message,
      });
    }

    if (!input.orderId) {
      await createSongOrder({
        id: orderId,
        recipientName: input.recipientName,
        relationship: "",
        occasion: input.occasion,
        story: input.story,
        mood: input.mood,
        style: input.style,
      });
    }

    if (!result.audioBase64 && !result.audioUrl) {
      return NextResponse.json({ ...result, orderId });
    }

    if (result.status !== "completed") {
      return NextResponse.json({ ...result, orderId });
    }

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
  } catch (error) {
    const status = error instanceof Error && error.name === "ProviderConfigurationError" ? 503 : 500;
    const message = error instanceof Error ? error.message : "Music generation failed.";
    return NextResponse.json({ error: message }, { status });
  }
}

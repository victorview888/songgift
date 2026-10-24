import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const providerConfig = {
    lyricsProvider: process.env.LYRICS_PROVIDER || "deepseek",
    musicProvider: process.env.MUSIC_PROVIDER || "musicapi",
    mockFallbackEnabled: process.env.ALLOW_MOCK_FALLBACK === "true",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasDeepSeekKey: Boolean(process.env.DEEPSEEK_API_KEY),
    hasGoogleProject: Boolean(process.env.GOOGLE_CLOUD_PROJECT_ID),
    hasGoogleAccessToken: Boolean(
      process.env.GOOGLE_ACCESS_TOKEN || process.env.GOOGLE_LYRIA_ACCESS_TOKEN,
    ),
    hasMurekaKey: Boolean(process.env.MUREKA_API_KEY),
    hasMusicApiKey: Boolean(process.env.MUSICAPI_KEY),
  };

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: false,
      supabase: {
        configured: false,
        database: "not_configured",
        storage: "not_configured",
      },
      providers: providerConfig,
      message: "Add Supabase server credentials to .env.local.",
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const databaseResult = await supabase
      .from("song_orders")
      .select("id")
      .limit(1);
    const storageResult = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET || "songs")
      .list("", { limit: 1 });

    const databaseOk = !databaseResult.error;
    const storageOk = !storageResult.error;

    return NextResponse.json(
      {
        ok: databaseOk && storageOk,
        supabase: {
          configured: true,
          database: databaseOk ? "connected" : "error",
          storage: storageOk ? "connected" : "error",
        },
        providers: providerConfig,
        message:
          databaseOk && storageOk
            ? "Supabase database and Storage are ready."
            : "Supabase credentials loaded, but the schema or Storage bucket needs attention.",
        ...(databaseResult.error
          ? { databaseError: databaseResult.error.message }
          : {}),
        ...(storageResult.error
          ? { storageError: storageResult.error.message }
          : {}),
      },
      { status: databaseOk && storageOk ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        supabase: {
          configured: true,
          database: "error",
          storage: "error",
        },
        providers: providerConfig,
        message: error instanceof Error ? error.message : "Supabase health check failed.",
      },
      { status: 503 },
    );
  }
}
